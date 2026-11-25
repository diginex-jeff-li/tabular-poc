# Invite draft rows: separate shape from validity

Status: ready-for-agent

Vocabulary: `CONTEXT.md`. Decision record: `docs/adr/0001-draft-rows-vs-ready-rows.md`.

## Problem

In the Codex demo the agent could not fix 7 of 19 pasted lines: the agent tool schemas enforced the strict `InviteRowSchema` (email format, role/group enums), so a row holding a bad value could not be written, split or moved.

## Decisions (grilling, 4 rounds)

1. **Scope**: the bulk invite page only. Do not generalise into `GridEditor`/`zodToTabulatorColumns` until a second grid needs it.
2. **Terms**: invite draft, draft row, ready row, needs review, agent proposed (see `CONTEXT.md`).
3. **Normalize on every way in**: paste, Excel import, agent `add_rows`/`update_rows`, and a person's cell edit. Idempotent.
4. **Never guess**: a whole line in one cell that cannot be split unambiguously stays as typed, in its cell, and the row needs review.
5. **Canonical case**: role and group names matched case-insensitively and rewritten to their canonical spelling; the whole email lowercased.
6. **Agent proposed**: when the agent resolves a needs-review row, the row is marked agent proposed and Send stays blocked until a person confirms it.
7. **Draft schema** `InviteDraftRowSchema` lives in contracts next to `InviteRowSchema`; the normalizer and line parser live in `frontend/apps/admin/src/utils/`.
8. **Status column**: read-only, first and pinned: Ready / Not ready / Needs review / Agent proposed. The error sidebar keeps per-cell reasons. Excluded from "Download as Excel" (and CSV).
9. **Agent tools take draft rows**: any text per column, groups as one `"a; b"` string; allowed roles/groups are hints in `get_invite_form` and field descriptions, not limits. `read_rows` returns each row's status.
10. **Resolving** a needs-review row happens through `update_rows`; the row becomes agent proposed automatically. No separate tool.
11. **Confirming**: a per-row Confirm button in the Status column, or editing any cell in that row. No "Confirm all"; no agent tool to confirm.
12. **ADR-0001** records the draft/ready split.
13. **Parser trigger**: only a row with exactly one filled cell whose text has more than one part (tab, comma, pipe, or several space-separated words).
14. **Separated lines** (tab, comma or pipe): fill the template columns in order when the piece count fits; wrong values land in their columns (row is Not ready, not Needs review). Groups keep `;` inside their piece. Any other count → needs review.
15. **Space-only lines**: first match known role and group names as whole phrases, case-insensitively, longest first, any run of whitespace between words; then split the rest on spaces. Exactly one `@` word is the email; exactly two leftover words are first and last name; exactly one role. Anything else (no or two emails, a third leftover word, no or two roles, an unknown word) → needs review.
16. **Fixtures**: rebuild the 19-row Codex demo paste, one assertion per row; plus multi-word cases `Ann Lee ann@x.com Account Admin` and `Bo Chan bo@x.com assessment manager vietnam suppliers; apparel`.
17. **Derived vs stored**: Ready / Not ready / Needs review are derived from content each validation; Agent proposed is stored per row id on the page, cleared by confirm or a person's edit, lost on reload.
18. **Agent delete**: `delete_rows` refuses needs-review rows with an error naming the rule; rows the agent adds with `add_rows` are not marked.

## Acceptance

- The Codex demo lines that Q14/Q15 call unambiguous split; Tom (`Owner`) and Kim (`kim park@…`) need review.
- An agent can write any text; `validate` and Send report what is wrong.
- Send is blocked by any needs-review or agent-proposed row.
