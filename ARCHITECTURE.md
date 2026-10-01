# Neo DevKit Architecture — V0.4

## DevKit Brain

The Brain is persistent, structured project intelligence stored inside `.devkit/brain/`.

```text
.devkit/brain/
├── project/
├── architecture/
├── knowledge/
├── decisions/
├── work/
├── sessions/
└── handoff/
```

Each entry records identity, type, content, provenance, status, confidence, and timestamps.

Confidence values: `authoritative`, `confirmed`, `inferred`, `assumption`.
Status values: `active`, `deprecated`, `superseded`, `draft`.

V0.4 commands:

```text
neo brain init
neo brain status
neo brain add <type> <title> <content>
neo brain list
neo brain search <query>
neo brain context
```

The deterministic context command groups active knowledge by confidence. A future Context Resolver will make selection task-aware.

## Git

Brain knowledge is intended to be committed with the project. `.devkit/cache/` remains non-authoritative and should not be committed.

## Roadmap

V0.2 Core Engine → V0.3 Pack Selector → V0.4 Brain → V0.5 Provider Adapters → V0.6 Handoff/Resume
