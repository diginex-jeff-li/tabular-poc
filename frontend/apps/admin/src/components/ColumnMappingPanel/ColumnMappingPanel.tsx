import UButton from '@nuxt/ui/components/Button.vue';
import { INVITE_COLUMNS, type InviteField } from 'contracts';
import {
  mappingProblems,
  type ColumnMapping,
  type UnmappedTable,
} from 'utils/columnMapping';
import { computed, defineComponent, type PropType, type VNode } from 'vue';

/**
 * PROTOTYPE — the person's side of a column mapping (see CONTEXT.md).
 *
 * Lists each pasted column with a sample value and a template-column select.
 * Columns the agent proposed are marked until the person changes them.
 * Nothing enters the invite draft until the person clicks Apply.
 */
export default defineComponent({
  name: 'ColumnMappingPanel',
  props: {
    table: { type: Object as PropType<UnmappedTable>, required: true },
    mapping: { type: Array as PropType<ColumnMapping>, required: true },
    agentColumns: { type: Array as PropType<number[]>, required: true },
    onChange: {
      type: Function as PropType<
        (column: number, field: InviteField | null) => void
      >,
      required: true,
    },
    onApply: { type: Function as PropType<() => void>, required: true },
    onDiscard: { type: Function as PropType<() => void>, required: true },
  },
  setup(props) {
    const problems = computed(() => mappingProblems(props.mapping));

    const select = (column: number): VNode => (
      <select
        class="rounded border border-default bg-default px-1 py-0.5 text-xs"
        aria-label={`Template column for ${props.table.headers[column]}`}
        onChange={(e: Event) =>
          props.onChange(
            column,
            ((e.target as HTMLSelectElement).value ||
              null) as InviteField | null,
          )
        }
      >
        <option value="" selected={props.mapping[column] === null}>
          Ignore
        </option>
        {INVITE_COLUMNS.map((c) => (
          <option value={c.field} selected={props.mapping[column] === c.field}>
            {c.header}
          </option>
        ))}
      </select>
    );

    return (): VNode => (
      <div
        class="space-y-2 rounded border border-warning/50 bg-warning/5 p-3"
        data-testid="column-mapping"
      >
        <p class="text-sm font-semibold text-default">
          Pasted {props.table.headers.length} columns ×{' '}
          {props.table.rows.length} rows. Map them to the template; nothing
          enters the draft until you apply.
        </p>
        <table class="text-xs">
          <thead>
            <tr class="text-left text-muted">
              <th class="pr-4 font-medium">Pasted column</th>
              <th class="pr-4 font-medium">Sample</th>
              <th class="font-medium">Template column</th>
            </tr>
          </thead>
          <tbody>
            {props.table.headers.map((header, i) => (
              <tr>
                <td class="pr-4">{header}</td>
                <td class="pr-4 text-muted">
                  {props.table.rows[0]?.[i] ?? ''}
                </td>
                <td class="py-0.5">
                  {select(i)}
                  {props.agentColumns.includes(i) && (
                    <span class="ml-2 font-semibold text-info">
                      Agent proposed
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {problems.value.length > 0 && (
          <ul class="text-xs text-error">
            {problems.value.map((p) => (
              <li>{p}</li>
            ))}
          </ul>
        )}
        <div class="flex gap-2">
          <UButton
            label="Apply mapping"
            size="xs"
            disabled={problems.value.length > 0}
            onClick={props.onApply}
          />
          <UButton
            label="Discard"
            size="xs"
            color="neutral"
            variant="ghost"
            onClick={props.onDiscard}
          />
        </div>
      </div>
    );
  },
});
