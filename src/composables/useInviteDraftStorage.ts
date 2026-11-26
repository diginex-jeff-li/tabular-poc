import { StorageSerializers, useLocalStorage } from '@vueuse/core';
import { z } from 'zod';
import type { InviteDraftStore } from 'utils/inviteDraft';

/**
 * The invite draft's store in localStorage, kept between visits: the grid's
 * rows (with their ids) and which of them are agent proposed.
 *
 * An unmapped table (pasted or imported) is not kept; it is a moment's
 * decision, not data.
 */
const StoredDraftSchema = z.object({
  version: z.literal(1),
  rows: z.array(z.looseObject({ id: z.string().min(1) })),
  agentProposed: z.array(z.string()),
});

const INVITE_DRAFT_KEY = 'sc.invite-users.draft';

export function useInviteDraftStorage(): InviteDraftStore {
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
    save(rows, agentProposed) {
      stored.value = { version: 1, rows, agentProposed };
    },
  };
}
