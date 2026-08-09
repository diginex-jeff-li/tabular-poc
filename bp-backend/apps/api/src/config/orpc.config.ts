import { ORPCError, ORPCModule } from '@orpc/nest';
import { experimental_RethrowHandlerPlugin as RethrowHandlerPlugin } from '@orpc/server/plugins';

export const orpcConfig = ORPCModule.forRoot({
  plugins: [
    new RethrowHandlerPlugin({
      filter: (error) => {
        return !(error instanceof ORPCError);
      },
    }),
  ],
});
