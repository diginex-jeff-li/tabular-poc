# Replace Tabulator with TanStack Table (Nuxt UI `UTable`)

Status: resolved

## Goal

Run the **compliance library grid** (`/`) and the **bulk invite page** (`/invite-users`) on TanStack Table, through Nuxt UI v4's `UTable` (`@tanstack/vue-table` 8.21, `@tanstack/vue-virtual` 3.13, both already installed via `@nuxt/ui` 4.13.1). The bar is **feature parity**: everything a person or an agent can do on those two pages today still works, and so do the parity matrix below and the existing behaviour tests.

The Tabulator versions of both pages stay available on `/tabulator` and `/tabulator/invite-users`, on the same data, so the two engines can be compared like for like (user decision). TanStack is the default at `/` and `/invite-users`.

Why: the real codebase already uses `UTable`. Native Nuxt UI styling, and grid state that is plain Vue reactivity.

## Scope

In scope: `ComplianceGridEditor.tsx`, `BulkInviteUsers.tsx`, the shared engine (`GridEditor.tsx`, `useGridEditor.ts`, `useDirtyTracking.ts`), `zodToTabulatorColumns.ts`, `buildComplianceColumns.ts`, and the `GridApi` adapter for the page.

Out of scope:
- **Custom tables** (`/custom*`, `CustomTable*.tsx`, `definitionToColumns`). They are not ported and are **deleted at cutover** (ticket 12). The Tabulator engine stays, but only for the `/tabulator` comparison routes.
- New behaviour beyond parity, with one exception: the Tabulator list-editor bug (dropdown opens empty, Escape does nothing) goes away with a Nuxt UI select.
- Known paste gaps Tabulator also has (quoted Excel cells, `\r` on the compliance grid). Tracked separately.

## Decisions

1. **Build alongside, keep both.** The new engine is a separate component (`DataGrid`, under `components/DataGrid/`) with its own composable. In ticket 12, `/` and `/invite-users` switch to it, and the Tabulator `GridEditor` moves to the `/tabulator` routes for comparison. Both engines implement the same props contract and `GridApi` (decision 2), so each page is written once and takes its engine as a parameter. No copied page code.
2. **Same seams, new implementation.** The `GridApi` interface (`getRows`, `addRows`, `updateRows`, `deleteRows`, `showErrors`) and the `GridEditor` props contract (`columns`, `data`, `onSave`, `onReady`, `normalizeRow`, `onUserEdit`, `pasteParser`, `toolbarActions`, labels) stay the same. `inviteDraft.ts`, `inviteAgentTools.ts`, `useAgentTools.ts`, `columnMapping.ts`, `draftRow.ts`, `validateInvites.ts`, `inviteWorkbook.ts` and `memoryGridApi.ts` must not change behaviour, and their tests must pass unmodified.
3. **State lives in Vue, not in the table.** `rows: Ref<Row[]>` is the source of truth. TanStack supplies the row models (sorting, filtering, selection, pinning). Interaction state (active cell, range, editing cell) lives in our own composable, keyed by **row id + column id**, never by index.
4. **Grid logic as pure modules.** Range math, keyboard moves, TSV parse/serialize, CSV build, the dirty diff and validation are plain functions with unit tests. Components only wire events to them. Most of today's `useGridEditor.test.ts` Tabulator mock goes away.
5. **Dirty tracking is derived, not event-driven.** It compares rows by id against a snapshot taken at load/save (added, modified, deleted), with the same save payload shape as `buildSavePayload` today. This replaces `useDirtyTracking`'s Tabulator event wiring and its order-dependent `markDirty` rules.
6. **Validation is derived.** A `computed` map of row id → field → message, built from the column definitions that come from the Zod contract (the same rules `zodToTabulatorColumns` encodes: `required`, `in`, the field's own Zod string checks). A cell is red when it has a message. There is no Tabulator-style "validate on edit" step, so paste, agent writes and range clears need no special re-validation code.
7. **Use `UTable`** (settled by ticket 01, see its `## Answer`). In a 2,000-row spike, `UTable` passed all 5 checks: full-cell pointer handlers with `data-row-id`/`data-col-id`, a pinned column with a sticky header and `virtualize`, a focusable root that receives `keydown`/`copy`/`paste` with and without rows, editors that re-render only their own cell, and header sort/filter controls that don't select the column. The pattern: `meta.class.td: 'p-0 h-px'`, and a cell component that renders a full-size wrapper carrying the data attributes and handlers and reads interaction state through its own `computed`. `tabindex`, `role` and the root handlers go on `UTable` through `$attrs`. Its exposed `$el` is both the scroll container and the focus target. Known limits for later tickets: rows must keep a fixed height equal to `virtualize.estimateSize` (scroll-to-row is `scrollTop = index * rowHeight`, because the virtualizer isn't exposed), `tr`/`td` accept no attributes besides class and style (ticket 06 accessibility), and the write strategy decides the commit cost (ticket 04). Revisit headless `useVueTable` only if ticket 06 finds the accessibility limit blocks parity.
8. **VueUse first** (`@vueuse/core` 15.1.0, already a dependency). Use a VueUse composable wherever one fits; write custom code only where VueUse was checked and rejected (see "VueUse map"). There is no VueUse auto-import (`unplugin-auto-import` covers only `vue`/`vue-router`), so import explicitly. VueUse doesn't replace the pure modules in decision 4: `useCloned` keeps the snapshot, but `diffRows` stays a tested function.

## VueUse map

Checked against the installed 15.1.0 types, the skill references and DeepWiki (`vueuse/vueuse`). Full evidence, including happy-dom probes: agent run `VueUseParityMap`.

| Piece | VueUse | Ticket |
|---|---|---|
| Grid keydown (arrows, Tab, Home/End, Enter, Escape, Delete/Backspace, typing to edit) | `onKeyStroke(true, handler, { target: gridEl })`. One registration, `switch` on `e.key`, no `dedupe`. Bail out when `e.target.closest('input,textarea,select,[role=combobox],[data-grid-editor]')` | 05, 06, 08 |
| Copy range / paste rows | `useEventListener(gridEl, 'copy' \| 'paste', …)` reading or writing `e.clipboardData` | 06, 07 |
| Grid focus ring; "an editor or filter inside has focus" | `useFocus(gridEl)`, `useFocusWithin(gridEl)` | 06 |
| Empty-state overlay focuses the grid | `useFocus(gridEl).focused.value = true` | 07 |
| Drag to select: button held, released outside the grid | `useMousePressed({ target: gridEl, touch: false, drag: false })` plus a `pointerenter` on each cell for the cell id | 06 |
| Edge auto-scroll while dragging | `useRafFn(step, { immediate: false })` plus `useScroll(gridEl, { observe: { mutation: true } })` (writable `y`) | 06, 11 |
| Commit editor on outside click | `onClickOutside(cellEl, commit, { ignore: [selectMenu] })`. Blur commit stays a native `onBlur` | 05 |
| Commit if a virtualized row unmounts mid-edit | `onElementRemoval(cellEl, commit)` | 11 |
| 2 s outline on scroll-to-error | `refAutoReset<{rowId,colId} \| null>(null, 2000)` | 05 |
| Dirty baseline at load/save | `useCloned(rows, { manual: true })` + `sync()`. Never `isModified`: it tracks the clone, not the source | 04 |
| Clear-all confirm | `useConfirmDialog()`. The modal's `onUpdate:open` must call `cancel()` | 04 |
| beforeunload guard | `useEventListener(window, 'beforeunload', …)`, as today. There is no `useBeforeUnload` in v15 | 04 |
| CSV / xlsx download | `useObjectUrl(blob)`. Needs `await nextTick()` before `a.click()`. In tests, stub `URL.createObjectURL` (happy-dom `Blob` is cross-realm) | 09, 10 |
| Excel import button | `useFileDialog({ accept: '.xlsx', multiple: false, reset: true, input: fileInputEl })`. Passing `input` keeps `data-testid="invite-import"` | 10 |

Checked and rejected, so these stay custom or native:
- `onStartTyping`: document-only, and it drops `- . _` and space. Use `e.key.length === 1` without modifiers inside the `onKeyStroke` handler.
- `useClipboard`: async and permission-gated, with no access to the event's `clipboardData`.
- `useMagicKeys`, `useKeyModifier`: `e.shiftKey` is already on the event.
- `usePointer`, `useElementByPoint`, `useTextSelection`: DOM- or position-based, which breaks with virtualization.
- `useVirtualList`, `useElementSize`: `UTable` already virtualizes and measures rows.
- `useAsyncValidator`: an integrations package, and it duplicates Zod.
- `refAutoReset` for the "Saved N" badge: the badge clears on the next edit, not on a timer. It stays a `watch`.
- `refManualReset`, `useManualRefHistory`, `useScrollLock` (UModal already locks scroll), `useDropZone` (not parity).
- Undo through `useManualRefHistory` is possible but not parity.


## Parity matrix

Each row is one acceptance check. "Today" is where the behaviour lives in the Tabulator build.

| # | Behaviour | Today | TanStack approach | Ticket |
|---|---|---|---|---|
| P1 | Columns derived from the Zod schema; uuid/datetime fields hidden; titles override | `zodToTabulatorColumns` | `zodToColumnDefs` → TanStack `ColumnDef` + `meta` (editor kind, options, validators, `paste`, `export`) | 02 |
| P2 | Grid fills its parent (no `100vh`), row count chip | `height:'100%'`, `getDataCount` | Flex layout, `rows.length` | 02 |
| P3 | Tristate sort (asc → desc → none) by header icon; a header click selects the column | `headerSortTristate`, `headerSortClickElement:'icon'` | `getSortedRowModel`, `enableSortingRemoval`, sort button in header | 03 |
| P4 | Header filters: text input for strings, clearable dropdown for enums | `headerFilter` input/list | `getFilteredRowModel`, `UInput` / `USelect` in header | 03 |
| P5 | Row checkboxes and header select-all; a cell click never selects a row | `rowSelection` formatter, `selectableRows: undefined` | `enableRowSelection`, `UCheckbox` column | 04 |
| P6 | Add Row (top), Delete selected, Clear (with confirm modal) | `handleAddRow`, `handleDeleteSelected`, `clearGrid` | Array ops on `rows`; same modal | 04 |
| P7 | Dirty count chip, Save enabled only when dirty, `{upserts, deletes}` payload, "Saved N" badge cleared on the next edit, beforeunload guard | `useDirtyTracking`, `handleSave` | Derived diff (decision 5) | 04 |
| P8 | Inline edit: text and enum editors; Enter/double-click opens, typing replaces, Escape cancels, Enter/Tab commits and moves | Tabulator `input`/`list` editors, `editTriggerEvent:'dblclick'` | Single editing cell; `UInput` / `USelectMenu` | 05 |
| P9 | `normalizeRow` on every person edit; `onUserEdit(ids)` after add/paste/edit/delete | `onCellEdited`, `onUserEdit` | Same callbacks from the commit path | 05 |
| P10 | In-cell validation highlight; error sidebar; click an error to scroll to it and outline the cell; backend save errors highlight by `rowId` + field | `validationMode:'highlight'`, `applyErrorHighlights`, `scrollToError` | Derived validation (decision 6); `data-row-id`/`data-col-id` lookup; scroll through `useScroll` on the container (UTable doesn't expose its virtualizer, ticket 11); outline through `refAutoReset` | 05, 11 |
| P11 | Active cell; arrows/Tab/Shift+Tab move it; Shift+arrows, mouse drag and Shift+click extend a range; a row or column header click selects that whole row or column | `selectableRange*` | `useGridSelection` (pure range model) + cell pointer handlers | 06 |
| P12 | Copy the selected range as TSV, no headers | `clipboardCopyRowRange:'range'` | `copy` handler → `serializeTsv(range)` | 06 |
| P13 | Paste TSV from Excel inserts new rows with fresh ids, parsed positionally over pasteable columns, or by the page's `pasteParser` (invite: header/alias mapping, holding unmapped tables) | `clipboardPasteParser`, `clipboardPasteAction:'insert'`, `onClipboardPasted` | `paste` on the focused grid → `parseClipboardPaste` / `pasteParser` → `addRows` | 07 |
| P14 | Empty-state overlay; clicking the empty grid and pressing Ctrl/Cmd+V pastes (a real keyboard paste, not a synthetic event) | Overlay + Tabulator focus | Focusable grid root (`tabindex=0`, `role=grid`) that the overlay click focuses | 07 |
| P15 | Delete/Backspace clears editable cells in the range only (never Status/checkbox), counts as a person edit, never navigates the browser back | `clearRangeCells` | Same rule as a pure function over `rows` | 08 |
| P16 | Export CSV: all rows regardless of filters, comma delimiter, columns marked `download:false` excluded | `download('csv', …, 'all')` | `buildCsv(rows, columns)` + Blob download | 09 |
| P17 | Invite Status column: first, pinned left, read-only, derived status label with a Confirm button on agent-proposed rows; excluded from paste and export | `frozen`, formatter + `cellClick` | `columnPinning.left`, cell render with `UButton` | 10 |
| P18 | `GridApi` for agent tools and Excel import: add/update/delete by id, normalize, dirty, validate, `showErrors` re-renders status | `getRows`…`showErrors` in `useGridEditor` | Adapter over `rows` (structurally the same as `memoryGridApi`) | 10 |
| P19 | Agent tools on `document.modelContext` and `window.scInvite`, column mapping panel, Excel template/import/export | Page-level, via `GridApi` | Unchanged; run on the new adapter | 10 |
| P20 | Smooth with large pastes (hundreds of rows) | Tabulator virtual DOM | `UTable` `virtualize`; range/scroll-to-error through the virtualizer | 11 |

## Risks

- **Range selection + virtualization.** Rows outside the viewport have no DOM. Range, copy, clear and scroll-to-error must work from ids and data, never from the DOM. Decision 4 covers this; ticket 11 proves it.
- **`UTable` cell control.** Range selection needs pointer events on the whole cell area, and `td` padding gets in the way. Ticket 01 checks `meta.class.td` / a full-size cell wrapper.
- **Focus and paste.** Paste and copy only fire on a focused element. The grid root must take focus on click, including in the empty state (P14).
- **Reactivity cost.** Re-deriving validation and dirty state for every row on every keystroke. The editing draft stays local until commit; derived maps are keyed per row.
- **Accessibility.** We take on what Tabulator gave us: `role="grid"`, `aria-selected`, roving focus or `aria-activedescendant`.

## Tickets

01 spike: `UTable` vs headless · 02 column defs + read-only grid · 03 sort + filters · 04 rows, selection, dirty, save · 05 editing + validation + errors · 06 active cell, keyboard, range, copy · 07 paste + empty state · 08 range clear · 09 CSV export · 10 `GridApi` + invite page · 11 virtualization · 12 cutover + cleanup

Order: 01 → 02 → (03, 04 in parallel) → 05 → 06 → (07, 08, 09 in parallel) → 10 → 11 → 12.

## Phase 2: spreadsheet editing features (tickets 13–17)

Both engines get the same four features: undo/redo, paste over a range, fill down, and column resize/reorder/hide. Feature parity is a requirement, so each ticket's acceptance is checked on `/` and `/invite-users` (TanStack) and on `/tabulator` and `/tabulator/invite-users` (Tabulator).

### Decisions (user, 2026-11-26)

1. **Undo scope.** A person's grid changes are undoable: edit, paste (append or overwrite), range clear, fill, Add Row, Delete selected, Clear all. An agent's write (`GridApi.addRows/updateRows/deleteRows`) is not undoable and **clears both the undo and redo stacks**. The user asked for "everything" if it were easier. It is not: Tabulator's history module records only person actions, and snapshot-undo on TanStack across an agent write would silently drop the agent's change. Clearing the stacks gives one rule both engines can keep.
2. **Undo controls.** Keys only: ⌘/Ctrl+Z undoes; ⌘/Ctrl+Shift+Z and Ctrl+Y redo. Keys typed in an editor or a header filter keep their native meaning.
3. **Paste target.** With a cell or range selected in the grid, paste overwrites starting at the active cell (Excel). With nothing selected, or on an empty grid, paste appends rows as today (P13). The invite page's `pasteParser` (header matching, held tables) applies to the append path only. An overwrite always pastes values positionally.
4. **Overflow.** A pasted block taller than the rows below the active cell adds new rows at the bottom for the extra lines. Columns past the last pasteable column are dropped. Read-only columns (Status, checkbox) are skipped, never written.
5. **Fill.** A fill handle on the range's corner. Dragging it down (or up) copies the selected values, repeating the pattern; there is no numeric series. Only editable columns are written.
6. **Columns.** Resize by dragging the header edge, reorder by dragging the header, hide/show from a column menu. Layout lasts until reload (no persistence).

### Invariant both engines must hold

Every write path (typing, paste, overwrite, clear, fill, undo, redo, agent tools) runs `normalizeRow`, updates the dirty count and validation, and reaches Save. A person write calls `onUserEdit(ids)` once with the rows it touched. Undo and redo count as person writes. On the invite page, a person undoing an agent-proposed row's change clears its agent-proposed mark.

Tabulator's dirty tracking is event-driven (`cellEdited` + `markDirty`). A probe on 2026-11-26 showed `history` undo leaving "1 change" after the value was restored, and `selectableRangeFill` leaving "0 changes" after a fill. Ticket 13 replaces it with the derived diff the TanStack engine already uses, before 14–17 add more write paths.

| # | Behaviour | Ticket |
|---|---|---|
| P21 | ⌘/Ctrl+Z undoes and ⌘/Ctrl+Shift+Z / Ctrl+Y redoes a person's grid change; an agent write clears both stacks | 14 |
| P22 | Paste with a selection overwrites from the active cell; extra lines become rows; read-only columns skipped; no selection appends | 15 |
| P23 | Fill handle copies the selection down/up over editable columns | 16 |
| P24 | Column resize, reorder and hide/show; lasts until reload | 17 |
| P25 | Every write path above reaches dirty count, validation, `normalizeRow`, `onUserEdit` and Save | 13–17 |

Order: 13 → (14, 15, 16, 17).
