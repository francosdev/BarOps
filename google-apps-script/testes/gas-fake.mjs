// Simulador mínimo do Apps Script, só com a superfície que o Code.gs usa.
// Serve para rodar os testes de aceite da Fase 5 sem publicar nada.
import fs from "node:fs";
import vm from "node:vm";

class FakeSheet {
  constructor(nome) { this.nome = nome; this.celulas = []; }
  getName() { return this.nome; }
  _garantir(linha, coluna) {
    while (this.celulas.length < linha) this.celulas.push([]);
    const l = this.celulas[linha - 1];
    while (l.length < coluna) l.push("");
  }
  getLastRow() {
    for (let i = this.celulas.length; i > 0; i--) {
      if ((this.celulas[i - 1] || []).some((c) => String(c ?? "").trim() !== "")) return i;
    }
    return 0;
  }
  getLastColumn() { return this.celulas.reduce((m, l) => Math.max(m, l.length), 0); }
  setFrozenRows() {}
  appendRow(valores) {
    const row = this.getLastRow() + 1;
    this._garantir(row, valores.length);
    valores.forEach((v, i) => { this.celulas[row - 1][i] = v; });
  }
  getRange(linha, coluna, nLinhas = 1, nColunas = 1) {
    const sheet = this;
    return {
      getValues() {
        const saida = [];
        for (let r = 0; r < nLinhas; r++) {
          const linhaSaida = [];
          for (let c = 0; c < nColunas; c++) {
            const l = sheet.celulas[linha - 1 + r] || [];
            linhaSaida.push(l[coluna - 1 + c] ?? "");
          }
          saida.push(linhaSaida);
        }
        return saida;
      },
      getValue() { return this.getValues()[0][0]; },
      setValues(matriz) {
        matriz.forEach((linhaValores, r) => {
          sheet._garantir(linha + r, coluna + linhaValores.length - 1);
          linhaValores.forEach((v, c) => { sheet.celulas[linha - 1 + r][coluna - 1 + c] = v; });
        });
        return this;
      },
      setValue(v) { return this.setValues([[v]]); },
      setFontWeight() { return this; },
    };
  }
}

class FakeSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(nome) { return this.sheets.get(nome) || null; }
  insertSheet(nome) { const s = new FakeSheet(nome); this.sheets.set(nome, s); return s; }
  getSheets() { return [...this.sheets.values()]; }
  getName() { return "PLANILHA DE TESTE"; }
}

export function carregarCodeGs(caminho) {
  const planilha = new FakeSpreadsheet();
  const logs = [];
  const contexto = {
    SpreadsheetApp: { openById: () => planilha },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log: (m) => logs.push(String(m)) },
    Utilities: {
      // Fuso de verdade: o Apps Script formata no timezone pedido, e o código
      // de data operacional depende exatamente disso. Só America/Sao_Paulo,
      // que é o único que o projeto usa.
      formatDate(data, tz, formato) {
        const deslocamento = tz === "America/Sao_Paulo" ? -3 : 0;
        const d = new Date(data.getTime() + deslocamento * 3600000);
        const p = (n) => String(n).padStart(2, "0");
        return formato
          .replace("yyyy", d.getUTCFullYear())
          .replace("MM", p(d.getUTCMonth() + 1))
          .replace("dd", p(d.getUTCDate()))
          .replace("HH", p(d.getUTCHours()))
          .replace("mm", p(d.getUTCMinutes()))
          .replace("ss", p(d.getUTCSeconds()))
          .replace("H", String(d.getUTCHours()));
      },
      computeDigest: () => [1, 2, 3],
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
    },
    ContentService: {
      createTextOutput: (t) => ({ setMimeType: () => ({ getContent: () => t }) }),
      MimeType: { JSON: "JSON" },
    },
    ScriptApp: { newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ create() {} }) }) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty() {} }) },
    console,
    Date,
    Math,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    isFinite,
    isNaN,
    parseInt,
    parseFloat,
  };
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(caminho, "utf8"), contexto, { filename: "Code.gs" });
  return { contexto, planilha, logs };
}
