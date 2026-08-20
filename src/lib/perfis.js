// Locais do item 2 do escopo. Produção é um local como qualquer outro:
// requisitar insumo para produção usa o mesmo fluxo da requisição de bebida.
export const LOCAIS = [
  { codigo: "GERAL", nome: "Estoque geral" },
  { codigo: "PRINCIPAL", nome: "Bar principal" },
  { codigo: "BAR22", nome: "Bar 22" },
  { codigo: "BAR23", nome: "Bar 23" },
  { codigo: "CHIVAS", nome: "Área Chivas" },
  { codigo: "PRODUCAO", nome: "Área de produção" },
  { codigo: "EVENTO", nome: "Saída para evento" },
];

export const CODIGOS_LOCAIS = LOCAIS.map((local) => local.codigo);

// Ponte entre os setores que o app de contagem já usa e os códigos de local
// do modelo novo. Sem isso a contagem não sabe em qual local escrever.
export const SETOR_PARA_LOCAL = {
  22: "BAR22",
  23: "BAR23",
  Chivas: "CHIVAS",
  Cozinha: "PRODUCAO",
  Estoque: "GERAL",
};

export const TIPOS_MOVIMENTO = [
  "COMPRA",
  "REQUISICAO",
  "PRODUCAO_CONSUMO",
  "PRODUCAO_ENTRADA",
  "CONSUMO",
  "PERDA",
  "AJUSTE",
  "EVENTO",
  "CONTAGEM",
];

// Item 4 do escopo. Um usuário pode acumular perfis.
export const PERFIS = {
  admin: {
    nome: "Admin",
    descricao: "Tudo: ajustes, cadastros, painel e pedido de compra.",
    permissoes: ["contagem", "requisitar", "separar", "receber", "producao", "checklist", "compra", "painel", "cadastros", "historico", "estoque"],
  },
  requisitante: {
    nome: "Requisitante",
    descricao: "Cria requisição e acompanha o status das próprias.",
    permissoes: ["requisitar"],
  },
  separador: {
    nome: "Separador",
    descricao: "Vê requisições pendentes, separa, recusa e ajusta quantidade.",
    permissoes: ["separar"],
  },
  lider_turno: {
    nome: "Líder de turno",
    descricao: "Contagem de abertura e fechamento do seu bar, checklist e recebimento.",
    permissoes: ["contagem", "receber", "checklist"],
  },
  producao: {
    nome: "Produção",
    descricao: "Abre e conclui ordem de produção, consulta ficha técnica.",
    permissoes: ["producao", "checklist"],
  },
  consulta: {
    nome: "Consulta",
    descricao: "Só leitura de fichas técnicas e checklist.",
    permissoes: ["checklist"],
  },
};

export const CODIGOS_PERFIS = Object.keys(PERFIS);

// Perfis do modelo antigo (admin/lider) continuam valendo: um usuário salvo
// no aparelho antes da Fase 1 vira admin ou líder de turno sem recadastro.
export function normalizarPerfis(valor) {
  const lista = Array.isArray(valor) ? valor : String(valor || "").split(",");
  const perfis = lista
    .map((perfil) => String(perfil).trim().toLowerCase())
    .map((perfil) => (perfil === "lider" ? "lider_turno" : perfil))
    .filter((perfil) => CODIGOS_PERFIS.includes(perfil));
  return perfis.length ? [...new Set(perfis)] : ["consulta"];
}

export function permissoesDe(perfis) {
  const conjunto = new Set();
  normalizarPerfis(perfis).forEach((perfil) => {
    (PERFIS[perfil]?.permissoes || []).forEach((permissao) => conjunto.add(permissao));
  });
  return conjunto;
}

export function podeUsuario(usuario, permissao) {
  if (!usuario) return false;
  return permissoesDe(usuario.perfis).has(permissao);
}

export function ehAdmin(usuario) {
  return Boolean(usuario) && normalizarPerfis(usuario.perfis).includes("admin");
}

export function rotuloPerfis(perfis) {
  return normalizarPerfis(perfis).map((perfil) => PERFIS[perfil]?.nome || perfil).join(" · ");
}
