// Chaves do localStorage. Continuam sendo a verdade do aparelho; as abas
// novas da planilha (PRODUTOS, USUARIOS, MOVIMENTOS) são a verdade
// compartilhada entre os aparelhos.
export const STORAGE_KEYS = {
  leader: "barInventory.leader",
  currentUser: "barInventory.currentUser",
  users: "barInventory.users",
  integration: "barInventory.integration",
  products: "barInventory.products",
  inventories: "barInventory.inventories",
  draft: "barInventory.draft",
  movements: "barInventory.movements",
  // Fase 1: cópia local do catálogo e da sessão vindos da planilha, para o
  // app abrir com os dados na mão mesmo antes de a rede responder.
  catalogo: "barInventory.catalogo",
  sessao: "barInventory.sessao",
};

export function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeKey(key) {
  localStorage.removeItem(key);
}
