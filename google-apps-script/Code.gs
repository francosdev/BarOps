const SPREADSHEET_ID = "1RHbLyanJ9I56JMlBsaMOGWu6V4atnwKjtsb50Ja0XCQ";

// Chave que o app envia em toda requisicao; requisicoes sem ela sao
// recusadas. Precisa ser identica a constante APPS_SCRIPT_TOKEN do app.
//
// ATENCAO: este token viaja dentro do bundle publicado no Netlify, entao
// qualquer pessoa que abra o site consegue le-lo e chamar estas rotas
// direto — inclusive usuarios.salvar. Enquanto for assim, o login serve
// para saber quem fez o que, nao para impedir quem nao deveria. Fechar isso
// exige exigir login+senha de admin nas rotas de escrita.
const APP_TOKEN = "EPH-2026-a7c31f98d4e2b6f0-inventario";

// Sal do hash de senha. Trocar este valor invalida todas as senhas ja
// cadastradas na aba USUARIOS — so mude se for recadastrar todo mundo.
const SENHA_SALT = "EPH-2026-usuarios-b41d7e";

// Abas da Fase 1. MOVIMENTOS e a espinha dorsal: saldo de um produto em um
// local e a soma do que entrou menos o que saiu daquele local.
const ABA_PRODUTOS = "PRODUTOS";
const ABA_USUARIOS = "USUARIOS";
const ABA_MOVIMENTOS = "MOVIMENTOS";
const ABA_REQUISICOES = "REQUISICOES";

const CABECALHOS = {
  PRODUTOS: ["produto_id", "nome_canonico", "categoria", "unidade", "fator_pack", "pack_nome", "fornecedor", "minimo", "ativo", "requisitavel", "produzido"],
  USUARIOS: ["usuario_id", "nome", "login", "senha_hash", "perfil", "ativo"],
  MOVIMENTOS: ["mov_id", "timestamp", "tipo", "origem", "destino", "produto_id", "qtd", "unidade", "usuario_id", "ref_documento", "obs"],
  // Uma linha por item. A chave e (req_id, produto_id): a mesma requisicao
  // nao pede o mesmo produto duas vezes.
  REQUISICOES: ["req_id", "data", "solicitante_id", "destino", "produto_id", "qtd_pedida", "qtd_separada", "status", "separador_id", "timestamp_separacao", "recebedor_id", "timestamp_recebimento", "obs"],
};

// Fluxo de duas pernas: quem precisa pede, o estoquista separa e manda. A
// baixa no estoque acontece na separacao — nao ha confirmacao de recebimento,
// entao nao ha saldo reservado nem trava de esquecimento.
//
// As colunas recebedor_id e timestamp_recebimento ficam vazias de proposito:
// existem para o dia em que a terceira perna for ligada, sem migracao.
const STATUS_REQUISICAO = ["PENDENTE", "SEPARADO", "PARCIAL", "RECUSADO"];

// De onde sai o que e requisitado.
const ORIGEM_REQUISICAO = "GERAL";

const LOCAIS = ["GERAL", "PRINCIPAL", "BAR22", "BAR23", "CHIVAS", "PRODUCAO", "EVENTO"];

// CONTAGEM nao esta na tabela 3.3 do escopo: foi acrescentada para guardar o
// registro da conferencia fisica, que precisa existir em algum lugar sem
// mexer no saldo. Os outros oito sao os do escopo.
const TIPOS_MOVIMENTO = ["COMPRA", "REQUISICAO", "PRODUCAO_CONSUMO", "PRODUCAO_ENTRADA", "CONSUMO", "PERDA", "AJUSTE", "EVENTO", "CONTAGEM"];

// Tipos que registram informacao mas nao movimentam estoque.
const TIPOS_SEM_SALDO = ["CONTAGEM"];

// Execute esta funcao uma vez no editor do Apps Script para conceder as
// permissoes de acesso a planilha e conferir se o SPREADSHEET_ID esta certo.
function testarAcessoPlanilha() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Logger.log("Planilha aberta com sucesso: " + ss.getName());
  Logger.log("Abas: " + ss.getSheets().map(function (s) { return s.getName(); }).join(", "));
}

// Execute uma vez para criar PRODUTOS, USUARIOS e MOVIMENTOS com os
// cabecalhos certos. Pode rodar quantas vezes quiser: nao apaga nada.
function criarAbasBase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  garantirAba(ss, ABA_PRODUTOS);
  garantirAba(ss, ABA_USUARIOS);
  garantirAba(ss, ABA_MOVIMENTOS);
  garantirAba(ss, ABA_REQUISICOES);
  Logger.log("Abas base prontas.");
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

    // Rotas da Fase 1. Quando nenhuma casa, cai no fluxo antigo de gravacao
    // de contagem la embaixo, que continua identico ao que ja rodava.
    const rota = ROTAS[payload.action];
    if (rota) return jsonResponse(rota(payload));

    // Leitura de estoque. Antes devolvia so uma coluna, escolhida aqui pelo
    // cabecalho "Fecha" com fallback cego na coluna 3 — e a aba de referencia
    // (ESTOQUE GERAL) tem varias colunas de fechamento, uma por dia. Adivinhar
    // qual era dava numero errado sem avisar ninguem.
    //
    // Agora devolve a grade inteira e quem escolhe a coluna e o app, que
    // mostra o cabecalho para a pessoa. `itens` continua saindo com a coluna
    // padrao para nao quebrar versao antiga do app.
    if (payload.action === "estoque") {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheetName = payload.sheet || "ESTOQUE GERAL";
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        const nomes = ss.getSheets().map(function (aba) { return aba.getName(); });
        throw new Error("Aba nao encontrada: " + sheetName + ". Abas da planilha: " + nomes.join(", "));
      }
      const lastRow = sheet.getLastRow();
      const lastCol = Math.min(sheet.getLastColumn(), 20);
      const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();

      // O cabecalho nem sempre esta na linha 1: a aba costuma abrir com
      // titulo. Vale a primeira linha que tem texto em duas colunas ou mais.
      let headerRow = 0;
      for (let i = 0; i < Math.min(values.length, 10); i++) {
        let preenchidas = 0;
        for (let j = 0; j < values[i].length; j++) {
          if (String(values[i][j] || "").trim()) preenchidas++;
        }
        if (preenchidas >= 2) { headerRow = i; break; }
      }
      const cabecalhos = values[headerRow].map(function (celula, indice) {
        const texto = String(celula || "").trim();
        return { indice: indice, nome: texto || "Coluna " + (indice + 1) };
      });

      const linhas = [];
      const itens = [];
      const padrao = (findHeaderColumn(sheet, "Fecha") || 3) - 1;
      for (let i = headerRow + 1; i < values.length; i++) {
        const produto = String(values[i][0] || "").trim();
        if (!produto) continue;
        const valores = values[i].map(function (celula) {
          const numero = Number(celula);
          return Number.isFinite(numero) && String(celula).trim() !== "" ? numero : null;
        });
        linhas.push({ produto: produto, valores: valores });
        if (valores[padrao] !== null) itens.push({ produto: produto, quantidade: valores[padrao] });
      }

      return jsonResponse({
        ok: true,
        sheet: sheetName,
        cabecalhos: cabecalhos,
        colunaPadrao: padrao,
        linhas: linhas,
        itens: itens,
      });
    }

    const sheetName = payload.sheet;
    const items = payload.itens || [];
    if (!sheetName) throw new Error("Aba destino nao informada.");
    if (!items.length) throw new Error("Nenhum item recebido.");

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Aba nao encontrada: " + sheetName);

    // Abertura vai para a coluna "Abre"; fechamento e inventario geral vao
    // para "Fecha".
    //
    // Resolvido ANTES do log e ANTES do lock, de proposito: so le cabecalho e
    // pode falhar. Se falhasse com o lock ja tomado, o release estaria no
    // finally do try la embaixo e nao rodaria; e se falhasse depois do log,
    // deixaria em LOG_APP uma linha RECEBIDO sem gravacao correspondente.
    const coluna = colunaDoInventario(sheet, payload.tipo);

    appendRawLog(ss, payload, "RECEBIDO " + coluna.nome);

    // Evita que dois dispositivos gravando ao mesmo tempo percam somas.
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    const written = [];
    const missing = [];
    const ignored = [];
    try {
      const lastRow = sheet.getLastRow();
      const productRange = sheet.getRange(1, 1, lastRow, 1);
      const productValues = productRange.getValues().map((row) => normalizeName(row[0]));

      // Envios de bares diferentes no mesmo dia SOMAM na coluna Fecha. A
      // primeira gravacao de cada linha em um dia novo SUBSTITUI o valor
      // antigo, que e da semana anterior.
      //
      // Correcao 1 do item 9 do escopo: cada inventario guarda quanto
      // contribuiu em cada linha. Reenviar o mesmo inventoryId desconta a
      // contribuicao anterior antes de somar a nova — regrava, nao acumula.
      // Sem isso, reenviar a contagem do Wallace levava Agua 1802 -> 1804.
      // Tudo que controla soma e reenvio e por (aba, COLUNA, dia). Sem a
      // coluna na chave, gravar a abertura marcaria a linha como "ja escrita
      // hoje" e o fechamento seguinte somaria em cima em vez de substituir.
      const props = PropertiesService.getScriptProperties();
      const dayKey = "ultimaData_" + sheetName;
      const rowsKey = "linhasGravadas_" + sheetName + "_" + coluna.nome;
      const payloadDate = String(payload.data || "");
      const inventoryId = String(payload.inventoryId || "sem-id");
      const isNewDay = props.getProperty(dayKey) !== payloadDate;
      if (isNewDay) limparContribuicoes(props, sheetName);
      const writtenRows = isNewDay ? {} : JSON.parse(props.getProperty(rowsKey) || "{}");
      const contribKey = chaveContribuicao(sheetName, coluna.nome, inventoryId);
      const contribuicoes = isNewDay ? {} : JSON.parse(props.getProperty(contribKey) || "{}");

      items.forEach((item) => {
        const productName = normalizeName(item.produto);
        // Correcao 4 do item 9: linhas sem produto identificado nao entram
        // mais na planilha zeradas e sem nome.
        if (!productName) {
          ignored.push(String(item.produtoId || "(sem produto_id)"));
          return;
        }
        const rowIndex = findProductRow(productValues, productName);
        if (rowIndex === -1) {
          missing.push(item.produto);
          return;
        }
        const row = rowIndex + 1;
        const cell = sheet.getRange(row, coluna.indice);
        const atual = writtenRows[row] ? Number(cell.getValue()) || 0 : 0;
        const anterior = Number(contribuicoes[row] || 0);
        const nova = Number(item.quantidade || 0);
        const total = Math.round((atual - anterior + nova) * 100) / 100;
        cell.setValue(total);
        writtenRows[row] = true;
        contribuicoes[row] = nova;
        written.push(item.produto + " = " + total);
      });

      props.setProperty(dayKey, payloadDate);
      props.setProperty(rowsKey, JSON.stringify(writtenRows));
      props.setProperty(contribKey, JSON.stringify(contribuicoes));
    } finally {
      lock.releaseLock();
    }

    appendLog(ss, payload, written, missing);

    // Fase 2 do escopo: a contagem continua gravando onde sempre gravou e
    // passa a espelhar em MOVIMENTOS, para o historico ir acumulando.
    //
    // Se o espelho falhar, a contagem na planilha ja foi gravada e nao pode
    // ser perdida — por isso o erro vira aviso na resposta, nao excecao.
    let espelho = null;
    let espelhoErro = "";
    if (payload.espelharMovimentos) {
      const lockEspelho = LockService.getScriptLock();
      lockEspelho.waitLock(30000);
      try {
        espelho = espelharContagemEmMovimentos(ss, payload);
      } catch (err) {
        espelhoErro = err.message;
      } finally {
        lockEspelho.releaseLock();
      }
    }

    return jsonResponse({
      ok: true,
      sheet: sheetName,
      coluna: coluna.nome,
      writtenCount: written.length,
      missing,
      ignored,
      espelho,
      espelhoErro,
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

// ---------------------------------------------------------------------------
// Rotas da Fase 1
// ---------------------------------------------------------------------------

const ROTAS = {
  "bootstrap": rotaBootstrap,
  "catalogo.listar": rotaCatalogoListar,
  "catalogo.salvar": rotaCatalogoSalvar,
  "usuarios.listar": rotaUsuariosListar,
  "usuarios.salvar": rotaUsuariosSalvar,
  "login": rotaLogin,
  "movimentos.listar": rotaMovimentosListar,
  "movimentos.gravar": rotaMovimentosGravar,
  "saldos": rotaSaldos,
  "requisicoes.criar": rotaRequisicoesCriar,
  "requisicoes.listar": rotaRequisicoesListar,
  "requisicoes.separar": rotaRequisicoesSeparar,
};

// Cria as tres abas e, se PRODUTOS/USUARIOS estiverem vazias, semeia com o
// que o app mandar. Rodar de novo nao duplica nem sobrescreve nada.
function rotaBootstrap(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const produtos = garantirAba(ss, ABA_PRODUTOS);
  const usuarios = garantirAba(ss, ABA_USUARIOS);
  const movimentos = garantirAba(ss, ABA_MOVIMENTOS);
  garantirAba(ss, ABA_REQUISICOES);

  let produtosCriados = 0;
  if (produtos.getLastRow() <= 1 && (payload.produtos || []).length) {
    const linhas = payload.produtos.map(linhaProduto);
    produtos.getRange(2, 1, linhas.length, CABECALHOS.PRODUTOS.length).setValues(linhas);
    produtosCriados = linhas.length;
  }

  // USUARIOS nasce vazia de proposito: senha padrao em repositorio e senha
  // vazada. O admin entra pela reserva local (PIN do aparelho) e cadastra o
  // primeiro usuario pela tela "Usuarios da planilha".
  let usuariosCriados = 0;
  if (usuarios.getLastRow() <= 1 && (payload.usuarios || []).length) {
    const linhas = payload.usuarios.map(linhaUsuarioNova);
    usuarios.getRange(2, 1, linhas.length, CABECALHOS.USUARIOS.length).setValues(linhas);
    usuariosCriados = linhas.length;
  }

  return {
    ok: true,
    abas: { produtos: ABA_PRODUTOS, usuarios: ABA_USUARIOS, movimentos: ABA_MOVIMENTOS, requisicoes: ABA_REQUISICOES },
    produtosCriados,
    usuariosCriados,
    movimentosExistentes: Math.max(0, movimentos.getLastRow() - 1),
  };
}

function rotaCatalogoListar() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const produtos = lerAba(ss, ABA_PRODUTOS).map(function (linha) {
    return {
      produtoId: String(linha.produto_id || ""),
      nome: String(linha.nome_canonico || ""),
      categoria: String(linha.categoria || ""),
      unidade: String(linha.unidade || ""),
      fatorPack: Number(linha.fator_pack) || 1,
      packNome: String(linha.pack_nome || ""),
      // Jack Daniels vem de FRONT e de FG7: fornecedor aceita lista.
      fornecedores: String(linha.fornecedor || "").split(",").map(function (f) { return f.trim(); }).filter(Boolean),
      minimo: linha.minimo === "" || linha.minimo === null ? null : Number(linha.minimo),
      ativo: linha.ativo !== false && String(linha.ativo).toUpperCase() !== "FALSE",
      requisitavel: String(linha.requisitavel).toUpperCase() === "TRUE" || linha.requisitavel === true,
      produzido: String(linha.produzido).toUpperCase() === "TRUE" || linha.produzido === true,
    };
  });
  return { ok: true, produtos };
}

// Upsert por produto_id. Produto sem id ganha um novo.
function rotaCatalogoSalvar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = garantirAba(ss, ABA_PRODUTOS);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existentes = lerAba(ss, ABA_PRODUTOS);
    const indicePorId = {};
    existentes.forEach(function (linha, i) { indicePorId[String(linha.produto_id)] = i + 2; });

    let criados = 0;
    let atualizados = 0;
    (payload.produtos || []).forEach(function (produto) {
      const linha = linhaProduto(produto);
      const id = String(linha[0]);
      const rowIndex = indicePorId[id];
      if (rowIndex) {
        sheet.getRange(rowIndex, 1, 1, CABECALHOS.PRODUTOS.length).setValues([linha]);
        atualizados += 1;
      } else {
        sheet.appendRow(linha);
        indicePorId[id] = sheet.getLastRow();
        criados += 1;
      }
    });
    return { ok: true, criados, atualizados };
  } finally {
    lock.releaseLock();
  }
}

function rotaUsuariosListar() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  // senha_hash nunca sai da planilha.
  const usuarios = lerAba(ss, ABA_USUARIOS).map(usuarioPublico);
  return { ok: true, usuarios };
}

function rotaUsuariosSalvar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = garantirAba(ss, ABA_USUARIOS);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existentes = lerAba(ss, ABA_USUARIOS);
    const indicePorId = {};
    existentes.forEach(function (linha, i) { indicePorId[String(linha.usuario_id)] = i + 2; });

    let criados = 0;
    let atualizados = 0;
    (payload.usuarios || []).forEach(function (usuario) {
      const id = String(usuario.usuarioId || usuario.usuario_id || "");
      const rowIndex = indicePorId[id];
      if (rowIndex) {
        const atual = existentes[rowIndex - 2];
        // Senha em branco na edicao significa "mantem a que ja esta la".
        const hash = usuario.senha ? hashSenha(usuario.senha) : String(atual.senha_hash || "");
        sheet.getRange(rowIndex, 1, 1, CABECALHOS.USUARIOS.length).setValues([[
          id,
          String(usuario.nome || atual.nome || ""),
          normalizeLogin(usuario.login || atual.login),
          hash,
          String(usuario.perfil || atual.perfil || "consulta"),
          usuario.ativo !== false,
        ]]);
        atualizados += 1;
      } else {
        sheet.appendRow(linhaUsuarioNova(usuario));
        indicePorId[String(usuario.usuarioId || "")] = sheet.getLastRow();
        criados += 1;
      }
    });
    return { ok: true, criados, atualizados };
  } finally {
    lock.releaseLock();
  }
}

// Confere login e senha contra a aba USUARIOS. A comparacao e feita aqui no
// servidor; o hash nunca trafega para o app.
function rotaLogin(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const login = normalizeLogin(payload.login);
  const senha = String(payload.senha || "");
  if (!login || !senha) return { ok: false, error: "Informe usuario e senha." };

  const encontrado = lerAba(ss, ABA_USUARIOS).filter(function (linha) {
    return normalizeLogin(linha.login) === login;
  })[0];

  if (!encontrado) return { ok: false, error: "Usuario ou senha invalidos." };
  if (encontrado.ativo === false || String(encontrado.ativo).toUpperCase() === "FALSE") {
    return { ok: false, error: "Usuario inativo. Fale com o admin." };
  }
  if (String(encontrado.senha_hash || "") !== hashSenha(senha)) {
    return { ok: false, error: "Usuario ou senha invalidos." };
  }
  return { ok: true, usuario: usuarioPublico(encontrado) };
}

function rotaMovimentosListar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const de = String(payload.de || "");
  const ate = String(payload.ate || "");
  const movimentos = lerAba(ss, ABA_MOVIMENTOS)
    .map(movimentoPublico)
    .filter(function (mov) {
      if (payload.produtoId && mov.produtoId !== payload.produtoId) return false;
      if (payload.local && mov.origem !== payload.local && mov.destino !== payload.local) return false;
      if (payload.tipo && mov.tipo !== payload.tipo) return false;
      const dia = mov.timestamp.slice(0, 10);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      return true;
    });
  return { ok: true, movimentos };
}

// Movimento nunca e editado nem apagado: correcao entra como AJUSTE novo.
// mov_id repetido e ignorado, entao reenviar a mesma remessa nao duplica.
function rotaMovimentosGravar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = garantirAba(ss, ABA_MOVIMENTOS);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const idsExistentes = {};
    lerAba(ss, ABA_MOVIMENTOS).forEach(function (linha) { idsExistentes[String(linha.mov_id)] = true; });

    const novas = [];
    const duplicados = [];
    (payload.movimentos || []).forEach(function (mov) {
      const id = String(mov.movId || mov.mov_id || "");
      if (id && idsExistentes[id]) {
        duplicados.push(id);
        return;
      }
      const linha = linhaMovimento(mov);
      idsExistentes[String(linha[0])] = true;
      novas.push(linha);
    });

    if (novas.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, novas.length, CABECALHOS.MOVIMENTOS.length).setValues(novas);
    }
    return { ok: true, gravados: novas.length, duplicados };
  } finally {
    lock.releaseLock();
  }
}

// Saldo de um produto em um local = tudo que entrou naquele local menos tudo
// que saiu dele. Nenhum modulo guarda estoque proprio.
//
// CONTAGEM fica fora desta conta de proposito: contagem fisica e conferencia,
// nao lancamento. A linha de CONTAGEM registra o que foi contado; quem mexe
// no saldo e o AJUSTE que a contagem gera — e o valor desse AJUSTE e a quebra.
function calcularSaldos(ss, produtoIdFiltro) {
  const porProduto = {};

  lerAba(ss, ABA_MOVIMENTOS).forEach(function (linha) {
    const produtoId = String(linha.produto_id || "");
    if (!produtoId) return;
    if (produtoIdFiltro && produtoId !== produtoIdFiltro) return;
    if (TIPOS_SEM_SALDO.indexOf(String(linha.tipo || "").toUpperCase()) !== -1) return;
    const qtd = Number(linha.qtd) || 0;
    const origem = String(linha.origem || "").toUpperCase();
    const destino = String(linha.destino || "").toUpperCase();
    if (!porProduto[produtoId]) porProduto[produtoId] = {};
    if (destino) porProduto[produtoId][destino] = (porProduto[produtoId][destino] || 0) + qtd;
    if (origem) porProduto[produtoId][origem] = (porProduto[produtoId][origem] || 0) - qtd;
  });

  return porProduto;
}

function rotaSaldos(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const porProduto = calcularSaldos(ss, payload.produtoId ? String(payload.produtoId) : "");

  const saldos = Object.keys(porProduto).map(function (produtoId) {
    const locais = porProduto[produtoId];
    let consolidado = 0;
    Object.keys(locais).forEach(function (local) {
      locais[local] = Math.round(locais[local] * 100) / 100;
      consolidado += locais[local];
    });
    return { produtoId, locais, consolidado: Math.round(consolidado * 100) / 100 };
  });

  return { ok: true, saldos, locais: LOCAIS };
}

// ---------------------------------------------------------------------------
// Requisicao (Fase 3) — duas pernas
// ---------------------------------------------------------------------------

// Quem precisa monta o pedido. Nada sai do estoque aqui: a requisicao nasce
// PENDENTE e fica esperando o estoquista.
function rotaRequisicoesCriar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = garantirAba(ss, ABA_REQUISICOES);
  const destino = String(payload.destino || "").toUpperCase();
  const itens = payload.itens || [];

  if (!destino) return { ok: false, error: "Informe o destino da requisicao." };
  if (LOCAIS.indexOf(destino) === -1) return { ok: false, error: "Destino invalido: " + destino };
  if (!itens.length) return { ok: false, error: "Requisicao sem itens." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const reqId = String(payload.reqId || novoId("req"));
    // Reenviar a mesma requisicao nao cria uma segunda.
    const jaExiste = lerAba(ss, ABA_REQUISICOES).some(function (linha) {
      return String(linha.req_id) === reqId;
    });
    if (jaExiste) return { ok: true, reqId, criados: 0, duplicada: true };

    const vistos = {};
    const linhas = [];
    itens.forEach(function (item) {
      const produtoId = String(item.produtoId || "");
      const qtd = Number(item.qtd) || 0;
      // Produto repetido ou quantidade zerada nao vira linha.
      if (!produtoId || qtd <= 0 || vistos[produtoId]) return;
      vistos[produtoId] = true;
      linhas.push([
        reqId,
        String(payload.data || new Date().toISOString().slice(0, 10)),
        String(payload.solicitanteId || ""),
        destino,
        produtoId,
        qtd,
        "",
        "PENDENTE",
        "", "", "", "",
        String(item.obs || ""),
      ]);
    });

    if (!linhas.length) return { ok: false, error: "Nenhum item valido na requisicao." };
    sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, CABECALHOS.REQUISICOES.length).setValues(linhas);
    return { ok: true, reqId, criados: linhas.length };
  } finally {
    lock.releaseLock();
  }
}

function rotaRequisicoesListar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const linhas = lerAba(ss, ABA_REQUISICOES)
    .map(requisicaoPublica)
    .filter(function (item) {
      if (payload.status && item.status !== String(payload.status).toUpperCase()) return false;
      if (payload.reqId && item.reqId !== payload.reqId) return false;
      if (payload.destino && item.destino !== String(payload.destino).toUpperCase()) return false;
      if (payload.solicitanteId && item.solicitanteId !== payload.solicitanteId) return false;
      return true;
    });

  // Agrupa por requisicao para a tela nao precisar remontar.
  const porId = {};
  linhas.forEach(function (item) {
    if (!porId[item.reqId]) {
      porId[item.reqId] = {
        reqId: item.reqId, data: item.data, solicitanteId: item.solicitanteId,
        destino: item.destino, separadorId: item.separadorId,
        timestampSeparacao: item.timestampSeparacao, itens: [],
      };
    }
    porId[item.reqId].itens.push(item);
  });

  const requisicoes = Object.keys(porId).map(function (id) {
    const req = porId[id];
    req.status = statusDaRequisicao(req.itens);
    return req;
  }).sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });

  return { ok: true, requisicoes };
}

// Status do cabecalho, derivado das linhas — nao e guardado em lugar nenhum.
function statusDaRequisicao(itens) {
  if (itens.some(function (i) { return i.status === "PENDENTE"; })) return "PENDENTE";
  if (itens.every(function (i) { return i.status === "RECUSADO"; })) return "RECUSADO";
  if (itens.some(function (i) { return i.status !== "SEPARADO"; })) return "PARCIAL";
  return "SEPARADO";
}

/**
 * O estoquista separa e manda. E AQUI que o estoque baixa: cada item separado
 * vira um movimento REQUISICAO de GERAL para o destino da requisicao.
 *
 * O estoquista pode reduzir a quantidade ou recusar o item por falta, nunca
 * aumentar — pedir mais do que foi pedido nao e separar, e outra requisicao.
 * A divergencia entre pedido e separado fica registrada nas duas colunas.
 *
 * Os movimentos tem mov_id determinista (req-<reqId>-<produtoId>), entao um
 * reenvio depois de falha parcial nao duplica a baixa.
 */
function rotaRequisicoesSeparar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = garantirAba(ss, ABA_REQUISICOES);
  const reqId = String(payload.reqId || "");
  if (!reqId) return { ok: false, error: "Informe a requisicao." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todas = lerAba(ss, ABA_REQUISICOES);
    const alvo = [];
    todas.forEach(function (linha, i) {
      if (String(linha.req_id) === reqId) alvo.push({ linha: linha, row: i + 2 });
    });
    if (!alvo.length) return { ok: false, error: "Requisicao nao encontrada: " + reqId };
    if (alvo.every(function (a) { return String(a.linha.status) !== "PENDENTE"; })) {
      return { ok: false, error: "Esta requisicao ja foi separada." };
    }

    const destino = String(alvo[0].linha.destino || "").toUpperCase();
    const separadorId = String(payload.separadorId || "");
    const agora = new Date().toISOString();
    const decisoes = {};
    (payload.itens || []).forEach(function (item) {
      decisoes[String(item.produtoId)] = item;
    });

    const movimentos = [];
    const atualizacoes = [];
    alvo.forEach(function (a) {
      const produtoId = String(a.linha.produto_id);
      const pedida = Number(a.linha.qtd_pedida) || 0;
      const decisao = decisoes[produtoId];
      // Item nao mencionado na separacao e tratado como recusado por falta.
      const bruta = decisao ? Number(decisao.qtdSeparada) : 0;
      // Nunca mais do que o pedido.
      const separada = Math.max(0, Math.min(pedida, Number.isFinite(bruta) ? bruta : 0));
      const status = separada === 0 ? "RECUSADO" : (separada < pedida ? "PARCIAL" : "SEPARADO");
      const obs = decisao && decisao.obs ? String(decisao.obs) : String(a.linha.obs || "");

      atualizacoes.push({ row: a.row, separada: separada, status: status, obs: obs });
      if (separada > 0) {
        movimentos.push(linhaMovimento({
          movId: "req-" + reqId + "-" + produtoId,
          tipo: "REQUISICAO",
          origem: ORIGEM_REQUISICAO,
          destino: destino,
          produtoId: produtoId,
          qtd: separada,
          unidade: String((decisao && decisao.unidade) || ""),
          usuarioId: separadorId,
          refDocumento: reqId,
          obs: separada < pedida ? "Pedido " + pedida + ", separado " + separada : "",
        }));
      }
    });

    // Movimentos primeiro: se a baixa falhar, a requisicao continua PENDENTE
    // e o estoquista tenta de novo. O contrario deixaria a requisicao fechada
    // sem estoque baixado, que e a pior das duas metades.
    let gravados = 0;
    if (movimentos.length) {
      const abaMov = garantirAba(ss, ABA_MOVIMENTOS);
      const idsExistentes = {};
      lerAba(ss, ABA_MOVIMENTOS).forEach(function (l) { idsExistentes[String(l.mov_id)] = true; });
      const novos = movimentos.filter(function (m) { return !idsExistentes[String(m[0])]; });
      if (novos.length) {
        abaMov.getRange(abaMov.getLastRow() + 1, 1, novos.length, CABECALHOS.MOVIMENTOS.length).setValues(novos);
      }
      gravados = novos.length;
    }

    // Atualizacao em UMA escrita so, como a dos movimentos.
    //
    // Antes eram cinco setValue por linha, num laco. Estourar no meio deixava
    // parte das linhas fechada e parte PENDENTE — e no reenvio as ja fechadas
    // mantinham o qtd_separada antigo enquanto o movimento, protegido pelo
    // mov_id determinista, nao acompanhava a quantidade nova. O resultado era
    // qtd_separada dizendo 5 com o movimento dizendo 6.
    //
    // Le o bloco que cobre as linhas afetadas, aplica em memoria e grava de
    // uma vez. Linhas de outras requisicoes que caiam no meio do bloco sao
    // reescritas identicas a si mesmas. O lock garante que ninguem mexeu.
    const linhasAfetadas = atualizacoes.map(function (u) { return u.row; });
    const primeira = Math.min.apply(null, linhasAfetadas);
    const ultima = Math.max.apply(null, linhasAfetadas);
    const largura = CABECALHOS.REQUISICOES.length;
    const bloco = sheet.getRange(primeira, 1, ultima - primeira + 1, largura).getValues();

    atualizacoes.forEach(function (u) {
      const linha = bloco[u.row - primeira];
      linha[6] = u.separada;    // qtd_separada
      linha[7] = u.status;      // status
      linha[8] = separadorId;   // separador_id
      linha[9] = agora;         // timestamp_separacao
      linha[12] = u.obs;        // obs
    });

    sheet.getRange(primeira, 1, bloco.length, largura).setValues(bloco);

    return {
      ok: true,
      reqId: reqId,
      status: statusDaRequisicao(atualizacoes.map(function (u) { return { status: u.status }; })),
      movimentosGravados: gravados,
      itens: atualizacoes.length,
    };
  } finally {
    lock.releaseLock();
  }
}

function requisicaoPublica(linha) {
  return {
    reqId: String(linha.req_id || ""),
    data: String(linha.data || ""),
    solicitanteId: String(linha.solicitante_id || ""),
    destino: String(linha.destino || ""),
    produtoId: String(linha.produto_id || ""),
    qtdPedida: Number(linha.qtd_pedida) || 0,
    qtdSeparada: linha.qtd_separada === "" || linha.qtd_separada === null ? null : Number(linha.qtd_separada),
    status: String(linha.status || "PENDENTE"),
    separadorId: String(linha.separador_id || ""),
    timestampSeparacao: linha.timestamp_separacao instanceof Date
      ? linha.timestamp_separacao.toISOString()
      : String(linha.timestamp_separacao || ""),
    obs: String(linha.obs || ""),
  };
}

// ---------------------------------------------------------------------------
// Espelho da contagem em MOVIMENTOS (Fase 2)
// ---------------------------------------------------------------------------

// A contagem e conferencia, nao lancamento. Cada produto contado gera:
//
//   1. uma linha CONTAGEM com o que foi fisicamente contado — registro da
//      conferencia, fora da conta de saldo;
//   2. uma linha AJUSTE com a diferenca entre o saldo teorico e o contado,
//      que traz o saldo daquele local para o valor contado. O valor desse
//      AJUSTE e a quebra do periodo — visivel numa linha propria, nunca uma
//      correcao silenciosa.
//
// Reenvio: a CONTAGEM tem id determinista que inclui a quantidade, entao
// reenviar igual nao duplica e reenviar corrigido registra o novo valor. O
// AJUSTE e sempre recalculado contra o saldo atual, entao reenvio identico da
// diferenca zero e nao grava nada. Movimento nunca e editado nem apagado.
function espelharContagemEmMovimentos(ss, payload) {
  const sheet = garantirAba(ss, ABA_MOVIMENTOS);
  const local = String(payload.local || "").toUpperCase();
  if (!local) return { contagens: 0, ajustes: 0, quebra: 0 };

  const idsExistentes = {};
  lerAba(ss, ABA_MOVIMENTOS).forEach(function (linha) { idsExistentes[String(linha.mov_id)] = true; });
  const saldos = calcularSaldos(ss, "");

  const linhas = [];
  let contagens = 0;
  let ajustes = 0;
  let quebra = 0;

  (payload.itens || []).forEach(function (item) {
    const produtoId = String(item.produtoId || "");
    if (!produtoId) return;
    const contado = Number(item.quantidade || 0);
    const unidade = String(item.unidade || "");
    const usuarioId = String(payload.usuarioId || payload.lider || "");
    const referencia = String(payload.inventoryId || "");

    const movId = "cont-" + (referencia || "sem-id") + "-" + produtoId + "-" + contado;
    if (!idsExistentes[movId]) {
      idsExistentes[movId] = true;
      contagens += 1;
      linhas.push(linhaMovimento({
        movId,
        tipo: "CONTAGEM",
        origem: "",
        destino: local,
        produtoId,
        qtd: contado,
        unidade,
        usuarioId,
        refDocumento: referencia,
        obs: String(item.observacao || ""),
      }));
    }

    const teorico = Number((saldos[produtoId] || {})[local] || 0);
    const diferenca = Math.round((contado - teorico) * 100) / 100;
    if (diferenca === 0) return;

    ajustes += 1;
    quebra += diferenca;
    linhas.push(linhaMovimento({
      tipo: "AJUSTE",
      origem: "",
      destino: local,
      produtoId,
      qtd: diferenca,
      unidade,
      usuarioId,
      refDocumento: referencia,
      obs: "Contagem " + String(payload.data || "") + ": teorico " + teorico + ", contado " + contado,
    }));
    // O proximo item do mesmo produto no mesmo envio ja enxerga o saldo novo.
    if (!saldos[produtoId]) saldos[produtoId] = {};
    saldos[produtoId][local] = contado;
  });

  if (linhas.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, CABECALHOS.MOVIMENTOS.length).setValues(linhas);
  }
  return { contagens, ajustes, quebra: Math.round(quebra * 100) / 100 };
}

// ---------------------------------------------------------------------------
// Helpers das abas novas
// ---------------------------------------------------------------------------

function garantirAba(ss, nome) {
  const cabecalho = CABECALHOS[nome];
  let sheet = ss.getSheetByName(nome);
  if (!sheet) {
    sheet = ss.insertSheet(nome);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, cabecalho.length).setFontWeight("bold");
  }
  return sheet;
}

// Le a aba como lista de objetos com as chaves do cabecalho.
function lerAba(ss, nome) {
  const sheet = ss.getSheetByName(nome);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const cabecalho = CABECALHOS[nome];
  const valores = sheet.getRange(2, 1, sheet.getLastRow() - 1, cabecalho.length).getValues();
  return valores
    .filter(function (linha) { return String(linha[0] || "").trim(); })
    .map(function (linha) {
      const objeto = {};
      cabecalho.forEach(function (chave, i) { objeto[chave] = linha[i]; });
      return objeto;
    });
}

function linhaProduto(produto) {
  const fornecedores = Array.isArray(produto.fornecedores)
    ? produto.fornecedores.join(", ")
    : String(produto.fornecedor || "");
  return [
    String(produto.produtoId || produto.produto_id || novoId("prod")),
    String(produto.nome || produto.nome_canonico || ""),
    String(produto.categoria || ""),
    String(produto.unidade || ""),
    Number(produto.fatorPack) || 1,
    String(produto.packNome || ""),
    fornecedores,
    // Absolut Tabasco fica com minimo vazio de proposito: nunca entra na
    // sugestao de compra.
    produto.minimo === null || produto.minimo === undefined || produto.minimo === "" ? "" : Number(produto.minimo),
    produto.ativo !== false,
    produto.requisitavel === true,
    produto.produzido === true,
  ];
}

function linhaUsuarioNova(usuario) {
  return [
    String(usuario.usuarioId || usuario.usuario_id || novoId("user")),
    String(usuario.nome || ""),
    normalizeLogin(usuario.login || usuario.nome),
    hashSenha(String(usuario.senha || "")),
    String(usuario.perfil || "consulta"),
    usuario.ativo !== false,
  ];
}

function linhaMovimento(mov) {
  return [
    String(mov.movId || mov.mov_id || novoId("mov")),
    mov.timestamp ? String(mov.timestamp) : new Date().toISOString(),
    String(mov.tipo || "AJUSTE").toUpperCase(),
    String(mov.origem || "").toUpperCase(),
    String(mov.destino || "").toUpperCase(),
    String(mov.produtoId || mov.produto_id || ""),
    Number(mov.qtd) || 0,
    String(mov.unidade || ""),
    String(mov.usuarioId || mov.usuario_id || ""),
    String(mov.refDocumento || mov.ref_documento || ""),
    String(mov.obs || ""),
  ];
}

function movimentoPublico(linha) {
  return {
    movId: String(linha.mov_id || ""),
    timestamp: linha.timestamp instanceof Date ? linha.timestamp.toISOString() : String(linha.timestamp || ""),
    tipo: String(linha.tipo || ""),
    origem: String(linha.origem || ""),
    destino: String(linha.destino || ""),
    produtoId: String(linha.produto_id || ""),
    qtd: Number(linha.qtd) || 0,
    unidade: String(linha.unidade || ""),
    usuarioId: String(linha.usuario_id || ""),
    refDocumento: String(linha.ref_documento || ""),
    obs: String(linha.obs || ""),
  };
}

function usuarioPublico(linha) {
  return {
    usuarioId: String(linha.usuario_id || ""),
    nome: String(linha.nome || ""),
    login: normalizeLogin(linha.login),
    // Um usuario pode acumular perfis: "admin, producao".
    perfis: String(linha.perfil || "").split(",").map(function (p) { return p.trim().toLowerCase(); }).filter(Boolean),
    ativo: linha.ativo !== false && String(linha.ativo).toUpperCase() !== "FALSE",
  };
}

// Senha em planilha nao e seguranca real — e controle de fluxo e
// rastreabilidade. Guardamos so o hash, nunca a senha em texto puro.
function hashSenha(senha) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, SENHA_SALT + String(senha), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

function normalizeLogin(valor) {
  return String(valor || "").trim().toLowerCase();
}

function novoId(prefixo) {
  return prefixo + "-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8);
}

function chaveContribuicao(sheetName, colunaNome, inventoryId) {
  return "contrib_" + sheetName + "_" + colunaNome + "_" + inventoryId;
}

// Vira o dia: as contribuicoes do dia anterior nao servem mais e sairiam
// estourando o limite de Script Properties com o tempo. Limpa as duas
// colunas de uma vez, porque o prefixo nao inclui o nome da coluna.
function limparContribuicoes(props, sheetName) {
  const prefixo = "contrib_" + sheetName + "_";
  props.getKeys().forEach(function (chave) {
    if (chave.indexOf(prefixo) === 0) props.deleteProperty(chave);
  });
  // Chave do formato antigo, de antes do roteamento por coluna.
  props.deleteProperty("linhasGravadas_" + sheetName);
}

// ---------------------------------------------------------------------------
// Fluxo antigo de contagem — inalterado
// ---------------------------------------------------------------------------

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

// A tela de contagem coleta UM numero por produto; e o tipo do inventario que
// decide em qual coluna ele entra. Ate agora tudo caia em "Fecha", entao uma
// contagem de abertura sobrescrevia o fechamento da semana.
//
// Sem coluna "Abre" na aba, a gravacao falha alto em vez de cair em "Fecha" —
// gravar abertura em cima de fechamento e exatamente o bug que isto conserta.
function colunaDoInventario(sheet, tipo) {
  if (normalizeName(tipo).indexOf("abertura") === 0) {
    const abre = findHeaderColumn(sheet, "Abre");
    if (!abre) {
      throw new Error(
        "A aba " + sheet.getName() + " nao tem coluna \"Abre\". A contagem de abertura nao " +
        "foi gravada para nao sobrescrever o fechamento."
      );
    }
    return { indice: abre, nome: "Abre" };
  }
  return { indice: findHeaderColumn(sheet, "Fecha") || 3, nome: "Fecha" };
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

// Faixa dos acentos combinados (U+0300 a U+036F), montada a partir de string
// para o arquivo continuar legivel em ASCII.
const ACENTOS = new RegExp("[̀-ͯ]", "g");

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(ACENTOS, "")
    .replace(/\s+/g, " ");
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
