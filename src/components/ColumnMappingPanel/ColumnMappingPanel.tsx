import UButton from '@nuxt/ui/components/Button.vue';
import { INVITE_COLUMNS } from 'contracts';
import { defineComponent } from 'vue';
import type { InviteField } from 'contracts';
import type { HeldTable } from 'utils/inviteDraft';
import type { PropType, VNode } from 'vue';

/**
 * PROTOTYPE — the person's side of a column mapping (see CONTEXT.md).
 *
 * Lists each column of the held table with a sample value and a
 * template-column select, and the held table's mapping problems. Columns the
 * agent proposed are marked until the person changes them. Nothing enters
 * the invite draft until the person clicks Apply.
 */
export default defineComponent({
  name: 'ColumnMappingPanel',
  props: {
    held: { type: Object as PropType<HeldTable>, required: true },
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
    const select = (column: number): VNode => (
      <select
        class="rounded border border-default bg-default px-1 py-0.5 text-xs"
        aria-label={`Template column for ${props.held.table.headers[column]}`}
        onChange={(e: Event) =>
          props.onChange(
            column,
            ((e.target as HTMLSelectElement).value ||
              null) as InviteField | null,
          )
        }
      >
        <option value="" selected={props.held.mapping[column] === null}>
          Ignore
        </option>
        {INVITE_COLUMNS.map((c) => (
          <option
            key={c.field}
            value={c.field}
            selected={props.held.mapping[column] === c.field}
          >
            {c.header}
          </option>
        ))}
      </select>
    );

    return (): VNode => {
      const { table, agentColumns, problems } = props.held;
      return (
        <div
          class="space-y-2 rounded border border-warning/50 bg-warning/5 p-3"
          data-testid="column-mapping"
        >
          <p class="text-sm font-semibold text-default">
            {table.headers.length} columns × {table.rows.length} rows. Map them
            to the template; nothing enters the draft until you apply.
          </p>
          <table class="text-xs">
            <thead>
              <tr class="text-left text-muted">
                <th class="pr-4 font-medium">Your column</th>
                <th class="pr-4 font-medium">Sample</th>
                <th class="font-medium">Template column</th>
              </tr>
            </thead>
            <tbody>
              {table.headers.map((header, i) => (
                <tr key={i}>
                  <td class="pr-4">{header}</td>
                  <td class="pr-4 text-muted">{table.rows[0]?.[i] ?? ''}</td>
                  <td class="py-0.5">
                    {select(i)}
                    {agentColumns.includes(i) && (
                      <span class="ml-2 font-semibold text-info">
                        Agent proposed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {problems.length > 0 && (
            <ul class="text-xs text-error">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div class="flex gap-2">
            <UButton
              label="Apply mapping"
              size="xs"
              disabled={problems.length > 0}
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
    };
  },
});
