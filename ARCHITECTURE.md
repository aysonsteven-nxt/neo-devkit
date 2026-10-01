# Neo DevKit Architecture Specification

**Version:** 0.1.0  
**Status:** Initial frozen architecture

## 1. Vision

Neo DevKit is a local-first, filesystem-first, Git-friendly, provider-neutral AI software development framework.

Its purpose is to give AI coding agents reusable capabilities, persistent project knowledge, relevant context, and portable handoff state.

Supported provider targets for V0.1:

- GitHub Copilot
- Gemini / Antigravity
- Claude Code
- Cursor

Future local LLM runtimes may be added as providers.

## 2. Design Principles

1. Local-first
2. Filesystem-first
3. Git-friendly
4. Provider-neutral
5. Project-scoped
6. Explicit over magical
7. Incremental context
8. Portable handoff
9. Reproducible generated artifacts
10. Human-authoritative project decisions

## 3. Workspace

```text
AI-WORKSPACE/
├── toolkit/
│   └── neo-devkit/
├── documentations/
├── projects/
│   ├── ProjectA/
│   └── ProjectB/
└── workspace.yml
```

## 4. Project

```text
Project/
├── .devkit/
│   ├── manifest.yml
│   ├── packs/
│   ├── brain/
│   ├── generated/
│   └── cache/
└── source/
```

## 5. Pack

A pack is a reusable bundle of agents, skills, instructions, prompts, templates, dependencies, conflicts, and detection metadata.

## 6. Pack Selector

The selector analyzes the current project and matches detected characteristics against pack metadata.

It must distinguish technical compatibility/relevance from subjective quality ranking.

## 7. Pack Installer

The installer validates a pack, resolves dependencies, detects conflicts, installs the pack into the project, updates the project manifest, and generates provider artifacts.

## 8. Brain

The Brain is persistent project intelligence.

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

Brain entries should have provenance and status.

Possible provenance:

- user
- repository
- documentation
- agent
- architecture-decision
- external-reference

Possible states:

- authoritative
- confirmed
- inferred
- assumption
- deprecated

## 9. Context Resolver

The context resolver selects relevant Brain and project information for the current task instead of loading the entire project history every time.

## 10. Handoff

`@devkit handoff` records current task, status, completed work, active files, decisions, constraints, open questions, known problems, previous provider/agent, and recommended next action.

`@devkit resume` loads the latest handoff and relevant Brain context.

## 11. Provider Architecture

Neo DevKit maintains canonical definitions and uses provider adapters to generate provider-specific artifacts.

```text
Canonical Neo Definition
        |
        v
Provider Adapter
   |    |    |    |
Copilot Gemini Claude Cursor
```

## 12. Git Strategy

Authoritative project knowledge should be portable with the repository.

Normally commit:

- `.devkit/manifest.yml`
- `.devkit/packs/`
- `.devkit/brain/project/`
- `.devkit/brain/architecture/`
- `.devkit/brain/knowledge/`
- `.devkit/brain/decisions/`
- `.devkit/brain/work/`
- `.devkit/brain/handoff/`

Normally ignore:

- `.devkit/cache/`

Session history is configurable.

## 13. Security / Trust

AI-generated knowledge must not silently become authoritative project truth. Significant decisions should have provenance and preferably explicit human confirmation.

## 14. V0.1 Scope

Included:

- local toolkit
- workspace/project manifests
- pack schema and catalog
- pack selection
- pack installation/removal/validation
- agents
- skills
- instructions
- Brain
- context resolution
- handoff/resume
- provider abstraction
- initial Project Manager, Solutions Architect, Android Kotlin, and Java packs

Excluded:

- cloud server
- hosted database
- user accounts
- online marketplace
- telemetry
- mandatory internet
- hosted LLM

