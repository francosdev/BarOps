/**
 * Marcador de campo não preenchido na ficha.
 *
 * A planilha de origem traz vários campos como "EM ABERTO" — método falta em
 * 11 dos 14 coquetéis. Esses campos precisam aparecer como pendência
 * explícita na tela: quem consulta a ficha durante o serviço tem que saber a
 * diferença entre "não tem garnish" e "ninguém preencheu o garnish ainda".
 *
 * Por isso nunca vire string vazia nem sumir da tela.
 */
export const EM_ABERTO = "EM ABERTO";

export function estaEmAberto(valor) {
  // Lista vazia é decisão, não lacuna: o Negroni é pré-batch 100% e não leva
  // nada no serviço. Sem esta guarda, `String([])` viraria "" e o campo seria
  // marcado como pendente.
  if (Array.isArray(valor)) return false;
  return valor === EM_ABERTO || valor === undefined || valor === null || String(valor).trim() === "";
}

/** Lista os campos pendentes de um registro, para a tela mostrar em bloco. */
export function pendenciasDe(registro, campos) {
  return Object.keys(campos)
    .filter((campo) => estaEmAberto(registro[campo]))
    .map((campo) => campos[campo]);
}

export const ROTULOS_COQUETEL = {
  metodo: "Método",
  copo: "Copo",
  garnish: "Garnish",
  servico: "Composição do serviço",
};

export const ROTULOS_PRODUCAO = {
  metodo: "Método",
  conservacao: "Conservação",
};
