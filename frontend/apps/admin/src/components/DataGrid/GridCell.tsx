/**
 * One data cell: a full-size wrapper carrying the cell's ids, pointer
 * handlers and ARIA state, and the cell's editor while it is being edited.
 *
 * Every piece of interaction state (active, in range, editing, invalid,
 * outlined) is read through this component's own `computed`s, so a change
 * re-renders only the cells whose state flipped. Each computed returns a
 * primitive for the same reason.
 *
 * `UTable` can't put attributes on its `td`, so `role="gridcell"`,
 * `aria-selected`, `aria-colindex` and `aria-invalid` sit on the wrapper.
 */
import UInput from '@nuxt/ui/components/Input.vue';
import USelectMenu from '@nuxt/ui/components/SelectMenu.vue';
import { ROW_HEIGHT } from 'composables/useDataGrid';
import {
  computed,
  defineComponent,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';
import type { Row } from 'composables/useDataGrid';
import type { GridSelection } from 'composables/useGridSelection';
import type { CellPos, Dir } from 'utils/gridRange';
import type { CellMessages } from 'utils/gridValidation';
import type { GridColumn } from 'utils/zodToColumnDefs';
import type { ComputedRef, PropType, Ref, VNode } from 'vue';

/**
 * How an edit ends: commit `value` (null cancels), then move `dir`.
 * `refocus` hands focus back to the grid; a blur doesn't, because the person
 * already moved focus somewhere.
 */
export type EditEnd = {
  value: string | null;
  dir: Dir | null;
  refocus: boolean;
};

/** Shared grid state and actions every cell reads. Built once per grid. */
export interface GridCellContext {
  selection: GridSelection;
  /** Derived validation messages. */
  invalid: ComputedRef<CellMessages>;
  /** Backend save errors. */
  saveErrors: ComputedRef<CellMessages>;
  /** The cell a sidebar error click points at, for 2 s. */
  outline: Ref<CellPos | null>;
  /** The mouse button is held down over the grid (drag to select). */
  pressed: Ref<boolean>;
  startEdit: (pos: CellPos, seed: string | null) => void;
  endEdit: (pos: CellPos, end: EditEnd) => void;
}

type Finish = (end: EditEnd) => void;

const TextEditor = defineComponent({
  name: 'TextEditor',
  props: {
    initial: { type: String, required: true },
    onFinish: { type: Function as PropType<Finish>, required: true },
  },
  setup(props) {
    const draft = ref(props.initial);
    const input = ref<{ inputRef: HTMLInputElement | null } | null>(null);
    onMounted(() => {
      const el = input.value?.inputRef;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
    // The row left the virtualized window mid-edit: keep what was typed. A
    // finished edit is no longer the editing cell, so this is a no-op then.
    onBeforeUnmount(() =>
      props.onFinish({ value: draft.value, dir: null, refocus: true }),
    );

    function onKeydown(e: KeyboardEvent) {
      if (e.isComposing) {
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const dir = e.key === 'Enter' ? 'down' : e.shiftKey ? 'left' : 'right';
        props.onFinish({ value: draft.value, dir, refocus: true });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        props.onFinish({ value: null, dir: null, refocus: true });
      }
    }
    // UInput forwards $attrs to its <input>, but its props type has no DOM events.
    const inputAttrs = { onKeydown };

    return (): VNode => (
      <UInput
        ref={input}
        size="xs"
        class="w-full"
        aria-label="Edit cell"
        modelValue={draft.value}
        onUpdate:modelValue={(value: string | number) => {
          draft.value = String(value);
        }}
        {...inputAttrs}
        onBlur={() =>
          props.onFinish({ value: draft.value, dir: null, refocus: false })
        }
      />
    );
  },
});

/** Opens on mount with the current value; a pick commits, a dismiss cancels. */
const ChoiceEditor = defineComponent({
  name: 'ChoiceEditor',
  props: {
    options: { type: Array as PropType<ReadonlyArray<string>>, required: true },
    value: { type: String, default: undefined },
    seed: { type: String, default: '' },
    onFinish: { type: Function as PropType<Finish>, required: true },
  },
  setup(props) {
    const term = ref(props.seed);
    // Only a pick commits, so a row scrolled away mid-choice cancels.
    onBeforeUnmount(() =>
      props.onFinish({ value: null, dir: null, refocus: true }),
    );
    return (): VNode => (
      <USelectMenu
        size="xs"
        class="w-full"
        aria-label="Edit cell"
        defaultOpen
        items={[...props.options]}
        modelValue={props.value}
        searchTerm={term.value}
        onUpdate:searchTerm={(value: string) => {
          term.value = value;
        }}
        onUpdate:modelValue={(value: string | null | undefined) =>
          props.onFinish({ value: value ?? '', dir: null, refocus: true })
        }
        onUpdate:open={(open: boolean) => {
          if (!open) {
            props.onFinish({ value: null, dir: null, refocus: true });
          }
        }}
      />
    );
  },
});

function cellClass(cell: {
  selected: boolean;
  active: boolean;
  invalid: boolean;
  saveError: boolean;
  outlined: boolean;
}): Array<string | false> {
  return [
    'flex select-none items-center border-b border-default px-3',
    cell.saveError ? 'bg-error/10' : cell.selected && 'bg-primary/10',
    (cell.invalid || cell.saveError) && 'ring-2 ring-inset ring-error',
    cell.outlined
      ? 'outline-3 -outline-offset-3 outline-error'
      : cell.active && 'outline-2 -outline-offset-2 outline-primary',
  ];
}

export default defineComponent({
  name: 'GridCell',
  props: {
    row: { type: Object as PropType<Row>, required: true },
    column: { type: Object as PropType<GridColumn>, required: true },
    /** 1-based, counting the checkbox column. */
    colIndex: { type: Number, required: true },
    ctx: { type: Object as PropType<GridCellContext>, required: true },
  },
  setup(props) {
    const { selection, invalid, saveErrors, outline, pressed } = props.ctx;
    const colId = props.column.id;
    const pos = (): CellPos => ({ rowId: props.row.id, colId });
    const editing = computed(() => selection.isEditing(props.row.id, colId));
    const active = computed(() => selection.isActive(props.row.id, colId));
    const selected = computed(() => selection.isSelected(props.row.id, colId));
    const message = computed(
      () =>
        saveErrors.value.get(props.row.id)?.[colId] ??
        invalid.value.get(props.row.id)?.[colId] ??
        null,
    );
    const saveError = computed(() =>
      Boolean(saveErrors.value.get(props.row.id)?.[colId]),
    );
    const outlined = computed(
      () =>
        outline.value?.rowId === props.row.id && outline.value.colId === colId,
    );

    function onPointerdown(e: PointerEvent) {
      if (e.button === 0 && !editing.value) {
        selection.select(pos(), e.shiftKey);
      }
    }

    function onPointerenter() {
      if (pressed.value && !selection.state.value.editing) {
        selection.dragTo(pos());
      }
    }

    const renderEditor = (): VNode => {
      const value = props.row[colId];
      const seed = selection.state.value.editing?.seed ?? null;
      const onFinish: Finish = (end) => props.ctx.endEdit(pos(), end);
      const column = props.column;
      return (
        <div data-grid-editor class="flex w-full">
          {'options' in column ? (
            <ChoiceEditor
              options={column.options}
              value={
                typeof value === 'string' && value !== '' ? value : undefined
              }
              seed={seed ?? ''}
              onFinish={onFinish}
            />
          ) : (
            <TextEditor
              initial={
                seed ??
                (value === null || value === undefined ? '' : String(value))
              }
              onFinish={onFinish}
            />
          )}
        </div>
      );
    };

    const renderValue = (): VNode => {
      const column = props.column;
      if ('render' in column && column.render) {
        // Read so that showing errors repaints the cell (GridColumn.render).
        void saveErrors.value;
        return column.render(props.row);
      }
      return <span class="truncate">{String(props.row[colId] ?? '')}</span>;
    };

    return (): VNode => (
      // oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- focus stays on the grid root (one tab stop)
      <div
        data-row-id={props.row.id}
        data-col-id={colId}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- UTable owns the <td> and binds no attributes on it
        role="gridcell"
        aria-colindex={props.colIndex}
        aria-selected={selected.value}
        aria-invalid={message.value === null ? undefined : true}
        title={message.value ?? undefined}
        class={cellClass({
          selected: selected.value,
          active: active.value,
          invalid: message.value !== null,
          saveError: saveError.value,
          outlined: outlined.value,
        })}
        style={{ height: `${ROW_HEIGHT}px` }}
        onPointerdown={onPointerdown}
        onPointerenter={onPointerenter}
        onDblclick={() => props.ctx.startEdit(pos(), null)}
      >
        {editing.value ? renderEditor() : renderValue()}
      </div>
    );
  },
});
