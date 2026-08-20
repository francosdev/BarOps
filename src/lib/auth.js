import { autenticar } from "./api.js";
import { normalizarPerfis } from "./perfis.js";
import { STORAGE_KEYS, loadJson, saveJson, removeKey } from "./storage.js";

// Sessão única para as duas origens de login. O resto do app não precisa
// saber se o usuário veio da planilha ou da reserva local.
function sessaoDaPlanilha(usuario, setoresPadrao) {
  return {
    id: usuario.usuarioId,
    nome: usuario.nome,
    login: usuario.login,
    perfis: normalizarPerfis(usuario.perfis),
    // A aba USUARIOS do escopo não tem coluna de setor: por ora todo usuário
    // da planilha enxerga todos os setores na contagem.
    setores: setoresPadrao,
    origem: "planilha",
  };
}

function sessaoLocal(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    login: String(usuario.nome || "").trim().toLowerCase(),
    perfis: normalizarPerfis(usuario.perfil),
    setores: usuario.setores || [],
    origem: "local",
  };
}

function acharUsuarioLocal(usuariosLocais, identificador, segredo) {
  const alvo = String(identificador || "").trim().toLowerCase();
  return (usuariosLocais || []).find((usuario) => (
    usuario.ativo &&
    String(usuario.nome || "").trim().toLowerCase() === alvo &&
    String(usuario.pin || "") === String(segredo || "")
  ));
}

/**
 * Autentica primeiro na planilha; se ela recusar ou não responder, tenta os
 * usuários locais por PIN. É a reserva que impede a equipe de ficar de fora
 * do bar em noite de operação quando o Apps Script cai.
 *
 * Devolve { ok, usuario, reserva, aviso } ou { ok: false, error }.
 */
export async function entrar(identificador, segredo, usuariosLocais, setoresPadrao) {
  let motivoServidor = "";
  let servidorOffline = false;

  try {
    const resposta = await autenticar(identificador, segredo);
    if (resposta.ok && resposta.usuario) {
      return { ok: true, usuario: sessaoDaPlanilha(resposta.usuario, setoresPadrao), reserva: false };
    }
    motivoServidor = resposta.error || "Usuário ou senha inválidos.";
  } catch (error) {
    servidorOffline = true;
    motivoServidor = error.message || "Sem conexão com a planilha.";
  }

  const local = acharUsuarioLocal(usuariosLocais, identificador, segredo);
  if (local) {
    return {
      ok: true,
      usuario: sessaoLocal(local),
      reserva: true,
      aviso: servidorOffline
        ? "Entrou pelo acesso de reserva: a planilha não respondeu."
        : "Entrou pelo acesso de reserva: este usuário ainda não está na planilha.",
    };
  }

  return { ok: false, error: servidorOffline ? `${motivoServidor} E o PIN de reserva não confere.` : motivoServidor };
}

export function carregarSessao() {
  const sessao = loadJson(STORAGE_KEYS.sessao, null);
  if (!sessao?.id) return null;
  return { ...sessao, perfis: normalizarPerfis(sessao.perfis) };
}

export function salvarSessao(usuario) {
  saveJson(STORAGE_KEYS.sessao, usuario);
  localStorage.setItem(STORAGE_KEYS.leader, usuario.nome);
}

export function limparSessao() {
  removeKey(STORAGE_KEYS.sessao);
  removeKey(STORAGE_KEYS.currentUser);
  removeKey(STORAGE_KEYS.leader);
}
