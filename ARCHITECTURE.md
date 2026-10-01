# Neo DevKit Architecture

## Vision
Neo DevKit is a local-first, provider-neutral AI engineering environment.

## Workspace
```text
AI-WORKSPACE/
├── toolkit/neo-devkit/
├── documentations/
├── projects/
│   └── Project/
│       ├── .devkit/
│       │   ├── manifest.yml
│       │   ├── packs/
│       │   ├── brain/
│       │   ├── generated/
│       │   └── cache/
│       └── source/
└── workspace.yml
```

## V0.2 Core Engine
```text
CLI
 ├── Workspace Manager
 ├── Project Manager
 ├── Pack Catalog
 ├── Pack Validator
 ├── Dependency Resolver
 ├── Conflict Detector
 ├── Pack Installer
 ├── Manifest Manager
 └── Provider Generator
```

Installation flow:
```text
neo pack install <pack>
        ↓
load canonical pack
        ↓
validate metadata
        ↓
resolve dependencies
        ↓
detect conflicts
        ↓
copy into .devkit/packs
        ↓
update manifest
        ↓
generate provider artifacts
```

## Provider model
Canonical Neo definitions remain provider-neutral. Provider-specific output is generated
from canonical definitions and is not the source of truth.

## Future
- V0.3 Pack Selector
- V0.4 DevKit Brain
- V0.5 Provider Adapters
- V0.6 Handoff / Resume
