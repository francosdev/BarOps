/**
 * Registro de todo insumo que as fichas usam.
 *
 * É a ponte entre a receita e o catálogo PRODUTOS: `nome` tem que casar com o
 * `nome_canonico` do catálogo, e é por ele que se resolve o produto_id. As
 * receitas referenciam `chave`, nunca nome digitado.
 *
 * A conversão de embalagem mora aqui, e não em PRODUTOS, porque é dado de
 * ficha técnica: `volume` é quanto cabe numa unidade de estoque. É isso que
 * transforma 38,19 L de Tanqueray em 51 garrafas de 750 ml.
 *
 * Não confundir com `fator_pack` do catálogo, que é outra dimensão — quantas
 * garrafas vêm numa caixa de compra.
 */
export const INSUMOS = [
  // --- Destilados e garrafas ---------------------------------------------
  { chave: "tanqueray", nome: "Gin Tanqueray", categoria: "Destilados", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 750, embalagemFechada: true },
  { chave: "ketel-one", nome: "Vodka Ketel one", categoria: "Destilados", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 1000, embalagemFechada: true },
  { chave: "ypioca-ouro", nome: "YpiocaOuro", categoria: "Destilados", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 965, embalagemFechada: true },
  { chave: "jack-daniels", nome: "Jack Daniels", categoria: "Destilados", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 1000, embalagemFechada: true },
  { chave: "campari", nome: "Campari", categoria: "Destilados", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 1000, embalagemFechada: true },
  { chave: "martini-rosso", nome: "Martini Vermouth", categoria: "Destilados", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 750, embalagemFechada: true },
  { chave: "aperol", nome: "Aperol", categoria: "Destilados", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 750, embalagemFechada: true },
  { chave: "jagermeister", nome: "Jägermeister", categoria: "Destilados", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 700, embalagemFechada: true },
  { chave: "salton-brut", nome: "Espumante Salton", categoria: "Vinhos e espumantes", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 750, embalagemFechada: true },

  // --- Softs (nunca entram em pré-batch) ----------------------------------
  { chave: "tonica", nome: "Água tônica 1lt", categoria: "Águas e refrigerantes", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 1000, embalagemFechada: true },
  { chave: "ginger-beer", nome: "Ginger Prata", categoria: "Águas e refrigerantes", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 250, embalagemFechada: true },
  { chave: "agua-com-gas", nome: "Agua com gás 510ml", categoria: "Águas e refrigerantes", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 510, embalagemFechada: true },
  { chave: "red-bull", nome: "RedBull tradicional", categoria: "Energéticos", unidadeReceita: "unidade", unidadeEstoque: "lata", volume: 1, embalagemFechada: true },
  { chave: "red-bull-melancia", nome: "RedBull melancia", categoria: "Energéticos", unidadeReceita: "unidade", unidadeEstoque: "lata", volume: 1, embalagemFechada: true },
  { chave: "red-bull-tropical", nome: "RedBull tropical", categoria: "Energéticos", unidadeReceita: "unidade", unidadeEstoque: "lata", volume: 1, embalagemFechada: true },

  // --- Insumos de produção em embalagem -----------------------------------
  { chave: "acucar", nome: "Açúcar", categoria: "Insumos", unidadeReceita: "g", unidadeEstoque: "pacote", volume: 1000, embalagemFechada: true },
  { chave: "mel", nome: "Mel", categoria: "Insumos", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 1000, embalagemFechada: true },
  { chave: "pure-monin", nome: "Purê de framboesa", categoria: "Insumos", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 1000, embalagemFechada: true },
  { chave: "glucose", nome: "Glucose", categoria: "Insumos", unidadeReceita: "ml", unidadeEstoque: "bombona", volume: 5000, embalagemFechada: true },
  { chave: "xarope-caramelo-salgado", nome: "Xarope caramelo salgado", categoria: "Insumos", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 700, embalagemFechada: true },
  { chave: "angostura", nome: "Angostura 100ml", categoria: "Bitters", unidadeReceita: "ml", unidadeEstoque: "garrafa", volume: 100, embalagemFechada: true },

  // --- Granel: comprado por peso, sem embalagem fechada --------------------
  // Não arredonda para cima — a lista de separação sai no peso exato.
  { chave: "gengibre", nome: "Gengibre", categoria: "Insumos", unidadeReceita: "g", unidadeEstoque: "kg", volume: 1000, embalagemFechada: false },
  { chave: "capim-limao", nome: "Capim-limão", categoria: "Insumos", unidadeReceita: "g", unidadeEstoque: "g", volume: 1, embalagemFechada: false },
  { chave: "manjericao", nome: "Manjericão", categoria: "Insumos", unidadeReceita: "g", unidadeEstoque: "g", volume: 1, embalagemFechada: false },
  // Limão é comprado por unidade e rende 45 ml de suco cada. É por isso que
  // as receitas pedem ml de suco e a separação sai em limões inteiros.
  //
  // As duas linhas seguintes são preparos diferentes do MESMO produto de
  // estoque: aparecem com nome próprio na receita, mas `aliasDe` impede que
  // virem um segundo e um terceiro "Limão" no catálogo.
  { chave: "limao", nome: "Limão", categoria: "Insumos", unidadeReceita: "ml", unidadeEstoque: "unidade", volume: 45, embalagemFechada: true },
  { chave: "mix-limao", nome: "Mix de limão (50% siciliano + 50% taiti)", categoria: "Insumos", unidadeReceita: "ml", unidadeEstoque: "unidade", volume: 45, embalagemFechada: true, aliasDe: "limao" },
  { chave: "suco-de-limao", nome: "Suco de limão siciliano", categoria: "Insumos", unidadeReceita: "ml", unidadeEstoque: "unidade", volume: 45, embalagemFechada: true, aliasDe: "limao" },

  // --- Fora do controle de estoque ----------------------------------------
  // Água entra na receita mas não consome estoque, por isso não aparece na
  // lista de insumos base do teste de aceite. Sem esta marcação ela viraria
  // uma linha fantasma na separação.
  { chave: "agua", nome: "Água", categoria: "Insumos", unidadeReceita: "ml", unidadeEstoque: "ml", volume: 1, embalagemFechada: false, semEstoque: true },
];

const PORCHAVE = new Map(INSUMOS.map((insumo) => [insumo.chave, insumo]));

export function insumoPorChave(chave) {
  return PORCHAVE.get(chave) || null;
}

/**
 * Como a embalagem se chama e quanto cabe nela: "garrafa de 1 L", "pacote de
 * 1 kg". É o que a pessoa precisa ler na requisição — "1 pacote" sozinho não
 * diz se é meio quilo ou cinco.
 *
 * Granel e o que se pede por unidade não ganham rótulo: nesses a unidade de
 * estoque já É a medida, e "kg de 1 kg" não ajuda ninguém.
 */
export function embalagemDe(chave) {
  const insumo = insumoPorChave(chave);
  if (!insumo) return "";
  const { unidadeEstoque, unidadeReceita, volume, embalagemFechada } = insumo;
  if (!embalagemFechada || volume <= 1 || unidadeEstoque === "unidade" || unidadeEstoque === unidadeReceita) {
    return unidadeEstoque;
  }
  const medida = unidadeReceita === "ml" && volume >= 1000
    ? `${volume / 1000} L`
    : unidadeReceita === "g" && volume >= 1000
      ? `${volume / 1000} kg`
      : `${volume} ${unidadeReceita}`;
  return `${unidadeEstoque} de ${medida}`;
}

/**
 * Converte a quantidade da receita para unidades de estoque.
 * Embalagem fechada sempre sobe para a unidade inteira seguinte — nunca se
 * pede meia garrafa nem meio pacote.
 */
export function paraUnidadesDeEstoque(chave, qtdReceita) {
  const insumo = insumoPorChave(chave);
  if (!insumo) return null;
  const bruto = qtdReceita / insumo.volume;
  return insumo.embalagemFechada ? Math.ceil(bruto) : Math.round(bruto * 100) / 100;
}
