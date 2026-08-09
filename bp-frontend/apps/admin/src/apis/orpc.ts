import { createORPCClient } from '@orpc/client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { createORPCVueColadaUtils } from '@orpc/vue-colada';
import { contract } from 'bp-contracts';
import type { ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';

const link = new OpenAPILink(contract, {
  url: API_URL,
  headers: () => ({}),
});

const client: JsonifiedClient<ContractRouterClient<typeof contract>> =
  createORPCClient(link);

export const orpc = createORPCVueColadaUtils(client);
