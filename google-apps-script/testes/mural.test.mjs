// Testes de aceite do Bloco C — mural de recados.
import fs from "node:fs";
import { carregarCodeGs } from "./gas-fake.mjs";

const { contexto: g, planilha: ss } = carregarCodeGs(new URL("../Code.gs", import.meta.url));

let falhas = 0;
function ok(rotulo, obtido, esperado) {
  const bate = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!bate) falhas += 1;
  console.log(`${bate ? "OK    " : "FALHOU"} ${rotulo.padEnd(58)} ${JSON.stringify(obtido)}${bate ? "" : `  (esperado ${JSON.stringify(esperado)})`}`);
}
const linhas = (aba) => g.lerAba(ss, aba).length;
const naoLidas = (quem) => g.rotaNotifListar({ usuario: quem }).naoLidas;
const zerarSinos = () => ["franco", "jon", "sarah", "daniel", "yvison"].forEach((u) => g.rotaNotifMarcarTodasLidas({ usuario: u }));

g.migrarUsuariosEPapeis();

console.log("--- publicar e avisar ---");
const curto = g.rotaRecadoPublicar({ usuario: "jon", texto: "oi" });
ok("menos de 3 caracteres é recusado", curto.ok, false);
ok("mais de 500 é recusado", g.rotaRecadoPublicar({ usuario: "jon", texto: "x".repeat(501) }).ok, false);
ok("500 exatos passam", g.rotaRecadoPublicar({ usuario: "jon", texto: "x".repeat(500) }).ok, true);
zerarSinos();

const pub = g.rotaRecadoPublicar({ usuario: "jon", texto: "Chegou gelo, quem for para o 23 leva dois sacos" });
ok("Jon publica", pub.ok, true);
ok("os outros 4 recebem RECADO_NOVO", ["franco", "sarah", "daniel", "yvison"].map(naoLidas), [1, 1, 1, 1]);
ok("Jon não recebe o próprio recado", naoLidas("jon"), 0);
const avisoSarah = g.rotaNotifListar({ usuario: "sarah" }).avisos[0];
ok("o aviso diz quem escreveu", avisoSarah.titulo, "Recado de Jon");
ok("e leva para o mural", avisoSarah.link, "/mural");

console.log("\n--- rate limit ---");
zerarSinos();
// já publicou 2 hoje (o de 500 e o do gelo). Faltam 8 para o teto de 10.
for (let i = 0; i < 8; i++) g.rotaRecadoPublicar({ usuario: "jon", texto: "recado numero " + i });
const passou = g.rotaRecadoPublicar({ usuario: "jon", texto: "este é o décimo primeiro" });
ok("o 11º do mesmo dia é recusado", passou.ok, false);
ok("e a mensagem explica", /Limite de 10 recados/.test(passou.error), true);
ok("outra pessoa não é afetada", g.rotaRecadoPublicar({ usuario: "sarah", texto: "purê acabando" }).ok, true);

console.log("\n--- não é editável, mas é desativável ---");
const fonte = fs.readFileSync(new URL("../Code.gs", import.meta.url), "utf8");
ok("não existe rota de editar recado", /recado_editar/.test(fonte), false);
const meu = g.rotaRecadoPublicar({ usuario: "daniel", texto: "faltou taça no bar 22" });
ok("outra pessoa não desativa", g.rotaRecadoDesativar({ usuario: "sarah", recado_id: meu.recadoId }).codigo, 403);
ok("o autor desativa o próprio", g.rotaRecadoDesativar({ usuario: "daniel", recado_id: meu.recadoId }).ok, true);
ok("some do mural", g.rotaRecadoListar({}).recados.some((r) => r.recadoId === meu.recadoId), false);
const antesDeApagar = linhas("RECADOS");
ok("mas a linha continua na planilha", g.lerAba(ss, "RECADOS").some((r) => String(r.recado_id) === meu.recadoId), true);
const doAdmin = g.rotaRecadoPublicar({ usuario: "sarah", texto: "recado que o admin vai tirar" });
ok("admin desativa o de qualquer um", g.rotaRecadoDesativar({ usuario: "franco", recado_id: doAdmin.recadoId }).ok, true);
ok("desativar não cria linha nova", linhas("RECADOS"), antesDeApagar + 1);

console.log("\n--- fixar: só admin, no máximo 3 ---");
const ids = [1, 2, 3, 4].map((n) => g.rotaRecadoPublicar({ usuario: "yvison", texto: "recado fixavel " + n }).recadoId);
ok("operador não fixa", g.rotaRecadoFixar({ usuario: "yvison", recado_id: ids[0] }).ok, false);
ok("admin fixa o 1º", g.rotaRecadoFixar({ usuario: "franco", recado_id: ids[0] }).ok, true);
ok("o 2º", g.rotaRecadoFixar({ usuario: "franco", recado_id: ids[1] }).ok, true);
ok("o 3º", g.rotaRecadoFixar({ usuario: "franco", recado_id: ids[2] }).ok, true);
const quarto = g.rotaRecadoFixar({ usuario: "franco", recado_id: ids[3] });
ok("o 4º é recusado", quarto.ok, false);
ok("pedindo para desafixar outro", /Desafixe um antes/.test(quarto.error), true);
ok("e diz quais estão fixados", quarto.fixados.length, 3);
ok("desafixando um, o 4º entra", (g.rotaRecadoFixar({ usuario: "franco", recado_id: ids[0], fixar: false }),
  g.rotaRecadoFixar({ usuario: "franco", recado_id: ids[3] }).ok), true);

console.log("\n--- ordem do feed ---");
const feed = g.rotaRecadoListar({}).recados;
ok("fixados vêm primeiro", feed.slice(0, 3).every((r) => r.fixado), true);
ok("e são exatamente 3", feed.filter((r) => r.fixado).length, 3);
const naoFixados = feed.filter((r) => !r.fixado).map((r) => r.criadoEm);
ok("o resto vem do mais novo para o mais velho",
  naoFixados.slice().sort().reverse().join("|") === naoFixados.join("|"), true);
ok("desativado não aparece", feed.every((r) => r.ativo), true);

console.log("\n--- janela de 30 dias ---");
ss.getSheetByName("RECADOS").appendRow(["rec-velho", "jon", "recado de 2020", false, true, "2020-01-01T00:00:00.000Z"]);
ok("recado velho não aparece por padrão", g.rotaRecadoListar({}).recados.some((r) => r.recadoId === "rec-velho"), false);
ok("mas aparece com desde", g.rotaRecadoListar({ desde: "2019-01-01" }).recados.some((r) => r.recadoId === "rec-velho"), true);

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nBLOCO C — MURAL: TESTES DE ACEITE PASSARAM");
process.exit(falhas ? 1 : 0);
