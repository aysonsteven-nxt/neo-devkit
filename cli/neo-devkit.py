#!/usr/bin/env python3
"""Minimal local Neo DevKit reference CLI.

This is intentionally dependency-free. It demonstrates the V0.1 local filesystem
model and is not yet the full provider integration layer.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import shutil
import yaml  # optional dependency; see requirements.txt

ROOT = Path(__file__).resolve().parents[1]

def find_workspace(start: Path) -> Path:
    cur = start.resolve()
    for p in [cur, *cur.parents]:
        if (p / "workspace.yml").exists() and (p / "toolkit" / "neo-devkit").exists():
            return p
    raise SystemExit("Neo DevKit workspace not found.")

def current_project(start: Path) -> Path:
    cur = start.resolve()
    for p in [cur, *cur.parents]:
        if (p / ".devkit" / "manifest.yml").exists():
            return p
    raise SystemExit("Managed Neo DevKit project not found.")

def pack_path(workspace: Path, pack_id: str) -> Path:
    return workspace / "toolkit" / "neo-devkit" / "packs" / pack_id

def load_yaml(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def install_pack(project: Path, workspace: Path, pack_id: str):
    src = pack_path(workspace, pack_id)
    if not (src / "pack.yml").exists():
        raise SystemExit(f"Pack not found: {pack_id}")
    dst = project / ".devkit" / "packs" / pack_id
    if dst.exists():
        print(f"Already installed: {pack_id}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst)
    print(f"Installed: {pack_id}")
    print(f"Destination: {dst}")

def main():
    parser = argparse.ArgumentParser(prog="neo-devkit")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("packs")
    p.add_argument("action", choices=["list","install"])
    p.add_argument("pack", nargs="?")

    args = parser.parse_args()
    workspace = find_workspace(Path.cwd())
    project = current_project(Path.cwd()) if args.action == "install" else None

    if args.command == "packs" and args.action == "list":
        packs_dir = workspace / "toolkit" / "neo-devkit" / "packs"
        for p in sorted(x.name for x in packs_dir.iterdir() if x.is_dir()):
            print(p)

    elif args.command == "packs" and args.action == "install":
        if not args.pack:
            raise SystemExit("Usage: neo-devkit packs install <pack>")
        install_pack(project, workspace, args.pack)

if __name__ == "__main__":
    main()
