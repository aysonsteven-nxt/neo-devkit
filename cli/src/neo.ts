#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

type AnyMap = Record<string, any>;

const VERSION = "0.2.0";
const TOOLKIT_ENV = "NEO_DEVKIT_HOME";

function die(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function info(message: string) {
  console.log(message);
}

function success(message: string) {
  console.log(`✓ ${message}`);
}

function loadYaml(file: string): AnyMap {
  try {
    return (yaml.load(fs.readFileSync(file, "utf8")) ?? {}) as AnyMap;
  } catch (e) {
    die(`Invalid YAML: ${file}`);
  }
}

function writeYaml(file: string, value: AnyMap) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, yaml.dump(value, { noRefs: true, lineWidth: 120 }), "utf8");
}

function copyRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) die(`Source does not exist: ${src}`);
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function removeRecursive(p: string) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function findToolkit(start = process.cwd()): string {
  const configured = process.env[TOOLKIT_ENV];
  if (configured && fs.existsSync(path.join(configured, "catalog", "packs.yml"))) {
    return path.resolve(configured);
  }

  const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  if (fs.existsSync(path.join(moduleRoot, "catalog", "packs.yml"))) return moduleRoot;

  let current = path.resolve(start);
  while (true) {
    const candidate = path.join(current, "toolkit", "neo-devkit");
    if (fs.existsSync(path.join(candidate, "catalog", "packs.yml"))) return candidate;
    if (fs.existsSync(path.join(current, "catalog", "packs.yml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  die(`Neo DevKit toolkit not found. Set ${TOOLKIT_ENV} to the toolkit directory.`);
}

function findProject(start = process.cwd()): string | null {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, ".devkit", "manifest.yml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function ensureProject(projectDir: string) {
  if (!fs.existsSync(path.join(projectDir, ".devkit", "manifest.yml"))) {
    die(`Not a Neo DevKit project: ${projectDir}`);
  }
}

function packCatalog(toolkit: string): string[] {
  const catalog = loadYaml(path.join(toolkit, "catalog", "packs.yml"));
  return Array.isArray(catalog.packs) ? catalog.packs : [];
}

function loadPack(toolkit: string, id: string): AnyMap {
  const dir = path.join(toolkit, "packs", id);
  const meta = path.join(dir, "pack.yml");
  if (!fs.existsSync(meta)) die(`Pack not found: ${id}`);
  const data = loadYaml(meta);
  validatePack(data, id);
  return { ...data, __dir: dir };
}

function validatePack(data: AnyMap, expectedId?: string): string[] {
  const required = ["id", "name", "version", "description", "dependencies", "conflicts", "provides"];
  const errors: string[] = [];
  for (const key of required) {
    if (!(key in data)) errors.push(`missing '${key}'`);
  }
  if (expectedId && data.id !== expectedId) errors.push(`id must be '${expectedId}'`);
  for (const key of ["dependencies", "conflicts", "provides"]) {
    if (key in data && !Array.isArray(data[key])) errors.push(`'${key}' must be an array`);
  }
  if (errors.length) die(`Invalid pack ${expectedId ?? data.id}: ${errors.join(", ")}`);
  return errors;
}

function initProject(projectArg: string) {
  const projectDir = path.resolve(process.cwd(), projectArg);
  fs.mkdirSync(projectDir, { recursive: true });
  const devkit = path.join(projectDir, ".devkit");
  fs.mkdirSync(path.join(devkit, "packs"), { recursive: true });
  fs.mkdirSync(path.join(devkit, "brain"), { recursive: true });
  fs.mkdirSync(path.join(devkit, "generated"), { recursive: true });
  fs.mkdirSync(path.join(devkit, "cache"), { recursive: true });

  const manifestFile = path.join(devkit, "manifest.yml");
  if (fs.existsSync(manifestFile)) {
    info(`Project already initialized: ${projectDir}`);
    return;
  }

  writeYaml(manifestFile, {
    schema: "neo.devkit/project@1",
    project: {
      id: path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
      name: path.basename(projectDir)
    },
    devkit: {
      version: VERSION,
      packs: []
    },
    providers: {
      generated: []
    }
  });
  success("Project initialized");
  info(`  ${projectDir}`);
  success(".devkit created");
}

function readManifest(projectDir: string): AnyMap {
  return loadYaml(path.join(projectDir, ".devkit", "manifest.yml"));
}

function writeManifest(projectDir: string, manifest: AnyMap) {
  writeYaml(path.join(projectDir, ".devkit", "manifest.yml"), manifest);
}

function resolveDependencies(toolkit: string, requested: string[]): string[] {
  const resolved: string[] = [];
  const visiting = new Set<string>();

  function visit(id: string) {
    if (resolved.includes(id)) return;
    if (visiting.has(id)) die(`Dependency cycle detected involving '${id}'`);
    visiting.add(id);
    const pack = loadPack(toolkit, id);
    for (const dep of pack.dependencies ?? []) visit(dep);
    visiting.delete(id);
    resolved.push(id);
  }

  for (const id of requested) visit(id);
  return resolved;
}

function checkConflicts(toolkit: string, ids: string[]) {
  const set = new Set(ids);
  for (const id of ids) {
    const pack = loadPack(toolkit, id);
    for (const conflict of pack.conflicts ?? []) {
      if (set.has(conflict)) die(`Pack conflict: '${id}' conflicts with '${conflict}'`);
    }
  }
}

function generateCopilot(projectDir: string, installed: string[], toolkit: string) {
  const out = path.join(projectDir, ".github");
  fs.mkdirSync(out, { recursive: true });
  const instructionFile = path.join(out, "copilot-instructions.md");
  const blocks: string[] = [
    "# Neo DevKit Generated Instructions",
    "",
    `Generated from Neo DevKit ${VERSION}.`,
    "",
    "Installed packs:",
    ...installed.map(id => `- ${id}`),
    ""
  ];

  for (const id of installed) {
    const dir = path.join(toolkit, "packs", id);
    const instDir = path.join(dir, "instructions");
    if (fs.existsSync(instDir)) {
      for (const file of fs.readdirSync(instDir).filter(f => f.endsWith(".md"))) {
        blocks.push(`## ${id}: ${file}`, "");
        blocks.push(fs.readFileSync(path.join(instDir, file), "utf8").trim(), "");
      }
    }
  }
  fs.writeFileSync(instructionFile, blocks.join("\n"), "utf8");

  const agentsOut = path.join(out, "agents");
  fs.mkdirSync(agentsOut, { recursive: true });
  for (const id of installed) {
    const agentsDir = path.join(toolkit, "packs", id, "agents");
    if (!fs.existsSync(agentsDir)) continue;
    for (const file of fs.readdirSync(agentsDir).filter(f => f.endsWith(".md"))) {
      fs.copyFileSync(path.join(agentsDir, file), path.join(agentsOut, file));
    }
  }
}

function generateProviders(projectDir: string, manifest: AnyMap, toolkit: string) {
  const installed: string[] = manifest.devkit?.packs ?? [];
  generateCopilot(projectDir, installed, toolkit);
  const generated = new Set<string>(manifest.providers?.generated ?? []);
  generated.add("copilot");
  manifest.providers = { ...(manifest.providers ?? {}), generated: [...generated].sort() };
}

function installPack(projectDir: string, id: string, toolkit: string) {
  ensureProject(projectDir);
  const manifest = readManifest(projectDir);
  const current: string[] = manifest.devkit?.packs ?? [];

  const resolved = resolveDependencies(toolkit, [id]);
  const target = [...new Set([...current, ...resolved])];
  checkConflicts(toolkit, target);

  info(`Pack resolution: ${resolved.join(" -> ")}`);
  for (const packId of resolved) {
    if (current.includes(packId)) {
      info(`  already installed: ${packId}`);
      continue;
    }
    const pack = loadPack(toolkit, packId);
    const destination = path.join(projectDir, ".devkit", "packs", packId);
    copyRecursive(pack.__dir, destination);
    success(`Installed ${packId}@${pack.version}`);
  }

  manifest.devkit = {
    ...(manifest.devkit ?? {}),
    version: VERSION,
    packs: target.sort()
  };
  generateProviders(projectDir, manifest, toolkit);
  writeManifest(projectDir, manifest);
  success("Project manifest updated");
  success("Provider artifacts generated");
}

function removePack(projectDir: string, id: string, toolkit: string) {
  ensureProject(projectDir);
  const manifest = readManifest(projectDir);
  const current: string[] = manifest.devkit?.packs ?? [];
  if (!current.includes(id)) die(`Pack is not installed: ${id}`);

  const remaining = current.filter(x => x !== id);

  // Prevent removal when another installed pack depends on it.
  const dependents: string[] = [];
  for (const installed of current) {
    if (installed === id) continue;
    const pack = loadPack(toolkit, installed);
    if ((pack.dependencies ?? []).includes(id)) dependents.push(installed);
  }
  if (dependents.length) {
    die(`Cannot remove '${id}'; required by: ${dependents.join(", ")}`);
  }

  removeRecursive(path.join(projectDir, ".devkit", "packs", id));
  manifest.devkit.packs = remaining;
  generateProviders(projectDir, manifest, toolkit);
  writeManifest(projectDir, manifest);
  success(`Removed ${id}`);
}

function status(projectDir: string) {
  ensureProject(projectDir);
  const manifest = readManifest(projectDir);
  console.log(`Project: ${manifest.project?.name ?? path.basename(projectDir)}`);
  console.log(`Path:    ${projectDir}`);
  console.log(`Packs:   ${(manifest.devkit?.packs ?? []).length}`);
  for (const id of manifest.devkit?.packs ?? []) console.log(`  - ${id}`);
  console.log(`Providers: ${(manifest.providers?.generated ?? []).join(", ") || "none"}`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args.shift();

  if (!command || command === "--help" || command === "-h") {
    console.log(`
Neo DevKit ${VERSION}

Usage:
  neo init
  neo project init <name-or-path>
  neo project status
  neo pack list
  neo pack installed
  neo pack install <pack>
  neo pack remove <pack>
  neo pack validate [pack]
  neo status
`);
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  const toolkit = findToolkit();

  if (command === "init") {
    const workspace = process.cwd();
    fs.mkdirSync(path.join(workspace, "projects"), { recursive: true });
    fs.mkdirSync(path.join(workspace, "documentations"), { recursive: true });
    const file = path.join(workspace, "workspace.yml");
    if (!fs.existsSync(file)) {
      writeYaml(file, {
        schema: "neo.devkit/workspace@1",
        id: "neo-workspace",
        name: path.basename(workspace),
        version: VERSION,
        toolkit: { path: "toolkit/neo-devkit" },
        projects: { path: "projects" },
        documentations: { path: "documentations" }
      });
      success("Workspace initialized");
    } else {
      info("Workspace already initialized");
    }
    return;
  }

  if (command === "project") {
    const sub = args.shift();
    if (sub === "init") {
      const target = args.shift();
      if (!target) die("Usage: neo project init <name-or-path>");
      initProject(target);
      return;
    }
    if (sub === "status") {
      status(findProject() ?? die("No Neo DevKit project found."));
      return;
    }
    die(`Unknown project command: ${sub}`);
  }

  if (command === "pack") {
    const sub = args.shift();
    if (sub === "list") {
      for (const id of packCatalog(toolkit)) {
        const p = loadPack(toolkit, id);
        console.log(`${p.id}@${p.version} - ${p.name}`);
      }
      return;
    }
    const project = findProject() ?? die("No Neo DevKit project found.");
    if (sub === "installed") {
      const manifest = readManifest(project);
      for (const id of manifest.devkit?.packs ?? []) console.log(id);
      return;
    }
    if (sub === "validate") {
      const target = args.shift();
      const ids = target ? [target] : packCatalog(toolkit);
      for (const id of ids) {
        const p = loadPack(toolkit, id);
        console.log(`✓ ${id}@${p.version} valid`);
      }
      return;
    }
    if (sub === "install") {
      const id = args.shift();
      if (!id) die("Usage: neo pack install <pack>");
      installPack(project, id, toolkit);
      return;
    }
    if (sub === "remove") {
      const id = args.shift();
      if (!id) die("Usage: neo pack remove <pack>");
      removePack(project, id, toolkit);
      return;
    }
    die(`Unknown pack command: ${sub}`);
  }

  if (command === "status") {
    status(findProject() ?? die("No Neo DevKit project found."));
    return;
  }

  die(`Unknown command: ${command}`);
}

main();
