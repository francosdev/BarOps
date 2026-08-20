import { EM_ABERTO } from "./pendencias.js";

/**
 * Os 14 coquetéis da casa. Dados da ficha técnica entregue em 19/08/2026.
 *
 * `batch` é o que vai no galão; `servico` é o que o bartender acrescenta na
 * hora. Limão e carbonatado nunca entram no batch.
 *
 * `preBatch` NÃO significa "tem parte batcheável" — significa "entra na
 * rotação da ordem de produção". Os dois são diferentes, e a ficha mistura:
 *
 *   - Apollo Salted, Golden Jack e Basil Smash aparecem na ficha como
 *     pré-batch, mas o escopo da Fase 4 diz que são montados na hora e que a
 *     planilha está desatualizada nesse ponto. Ficam com a receita completa
 *     registrada e `preBatch: false` — a receita não se perde, mas eles não
 *     entram na OP.
 *   - Old Fashioned tem parte batcheável e é montado na hora por decisão
 *     operacional, como a própria ficha diz.
 *   - O Negroni está na ficha "sem par definido"; o par 16 L vem do escopo.
 *
 * Sempre que a ficha e o escopo divergirem, vale o escopo — ver
 * PLANILHA_DESATUALIZADA.
 */
export const COQUETEIS = [
  // --- Pré-batches ativos, na rotação da OP -------------------------------
  {
    id: "cq-santa-cachaca",
    nome: "Santa Cachaça",
    preBatch: true,
    parLitros: 23,
    batch: [
      { insumo: "ypioca-ouro", ml: 50 },
      { insumo: "prod-xarope-acucar", ml: 20 },
      { insumo: "prod-extrato-gengibre", ml: 10 },
      { insumo: "prod-extrato-capim", ml: 30 },
    ],
    servico: [{ insumo: "mix-limao", ml: 20, obs: "Nunca pré-bater" }],
    metodo: "Batido",
    copo: "Copo baixo grande",
    garnish: "Zest de siciliano + capim-limão",
  },
  {
    id: "cq-afrodite",
    nome: "Afrodite",
    preBatch: true,
    parLitros: 23,
    batch: [
      { insumo: "ketel-one", ml: 50 },
      { insumo: "prod-xarope-framboesa", ml: 25 },
    ],
    servico: [{ insumo: "mix-limao", ml: 20, obs: "Nunca pré-bater" }],
    metodo: "Batido — dupla coagem",
    copo: "Taça de vidro encrustado",
    garnish: "Hortelã + zest de siciliano",
  },
  {
    id: "cq-fitz-gerald",
    nome: "Fitz Gerald",
    preBatch: true,
    parLitros: 23,
    batch: [
      { insumo: "tanqueray", ml: 50 },
      { insumo: "prod-xarope-acucar", ml: 20 },
    ],
    servico: [{ insumo: "suco-de-limao", ml: 25, obs: "Nunca pré-bater" }],
    metodo: "Batido",
    copo: "Copo baixo",
    garnish: "Zest de siciliano",
  },
  {
    id: "cq-ephigenia",
    nome: "Ephigenia",
    preBatch: true,
    parLitros: 23,
    batch: [
      { insumo: "tanqueray", ml: 50 },
      { insumo: "prod-xarope-mel", ml: 20 },
    ],
    servico: [
      { insumo: "suco-de-limao", ml: 20, obs: "Nunca pré-bater" },
      { insumo: "agua-com-gas", ml: 30, obs: "Nunca pré-bater" },
    ],
    metodo: "Batido",
    copo: "Longo",
    garnish: "Zest de siciliano",
  },
  {
    id: "cq-negroni",
    nome: "Negroni",
    preBatch: true,
    // Par vem do escopo da Fase 4; a ficha está "sem par definido".
    parLitros: 16,
    batch: [
      { insumo: "tanqueray", ml: 30 },
      { insumo: "campari", ml: 30 },
      { insumo: "martini-rosso", ml: 30 },
    ],
    // Pré-batch 100%: nada é acrescentado no serviço.
    servico: [],
    metodo: EM_ABERTO,
    copo: EM_ABERTO,
    garnish: EM_ABERTO,
  },

  // --- Têm parte batcheável, mas fora da rotação da OP --------------------
  {
    id: "cq-apollo-salted",
    nome: "Apollo Salted",
    preBatch: false,
    parLitros: 0,
    batch: [
      { insumo: "jack-daniels", ml: 50 },
      { insumo: "xarope-caramelo-salgado", ml: 20 },
    ],
    servico: [
      { insumo: "suco-de-limao", ml: 20, obs: "Nunca pré-bater" },
      { insumo: "agua-com-gas", ml: 30, obs: "Nunca pré-bater" },
    ],
    metodo: "Batido",
    copo: "Longo",
    garnish: "Zest de siciliano",
  },
  {
    id: "cq-golden-jack",
    nome: "Golden Jack",
    preBatch: false,
    parLitros: 0,
    batch: [
      { insumo: "jack-daniels", ml: 50 },
      { insumo: "prod-xarope-mel", ml: 20 },
    ],
    servico: [
      { insumo: "suco-de-limao", ml: 15, obs: "Nunca pré-bater" },
      { insumo: "ginger-beer", ml: 30, obs: "Nunca pré-bater" },
    ],
    metodo: "Batido",
    copo: "Longo",
    garnish: "Zest de siciliano",
  },
  {
    id: "cq-basil-smash",
    // A ficha traz "Basil Smash" na receita e "Brasil Smash" na tabela de
    // conversões. Basil (manjericão) casa com o xarope e o garnish.
    nome: "Basil Smash",
    preBatch: false,
    parLitros: 0,
    batch: [
      { insumo: "tanqueray", ml: 50 },
      { insumo: "prod-xarope-manjericao", ml: 20 },
    ],
    servico: [{ insumo: "suco-de-limao", ml: 25, obs: "Nunca pré-bater" }],
    metodo: "Batido",
    copo: "Baixo",
    garnish: "Manjericão",
  },
  {
    id: "cq-old-fashioned",
    nome: "Old Fashioned",
    preBatch: false,
    parLitros: 0,
    // Tem parte batcheável, mas é montado na hora por decisão operacional.
    batch: [],
    servico: [
      { insumo: "jack-daniels", ml: 60 },
      { insumo: "prod-xarope-acucar", ml: 10 },
      { insumo: "angostura", ml: 4, obs: "4 dashes ≈ 4 ml" },
    ],
    metodo: EM_ABERTO,
    copo: EM_ABERTO,
    garnish: EM_ABERTO,
  },

  // --- Montados na hora com carbonatado -----------------------------------
  // Carbonatado e lata entram no serviço para preservar a carbonatação.
  // Nenhum destes tem parte batcheável.
  {
    id: "cq-aperol-spritz",
    nome: "Aperol Spritz",
    preBatch: false,
    parLitros: 0,
    batch: [],
    servico: [
      { insumo: "aperol", ml: 50 },
      { insumo: "agua-com-gas", ml: 30 },
      { insumo: "salton-brut", ml: 120 },
    ],
    metodo: "Montado",
    copo: "Taça aperol",
    garnish: "Fatia de laranja",
  },
  {
    id: "cq-melancita",
    nome: "Melancita",
    preBatch: false,
    parLitros: 0,
    batch: [],
    servico: [
      { insumo: "tanqueray", ml: 50 },
      { insumo: "red-bull-melancia", ml: 1 },
    ],
    metodo: "Montado",
    copo: "Taça Ephigenia",
    garnish: "Não tem",
  },
  {
    id: "cq-tropical-gin",
    nome: "Tropical Gin",
    preBatch: false,
    parLitros: 0,
    batch: [],
    servico: [
      { insumo: "tanqueray", ml: 50 },
      { insumo: "red-bull-tropical", ml: 1 },
    ],
    metodo: "Montado",
    copo: "Taça Ephigenia",
    garnish: "Fatia de laranja",
  },
  {
    id: "cq-jagerbomb",
    nome: "Jägerbomb",
    preBatch: false,
    parLitros: 0,
    batch: [],
    servico: [
      { insumo: "jagermeister", ml: 50 },
      { insumo: "red-bull", ml: 1 },
    ],
    metodo: "Montado",
    copo: "Copo Jägermeister",
    garnish: "Não tem",
  },
  {
    id: "cq-gin-tonica",
    nome: "Gin Tônica",
    preBatch: false,
    parLitros: 0,
    batch: [],
    servico: [
      { insumo: "tanqueray", ml: 50 },
      { insumo: "tonica", ml: 120 },
    ],
    metodo: "Montado",
    copo: "Taça Ephigenia",
    garnish: "Zest de siciliano",
  },
];

/**
 * Onde a ficha técnica diverge do escopo da Fase 4. O escopo é a fonte da
 * verdade; esta lista existe para a divergência ficar visível em vez de ser
 * silenciosamente resolvida por quem mexer no arquivo depois.
 */
export const PLANILHA_DESATUALIZADA = {
  classificadosErradoComoPreBatch: ["cq-apollo-salted", "cq-golden-jack", "cq-basil-smash"],
  parAusenteNaFicha: { "cq-negroni": 16 },
  nomeDivergente: { "cq-basil-smash": "a tabela de conversões da ficha chama de \"Brasil Smash\"" },
};

/**
 * Insumos que nunca podem entrar num pré-batch.
 *
 * Água, tônica, espumante, Red Bull e ginger beer perdem gás e são
 * adicionados no serviço. Limão oxida. Estas regras valem na validação da
 * ficha e na hora de abrir uma OP.
 */
export const PROIBIDOS_EM_PRE_BATCH = [
  "agua",
  "agua-com-gas",
  "tonica",
  "salton-brut",
  "red-bull",
  "red-bull-melancia",
  "red-bull-tropical",
  "ginger-beer",
  "limao",
  "mix-limao",
  "suco-de-limao",
];

/** Todo gin usado na casa é Tanqueray. */
export const GIN_PADRAO = "tanqueray";

/** Validade de qualquer pré-batch pronto, em dias (1 mês). */
export const VALIDADE_PRE_BATCH_DIAS = 30;

/** Um galão de bancada. Doses por galão saem da parte batcheável. */
export const GALAO_ML = 5000;
