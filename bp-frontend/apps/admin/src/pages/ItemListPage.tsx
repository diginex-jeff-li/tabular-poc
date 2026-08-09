import UBadge from '@nuxt/ui/components/Badge.vue';
import UButton from '@nuxt/ui/components/Button.vue';
import UEmpty from '@nuxt/ui/components/Empty.vue';
import { createItem, listItems } from 'apis/item';
import { computed, defineComponent, ref, watch, type VNode } from 'vue';

type ItemRow = {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
};

type ListItemsData = {
  data: ItemRow[];
  meta: {
    total: number;
    lastPage: number;
    perPage: number;
    currentPage: number;
  };
};

const PER_PAGE = 20;

const STATUS_COLOR: Record<string, 'success' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
};

export default defineComponent({
  name: 'ItemListPage',
  setup() {
    const page = ref(1);
    const createModalOpen = ref(false);
    const newName = ref('');
    const newDescription = ref('');
    const newStatus = ref<'active' | 'inactive'>('active');

    const listInput = computed(() => ({
      page: page.value,
      perPage: PER_PAGE,
    }));

    const list = listItems(listInput);
    const itemData = computed<ListItemsData | undefined>(
      () => list.data.value as ListItemsData | undefined,
    );
    const isLoading = computed(() => list.isLoading.value);
    const listError = computed(() => list.error.value);
    const items = computed<ItemRow[]>(() => itemData.value?.data ?? []);

    const createMutation = createItem();

    const handleCreate = async () => {
      if (!newName.value.trim()) return;
      await createMutation.mutateAsync({
        name: newName.value,
        description: newDescription.value || undefined,
        status: newStatus.value,
      });
      await list.refetch();
      createModalOpen.value = false;
      newName.value = '';
      newDescription.value = '';
      newStatus.value = 'active';
    };

    watch(page, () => {
      list.refetch();
    });

    return (): VNode => (
      <div class="mx-auto max-w-4xl p-6">
        <div class="mb-6 flex items-center justify-between">
          <h1 class="text-2xl font-bold text-highlighted">Items</h1>
          <UButton
            label="Create Item"
            color="primary"
            onClick={() => (createModalOpen.value = true)}
          />
        </div>

        {isLoading.value && <p class="text-muted">Loading...</p>}
        {listError.value && (
          <p class="text-error">
            Error: {(listError.value as { message?: string }).message}
          </p>
        )}

        {!isLoading.value && !listError.value && items.value.length === 0 && (
          <UEmpty label="No items found" />
        )}

        {items.value.length > 0 && (
          <div class="overflow-hidden rounded-lg border border-default">
            <table class="w-full text-sm">
              <thead class="bg-muted">
                <tr>
                  <th class="px-4 py-3 text-left font-medium text-muted">Name</th>
                  <th class="px-4 py-3 text-left font-medium text-muted">
                    Description
                  </th>
                  <th class="px-4 py-3 text-left font-medium text-muted">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.value.map((item) => (
                  <tr
                    key={item.id}
                    class="border-t border-default"
                  >
                    <td class="px-4 py-3 text-default">{item.name}</td>
                    <td class="px-4 py-3 text-muted">
                      {item.description ?? '-'}
                    </td>
                    <td class="px-4 py-3">
                      <UBadge
                        color={STATUS_COLOR[item.status] ?? 'neutral'}
                        label={item.status}
                        variant="soft"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {createModalOpen.value && (
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div class="w-full max-w-md rounded-lg bg-default p-6 shadow-lg">
              <h2 class="mb-4 text-lg font-semibold text-highlighted">
                Create Item
              </h2>
              <div class="mb-4 space-y-3">
                <input
                  class="w-full rounded border border-default bg-default px-3 py-2 text-sm"
                  placeholder="Name"
                  value={newName.value}
                  onInput={(e: Event) => {
                    newName.value = (e.target as HTMLInputElement).value;
                  }}
                />
                <textarea
                  class="w-full rounded border border-default bg-default px-3 py-2 text-sm"
                  placeholder="Description"
                  value={newDescription.value}
                  onInput={(e: Event) => {
                    newDescription.value = (e.target as HTMLTextAreaElement).value;
                  }}
                />
                <select
                  class="w-full rounded border border-default bg-default px-3 py-2 text-sm"
                  value={newStatus.value}
                  onChange={(e: Event) => {
                    newStatus.value = (e.target as HTMLSelectElement).value as
                      | 'active'
                      | 'inactive';
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div class="flex justify-end gap-2">
                <UButton
                  label="Cancel"
                  color="neutral"
                  variant="ghost"
                  onClick={() => (createModalOpen.value = false)}
                />
                <UButton
                  label="Create"
                  color="primary"
                  loading={createMutation.isPending.value}
                  disabled={!newName.value.trim()}
                  onClick={handleCreate}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
});
