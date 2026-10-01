# Pack Selector

The Pack Selector analyzes repository evidence and maps detected technologies,
architectural patterns, and project characteristics to pack capabilities.

## Principles
1. Evidence before assumptions.
2. Multiple independent signals increase confidence.
3. Recommendations never install packs automatically.
4. Scores indicate technical relevance/compatibility, not quality.
5. V0.3 is deterministic and local-only.

## Pipeline

```text
Project → File Scanner → Signal Detector → Project Profile
        → Pack Capability Matcher → Recommendations
```
