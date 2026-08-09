import { orpc } from './orpc';

export function listItems(
  input: MaybeRefOrGetter<{
    page?: number;
    perPage?: number;
    status?: 'active' | 'inactive';
  }>,
) {
  return useQuery(
    orpc.item.listItems.queryOptions({
      input: () => toValue(input),
    }),
  );
}

export function getItem(
  input: MaybeRefOrGetter<{ itemId: string }>,
  options?: { enabled?: MaybeRefOrGetter<boolean> },
) {
  return useQuery(
    orpc.item.getItem.queryOptions({
      input: () => toValue(input),
      enabled: options?.enabled ?? true,
    }),
  );
}

export function createItem() {
  return useMutation(orpc.item.createItem.mutationOptions());
}

export function updateItem() {
  return useMutation(orpc.item.updateItem.mutationOptions());
}

export function deleteItem() {
  return useMutation(orpc.item.deleteItem.mutationOptions());
}
