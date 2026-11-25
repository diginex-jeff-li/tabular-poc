# Draft rows vs ready rows

The invite grid and its agent tools accept draft rows: strict keys, but any text in every cell. Only Send enforces the strict `InviteRowSchema` (email format, role and group enums, uniqueness, no existing account). We chose this because enforcing the strict schema at the tool boundary made malformed rows unwritable: in the Codex demo, 7 pasted lines with a bad email or unknown role could not be split or moved by the agent at all, so it could neither fix nor flag them. Do not tighten the tool input schemas back to the strict schema; validity belongs to `validate` and the Send gate.

## Considered Options

- **Strict schema at the tool boundary** (the original prototype): rejects bad input early, but the agent cannot write partial or wrong values a person then fixes.
- **Draft schema for writes, strict schema at Send** (chosen): two schemas in the contract, but every row can always be written, shown and fixed.
