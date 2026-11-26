# 16 Fill down

Status: ready-for-agent
Blocked by: 13 (Tabulator side)
Spec: `../spec.md` "Phase 2", decision 5, P23, P25

## Change

- **TanStack:** a fill handle drawn on the range's bottom-right cell. Dragging it extends a preview over the rows below or above (auto-scroll near the edge, as in ticket 11's drag). On release, a pure `fillRange(rows, order, source, target, columns)` copies the source values, repeating the pattern, into the editable columns only. It is one person write: `normalizeRow`, `onUserEdit` once, one undo entry. The handle must work with virtualization: target rows are found from data, never from the DOM.
- **Tabulator:** `selectableRangeFill: true`. Check that it skips read-only columns and reaches the derived dirty count, `onUserEdit` and undo.

## Acceptance

- Unit tests: a 1×1 copy over 3 rows; a 2-row pattern repeated over 5 rows; read-only columns untouched.
- Real browser, all four routes: drag the handle down 3 rows and the values copy. The change count goes up, and ⌘Z restores the old values.
