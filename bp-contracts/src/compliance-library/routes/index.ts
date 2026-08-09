import { oc } from '@orpc/contract';
import { HttpStatusCode } from '../../common/schemas/index.js';
import {
  BulkSaveRequestSchema,
  ListComplianceLibraryRequestSchema,
} from '../requests/index.js';
import {
  BulkSaveResponseSchema,
  ListComplianceLibraryResponseSchema,
} from '../responses/index.js';

const basePath = '/compliance-library';

export const complianceLibraryRoutes = {
  listComplianceLibrary: oc
    .route({
      method: 'GET',
      path: `${basePath}`,
      successStatus: HttpStatusCode.OK,
    })
    .input(ListComplianceLibraryRequestSchema)
    .output(ListComplianceLibraryResponseSchema),

  bulkSaveComplianceLibrary: oc
    .route({
      method: 'PUT',
      path: `${basePath}/bulk`,
      successStatus: HttpStatusCode.OK,
    })
    .input(BulkSaveRequestSchema)
    .output(BulkSaveResponseSchema),
};