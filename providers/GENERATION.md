# Provider Generation

V0.5 generates provider-specific artifacts from the project's canonical `.devkit/`
state.

```bash
neo provider list
neo provider status
neo provider generate
neo provider generate copilot
neo provider generate antigravity
neo provider generate claude-code
neo provider generate cursor
```

Generated outputs:

- Copilot: `.github/copilot-instructions.md`, `.github/agents/`
- Gemini / Antigravity: `.gemini/neo-devkit-instructions.md`, `.gemini/agents/`
- Claude Code: `CLAUDE.md`, `.claude/agents/`
- Cursor: `.cursor/rules/neo-devkit.mdc`, `.cursor/agents/`

Generated files are reproducible output. The canonical source remains `.devkit/packs/`
and `.devkit/brain/`.
