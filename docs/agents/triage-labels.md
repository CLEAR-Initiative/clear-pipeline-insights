# Triage Labels

The skills speak in terms of five canonical triage roles. Because issues for this repo live in Exponential (see [issue-tracker.md](issue-tracker.md)), there are no string-valued labels — the triage state is encoded in `ticket.status`.

| Label in mattpocock/skills | Exponential `ticket.status` | Meaning                                  |
| -------------------------- | --------------------------- | ---------------------------------------- |
| `needs-triage`             | `BACKLOG`                   | Maintainer needs to evaluate this issue  |
| `needs-info`               | `NEEDS_REFINEMENT`          | Waiting on reporter for more information |
| `ready-for-agent`          | `READY_TO_PLAN`             | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `BLOCKED`                   | Requires human implementation            |
| `wontfix`                  | `ARCHIVED`                  | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), set the corresponding `ticket.status` instead:

```bash
exponential tickets update --id <ticket-cuid> --status READY_TO_PLAN
```

A `needs-info` move should also drop a comment carrying the actual clarifying question:

```bash
exponential tickets update --id <ticket-cuid> --status NEEDS_REFINEMENT
exponential tickets comment add --id <ticket-cuid> -m "Clarifying question: ..."
```
