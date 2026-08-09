export * from "./common/index.js";
export * from "./item/index.js";
export * from "./compliance-library/index.js";

import { itemRoutes } from "./item/routes/index.js";
import { complianceLibraryRoutes } from "./compliance-library/routes/index.js";

export const contract = {
  item: itemRoutes,
  complianceLibrary: complianceLibraryRoutes,
};
