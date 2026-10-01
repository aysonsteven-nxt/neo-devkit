# Neo DevKit

It provides:

- Project-aware development packs
- Pack selection and installation
- Agents, skills, instructions, and prompts
- Persistent project context through DevKit Brain
- Context-aware handoff and resume
- Provider adapters for GitHub Copilot, Gemini/Antigravity, Claude Code, and Cursor

## V0.1 Philosophy

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
