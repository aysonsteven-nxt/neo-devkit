# Neo DevKit v0.5.0

Local-first, provider-neutral AI engineering toolkit.

## Provider adapters

```bash
neo provider list
neo provider status
neo provider generate
neo provider generate copilot
neo provider generate antigravity
neo provider generate claude-code
neo provider generate cursor
```

Canonical source remains inside `.devkit/`. Provider files are generated artifacts.

Supported targets:

| Provider | Generated artifacts |
|---|---|
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/agents/` |
| Gemini / Antigravity | `.gemini/neo-devkit-instructions.md`, `.gemini/agents/` |
| Claude Code | `CLAUDE.md`, `.claude/agents/` |
| Cursor | `.cursor/rules/neo-devkit.mdc`, `.cursor/agents/` |

Previous milestones:
- V0.2 Core Engine
- V0.3 Pack Selector
- V0.4 DevKit Brain

Next: V0.6 Handoff / Resume.
