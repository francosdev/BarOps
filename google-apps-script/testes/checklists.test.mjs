// Testes de aceite da Fase 5, rodando o Code.gs de verdade contra uma
// planilha simulada. Cada teste é um dos oito do escopo.
import { carregarCodeGs } from "./gas-fake.mjs";

const { contexto, planilha } = carregarCodeGs(new URL("../Code.gs", import.meta.url));
const g = contexto;

let falhas = 0;
function ok(rotulo, obtido, esperado) {
  const bate = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bate) falhas += 1;
  console.log(`${bate ? "OK    " : "FALHOU"} ${rotulo.padEnd(58)} ${JSON.stringify(obtido)}${bate ? "" : `  (esperado ${JSON.stringify(esperado)})`}`);
}
const linhas = (aba) => g.lerAba(g.SpreadsheetApp.openById(""), aba).length;

// --- cenário -------------------------------------------------------------
const ss = planilha;
g.garantirAba(ss, "USUARIOS");
[
  ["u-carlos", "Carlos", "carlos", "x", "admin", true],
  ["u-jon", "Jon", "jon", "x", "lider_turno, requisitante, separador", true],
  ["u-daniel", "Daniel", "daniel", "x", "lider_turno, requisitante", true],
].forEach((u) => ss.getSheetByName("USUARIOS").appendRow(u));

g.garantirAba(ss, "PRODUTOS");
ss.getSheetByName("PRODUTOS").appendRow(["p-gin", "Gin Tanqueray", "Gin", "garrafa", 12, "caixa", "FRONT", 10, true, true, false]);
g.garantirAba(ss, "MOVIMENTOS");

const HOJE = "2026-08-26";
console.log("--- seed ---");
const boot = g.rotaChkBootstrap({ usuario: "carlos" });
ok("bootstrap cria os 6 templates do escopo", boot.criados, 6);
ok("rodar de novo não duplica", g.rotaChkBootstrap({ usuario: "carlos" }).criados, 0);
ok("não-admin não semeia", g.rotaChkBootstrap({ usuario: "daniel" }).ok, false);

const tplJon = g.lerAba(ss, "CHK_TEMPLATES").filter((t) => t.responsavel === "jon")[0];
const tplId = String(tplJon.template_id);

// itens do template do Jon
g.rotaChkCrudTemplate({ usuario: "carlos", operacao: "salvarItem", item: { templateId: tplId, ordem: 1, descricao: "Contar o gin", tipoEvidencia: "CONTAGEM", referencia: "Gin Tanqueray", obrigatorio: true } });
g.rotaChkCrudTemplate({ usuario: "carlos", operacao: "salvarItem", item: { templateId: tplId, ordem: 2, descricao: "Quantas caixas sobraram", tipoEvidencia: "NUMERO", obrigatorio: true } });
g.rotaChkCrudTemplate({ usuario: "carlos", operacao: "salvarItem", item: { templateId: tplId, ordem: 3, descricao: "Observações", tipoEvidencia: "TEXTO", obrigatorio: false } });
const itens = g.lerAba(ss, "CHK_ITENS").filter((i) => String(i.template_id) === tplId);
const itemContagem = String(itens[0].item_id);
const itemNumero = String(itens[1].item_id);

console.log("\n--- 1. abrir execução duas vezes ---");
const a1 = g.rotaChkAbrirExecucao({ template_id: tplId, data: HOJE, usuario: "jon" });
const a2 = g.rotaChkAbrirExecucao({ template_id: tplId, data: HOJE, usuario: "jon" });
ok("devolve o mesmo execucao_id", a1.execucaoId === a2.execucaoId, true);
ok("uma única linha em CHK_EXECUCOES", linhas("CHK_EXECUCOES"), 1);
ok("a segunda chamada avisa que reaproveitou", a2.reaproveitada, true);
const exe = a1.execucaoId;

console.log("\n--- 2. mesma resposta 3× ---");
const r1 = g.rotaChkResponderItem({ execucao_id: exe, item_id: itemNumero, valor: "4", usuario: "jon" });
g.rotaChkResponderItem({ execucao_id: exe, item_id: itemNumero, valor: "4", usuario: "jon" });
const r3 = g.rotaChkResponderItem({ execucao_id: exe, item_id: itemNumero, valor: "9", usuario: "jon" });
ok("uma única linha em CHK_RESPOSTAS", linhas("CHK_RESPOSTAS"), 1);
ok("a primeira criou, a terceira sobrescreveu", [r1.sobrescreveu, r3.sobrescreveu], [false, true]);
ok("ficou o valor da última", String(g.lerAba(ss, "CHK_RESPOSTAS")[0].valor), "9");

console.log("\n--- 3. NUMERO: vazio recusa, zero aceita ---");
ok("vazio é recusado", g.rotaChkResponderItem({ execucao_id: exe, item_id: itemNumero, valor: "", usuario: "jon" }).ok, false);
ok("zero é aceito", g.rotaChkResponderItem({ execucao_id: exe, item_id: itemNumero, valor: "0", usuario: "jon" }).ok, true);
ok("e continua sendo uma linha só", linhas("CHK_RESPOSTAS"), 1);

console.log("\n--- 4. CONTAGEM exige movimento ---");
const semMov = g.rotaChkResponderItem({ execucao_id: exe, item_id: itemContagem, valor: "51", usuario: "jon" });
ok("sem movimento na data, recusa", semMov.ok, false);
ok("e a mensagem nomeia a contagem que falta", /Gin Tanqueray/.test(semMov.error) && /GERAL/.test(semMov.error), true);
ss.getSheetByName("MOVIMENTOS").appendRow(["mov-1", HOJE + "T22:00:00.000Z", "CONTAGEM", "GERAL", "", "p-gin", 51, "garrafa", "jon", "", ""]);
ok("depois de lançar a contagem, aceita", g.rotaChkResponderItem({ execucao_id: exe, item_id: itemContagem, valor: "51", usuario: "jon" }).ok, true);

console.log("\n--- 5. concluir com obrigatório pendente ---");
// o item de NUMERO está respondido, o de CONTAGEM também; o TEXTO não é obrigatório
ok("conclui quando os obrigatórios estão respondidos", g.rotaChkConcluir({ execucao_id: exe, usuario: "jon" }).ok, true);
ok("execução ficou CONCLUIDA", String(g.lerAba(ss, "CHK_EXECUCOES")[0].status), "CONCLUIDA");
ok("concluída não aceita mais resposta", g.rotaChkResponderItem({ execucao_id: exe, item_id: itemNumero, valor: "3", usuario: "jon" }).ok, false);

// uma segunda execução, agora com pendência
const tplSarah = g.lerAba(ss, "CHK_TEMPLATES").filter((t) => t.responsavel === "sarah")[0];
g.rotaChkCrudTemplate({ usuario: "carlos", operacao: "salvarItem", item: { templateId: String(tplSarah.template_id), ordem: 1, descricao: "Pesar o açúcar", tipoEvidencia: "NUMERO", obrigatorio: true } });
const exeSarah = g.rotaChkAbrirExecucao({ template_id: String(tplSarah.template_id), data: HOJE, usuario: "sarah" }).execucaoId;
const pend = g.rotaChkConcluir({ execucao_id: exeSarah, usuario: "sarah" });
ok("recusa e devolve a lista de pendentes", [pend.ok, pend.pendentes.length, pend.pendentes[0].descricao], [false, 1, "Pesar o açúcar"]);

console.log("\n--- 6. território: Daniel não abre o checklist do Jon ---");
const tplDaniel = g.lerAba(ss, "CHK_TEMPLATES").filter((t) => t.responsavel === "daniel")[0];
const invasao = g.rotaChkAbrirExecucao({ template_id: tplId, data: HOJE, usuario: "daniel" });
ok("recusado com 403", [invasao.ok, invasao.codigo], [false, 403]);
ok("e a mensagem diz de quem é", /jon/.test(invasao.error), true);
ok("no próprio território ele abre", g.rotaChkAbrirExecucao({ template_id: String(tplDaniel.template_id), data: HOJE, usuario: "daniel" }).ok, true);
ok("Daniel só enxerga os dele", g.rotaChkListarMeus({ usuario: "daniel", data: HOJE }).checklists.every((c) => c.responsavel === "daniel"), true);
ok("Carlos enxerga todos", g.rotaChkListarMeus({ usuario: "carlos", data: HOJE }).checklists.length, 6);

console.log("\n--- 7. expiração ---");
const exeVelha = g.rotaChkAbrirExecucao({ template_id: String(tplSarah.template_id), data: "2026-08-23", usuario: "sarah" }).execucaoId;
ok("expiração marca a de 3 dias atrás", g.chkExpirarAbertas() >= 1, true);
const velha = g.lerAba(ss, "CHK_EXECUCOES").filter((e) => String(e.execucao_id) === exeVelha)[0];
ok("status virou EXPIRADA", String(velha.status), "EXPIRADA");
ok("expirada não aceita resposta", g.rotaChkResponderItem({ execucao_id: exeVelha, item_id: itemNumero, valor: "1", usuario: "sarah" }).ok, false);
ok("a de hoje continua como estava", String(g.lerAba(ss, "CHK_EXECUCOES").filter((e) => String(e.execucao_id) === exeSarah)[0].status), "ABERTA");

console.log("\n--- 8. relatório bate com a contagem manual ---");
const rel = g.rotaChkRelatorio({ usuario: "carlos", data_inicio: "2026-08-20", data_fim: "2026-08-27" });
const execs = g.lerAba(ss, "CHK_EXECUCOES");
const concluidasReais = execs.filter((e) => String(e.status) === "CONCLUIDA").length;
const expiradasReais = execs.filter((e) => String(e.status) === "EXPIRADA").length;
ok("soma de concluídas bate", rel.pessoas.reduce((t, p) => t + p.concluidas, 0), concluidasReais);
ok("soma de expiradas bate", rel.pessoas.reduce((t, p) => t + p.expiradas, 0), expiradasReais);
ok("relatório é só do admin", g.rotaChkRelatorio({ usuario: "jon", data_inicio: "2026-08-20", data_fim: "2026-08-27" }).ok, false);
ok("painel é só do admin", g.rotaChkPainel({ usuario: "jon", data: HOJE }).ok, false);
ok("painel do admin lista o dia", g.rotaChkPainel({ usuario: "carlos", data: HOJE }).celulas.length, 6);

console.log("\n--- mural ---");
ok("aviso curto demais é recusado", g.rotaMuralCriar({ usuario: "daniel", texto: "oi" }).ok, false);
const av = g.rotaMuralCriar({ usuario: "daniel", texto: "Faltou copo alto no bar 23", para: "" });
ok("qualquer usuário deixa recado", av.ok, true);
ok("aparece na lista", g.rotaMuralListar({}).avisos.length, 1);
g.rotaMuralResolver({ aviso_id: av.avisoId, usuario: "jon" });
ok("resolvido some da lista padrão", g.rotaMuralListar({}).avisos.length, 0);
ok("mas continua no histórico", g.rotaMuralListar({ incluirResolvidos: true }).avisos.length, 1);
ok("com quem resolveu", g.rotaMuralListar({ incluirResolvidos: true }).avisos[0].resolvidoPor, "jon");
ok("resolver não cria linha nova", linhas("MURAL"), 1);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nFASE 5 — 8 TESTES DE ACEITE PASSARAM");
process.exit(falhas ? 1 : 0);
