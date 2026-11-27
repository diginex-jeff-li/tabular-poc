# Ticket 11: Remove spike page + dead code cleanup

> **Label:** `wayfinder:task`
> **Type:** Task (AFK)
> **Status:** Closed — resolved 2026-08-10 (commit ad8a894a)

## Question

Remove the throwaway spike page and clean up dead code now that the editor page supersedes it.

### What to remove

1. **`ComplianceGridSpike.tsx`** — the Ticket 02 spike. Superseded by `ComplianceGridEditor.tsx`.
2. **Route `/compliance-spike`** in `router.ts` — the spike's route.
3. **`window.__tabulator` debug exposure** on both pages — debug-only, not needed in the prototype.
4. **The spike's route import** in `router.ts`.

### What to keep

- **`ComplianceGridSpike` route** — NO, remove it.
- **`zodToTabulatorColumns`** utility — YES, used by the editor.
- **`useDirtyTracking`** composable — YES, used by the editor.
- **All contract/backend code** — YES, all still used.
- **Test files** — YES, all tests still valid.

### Acceptance criteria

- `ComplianceGridSpike.tsx` deleted
- Route `/compliance-spike` removed from router
- `window.__tabulator` debug line removed from `ComplianceGridEditor.tsx`
- `pnpm typecheck` passes (no broken imports)
- `pnpm test` passes (no test references the deleted file)
- Only `/compliance-editor` route remains for the compliance feature

## Blocked by

(none — frontier ticket)