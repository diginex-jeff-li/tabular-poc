import { StorageSerializers, useLocalStorage } from '@vueuse/core';
import { z } from 'zod';

/**
 * The invite draft as kept in localStorage between visits: the grid's rows
 * (with their ids) and which of them are agent proposed. The agent-proposed
 * set must travel with the rows: without it a row an agent resolved would
 * come back as Ready and pass the Send gate without a person confirming it.
 *
 * A held (unmapped) paste is not kept; it is a moment's decision, not data.
 */
const StoredDraftSchema = z.object({
  version: z.literal(1),
  rows: z.array(z.looseObject({ id: z.string().min(1) })),
  agentProposed: z.array(z.string()),
});

const INVITE_DRAFT_KEY = 'sc.invite-users.draft';

export function useInviteDraftStorage() {
  const stored = useLocalStorage<unknown>(INVITE_DRAFT_KEY, null, {
    serializer: StorageSerializers.object,
    // Each save assigns a fresh object, so a shallow ref and no deep watch
    // suffice. Deep mode proxied and walked all rows on every keystroke
    // (~11 ms at 2,000 rows).
    shallow: true,
    deep: false,
  });

  return {
    /**
     * The draft from the last visit, read once when the page opens. Anything
     * that doesn't match the current shape (an older version, hand edits) is
     * ignored, so a bad entry never breaks the page.
     */
    restored: StoredDraftSchema.safeParse(stored.value).data ?? null,
    save(rows: Array<Record<string, unknown>>, agentProposed: Array<string>) {
      stored.value = { version: 1, rows, agentProposed };
    },
  };
}
