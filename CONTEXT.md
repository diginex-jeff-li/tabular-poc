# Bulk Invite

Admins invite many users at once by building an invite draft in the grid (typed, pasted, imported from Excel, or edited by an AI agent) and sending it when every row is ready.

## Language

**Invite draft**:
The set of rows on the bulk invite page that have not been sent yet.
_Avoid_: batch, upload, sheet

**Invite template**:
The columns and rules every invite row follows; the grid, the Excel template, header matching and the agent's rules are all built from it.
_Avoid_: schema, form, column config

**Draft row**:
One row of the invite draft; each cell holds any text, and the row has exactly the template's columns.
_Avoid_: raw row, staging row

**Ready row**:
A draft row that passes every send check: format, known role and groups, unique email in the draft, and no existing account.
_Avoid_: valid row, clean row

**Needs review**:
A draft row whose text could not be sorted into columns without guessing, so a person or the agent must decide.
_Avoid_: ambiguous, flagged

**Agent proposed**:
A needs-review row the agent has resolved; it blocks sending until a person confirms or edits it.
_Avoid_: AI-fixed, auto-resolved

**Unmapped table**:
A pasted table held outside the invite draft because its columns could not be matched to the template's columns.
_Avoid_: staging, raw paste

**Column mapping**:
Which pasted column fills which template column, or is ignored.
_Avoid_: header map, field map
