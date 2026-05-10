const STORAGE_KEY = "entity_scope_v1";

const defaultScope = { kind: "all", value: null };

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultScope;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.kind === "string") return parsed;
  } catch {}
  return defaultScope;
}

const createScopeSlice = (set, get) => ({
  scope: defaultScope,
  scopeReady: false,
  entitiesCache: [],

  rehydrateScope: () => {
    set({ scope: readStored(), scopeReady: true });
  },

  setScope: (scope) => {
    const next = scope && typeof scope.kind === "string" ? scope : defaultScope;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    set({ scope: next });
  },

  setEntitiesCache: (entities) => {
    set({ entitiesCache: Array.isArray(entities) ? entities : [] });
  },
});

export default createScopeSlice;

export function scopeToParams(scope, entitiesCache) {
  if (!scope || scope.kind === "all") return {};
  if (scope.kind === "entity" && scope.value != null) {
    return { entity_id: Number(scope.value) };
  }
  if (scope.kind === "type" && scope.value) {
    const ids = (entitiesCache || [])
      .filter((e) => e.type === scope.value)
      .map((e) => e.id);
    return { entity_ids: ids };
  }
  return {};
}

export function scopeFilter(item, scope, entitiesCache) {
  if (!scope || scope.kind === "all") return true;
  if (scope.kind === "entity") {
    if (scope.value == null) return !item.entity_id;
    return String(item.entity_id) === String(scope.value);
  }
  if (scope.kind === "type") {
    const ids = (entitiesCache || [])
      .filter((e) => e.type === scope.value)
      .map((e) => e.id);
    return item.entity_id != null && ids.includes(item.entity_id);
  }
  return true;
}

export function scopeLabel(scope, entitiesCache) {
  if (!scope || scope.kind === "all") return "Todo conjunto";
  if (scope.kind === "type") {
    return scope.value === "BUSINESS" ? "Solo empresa" : "Solo personal";
  }
  if (scope.kind === "entity") {
    if (scope.value == null) return "Sin asignar";
    const e = (entitiesCache || []).find((x) => x.id === Number(scope.value));
    return e ? e.name : "Entidad";
  }
  return "Todo";
}
