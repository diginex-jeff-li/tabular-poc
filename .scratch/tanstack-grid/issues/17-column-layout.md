# 17 Column resize, reorder, hide

Status: ready-for-agent
Spec: `../spec.md` "Phase 2", decision 6, P24

## Change

- **TanStack:** use `UTable`'s `columnSizing`, `columnOrder` and `columnVisibility` state.
  - Resize: drag the header's right edge.
  - Reorder: drag the header. The pinned Status column and the checkbox column stay first.
  - Hide/show: a column menu in the toolbar (`UDropdownMenu` with checkboxes).
  - Range selection, keyboard moves, copy, paste and fill follow the visible column order.
  - Layout state lives in the component and is lost on reload.
- **Tabulator:** column resize (on by default), `movableColumns: true`, and the same hide/show menu over `column.hide()`/`show()`. Frozen Status stays first.

## Acceptance

- Unit tests (TanStack): after reorder or hide, arrows, copy and paste follow the visible order; a hidden column is never written by paste or fill.
- Real browser, all four routes: resize, drag a column, hide and show a column; a reload restores the default layout.
