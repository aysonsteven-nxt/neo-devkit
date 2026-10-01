# Neo DevKit Architecture

## V0.5 Provider Adapters

```text
        Canonical Neo DevKit
        ┌──────────┴──────────┐
     Packs                  Brain
        └──────────┬──────────┘
                   ↓
            Provider Adapters
        ┌──────┬──────┬──────┬──────┐
      Copilot Gemini Claude Cursor
```

Provider adapters translate the canonical project state into provider-specific generated
files. They must not become a second source of truth.

Generated artifacts:
- `.github/`
- `.gemini/`
- `CLAUDE.md` / `.claude/`
- `.cursor/`

The adapters are deterministic and local. V0.5 does not require provider APIs or accounts.

## Release progression

- V0.2 Core Engine
- V0.3 Pack Selector
- V0.4 DevKit Brain
- V0.5 Provider Adapters
- V0.6 Handoff / Resume
