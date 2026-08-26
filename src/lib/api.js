import { STORAGE_KEYS, loadJson, saveJson } from "./storage.js";

export const DEFAULT_INTEGRATION = {
  appsScriptUrl: "https://script.google.com/macros/s/AKfycbwkpfNZz_CAr7viDL8YvFjE2J_o9wyd3gybqrZMyAE94WO3UaUFSKI89gk-srqvEg/exec",
  // Referência do estoque, definida por Carlos em 26/08/2026: a aba
  // ESTOQUE GERAL, na coluna do fechamento de domingo. A coluna é guardada
  // pelo índice porque o nome do cabeçalho varia de planilha para planilha;
  // null significa "ainda não escolhida" e o app pergunta na tela Estoque.
  estoqueAba: "ESTOQUE GERAL",
  estoqueColuna: null,
};

// URLs de implantações antigas do Apps Script (substituídas em 05/07/2026);
// dispositivos que as tenham salvas migram para a URL atual do catálogo.
export const LEGACY_APPS_SCRIPT_URLS = new Set([
  "https://script.google.com/macros/s/AKfycbz3srEqJficsymLS__sEgj7s3VxFA14EZHQWg7jG5ukB0_4azZbIfGzGMF6o3dF3A5n/exec",
]);

// Chave que autentica o app no Apps Script; sem ela o script recusa a
// requisição. Precisa ser idêntica à constante APP_TOKEN do Code.gs.
export const APPS_SCRIPT_TOKEN = "EPH-2026-a7c31f98d4e2b6f0-inventario";

export function isAppsScriptWebAppUrl(url) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(String(url || "").trim());
}

export function loadIntegration() {
  const merged = { ...DEFAULT_INTEGRATION, ...loadJson(STORAGE_KEYS.integration, {}) };
  if (LEGACY_APPS_SCRIPT_URLS.has(String(merged.appsScriptUrl || "").trim())) {
    merged.appsScriptUrl = DEFAULT_INTEGRATION.appsScriptUrl;
  }
  return merged;
}

// Erro de rede/servidor indisponível. O login usa isso para decidir se cai
// para os usuários locais de reserva.
export class OfflineError extends Error {
  constructor(message) {
    super(message);
    this.name = "OfflineError";
    this.offline = true;
  }
}

// Toda chamada ao Apps Script passa por aqui: mesma URL, mesmo token, mesmo
// tratamento da página de erro em HTML que o Google devolve quando o script
// não está autorizado.
export async function chamarAppsScript(payload) {
  const integration = loadIntegration();
  const url = String(integration.appsScriptUrl || "").trim();
  if (!url) throw new OfflineError("Configure a URL do Apps Script na tela Planilha.");
  if (!isAppsScriptWebAppUrl(url)) {
    throw new Error("Use a URL do Web App do Apps Script, terminada em /exec.");
  }

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, token: APPS_SCRIPT_TOKEN }),
    });
  } catch (error) {
    throw new OfflineError(error.message || "Sem conexão com a planilha.");
  }

  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new OfflineError(
      "O Google respondeu com uma página de erro em vez de dados. " +
        "Reautorize o script no Apps Script e publique uma nova versão."
    );
  }
  if (!response.ok) throw new OfflineError(result.error || "A planilha respondeu com erro.");
  return result;
}

// --- Rotas da Fase 1 -------------------------------------------------------

// Cria as abas PRODUTOS, USUARIOS e MOVIMENTOS e semeia as duas primeiras se
// estiverem vazias. Rodar de novo não duplica nada.
export function bootstrap({ produtos = [], usuarios = [] } = {}) {
  return chamarAppsScript({ action: "bootstrap", produtos, usuarios });
}

export async function listarCatalogo() {
  const resultado = await chamarAppsScript({ action: "catalogo.listar" });
  if (resultado.ok === false) throw new Error(resultado.error);
  const produtos = resultado.produtos || [];
  saveJson(STORAGE_KEYS.catalogo, produtos);
  return produtos;
}

export function catalogoEmCache() {
  return loadJson(STORAGE_KEYS.catalogo, []);
}

export async function salvarCatalogo(produtos) {
  const resultado = await chamarAppsScript({ action: "catalogo.salvar", produtos });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado;
}

export async function listarUsuarios() {
  const resultado = await chamarAppsScript({ action: "usuarios.listar" });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado.usuarios || [];
}

export async function salvarUsuarios(usuarios) {
  const resultado = await chamarAppsScript({ action: "usuarios.salvar", usuarios });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado;
}

// Devolve { ok, usuario } ou { ok: false, error }. Não lança em senha errada;
// só lança OfflineError quando a planilha não respondeu.
export function autenticar(login, senha) {
  return chamarAppsScript({ action: "login", login, senha });
}

export async function listarMovimentos(filtros = {}) {
  const resultado = await chamarAppsScript({ action: "movimentos.listar", ...filtros });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado.movimentos || [];
}

// Movimento nunca é editado nem apagado: correção entra como AJUSTE novo.
export async function gravarMovimentos(movimentos) {
  const resultado = await chamarAppsScript({ action: "movimentos.gravar", movimentos });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado;
}

// --- Requisição (Fase 3) ---------------------------------------------------

// Quem precisa monta o pedido. Nada sai do estoque aqui.
export async function criarRequisicao({ reqId, destino, solicitanteId, data, itens }) {
  const resultado = await chamarAppsScript({ action: "requisicoes.criar", reqId, destino, solicitanteId, data, itens });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado;
}

export async function listarRequisicoes(filtros = {}) {
  const resultado = await chamarAppsScript({ action: "requisicoes.listar", ...filtros });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado.requisicoes || [];
}

// O estoquista separa e manda. É aqui que o estoque baixa.
export async function separarRequisicao({ reqId, separadorId, itens }) {
  const resultado = await chamarAppsScript({ action: "requisicoes.separar", reqId, separadorId, itens });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado;
}

// Saldo de qualquer produto em qualquer local = soma dos movimentos daquele
// produto naquele local. Nenhum módulo tem estoque próprio.
export async function consultarSaldos(filtros = {}) {
  const resultado = await chamarAppsScript({ action: "saldos", ...filtros });
  if (resultado.ok === false) throw new Error(resultado.error);
  return resultado.saldos || [];
}
