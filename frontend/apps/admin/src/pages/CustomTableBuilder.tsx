/**
 * PROTOTYPE — Custom Table Builder (/custom/new)
 *
 * Per architecture.md section 4.3, this page uses a PLAIN semantic `<table>`
 * styled with Tailwind and Nuxt UI form controls in the cells. Nuxt UI's
 * UTable is deliberately NOT used — it is presentational-only (TanStack-based,
 * no editing) and its per-cell slot API is SFC-only, which does not work in
 * TSX.
 *
 * Layout:
 * - A `UInput` for the table name above the table.
 * - One row per column definition: Name (`UInput`), Type (`USelect`: Text /
 *   Dropdown / Number), Required (`UCheckbox`), Choices (`UInput`,
 *   comma-separated, rendered ONLY when Type is Dropdown), and a remove-row
 *   button.
 * - An "Add Column" button appends a blank row.
 * - A "Create Table" button validates, persists a `TableDefinition` via
 *   `createDefinition`, and redirects to `/custom/:tableId`.
 *
 * Validation rules — creation is blocked with a visible, specific message for
 * each of:
 *   - empty or whitespace-only table name
 *   - zero columns
 *   - any empty or whitespace-only column name
 *   - duplicate column names (case-insensitive, trimmed)
 *   - any reserved name (id, createdAt, updatedAt, __select) case-insensitively
 *   - a Dropdown column whose choices parse to zero non-empty entries
 *
 * Multiple simultaneous violations are all reported. After a blocked attempt,
 * fixing the problem allows creation and clears the message.
 *
 * NOT PRODUCTION — throwaway prototype code.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import UCheckbox from '@nuxt/ui/components/Checkbox.vue';
import UInput from '@nuxt/ui/components/Input.vue';
import USelect from '@nuxt/ui/components/Select.vue';
import { useTableDefinitions } from 'composables/useTableDefinitions';
import {
  parseChoices,
  isReservedName,
  hasValidChoices,
} from 'utils/columnValidation';
import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { ColumnDef } from 'src/types/customTable';
import type { VNode } from 'vue';

// ── Row model ──
// The builder's editable row. The `choicesText` field holds the raw
// comma-separated string the user types; it is parsed into `choices` only at
// validation / creation time. Keeping the raw text lets the value survive a
// type round-trip (Text → Dropdown → Text → Dropdown) without losing what the
// user typed.
interface BuilderRow {
  id: string; // local-only id, not persisted; replaced by createDefinition
  name: string;
  type: ColumnDef['type'];
  required: boolean;
  choicesText: string;
}

const TYPE_ITEMS: Array<{ label: string; value: ColumnDef['type'] }> = [
  { label: 'Text', value: 'text' },
  { label: 'Dropdown', value: 'dropdown' },
  { label: 'Number', value: 'number' },
];

/**
 * Run all validation rules against the builder state. Returns an array of
 * human-readable error messages; an empty array means the input is valid.
 *
 * The rules are evaluated independently so that multiple simultaneous
 * violations are all reported. The per-column helpers (reserved-name,
 * duplicate-name, choices parsing) are shared with the post-creation Add
 * Column modal via `utils/columnValidation` so the two surfaces enforce
 * identical rules.
 */
function validateBuilder(
  tableName: string,
  rows: Array<BuilderRow>,
): Array<string> {
  const errors: Array<string> = [];

  // ── Table name required ──
  if (!tableName.trim()) {
    errors.push('Table name is required.');
  }

  // ── At least one column ──
  if (rows.length === 0) {
    errors.push('At least one column is required.');
    // Return early — the per-column rules below would be vacuous and we
    // don't want to also report "column name is required" for zero rows.
    return errors;
  }

  // ── Per-column name checks ──
  const seenNames = new Map<string, number>(); // lower-trimmed → first index

  rows.forEach((row, i) => {
    const trimmedName = row.name.trim();
    const label = `Column ${i + 1}`;

    if (!trimmedName) {
      errors.push(`${label}: column name is required.`);
      return;
    }

    if (isReservedName(trimmedName)) {
      errors.push(`${label}: "${trimmedName}" is a reserved name.`);
    }

    // Duplicate detection — case-insensitive, trimmed
    const lowerName = trimmedName.toLowerCase();
    if (seenNames.has(lowerName)) {
      const firstIndex = seenNames.get(lowerName);
      errors.push(
        `Column ${firstIndex + 1} and ${label}: duplicate column name "${trimmedName}". Names must be unique.`,
      );
    } else {
      seenNames.set(lowerName, i);
    }

    // Dropdown needs at least one non-empty choice
    if (row.type === 'dropdown' && !hasValidChoices(row.choicesText)) {
      errors.push(`${label}: dropdown column needs at least one choice.`);
    }
  });

  return errors;
}

export default defineComponent({
  name: 'CustomTableBuilder',
  setup() {
    const router = useRouter();
    const { createDefinition } = useTableDefinitions();

    // ── State ──
    const tableName = ref('');
    const rows = ref<Array<BuilderRow>>([]);
    const errors = ref<Array<string>>([]);

    // ── Row mutations ──
    function addColumn(): void {
      rows.value.push({
        id: crypto.randomUUID(),
        name: '',
        type: 'text',
        required: false,
        choicesText: '',
      });
      clearErrors();
    }

    function removeRow(index: number): void {
      rows.value.splice(index, 1);
      clearErrors();
    }

    function updateRowName(index: number, value: string): void {
      rows.value[index].name = value;
      clearErrors();
    }

    function updateRowType(index: number, value: ColumnDef['type']): void {
      rows.value[index].type = value;
      clearErrors();
    }

    function updateRowRequired(index: number, value: boolean): void {
      rows.value[index].required = value;
      clearErrors();
    }

    function updateRowChoices(index: number, value: string): void {
      rows.value[index].choicesText = value;
      clearErrors();
    }

    function updateTableName(value: string): void {
      tableName.value = value;
      clearErrors();
    }

    function clearErrors(): void {
      errors.value = [];
    }

    // ── Create Table ──
    function handleCreate(): void {
      const validationErrors = validateBuilder(tableName.value, rows.value);
      if (validationErrors.length > 0) {
        errors.value = validationErrors;
        return;
      }

      // Build ColumnDef[] from the builder rows, parsing choices.
      const columns: Array<ColumnDef> = rows.value.map((row) => ({
        id: row.id, // createDefinition overwrites this with a fresh uuid
        name: row.name.trim(),
        type: row.type,
        required: row.required,
        choices: row.type === 'dropdown' ? parseChoices(row.choicesText) : [],
      }));

      const def = createDefinition(tableName.value.trim(), columns);
      void router.push(`/custom/${def.id}`);
    }

    return (): VNode => (
      <div class="flex h-full flex-col overflow-auto bg-muted">
        {/* ── Page header ── */}
        <div class="border-b border-default bg-default px-6 py-4">
          <h1 class="text-lg font-semibold text-highlighted">
            New Custom Table
          </h1>
        </div>

        {/* ── Body ── */}
        <div class="p-6">
          {/* ── Table name ── */}
          <div class="table-name-field mb-4 flex flex-col gap-1">
            <label class="text-sm font-medium text-default" for="table-name">
              Table name
            </label>
            <UInput
              id="table-name"
              modelValue={tableName.value}
              placeholder="e.g. Vendor Risk Register"
              onUpdate:modelValue={(v: string) => updateTableName(v)}
            />
          </div>

          {/* ── Column definition table ── */}
          <div class="overflow-x-auto rounded-lg border border-default bg-default">
            <table class="w-full text-sm">
              <thead class="bg-elevated text-muted">
                <tr>
                  <th scope="col" class="px-3 py-2 text-left font-medium">
                    Column name
                  </th>
                  <th scope="col" class="px-3 py-2 text-left font-medium">
                    Type
                  </th>
                  <th scope="col" class="px-3 py-2 text-center font-medium">
                    Required
                  </th>
                  <th scope="col" class="px-3 py-2 text-left font-medium">
                    Choices
                  </th>
                  <th scope="col" class="px-3 py-2 text-center font-medium">
                    {' '}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                {rows.value.map((row, index) => (
                  <tr key={row.id} class="align-middle">
                    {/* Name */}
                    <td class="px-3 py-2">
                      <UInput
                        modelValue={row.name}
                        placeholder="Column name"
                        onUpdate:modelValue={(v: string) =>
                          updateRowName(index, v)
                        }
                      />
                    </td>
                    {/* Type */}
                    <td class="px-3 py-2">
                      <USelect
                        modelValue={row.type}
                        items={TYPE_ITEMS}
                        onUpdate:modelValue={(v) => updateRowType(index, v)}
                      />
                    </td>
                    {/* Required */}
                    <td class="px-3 py-2 text-center">
                      <UCheckbox
                        modelValue={row.required}
                        onUpdate:modelValue={(v) =>
                          updateRowRequired(index, v === true)
                        }
                      />
                    </td>
                    {/* Choices — only visible for Dropdown */}
                    <td class="px-3 py-2">
                      {row.type === 'dropdown' ? (
                        <UInput
                          modelValue={row.choicesText}
                          placeholder="Comma-separated, e.g. Low, Medium, High"
                          onUpdate:modelValue={(v: string) =>
                            updateRowChoices(index, v)
                          }
                        />
                      ) : null}
                    </td>
                    {/* Remove button */}
                    <td class="px-3 py-2 text-center">
                      <UButton
                        label="Remove"
                        color="error"
                        variant="ghost"
                        size="xs"
                        onClick={() => removeRow(index)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Validation errors ── */}
          {errors.value.length > 0 ? (
            <div
              data-testid="validation-errors"
              class="mt-4 rounded-lg border border-error bg-error/10 p-4"
              role="alert"
            >
              <h3 class="mb-2 text-sm font-semibold text-error">
                Please fix the following before creating the table:
              </h3>
              <ul class="list-disc space-y-1 pl-5 text-sm text-error">
                {errors.value.map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* ── Actions ── */}
          <div class="mt-4 flex gap-2">
            <UButton
              label="Add Column"
              color="neutral"
              variant="outline"
              onClick={addColumn}
            />
            <UButton
              label="Create Table"
              color="primary"
              onClick={handleCreate}
            />
          </div>
        </div>
      </div>
    );
  },
});
