# V0.2 Smoke Test

```bash
cd cli
npm install
npm run build
npm link

# Point the CLI at this toolkit:
# Windows PowerShell:
$env:NEO_DEVKIT_HOME="C:\path\to\neo-devkit-v0.2.0"

neo init
neo project init MoneyMap
cd MoneyMap
neo pack list
neo pack validate
neo pack install android-kotlin-dev
neo status
neo pack installed
neo pack remove android-kotlin-dev
```

Expected:
- `android-kotlin-dev` automatically installs `project-manager`.
- `.devkit/manifest.yml` records both packs.
- `.github/copilot-instructions.md` is generated.
- `.github/agents/` contains generated agent files.
- A pack cannot be removed while an installed pack depends on it.
