const SPREADSHEET_ID = "1RHbLyanJ9I56JMlBsaMOGWu6V4atnwKjtsb50Ja0XCQ";

// Chave que o app envia em toda requisicao; requisicoes sem ela sao
// recusadas. Precisa ser identica a constante APPS_SCRIPT_TOKEN do app.
const APP_TOKEN = "EPH-2026-a7c31f98d4e2b6f0-inventario";

// Execute esta funcao uma vez no editor do Apps Script para conceder as
// permissoes de acesso a planilha e conferir se o SPREADSHEET_ID esta certo.
function testarAcessoPlanilha() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log("Planilha aberta com sucesso: " + ss.getName());
  Logger.log("Abas: " + ss.getSheets().map(function (s) { return s.getName(); }).join(", "));
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    if (payload.token !== APP_TOKEN) {
      return jsonResponse({ ok: false, error: "Acesso negado: requisicao sem a chave do app." });
    }
    if (payload.ping) {
      try {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        return jsonResponse({ ok: true, message: "Conexao OK. Planilha acessivel: " + ss.getName() });
      } catch (err) {
        return jsonResponse({ ok: false, error: "Conexao OK, mas nao foi possivel abrir a planilha (verifique o ID e as permissoes): " + err.message });
      }
    }

    if (payload.action === "estoque") {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheetName = payload.sheet || "SEXTA";
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) throw new Error("Aba nao encontrada: " + sheetName);
      const lastRow = sheet.getLastRow();
      const fechaColumn = findHeaderColumn(sheet, "Fecha") || 3;
      const values = sheet.getRange(1, 1, lastRow, fechaColumn).getValues();
      const itens = [];
      values.forEach(function (row) {
        const produto = String(row[0] || "").trim();
        if (!produto) return;
        const quantidade = Number(row[fechaColumn - 1]);
        if (!Number.isFinite(quantidade)) return;
        itens.push({ produto: produto, quantidade: quantidade });
      });
      return jsonResponse({ ok: true, sheet: sheetName, itens: itens });
    }

    const sheetName = payload.sheet;
    const items = payload.itens || [];
    if (!sheetName) throw new Error("Aba destino nao informada.");
    if (!items.length) throw new Error("Nenhum item recebido.");

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    appendRawLog(ss, payload, "RECEBIDO");
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Aba nao encontrada: " + sheetName);

    // Evita que dois dispositivos gravando ao mesmo tempo percam somas.
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    const written = [];
    const missing = [];
    try {
      const lastRow = sheet.getLastRow();
      const fechaColumn = findHeaderColumn(sheet, "Fecha") || 3;
      const productRange = sheet.getRange(1, 1, lastRow, 1);
      const productValues = productRange.getValues().map((row) => normalizeName(row[0]));

      // Envios do mesmo dia SOMAM na coluna Fecha (contagens de bares
      // diferentes se acumulam). A primeira gravacao de cada linha em um dia
      // novo SUBSTITUI o valor antigo, que e da semana anterior. O controle de
      // quais linhas ja foram gravadas no dia fica em Script Properties.
      const props = PropertiesService.getScriptProperties();
      const dayKey = "ultimaData_" + sheetName;
      const rowsKey = "linhasGravadas_" + sheetName;
      const payloadDate = String(payload.data || "");
      const isNewDay = props.getProperty(dayKey) !== payloadDate;
      const writtenRows = isNewDay ? {} : JSON.parse(props.getProperty(rowsKey) || "{}");

      items.forEach((item) => {
        const productName = normalizeName(item.produto);
        const rowIndex = findProductRow(productValues, productName);
        if (rowIndex === -1) {
          missing.push(item.produto);
          return;
        }
        const row = rowIndex + 1;
        const cell = sheet.getRange(row, fechaColumn);
        const current = writtenRows[row] ? Number(cell.getValue()) || 0 : 0;
        const total = current + Number(item.quantidade || 0);
        cell.setValue(total);
        writtenRows[row] = true;
        written.push(item.produto + " = " + total);
      });

      props.setProperty(dayKey, payloadDate);
      props.setProperty(rowsKey, JSON.stringify(writtenRows));
    } finally {
      lock.releaseLock();
    }

    appendLog(ss, payload, written, missing);

    return jsonResponse({
      ok: true,
      sheet: sheetName,
      writtenCount: written.length,
      missing,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function appendRawLog(ss, payload, status) {
  const sheetName = "LOG_APP";
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["timestamp", "status", "inventory_id", "data", "bar", "tipo", "lider", "aba", "qtd_itens", "raw"]);
  }
  sheet.appendRow([
    new Date(),
    status,
    payload.inventoryId || "",
    payload.data || "",
    payload.bar || "",
    payload.tipo || "",
    payload.lider || "",
    payload.sheet || "",
    (payload.itens || []).length,
    JSON.stringify(payload).slice(0, 45000),
  ]);
}

function findProductRow(productValues, productName) {
  let rowIndex = productValues.findIndex((value) => value === productName);
  if (rowIndex !== -1) return rowIndex;

  rowIndex = productValues.findIndex((value) => {
    if (!value || !productName) return false;
    return value.includes(productName) || productName.includes(value);
  });
  return rowIndex;
}

function findHeaderColumn(sheet, headerName) {
  const maxRows = Math.min(sheet.getLastRow(), 10);
  const maxCols = Math.min(sheet.getLastColumn(), 12);
  const values = sheet.getRange(1, 1, maxRows, maxCols).getValues();
  const target = normalizeName(headerName);
  for (let row = 0; row < values.length; row++) {
    for (let col = 0; col < values[row].length; col++) {
      if (normalizeName(values[row][col]) === target) return col + 1;
    }
  }
  return null;
}

function appendLog(ss, payload, written, missing) {
  const sheetName = "LOG_APP";
  const sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["timestamp", "inventory_id", "data", "bar", "lider", "aba", "gravados", "nao_encontrados"]);
  }
  sheet.appendRow([
    new Date(),
    payload.inventoryId || "",
    payload.data || "",
    payload.bar || "",
    payload.lider || "",
    payload.sheet || "",
    written.join(", "),
    missing.join(", "),
  ]);
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
