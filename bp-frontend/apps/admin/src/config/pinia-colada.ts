import { PiniaColadaQueryHooksPlugin } from '@pinia/colada';
import { PiniaColadaRetry } from '@pinia/colada-plugin-retry';
import type { PiniaColadaOptions } from '@pinia/colada';

const messageOf = (error: unknown): string => {
  const e = error as { message?: string; data?: { message?: string } };
  return e?.message ?? e?.data?.message ?? 'Request failed';
};

export const piniaColadaOptions: PiniaColadaOptions = {
  queryOptions: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  },
  mutationOptions: {
    onError(error) {
      console.error('Mutation error:', messageOf(error));
    },
  },
  plugins: [
    PiniaColadaRetry({
      retry: 3,
      delay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
    }),
    PiniaColadaQueryHooksPlugin({
      onError(error, entry) {
        if (
          !(entry.options?.meta as { skipErrorToast?: boolean } | undefined)
            ?.skipErrorToast
        ) {
          console.error('Query error:', messageOf(error));
        }
      },
    }),
  ],
};
