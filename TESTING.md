# V0.5 Smoke Test

After building:

```bash
neo project init ProviderTest
cd ProviderTest

neo pack install android-kotlin-dev
neo provider list
neo provider status
neo provider generate
neo provider status
```

Verify these files:

```text
.github/copilot-instructions.md
.github/agents/
.gemini/neo-devkit-instructions.md
.gemini/agents/
CLAUDE.md
.claude/agents/
.cursor/rules/neo-devkit.mdc
.cursor/agents/
```

Then modify/remove generated files and run:

```bash
neo provider generate
```

They should be recreated from `.devkit/packs/`.

The provider generator must not require a network connection.
