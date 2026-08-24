import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ephigeniaLogo from "./assets/ephigenia.jpg";
import {
  APPS_SCRIPT_TOKEN,
  DEFAULT_INTEGRATION,
  bootstrap,
  consultarSaldos,
  criarRequisicao,
  gravarMovimentos,
  listarRequisicoes,
  separarRequisicao,
  isAppsScriptWebAppUrl,
  listarCatalogo,
  listarMovimentos,
  listarUsuarios,
  loadIntegration,
  salvarCatalogo,
  salvarUsuarios,
} from "./lib/api.js";
import { entrar, carregarSessao, limparSessao, salvarSessao } from "./lib/auth.js";
import { explodirAvulso, explodirCascata, resumoDaCascata } from "./lib/fichas/cascata.js";
import {
  COQUETEIS,
  PRODUCOES,
  batchavelForaDaOP,
  dosesPorGalao,
  ehIntermediaria,
  estaEmAberto,
  fatoresDe,
  insumoPorChave,
  nomeDaReferencia,
  parEmGaloes,
  pendenciasDaProducao,
  pendenciasDoCoquetel,
  preBatches,
  produtosExigidos,
  rendimentoEmGaloes,
  resumoDePendencias,
  servicoTemTotal,
  totalDoBatch,
  totalDoServico,
  validadeDias,
} from "./lib/fichas/index.js";
import { CODIGOS_LOCAIS, CODIGOS_PERFIS, PERFIS, SETOR_PARA_LOCAL, ehAdmin, normalizarPerfis, podeUsuario, rotuloPerfis } from "./lib/perfis.js";
import { STORAGE_KEYS, loadJson, saveJson } from "./lib/storage.js";
import "./styles.css";

const BARS = ["22", "23", "Chivas", "Cozinha", "Estoque"];
const INVENTORY_TYPES = ["Abertura", "Fechamento", "Inventário geral"];
const SHIFTS = ["Dia", "Noite"];
const FRACTIONS = [0, 0.25, 0.3, 0.5, 0.7, 0.75];

const WITHDRAWAL_REASONS = ["Repondo bar", "Produção", "Quebra", "Perda", "Evento", "Consumo Interno", "Outro"];

// O motivo da retirada decide o tipo do movimento e para onde ele vai.
//
// Destino vazio significa que a quantidade sai do sistema: quebra e consumo
// interno não viram estoque em lugar nenhum. Destino null significa que o
// operador escolhe — é o caso da reposição, que é transferência entre locais
// e não saída: a garrafa some do GERAL e aparece no bar.
const MOTIVO_MOVIMENTO = {
  "Repondo bar": { tipo: "REQUISICAO", destino: null },
  "Produção": { tipo: "REQUISICAO", destino: "PRODUCAO" },
  "Quebra": { tipo: "PERDA", destino: "" },
  "Perda": { tipo: "PERDA", destino: "" },
  "Evento": { tipo: "EVENTO", destino: "EVENTO" },
  "Consumo Interno": { tipo: "CONSUMO", destino: "" },
  "Outro": { tipo: "AJUSTE", destino: "" },
};

// Para onde se repõe: os pontos de venda. GERAL é de onde sai, PRODUCAO tem
// motivo próprio e EVENTO também.
const DESTINOS_REPOSICAO = ["PRINCIPAL", "BAR22", "BAR23", "CHIVAS"];

// Religada em 20/08/2026, agora gravando em MOVIMENTOS. A versão antiga
// descontava direto do estoqueAtual do produto — um módulo com estoque
// próprio, que é exatamente o que a Fase 1 veio eliminar.
const WITHDRAWAL_ENABLED = true;

// Fase 2 do escopo (ligada em 20/08/2026): a contagem continua gravando onde
// grava hoje e passa a gravar também em MOVIMENTOS. Cada produto contado vira
// uma linha CONTAGEM (a conferência, fora do saldo) e, quando o contado difere
// do saldo teórico, uma linha AJUSTE — e esse ajuste é a quebra.
const ESPELHAR_MOVIMENTOS = true;

// Correção 2 do item 9: em 19/07 uma Stella Purê Gold foi contada como 43992
// e passou direto. Acima deste múltiplo do último saldo conhecido o app pede
// confirmação — avisa, não bloqueia, porque contagem legítima pode subir.
const FATOR_ALERTA_CONTAGEM = 5;
const PISO_ALERTA_CONTAGEM = 100;

const DEFAULT_USERS = [
  {
    id: "user-admin",
    nome: "Admin",
    pin: "2708",
    perfil: "admin",
    setores: BARS,
    ativo: true,
  },
];

const CATEGORIES = [
  "Cervejas",
  "Águas e refrigerantes",
  "Energéticos",
  "Vodka",
  "Gin",
  "Whisky",
  "Cachaça",
  "Aperitivos e licores",
  "Vinhos e espumantes",
  "Insumos",
  "Bitters",
  "Petiscos e diversos",
  "Copos e taças",
  "Material",
  // Fase 4: saem de uma ordem de produção, não de compra.
  "Produção",
  "Pré-batch",
];

const SETOR_ORIGEM = {
  22: "CONTAGEM",
  23: "CONTAGEM",
  Chivas: "CHIVAS",
  Cozinha: "PARSTOCK",
  Estoque: "ESTOQUE",
};

// Linhas da planilha "NOVA QUARTA 24/06" retiradas do app: repetidas (o
// produto já existe com o nome completo) ou descontinuadas. Os IDs dos
// produtos são posicionais, então as linhas continuam na lista e são
// filtradas depois de gerar os IDs — removê-las da lista deslocaria os IDs
// de todos os produtos seguintes.
const REMOVED_SHEET_PRODUCT_IDS = new Set([
  "sheet-24-06-59", // "Água" → já existe "Água 510ml"
  "sheet-24-06-60", // "Budweiser" → já existe "Cerveja Budweiser"
  "sheet-24-06-61", // "Corona" → já existe "Cerveja Corona"
  "sheet-24-06-62", // "coca cola" → já existe "Refrigerante Coca-Cola"
  "sheet-24-06-63", // "Corona zero" → já existe "Cerveja Corona Zero"
  "sheet-24-06-44", // "Xarope de mel" — descontinuado
  "sheet-24-06-45", // "Purê diluído Framboesa" — descontinuado
  "sheet-24-06-46", // "Xarope Açúcar" — descontinuado
  "sheet-24-06-47", // "Xarope manjericao" — descontinuado
  "sheet-24-06-64", // "tequila" — descontinuado
  "sheet-24-06-65", // "Alec tonic" — descontinuado
  "sheet-24-06-66", // "Martini Rosato" — descontinuado
  "sheet-24-06-67", // "Ramazzoti" — descontinuado
  "sheet-24-06-68", // "Xarope Gengibre" — descontinuado
  "sheet-24-06-69", // "xarope toranja" — descontinuado
  "sheet-24-06-70", // "Xarope Cranberry" — descontinuado
  "sheet-24-06-71", // "xarope grenade" — descontinuado
]);

const OFFICIAL_SHEET_PRODUCTS = [
  ["Açúcar", 50, ""],
  ["Água 510ml", 2087, "AMBEV"],
  ["Agua com gás 510ml", 938, "AMBEV"],
  ["Água de coco 200ml", 0, "AMBEV"],
  ["Agua tônica 350ml", 197, "AMBEV"],
  ["água tônica sem açúcar", 80, ""],
  ["Água tônica 1lt", 40, "AMBEV"],
  ["Angostura 100ml", 36, "FG7"],
  ["Aperol", 60, "FG7"],
  ["Absolut Tabasco", 0, "FG7"],
  ["YpiocaOuro", 53, "FG7"],
  ["Campari", 48, ""],
  ["Cerveja Becks", 1272, "AMBEV"],
  ["Cerveja Budweiser", 720, "AMBEV"],
  ["Cerveja Corona", 2160, "AMBEV"],
  ["Cerveja Corona Zero", 720, "AMBEV"],
  ["Cerveja Stella Purê Gold", 2160, "AMBEV"],
  ["Espumante Salton", 120, "FRONT"],
  ["Espumante Chandon", 30, "FRONT"],
  ["Veuve Clicquot", 2, "FRONT"],
  ["Gin Gordons", 156, "FRONT"],
  ["Gin Tanqueray", 180, "FRONT"],
  ["Ginger Prata", 72, "FRONT"],
  ["Jägermeister", 60, "FRONT"],
  ["Martini Vermouth", 48, "FRONT"],
  ["Mel", 27, ""],
  ["Purê de framboesa", 60, ""],
  ["RedBull tradicional", 840, ""],
  ["RedBull melancia", 480, ""],
  ["RedBull Zero", 480, ""],
  ["RedBull tropical", 600, ""],
  ["Refrigerante Coca-Cola", 180, ""],
  ["Refrigerante Coca-Cola zero", 96, ""],
  ["Refrigerante Guaraná Antártica", 120, ""],
  ["Ypioca Prata", 0, ""],
  ["Vinho Garcia rose", 0, ""],
  ["Vinho Garcia tinto", 0, ""],
  ["Vinho Garcia verde", 0, ""],
  ["Vodka Ketel one", 108, ""],
  ["Vodka Smirnoff", 108, ""],
  ["Whisky Black Label", 60, ""],
  ["Jack Daniels", 84, ""],
  ["Xarope caramelo salgado", 60, ""],
  ["Xarope de mel", 0, ""],
  ["Purê diluído Framboesa", 0, ""],
  ["Xarope Açúcar", 0, ""],
  ["Xarope manjericao", 0, ""],
  ["Copo alto (long drink)", 0, ""],
  ["Copo baixo (whisky)", 0, ""],
  ["Copo Jagermeister (shot)", 0, ""],
  ["Taça 215ml (vinho pequena)", 0, ""],
  ["Taça 260ml (vinho média)", 0, ""],
  ["Taça 360ml (vinho grande)", 0, ""],
  ["Taça Gin Acrilico (balão)", 0, ""],
  ["Taça aperol acrílica (balão)", 0, ""],
  ["Taça espumante vidro (flute)", 0, ""],
  ["Copo jagger Bomb (dose dupla)", 0, ""],
  ["Copo Ephigênia Bio (reutilizável)", 0, ""],
  ["Água", 0, ""],
  ["Budweiser", 0, ""],
  ["Corona", 0, ""],
  ["coca cola", 0, ""],
  ["Corona zero", 0, ""],
  ["tequila", 0, ""],
  ["Alec tonic", 0, ""],
  ["Martini Rosato", 0, ""],
  ["Ramazzoti", 0, ""],
  ["Xarope Gengibre", 0, ""],
  ["xarope toranja", 0, ""],
  ["Xarope Cranberry", 0, ""],
  ["xarope grenade", 0, ""],
].map(([nome, parStock, fornecedor], index) => ({
  id: `sheet-24-06-${index + 1}`,
  nome,
  categoria: inferProductCategory(nome),
  tipoContagem: inferCountType(nome),
  unidade: inferUnit(nome),
  setores: BARS,
  origemPlanilha: "NOVA QUARTA 24/06",
  fornecedor,
  parStock,
  ativo: true,
})).filter((product) => !REMOVED_SHEET_PRODUCT_IDS.has(product.id));

const PARSTOCK_PRODUCTS = [
  ["Gin Tanqueray", "Gin", "garrafa", "garrafas", 37.3],
  ["Gin Gordons", "Gin", "garrafa", "garrafas", 21.4],
  ["Ketel One Vodka", "Vodka", "garrafa", "garrafas", 16.0],
  ["Jack Daniel's", "Whisky", "garrafa", "garrafas", 15.5],
  ["Jägermeister", "Aperitivos e licores", "garrafa", "garrafas", 10.2],
  ["Ypioca Ouro", "Cachaça", "garrafa", "garrafas", 8.9],
  ["Smirnoff Vodka", "Vodka", "garrafa", "garrafas", 8.0],
  ["Black Label", "Whisky", "garrafa", "garrafas", 3.0],
  ["Aperol", "Aperitivos e licores", "garrafa", "garrafas", 14.4],
  ["Campari", "Aperitivos e licores", "garrafa", "garrafas", 3.1],
  ["Martini Rosso", "Aperitivos e licores", "garrafa", "garrafas", 2.9],
  ["Espumante", "Vinhos e espumantes", "garrafa", "garrafas", 34.5],
  ["Casal Garcia Rosé", "Vinhos e espumantes", "garrafa", "garrafas", 6.3],
  ["Casal Garcia Branco", "Vinhos e espumantes", "garrafa", "garrafas", 4.0],
  ["Casal Garcia Tinto", "Vinhos e espumantes", "garrafa", "garrafas", 2.5],
  ["Casal Garcia (garrafa)", "Vinhos e espumantes", "garrafa", "garrafas", 1.9],
  ["Salton (garrafa)", "Vinhos e espumantes", "garrafa", "garrafas", 0.5],
  ["Champanhe (taça)", "Vinhos e espumantes", "garrafa", "garrafas", 0.2],
  ["Corona", "Cervejas", "unidade", "long neck", 1201.6],
  ["Stella Pure Gold", "Cervejas", "unidade", "long neck", 1092.8],
  ["Budweiser", "Cervejas", "unidade", "long neck", 376.2],
  ["Corona Cero", "Cervejas", "unidade", "long neck", 49.4],
  ["Red Bull", "Energéticos", "unidade", "latas", 486.8],
  ["Red Bull Tropical", "Energéticos", "unidade", "latas", 203.9],
  ["Red Bull Melancia", "Energéticos", "unidade", "latas", 141.8],
  ["Red Bull sem açúcar", "Energéticos", "unidade", "latas", 30.0],
  ["Água com gás", "Águas e refrigerantes", "unidade", "garrafas", 89.8],
  ["Água tônica", "Águas e refrigerantes", "unidade", "garrafas", 34.8],
  ["Ginger beer", "Águas e refrigerantes", "unidade", "garrafas", 0.7],
  ["Água Natural", "Águas e refrigerantes", "unidade", "garrafas", 918.2],
  ["Coca-Cola", "Águas e refrigerantes", "unidade", "latas", 76.0],
  ["Coca Zero", "Águas e refrigerantes", "unidade", "latas", 63.0],
  ["Guaraná Antártica", "Águas e refrigerantes", "unidade", "latas", 38.1],
  ["Pirulito Coração", "Petiscos e diversos", "unidade", "unidades", 37.9],
  ["Trident", "Petiscos e diversos", "unidade", "unidades", 25.2],
  ["Cigarro", "Petiscos e diversos", "unidade", "unidades", 18.2],
  ["Torcida", "Petiscos e diversos", "unidade", "unidades", 10.8],
  ["Halls/Freegells", "Petiscos e diversos", "unidade", "unidades", 8.8],
  ["Elmas Chips Ovinhos", "Petiscos e diversos", "unidade", "unidades", 7.6],
  ["Ruffles Batata Frita", "Petiscos e diversos", "unidade", "unidades", 6.7],
  ["Paçoca Tradicional", "Petiscos e diversos", "unidade", "unidades", 4.2],
  ["Mentos", "Petiscos e diversos", "unidade", "unidades", 2.5],
  ["Doritos", "Petiscos e diversos", "unidade", "unidades", 0.5],
  ["Amendoim", "Petiscos e diversos", "unidade", "unidades", 0.2],
  ["Angostura", "Bitters", "garrafa", "garrafa", 0.7],
].map(([nome, categoria, tipoContagem, unidade, consumoSemanal], index) => ({
  id: `par-${index + 1}`,
  nome,
  categoria,
  tipoContagem,
  unidade,
  setores: BARS,
  origemPlanilha: "PARSTOCK",
  fornecedor: "",
  consumoSemanal,
  parStock: Math.ceil(consumoSemanal * 1.25),
  ativo: true,
}));

const REQUIRED_CUPS = [
  "Copo longo",
  "Copo baixo",
  "Shot",
  "Taça acrilica gin",
  "Taça afrodite",
  "Taça vinho",
  "Taça aperol",
  "Copo descartavel plastico",
  "Copo bio",
].map((nome, index) => ({
  id: `cup-${index + 1}`,
  nome,
  categoria: "Copos e taças",
  tipoContagem: "unidade",
  unidade: "un",
  setores: BARS,
  origemPlanilha: "LISTA_COPOS",
  fornecedor: "",
  parStock: 0,
  ativo: true,
}));

const PRICE_PRESETS = {
  "corona": [168, 24],
  "corona cero": [168, 24],
  "stella pure gold": [144, 24],
  "budweiser": [120, 24],
  "red bull": [192, 24],
  "red bull tropical": [192, 24],
  "red bull melancia": [192, 24],
  "red bull sem açúcar": [192, 24],
  "água natural": [24, 12],
  "água com gás": [36, 12],
  "água tônica": [60, 12],
  "ginger beer": [72, 12],
  "ginger prata": [72, 12],
  "coca-cola": [54, 12],
  "coca zero": [54, 12],
  "guaraná antártica": [48, 12],
  // Caixas de gin/vodka/whisky/campari/martini têm 12 unidades; o valor da
  // caixa foi dobrado em relação ao antigo preset de 6 para manter o preço
  // unitário (confirme os valores reais de compra na tela de Produtos).
  "gin tanqueray": [1140, 12],
  "gin gordons": [780, 12],
  "ketel one vodka": [1140, 12],
  "smirnoff vodka": [456, 12],
  "jack daniel's": [1440, 12],
  "black label": [1440, 12],
  "aperol": [420, 6],
  "campari": [780, 12],
  "jägermeister": [570, 6],
  "martini rosso": [660, 12],
  "espumante": [270, 6],
  "casal garcia rosé": [330, 6],
  "casal garcia branco": [330, 6],
  "casal garcia tinto": [330, 6],
  "salton (garrafa)": [210, 6],
};

const catalogSeed = [
  ["Açúcar", "Insumos", "unidade", "kg", ["22", "23", "Chivas", "Cozinha", "Estoque"], "PARSTOCK", "", 15],
  ["Água 510ml", "Águas e refrigerantes", "unidade", "un", ["22", "23"], "CONTAGEM", "AMBEV", 250],
  ["Água 500ml", "Águas e refrigerantes", "unidade", "un", ["Chivas", "Estoque"], "CHIVAS", "AMBEV", 160],
  ["Água com gás 510ml", "Águas e refrigerantes", "unidade", "un", ["22", "23"], "CONTAGEM", "AMBEV", 90],
  ["Água com gás 500ml", "Águas e refrigerantes", "unidade", "un", ["Chivas", "Estoque"], "CHIVAS", "AMBEV", 80],
  ["Água com gás 1,5lt", "Águas e refrigerantes", "unidade", "un", ["Chivas", "Estoque"], "CHIVAS", "AMBEV", 35],
  ["Água de coco 200ml", "Águas e refrigerantes", "unidade", "un", ["22", "23"], "CONTAGEM", "AMBEV", 24],
  ["Água tônica 350ml", "Águas e refrigerantes", "unidade", "un", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "AMBEV", 90],
  ["Água tônica 1lt", "Águas e refrigerantes", "unidade", "un", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "AMBEV", 45],
  ["Refrigerante Coca-Cola", "Águas e refrigerantes", "unidade", "un", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "AMBEV", 80],
  ["Refrigerante Coca-Cola zero", "Águas e refrigerantes", "unidade", "un", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "AMBEV", 60],
  ["Refrigerante Guaraná Antártica", "Águas e refrigerantes", "unidade", "un", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "AMBEV", 50],
  ["RedBull tradicional", "Energéticos", "unidade", "lata", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "", 90],
  ["RedBull melancia", "Energéticos", "unidade", "lata", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "", 45],
  ["RedBull tropical", "Energéticos", "unidade", "lata", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "", 45],
  ["RedBull Zero", "Energéticos", "unidade", "lata", ["22", "23", "Chivas"], "CONTAGEM", "", 30],
  ["Cerveja Becks", "Cervejas", "unidade", "un", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "AMBEV", 400],
  ["Cerveja Budweiser", "Cervejas", "unidade", "un", ["22", "23"], "CONTAGEM", "AMBEV", 500],
  ["Cerveja Budweiser Zero", "Cervejas", "unidade", "un", ["22", "23", "Chivas"], "CONTAGEM", "AMBEV", 40],
  ["Cerveja Corona", "Cervejas", "unidade", "un", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "AMBEV", 350],
  ["Cerveja Corona Zero", "Cervejas", "unidade", "un", ["22", "23", "Chivas"], "CONTAGEM", "AMBEV", 35],
  ["Cerveja Stella", "Cervejas", "unidade", "un", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "AMBEV", 250],
  ["Cerveja Stella Purê Gold", "Cervejas", "unidade", "un", ["22", "23"], "CONTAGEM", "AMBEV", 60],
  ["Cerveja Goose Island IPA", "Cervejas", "unidade", "un", ["Chivas", "Estoque"], "CHIVAS", "AMBEV", 50],
  ["Cerveja Goose Island Midway", "Cervejas", "unidade", "un", ["Chivas", "Estoque"], "CHIVAS", "AMBEV", 50],
  ["Gin Gordons", "Destilados", "garrafa", "garrafas", ["22", "23"], "CONTAGEM", "FG7", 27],
  ["Gin Tanqueray", "Destilados", "garrafa", "garrafas", ["22", "23"], "CONTAGEM", "FG7", 47],
  ["Gin Beefeater", "Destilados", "garrafa", "garrafas", ["Chivas", "Estoque"], "CHIVAS", "FG7", 18],
  ["Gin Vitoria Regia", "Destilados", "garrafa", "garrafas", ["Chivas", "Estoque"], "CHIVAS", "FG7", 12],
  ["Vodka Ketel one", "Destilados", "garrafa", "garrafas", ["22", "23"], "CONTAGEM", "FG7", 20],
  ["Vodka Smirnoff", "Destilados", "garrafa", "garrafas", ["22", "23"], "CONTAGEM", "FG7", 10],
  ["Vodka Absolut", "Destilados", "garrafa", "garrafas", ["Chivas"], "CHIVAS", "FG7", 10],
  ["Jack Daniels", "Destilados", "garrafa", "garrafas", ["22", "23", "Cozinha"], "CONTAGEM", "FG7", 20],
  ["Whisky Black Label", "Destilados", "garrafa", "garrafas", ["22", "23"], "CONTAGEM", "FG7", 4],
  ["Whisky Chivas 12", "Destilados", "garrafa", "garrafas", ["Chivas", "Estoque"], "CHIVAS", "FG7", 12],
  ["Whisky Chivas 13", "Destilados", "garrafa", "garrafas", ["Chivas", "Estoque"], "CHIVAS", "FG7", 8],
  ["Whisky Chivas 15", "Destilados", "garrafa", "garrafas", ["Chivas", "Estoque"], "CHIVAS", "FG7", 6],
  ["Whisky Chivas 18", "Destilados", "garrafa", "garrafas", ["Chivas", "Estoque"], "CHIVAS", "FG7", 4],
  ["Whisky Ballantines", "Destilados", "garrafa", "garrafas", ["Chivas"], "CHIVAS", "FG7", 6],
  ["Aperol", "Destilados", "garrafa", "garrafas", ["22", "23", "Chivas", "Cozinha", "Estoque"], "CONTAGEM", "FG7", 18],
  ["Campari", "Destilados", "garrafa", "garrafas", ["22", "23", "Chivas", "Cozinha", "Estoque"], "CONTAGEM", "FG7", 4],
  ["Jägermeister", "Destilados", "garrafa", "garrafas", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "FG7", 13],
  ["Ypioca Ouro", "Destilados", "garrafa", "garrafas", ["22", "23", "Cozinha"], "PARSTOCK", "FG7", 12],
  ["Ypioca Prata", "Destilados", "garrafa", "garrafas", ["22", "23"], "CONTAGEM", "FG7", 8],
  ["Sagatiba", "Destilados", "garrafa", "garrafas", ["Chivas", "Estoque"], "CHIVAS", "FG7", 8],
  ["Martini Vermouth", "Destilados", "garrafa", "garrafas", ["22", "23", "Chivas"], "CONTAGEM", "FG7", 4],
  ["Angostura 100ml", "Insumos", "garrafa", "garrafas", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "FG7", 3],
  ["Angostura 200ml", "Insumos", "garrafa", "garrafas", ["Chivas", "Estoque"], "CHIVAS", "FG7", 2],
  ["Espumante Salton", "Vinhos e espumantes", "garrafa", "garrafas", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "", 44],
  ["Espumante Chandon", "Vinhos e espumantes", "garrafa", "garrafas", ["22", "23", "Chivas"], "CONTAGEM", "", 12],
  ["Espumante Chandon baby", "Vinhos e espumantes", "garrafa", "garrafas", ["Chivas"], "CHIVAS", "", 8],
  ["Veuve Clicquot", "Vinhos e espumantes", "garrafa", "garrafas", ["22", "23"], "CONTAGEM", "", 4],
  ["Vinho Garcia rose", "Vinhos e espumantes", "garrafa", "garrafas", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "", 8],
  ["Vinho Garcia tinto", "Vinhos e espumantes", "garrafa", "garrafas", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "", 8],
  ["Vinho Garcia verde", "Vinhos e espumantes", "garrafa", "garrafas", ["22", "23", "Chivas", "Estoque"], "CONTAGEM", "", 8],
  ["Gelo", "Insumos", "unidade", "sacos", ["Chivas", "Cozinha", "Estoque"], "CHIVAS", "", 40],
  ["Ginger Prata", "Águas e refrigerantes", "unidade", "un", ["22", "23", "Chivas"], "CONTAGEM", "", 30],
  ["Mel", "Insumos", "unidade", "kg", ["22", "23", "Chivas", "Cozinha"], "CONTAGEM", "", 6],
  ["Purê de framboesa", "Insumos", "unidade", "un", ["22", "23", "Chivas", "Cozinha"], "CONTAGEM", "", 8],
  ["Xarope simples", "Insumos", "unidade", "litros", ["Cozinha"], "PARSTOCK", "", 12],
  ["Xarope de mel", "Insumos", "unidade", "litros", ["Cozinha"], "PARSTOCK", "", 8],
  ["Xarope caramelo salgado", "Insumos", "unidade", "litros", ["Cozinha"], "PARSTOCK", "", 8],
  ["Suco de limão", "Insumos", "unidade", "litros", ["Cozinha"], "PARSTOCK", "", 18],
  ["Limão", "Insumos", "unidade", "kg", ["Cozinha"], "PARSTOCK", "", 25],
  ["Laranja", "Insumos", "unidade", "kg", ["Cozinha"], "PARSTOCK", "", 18],
  ["Hortelã", "Insumos", "unidade", "maços", ["Cozinha"], "PARSTOCK", "", 12],
  ["Manjericão", "Insumos", "unidade", "maços", ["Cozinha"], "PARSTOCK", "", 8],
  ["Copo Absolut", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 50],
  ["Copo alto", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 120],
  ["Copo baixo", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 120],
  ["Copo Jagermeister", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 40],
  ["Taça 195ml", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 80],
  ["Taça 300ml", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 80],
  ["Taça coupe", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 40],
  ["Taça espumante", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 60],
  ["Taça gin acrilico Beefeater", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 60],
  ["Taça gin vidro", "Copos e taças", "unidade", "un", ["Estoque"], "ESTOQUE", "", 60],
  ["Bico dosador plástico", "Material", "unidade", "un", ["Estoque"], "MATERIAL", "", 20],
  ["Bico dosador inox", "Material", "unidade", "un", ["Estoque"], "MATERIAL", "", 20],
  ["Peneiras Inox", "Material", "unidade", "un", ["Estoque"], "MATERIAL", "", 6],
  ["Pegador de Gelo", "Material", "unidade", "un", ["Estoque"], "MATERIAL", "", 8],
  ["Coqueteleira Boston 820ml inox", "Material", "unidade", "un", ["Estoque"], "MATERIAL", "", 10],
  ["Abridor de Garrafa", "Material", "unidade", "un", ["Estoque"], "MATERIAL", "", 15],
].map(([nome, categoria, tipoContagem, unidade, setores, origemPlanilha, fornecedor, parStock], index) => ({
  id: `prod-${index + 1}`,
  nome,
  categoria,
  tipoContagem,
  unidade,
  setores,
  origemPlanilha,
  fornecedor,
  parStock,
  ativo: true,
}));

function normalizeUser(user, index = 0) {
  return {
    id: user.id || uid("user"),
    nome: user.nome || `Usuário ${index + 1}`,
    pin: String(user.pin || ""),
    perfil: user.perfil === "admin" ? "admin" : "lider",
    setores: Array.isArray(user.setores) && user.setores.length ? user.setores : BARS,
    ativo: user.ativo !== false,
  };
}

function loadUsers() {
  const stored = loadJson(STORAGE_KEYS.users, []);
  const users = Array.isArray(stored) ? stored.map(normalizeUser) : [];
  // O PIN padrão do Admin mudou de 1234 para 2708; dispositivos que ainda
  // guardam o PIN antigo de fábrica acompanham a troca. Um PIN alterado
  // manualmente (diferente de 1234) é preservado.
  const migrated = users.map((user) => (
    user.id === "user-admin" && user.pin === "1234" ? { ...user, pin: "2708" } : user
  ));
  const hasAdmin = migrated.some((user) => user.perfil === "admin");
  return hasAdmin ? migrated : [...DEFAULT_USERS, ...migrated];
}

function loadCurrentUser(users) {
  const stored = loadJson(STORAGE_KEYS.currentUser, null);
  if (stored?.id) {
    const user = users.find((item) => item.id === stored.id && item.ativo);
    if (user) return user;
  }
  return null;
}

// Quem já estava logado no esquema antigo (nome + PIN local) continua logado:
// a sessão nova é montada a partir do usuário local que estava salvo.
function loadSession(users) {
  const sessao = carregarSessao();
  if (sessao) return sessao;
  const antigo = loadCurrentUser(users);
  if (!antigo) return null;
  return {
    id: antigo.id,
    nome: antigo.nome,
    login: String(antigo.nome || "").trim().toLowerCase(),
    perfis: normalizarPerfis(antigo.perfil),
    setores: antigo.setores,
    origem: "local",
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function numberValue(value) {
  const numeric = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundCount(value) {
  return Number(numberValue(value).toFixed(2));
}

function defaultUnitsPerPack(item) {
  const unit = String(item.unidade || "").toLowerCase();
  const name = String(item.nome || "").toLowerCase();
  const category = getOperationalCategory(item);
  if (numberValue(item.unidadesPorFardo)) return numberValue(item.unidadesPorFardo);
  if (name === "açúcar" || name === "acucar") return 10;
  if (name === "mel") return 9;
  if (name.includes("framboesa")) return 4;
  if (name.includes("xarope")) return 6;
  if (name.includes("campari")) return 12;
  if (name.includes("martini") || name.includes("vermouth") || name.includes("vermuth") || name.includes("vermute")) return 12;
  if (category === "Bitters") return 12;
  if (category === "Vinhos e espumantes") return 6;
  if (["Gin", "Vodka", "Whisky"].includes(category)) return 12;
  if (["Cachaça", "Aperitivos e licores"].includes(category)) return 6;
  if (unit.includes("garrafa") && item.tipoContagem === "garrafa") return 6;
  if (unit.includes("lata")) return 24;
  if (unit.includes("long neck")) return 24;
  if (name.includes("red bull")) return 24;
  if (name.includes("cerveja") || name.includes("corona") || name.includes("stella") || name.includes("budweiser")) return 24;
  if (name.includes("coca") || name.includes("guaraná") || name.includes("guarana")) return 12;
  if (name.includes("água") || name.includes("agua") || name.includes("tônica") || name.includes("tonica") || name.includes("ginger")) return 12;
  return 1;
}

// Softs (cervejas, águas/refrigerantes, energéticos) e açúcar chegam em
// fardos; bebidas de garrafa e demais insumos chegam em caixas.
function packLabel(item) {
  const category = getOperationalCategory(item);
  if (["Cervejas", "Águas e refrigerantes", "Energéticos"].includes(category)) return "fardo";
  const name = String(item.nome || "").trim().toLowerCase();
  if (name === "açúcar" || name === "acucar") return "fardo";
  return "caixa";
}

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function normalizeProduct(product, index = 0) {
  const preset = PRICE_PRESETS[String(product.nome || "").toLowerCase()];
  const valorFardo = numberValue(product.valorFardo) || numberValue(preset?.[0]);
  const baseProduct = { ...product, unidadesPorFardo: numberValue(product.unidadesPorFardo) || numberValue(preset?.[1]) };
  const unidadesPorFardo = numberValue(baseProduct.unidadesPorFardo) || defaultUnitsPerPack(baseProduct);
  const valorUnitario = numberValue(product.valorUnitario) || (valorFardo && unidadesPorFardo ? roundCount(valorFardo / unidadesPorFardo) : 0);
  return {
    id: product.id || uid("prod"),
    nome: product.nome || product.name || `Produto ${index + 1}`,
    categoria: product.categoria || "Insumos",
    tipoContagem: product.tipoContagem === "garrafa" ? "garrafa" : "unidade",
    unidade: product.unidade || (product.tipoContagem === "garrafa" ? "garrafas" : "un"),
    setores: Array.isArray(product.setores) && product.setores.length ? product.setores : BARS,
    origemPlanilha: product.origemPlanilha || "MVP",
    fornecedor: product.fornecedor || "",
    parStock: numberValue(product.parStock),
    valorUnitario,
    valorFardo,
    unidadesPorFardo,
    estoqueAtual: numberValue(product.estoqueAtual),
    editadoManualmente: Boolean(product.editadoManualmente),
    // Fase 4: batch e xarope saem de uma OP, não de compra. Quando o produto
    // não declara, o catálogo infere pela categoria na hora de exportar.
    produzido: Boolean(product.produzido),
    requisitavel: product.requisitavel,
    ativo: product.ativo !== false,
  };
}

/**
 * Produtos que as fichas técnicas exigem e que ainda não existem no catálogo:
 * os insumos de produção, as 6 produções e os 5 pré-batches.
 *
 * O casamento é por nome normalizado, para não criar um segundo "Gengibre"
 * quando já houver um cadastrado com outro id. Ficam no setor Cozinha, que é
 * o que SETOR_PARA_LOCAL mapeia para PRODUCAO — é por ali que a contagem da
 * área de produção alimenta o saldo que a OP vai conferir.
 */
function fichaProductSeeds(existentes) {
  const nomes = new Set(existentes.map((product) => normalizeMatchName(product.nome)));
  return produtosExigidos()
    .filter((exigido) => !nomes.has(normalizeMatchName(exigido.nome)))
    .map((exigido) => normalizeProduct({
      id: `ficha-${exigido.chave}`,
      nome: exigido.nome,
      categoria: exigido.categoria,
      tipoContagem: "unidade",
      unidade: exigido.unidade,
      setores: ["Cozinha"],
      origemPlanilha: "FICHA_TECNICA",
      fornecedor: "",
      parStock: exigido.minimo || 0,
      produzido: exigido.produzido,
      requisitavel: exigido.requisitavel,
      ativo: true,
    }));
}

function loadProducts() {
  const oficiais = OFFICIAL_SHEET_PRODUCTS.map(normalizeProduct);
  const seeds = [...oficiais, ...fichaProductSeeds(oficiais)];
  const stored = loadJson(STORAGE_KEYS.products, null);
  if (!stored || !Array.isArray(stored) || !stored.length) return seeds;
  const seedsById = new Map(seeds.map((product) => [product.id, product]));
  const storedIds = new Set();
  const products = stored
    .map(normalizeProduct)
    // Descarta produtos removidos do catálogo já salvos em dispositivos,
    // exceto se o usuário os editou manualmente (aí a remoção fica a critério dele).
    .filter((product) => !REMOVED_SHEET_PRODUCT_IDS.has(product.id) || product.editadoManualmente)
    .map((product) => {
    storedIds.add(product.id);
    const seed = seedsById.get(product.id);
    if (!seed || product.editadoManualmente) return product;
    // Produtos do catálogo oficial nunca editados pelo usuário acompanham
    // correções de nome/categoria e de embalagem/preço do catálogo; o
    // restante (estoque, ativo) é sempre o que o usuário salvou.
    return {
      ...product,
      nome: seed.nome,
      categoria: seed.categoria,
      tipoContagem: seed.tipoContagem,
      unidade: seed.unidade,
      valorUnitario: seed.valorUnitario,
      valorFardo: seed.valorFardo,
      unidadesPorFardo: seed.unidadesPorFardo,
    };
  });
  const newSeeds = seeds.filter((seed) => !storedIds.has(seed.id));
  return [...products, ...newSeeds];
}

function isProductForBar(product, bar) {
  return product.ativo && product.setores.includes(bar);
}

function inferProductCategory(nome) {
  const name = String(nome || "").toLowerCase();
  if (name.includes("copo") || name.includes("taça") || name.includes("taca")) return "Copos e taças";
  if (name.includes("cerveja") || name.includes("budweiser") || name.includes("corona") || name.includes("becks") || name.includes("stella")) return "Cervejas";
  if (name.includes("redbull") || name.includes("red bull")) return "Energéticos";
  if (name.includes("vodka") || name.includes("ketel") || name.includes("absolut")) return "Vodka";
  if (name.includes("ginger")) return "Águas e refrigerantes";
  if (name.includes("gin")) return "Gin";
  if (name.includes("whisky") || name.includes("jack") || name.includes("black label")) return "Whisky";
  if (name.includes("ypioca") || name.includes("tequila")) return "Cachaça";
  if (name.includes("aperol") || name.includes("campari") || name.includes("jäger") || name.includes("jager") || name.includes("martini") || name.includes("ramazzoti")) return "Aperitivos e licores";
  if (name.includes("espumante") || name.includes("veuve") || name.includes("vinho")) return "Vinhos e espumantes";
  if (name.includes("angostura")) return "Bitters";
  if (name.includes("água") || name.includes("agua") || name.includes("refrigerante") || name.includes("coca") || name.includes("guaraná") || name.includes("guarana") || name.includes("ginger") || name.includes("tonic") || name.includes("tônica") || name.includes("tonica")) return "Águas e refrigerantes";
  return "Insumos";
}

function inferCountType(nome) {
  const category = inferProductCategory(nome);
  return ["Gin", "Vodka", "Whisky", "Cachaça", "Aperitivos e licores", "Vinhos e espumantes", "Bitters"].includes(category) ? "garrafa" : "unidade";
}

function inferUnit(nome) {
  const category = inferProductCategory(nome);
  if (category === "Cervejas") return "un";
  if (category === "Energéticos") return "lata";
  if (["Águas e refrigerantes", "Copos e taças", "Insumos"].includes(category)) return "un";
  return "garrafas";
}

function getOperationalCategory(item) {
  // A categoria cadastrada no produto prevalece; a inferência por nome só
  // cobre dados antigos com categorias fora da lista oficial.
  if (CATEGORIES.includes(item.categoria)) return item.categoria;
  const name = item.nome.toLowerCase();
  if (name.includes("cerveja") || name.includes("corona") || name.includes("stella") || name.includes("budweiser")) return "Cervejas";
  if (name.includes("vodka") || name.includes("ketel") || name.includes("smirnoff") || name.includes("absolut")) return "Vodka";
  if (name.includes("ginger")) return "Águas e refrigerantes";
  if (name.includes("gin")) return "Gin";
  if (name.includes("whisky") || name.includes("jack") || name.includes("chivas") || name.includes("black label") || name.includes("ballantines")) return "Whisky";
  if (name.includes("ypioca") || name.includes("sagatiba")) return "Cachaça";
  if (name.includes("aperol") || name.includes("campari") || name.includes("jäger") || name.includes("jager") || name.includes("martini")) return "Aperitivos e licores";
  if (name.includes("espumante") || name.includes("veuve") || name.includes("vinho")) return "Vinhos e espumantes";
  if (name.includes("redbull") || name.includes("red bull")) return "Energéticos";
  if (name.includes("água") || name.includes("agua") || name.includes("refrigerante") || name.includes("coca") || name.includes("guaraná") || name.includes("guarana") || name.includes("ginger")) return "Águas e refrigerantes";
  if (name.includes("copo") || name.includes("taça") || name.includes("taca")) return "Copos e taças";
  if (item.categoria === "Material") return "Material";
  return "Insumos";
}

// Correções 2 e 3 do item 9: sinaliza a contagem que provavelmente é erro de
// digitação. Só avisa — contagem legítima pode subir de verdade, e travar o
// envio no meio da operação é pior que uma linha errada na planilha.
function contagemSuspeita(item) {
  const quantidade = numberValue(item.quantidade);
  if (quantidade <= 0) return "";

  // Correção 3: produto contado em garrafa só aceita as frações da régua.
  // Gin Gordons = 328.8 era decimal de dose convivendo com contagem de
  // garrafa; com a unidade fixa no catálogo, 0.8 não existe mais.
  if (item.tipoContagem === "garrafa") {
    const fracao = roundCount(quantidade - Math.floor(quantidade));
    if (fracao > 0 && !FRACTIONS.includes(fracao)) {
      return `Fração ${fracao} não existe na contagem por garrafa (use ${FRACTIONS.filter(Boolean).join(", ")}).`;
    }
  }

  // Correção 2: valor muito acima do último saldo conhecido.
  const referencia = Math.max(numberValue(item.estoqueAnterior), numberValue(item.parStock));
  if (referencia > 0 && quantidade > PISO_ALERTA_CONTAGEM && quantidade > referencia * FATOR_ALERTA_CONTAGEM) {
    return `Muito acima do último saldo conhecido (${referencia}). Confira antes de enviar.`;
  }

  return "";
}

function calcItemValues(item) {
  const abertura = roundCount(numberValue(item.aberturaInteira) + numberValue(item.aberturaFracionado));
  const fechamento = roundCount(numberValue(item.fechamentoInteira) + numberValue(item.fechamentoFracionado));
  const usado = roundCount(abertura - fechamento);
  const reposicaoSugerida = item.parStock ? Math.max(0, roundCount(item.parStock - fechamento)) : 0;
  const counted = Boolean(item.fechamentoContado || item.aberturaContada || numberValue(item.quantidade) > 0 || item.observacao?.trim());
  return { abertura, fechamento, usado, reposicaoSugerida, contado: counted };
}

function createInventory(meta, leader, products) {
  return {
    id: uid("inv"),
    data: meta.data,
    bar: meta.bar,
    turno: meta.turno,
    tipo: meta.tipo,
    lider: leader,
    status: "rascunho",
    criadoEm: new Date().toISOString(),
    enviadoEm: "",
    origemPlanilha: SETOR_ORIGEM[meta.bar],
    itens: products
      .filter((product) => isProductForBar(product, meta.bar))
      .map((product) => {
        const item = {
          produtoId: product.id,
          nome: product.nome,
          categoria: product.categoria,
          tipoContagem: product.tipoContagem,
          unidade: product.unidade,
          fornecedor: product.fornecedor,
          origemPlanilha: product.origemPlanilha,
          parStock: product.parStock,
          // Referência do alerta de teto (correção 2 do item 9).
          estoqueAnterior: numberValue(product.estoqueAtual),
          aberturaInteira: 0,
          aberturaFracionado: 0,
          abertura: 0,
          fechamentoInteira: 0,
          fechamentoFracionado: 0,
          fechamento: 0,
          aberturaContada: false,
          fechamentoContado: false,
          usado: 0,
          compra: 0,
          quantidade: 0,
          modoContagem: "misto",
          quantidadeUnidades: 0,
          quantidadeFardos: 0,
          valorUnitario: product.valorUnitario || 0,
          valorFardo: product.valorFardo || 0,
          unidadesPorFardo: product.unidadesPorFardo || 0,
          reposicaoSugerida: product.parStock || 0,
          observacao: "",
          contado: false,
        };
        return { ...item, ...calcItemValues(item) };
      }),
  };
}

function migrateItem(item) {
  const preset = PRICE_PRESETS[String(item.nome || "").toLowerCase()];
  const valorFardo = numberValue(item.valorFardo) || numberValue(preset?.[0]);
  const baseItem = { ...item, unidadesPorFardo: numberValue(item.unidadesPorFardo) || numberValue(preset?.[1]) };
  const unidadesPorFardo = numberValue(baseItem.unidadesPorFardo) || defaultUnitsPerPack(baseItem);
  const valorUnitario = numberValue(item.valorUnitario) || (valorFardo && unidadesPorFardo ? roundCount(valorFardo / unidadesPorFardo) : 0);
  const migrated = {
    ...item,
    unidade: item.unidade || (item.tipoContagem === "garrafa" ? "garrafas" : "un"),
    fornecedor: item.fornecedor || "",
    origemPlanilha: item.origemPlanilha || "MVP",
    parStock: numberValue(item.parStock),
    aberturaInteira: numberValue(item.aberturaInteira ?? item.quantidadeInteira),
    aberturaFracionado: numberValue(item.aberturaFracionado ?? item.fracionado),
    fechamentoInteira: numberValue(item.fechamentoInteira),
    fechamentoFracionado: numberValue(item.fechamentoFracionado),
    compra: numberValue(item.compra),
    quantidade: numberValue(item.quantidade ?? item.fechamentoInteira ?? item.quantidadeInteira),
    modoContagem: item.modoContagem || "misto",
    quantidadeUnidades: numberValue(item.quantidadeUnidades ?? item.quantidade ?? item.fechamentoInteira),
    quantidadeFardos: numberValue(item.quantidadeFardos),
    valorUnitario,
    valorFardo,
    unidadesPorFardo,
    observacao: item.observacao || "",
    aberturaContada: Boolean(item.aberturaContada || item.quantidadeInteira || item.fracionado),
    fechamentoContado: Boolean(item.fechamentoContado || item.contado),
  };
  return { ...migrated, ...calcItemValues(migrated) };
}

function migrateInventory(inventory) {
  if (!inventory) return inventory;
  return {
    ...inventory,
    origemPlanilha: inventory.origemPlanilha || SETOR_ORIGEM[inventory.bar] || "CONTAGEM",
    itens: Array.isArray(inventory.itens) ? inventory.itens.map(migrateItem) : [],
  };
}

function inventoryToSheetRows(inventory) {
  return inventory.itens.map((item) => ({
    id_inventario: inventory.id,
    data: inventory.data,
    bar: inventory.bar,
    turno: inventory.turno,
    tipo: inventory.tipo,
    lider: inventory.lider,
    status: inventory.status,
    produto: item.nome,
    categoria: item.categoria,
    unidade: item.unidade,
    quantidade: item.quantidade,
    modo_contagem: item.modoContagem,
    quantidade_unidades: item.quantidadeUnidades,
    quantidade_fardos: item.quantidadeFardos,
    abertura: item.abertura,
    fechamento: item.fechamento,
    usado: item.usado,
    compra: item.compra,
    valor_unitario: item.valorUnitario,
    valor_fardo: item.valorFardo,
    unidades_por_fardo: item.unidadesPorFardo,
    valor_total: roundCount(numberValue(item.quantidade) * numberValue(item.valorUnitario)),
    par_stock: item.parStock,
    reposicao_sugerida: item.reposicaoSugerida,
    observacao: item.observacao,
    enviado_em: inventory.enviadoEm,
  }));
}

function targetSheetNameFromInventory(inventory) {
  const tipo = String(inventory.tipo || "").toLowerCase();
  if (tipo.includes("sexta")) return "SEXTA";
  if (tipo.includes("sab")) return "SABADO";
  if (tipo.includes("dom")) return "DOMINGO";
  const dateValue = inventory.data;
  const day = new Date(`${dateValue}T00:00:00`).getDay();
  if (day === 5) return "SEXTA";
  if (day === 6) return "SABADO";
  if (day === 0) return "DOMINGO";
  return "SEXTA";
}

function inventoryToWorkbookPayload(inventory) {
  return {
    token: APPS_SCRIPT_TOKEN,
    workbook: "NOVA QUARTA FEIRA 24_06 planilha lucas.xlsx",
    sheet: targetSheetNameFromInventory(inventory),
    writeMode: "match-product-column-a-write-fecha-column-c",
    inventoryId: inventory.id,
    data: inventory.data,
    bar: inventory.bar,
    tipo: inventory.tipo,
    lider: inventory.lider,
    usuarioId: inventory.usuarioId || "",
    local: SETOR_PARA_LOCAL[inventory.bar] || "",
    espelharMovimentos: ESPELHAR_MOVIMENTOS,
    itens: inventory.itens
      .filter((item) => item.fechamentoContado || numberValue(item.quantidade) > 0 || item.observacao.trim())
      // Correção 4 do item 9: item sem produto identificado não vai para a
      // planilha. Eram as linhas com 0 e sem nome que apareciam lá.
      .filter((item) => String(item.nome || "").trim() && item.produtoId)
      .map((item) => ({
        produto: item.nome,
        produtoId: item.produtoId,
        quantidade: numberValue(item.quantidade),
        unidade: item.unidade,
        observacao: item.observacao,
      })),
  };
}

export async function sendInventoryToSheet(inventory) {
  const rows = inventoryToSheetRows(inventory);
  const workbookPayload = inventoryToWorkbookPayload(inventory);
  const integration = loadIntegration();
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.log("Linhas prontas para Google Sheets:", rows);
  console.log("Payload pronto para planilha operacional:", workbookPayload);
  if (!integration.appsScriptUrl) return { success: true, simulated: true, rows, workbookPayload };
  if (!isAppsScriptWebAppUrl(integration.appsScriptUrl)) {
    throw new Error("Use a URL do Web App do Apps Script, terminada em /exec.");
  }

  const response = await fetch(integration.appsScriptUrl, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(workbookPayload),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      "A planilha NÃO foi atualizada: o Google respondeu com uma página de erro em vez de dados. " +
        "Verifique no Apps Script se o script está autorizado a acessar a planilha e se o ID da planilha está correto."
    );
  }
  if (!response.ok || result.ok === false) {
    throw new Error(result.error || "Falha ao enviar para a planilha.");
  }
  return { success: true, simulated: false, rows, workbookPayload, result };
}

function normalizeMatchName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export async function fetchSheetStock(sheetName) {
  const integration = loadIntegration();
  if (!integration.appsScriptUrl) throw new Error("Configure a URL do Apps Script primeiro.");
  const response = await fetch(integration.appsScriptUrl, {
    method: "POST",
    mode: "cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "estoque", sheet: sheetName, token: APPS_SCRIPT_TOKEN }),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("O Google respondeu com uma página de erro. Verifique se o Apps Script foi republicado com a versão mais recente.");
  }
  if (!response.ok || result.ok === false) throw new Error(result.error || "Falha ao consultar a planilha.");
  return result.itens || [];
}

function matchSheetQuantity(sheetItems, productName) {
  const target = normalizeMatchName(productName);
  const exact = sheetItems.find((item) => item.norm === target);
  if (exact) return exact.quantidade;
  // Prefere o candidato mais específico: linhas de título curtas da planilha
  // (ex. "EPHIGENIA", "COPOS") não podem vencer o nome real do produto.
  const fuzzy = sheetItems
    .filter((item) => item.norm && (target.includes(item.norm) || item.norm.includes(target)))
    .sort((a, b) => b.norm.length - a.norm.length)[0];
  return fuzzy ? fuzzy.quantidade : undefined;
}

function buildCountReportRows(inventory, products) {
  const productById = new Map(products.map((product) => [product.id, product]));
  return inventory.itens.map((item) => {
    const contada = roundCount(item.quantidade);
    const estoque = roundCount(item.estoqueSistema ?? productById.get(item.produtoId)?.estoqueAtual ?? 0);
    return {
      Produto: item.nome,
      Categoria: getOperationalCategory(item),
      "Quantidade contada": contada,
      "Estoque atual": estoque,
      "Diferença": roundCount(contada - estoque),
      "Data da contagem": formatDate(inventory.data),
    };
  });
}

function reportFileName(inventory, extension) {
  return `contagem-${String(inventory.bar).toLowerCase().replace(/\s+/g, "-")}-${inventory.data}.${extension}`;
}

async function exportInventoryXlsx(inventory, products) {
  const XLSX = await import("xlsx");
  const rows = buildCountReportRows(inventory, products);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 34 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 16 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Contagem");
  XLSX.writeFile(workbook, reportFileName(inventory, "xlsx"));
}

async function exportInventoryPdf(inventory, products) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`Contagem de inventário — Bar ${inventory.bar}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Data: ${formatDate(inventory.data)} · ${inventory.tipo} · ${inventory.turno} · Líder: ${inventory.lider}`, 14, 23);
  const rows = buildCountReportRows(inventory, products);
  autoTable(doc, {
    startY: 28,
    head: [["Produto", "Categoria", "Qtd. contada", "Estoque atual", "Diferença", "Data"]],
    body: rows.map((row) => Object.values(row)),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [154, 1, 29] },
  });
  doc.save(reportFileName(inventory, "pdf"));
}

function exportInventoryCsv(inventory, products) {
  const rows = buildCountReportRows(inventory, products);
  const headers = Object.keys(rows[0] || {});
  const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(escapeCell).join(";"), ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(";"))];
  // O prefixo ﻿ (BOM) faz o Excel abrir o CSV com acentuação correta.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = reportFileName(inventory, "csv");
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [users, setUsers] = useState(loadUsers);
  const [currentUser, setCurrentUser] = useState(() => loadSession(loadUsers()));
  const [screen, setScreen] = useState(currentUser ? "home" : "login");
  const [products, setProducts] = useState(loadProducts);
  const [inventories, setInventories] = useState(() => loadJson(STORAGE_KEYS.inventories, []).map(migrateInventory));
  const [movements, setMovements] = useState(() => loadJson(STORAGE_KEYS.movements, []));
  const [draft, setDraft] = useState(() => migrateInventory(loadJson(STORAGE_KEYS.draft, null)));
  const [integration, setIntegration] = useState(loadIntegration);
  const [selectedInventory, setSelectedInventory] = useState(null);
  const [toast, setToast] = useState("");
  const isAdmin = ehAdmin(currentUser);
  const leader = currentUser?.nome || "";

  useEffect(() => saveJson(STORAGE_KEYS.users, users), [users]);
  useEffect(() => {
    if (currentUser) salvarSessao(currentUser);
    else limparSessao();
  }, [currentUser]);
  useEffect(() => saveJson(STORAGE_KEYS.products, products), [products]);
  useEffect(() => saveJson(STORAGE_KEYS.integration, integration), [integration]);
  useEffect(() => saveJson(STORAGE_KEYS.inventories, inventories), [inventories]);
  useEffect(() => saveJson(STORAGE_KEYS.movements, movements), [movements]);
  useEffect(() => {
    if (draft) saveJson(STORAGE_KEYS.draft, draft);
    else localStorage.removeItem(STORAGE_KEYS.draft);
  }, [draft]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  // Autentica na planilha; se ela recusar ou não responder, cai para os
  // usuários locais por PIN. Devolve { ok, error } para a tela de login.
  async function login(identificador, segredo) {
    const resultado = await entrar(identificador, segredo, users, BARS);
    if (!resultado.ok) return resultado;
    setCurrentUser(resultado.usuario);
    setScreen("home");
    if (resultado.aviso) notify(resultado.aviso);
    return resultado;
  }

  function logout() {
    setCurrentUser(null);
    setScreen("login");
  }

  async function syncStockFromSheet(sheetName) {
    const itens = await fetchSheetStock(sheetName);
    const sheetItems = itens.map((item) => ({ norm: normalizeMatchName(item.produto), quantidade: numberValue(item.quantidade) }));
    let updated = 0;
    const next = products.map((product) => {
      const quantidade = matchSheetQuantity(sheetItems, product.nome);
      if (quantidade === undefined) return product;
      updated += 1;
      return { ...product, estoqueAtual: roundCount(quantidade) };
    });
    setProducts(next);
    return { updated, total: itens.length };
  }

  // A retirada vira um movimento em MOVIMENTOS; o saldo do local cai por
  // consequência. Se a planilha não aceitar, a retirada NÃO aconteceu — não
  // dá para fingir localmente que o estoque baixou.
  async function registerWithdrawal({ produtoId, quantidade, motivo, observacao, local, destino }) {
    const product = products.find((item) => item.id === produtoId);
    if (!product) return { ok: false, error: "Produto não encontrado." };
    const regra = MOTIVO_MOVIMENTO[motivo] || MOTIVO_MOVIMENTO.Outro;
    try {
      await gravarMovimentos([{
        movId: uid("mov"),
        tipo: regra.tipo,
        origem: local,
        // Motivo com destino fixo ignora o que veio da tela.
        destino: regra.destino === null ? destino : regra.destino,
        produtoId,
        qtd: quantidade,
        unidade: product.unidade,
        usuarioId: currentUser?.id || leader,
        refDocumento: "",
        obs: [motivo, observacao].filter(Boolean).join(" — "),
      }]);
      const alvo = regra.destino === null ? destino : regra.destino;
      notify(alvo
        ? `${motivo}: ${quantidade} ${product.unidade} de ${product.nome} — ${local} → ${alvo}`
        : `${motivo}: ${product.nome} − ${quantidade} ${product.unidade} de ${local}`);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || "Falha ao gravar o movimento na planilha." };
    }
  }

  function openHome() {
    if (draft && screen === "count") {
      const ok = window.confirm("Existe uma contagem em andamento. Deseja sair mesmo assim? O rascunho continuará salvo.");
      if (!ok) return;
    }
    setScreen("home");
  }

  return (
    <div className="app">
      {toast && <div className="toast">{toast}</div>}
      {screen !== "login" && <Header user={currentUser} onHome={openHome} onLogout={logout} />}

      {screen === "login" && <LoginScreen onLogin={login} />}
      {screen === "home" && (
        <HomeScreen
          user={currentUser}
          isAdmin={isAdmin}
          hasDraft={Boolean(draft)}
          onNew={() => setScreen("new")}
          onResume={() => setScreen("count")}
          onWithdrawal={() => setScreen("withdrawal")}
          onStock={() => setScreen("stock")}
          onHistory={() => setScreen("history")}
          onProducts={() => setScreen("products")}
          onUsers={() => setScreen("users")}
          onIntegration={() => setScreen("integration")}
          onBase={() => setScreen("base")}
          onSheetUsers={() => setScreen("sheetUsers")}
          onMovements={() => setScreen("movements")}
          onFichas={() => setScreen("fichas")}
          onPreBatch={() => setScreen("prebatch")}
          onRequisicoes={() => setScreen("requisicoes")}
        />
      )}
      {screen === "withdrawal" && WITHDRAWAL_ENABLED && (
        <WithdrawalScreen products={products} onConfirm={registerWithdrawal} onBack={openHome} />
      )}
      {screen === "stock" && isAdmin && <StockScreen products={products} onSync={syncStockFromSheet} />}
      {screen === "new" && (
        <NewInventoryScreen
          products={products}
          user={currentUser}
          onStart={(meta) => {
            setDraft({ ...createInventory(meta, leader, products), usuarioId: currentUser?.id || "" });
            setScreen("count");
          }}
        />
      )}
      {screen === "count" && draft && (
        <InventoryCountScreen
          inventory={draft}
          onChange={setDraft}
          onReview={() => setScreen("review")}
          onBack={() => setScreen("home")}
        />
      )}
      {screen === "review" && draft && (
        <ReviewScreen
          inventory={draft}
          onBack={() => setScreen("count")}
          onSend={async () => {
            if (!leader || !draft.bar || !draft.turno || !draft.tipo) {
              notify("Preencha líder, bar, turno e tipo.");
              return;
            }
            const counted = draft.itens.filter((item) => item.fechamentoContado).length;
            if (counted < draft.itens.length) {
              const ok = window.confirm("Existem itens sem fechamento contado. Deseja enviar mesmo assim?");
              if (!ok) return;
            }
            // Correção 2 do item 9: a Stella 43992 passou direto por não
            // existir esta parada.
            const suspeitos = draft.itens.filter((item) => contagemSuspeita(item));
            if (suspeitos.length) {
              const lista = suspeitos.map((item) => `• ${item.nome}: ${numberValue(item.quantidade)}`).join("\n");
              const ok = window.confirm(`Estas contagens estão fora do padrão:\n\n${lista}\n\nEnviar assim mesmo?`);
              if (!ok) return;
            }
            const stockById = new Map(products.map((product) => [product.id, numberValue(product.estoqueAtual)]));
            const sent = {
              ...draft,
              status: "enviado",
              enviadoEm: new Date().toISOString(),
              // Guarda o estoque do sistema no momento da contagem para o
              // relatório calcular a diferença mesmo depois de novas retiradas.
              itens: draft.itens.map((item) => ({ ...item, estoqueSistema: stockById.get(item.produtoId) ?? 0 })),
            };
            try {
              const result = await sendInventoryToSheet(sent);
              const missing = result.result?.missing || [];
              const countedById = new Map(sent.itens.filter((item) => item.fechamentoContado).map((item) => [item.produtoId, roundCount(item.quantidade)]));
              if (countedById.size) {
                setProducts((current) => current.map((product) => (
                  countedById.has(product.id)
                    ? { ...product, estoqueAtual: countedById.get(product.id) }
                    : product
                )));
              }
              const espelho = result.result?.espelho || null;
              const espelhoErro = result.result?.espelhoErro || "";
              const resumoEspelho = espelho
                ? `${espelho.contagens} contagem(ns) e ${espelho.ajustes} ajuste(s) em MOVIMENTOS · quebra ${espelho.quebra > 0 ? "+" : ""}${espelho.quebra}`
                : espelhoErro
                  ? `Planilha atualizada, mas o espelho em MOVIMENTOS falhou: ${espelhoErro}`
                  : "";
              const nextInventory = {
                ...sent,
                sheetSyncStatus: result.simulated ? "simulado" : "sincronizado",
                sheetSyncMessage: result.simulated
                  ? "Sem URL do Apps Script configurada"
                  : missing.length
                    ? `${result.result.writtenCount} itens gravados. Não encontrados na planilha: ${missing.join(", ")}`
                    : "Enviado para a planilha",
                espelhoResumo: resumoEspelho,
                quebra: espelho ? espelho.quebra : null,
              };
              setInventories((current) => [nextInventory, ...current]);
              setDraft(null);
              notify(
                result.simulated
                  ? "Inventário salvo. Configure a planilha para enviar."
                  : missing.length
                    ? `Enviado, mas ${missing.length} produto(s) não foram encontrados na planilha.`
                    : espelhoErro
                      ? resumoEspelho
                      : espelho
                        ? `Enviado. ${resumoEspelho}.`
                        : "Inventário enviado para a planilha"
              );
              setScreen(isAdmin ? "history" : "home");
            } catch (error) {
              notify(error.message || "Falha ao enviar para a planilha.");
            }
          }}
        />
      )}
      {screen === "history" && isAdmin && (
        <HistoryScreen
          inventories={inventories}
          movements={movements}
          onDetails={(inventory) => {
            setSelectedInventory(inventory);
            setScreen("details");
          }}
        />
      )}
      {screen === "details" && isAdmin && selectedInventory && (
        <InventoryDetailsScreen inventory={selectedInventory} products={products} onBack={() => setScreen("history")} onNotify={notify} />
      )}
      {screen === "products" && isAdmin && <ProductsScreen products={products} onChange={setProducts} />}
      {screen === "users" && isAdmin && <UsersScreen users={users} onChange={setUsers} currentUserId={currentUser.id} />}
      {screen === "base" && isAdmin && <BaseScreen products={products} onNotify={notify} />}
      {screen === "sheetUsers" && isAdmin && <SheetUsersScreen onNotify={notify} />}
      {screen === "movements" && isAdmin && <MovementsScreen products={products} onNotify={notify} />}
      {/* Ficha técnica é consulta liberada para todos os perfis. */}
      {screen === "fichas" && <FichasScreen />}
      {screen === "prebatch" && <PreBatchScreen onNotify={notify} />}
      {/* Requisição é liberada para qualquer usuário logado; separar exige perfil. */}
      {screen === "requisicoes" && <RequisicoesScreen products={products} user={currentUser} onNotify={notify} />}
      {screen === "integration" && isAdmin && <IntegrationScreen integration={integration} onChange={setIntegration} />}
      {["history", "details", "products", "users", "integration", "stock", "base", "sheetUsers", "movements"].includes(screen) && !isAdmin && (
        <HomeScreen
          user={currentUser}
          isAdmin={false}
          hasDraft={Boolean(draft)}
          onNew={() => setScreen("new")}
          onResume={() => setScreen("count")}
          onWithdrawal={() => setScreen("withdrawal")}
          onFichas={() => setScreen("fichas")}
          onPreBatch={() => setScreen("prebatch")}
          onRequisicoes={() => setScreen("requisicoes")}
        />
      )}
    </div>
  );
}

function Header({ user, onHome, onLogout }) {
  return (
    <header className="topbar">
      <button className="iconButton" onClick={onHome} aria-label="Início">⌂</button>
      <img className="topbarLogo" src={ephigeniaLogo} alt="" />
      <div>
        <strong>Ephigenia</strong>
        <span>{user?.nome} · {rotuloPerfis(user?.perfis)}{user?.origem === "local" ? " · reserva" : ""}</span>
      </div>
      <button className="ghostButton compact" onClick={onLogout}>Sair</button>
    </header>
  );
}

function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Informe o usuário.");
      return;
    }
    if (!pin.trim()) {
      setError("Informe a senha.");
      return;
    }
    setError("");
    setEntrando(true);
    try {
      const resultado = await onLogin(name.trim(), pin);
      if (!resultado.ok) setError(resultado.error || "Usuário ou senha inválidos.");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <main className="login">
      <section className="loginPanel">
        <img className="brandLogo" src={ephigeniaLogo} alt="Ephigenia" />
        <p className="eyebrow">Inventário rápido</p>
        <h1>Ephigenia</h1>
        <form onSubmit={submit} className="stack">
          <Input label="Usuário" value={name} onChange={setName} autoFocus autoComplete="username" />
          <Input label="Senha" type="password" value={pin} onChange={setPin} autoComplete="current-password" />
          {error && <p className="error">{error}</p>}
          <Button type="submit" disabled={entrando}>{entrando ? "Entrando..." : "Entrar"}</Button>
        </form>
        <p className="miniText">Sem conexão com a planilha, o PIN cadastrado no aparelho continua valendo.</p>
      </section>
    </main>
  );
}

function HomeScreen({ user, isAdmin, hasDraft, onNew, onResume, onWithdrawal, onStock, onHistory, onProducts, onUsers, onIntegration, onBase, onSheetUsers, onMovements, onFichas, onPreBatch, onRequisicoes }) {
  return (
    <main className="screen">
      <p className="eyebrow">Olá, {user?.nome}.</p>
      <h1>{isAdmin ? "Painel do admin" : "O que vamos contar hoje?"}</h1>
      {!isAdmin && <p className="roleNotice">{rotuloPerfis(user?.perfis)}: acesso liberado para {WITHDRAWAL_ENABLED ? "contagens e retiradas de estoque" : "contagens"}.</p>}
      <div className="actionGrid">
        {hasDraft && <Button onClick={onResume} variant="amber">Continuar rascunho</Button>}
        <Button onClick={onNew}>Novo inventário</Button>
        {/* Consulta liberada para todos os perfis. */}
        <Button onClick={onFichas} variant="secondary">Fichas técnicas</Button>
        <Button onClick={onRequisicoes} variant="secondary">Requisições</Button>
        <Button onClick={onPreBatch} variant="secondary">Calculadora de pré-batch</Button>
        {WITHDRAWAL_ENABLED && <Button onClick={onWithdrawal} variant="secondary">Retirada de estoque</Button>}
        {isAdmin && <Button onClick={onStock} variant="secondary">Estoque atual</Button>}
        {isAdmin && <Button onClick={onMovements} variant="secondary">Movimentos</Button>}
        {isAdmin && <Button onClick={onHistory} variant="secondary">Histórico</Button>}
        {isAdmin && <Button onClick={onProducts} variant="secondary">Produtos</Button>}
        {isAdmin && <Button onClick={onUsers} variant="secondary">Usuários (reserva)</Button>}
        {isAdmin && <Button onClick={onSheetUsers} variant="secondary">Usuários da planilha</Button>}
        {isAdmin && <Button onClick={onBase} variant="secondary">Base da planilha</Button>}
        {isAdmin && <Button onClick={onIntegration} variant="secondary">Planilha</Button>}
      </div>
    </main>
  );
}

function NewInventoryScreen({ products, user, onStart }) {
  const [meta, setMeta] = useState({ data: today(), bar: "", tipo: "", turno: "" });
  const [error, setError] = useState("");
  const availableBars = ehAdmin(user) ? BARS : BARS.filter((bar) => user?.setores?.includes(bar));
  const availableItems = meta.bar ? products.filter((product) => isProductForBar(product, meta.bar)).length : 0;

  function start() {
    if (!meta.bar || !meta.tipo || !meta.turno) {
      setError("Selecione bar, tipo e turno para iniciar.");
      return;
    }
    if (!availableItems) {
      setError("Este setor não tem produtos ativos.");
      return;
    }
    onStart(meta);
  }

  return (
    <main className="screen">
      <h1>Novo inventário</h1>
      <div className="stack">
        <Input label="Data" type="date" value={meta.data} onChange={(data) => setMeta({ ...meta, data })} />
        <Picker label="Bar/setor" options={availableBars} value={meta.bar} onChange={(bar) => setMeta({ ...meta, bar })} featured />
        {meta.bar && (
          <div className="sourceBanner">
            <strong>{availableItems} itens ativos</strong>
            <span>Modelo: {SETOR_ORIGEM[meta.bar]}</span>
          </div>
        )}
        <Picker label="Tipo" options={INVENTORY_TYPES} value={meta.tipo} onChange={(tipo) => setMeta({ ...meta, tipo })} />
        <Picker label="Turno" options={SHIFTS} value={meta.turno} onChange={(turno) => setMeta({ ...meta, turno })} />
        {error && <p className="error">{error}</p>}
        <Button onClick={start}>Iniciar contagem</Button>
      </div>
    </main>
  );
}

function InventoryCountScreen({ inventory, onChange, onReview, onBack }) {
  const [filter, setFilter] = useState("todos");
  const [openCategories, setOpenCategories] = useState(null);
  const counted = inventory.itens.filter((item) => item.fechamentoContado).length;
  const percent = Math.round((counted / inventory.itens.length) * 100);
  const visibleItems = inventory.itens
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => {
      if (filter === "pendentes") return !item.fechamentoContado;
      if (filter === "observacao") return item.observacao.trim();
      return true;
    });
  const categoriesWithItems = CATEGORIES.map((category) => {
    const items = visibleItems.filter(({ item }) => getOperationalCategory(item) === category);
    const pending = items.filter(({ item }) => !item.fechamentoContado).length;
    return { category, items, pending };
  }).filter(({ items }) => items.length);
  const expandedCategories = openCategories ?? new Set(categoriesWithItems.slice(0, 1).map(({ category }) => category));

  function updateItem(index, patch) {
    const itens = inventory.itens.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const next = { ...item, ...patch };
      return { ...next, ...calcItemValues(next) };
    });
    onChange({ ...inventory, itens });
  }

  function toggleCategory(category) {
    const next = new Set(expandedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    setOpenCategories(next);
  }

  return (
    <main className="screen countScreen">
      <div className="stickyProgress">
        <div>
          <p className="eyebrow">{inventory.bar} · {inventory.tipo} · {inventory.turno}</p>
          <h1>Abre / Fecha</h1>
        </div>
        <strong>{counted}/{inventory.itens.length}</strong>
        <div className="progress"><span style={{ width: `${percent}%` }} /></div>
        <div className="quickFilters">
          {[
            ["todos", "Todos"],
            ["pendentes", "Pendentes"],
            ["observacao", "Com obs."],
          ].map(([value, label]) => (
            <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </div>

      {categoriesWithItems.map(({ category, items, pending }) => {
        const isOpen = expandedCategories.has(category);
        return (
          <section key={category} className="categoryBlock">
            <button className="categoryToggle" type="button" onClick={() => toggleCategory(category)}>
              <span>{isOpen ? "−" : "+"}</span>
              <strong>{category}</strong>
              <em>{items.length} itens · {pending} pend.</em>
            </button>
            {isOpen && (
              <div className="categoryItems">
                {items.map(({ item, index }) => (
                  <ProductCard key={item.produtoId} item={item} onChange={(patch) => updateItem(index, patch)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
      {!visibleItems.length && <EmptyState title="Nada neste filtro" text="Troque o filtro para ver outros itens." />}
      <div className="bottomActions">
        <button className="ghostButton" onClick={onBack}>Salvar e sair</button>
        <Button onClick={onReview}>Revisar</Button>
      </div>
    </main>
  );
}

function ProductCard({ item, onChange }) {
  const nextCounted = !item.fechamentoContado;
  const itemUnitPrice = numberValue(item.valorFardo) && numberValue(item.unidadesPorFardo)
    ? roundCount(numberValue(item.valorFardo) / numberValue(item.unidadesPorFardo))
    : numberValue(item.valorUnitario);
  const unitsPerPack = defaultUnitsPerPack(item);
  const totalQuantity = roundCount(numberValue(item.quantidadeUnidades) + (numberValue(item.quantidadeFardos) * unitsPerPack));
  const alerta = contagemSuspeita(item);

  function changeMixedQuantity(patch) {
    const nextUnits = numberValue(patch.quantidadeUnidades ?? item.quantidadeUnidades);
    const nextPacks = numberValue(patch.quantidadeFardos ?? item.quantidadeFardos);
    const quantidade = roundCount(nextUnits + (nextPacks * unitsPerPack));
    onChange({
      ...patch,
      modoContagem: "misto",
      quantidade,
      fechamentoInteira: quantidade,
      fechamentoContado: quantidade > 0 || Boolean(item.observacao.trim()),
      aberturaContada: quantidade > 0 || Boolean(item.observacao.trim()),
    });
  }

  return (
    <article className={`productCard cleanCard ${item.fechamentoContado ? "isCounted" : "isPending"} ${item.observacao ? "hasNote" : ""} ${alerta ? "hasAlert" : ""}`}>
      <div className="cardHead">
        <div>
          <h3>{item.nome}</h3>
          <span>{getOperationalCategory(item)}{unitsPerPack ? ` · ${unitsPerPack} un/${packLabel(item)}` : itemUnitPrice ? ` · R$ ${itemUnitPrice.toFixed(2)}` : ""}</span>
        </div>
        <button
          type="button"
          className={`countToggle ${item.fechamentoContado ? "selected" : ""}`}
          onClick={() => onChange({ fechamentoContado: nextCounted, aberturaContada: nextCounted })}
        >
          {item.fechamentoContado ? "Contado" : "Marcar"}
        </button>
      </div>
      <div className="fieldGrid mixedCountGrid">
        <NumberField label="Unidades" value={item.quantidadeUnidades} onChange={(quantidadeUnidades) => changeMixedQuantity({ quantidadeUnidades })} />
        <NumberField label={packLabel(item) === "caixa" ? "Caixas" : "Fardos"} value={item.quantidadeFardos} onChange={(quantidadeFardos) => changeMixedQuantity({ quantidadeFardos })} />
      </div>
      <p className="countTotal">Total: {totalQuantity}</p>
      {alerta && <p className="countAlert">⚠ {alerta}</p>}
      <Input label="Observação" value={item.observacao} onChange={(observacao) => onChange({ observacao })} placeholder="Opcional" />
    </article>
  );
}

function ReviewScreen({ inventory, onBack, onSend }) {
  const summary = useMemo(() => {
    const counted = inventory.itens.filter((item) => item.fechamentoContado).length;
    const noted = inventory.itens.filter((item) => item.observacao.trim()).length;
    const alertas = inventory.itens.filter((item) => contagemSuspeita(item));
    return {
      total: inventory.itens.length,
      counted,
      pending: inventory.itens.length - counted,
      noted,
      alertas,
    };
  }, [inventory]);

  return (
    <main className="screen">
      <h1>Revisão</h1>
      <InfoGrid inventory={inventory} />
      {summary.pending > 0 && <p className="warning">Existem {summary.pending} itens sem fechamento contado.</p>}
      {summary.alertas.length > 0 && (
        <section className="panel stack">
          <p className="warning">{summary.alertas.length} contagem(ns) fora do padrão. Confira antes de enviar:</p>
          {summary.alertas.map((item) => (
            <p key={item.produtoId} className="miniText">
              <strong>{item.nome}</strong>: {numberValue(item.quantidade)} — {contagemSuspeita(item)}
            </p>
          ))}
        </section>
      )}
      <div className="summaryGrid">
        <Metric label="Itens" value={summary.total} />
        <Metric label="Contados" value={summary.counted} />
        <Metric label="Pendentes" value={summary.pending} />
        <Metric label="Com obs." value={summary.noted} />
      </div>
      <ReviewList items={inventory.itens} />
      <div className="bottomActions">
        <button className="ghostButton" onClick={onBack}>Voltar e editar</button>
        <Button onClick={onSend}>Enviar inventário</Button>
      </div>
    </main>
  );
}

function HistoryScreen({ inventories, movements, onDetails }) {
  const [tab, setTab] = useState("inventarios");
  const [filters, setFilters] = useState({ bar: "", tipo: "", data: "", produto: "" });
  const productQuery = filters.produto.trim().toLowerCase();
  const matchesProduct = (name) => !productQuery || String(name || "").toLowerCase().includes(productQuery);

  const filteredInventories = inventories.filter((inventory) => (
    (!filters.bar || inventory.bar === filters.bar) &&
    (!filters.tipo || inventory.tipo === filters.tipo) &&
    (!filters.data || inventory.data === filters.data) &&
    (!productQuery || inventory.itens.some((item) => matchesProduct(item.nome) && (item.fechamentoContado || numberValue(item.quantidade) > 0)))
  ));

  const filteredMovements = movements.filter((movement) => (
    matchesProduct(movement.produto) &&
    (!filters.data || String(movement.dataHora || "").slice(0, 10) === filters.data)
  ));

  return (
    <main className="screen">
      <h1>Histórico</h1>
      <div className="quickFilters">
        <button className={tab === "inventarios" ? "selected" : ""} onClick={() => setTab("inventarios")}>Inventários</button>
        <button className={tab === "movimentacoes" ? "selected" : ""} onClick={() => setTab("movimentacoes")}>Movimentações</button>
      </div>
      <div className="filterGrid">
        <Input label="Produto" value={filters.produto} onChange={(produto) => setFilters({ ...filters, produto })} placeholder="Buscar por nome" />
        <Input label="Data" type="date" value={filters.data} onChange={(data) => setFilters({ ...filters, data })} />
        {tab === "inventarios" && <Select label="Bar" value={filters.bar} onChange={(bar) => setFilters({ ...filters, bar })} options={["", ...BARS]} />}
        {tab === "inventarios" && <Select label="Tipo" value={filters.tipo} onChange={(tipo) => setFilters({ ...filters, tipo })} options={["", ...INVENTORY_TYPES]} />}
      </div>
      {tab === "inventarios" && (
        <>
          {!filteredInventories.length && <EmptyState title="Nenhum inventário encontrado" text="Os envios finalizados aparecem aqui." />}
          <div className="list">
            {filteredInventories.map((inventory) => (
              <article className="historyCard" key={inventory.id}>
                <div>
                  <h3>{formatDate(inventory.data)} · Bar {inventory.bar}</h3>
                  <p>{inventory.tipo} · {inventory.turno} · {inventory.lider}</p>
                  {productQuery && inventory.itens.filter((item) => matchesProduct(item.nome)).slice(0, 3).map((item) => (
                    <p key={item.produtoId}>{item.nome}: {numberValue(item.quantidade)}</p>
                  ))}
                  <span className="status">Enviado</span>
                </div>
                <button className="ghostButton compact" onClick={() => onDetails(inventory)}>Ver detalhes</button>
              </article>
            ))}
          </div>
        </>
      )}
      {tab === "movimentacoes" && (
        <>
          {!filteredMovements.length && <EmptyState title="Nenhuma movimentação" text="As retiradas de estoque aparecem aqui." />}
          <div className="list">
            {filteredMovements.map((movement) => (
              <article className="historyCard" key={movement.id}>
                <div>
                  <h3>{movement.produto}</h3>
                  <p>Retirada de {movement.quantidade} {movement.unidade} · {movement.motivo}</p>
                  <p>{new Date(movement.dataHora).toLocaleString("pt-BR")} · {movement.usuario}</p>
                  {movement.observacao && <p>{movement.observacao}</p>}
                  <span className="status warn">Retirada</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function InventoryDetailsScreen({ inventory, products, onBack, onNotify }) {
  const [exporting, setExporting] = useState(false);

  async function runExport(exporter, label) {
    setExporting(true);
    try {
      await exporter(inventory, products);
      onNotify(`Relatório ${label} gerado.`);
    } catch (error) {
      onNotify(`Falha ao gerar ${label}: ${error.message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="screen">
      <button className="ghostButton compact" onClick={onBack}>Voltar</button>
      <h1>Detalhes</h1>
      <InfoGrid inventory={inventory} />
      <div className="detailBox">
        <p><span>ID</span>{inventory.id}</p>
        <p><span>Status</span>{inventory.status}</p>
        <p><span>Origem</span>{inventory.origemPlanilha}</p>
        <p><span>Enviado em</span>{new Date(inventory.enviadoEm).toLocaleString("pt-BR")}</p>
        {inventory.espelhoResumo && <p><span>MOVIMENTOS</span>{inventory.espelhoResumo}</p>}
      </div>
      <section>
        <p className="label">Exportar contagem</p>
        <div className="quickFilters">
          <button disabled={exporting} onClick={() => runExport(exportInventoryXlsx, "Excel")}>Excel (.xlsx)</button>
          <button disabled={exporting} onClick={() => runExport(exportInventoryPdf, "PDF")}>PDF</button>
          <button disabled={exporting} onClick={() => runExport(exportInventoryCsv, "CSV")}>CSV</button>
        </div>
      </section>
      <ReviewList items={inventory.itens} />
    </main>
  );
}

function ProductsScreen({ products, onChange }) {
  const emptyForm = { nome: "", categoria: "", tipoContagem: "", unidade: "", origemPlanilha: "Manual", fornecedor: "", parStock: 0, estoqueAtual: 0, valorUnitario: 0, valorFardo: 0, unidadesPorFardo: 0, setores: BARS, ativo: true };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");
  const formPackLabel = packLabel({ nome: form.nome, categoria: form.categoria });
  const calculatedUnitPrice = numberValue(form.valorFardo) && numberValue(form.unidadesPorFardo)
    ? roundCount(numberValue(form.valorFardo) / numberValue(form.unidadesPorFardo))
    : numberValue(form.valorUnitario);

  function saveProduct() {
    if (!form.nome.trim() || !form.categoria || !form.tipoContagem || !form.unidade || !form.setores.length) {
      setError("Preencha nome, categoria, tipo, unidade e setor.");
      return;
    }
    setError("");
    const product = normalizeProduct({ ...form, nome: form.nome.trim(), parStock: numberValue(form.parStock), valorUnitario: calculatedUnitPrice, editadoManualmente: true });
    if (editingId) {
      onChange(products.map((item) => item.id === editingId ? { ...product, id: editingId } : item));
    } else {
      onChange([{ ...product, id: uid("prod") }, ...products]);
    }
    setForm(emptyForm);
    setEditingId("");
  }

  function edit(product) {
    setEditingId(product.id);
    setForm({
      nome: product.nome,
      categoria: product.categoria,
      tipoContagem: product.tipoContagem,
      unidade: product.unidade,
      origemPlanilha: product.origemPlanilha,
      fornecedor: product.fornecedor,
      parStock: product.parStock,
      estoqueAtual: product.estoqueAtual,
      valorUnitario: product.valorUnitario,
      valorFardo: product.valorFardo,
      unidadesPorFardo: product.unidadesPorFardo,
      setores: product.setores,
      ativo: product.ativo,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleSector(sector) {
    const setores = form.setores.includes(sector)
      ? form.setores.filter((item) => item !== sector)
      : [...form.setores, sector];
    setForm({ ...form, setores });
  }

  return (
    <main className="screen">
      <h1>Produtos</h1>
      <section className="panel stack">
        <Input label="Nome" value={form.nome} onChange={(nome) => setForm({ ...form, nome })} />
        <Select label="Categoria" value={form.categoria} onChange={(categoria) => setForm({ ...form, categoria })} options={["", ...CATEGORIES]} />
        <Select label="Tipo de contagem" value={form.tipoContagem} onChange={(tipoContagem) => setForm({ ...form, tipoContagem })} options={["", "unidade", "garrafa"]} />
        <div className="fieldGrid">
          <Input label="Unidade" value={form.unidade} onChange={(unidade) => setForm({ ...form, unidade })} placeholder="un, kg, garrafas" />
          <NumberField label="Par stock (mínimo)" value={form.parStock} onChange={(parStock) => setForm({ ...form, parStock })} />
        </div>
        <NumberField label="Estoque atual" value={form.estoqueAtual} onChange={(estoqueAtual) => setForm({ ...form, estoqueAtual })} />
        <div className="fieldGrid">
          <NumberField label="Valor unitário" value={form.valorUnitario} onChange={(valorUnitario) => setForm({ ...form, valorUnitario })} />
          <NumberField label={formPackLabel === "caixa" ? "Valor da caixa" : "Valor do fardo"} value={form.valorFardo} onChange={(valorFardo) => setForm({ ...form, valorFardo })} />
        </div>
        <div className="sourceBanner">
          <NumberField label={`Unid. por ${formPackLabel}`} value={form.unidadesPorFardo} onChange={(unidadesPorFardo) => setForm({ ...form, unidadesPorFardo })} />
          <span>Unitário: R$ {calculatedUnitPrice.toFixed(2)}</span>
        </div>
        <Input label="Fornecedor" value={form.fornecedor} onChange={(fornecedor) => setForm({ ...form, fornecedor })} placeholder="Opcional" />
        <Input label="Origem" value={form.origemPlanilha} onChange={(origemPlanilha) => setForm({ ...form, origemPlanilha })} />
        <section>
          <p className="label">Setores</p>
          <div className="chipGrid">
            {BARS.map((bar) => (
              <button key={bar} type="button" className={form.setores.includes(bar) ? "selected" : ""} onClick={() => toggleSector(bar)}>{bar}</button>
            ))}
          </div>
        </section>
        <label className="toggle">
          <input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} />
          Produto ativo
        </label>
        {error && <p className="error">{error}</p>}
        <div className="bottomActions inline">
          {editingId && <button className="ghostButton" onClick={() => { setEditingId(""); setForm(emptyForm); }}>Cancelar</button>}
          <Button onClick={saveProduct}>{editingId ? "Salvar produto" : "Adicionar produto"}</Button>
        </div>
      </section>
      <div className="list">
        {products.map((product) => (
          <article className={`historyCard ${!product.ativo ? "inactive" : ""}`} key={product.id}>
            <div>
              <h3>{product.nome}</h3>
              <p>{product.categoria} · {product.tipoContagem} · {product.unidade} · Par {product.parStock || "-"}</p>
              <p>Unitário R$ {(product.valorUnitario || 0).toFixed(2)}{product.valorFardo ? ` · ${packLabel(product) === "caixa" ? "Caixa" : "Fardo"} R$ ${product.valorFardo.toFixed(2)} / ${product.unidadesPorFardo}` : ""}</p>
              <p>{product.origemPlanilha} · {product.setores.join(", ")}{product.fornecedor ? ` · ${product.fornecedor}` : ""}</p>
              <span className="status">{product.ativo ? "Ativo" : "Inativo"}</span>
            </div>
            <div className="rowActions">
              <button className="ghostButton compact" onClick={() => edit(product)}>Editar</button>
              <button
                className="ghostButton compact"
                onClick={() => onChange(products.map((item) => item.id === product.id ? { ...item, ativo: !item.ativo } : item))}
              >
                {product.ativo ? "Inativar" : "Ativar"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

function UsersScreen({ users, onChange, currentUserId }) {
  const emptyForm = { nome: "", pin: "", perfil: "lider", setores: BARS, ativo: true };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [error, setError] = useState("");

  function saveUser() {
    if (!form.nome.trim() || !form.pin.trim()) {
      setError("Preencha nome e PIN.");
      return;
    }
    if (form.perfil === "lider" && !form.setores.length) {
      setError("Selecione pelo menos um setor para o líder.");
      return;
    }
    const duplicate = users.some((user) => user.id !== editingId && user.nome.trim().toLowerCase() === form.nome.trim().toLowerCase());
    if (duplicate) {
      setError("Já existe um usuário com esse nome.");
      return;
    }
    setError("");
    const nextUser = normalizeUser({ ...form, nome: form.nome.trim() });
    if (editingId) {
      onChange(users.map((user) => user.id === editingId ? { ...nextUser, id: editingId } : user));
    } else {
      onChange([{ ...nextUser, id: uid("user") }, ...users]);
    }
    setForm(emptyForm);
    setEditingId("");
  }

  function edit(user) {
    setEditingId(user.id);
    setForm({
      nome: user.nome,
      pin: user.pin,
      perfil: user.perfil,
      setores: user.setores,
      ativo: user.ativo,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleSector(sector) {
    const setores = form.setores.includes(sector)
      ? form.setores.filter((item) => item !== sector)
      : [...form.setores, sector];
    setForm({ ...form, setores });
  }

  function toggleActive(user) {
    if (user.id === currentUserId) return;
    onChange(users.map((item) => item.id === user.id ? { ...item, ativo: !item.ativo } : item));
  }

  return (
    <main className="screen">
      <h1>Usuários</h1>
      <section className="panel stack">
        <Input label="Nome do usuário" value={form.nome} onChange={(nome) => setForm({ ...form, nome })} />
        <Input label="PIN" type="password" value={form.pin} onChange={(pin) => setForm({ ...form, pin })} />
        <Select label="Perfil" value={form.perfil} onChange={(perfil) => setForm({ ...form, perfil, setores: perfil === "admin" ? BARS : form.setores })} options={["lider", "admin"]} />
        <section>
          <p className="label">Setores permitidos</p>
          <div className="chipGrid">
            {BARS.map((bar) => (
              <button
                key={bar}
                type="button"
                className={form.setores.includes(bar) ? "selected" : ""}
                onClick={() => toggleSector(bar)}
                disabled={form.perfil === "admin"}
              >
                {bar}
              </button>
            ))}
          </div>
        </section>
        <label className="toggle">
          <input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} />
          Usuário ativo
        </label>
        {error && <p className="error">{error}</p>}
        <div className="bottomActions inline">
          {editingId && <button className="ghostButton" onClick={() => { setEditingId(""); setForm(emptyForm); }}>Cancelar</button>}
          <Button onClick={saveUser}>{editingId ? "Salvar usuário" : "Cadastrar usuário"}</Button>
        </div>
      </section>
      <div className="list">
        {users.map((user) => (
          <article className={`historyCard ${!user.ativo ? "inactive" : ""}`} key={user.id}>
            <div>
              <h3>{user.nome}</h3>
              <p>{user.perfil === "admin" ? "Admin" : "Líder"} · {user.setores.join(", ")}</p>
              <span className="status">{user.ativo ? "Ativo" : "Inativo"}</span>
            </div>
            <div className="rowActions">
              <button className="ghostButton compact" onClick={() => edit(user)}>Editar</button>
              <button className="ghostButton compact" disabled={user.id === currentUserId} onClick={() => toggleActive(user)}>
                {user.ativo ? "Inativar" : "Ativar"}
              </button>
            </div>
          </article>
        ))}
      </div>
      <p className="miniText">
        Estes usuários valem só neste aparelho e servem de reserva para quando a planilha não
        responde. O cadastro que vale em todos os aparelhos é o de "Usuários da planilha".
      </p>
    </main>
  );
}

function IntegrationScreen({ integration, onChange }) {
  const [form, setForm] = useState({ appsScriptUrl: integration.appsScriptUrl || "" });
  const [status, setStatus] = useState("");

  function save() {
    onChange({ appsScriptUrl: form.appsScriptUrl.trim() });
    setStatus("Configuração salva.");
  }

  async function testConnection() {
    if (!form.appsScriptUrl.trim()) {
      setStatus("Cole a URL do Apps Script primeiro.");
      return;
    }
    if (!isAppsScriptWebAppUrl(form.appsScriptUrl)) {
      setStatus("URL incorreta. Ela precisa começar com https://script.google.com/macros/s/ e terminar com /exec.");
      return;
    }
    try {
      const response = await fetch(form.appsScriptUrl.trim(), {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ ping: true, token: APPS_SCRIPT_TOKEN }),
      });
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        setStatus("O Google respondeu com uma página de erro. Reautorize o script no Apps Script e publique uma nova versão.");
        return;
      }
      setStatus(result.ok ? result.message || "Conexão OK." : result.error || "A conexão respondeu com erro.");
    } catch (error) {
      setStatus(error.message || "Não foi possível conectar.");
    }
  }

  return (
    <main className="screen">
      <h1>Planilha</h1>
      <section className="panel stack">
        <Input
          label="URL do Google Apps Script"
          value={form.appsScriptUrl}
          onChange={(appsScriptUrl) => setForm({ appsScriptUrl })}
          placeholder="https://script.google.com/macros/s/..."
        />
        <p className="miniText">O Apps Script deve estar publicado como aplicativo web e conectado à planilha operacional.</p>
        {status && <p className="warning">{status}</p>}
        <div className="bottomActions inline">
          <button
            className="ghostButton"
            onClick={() => {
              setForm(DEFAULT_INTEGRATION);
              onChange(DEFAULT_INTEGRATION);
              setStatus("URL padrão restaurada.");
            }}
          >
            Restaurar
          </button>
          <button className="ghostButton" onClick={testConnection}>Testar</button>
          <Button onClick={save}>Salvar</Button>
        </div>
      </section>
    </main>
  );
}

function WithdrawalScreen({ products, onConfirm, onBack }) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [quantidade, setQuantidade] = useState(0);
  const [motivo, setMotivo] = useState("");
  const [local, setLocal] = useState("GERAL");
  const [destino, setDestino] = useState("PRINCIPAL");
  const [observacao, setObservacao] = useState("");
  const [error, setError] = useState("");
  const [gravando, setGravando] = useState(false);
  const query = search.trim().toLowerCase();
  const available = products.filter((product) => product.ativo);
  const matches = query
    ? available.filter((product) => product.nome.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const selected = available.find((product) => product.id === selectedId);

  async function confirm() {
    if (!selected) {
      setError("Selecione o produto.");
      return;
    }
    const amount = roundCount(quantidade);
    if (amount <= 0) {
      setError("Informe uma quantidade maior que zero.");
      return;
    }
    if (!motivo) {
      setError("Selecione o motivo da retirada.");
      return;
    }
    if (!local) {
      setError("Selecione de qual local a retirada sai.");
      return;
    }
    const pedeDestino = MOTIVO_MOVIMENTO[motivo]?.destino === null;
    if (pedeDestino && !destino) {
      setError("Selecione para qual bar vai a reposição.");
      return;
    }
    if (pedeDestino && destino === local) {
      setError("Origem e destino são o mesmo local. A reposição não move nada.");
      return;
    }
    // Referência do último saldo conhecido no aparelho. O saldo de verdade
    // é a soma de MOVIMENTOS; isto aqui só evita um erro de digitação óbvio.
    const referencia = numberValue(selected.estoqueAtual);
    if (referencia && amount > referencia) {
      const ok = window.confirm(`O último saldo conhecido de ${selected.nome} é ${referencia} ${selected.unidade}. Retirar ${amount} deixa o saldo negativo. Confirmar mesmo assim?`);
      if (!ok) return;
    }
    setError("");
    setGravando(true);
    const resultado = await onConfirm({
      produtoId: selected.id,
      quantidade: amount,
      motivo,
      local,
      destino,
      observacao: observacao.trim(),
    });
    setGravando(false);
    if (!resultado?.ok) {
      setError(resultado?.error || "Não foi possível gravar. A retirada não foi registrada.");
      return;
    }
    setSelectedId("");
    setSearch("");
    setQuantidade(0);
    setMotivo("");
    setObservacao("");
  }

  return (
    <main className="screen">
      <h1>Retirada de estoque</h1>
      <section className="panel stack">
        {!selected && (
          <>
            <Input label="Produto" value={search} onChange={setSearch} placeholder="Digite para buscar" autoFocus />
            {query && !matches.length && <p className="miniText">Nenhum produto encontrado.</p>}
            <div className="list">
              {matches.map((product) => (
                <article className="historyCard" key={product.id}>
                  <div>
                    <h3>{product.nome}</h3>
                    <p>{getOperationalCategory(product)} · Estoque: {numberValue(product.estoqueAtual)} {product.unidade}</p>
                  </div>
                  <button className="ghostButton compact" onClick={() => { setSelectedId(product.id); setError(""); }}>Selecionar</button>
                </article>
              ))}
            </div>
          </>
        )}
        {selected && (
          <>
            <div className="sourceBanner">
              <strong>{selected.nome}</strong>
              <span>Estoque atual: {numberValue(selected.estoqueAtual)} {selected.unidade}</span>
            </div>
            <button className="ghostButton compact" onClick={() => setSelectedId("")}>Trocar produto</button>
            <NumberField label={`Quantidade retirada (${selected.unidade})`} value={quantidade} onChange={setQuantidade} />
            <Select label="Sai de qual local" value={local} onChange={setLocal} options={CODIGOS_LOCAIS} />
            <Picker label="Motivo" options={WITHDRAWAL_REASONS} value={motivo} onChange={setMotivo} />
            {MOTIVO_MOVIMENTO[motivo]?.destino === null && (
              <Select label="Repondo qual bar" value={destino} onChange={setDestino} options={DESTINOS_REPOSICAO} />
            )}
            {motivo && (
              <p className="miniText">
                Grava como <strong>{MOTIVO_MOVIMENTO[motivo].tipo}</strong>
                {MOTIVO_MOVIMENTO[motivo].destino === null
                  ? ` — transfere de ${local} para ${destino}. Sai do saldo de um e entra no do outro.`
                  : MOTIVO_MOVIMENTO[motivo].destino
                    ? ` — sai de ${local} e entra em ${MOTIVO_MOVIMENTO[motivo].destino}.`
                    : ` — sai de ${local} e deixa o sistema.`}
              </p>
            )}
            <Input label="Observações" value={observacao} onChange={setObservacao} placeholder="Opcional" />
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="bottomActions inline">
          <button className="ghostButton" onClick={onBack}>Voltar</button>
          <Button onClick={confirm} disabled={!selected || gravando}>
            {gravando ? "Gravando..." : "Confirmar retirada"}
          </Button>
        </div>
      </section>
    </main>
  );
}

function StockScreen({ products, onSync }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("nome");
  const [sortAsc, setSortAsc] = useState(true);
  const [sheetName, setSheetName] = useState("ESTOQUE GERAL");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");
  const query = search.trim().toLowerCase();

  async function syncNow() {
    setSyncing(true);
    setSyncStatus("Consultando a planilha...");
    try {
      const { updated, total } = await onSync(sheetName);
      setSyncStatus(`Estoque atualizado da aba ${sheetName}: ${updated} produtos atualizados (${total} itens lidos).`);
    } catch (error) {
      setSyncStatus(error.message || "Falha ao consultar a planilha.");
    } finally {
      setSyncing(false);
    }
  }

  const rows = products
    .filter((product) => product.ativo && (!query || product.nome.toLowerCase().includes(query)))
    .map((product) => ({
      ...product,
      categoriaOperacional: getOperationalCategory(product),
      estoque: numberValue(product.estoqueAtual),
    }))
    .sort((a, b) => {
      const direction = sortAsc ? 1 : -1;
      if (sortBy === "quantidade") return (a.estoque - b.estoque) * direction;
      if (sortBy === "categoria") return a.categoriaOperacional.localeCompare(b.categoriaOperacional, "pt-BR") * direction;
      return a.nome.localeCompare(b.nome, "pt-BR") * direction;
    });

  function toggleSort(key) {
    if (sortBy === key) setSortAsc(!sortAsc);
    else {
      setSortBy(key);
      setSortAsc(true);
    }
  }

  function stockLevel(product) {
    if (product.estoque <= 0) return "zerado";
    if (numberValue(product.parStock) && product.estoque < numberValue(product.parStock)) return "baixo";
    return "";
  }

  const lowCount = rows.filter((product) => stockLevel(product) === "baixo").length;
  const emptyCount = rows.filter((product) => stockLevel(product) === "zerado").length;

  return (
    <main className="screen">
      <h1>Estoque atual</h1>
      <section className="panel stack">
        <div className="fieldGrid">
          <Select label="Aba da planilha" value={sheetName} onChange={setSheetName} options={["ESTOQUE GERAL", "SEXTA", "SABADO", "DOMINGO"]} />
          <div className="bottomActions inline">
            <Button onClick={syncNow} disabled={syncing}>{syncing ? "Atualizando..." : "Atualizar da planilha"}</Button>
          </div>
        </div>
        {syncStatus && <p className="miniText">{syncStatus}</p>}
      </section>
      <div className="summaryGrid">
        <Metric label="Produtos" value={rows.length} />
        <Metric label="Zerados" value={emptyCount} />
        <Metric label="Abaixo do mínimo" value={lowCount} />
      </div>
      <Input label="Buscar produto" value={search} onChange={setSearch} placeholder="Digite o nome" />
      <div className="quickFilters">
        {[
          ["nome", "Nome"],
          ["categoria", "Categoria"],
          ["quantidade", "Quantidade"],
        ].map(([key, label]) => (
          <button key={key} className={sortBy === key ? "selected" : ""} onClick={() => toggleSort(key)}>
            {label}{sortBy === key ? (sortAsc ? " ↑" : " ↓") : ""}
          </button>
        ))}
      </div>
      {!rows.length && <EmptyState title="Nenhum produto" text="Ajuste a busca para ver outros itens." />}
      <div className="list">
        {rows.map((product) => {
          const level = stockLevel(product);
          return (
            <article className={`historyCard stockRow ${level}`} key={product.id}>
              <div>
                <h3>{product.nome}</h3>
                <p>{product.categoriaOperacional}{numberValue(product.parStock) ? ` · Mínimo ${numberValue(product.parStock)}` : ""}</p>
                {level === "zerado" && <span className="status alert">Estoque zerado</span>}
                {level === "baixo" && <span className="status warn">Abaixo do mínimo</span>}
              </div>
              <strong className="stockQty">{product.estoque} {product.unidade}</strong>
            </article>
          );
        })}
      </div>
    </main>
  );
}

// Converte um produto do app para a linha da aba PRODUTOS. É aqui que a
// unidade vira fixa (correção 3 do item 9): destilado é garrafa sempre, e a
// conversão para dose fica na ficha técnica, não na contagem.
function paraCatalogo(product) {
  const categoria = getOperationalCategory(product);
  const insumoInterno = ["Insumos", "Material", "Copos e taças"].includes(categoria);
  const nome = String(product.nome || "").toLowerCase();
  // O que veio da ficha técnica já declara os dois campos; o resto do
  // catálogo continua sendo inferido como antes.
  const produzido = product.produzido ?? (nome.includes("xarope") || nome.includes("purê") || nome.includes("pure ") || nome.includes("pré-batch"));
  const requisitavel = product.requisitavel ?? !insumoInterno;
  return {
    produtoId: product.id,
    nome: product.nome,
    categoria,
    unidade: product.tipoContagem === "garrafa" ? "garrafa" : product.unidade || "un",
    fatorPack: defaultUnitsPerPack(product),
    packNome: packLabel(product),
    fornecedores: String(product.fornecedor || "").split(",").map((f) => f.trim()).filter(Boolean),
    // Mínimo vazio nunca entra em sugestão de compra — é o caso do
    // Absolut Tabasco, que fica ativo mas fora do pedido.
    minimo: numberValue(product.parStock) || null,
    ativo: product.ativo !== false,
    // Bebida é requisitável, insumo de produção não. Batch pronto é
    // requisitável como qualquer garrafa (Fase 4, B3).
    requisitavel,
    produzido,
  };
}

// Tela da Fase 1: cria as abas PRODUTOS/USUARIOS/MOVIMENTOS na planilha e
// mantém o catálogo único sincronizado. É a base que requisição, produção e
// pedido de compra vão consumir depois.
function BaseScreen({ products, onNotify }) {
  const [catalogo, setCatalogo] = useState([]);
  const [status, setStatus] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function executar(tarefa, rotulo) {
    setOcupado(true);
    setStatus(`${rotulo}...`);
    try {
      const mensagem = await tarefa();
      setStatus(mensagem);
      onNotify(mensagem);
    } catch (error) {
      const mensagem = error.message || `Falha em ${rotulo.toLowerCase()}.`;
      setStatus(mensagem);
      onNotify(mensagem);
    } finally {
      setOcupado(false);
    }
  }

  function criarAbas() {
    return executar(async () => {
      const resultado = await bootstrap({ produtos: products.filter((p) => p.ativo).map(paraCatalogo) });
      return `Abas prontas. ${resultado.produtosCriados} produtos e ${resultado.usuariosCriados} usuário(s) semeados. MOVIMENTOS tem ${resultado.movimentosExistentes} linha(s).`;
    }, "Criando as abas");
  }

  function carregar() {
    return executar(async () => {
      const produtos = await listarCatalogo();
      setCatalogo(produtos);
      return `${produtos.length} produtos lidos da aba PRODUTOS.`;
    }, "Lendo o catálogo");
  }

  function enviar() {
    return executar(async () => {
      const resultado = await salvarCatalogo(products.filter((p) => p.ativo).map(paraCatalogo));
      const produtos = await listarCatalogo();
      setCatalogo(produtos);
      return `Catálogo enviado: ${resultado.criados} criados, ${resultado.atualizados} atualizados.`;
    }, "Enviando o catálogo");
  }

  const requisitaveis = catalogo.filter((produto) => produto.requisitavel).length;
  const semMinimo = catalogo.filter((produto) => produto.minimo === null).length;

  return (
    <main className="screen">
      <h1>Base da planilha</h1>
      <p className="miniText">
        Nenhum módulo tem estoque próprio: todos escrevem em MOVIMENTOS, e o saldo de um produto
        em um local é a soma dos movimentos daquele produto naquele local.
      </p>
      <section className="panel stack">
        <div className="bottomActions inline">
          <Button onClick={criarAbas} disabled={ocupado}>Criar abas</Button>
          <button className="ghostButton" onClick={carregar} disabled={ocupado}>Ler catálogo</button>
          <button className="ghostButton" onClick={enviar} disabled={ocupado}>Enviar catálogo</button>
        </div>
        {status && <p className="miniText">{status}</p>}
      </section>
      {catalogo.length > 0 && (
        <>
          <div className="summaryGrid">
            <Metric label="Produtos" value={catalogo.length} />
            <Metric label="Requisitáveis" value={requisitaveis} />
            <Metric label="Sem mínimo" value={semMinimo} />
          </div>
          <div className="list">
            {catalogo.map((produto) => (
              <article className={`historyCard ${!produto.ativo ? "inactive" : ""}`} key={produto.produtoId}>
                <div>
                  <h3>{produto.nome}</h3>
                  <p>{produto.categoria} · {produto.unidade} · {produto.fatorPack} un/{produto.packNome}</p>
                  <p>
                    Mínimo {produto.minimo === null ? "—" : produto.minimo}
                    {produto.fornecedores.length ? ` · ${produto.fornecedores.join(", ")}` : ""}
                  </p>
                  <span className="status">{produto.requisitavel ? "Requisitável" : "Uso interno"}</span>
                  {produto.produzido && <span className="status warn">Produzido</span>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

// Usuários da planilha: são estes que valem em todos os aparelhos. Os
// usuários locais da tela "Usuários" continuam existindo só como reserva.
function SheetUsersScreen({ onNotify }) {
  const emptyForm = { usuarioId: "", nome: "", login: "", senha: "", perfis: ["consulta"], ativo: true };
  const [usuarios, setUsuarios] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    setOcupado(true);
    try {
      setUsuarios(await listarUsuarios());
      setStatus("");
    } catch (error) {
      setStatus(error.message || "Falha ao ler a aba USUARIOS.");
    } finally {
      setOcupado(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar() {
    if (!form.nome.trim() || !form.login.trim()) {
      setStatus("Preencha nome e login.");
      return;
    }
    if (!form.usuarioId && !form.senha.trim()) {
      setStatus("Defina uma senha para o usuário novo.");
      return;
    }
    if (!form.perfis.length) {
      setStatus("Selecione pelo menos um perfil.");
      return;
    }
    setOcupado(true);
    try {
      await salvarUsuarios([{ ...form, perfil: form.perfis.join(", ") }]);
      setForm(emptyForm);
      await carregar();
      const mensagem = "Usuário salvo na planilha.";
      setStatus(mensagem);
      onNotify(mensagem);
    } catch (error) {
      setStatus(error.message || "Falha ao salvar.");
    } finally {
      setOcupado(false);
    }
  }

  function editar(usuario) {
    // Senha em branco na edição significa "mantém a que já está lá".
    setForm({ usuarioId: usuario.usuarioId, nome: usuario.nome, login: usuario.login, senha: "", perfis: usuario.perfis, ativo: usuario.ativo });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function alternarPerfil(perfil) {
    const perfis = form.perfis.includes(perfil)
      ? form.perfis.filter((item) => item !== perfil)
      : [...form.perfis, perfil];
    setForm({ ...form, perfis });
  }

  return (
    <main className="screen">
      <h1>Usuários da planilha</h1>
      <p className="miniText">
        Senha em planilha não é segurança real — é controle de fluxo e rastreabilidade. Guardamos
        só o hash. Não reutilize senha pessoal de nada.
      </p>
      <section className="panel stack">
        <Input label="Nome" value={form.nome} onChange={(nome) => setForm({ ...form, nome })} />
        <Input label="Login" value={form.login} onChange={(login) => setForm({ ...form, login })} placeholder="daniel" />
        <Input
          label={form.usuarioId ? "Nova senha (deixe vazio para manter)" : "Senha"}
          type="password"
          value={form.senha}
          onChange={(senha) => setForm({ ...form, senha })}
        />
        <section>
          <p className="label">Perfis (um usuário pode acumular)</p>
          <div className="chipGrid">
            {CODIGOS_PERFIS.map((perfil) => (
              <button
                key={perfil}
                type="button"
                className={form.perfis.includes(perfil) ? "selected" : ""}
                onClick={() => alternarPerfil(perfil)}
              >
                {PERFIS[perfil].nome}
              </button>
            ))}
          </div>
          {form.perfis.map((perfil) => (
            <p className="miniText" key={perfil}>{PERFIS[perfil].nome}: {PERFIS[perfil].descricao}</p>
          ))}
        </section>
        <label className="toggle">
          <input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })} />
          Usuário ativo
        </label>
        {status && <p className="warning">{status}</p>}
        <div className="bottomActions inline">
          {form.usuarioId && <button className="ghostButton" onClick={() => setForm(emptyForm)}>Cancelar</button>}
          <Button onClick={salvar} disabled={ocupado}>{form.usuarioId ? "Salvar usuário" : "Cadastrar usuário"}</Button>
        </div>
      </section>
      {!usuarios.length && <EmptyState title="Nenhum usuário na planilha" text="Crie as abas em Base da planilha e cadastre o primeiro usuário." />}
      <div className="list">
        {usuarios.map((usuario) => (
          <article className={`historyCard ${!usuario.ativo ? "inactive" : ""}`} key={usuario.usuarioId}>
            <div>
              <h3>{usuario.nome}</h3>
              <p>{usuario.login} · {rotuloPerfis(usuario.perfis)}</p>
              <span className="status">{usuario.ativo ? "Ativo" : "Inativo"}</span>
            </div>
            <div className="rowActions">
              <button className="ghostButton compact" onClick={() => editar(usuario)}>Editar</button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

// Os produtos que a ficha exige entram no catálogo com id "ficha-<chave>".
// É por aqui que o saldo em MOVIMENTOS volta a falar a língua da receita.
function chaveDaFicha(produtoId) {
  return String(produtoId || "").startsWith("ficha-") ? String(produtoId).slice(6) : null;
}

const emLitros = (ml) => roundCount(ml / 1000);

// 38190.48 ml não se lê na bancada. Acima de mil, sobe para litro ou quilo.
function quantidadeLegivel(valor, unidade) {
  if (unidade === "ml" && valor >= 1000) return `${roundCount(valor / 1000)} L`;
  if (unidade === "g" && valor >= 1000) return `${roundCount(valor / 1000)} kg`;
  return `${roundCount(valor)} ${unidade}`;
}

// Bloco recolhível. Fechado mostra só ícone, nome e quantos itens tem —
// aberto mostra a lista. Na bancada quase sempre interessa um bloco de cada
// vez, então tudo nasce fechado menos o primeiro.
function BlocoDobravel({ icone, titulo, itens, aberto, onToggle, render }) {
  return (
    <section className={`bloco ${aberto ? "aberto" : ""}`}>
      <button type="button" className="blocoHead" onClick={onToggle}>
        <span className="blocoIcone" aria-hidden="true">{icone}</span>
        <strong>{titulo}</strong>
        <span className="blocoContador">{itens.length}</span>
        <span className="blocoSeta" aria-hidden="true">{aberto ? "▾" : "▸"}</span>
      </button>
      {aberto && (
        itens.length
          ? <div className="blocoLista">{itens.map(render)}</div>
          : <p className="blocoVazio">nada aqui</p>
      )}
    </section>
  );
}

function LinhaCalc({ nome, valor, detalhe }) {
  return (
    <p className="linhaCalc">
      <span>{nome}</span>
      {detalhe && <em>{detalhe}</em>}
      <strong>{valor}</strong>
    </p>
  );
}

// Calculadora de pré-batch. Dois modos:
//
//   Sugestão — compara o saldo em PRODUCAO com o par de cada pré-batch e
//              explode a cascata. É o cálculo automático, inalterado.
//   Avulso   — "quero fazer N litros deste aqui": conta de receita pura,
//              sem saldo e sem par, para quem já decidiu o volume.
function PreBatchScreen({ onNotify }) {
  const [modo, setModo] = useState("sugestao");
  const [arredondamento, setArredondamento] = useState("litro");
  const [saldos, setSaldos] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [avulsoId, setAvulsoId] = useState(preBatches()[0]?.id || "");
  const [avulsoLitros, setAvulsoLitros] = useState(1);
  const [abertos, setAbertos] = useState({ prebatch: true });

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const lista = await consultarSaldos();
      const porChave = {};
      lista.forEach((saldo) => {
        const chave = chaveDaFicha(saldo.produtoId);
        if (chave) porChave[chave] = numberValue(saldo.locais?.PRODUCAO);
      });
      setSaldos(porChave);
    } catch (error) {
      setErro(error.message || "Falha ao consultar saldos.");
      onNotify(error.message || "Falha ao consultar saldos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const sugestao = useMemo(
    () => explodirCascata({ saldos: saldos || {}, arredondamento }),
    [saldos, arredondamento]
  );
  const avulso = useMemo(
    () => explodirAvulso({ coquetelId: avulsoId, litros: avulsoLitros }),
    [avulsoId, avulsoLitros]
  );

  const ehSugestao = modo === "sugestao";
  const producoes = (ehSugestao ? sugestao.producoes : avulso.producoes).filter((l) => l.produzir);
  const separacao = ehSugestao ? sugestao.separacao : avulso.separacao;
  const insumos = ehSugestao ? sugestao.insumosBase : avulso.insumosBase;
  const preBatchItens = ehSugestao ? sugestao.preBatches.filter((l) => l.produzir) : avulso.componentes;
  const resumo = resumoDaCascata(sugestao);

  const alternar = (chave) => setAbertos((atual) => ({ ...atual, [chave]: !atual[chave] }));

  return (
    <main className="screen calcScreen">
      <div className="calcTopo">
        <h1>Pré-batch</h1>
        <div className="calcModos">
          <button className={ehSugestao ? "selected" : ""} onClick={() => setModo("sugestao")} title="Sugestão pelo par">
            ⚖<span>Sugestão</span>
          </button>
          <button className={!ehSugestao ? "selected" : ""} onClick={() => setModo("avulso")} title="Cálculo avulso">
            🧮<span>Avulso</span>
          </button>
        </div>
      </div>

      {ehSugestao ? (
        <div className="calcControles">
          <div className="quickFilters compacto">
            <button className={arredondamento === "litro" ? "selected" : ""} onClick={() => setArredondamento("litro")}>L</button>
            <button className={arredondamento === "galao" ? "selected" : ""} onClick={() => setArredondamento("galao")}>Galão 5 L</button>
          </div>
          <button className="iconAcao" onClick={carregar} disabled={carregando} title="Atualizar saldo">
            {carregando ? "…" : "⟳"}
          </button>
          <span className="calcResumo">{resumo.litros} L</span>
        </div>
      ) : (
        <div className="calcControles avulsoControles">
          <div className="chipGrid">
            {preBatches().map((coquetel) => (
              <button
                key={coquetel.id}
                type="button"
                className={avulsoId === coquetel.id ? "selected" : ""}
                onClick={() => setAvulsoId(coquetel.id)}
              >
                {coquetel.nome}
              </button>
            ))}
          </div>
          <label className="calcLitros">
            <input
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              value={avulsoLitros}
              onChange={(event) => setAvulsoLitros(numberValue(event.target.value))}
            />
            <span>litros</span>
          </label>
        </div>
      )}

      {erro && <p className="warning">{erro}</p>}

      <BlocoDobravel
        icone="🥃"
        titulo={ehSugestao ? "Produzir" : "No galão"}
        itens={preBatchItens}
        aberto={Boolean(abertos.prebatch)}
        onToggle={() => alternar("prebatch")}
        render={(item) => (ehSugestao
          ? <LinhaCalc key={item.chave} nome={item.nome} valor={`${emLitros(item.produzir)} L`} detalhe={`par ${emLitros(item.par)}`} />
          : <LinhaCalc key={item.chave} nome={item.nome} valor={quantidadeLegivel(item.ml, "ml")} />
        )}
      />

      <BlocoDobravel
        icone="🧪"
        titulo="Produções"
        itens={producoes}
        aberto={Boolean(abertos.producoes)}
        onToggle={() => alternar("producoes")}
        render={(item) => (
          <LinhaCalc key={item.chave} nome={item.nome} valor={`${emLitros(item.produzir)} L`} detalhe={`${validadeDias(item.chave)}d`} />
        )}
      />

      <BlocoDobravel
        icone="🍾"
        titulo="Do estoque"
        itens={separacao}
        aberto={Boolean(abertos.estoque)}
        onToggle={() => alternar("estoque")}
        render={(item) => (
          <LinhaCalc
            key={item.chave}
            nome={item.nome}
            valor={`${item.unidades} ${item.unidadeEstoque}`}
            detalhe={quantidadeLegivel(item.qtdReceita, item.unidadeReceita)}
          />
        )}
      />

      <BlocoDobravel
        icone="🧂"
        titulo="Insumos"
        itens={insumos}
        aberto={Boolean(abertos.insumos)}
        onToggle={() => alternar("insumos")}
        render={(item) => (
          <LinhaCalc
            key={item.chave}
            nome={item.nome}
            valor={quantidadeLegivel(item.qtdReceita, item.unidadeReceita)}
            detalhe={item.embalagemFechada ? `${item.unidades} ${item.unidadeEstoque}` : ""}
          />
        )}
      />
    </main>
  );
}

// Requisição em duas pernas (Fase 3):
//
//   quem precisa monta o pedido      → PENDENTE, nada sai do estoque
//   o estoquista separa e manda      → baixa em MOVIMENTOS
//
// O estoquista pode reduzir a quantidade ou recusar por falta, nunca aumentar.
// A divergência entre pedido e separado fica registrada, não sobrescrita.
function RequisicoesScreen({ products, user, onNotify }) {
  const [aba, setAba] = useState("abertas");
  const [requisicoes, setRequisicoes] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [separando, setSeparando] = useState(null);

  const podeSeparar = ehAdmin(user) || podeUsuario(user, "separar");
  const nomePorId = useMemo(() => new Map(products.map((p) => [p.id, p.nome])), [products]);
  const nomeDe = (id) => nomePorId.get(id) || id;

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      setRequisicoes(await listarRequisicoes());
    } catch (error) {
      setErro(error.message || "Falha ao consultar requisições.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const abertas = requisicoes.filter((r) => r.status === "PENDENTE");
  const fechadas = requisicoes.filter((r) => r.status !== "PENDENTE");

  if (separando) {
    return (
      <SepararRequisicao
        requisicao={separando}
        nomeDe={nomeDe}
        products={products}
        user={user}
        onCancelar={() => setSeparando(null)}
        onPronto={async (mensagem) => {
          setSeparando(null);
          onNotify(mensagem);
          await carregar();
        }}
      />
    );
  }

  return (
    <main className="screen calcScreen">
      <div className="calcTopo">
        <h1>Requisições</h1>
        <button className="iconAcao" onClick={carregar} disabled={carregando} title="Atualizar">
          {carregando ? "…" : "⟳"}
        </button>
      </div>

      <div className="quickFilters compacto">
        <button className={aba === "abertas" ? "selected" : ""} onClick={() => setAba("abertas")}>
          Em aberto {abertas.length ? `(${abertas.length})` : ""}
        </button>
        <button className={aba === "nova" ? "selected" : ""} onClick={() => setAba("nova")}>Nova</button>
        <button className={aba === "historico" ? "selected" : ""} onClick={() => setAba("historico")}>Histórico</button>
      </div>

      {erro && <p className="warning">{erro}</p>}

      {aba === "nova" && (
        <NovaRequisicao
          products={products}
          user={user}
          onPronto={async (mensagem) => {
            onNotify(mensagem);
            setAba("abertas");
            await carregar();
          }}
        />
      )}

      {aba === "abertas" && (
        <>
          {!abertas.length && !carregando && <EmptyState title="Nada em aberto" text="As requisições pendentes aparecem aqui." />}
          {abertas.map((req) => (
            <CardRequisicao
              key={req.reqId}
              req={req}
              nomeDe={nomeDe}
              acao={podeSeparar ? { rotulo: "Separar", onClick: () => setSeparando(req) } : null}
            />
          ))}
          {!podeSeparar && abertas.length > 0 && (
            <p className="miniText">Seu perfil não separa requisições — só o estoquista e o admin.</p>
          )}
        </>
      )}

      {aba === "historico" && (
        <>
          {!fechadas.length && <EmptyState title="Nenhuma requisição fechada" text="O que já foi separado aparece aqui." />}
          {fechadas.map((req) => <CardRequisicao key={req.reqId} req={req} nomeDe={nomeDe} />)}
        </>
      )}
    </main>
  );
}

const ICONE_STATUS = { PENDENTE: "⏳", SEPARADO: "✅", PARCIAL: "◐", RECUSADO: "✕" };

function CardRequisicao({ req, nomeDe, acao }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className={`bloco ${aberto ? "aberto" : ""}`}>
      <button type="button" className="blocoHead" onClick={() => setAberto(!aberto)}>
        <span className="blocoIcone" aria-hidden="true">{ICONE_STATUS[req.status] || "•"}</span>
        <strong>{req.destino}</strong>
        <span className="blocoContador">{req.itens.length}</span>
        <span className="blocoSeta" aria-hidden="true">{aberto ? "▾" : "▸"}</span>
      </button>
      {aberto && (
        <div className="blocoLista">
          {req.itens.map((item) => (
            <p className="linhaCalc" key={item.produtoId}>
              <span>{nomeDe(item.produtoId)}</span>
              {item.qtdSeparada !== null && item.qtdSeparada !== item.qtdPedida && (
                <em>pedido {item.qtdPedida}</em>
              )}
              <strong>{item.qtdSeparada === null ? item.qtdPedida : item.qtdSeparada}</strong>
            </p>
          ))}
          <p className="miniText">{formatDate(req.data)} · {req.status}</p>
          {acao && (
            <div className="bottomActions inline">
              <Button onClick={acao.onClick}>{acao.rotulo}</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Monta o pedido percorrendo o catálogo por categoria, com campo de
 * quantidade em cada linha. A busca filtra essa mesma lista, então dá para
 * pedir um item avulso ou montar a lista inteira sem trocar de modo.
 *
 * As quantidades ficam guardadas como TEXTO, não como número. Convertendo na
 * hora da digitação, apagar o campo virava zero e a linha sumia do pedido no
 * meio da edição.
 */
function NovaRequisicao({ products, user, onPronto }) {
  const [destino, setDestino] = useState("BAR22");
  const [busca, setBusca] = useState("");
  const [qtds, setQtds] = useState({});
  const [abertas, setAbertas] = useState({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Filtro sem acento: ninguém digita "tônica" no celular atrás do bar.
  const query = normalizeMatchName(busca);
  // Só bebida entra em requisição; insumo de produção a produção puxa direto.
  const disponiveis = products.filter((p) => p.ativo && p.requisitavel !== false);
  const visiveis = query
    ? disponiveis.filter((p) => normalizeMatchName(p.nome).includes(query))
    : disponiveis;

  const categorias = CATEGORIES
    .map((categoria) => ({ categoria, itens: visiveis.filter((p) => getOperationalCategory(p) === categoria) }))
    .filter((grupo) => grupo.itens.length);

  const pedido = Object.keys(qtds)
    .map((id) => ({ id, qtd: numberValue(qtds[id]) }))
    .filter((item) => item.qtd > 0);

  function mudar(id, texto) {
    setQtds((atual) => ({ ...atual, [id]: texto }));
  }

  async function enviar() {
    if (!pedido.length) {
      setErro("Nenhum item com quantidade.");
      return;
    }
    setErro("");
    setEnviando(true);
    try {
      await criarRequisicao({
        reqId: uid("req"),
        destino,
        solicitanteId: user?.id || "",
        data: today(),
        itens: pedido.map((item) => ({ produtoId: item.id, qtd: item.qtd })),
      });
      setQtds({});
      setBusca("");
      onPronto(`Requisição enviada para ${destino}: ${pedido.length} item(ns).`);
    } catch (error) {
      setErro(error.message || "Falha ao enviar a requisição.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <section className="panel stack">
        <Select label="Para qual local" value={destino} onChange={setDestino} options={CODIGOS_LOCAIS} />
        <Input label="Filtrar" value={busca} onChange={setBusca} placeholder="Nome do produto" />
      </section>

      {/* Resumo colado no topo: o que já entrou no pedido, sem precisar rolar. */}
      {pedido.length > 0 && (
        <section className="bloco aberto pedidoResumo">
          <div className="blocoHead estatico">
            <span className="blocoIcone" aria-hidden="true">📋</span>
            <strong>Pedido</strong>
            <span className="blocoContador">{pedido.length}</span>
          </div>
          <div className="blocoLista">
            {pedido.map((item) => (
              <p className="linhaCalc" key={item.id}>
                <span>{products.find((p) => p.id === item.id)?.nome || item.id}</span>
                <strong>{item.qtd}</strong>
                <button className="ghostButton compact" onClick={() => mudar(item.id, "")}>×</button>
              </p>
            ))}
          </div>
        </section>
      )}

      {!categorias.length && <EmptyState title="Nada encontrado" text="Ajuste o filtro." />}

      {categorias.map((grupo, indice) => {
        // Com filtro ativo tudo abre; sem filtro, só a primeira categoria.
        const aberta = query ? true : (abertas[grupo.categoria] ?? indice === 0);
        return (
          <section className={`bloco ${aberta ? "aberto" : ""}`} key={grupo.categoria}>
            <button
              type="button"
              className="blocoHead"
              onClick={() => setAbertas((a) => ({ ...a, [grupo.categoria]: !aberta }))}
            >
              <strong>{grupo.categoria}</strong>
              <span className="blocoContador">{grupo.itens.length}</span>
              <span className="blocoSeta" aria-hidden="true">{aberta ? "▾" : "▸"}</span>
            </button>
            {aberta && (
              <div className="blocoLista">
                {grupo.itens.map((produto) => (
                  <div className="linhaCalc" key={produto.id}>
                    <span>{produto.nome}</span>
                    <em>{produto.unidade}</em>
                    <input
                      className="qtdInline"
                      type="number"
                      min="0"
                      inputMode="decimal"
                      placeholder="0"
                      value={qtds[produto.id] ?? ""}
                      onChange={(event) => mudar(produto.id, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {erro && <p className="error">{erro}</p>}
      <div className="bottomActions">
        <Button onClick={enviar} disabled={enviando || !pedido.length}>
          {enviando ? "Enviando..." : `Enviar${pedido.length ? ` (${pedido.length})` : ""}`}
        </Button>
      </div>
    </>
  );
}

// Tela do estoquista. Vem preenchida com o que foi pedido; ele reduz o que
// faltar e zera o que não tem. Nunca dá para aumentar.
//
// As quantidades também ficam como texto aqui, pelo mesmo motivo: apagar para
// redigitar não pode zerar o item nem embaralhar a tela.
function SepararRequisicao({ requisicao, nomeDe, user, onCancelar, onPronto }) {
  const [qtds, setQtds] = useState(
    () => Object.fromEntries(requisicao.itens.map((item) => [item.produtoId, String(item.qtdPedida)]))
  );
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  function mudar(produtoId, texto, pedida) {
    // Campo vazio fica vazio enquanto edita; o teto é o que foi pedido.
    if (texto === "") return setQtds((a) => ({ ...a, [produtoId]: "" }));
    const numero = Math.max(0, Math.min(pedida, numberValue(texto)));
    setQtds((a) => ({ ...a, [produtoId]: String(numero) }));
  }

  const separados = requisicao.itens.filter((item) => numberValue(qtds[item.produtoId]) > 0).length;

  async function enviar() {
    setErro("");
    setEnviando(true);
    try {
      const resultado = await separarRequisicao({
        reqId: requisicao.reqId,
        separadorId: user?.id || "",
        itens: requisicao.itens.map((item) => ({
          produtoId: item.produtoId,
          qtdSeparada: numberValue(qtds[item.produtoId]),
        })),
      });
      onPronto(`Separado para ${requisicao.destino}: ${resultado.movimentosGravados} item(ns) baixados. Status ${resultado.status}.`);
    } catch (error) {
      setErro(error.message || "Falha ao separar. Nada foi baixado.");
      setEnviando(false);
    }
  }

  return (
    <main className="screen calcScreen">
      <div className="calcTopo">
        <h1>Separar</h1>
        <button className="iconAcao" onClick={onCancelar} title="Voltar">←</button>
      </div>
      <p className="miniText">
        Para <strong>{requisicao.destino}</strong> · {formatDate(requisicao.data)}. Reduza o que faltar
        e zere o que não tiver. Ao mandar, o estoque baixa.
      </p>

      <section className="panel stack">
        {requisicao.itens.map((item) => (
          <div className="linhaCalc" key={item.produtoId}>
            <span>{nomeDe(item.produtoId)}</span>
            <em>pediu {item.qtdPedida}</em>
            <input
              className="qtdInline"
              type="number"
              min="0"
              max={item.qtdPedida}
              inputMode="decimal"
              placeholder="0"
              value={qtds[item.produtoId] ?? ""}
              onChange={(event) => mudar(item.produtoId, event.target.value, item.qtdPedida)}
            />
          </div>
        ))}
        {erro && <p className="error">{erro}</p>}
        <div className="bottomActions inline">
          <button className="ghostButton" onClick={onCancelar}>Cancelar</button>
          <Button onClick={enviar} disabled={enviando}>
            {enviando ? "Baixando..." : `Mandar e baixar (${separados})`}
          </Button>
        </div>
      </section>
    </main>
  );
}

// Consulta de ficha técnica. Leitura pura, pensada para tablet no meio do
// serviço: alvo de toque grande, busca instantânea e nada de scroll infinito.
//
// Campo EM ABERTO nunca vira string vazia nem some: quem consulta precisa
// distinguir "não leva garnish" de "ninguém preencheu o garnish ainda".
function FichasScreen() {
  const [aba, setAba] = useState("coqueteis");
  const [busca, setBusca] = useState("");
  const [abertoId, setAbertoId] = useState("");
  const query = busca.trim().toLowerCase();
  const pendencias = useMemo(() => resumoDePendencias(), []);

  const coqueteis = COQUETEIS.filter((item) => !query || item.nome.toLowerCase().includes(query));
  const producoes = PRODUCOES.filter((item) => !query || item.nome.toLowerCase().includes(query));
  const lista = aba === "coqueteis" ? coqueteis : producoes;

  function alternar(id) {
    setAbertoId((atual) => (atual === id ? "" : id));
  }

  return (
    <main className="screen fichasScreen">
      <h1>Fichas técnicas</h1>
      {pendencias.total > 0 && (
        <p className="warning">
          {pendencias.total} campos ainda EM ABERTO na ficha. Aparecem marcados em cada receita.
        </p>
      )}
      <Input label="Buscar" value={busca} onChange={setBusca} placeholder="Nome do coquetel ou da produção" autoFocus />
      <div className="quickFilters">
        <button className={aba === "coqueteis" ? "selected" : ""} onClick={() => setAba("coqueteis")}>
          Coquetéis ({coqueteis.length})
        </button>
        <button className={aba === "producoes" ? "selected" : ""} onClick={() => setAba("producoes")}>
          Produções ({producoes.length})
        </button>
      </div>

      {!lista.length && <EmptyState title="Nada encontrado" text="Tente outro nome." />}

      <div className="fichaList">
        {aba === "coqueteis" && coqueteis.map((coquetel) => (
          <FichaCoquetel
            key={coquetel.id}
            coquetel={coquetel}
            aberto={abertoId === coquetel.id}
            onToggle={() => alternar(coquetel.id)}
          />
        ))}
        {aba === "producoes" && producoes.map((producao) => (
          <FichaProducao
            key={producao.id}
            producao={producao}
            aberto={abertoId === producao.id}
            onToggle={() => alternar(producao.id)}
          />
        ))}
      </div>
    </main>
  );
}

function CampoFicha({ rotulo, valor }) {
  const aberto = estaEmAberto(valor);
  return (
    <p className={`fichaCampo ${aberto ? "emAberto" : ""}`}>
      <span>{rotulo}</span>
      {aberto ? "EM ABERTO" : valor}
    </p>
  );
}

function LinhaReceita({ linha }) {
  const insumo = insumoPorChave(linha.insumo);
  const emLatas = insumo?.unidadeEstoque === "lata";
  return (
    <p className="fichaLinha">
      <span>{nomeDaReferencia(linha.insumo)}</span>
      <strong>{emLatas ? `${linha.ml} lata` : `${linha.ml} ml`}</strong>
      {linha.obs && <em>{linha.obs}</em>}
    </p>
  );
}

function FichaCoquetel({ coquetel, aberto, onToggle }) {
  const totalBatch = totalDoBatch(coquetel.id);
  const totalServico = totalDoServico(coquetel.id);
  const pendentes = pendenciasDoCoquetel(coquetel);
  const foraDaOP = batchavelForaDaOP(coquetel);

  return (
    <article className={`fichaCard ${aberto ? "isOpen" : ""}`}>
      <button className="fichaHead" type="button" onClick={onToggle}>
        <div>
          <h2>{coquetel.nome}</h2>
          <span>
            {coquetel.preBatch
              ? `Pré-batch · par ${coquetel.parLitros} L (${parEmGaloes(coquetel.id)} galões)`
              : "Montado na hora"}
            {totalBatch ? ` · ${totalBatch} ml/dose · ${dosesPorGalao(coquetel.id)} doses/galão` : ""}
          </span>
        </div>
        <em>{aberto ? "−" : "+"}</em>
      </button>
      {aberto && (
        <div className="fichaBody">
          {totalBatch > 0 && (
            <section className="fichaBloco batch">
              <h3>Vai no batch</h3>
              {coquetel.batch.map((linha) => <LinhaReceita key={linha.insumo} linha={linha} />)}
              <p className="fichaLinha total">
                <span>Total por dose</span>
                <strong>{totalBatch} ml</strong>
              </p>
            </section>
          )}

          <section className="fichaBloco servico">
            <h3>{totalBatch ? "Entra no serviço" : "Montagem no serviço"}</h3>
            {estaEmAberto(coquetel.servico) ? (
              <p className="fichaCampo emAberto"><span>Composição</span>EM ABERTO</p>
            ) : coquetel.servico.length ? (
              <>
                {coquetel.servico.map((linha) => <LinhaReceita key={linha.insumo} linha={linha} />)}
                {servicoTemTotal(coquetel.id) && (
                  <p className="fichaLinha total">
                    <span>Total por dose</span>
                    <strong>{totalServico} ml</strong>
                  </p>
                )}
              </>
            ) : (
              <p className="miniText">Pré-batch 100% — nada é acrescentado na hora.</p>
            )}
          </section>

          <CampoFicha rotulo="Método" valor={coquetel.metodo} />
          <CampoFicha rotulo="Copo" valor={coquetel.copo} />
          <CampoFicha rotulo="Garnish" valor={coquetel.garnish} />
          {coquetel.preBatch && <CampoFicha rotulo="Validade do batch" valor={`${validadeDias(coquetel.id)} dias a partir da produção`} />}

          {foraDaOP && (
            <p className="fichaPendencia">
              Tem parte batcheável, mas está fora da rotação da ordem de produção: montado na hora,
              sem par definido. A ficha ainda o classifica como pré-batch.
            </p>
          )}
          {pendentes.length > 0 && (
            <p className="fichaPendencia">⚠ Falta preencher: {pendentes.join(", ")}.</p>
          )}
        </div>
      )}
    </article>
  );
}

function FichaProducao({ producao, aberto, onToggle }) {
  const fatores = fatoresDe(producao.id);
  const galoes = rendimentoEmGaloes(producao.id);
  const pendentes = pendenciasDaProducao(producao);
  const intermediaria = ehIntermediaria(producao.id);

  return (
    <article className={`fichaCard ${aberto ? "isOpen" : ""}`}>
      <button className="fichaHead" type="button" onClick={onToggle}>
        <div>
          <h2>{producao.nome}</h2>
          <span>
            Rende {producao.rendimento / 1000} L · {validadeDias(producao.id)} dias
            {intermediaria ? " · insumo de outra produção" : ""}
          </span>
        </div>
        <em>{aberto ? "−" : "+"}</em>
      </button>
      {aberto && (
        <div className="fichaBody">
          <section className="fichaBloco batch">
            <h3>Receita</h3>
            {fatores.map((linha) => (
              <p className="fichaLinha" key={linha.chave}>
                <span>{linha.nome}</span>
                <strong>{linha.qtd} {linha.unidade}</strong>
                <em>{roundCount(linha.porLitro)} {linha.unidade}/L</em>
              </p>
            ))}
            <p className="fichaLinha total">
              <span>Rendimento</span>
              <strong>{producao.rendimento} ml</strong>
              <em>{roundCount(galoes)} galão de 5 L</em>
            </p>
          </section>

          <CampoFicha rotulo="Método" valor={producao.metodo} />
          <CampoFicha rotulo="Conservação" valor={producao.conservacao} />
          <CampoFicha rotulo="Validade" valor={`${validadeDias(producao.id)} dias`} />
          {producao.perda && <CampoFicha rotulo="Perda" valor={producao.perda} />}
          {producao.observacao && <CampoFicha rotulo="Observação" valor={producao.observacao} />}
          <p className="miniText">Etiqueta obrigatória: data de produção + data de validade.</p>

          {intermediaria && (
            <p className="miniText">
              Consumido por outra produção — produzir antes do que depende dele.
            </p>
          )}
          {pendentes.length > 0 && (
            <p className="fichaPendencia">⚠ Falta preencher: {pendentes.join(", ")}.</p>
          )}
        </div>
      )}
    </article>
  );
}

// Leitura de MOVIMENTOS enquanto a Fase 2 acumula histórico. Não é o painel
// da Fase 5 — é o mínimo para conferir que o espelho está gravando certo.
function MovementsScreen({ products, onNotify }) {
  const [aba, setAba] = useState("saldos");
  const [saldos, setSaldos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [local, setLocal] = useState("");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [status, setStatus] = useState("");

  const nomePorId = useMemo(() => new Map(products.map((product) => [product.id, product.nome])), [products]);
  const nomeDe = (produtoId) => nomePorId.get(produtoId) || produtoId;

  async function carregar() {
    setCarregando(true);
    setStatus("Consultando a planilha...");
    try {
      const [saldosResultado, movimentosResultado] = await Promise.all([
        consultarSaldos(),
        listarMovimentos(local ? { local } : {}),
      ]);
      setSaldos(saldosResultado);
      setMovimentos(movimentosResultado);
      setStatus(`${saldosResultado.length} produto(s) com saldo · ${movimentosResultado.length} movimento(s).`);
    } catch (error) {
      setStatus(error.message || "Falha ao consultar MOVIMENTOS.");
      onNotify(error.message || "Falha ao consultar MOVIMENTOS.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [local]);

  const query = busca.trim().toLowerCase();
  const saldosVisiveis = saldos
    .filter((saldo) => !query || nomeDe(saldo.produtoId).toLowerCase().includes(query))
    .filter((saldo) => !local || numberValue(saldo.locais[local]))
    .sort((a, b) => nomeDe(a.produtoId).localeCompare(nomeDe(b.produtoId), "pt-BR"));

  const movimentosVisiveis = movimentos
    .filter((movimento) => !query || nomeDe(movimento.produtoId).toLowerCase().includes(query))
    .slice()
    .reverse()
    .slice(0, 200);

  // A quebra do período é a soma dos ajustes que as contagens geraram.
  const quebra = roundCount(movimentos
    .filter((movimento) => movimento.tipo === "AJUSTE")
    .reduce((total, movimento) => total + numberValue(movimento.qtd), 0));

  return (
    <main className="screen">
      <h1>Movimentos</h1>
      <p className="miniText">
        Saldo é sempre calculado: soma do que entrou menos o que saiu de cada local. As linhas
        de CONTAGEM registram a conferência e ficam fora da conta; quem move o saldo é o AJUSTE
        que a contagem gera, e é ele que mede a quebra.
      </p>
      <div className="quickFilters">
        <button className={aba === "saldos" ? "selected" : ""} onClick={() => setAba("saldos")}>Saldos</button>
        <button className={aba === "movimentos" ? "selected" : ""} onClick={() => setAba("movimentos")}>Lançamentos</button>
      </div>
      <div className="filterGrid">
        <Input label="Produto" value={busca} onChange={setBusca} placeholder="Buscar por nome" />
        <Select label="Local" value={local} onChange={setLocal} options={["", ...CODIGOS_LOCAIS]} />
      </div>
      <div className="summaryGrid">
        <Metric label="Produtos" value={saldosVisiveis.length} />
        <Metric label="Movimentos" value={movimentos.length} />
        <Metric label="Quebra acumulada" value={quebra} />
      </div>
      <div className="bottomActions inline">
        <button className="ghostButton" onClick={carregar} disabled={carregando}>{carregando ? "Atualizando..." : "Atualizar"}</button>
      </div>
      {status && <p className="miniText">{status}</p>}

      {aba === "saldos" && (
        <>
          {!saldosVisiveis.length && <EmptyState title="Nenhum saldo ainda" text="Envie uma contagem para MOVIMENTOS começar a acumular." />}
          <div className="list">
            {saldosVisiveis.map((saldo) => (
              <article className="historyCard" key={saldo.produtoId}>
                <div>
                  <h3>{nomeDe(saldo.produtoId)}</h3>
                  <p>
                    {Object.keys(saldo.locais)
                      .filter((codigo) => saldo.locais[codigo])
                      .map((codigo) => `${codigo}: ${saldo.locais[codigo]}`)
                      .join(" · ") || "sem saldo em nenhum local"}
                  </p>
                </div>
                <strong className="stockQty">{local ? numberValue(saldo.locais[local]) : saldo.consolidado}</strong>
              </article>
            ))}
          </div>
        </>
      )}

      {aba === "movimentos" && (
        <>
          {!movimentosVisiveis.length && <EmptyState title="Nenhum movimento" text="As contagens enviadas aparecem aqui." />}
          <div className="list">
            {movimentosVisiveis.map((movimento) => (
              <article className="historyCard" key={movimento.movId}>
                <div>
                  <h3>{nomeDe(movimento.produtoId)}</h3>
                  <p>
                    {movimento.qtd > 0 ? "+" : ""}{movimento.qtd} {movimento.unidade}
                    {movimento.origem ? ` · de ${movimento.origem}` : ""}
                    {movimento.destino ? ` · para ${movimento.destino}` : ""}
                  </p>
                  <p>{new Date(movimento.timestamp).toLocaleString("pt-BR")}{movimento.usuarioId ? ` · ${movimento.usuarioId}` : ""}</p>
                  {movimento.obs && <p>{movimento.obs}</p>}
                  <span className={`status ${movimento.tipo === "AJUSTE" ? "warn" : ""}`}>{movimento.tipo}</span>
                </div>
              </article>
            ))}
          </div>
          {movimentos.length > movimentosVisiveis.length && (
            <p className="miniText">Mostrando os 200 mais recentes de {movimentos.length}.</p>
          )}
        </>
      )}
    </main>
  );
}

function InfoGrid({ inventory }) {
  return (
    <section className="infoGrid">
      <p><span>Líder</span>{inventory.lider}</p>
      <p><span>Data</span>{formatDate(inventory.data)}</p>
      <p><span>Bar</span>{inventory.bar}</p>
      <p><span>Turno</span>{inventory.turno}</p>
      <p><span>Tipo</span>{inventory.tipo}</p>
      <p><span>Modelo</span>{inventory.origemPlanilha}</p>
    </section>
  );
}

function ReviewList({ items }) {
  const sections = CATEGORIES.map((category) => {
    const sectionItems = items.filter((item) => getOperationalCategory(item) === category);
    const counted = sectionItems.filter((item) => item.fechamentoContado).length;
    return { category, items: sectionItems, counted };
  }).filter((section) => section.items.length);

  return (
    <div className="reviewList compactReview">
      {sections.map((section) => (
        <section className="reviewSection" key={section.category}>
          <div className="reviewSectionHead">
            <strong>{section.category}</strong>
            <span>{section.counted}/{section.items.length}</span>
          </div>
          {section.items.map((item) => (
            <article key={item.produtoId} className={`reviewItem compactItem ${!item.fechamentoContado ? "isPending" : ""}`}>
              <strong>{item.nome}</strong>
              <span>{item.fechamentoContado ? "Contado" : "Pendente"}</span>
              <p>{item.quantidade || 0}</p>
              {item.observacao && <em>{item.observacao}</em>}
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Button({ children, variant = "primary", ...props }) {
  return <button className={`button ${variant}`} {...props}>{children}</button>;
}

function Input({ label, value, onChange, type = "text", ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} {...props} />
    </label>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        min="0"
        step="any"
        inputMode="decimal"
        type="number"
        value={numberValue(value) === 0 ? "" : value}
        onChange={(event) => onChange(numberValue(event.target.value))}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option || "empty"} value={option}>{option || "Todos"}</option>)}
      </select>
    </label>
  );
}

function Picker({ label, options, value, onChange, featured }) {
  return (
    <section>
      <p className="label">{label}</p>
      <div className={featured ? "barPicker" : "picker"}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={value === option ? "selected" : ""}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ title, text }) {
  return (
    <section className="emptyState">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
