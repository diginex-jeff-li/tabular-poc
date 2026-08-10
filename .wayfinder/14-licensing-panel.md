# Ticket 14: Showcase — licensing comparison info panel

> **Label:** `wayfinder:prototype`
> **Type:** Prototype (HITL)
> **Status:** Open — frontier ticket

## Question

Add a collapsible info panel on the editor page that displays a side-by-side licensing comparison table, so when you showcase the prototype to stakeholders (Gray, Jill), the "why Tabulator" argument is self-evident.

### What to build

A small collapsible panel (accordion or toggle) at the bottom of the editor page, or a modal triggered by an "Info" button in the toolbar. When expanded, it shows:

```
Feature          | Tabulator (MIT) | AG Grid (Enterprise) | RevoGrid (Pro)
─────────────────────────────────────────────────────────────────────────
Clipboard paste  | ✅ Free         | ❌ $ per-dev/yr       | ✅ Free
Validation       | ✅ Free         | ✅ Free (basic)       | ❌ $149+/dev/yr
Range selection  | ✅ Free         | ❌ $ per-dev/yr       | ✅ Free
Filtering        | ✅ Free         | ✅ Free (basic)       | ❌ $149+/dev/yr
Excel/CSV export | ✅ Free         | ❌ $ per-dev/yr       | ❌ $149+/dev/yr
Multi-sort       | ✅ Free         | ✅ Free                | ❌ $149+/dev/yr
─────────────────────────────────────────────────────────────────────────
License          | MIT (no paid)   | EULA (per-dev,         | MIT core +
                 |                 | per-deployment)         | Pro $149-499/dev/yr
```

### Acceptance criteria

- "Info" button or collapsible panel visible on the editor page
- When opened, shows the comparison table with clear ✅/❌ markers
- Data sourced from verified research (ag-grid.com, rv-grid.com — already verified in grilling rounds)

## Blocked by

(none — frontier ticket)