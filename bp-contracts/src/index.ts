export * from "./common/index.js";
export * from "./item/index.js";

import { itemRoutes } from "./item/routes/index.js";

export const contract = {
  item: itemRoutes,
};
