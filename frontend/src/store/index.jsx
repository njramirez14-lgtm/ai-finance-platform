import { create } from "zustand";
import { devtools } from "zustand/middleware";

import createAuthSlice from "./slices/auth";
import createSettingsSlice from "./slices/settings";
import createCategoriesSlice from "./slices/categories";
import createTransactionsSlice from "./slices/transactions";
import createScopeSlice from "./slices/scope";

const useStore = create(
  devtools(
    (set, get) => ({
      ...createAuthSlice(set, get),
      ...createSettingsSlice(set, get),
      ...createCategoriesSlice(set, get),
      ...createTransactionsSlice(set, get),
      ...createScopeSlice(set, get),
    }),
    { name: "Store" }
  )
);

export default useStore;
