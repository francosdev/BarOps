/**
 * As seis produções da casa.
 *
 * A receita é guardada CRUA — quantidade de cada insumo mais o rendimento —
 * e nunca o fator já calculado. O fator por litro é derivado em código:
 *
 *     fator = qtd_insumo / rendimento * 1000
 *
 * Assim, corrigir um rendimento aqui corrige a cadeia inteira: sugestão,
 * explosão de insumos e lista de separação. Se o fator estivesse gravado,
 * cada correção exigiria recalcular tudo à mão.
 *
 * Os números abaixo são os dados canônicos do escopo da Fase 4 e reproduzem
 * o teste de aceite integralmente. Método, conservação, observação e perda
 * vieram da ficha técnica entregue em 19/08/2026 (aba Produções), e os 13
 * fatores derivados aqui conferem com os impressos nela.
 */
export const PRODUCOES = [
  {
    id: "prod-xarope-acucar",
    nome: "Xarope de açúcar",
    // rendimento em ml — a unidade de trabalho de toda produção líquida.
    rendimento: 1200,
    insumos: [
      { insumo: "acucar", qtd: 1000, unidade: "g" },
      { insumo: "agua", qtd: 600, unidade: "ml" },
    ],
    validadeDias: 21,
    metodo: "Ferver a água → adicionar o açúcar → mexer até dissolver completamente → desligar o fogo → bater no liquidificador até homogeneizar → resfriar antes de armazenar",
    conservacao: "Refrigerado, recipiente fechado",
    observacao: "Espuma gerada ao bater some naturalmente ao resfriar",
    perda: "",
  },
  {
    id: "prod-xarope-manjericao",
    nome: "Xarope de manjericão",
    rendimento: 6500,
    insumos: [
      // Consome outra produção: é isto que cria a cascata de dois níveis.
      { insumo: "prod-xarope-acucar", qtd: 7000, unidade: "ml" },
      { insumo: "manjericao", qtd: 350, unidade: "g" },
    ],
    validadeDias: 15,
    metodo: "Branquear as folhas em água fervente por 1 minuto → choque em banho de gelo → escorrer → bater com o xarope no liquidificador → filtrar no chinois",
    conservacao: "Refrigerado, recipiente fechado",
    observacao: "",
    perda: "~7,1% (500 ml) no chinois",
  },
  {
    id: "prod-extrato-capim",
    nome: "Extrato de capim-limão",
    rendimento: 1200,
    insumos: [
      { insumo: "capim-limao", qtd: 100, unidade: "g" },
      { insumo: "agua", qtd: 1000, unidade: "ml" },
      { insumo: "glucose", qtd: 200, unidade: "ml" },
    ],
    validadeDias: 3,
    metodo: "Branquear o capim-limão por 1 minuto → choque em banho de gelo → escorrer → bater com a água no liquidificador → filtrar no chinois → incorporar a glucose ao extrato já filtrado e homogeneizar",
    conservacao: "Refrigerado, recipiente fechado",
    observacao: "",
    perda: "",
  },
  {
    id: "prod-extrato-gengibre",
    nome: "Extrato de gengibre",
    rendimento: 700,
    insumos: [
      { insumo: "gengibre", qtd: 2000, unidade: "g" },
      { insumo: "agua", qtd: 500, unidade: "ml" },
    ],
    validadeDias: 7,
    metodo: "Bater 200 g de gengibre com 500 ml de água → filtrar no chinois → espremer o bagaço → usar o extrato como base do próximo ciclo → acrescentar mais 200 g de gengibre fresco e repetir. 10 ciclos para os 2.000 g",
    conservacao: "Refrigerado, recipiente fechado",
    observacao: "200 g por ciclo × 10 ciclos",
    perda: "",
  },
  {
    id: "prod-xarope-framboesa",
    nome: "Xarope de framboesa",
    rendimento: 1900,
    insumos: [
      { insumo: "prod-xarope-acucar", qtd: 1000, unidade: "ml" },
      { insumo: "pure-monin", qtd: 1000, unidade: "ml" },
    ],
    validadeDias: 15,
    metodo: "Bater xarope de açúcar e purê no liquidificador → filtrar em peneira normal",
    conservacao: "Refrigerado, recipiente fechado",
    observacao: "Textura cremosa intencional — peneira normal mantém corpo no xarope",
    perda: "~5% (100 ml) na peneira",
  },
  {
    id: "prod-xarope-mel",
    nome: "Xarope de mel",
    rendimento: 1350,
    insumos: [
      { insumo: "mel", qtd: 1000, unidade: "ml" },
      { insumo: "agua", qtd: 350, unidade: "ml" },
    ],
    validadeDias: 15,
    metodo: "Misturar até homogeneizar — sem cocção e sem filtragem",
    conservacao: "Refrigerado, recipiente fechado",
    observacao: "",
    perda: "Sem perda — não há filtragem",
  },
];

/**
 * Prateleira de serviço: xaropes que o bartender usa direto no serviço, além
 * do que vai para os batches.
 *
 * Este par SOMA à demanda em cascata, nunca desconta dela. Descontar é o erro
 * clássico: derruba o xarope de açúcar de 39,40 L para 23,40 L e a produção
 * da semana sai curta.
 */
export const PAR_SERVICO = {
  "prod-xarope-acucar": 16000,
  "prod-xarope-manjericao": 8000,
};
