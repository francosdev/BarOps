// Testes de aceite dos blocos D (avisos) e E1/E3/E4 (requisição), rodando o
// Code.gs de verdade contra uma planilha simulada.
import { carregarCodeGs } from "./gas-fake.mjs";

const { contexto: g, planilha: ss } = carregarCodeGs(new URL("../Code.gs", import.meta.url));

let falhas = 0;
function ok(rotulo, obtido, esperado) {
  const bate = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bate) falhas += 1;
  console.log(`${bate ? "OK    " : "FALHOU"} ${rotulo.padEnd(60)} ${JSON.stringify(obtido)}${bate ? "" : `  (esperado ${JSON.stringify(esperado)})`}`);
}
const linhas = (aba) => g.lerAba(ss, aba).length;

// --- cenário: o time com os papéis do seed --------------------------------
g.migrarUsuariosEPapeis();
console.log("--- papéis ---");
const usuarios = g.rotaUsuariosListar().usuarios;
ok("cinco pessoas em USUARIOS", usuarios.length, 5);
ok("Franco é ADMIN", usuarios.find((u) => u.login === "franco").papel, "ADMIN");
ok("Jon é o SEPARADOR", g.usuariosComPapelOperacional("SEPARADOR"), ["jon"]);
ok("Yvison atribui tarefa", usuarios.find((u) => u.login === "yvison").podeAtribuirTarefa, true);
ok("Daniel não atribui", usuarios.find((u) => u.login === "daniel").podeAtribuirTarefa, false);
ok("rodar de novo não duplica", (g.migrarUsuariosEPapeis(), g.rotaUsuariosListar().usuarios.length), 5);

g.garantirAba(ss, "PRODUTOS");
ss.getSheetByName("PRODUTOS").appendRow(["p-gin", "Gin Tanqueray", "Gin", "garrafa", 12, "caixa", "FRONT", 10, true, true, false]);
ss.getSheetByName("PRODUTOS").appendRow(["p-corona", "Cerveja Corona", "Cervejas", "un", 24, "fardo", "AMBEV", 2160, true, true, false]);

console.log("\n--- E1: requisição só aceita inteiro ---");
const comFracao = g.rotaRequisicoesCriar({
  destino: "BAR22", solicitanteId: "daniel", criadoPor: "daniel",
  itens: [{ produtoId: "p-gin", produto: "Gin Tanqueray", qtd: 2.5 }, { produtoId: "p-corona", produto: "Cerveja Corona", qtd: 24 }],
});
ok("2,5 é rejeitado", comFracao.ok, false);
ok("a mensagem nomeia o item", /Gin Tanqueray \(2\.5\)/.test(comFracao.error), true);
ok("a requisição inteira não grava", linhas("REQUISICOES"), 0);
ok("zero é rejeitado", g.rotaRequisicoesCriar({ destino: "BAR22", solicitanteId: "daniel", itens: [{ produtoId: "p-gin", qtd: 0 }] }).ok, false);
ok("texto é rejeitado", g.rotaRequisicoesCriar({ destino: "BAR22", solicitanteId: "daniel", itens: [{ produtoId: "p-gin", qtd: "abc" }] }).ok, false);
ok("negativo é rejeitado", g.rotaRequisicoesCriar({ destino: "BAR22", solicitanteId: "daniel", itens: [{ produtoId: "p-gin", qtd: -3 }] }).ok, false);
ok("notação científica é rejeitada", g.validarInteiro("1e3"), null);
ok("inteiro em texto passa", g.validarInteiro(" 24 "), 24);

console.log("\n--- E4: autoria e data operacional ---");
const criada = g.rotaRequisicoesCriar({
  reqId: "req-teste", destino: "BAR22", solicitanteId: "daniel", criadoPor: "Daniel",
  itens: [{ produtoId: "p-gin", produto: "Gin Tanqueray", qtd: 3 }, { produtoId: "p-corona", produto: "Cerveja Corona", qtd: 48 }],
});
ok("requisição válida grava", [criada.ok, criada.criados], [true, 2]);
const linhaReq = g.lerAba(ss, "REQUISICOES")[0];
ok("criado_por vem da sessão, minúsculo", String(linhaReq.criado_por), "daniel");
ok("criado_em é preenchido pelo servidor", /^\d{4}-\d{2}-\d{2}T/.test(String(linhaReq.criado_em)), true);
ok("data_operacional é preenchida", /^\d{4}-\d{2}-\d{2}$/.test(String(linhaReq.data_operacional)), true);
// 02:30 pertence ao dia anterior; 07:00 ao próprio dia.
ok("02:30 de sábado é da operação de sexta", g.dataOperacional("2026-08-29T02:30:00-03:00"), "2026-08-28");
ok("07:00 é do próprio dia", g.dataOperacional("2026-08-29T07:00:00-03:00"), "2026-08-29");
ok("05:59 ainda é do dia anterior", g.dataOperacional("2026-08-29T05:59:00-03:00"), "2026-08-28");
ok("06:00 já virou o dia", g.dataOperacional("2026-08-29T06:00:00-03:00"), "2026-08-29");

const reenvio = g.rotaRequisicoesCriar({
  reqId: "req-teste", destino: "BAR22", solicitanteId: "yvison", criadoPor: "yvison",
  itens: [{ produtoId: "p-gin", qtd: 9 }],
});
ok("reenviar o mesmo id não duplica", [reenvio.ok, reenvio.duplicada], [true, true]);
ok("e a autoria original fica intacta", String(g.lerAba(ss, "REQUISICOES")[0].criado_por), "daniel");
ok("continuam sendo 2 linhas", linhas("REQUISICOES"), 2);

console.log("\n--- E3: aviso ao separador ---");
const avisosJon = g.rotaNotifListar({ usuario: "jon" });
ok("Jon recebeu um aviso", avisosJon.naoLidas, 1);
ok("do tipo certo", avisosJon.avisos[0].tipo, "REQUISICAO_CRIADA");
ok("com o nome do requisitante no corpo", /Daniel pediu 2 item/.test(avisosJon.avisos[0].corpo), true);
ok("e o link da requisição", avisosJon.avisos[0].link, "/requisicoes/req-teste");
ok("badge por tipo para o menu", avisosJon.badges.REQUISICAO_CRIADA, 1);
ok("Daniel não recebeu nada", g.rotaNotifListar({ usuario: "daniel" }).naoLidas, 0);

// Deduplicação: salvar de novo em menos de 5 min não toca o sino outra vez.
g.notificar({ destinatarios: ["jon"], tipo: "REQUISICAO_CRIADA", titulo: "x", corpo: "y", link: "/requisicoes/req-teste" });
ok("segundo aviso igual em 5 min é ignorado", g.rotaNotifListar({ usuario: "jon" }).naoLidas, 1);
g.notificar({ destinatarios: ["jon"], tipo: "REQUISICAO_CRIADA", titulo: "x", corpo: "y", link: "/requisicoes/outra" });
ok("link diferente vira aviso novo", g.rotaNotifListar({ usuario: "jon" }).naoLidas, 2);

console.log("\n--- D: sino, leitura e resiliência ---");
const primeiro = g.rotaNotifListar({ usuario: "jon" }).avisos[0];
ok("marcar como lida", g.rotaNotifMarcarLida({ usuario: "jon", notif_id: primeiro.notifId }).ok, true);
ok("contador cai", g.rotaNotifListar({ usuario: "jon" }).naoLidas, 1);
ok("não dá para marcar aviso alheio", g.rotaNotifMarcarLida({ usuario: "sarah", notif_id: primeiro.notifId }).ok, false);
ok("marcar todas", g.rotaNotifMarcarTodasLidas({ usuario: "jon" }).marcadas, 1);
ok("sino zera", g.rotaNotifListar({ usuario: "jon" }).naoLidas, 0);
// Dois avisos gravados: o da requisição e o de link diferente. O terceiro
// foi deduplicado e nunca virou linha.
ok("mas a linha continua na planilha", linhas("NOTIFICACOES"), 2);

// Aviso velho some da lista, linha preservada.
const sheetNotif = ss.getSheetByName("NOTIFICACOES");
sheetNotif.appendRow(["ntf-velho", "jon", "RECADO_NOVO", "antigo", "", "", false, "2020-01-01T00:00:00.000Z"]);
ok("aviso de 30+ dias não aparece", g.rotaNotifListar({ usuario: "jon" }).avisos.some((a) => a.notifId === "ntf-velho"), false);
ok("e a linha continua lá", linhas("NOTIFICACOES"), 3);

// notificar() nunca derruba quem chamou.
const salvo = g.SpreadsheetApp.openById;
g.SpreadsheetApp.openById = () => { throw new Error("planilha fora do ar"); };
const resiliente = g.notificar({ destinatarios: ["jon"], tipo: "RECADO_NOVO", titulo: "a", corpo: "b", link: "/x" });
g.SpreadsheetApp.openById = salvo;
ok("falha ao notificar não lança, só devolve erro", [resiliente.ok, typeof resiliente.error], [false, "string"]);

console.log("\n--- regressão: contagem continua aceitando decimal ---");
ok("0,8 de garrafa aberta continua válido em contagem", g.validarInteiro !== undefined && true, true);
const antes = linhas("MOVIMENTOS");
g.espelharContagemEmMovimentos(ss, {
  local: "BAR22", data: "2026-08-27", inventoryId: "inv-teste", usuarioId: "daniel",
  itens: [{ produtoId: "p-gin", quantidade: 0.8, unidade: "garrafas" }],
});
const contagem = g.lerAba(ss, "MOVIMENTOS").filter((m) => String(m.tipo) === "CONTAGEM")[0];
ok("a contagem gravou 0.8 sem reclamar", Number(contagem.qtd), 0.8);
ok("a restrição de inteiro não vazou para a contagem", linhas("MOVIMENTOS") > antes, true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nBLOCOS D e E1/E3/E4 — TESTES DE ACEITE PASSARAM");
process.exit(falhas ? 1 : 0);
