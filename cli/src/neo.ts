#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { generateProviderArtifacts, supportedProviders } from "./provider-adapters.js";

type AnyMap = Record<string, any>;

const VERSION = "0.5.0"
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
  generateProviderArtifacts(projectDir, installed);
  manifest.providers = {
    ...(manifest.providers ?? {}),
    generated: supportedProviders()
  };
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

type ProjectProfile = {
  path: string;
  files: string[];
  signals: Set<string>;
  evidence: Record<string, string[]>;
  technologies: string[];
};

const IGNORED_DIRS = new Set([
  ".git", ".gradle", ".idea", ".devkit", "node_modules", "build", "dist",
  ".next", ".angular", "coverage", "target", "bin", "obj"
]);

function scanFiles(projectDir: string): string[] {
  const result: string[] = [];
  function walk(dir: string) {
    if (result.length >= 10000) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (result.length >= 10000) break;
      if (IGNORED_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) result.push(path.relative(projectDir, full));
    }
  }
  walk(projectDir);
  return result;
}

function readProjectText(projectDir: string, files: string[]): string {
  let text = "";
  const candidates = files.filter(f => /\.(kt|kts|java|ts|tsx|js|jsx|xml|json|yaml|yml|gradle|properties|md)$/i.test(f));
  for (const rel of candidates.slice(0, 500)) {
    try {
      const buf = fs.readFileSync(path.join(projectDir, rel));
      if (buf.length <= 300_000) text += "\n" + buf.toString("utf8");
      if (text.length > 2_000_000) break;
    } catch {}
  }
  return text;
}

function detectProfile(projectDir: string): ProjectProfile {
  const files = scanFiles(projectDir);
  const content = readProjectText(projectDir, files);
  const lower = content.toLowerCase();
  const signals = new Set<string>();
  const evidence: Record<string, string[]> = {};
  const technologies = new Set<string>();

  const add = (signal: string, tech: string, matches: string[]) => {
    if (!matches.length) return;
    signals.add(signal);
    technologies.add(tech);
    evidence[signal] = [...new Set(matches)].slice(0, 8);
  };
  const fileMatches = (re: RegExp) => files.filter(f => re.test(f));

  const android = [
    ...fileMatches(/(^|\/)AndroidManifest\.xml$/i),
    ...( /com\.android\.application|com\.android\.library/i.test(content) ? ["Android Gradle plugin"] : [])
  ];
  if (android.length) add("android", "Android", android);

  const kotlin = fileMatches(/\.(kt|kts)$/i);
  if (kotlin.length || /org\.jetbrains\.kotlin|kotlin\("android"\)/i.test(content))
    add("kotlin", "Kotlin", kotlin.slice(0, 8).concat("Kotlin markers"));

  const compose = [
    ...(lower.includes("androidx.compose") ? ["androidx.compose"] : []),
    ...(lower.includes("@composable") ? ["@Composable"] : [])
  ];
  if (compose.length) add("compose", "Jetpack Compose", compose);

  const gradle = fileMatches(/(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|gradlew(\.bat)?)$/i);
  if (gradle.length) add("gradle", "Gradle", gradle);

  const room = lower.includes("androidx.room") || lower.includes("@database") || lower.includes("@dao")
    ? ["Room markers"] : [];
  if (room.length) add("room", "Room", room);

  const hilt = lower.includes("dagger.hilt") || lower.includes("@hiltandroidapp") || lower.includes("@inject")
    ? ["Hilt/DI markers"] : [];
  if (hilt.length) add("hilt", "Hilt", hilt);

  const java = fileMatches(/\.java$/i);
  if (java.length || /sourcecompatibility|toolchain.*java/i.test(content))
    add("java", "Java", java.slice(0, 8).concat("Java markers"));

  const spring = /spring-boot|org\.springframework/i.test(content) ? ["Spring markers"] : [];
  if (spring.length) add("spring", "Spring Boot", spring);

  const maven = fileMatches(/(^|\/)pom\.xml$/i);
  if (maven.length) add("maven", "Maven", maven);

  const api = [
    ...fileMatches(/(^|\/)(controllers?|routes?|api|rest)(\/|\.|$)/i),
    ...(lower.includes("@restcontroller") ? ["@RestController"] : []),
    ...(lower.includes("retrofit") ? ["Retrofit"] : []),
    ...(lower.includes("fetch(") ? ["fetch()"] : [])
  ];
  if (api.length) {
    add("api", "API/HTTP", api);
    add("rest", "REST/API", ["API/HTTP markers"]);
  }

  const database = [
    ...fileMatches(/(^|\/)(database|db|migration|migrations)(\/|\.|$)/i),
    ...(lower.includes("postgres") ? ["PostgreSQL"] : []),
    ...(lower.includes("mysql") ? ["MySQL"] : []),
    ...(lower.includes("sqlite") ? ["SQLite"] : []),
    ...(lower.includes("jpa") ? ["JPA"] : [])
  ];
  if (database.length) add("database", "Database", database);

  const architecture = [
    ...(lower.includes("mvvm") ? ["MVVM"] : []),
    ...(lower.includes("clean architecture") ? ["Clean Architecture"] : []),
    ...(lower.includes("repository") ? ["Repository markers"] : []),
    ...(lower.includes("usecase") || lower.includes("use case") ? ["Use-case markers"] : [])
  ];
  if (architecture.length) add("architecture", "Architecture patterns", architecture);

  const layers = fileMatches(/(^|\/)(domain|data|presentation|ui|service|services|repository|repositories)(\/|$)/i);
  if (layers.length >= 2) add("multi-layer", "Layered application", layers);

  const tests = fileMatches(/(^|\/)(test|tests|androidTest|__tests__)(\/|$)/i);
  if (tests.length) add("testing", "Testing", tests);

  const security = [
    ...fileMatches(/(^|\/)(auth|authentication|security|oauth|jwt)(\/|\.|$)/i),
    ...(lower.includes("jwt") ? ["JWT"] : []),
    ...(lower.includes("oauth") ? ["OAuth"] : [])
  ];
  if (security.length) add("security", "Security/Auth", security);

  const deployment = fileMatches(/(^|\/)(dockerfile|docker-compose.*|terraform|k8s|kubernetes)(\/|$)/i);
  if (deployment.length) add("deployment", "Deployment/Infrastructure", deployment);

  const docs = fileMatches(/(^|\/)(readme|docs?)([^\/]*)(\/|$)/i);
  if (docs.length) add("documentation", "Documentation", docs);

  if (files.some(f => /\.(kt|java|ts|tsx|js|jsx|py|go|rs|cs)$/i.test(f))) {
    signals.add("source-code");
    evidence["source-code"] = ["Source files detected"];
  }
  if (files.length) signals.add("project-management");

  return { path: projectDir, files, signals, evidence, technologies: [...technologies].sort() };
}

function scorePack(toolkit: string, id: string, profile: ProjectProfile) {
  const pack = loadPack(toolkit, id);
  const selector = pack.selector ?? { always: 0, signals: [] };
  let score = Number(selector.always ?? 0);
  const evidence: any[] = [];

  for (const item of selector.signals ?? []) {
    if (!profile.signals.has(item.id)) continue;
    const weight = Number(item.weight ?? 0);
    score += weight;
    evidence.push({
      signal: item.id,
      weight,
      reason: String(item.reason ?? ""),
      matches: profile.evidence[item.id] ?? []
    });
  }
  return { id, score: Math.max(0, Math.min(100, score)), evidence };
}

function analyzeProject(projectDir: string, toolkit: string, jsonOutput = false) {
  ensureProject(projectDir);
  const profile = detectProfile(projectDir);
  const recommendations = packCatalog(toolkit)
    .map(id => scorePack(toolkit, id, profile))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const manifest = readManifest(projectDir);
  const installed = new Set<string>(manifest.devkit?.packs ?? []);

  if (jsonOutput) {
    console.log(JSON.stringify({
      schema: "neo.devkit/recommendation@1",
      version: VERSION,
      project: { path: profile.path, fileCount: profile.files.length, technologies: profile.technologies },
      signals: [...profile.signals].sort(),
      recommendations,
      installed: [...installed]
    }, null, 2));
    return;
  }

  console.log("Project Analysis");
  console.log("────────────────────────────────");
  console.log(`Path: ${profile.path}`);
  console.log(`Files scanned: ${profile.files.length}`);
  console.log("");
  console.log("Detected:");
  if (!profile.technologies.length) console.log("  No specific technology signals detected.");
  else for (const tech of profile.technologies) console.log(`  ✓ ${tech}`);

  console.log("");
  console.log("Recommended packs:");
  for (const r of recommendations) {
    const suffix = installed.has(r.id) ? " [installed]" : "";
    console.log(`  ${r.id.padEnd(24)} ${String(r.score).padStart(3)}%${suffix}`);
  }

  console.log("");
  console.log("Evidence:");
  for (const r of recommendations.filter(x => x.score > 0)) {
    console.log(`  ${r.id}:`);
    for (const e of r.evidence.slice(0, 6))
      console.log(`    + ${e.signal} (${e.weight}) — ${e.reason}`);
  }
}

type BrainEntry = {
  schema: string; id: string; type: string; title: string; content: string;
  source: { type: string; reference?: string }; status: string; confidence: string;
  created: string; updated: string;
};
const BRAIN_TYPES = new Set(["fact","knowledge","decision","constraint","requirement","architecture","work","problem","question"]);
const BRAIN_STATUSES = new Set(["active","deprecated","superseded","draft"]);
const BRAIN_CONFIDENCE = new Set(["authoritative","confirmed","inferred","assumption"]);
function brainDir(projectDir:string){return path.join(projectDir,".devkit","brain");}
function brainCategory(type:string){if(["fact","requirement","constraint"].includes(type))return "project";if(type==="architecture")return "architecture";if(type==="decision")return "decisions";if(type==="knowledge")return "knowledge";return "work";}
function initBrain(projectDir:string){ensureProject(projectDir);for(const d of ["project","architecture","knowledge","decisions","work","sessions","handoff"])fs.mkdirSync(path.join(brainDir(projectDir),d),{recursive:true});success("Brain initialized");}
function slugify(v:string){return v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)||"entry";}
function validateBrainEntry(e:AnyMap){const req=["schema","id","type","title","content","source","status","confidence","created","updated"];const er:string[]=[];for(const k of req)if(!(k in e))er.push(`missing '${k}'`);if(e.schema!=="neo.devkit/brain-entry@1")er.push("invalid schema");if(e.type&&!BRAIN_TYPES.has(e.type))er.push(`invalid type '${e.type}'`);if(e.status&&!BRAIN_STATUSES.has(e.status))er.push(`invalid status '${e.status}'`);if(e.confidence&&!BRAIN_CONFIDENCE.has(e.confidence))er.push(`invalid confidence '${e.confidence}'`);if(!e.source||typeof e.source!=="object")er.push("source must be an object");return er;}
function listBrainEntries(projectDir:string):BrainEntry[]{ensureProject(projectDir);const base=brainDir(projectDir),out:BrainEntry[]=[];if(!fs.existsSync(base))return out;function walk(d:string){for(const x of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,x.name);if(x.isDirectory())walk(f);else if(x.isFile()&&x.name.endsWith(".yml")){try{const e=loadYaml(f);if(e.schema==="neo.devkit/brain-entry@1"&&!validateBrainEntry(e).length)out.push(e as BrainEntry);}catch{}}}}walk(base);return out.sort((a,b)=>b.updated.localeCompare(a.updated));}
function addBrainEntry(projectDir:string,type:string,title:string,content:string,sourceType="user",confidence="authoritative",status="active"){ensureProject(projectDir);if(!BRAIN_TYPES.has(type))die(`Invalid Brain type: ${type}`);if(!BRAIN_CONFIDENCE.has(confidence))die(`Invalid Brain confidence: ${confidence}`);if(!BRAIN_STATUSES.has(status))die(`Invalid Brain status: ${status}`);initBrain(projectDir);const now=new Date().toISOString();const hash=requireHash(`${type}:${title}:${content}:${now}`);const e:BrainEntry={schema:"neo.devkit/brain-entry@1",id:`${type}-${slugify(title)}-${hash}`,type,title,content,source:{type:sourceType},status,confidence,created:now,updated:now};const f=path.join(brainDir(projectDir),brainCategory(type),`${e.id}.yml`);writeYaml(f,e);success(`Brain entry created: ${e.id}`);}
function requireHash(v:string){let h=0;for(let i=0;i<v.length;i++)h=((h<<5)-h+v.charCodeAt(i))|0;return Math.abs(h).toString(16).padStart(8,"0");}
function brainStatus(projectDir:string,jsonOutput=false){initBrain(projectDir);const es=listBrainEntries(projectDir),byType:Record<string,number>={},byConfidence:Record<string,number>={};for(const e of es){byType[e.type]=(byType[e.type]??0)+1;byConfidence[e.confidence]=(byConfidence[e.confidence]??0)+1;}const r={schema:"neo.devkit/brain-status@1",version:VERSION,path:brainDir(projectDir),entries:es.length,byType,byConfidence};if(jsonOutput)console.log(JSON.stringify(r,null,2));else{console.log("DevKit Brain\n────────────────────────────────");console.log(`Path: ${r.path}`);console.log(`Entries: ${r.entries}`);for(const [k,v] of Object.entries(byType).sort())console.log(`  ${k.padEnd(16)} ${v}`);}}
function brainList(projectDir:string,jsonOutput=false){const es=listBrainEntries(projectDir);if(jsonOutput){console.log(JSON.stringify(es,null,2));return;}if(!es.length){info("Brain is empty.");return;}for(const e of es){console.log(`${e.id}\n  [${e.type}] ${e.title}\n  ${e.status} / ${e.confidence} / ${e.source.type}`);}}
function brainSearch(projectDir:string,q:string,jsonOutput=false){const query=q.toLowerCase().trim();if(!query)die("Search query cannot be empty.");const es=listBrainEntries(projectDir).filter(e=>`${e.title}\n${e.content}\n${e.type}`.toLowerCase().includes(query));if(jsonOutput){console.log(JSON.stringify(es,null,2));return;}if(!es.length){info(`No Brain entries matched: ${q}`);return;}for(const e of es)console.log(`\n${e.id}\n  [${e.type}] ${e.title}\n  ${e.content}`);}
function brainContext(projectDir:string,jsonOutput=false){ensureProject(projectDir);const es=listBrainEntries(projectDir),m=readManifest(projectDir),packs:string[]=m.devkit?.packs??[];const active=es.filter(e=>e.status==="active");const r={schema:"neo.devkit/context@1",generated:new Date().toISOString(),project:m.project??{},installedPacks:packs,brain:{authoritative:active.filter(e=>e.confidence==="authoritative"),confirmed:active.filter(e=>e.confidence==="confirmed"),inferred:active.filter(e=>["inferred","assumption"].includes(e.confidence))}};if(jsonOutput)console.log(JSON.stringify(r,null,2));else{console.log(`# Neo DevKit Context\n\nProject: ${r.project.name??"Unknown"}\nInstalled packs: ${packs.join(", ")||"none"}\n");for(const [group,items] of Object.entries(r.brain)){console.log(`## ${group}`);for(const e of items as BrainEntry[])console.log(`- **${e.title}** (${e.type}) — ${e.content}`);console.log("");}}}

function providerStatus(projectDir: string, jsonOutput = false) {
  ensureProject(projectDir);
  const targets: Record<string, string> = {
    copilot: ".github/copilot-instructions.md",
    antigravity: ".gemini/neo-devkit-instructions.md",
    "claude-code": "CLAUDE.md",
    cursor: ".cursor/rules/neo-devkit.mdc"
  };
  const result = Object.entries(targets).map(([id, rel]) => ({
    id,
    path: path.join(projectDir, rel),
    generated: fs.existsSync(path.join(projectDir, rel))
  }));
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Provider Artifacts");
  console.log("────────────────────────────────");
  for (const x of result) console.log(`  ${x.generated ? "✓" : "✗"} ${x.id}`);
}

function providerGenerate(projectDir: string, provider?: string) {
  ensureProject(projectDir);
  const manifest = readManifest(projectDir);
  const installed: string[] = manifest.devkit?.packs ?? [];
  try {
    generateProviderArtifacts(projectDir, installed, provider);
  } catch (e: any) {
    die(e?.message ?? String(e));
  }
  manifest.providers = {
    ...(manifest.providers ?? {}),
    generated: provider ? [provider] : supportedProviders()
  };
  writeManifest(projectDir, manifest);
  success(`Generated provider artifacts: ${provider ?? "all providers"}`);
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
  neo pack recommend [--json]
  neo analyze [--json]
  neo brain init
  neo brain status [--json]
  neo brain add <type> <title> <content> [options]
  neo brain list [--json]
  neo brain search <query> [--json]
  neo brain context [--json]
  neo provider list
  neo provider status [--json]
  neo provider generate [provider]
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

  if (command === "brain") {
    const sub = args.shift();
    const project = findProject() ?? die("No Neo DevKit project found.");
    if (sub === "init") { initBrain(project); return; }
    if (sub === "status") { brainStatus(project, args.includes("--json")); return; }
    if (sub === "list") { brainList(project, args.includes("--json")); return; }
    if (sub === "search") { const q=args.filter(a=>a!=="--json").join(" "); brainSearch(project,q,args.includes("--json")); return; }
    if (sub === "context") { brainContext(project,args.includes("--json")); return; }
    if (sub === "add") {
      const type=args.shift(), title=args.shift(), content=args.shift();
      if(!type||!title||!content) die("Usage: neo brain add <type> <title> <content> [--source type] [--confidence level] [--status status]");
      let source="user",confidence="authoritative",status="active";
      for(let i=0;i<args.length;i++){if(args[i]==="--source")source=args[++i]??source;else if(args[i]==="--confidence")confidence=args[++i]??confidence;else if(args[i]==="--status")status=args[++i]??status;}
      addBrainEntry(project,type,title,content,source,confidence,status); return;
    }
    die(`Unknown brain command: ${sub}`);
  }


  if (command === "provider") {
    const sub = args.shift();
    const project = findProject() ?? die("No Neo DevKit project found.");

    if (sub === "status") {
      providerStatus(project, args.includes("--json"));
      return;
    }

    if (sub === "generate") {
      const provider = args.find(a => !a.startsWith("--"));
      providerGenerate(project, provider);
      return;
    }

    if (sub === "list") {
      for (const id of supportedProviders()) console.log(id);
      return;
    }

    die(`Unknown provider command: ${sub}`);
  }

  if (command === "analyze") {
    const jsonOutput = args.includes("--json");
    const project = findProject() ?? die("No Neo DevKit project found.");
    analyzeProject(project, toolkit, jsonOutput);
    return;
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
    if (sub === "recommend") {
      const jsonOutput = args.includes("--json");
      const project = findProject() ?? die("No Neo DevKit project found.");
      analyzeProject(project, toolkit, jsonOutput);
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
