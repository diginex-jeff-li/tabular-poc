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
        class="h-7 rounded-md border border-default bg-default px-2 text-xs text-default focus-visible:outline-2 focus-visible:outline-primary"
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
      const columns = table.headers.length;
      const rows = table.rows.length;
      return (
        <div
          class="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-3"
          data-testid="column-mapping"
        >
          <div>
            <p class="text-sm font-semibold text-highlighted">
              {`${columns} ${columns === 1 ? 'column' : 'columns'} × ${rows} ${rows === 1 ? 'row' : 'rows'}`}
            </p>
            <p class="mt-0.5 text-xs text-muted">
              Map them to the template; nothing enters the draft until you
              apply.
            </p>
          </div>
          <table class="text-xs">
            <thead>
              <tr class="text-left text-muted">
                <th class="pr-6 pb-1 font-medium">Your column</th>
                <th class="pr-6 pb-1 font-medium">Sample</th>
                <th class="pb-1 font-medium">Template column</th>
              </tr>
            </thead>
            <tbody>
              {table.headers.map((header, i) => (
                <tr key={i}>
                  <td class="pr-6 font-medium text-default">{header}</td>
                  <td class="pr-6 text-muted">
                    <span class="block max-w-48 truncate">
                      {table.rows[0]?.[i] ?? ''}
                    </span>
                  </td>
                  <td class="py-0.5">
                    {select(i)}
                    {agentColumns.includes(i) && (
                      <span class="ml-2 rounded-sm bg-info/10 px-1.5 py-0.5 font-medium text-info">
                        Agent proposed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {problems.length > 0 && (
            <ul class="space-y-0.5 text-xs text-error">
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
