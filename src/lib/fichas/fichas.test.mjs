// Validação do Módulo A. Roda com: node src/lib/fichas/fichas.test.mjs
//
// O teste que importa é o último: a cascata montada a partir dos dados deste
// módulo tem que reproduzir os 18 números canônicos do escopo da Fase 4. Se
// divergir, o dado aqui está errado — não o teste.
import { explodirCascata } from "./cascata.js";
import {
  PLANILHA_DESATUALIZADA,
  PRODUCOES,
  batchavelForaDaOP,
  coquetelPorId,
  dosesPorGalao,
  ehIntermediaria,
  fatorPorLitro,
  montadosNaHora,
  ordemDeProducao,
  parEmGaloes,
  pendenciasDoCoquetel,
  preBatches,
  produtosExigidos,
  rendimentoEmGaloes,
  resumoDePendencias,
  totalDoBatch,
  totalDoServico,
  validadeDias,
  validarFichas,
} from "./index.js";

let falhas = 0;
function ok(rotulo, obtido, esperado, tolerancia = 0) {
  const bate = typeof esperado === "number"
    ? Math.abs(obtido - esperado) <= tolerancia
    : JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bate) falhas += 1;
  const valor = typeof obtido === "number" ? obtido.toFixed(2) : JSON.stringify(obtido);
  console.log(`${bate ? "OK    " : "FALHOU"} ${rotulo.padEnd(46)} ${String(valor).padStart(10)}${bate ? "" : `  (esperado ${JSON.stringify(esperado)})`}`);
}

console.log("--- consistência da ficha ---");
ok("nenhum problema de validação", validarFichas(), []);
ok("5 pré-batches ativos", preBatches().length, 5);
ok("9 montados na hora", montadosNaHora().length, 9);
ok("6 produções", PRODUCOES.length, 6);

console.log("\n--- fator derivado, nunca guardado ---");
// Xarope de açúcar: 1000 g de açúcar para 1200 ml => 833,33 g por litro.
ok("açúcar por litro de xarope", fatorPorLitro("prod-xarope-acucar", "acucar"), 833.33, 0.01);
// Manjericão: 7000 ml de xar. açúcar para 6500 ml => 1076,92 ml por litro.
ok("xar. açúcar por litro de manjericão", fatorPorLitro("prod-xarope-manjericao", "prod-xarope-acucar"), 1076.92, 0.01);
ok("gengibre por litro de extrato", fatorPorLitro("prod-extrato-gengibre", "gengibre"), 2857.14, 0.01);

console.log("\n--- dependência e classificação ---");
const ordem = ordemDeProducao();
ok("xarope de açúcar sai por último", ordem[ordem.length - 1], "prod-xarope-acucar");
ok("manjericão antes do açúcar", ordem.indexOf("prod-xarope-manjericao") < ordem.indexOf("prod-xarope-acucar"), true);
ok("framboesa antes do açúcar", ordem.indexOf("prod-xarope-framboesa") < ordem.indexOf("prod-xarope-acucar"), true);
ok("açúcar é intermediário", ehIntermediaria("prod-xarope-acucar"), true);
ok("mel não é intermediário", ehIntermediaria("prod-xarope-mel"), false);

console.log("\n--- rendimento, validade e dose ---");
ok("xar. açúcar em galões de 5 L", rendimentoEmGaloes("prod-xarope-acucar"), 0.24, 0.001);
ok("validade do capim-limão (ponta conservadora)", validadeDias("prod-extrato-capim"), 3);
ok("validade de pré-batch pronto", validadeDias("cq-negroni"), 30);
ok("dose do Santa Cachaça", totalDoBatch("cq-santa-cachaca"), 110);
ok("dose do Negroni", totalDoBatch("cq-negroni"), 90);

console.log("\n--- catálogo exigido pela ficha ---");
const exigidos = produtosExigidos();
const produzidos = exigidos.filter((p) => p.produzido);
ok("11 produtos produzidos (6 produções + 5 batches)", produzidos.length, 11);
ok("todo produzido é requisitável", produzidos.every((p) => p.requisitavel), true);
ok("todo produzido tem unidade fixa em ml", produzidos.every((p) => p.unidade === "ml"), true);
ok("par do Negroni em ml", exigidos.find((p) => p.chave === "cq-negroni").minimo, 16000);
ok("par de serviço do xar. açúcar", exigidos.find((p) => p.chave === "prod-xarope-acucar").minimo, 16000);
ok("água não vira produto de estoque", exigidos.some((p) => p.chave === "agua"), false);

console.log("\n=== TESTE DE ACEITE: saldo zero, par cheio, arredondamento em litro ===");
const r = explodirCascata({ saldos: {}, arredondamento: "litro" });
const litros = (chave) => (r.producoes.find((p) => p.chave === chave)?.produzir ?? 0) / 1000;
const unidades = (chave) => r.separacao.find((s) => s.chave === chave)?.unidades ?? 0;
const base = (chave) => r.insumosBase.find((s) => s.chave === chave);

console.log("PRODUZIR (L)");
ok("Xar. açúcar", litros("prod-xarope-acucar"), 39.40, 0.006);
ok("Xar. mel", litros("prod-xarope-mel"), 6.57, 0.006);
ok("Xar. framboesa", litros("prod-xarope-framboesa"), 7.67, 0.006);
ok("Xar. manjericão", litros("prod-xarope-manjericao"), 8.00, 0.006);
ok("Ext. capim-limão", litros("prod-extrato-capim"), 6.27, 0.006);
ok("Ext. gengibre", litros("prod-extrato-gengibre"), 2.09, 0.006);

console.log("SUBIR DO ESTOQUE (unidades fechadas)");
ok("Gin Tanqueray", unidades("tanqueray"), 51);
ok("Vodka Ketel One", unidades("ketel-one"), 16);
ok("Ypioca Ouro", unidades("ypioca-ouro"), 11);
ok("Martini Rosso", unidades("martini-rosso"), 8);
ok("Campari", unidades("campari"), 6);

console.log("INSUMOS BASE");
ok("Açúcar (kg)", base("acucar").qtdReceita / 1000, 32.84, 0.006);
ok("Mel (L)", base("mel").qtdReceita / 1000, 4.87, 0.006);
ok("Gengibre (kg)", base("gengibre").qtdReceita / 1000, 5.97, 0.006);
ok("Purê Monin (L)", base("pure-monin").qtdReceita / 1000, 4.04, 0.006);
ok("Glucose (L)", base("glucose").qtdReceita / 1000, 1.05, 0.006);
ok("Capim-limão (g)", base("capim-limao").qtdReceita, 523, 0.5);
ok("Manjericão (g)", base("manjericao").qtdReceita, 431, 0.5);
ok("água fora da lista de insumos base", base("agua"), undefined);

console.log("\n--- armadilhas que o escopo avisa ---");
ok("prateleira somada, não descontada (≠ 23,40)", litros("prod-xarope-acucar") - 16 > 23.39, true);
const comSaldo = explodirCascata({ saldos: { "cq-negroni": 16000 }, arredondamento: "litro" });
ok("pré-batch no par não é produzido", comSaldo.preBatches.find((p) => p.chave === "cq-negroni").produzir, 0);
ok("e some das garrafas (Campari zera)", comSaldo.separacao.find((s) => s.chave === "campari")?.unidades ?? 0, 0);
const galao = explodirCascata({ saldos: {}, arredondamento: "galao" });
// Negroni tem par 16 L; em galão de 5 L isso sobe para 20 L.
ok("galão: Negroni 16 L vira 20 L", galao.preBatches.find((p) => p.chave === "cq-negroni").produzir, 20000);
// Os demais têm par 23 L, que em galão vira 25 L.
ok("galão: Santa Cachaça 23 L vira 25 L", galao.preBatches.find((p) => p.chave === "cq-santa-cachaca").produzir, 25000);

console.log("\n--- cruzamento com os números impressos na ficha ---");
// A ficha imprime "Rende por galão de 5 L". Derivamos e conferimos.
ok("Santa Cachaça: doses/galão", dosesPorGalao("cq-santa-cachaca"), 45);
ok("Afrodite: doses/galão", dosesPorGalao("cq-afrodite"), 66);
ok("Fitz Gerald: doses/galão", dosesPorGalao("cq-fitz-gerald"), 71);
ok("Ephigenia: doses/galão", dosesPorGalao("cq-ephigenia"), 71);
ok("Negroni: doses/galão", dosesPorGalao("cq-negroni"), 55);
ok("par de 23 L em galões", parEmGaloes("cq-santa-cachaca"), 4.6, 0.001);
// A ficha imprime o total por dose de batch e de serviço.
ok("Ephigenia: 70 no batch, 50 na hora", [totalDoBatch("cq-ephigenia"), totalDoServico("cq-ephigenia")], [70, 50]);
ok("Golden Jack: 70 no batch, 45 na hora", [totalDoBatch("cq-golden-jack"), totalDoServico("cq-golden-jack")], [70, 45]);
ok("Old Fashioned: 0 no batch, 74 na hora", [totalDoBatch("cq-old-fashioned"), totalDoServico("cq-old-fashioned")], [0, 74]);

console.log("\n--- divergências entre a ficha e o escopo ---");
// A ficha classifica estes três como pré-batch; o escopo diz montados na hora.
ok("Apollo/Golden/Basil fora da rotação da OP", PLANILHA_DESATUALIZADA.classificadosErradoComoPreBatch.every((id) => !coquetelPorId(id).preBatch), true);
ok("mas a receita deles não se perdeu", PLANILHA_DESATUALIZADA.classificadosErradoComoPreBatch.every((id) => batchavelForaDaOP(coquetelPorId(id))), true);
ok("Negroni fica com o par 16 L do escopo", coquetelPorId("cq-negroni").parLitros, 16);
ok("Negroni é 100% batch: nada no serviço", totalDoServico("cq-negroni"), 0);
// Manjericão só é puxado pela prateleira de serviço; se o Basil Smash entrasse
// na OP a demanda subiria e o teste de aceite quebraria.
ok("manjericão fica nos 8 L da prateleira", litros("prod-xarope-manjericao"), 8.00, 0.006);

console.log("\n--- pendências que sobraram na ficha ---");
const pendencias = resumoDePendencias();
console.log(`      ${pendencias.total} campos EM ABERTO em ${pendencias.coqueteis.length} coquetéis e ${pendencias.producoes.length} produções.`);
pendencias.coqueteis.forEach((item) => console.log(`      ${item.nome}: ${item.campos.join(", ")}`));
ok("lista vazia de serviço não vira pendência", pendenciasDoCoquetel(coquetelPorId("cq-negroni")).includes("Composição do serviço"), false);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nMÓDULO A VALIDADO — teste de aceite reproduzido integralmente");
process.exit(falhas ? 1 : 0);
