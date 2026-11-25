/**
 * PROTOTYPE — Custom Tables List (/custom)
 *
 * Reads table definitions via `useTableDefinitions()` and renders one card
 * per definition showing the table name, column count, row count (read from
 * that table's actual stored data key, not from the definition), and a
 * last-modified timestamp derived from `updatedAt`.
 *
 * A "New Table" button navigates to `/custom/new`. Clicking a card navigates
 * to `/custom/:tableId`. A delete button per card opens a `UModal`
 * confirmation that names the table; confirming removes both the definition
 * and its data key (via `deleteDefinition`, which calls `deleteTableData`),
 * leaving sibling tables untouched. Cancelling changes nothing.
 *
 * When there are no definitions — including when `sc-table-defs` holds
 * corrupt JSON — an explanatory empty state renders that still offers New
 * Table. The corruption tolerance lives in the storage layer
 * (`parseTableDefinitions`), so this page never white-screens.
 *
 * Card order follows the storage array order (insertion order), which is
 * stable across reloads.
 *
 * NOT PRODUCTION — throwaway prototype code.
 */
import UButton from '@nuxt/ui/components/Button.vue';
import UCard from '@nuxt/ui/components/Card.vue';
import UModal from '@nuxt/ui/components/Modal.vue';
import { useTableDefinitions } from 'composables/useTableDefinitions';
import { readTableRows } from 'utils/tableStorage';
import { defineComponent, ref } from 'vue';
import { useRouter } from 'vue-router';
import type { TableDefinition } from 'src/types/customTable';
import type { VNode } from 'vue';

// ── Row count helper — reads from the table's data key, not the definition ──
function rowCountFor(id: string): number {
  return readTableRows(id).length;
}

// ── Last-modified formatter ──
function formatUpdatedAt(iso: string): string {
  // Render as a locale-style date. The exact format is not contractually
  // fixed; we keep it human-readable and include the year so validators
  // can match against the stored `updatedAt`.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleString();
}

export default defineComponent({
  name: 'CustomTableList',
  setup() {
    const router = useRouter();
    const { definitions, deleteDefinition } = useTableDefinitions();

    // ── Delete confirmation modal state ──
    const deleteTarget = ref<TableDefinition | null>(null);

    function openDeleteModal(d: TableDefinition): void {
      deleteTarget.value = d;
    }

    function closeDeleteModal(): void {
      deleteTarget.value = null;
    }

    function confirmDelete(): void {
      if (deleteTarget.value) {
        deleteDefinition(deleteTarget.value.id);
      }
      deleteTarget.value = null;
    }

    // ── Navigation ──
    function goToNew(): void {
      void router.push('/custom/new');
    }

    function goToEditor(id: string): void {
      void router.push(`/custom/${id}`);
    }

    return (): VNode => {
      const defs = definitions.value;
      const hasTables = defs.length > 0;

      return (
        <div class="flex h-full flex-col overflow-auto bg-muted">
          {/* ── Page header ── */}
          <div class="flex items-center justify-between border-b border-default bg-default px-6 py-4">
            <h1 class="text-lg font-semibold text-highlighted">
              Custom Tables
            </h1>
            <UButton
              label="New Table"
              color="primary"
              size="sm"
              onClick={goToNew}
            />
          </div>

          {/* ── Body ── */}
          <div class="p-6">
            {hasTables ? (
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {defs.map((d) => (
                  <UCard key={d.id}>
                    <div
                      class="cursor-pointer"
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the card holds a Delete button; an <a> cannot contain interactive content
                      role="link"
                      tabindex={0}
                      aria-label={`Open table ${d.name}`}
                      onClick={() => goToEditor(d.id)}
                      onKeydown={(e: KeyboardEvent) => {
                        if (e.key === 'Enter') {
                          goToEditor(d.id);
                        }
                      }}
                    >
                      {/* ── Card header: name + delete button ── */}
                      <div class="flex items-start justify-between gap-2">
                        <h2 class="text-base font-semibold text-highlighted">
                          {d.name}
                        </h2>
                        <UButton
                          label="Delete"
                          color="error"
                          variant="ghost"
                          size="xs"
                          onClick={(e: Event) => {
                            e.stopPropagation();
                            openDeleteModal(d);
                          }}
                        />
                      </div>

                      {/* ── Card metadata ── */}
                      <dl class="mt-3 space-y-1 text-sm text-muted">
                        <div class="flex justify-between">
                          <dt>Columns</dt>
                          <dd class="font-medium text-default">
                            {d.columns.length}
                          </dd>
                        </div>
                        <div class="flex justify-between">
                          <dt>Rows</dt>
                          <dd class="font-medium text-default">
                            {rowCountFor(d.id)}
                          </dd>
                        </div>
                        <div class="flex justify-between">
                          <dt>Last modified</dt>
                          <dd class="font-medium text-default">
                            {formatUpdatedAt(d.updatedAt)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </UCard>
                ))}
              </div>
            ) : (
              <div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div class="text-4xl text-muted">📋</div>
                <h2 class="text-lg font-medium text-default">
                  No custom tables yet
                </h2>
                <p class="max-w-md text-sm text-muted">
                  Custom tables let you define your own columns (text, dropdown,
                  or number) and fill them with the same grid editor that powers
                  the compliance library. Create your first table to get
                  started.
                </p>
                <UButton
                  label="New Table"
                  color="primary"
                  size="md"
                  onClick={goToNew}
                />
              </div>
            )}
          </div>

          {/* ── Delete confirmation modal ── */}
          <UModal
            open={deleteTarget.value !== null}
            onUpdate:open={(v: boolean) => {
              if (!v) {
                closeDeleteModal();
              }
            }}
          >
            {deleteTarget.value && (
              <div class="p-6">
                <h3 class="text-lg font-semibold text-highlighted">
                  Delete table?
                </h3>
                <p class="mt-2 text-sm text-muted">
                  Are you sure you want to delete{' '}
                  <strong class="text-default">
                    {deleteTarget.value.name}
                  </strong>
                  ? This removes the table definition and all of its saved rows.
                  This action cannot be undone.
                </p>
                <div class="mt-4 flex justify-end gap-2">
                  <UButton
                    label="Cancel"
                    color="neutral"
                    variant="ghost"
                    onClick={closeDeleteModal}
                  />
                  <UButton
                    label="Confirm"
                    color="error"
                    onClick={confirmDelete}
                  />
                </div>
              </div>
            )}
          </UModal>
        </div>
      );
    };
  },
});
