# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout: single-context

This repo uses a **single-context** layout — one `CONTEXT.md` and one `docs/adr/` directory at the repo root.

```
/
├── CONTEXT.md              ← not yet authored; run /grill-with-docs to produce it
├── docs/adr/               ← exists; ADRs accumulate here over time
│   └── 0000-template.md
└── src/
```

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If either doesn't exist yet, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates `CONTEXT.md` lazily when terms or decisions actually get resolved. ADRs accumulate one decision at a time.

## Use the glossary's vocabulary

When your output names a domain concept (in a ticket title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

## Authoring these docs

- **`CONTEXT.md`** — run `/grill-with-docs`. It interviews you about the domain language and writes the glossary inline. Don't hand-author it from a blank file; the grill produces sharper definitions.
- **ADRs** — write one per non-obvious decision, in `docs/adr/NNNN-short-name.md`, starting from the `0000-template.md` skeleton. Number sequentially.
