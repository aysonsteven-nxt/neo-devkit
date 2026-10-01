# Neo DevKit

It provides:

- Project-aware development packs
- Pack selection and installation
- Agents, skills, instructions, and prompts
- Persistent project context through DevKit Brain
- Context-aware handoff and resume
- Provider adapters for GitHub Copilot, Gemini/Antigravity, Claude Code, and Cursor

The master toolkit can live in a workspace:

```text
AI-WORKSPACE/
├── toolkit/
│   └── neo-devkit/
├── documentations/
├── projects/
│   └── MyProject/
└── workspace.yml
```
A managed project contains its own `.devkit/` state.

## Status
This archive is the initial V0.1 framework skeleton and reference implementation. It focuses on the contracts, local pack system, Brain model, and provider-neutral structure.

See `ARCHITECTURE.md` for the design specification.

## V0.4 DevKit Brain

The Brain stores persistent project intelligence in `.devkit/brain/`.

New commands:

```bash
neo brain init
neo brain status
neo brain add decision "Money representation" "Monetary values are represented using integer centavos."
neo brain list
neo brain search money
neo brain context
neo brain context --json
```

Entries preserve provenance and confidence so AI inference does not silently become authoritative project truth.


```bash
neo analyze
neo pack recommend
```

Requirements: Node.js 20+, npm 10+.
