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
  // papel decide o que a pessoa pode; nome de pessoa nunca entra no codigo.
  // Yvison pode sair da casa — o papel fica.
  USUARIOS: ["usuario_id", "nome", "login", "senha_hash", "perfil", "ativo", "papel", "pode_atribuir_tarefa", "papel_operacional"],
  MOVIMENTOS: ["mov_id", "timestamp", "tipo", "origem", "destino", "produto_id", "qtd", "unidade", "usuario_id", "ref_documento", "obs"],
  // Uma linha por item. A chave e (req_id, produto_id): a mesma requisicao
  // nao pede o mesmo produto duas vezes.
  // As colunas de autoria (E4) vem depois das antigas de proposito: assim a
  // migracao so acrescenta a direita e nenhuma linha ja gravada se desloca.
  REQUISICOES: ["req_id", "data", "solicitante_id", "destino", "produto_id", "qtd_pedida", "qtd_separada", "status", "separador_id", "timestamp_separacao", "recebedor_id", "timestamp_recebimento", "obs", "criado_por", "criado_em", "data_operacional", "cancelado_por", "cancelado_em", "fechado_automaticamente"],

  // Fase 5 — checklists operacionais.
  CHK_TEMPLATES: ["template_id", "nome", "local", "responsavel", "momento", "dias_semana", "ativo", "criado_em"],
  CHK_ITENS: ["item_id", "template_id", "ordem", "descricao", "tipo_evidencia", "referencia", "obrigatorio", "ativo"],
  CHK_EXECUCOES: ["execucao_id", "template_id", "data", "local", "usuario", "status", "iniciado_em", "concluido_em"],
  CHK_RESPOSTAS: ["resposta_id", "execucao_id", "item_id", "valor", "usuario", "registrado_em"],
  // Bloco C — mural de recados. Substituiu a aba MURAL da entrega anterior,
  // que tinha "resolvido" e nunca recebeu uma linha. Recado não se resolve:
  // ou está no mural, ou o autor tirou.
  RECADOS: ["recado_id", "autor", "texto", "fixado", "ativo", "criado_em"],

  // Bloco D — avisos dentro do app. Canal unico INAPP.
  NOTIFICACOES: ["notif_id", "usuario", "tipo", "titulo", "corpo", "link", "lida", "criada_em"],
};

// A casa opera depois da meia-noite. Movimento antes desta hora pertence ao
// dia anterior — requisicao das 02:30 de sabado e da operacao de sexta.
const HORA_CORTE_OPERACIONAL = 6;
const TIMEZONE_CASA = "America/Sao_Paulo";

// Fluxo de duas pernas: quem precisa pede, o estoquista separa e manda. A
// baixa no estoque acontece na separacao — nao ha confirmacao de recebimento,
// entao nao ha saldo reservado nem trava de esquecimento.
//
// As colunas recebedor_id e timestamp_recebimento ficam vazias de proposito:
// existem para o dia em que a terceira perna for ligada, sem migracao.
const STATUS_REQUISICAO = ["PENDENTE", "SEPARADO", "PARCIAL", "RECUSADO", "CANCELADO"];

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
    // cabecalho "Fecha" com fallback cego na coluna 3, e a aba de referencia
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
  "requisicoes.cancelar": rotaRequisicoesCancelar,

  // Fase 5.
  "chk_bootstrap": rotaChkBootstrap,
  "chk_listar_meus": rotaChkListarMeus,
  "chk_detalhe": rotaChkDetalhe,
  "chk_abrir_execucao": rotaChkAbrirExecucao,
  "chk_responder_item": rotaChkResponderItem,
  "chk_concluir": rotaChkConcluir,
  "chk_painel": rotaChkPainel,
  "chk_relatorio": rotaChkRelatorio,
  "chk_crud_template": rotaChkCrudTemplate,
  // Bloco C — mural.
  "recado_listar": rotaRecadoListar,
  "recado_publicar": rotaRecadoPublicar,
  "recado_desativar": rotaRecadoDesativar,
  "recado_fixar": rotaRecadoFixar,

  // Bloco D — avisos.
  "notif_listar": rotaNotifListar,
  "notif_marcar_lida": rotaNotifMarcarLida,
  "notif_marcar_todas_lidas": rotaNotifMarcarTodasLidas,
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
          String(usuario.papel || atual.papel || "OPERADOR").toUpperCase(),
          usuario.podeAtribuirTarefa === undefined
            ? (String(atual.pode_atribuir_tarefa).toUpperCase() === "TRUE" || atual.pode_atribuir_tarefa === true)
            : usuario.podeAtribuirTarefa === true,
          String(usuario.papelOperacional === undefined ? (atual.papel_operacional || "") : usuario.papelOperacional).toUpperCase(),
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

    // E1: valida TODOS os itens antes de gravar qualquer um. Um item invalido
    // recusa a requisicao inteira e diz qual foi — arredondar em silencio
    // esconderia o erro de digitacao, que e exatamente o que produziu a
    // requisicao com 12,4 / 12,3 / 12,2 que esta no historico.
    const invalidos = [];
    itens.forEach(function (item) {
      const produtoId = String(item.produtoId || "");
      if (!produtoId) return;
      if (validarInteiro(item.qtd) === null) {
        invalidos.push(String(item.produto || produtoId) + " (" + String(item.qtd) + ")");
      }
    });
    if (invalidos.length) {
      return {
        ok: false,
        error: "Quantidade tem que ser numero inteiro maior que zero. Corrija: " + invalidos.join(", "),
        itensInvalidos: invalidos,
      };
    }

    // E4: autoria vem da sessao, nunca de campo de tela, e o instante e do
    // servidor. criado_em guarda o momento real; data_operacional guarda o
    // dia de operacao, que antes das 06:00 e o dia anterior.
    const agora = agoraISO();
    const criadoPor = normalizeLogin(payload.criadoPor || payload.solicitanteId || "");
    const diaOperacional = dataOperacional(agora);

    const vistos = {};
    const linhas = [];
    itens.forEach(function (item) {
      const produtoId = String(item.produtoId || "");
      const qtd = validarInteiro(item.qtd);
      // Produto repetido nao vira segunda linha.
      if (!produtoId || qtd === null || vistos[produtoId]) return;
      vistos[produtoId] = true;
      linhas.push([
        reqId,
        String(payload.data || diaOperacional),
        String(payload.solicitanteId || ""),
        destino,
        produtoId,
        qtd,
        "",
        "PENDENTE",
        "", "", "", "",
        String(item.obs || ""),
        criadoPor,
        agora,
        diaOperacional,
        "", "", false,
      ]);
    });

    if (!linhas.length) return { ok: false, error: "Nenhum item valido na requisicao." };
    sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, CABECALHOS.REQUISICOES.length).setValues(linhas);

    // E3: avisa quem separa. Destinatario resolvido por PAPEL — trocar o
    // papel_operacional na planilha muda quem recebe, sem tocar em codigo.
    // notificar() nunca lanca: aviso que falha nao derruba a requisicao.
    notificar({
      destinatarios: usuariosComPapelOperacional("SEPARADOR"),
      tipo: "REQUISICAO_CRIADA",
      titulo: "Nova requisicao - " + destino,
      corpo: nomeDoUsuario(ss, criadoPor) + " pediu " + linhas.length + " item(ns)",
      link: "/requisicoes/" + reqId,
      // Salvar a mesma requisicao duas vezes em cinco minutos avisa uma vez.
      chaveDedup: "/requisicoes/" + reqId,
    });

    return { ok: true, reqId, criados: linhas.length, criadoPor: criadoPor, dataOperacional: diaOperacional };
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
  // Cancelada vem antes de tudo: se todas as linhas foram canceladas, a
  // requisicao esta cancelada, e nao pendente nem recusada.
  if (itens.every(function (i) { return i.status === "CANCELADO"; })) return "CANCELADO";
  if (itens.some(function (i) { return i.status === "PENDENTE"; })) return "PENDENTE";
  if (itens.every(function (i) { return i.status === "RECUSADO"; })) return "RECUSADO";
  if (itens.some(function (i) { return i.status !== "SEPARADO"; })) return "PARCIAL";
  return "SEPARADO";
}

/**
 * Cancela uma requisicao inteira.
 *
 * Nao apaga linha nenhuma: a requisicao vira CANCELADO e some das abertas.
 * Apagar de verdade quebraria o rastro — o mesmo principio de MOVIMENTOS, que
 * nunca e editado nem apagado.
 *
 * So cancela o que ainda esta PENDENTE em todas as linhas. Se qualquer item
 * ja foi separado, o estoque ja baixou e desfazer isso exige movimento de
 * volta, nao uma troca de status.
 */
function rotaRequisicoesCancelar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  garantirAba(ss, ABA_REQUISICOES);
  const reqId = String(payload.reqId || "");
  if (!reqId) return { ok: false, error: "Informe a requisicao." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = ss.getSheetByName(ABA_REQUISICOES);
    const todas = lerAba(ss, ABA_REQUISICOES);
    const alvo = [];
    todas.forEach(function (linha, i) {
      if (String(linha.req_id) === reqId) alvo.push({ linha: linha, row: i + 2 });
    });
    if (!alvo.length) return { ok: false, error: "Requisicao nao encontrada: " + reqId };

    const jaMexida = alvo.filter(function (a) { return String(a.linha.status) !== "PENDENTE"; });
    if (jaMexida.length) {
      return {
        ok: false,
        error: "Esta requisicao ja foi separada e nao pode ser cancelada. Registre a devolucao em MOVIMENTOS.",
      };
    }

    const agora = new Date().toISOString();
    const quem = String(payload.usuarioId || "");
    const motivo = String(payload.motivo || "").trim();
    const colunas = CABECALHOS.REQUISICOES;
    const colStatus = colunas.indexOf("status") + 1;
    const colSeparador = colunas.indexOf("separador_id") + 1;
    const colTimestamp = colunas.indexOf("timestamp_separacao") + 1;
    const colObs = colunas.indexOf("obs") + 1;

    alvo.forEach(function (a) {
      sheet.getRange(a.row, colStatus).setValue("CANCELADO");
      sheet.getRange(a.row, colSeparador).setValue(quem);
      sheet.getRange(a.row, colTimestamp).setValue(agora);
      const anterior = String(a.linha.obs || "").trim();
      const nota = "Cancelada por " + (quem || "usuario") + (motivo ? " - " + motivo : "");
      sheet.getRange(a.row, colObs).setValue(anterior ? anterior + " | " + nota : nota);
    });

    return { ok: true, reqId: reqId, canceladas: alvo.length };
  } finally {
    lock.releaseLock();
  }
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
    const separacaoInvalida = [];
    alvo.forEach(function (a) {
      const produtoId = String(a.linha.produto_id);
      const pedida = Number(a.linha.qtd_pedida) || 0;
      const decisao = decisoes[produtoId];
      // Item nao mencionado na separacao e tratado como recusado por falta.
      // Zero e recusa por falta, e e valido; o resto tem que ser inteiro.
      const bruta = decisao === undefined || decisao.qtdSeparada === "" || decisao.qtdSeparada === null
        ? 0
        : (String(decisao.qtdSeparada).trim() === "0" ? 0 : validarInteiro(decisao.qtdSeparada));
      if (bruta === null) {
        separacaoInvalida.push(String(a.linha.produto_id) + " (" + String(decisao.qtdSeparada) + ")");
        return;
      }
      // Nunca mais do que o pedido.
      const separada = Math.max(0, Math.min(pedida, bruta));
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

    if (separacaoInvalida.length) {
      return {
        ok: false,
        error: "Quantidade separada tem que ser inteiro. Corrija: " + separacaoInvalida.join(", "),
      };
    }

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
    String(usuario.papel || "OPERADOR").toUpperCase(),
    usuario.podeAtribuirTarefa === true,
    String(usuario.papelOperacional || "").toUpperCase(),
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
    papel: String(linha.papel || "OPERADOR").toUpperCase(),
    podeAtribuirTarefa: String(linha.pode_atribuir_tarefa).toUpperCase() === "TRUE" || linha.pode_atribuir_tarefa === true,
    papelOperacional: String(linha.papel_operacional || "").toUpperCase(),
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

// ===========================================================================
// FASE 5 — CHECKLISTS OPERACIONAIS
//
// Checklist recorrente por turno, atribuido por territorio. Este modulo NAO
// escreve em MOVIMENTOS: le apenas para validar evidencia do tipo CONTAGEM.
//
// Duas regras mandam em tudo aqui:
//
//   1. Timestamp e sempre do servidor. Relogio de celular nao entra.
//   2. Toda escrita e upsert por chave. O historico de inventario tem
//      contagens duplicadas e triplicadas pelo mesmo inventoryId (12/07,
//      Bar 22, Agua 510ml gravada 1802 -> 1804 -> 1806 em tres POSTs do
//      mesmo id). Aqui reenviar sobrescreve, nunca acrescenta.
// ===========================================================================

const ABA_CHK_TEMPLATES = "CHK_TEMPLATES";
const ABA_CHK_ITENS = "CHK_ITENS";
const ABA_CHK_EXECUCOES = "CHK_EXECUCOES";
const ABA_CHK_RESPOSTAS = "CHK_RESPOSTAS";

const MOMENTOS_CHK = ["ABERTURA", "PRE_OPERACAO", "FECHAMENTO"];
const TIPOS_EVIDENCIA = ["TOGGLE", "NUMERO", "TEXTO", "CONTAGEM"];
const STATUS_EXECUCAO = ["ABERTA", "CONCLUIDA", "EXPIRADA"];

// Locais do checklist. Sao os mesmos codigos de MOVIMENTOS, para a validacao
// de CONTAGEM poder cruzar direto sem tabela de-para.
const LOCAIS_CHK = ["BAR22", "BAR23", "CHIVAS", "GERAL", "PRODUCAO"];

// Execucao ABERTA vira EXPIRADA depois disto, contado da data operacional.
const HORAS_ATE_EXPIRAR = 24;

/**
 * Le uma aba e devolve tambem a linha da planilha de cada registro, que e o
 * que permite fazer upsert sem reescrever a aba inteira.
 */
function lerAbaComLinha(ss, nome) {
  const sheet = ss.getSheetByName(nome);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const cabecalho = CABECALHOS[nome];
  const valores = sheet.getRange(2, 1, sheet.getLastRow() - 1, cabecalho.length).getValues();
  const saida = [];
  valores.forEach(function (linha, i) {
    if (!String(linha[0] || "").trim()) return;
    const objeto = { _row: i + 2 };
    cabecalho.forEach(function (chave, c) { objeto[chave] = linha[c]; });
    saida.push(objeto);
  });
  return saida;
}

/**
 * Upsert: se `achar` encontrar uma linha, sobrescreve; senao, acrescenta.
 * Devolve { row, criou }.
 *
 * E o coracao da idempotencia. Toda escrita deste modulo passa por aqui, e
 * sempre dentro de um lock — duas pessoas respondendo o mesmo item ao mesmo
 * tempo nao podem virar duas linhas.
 */
function upsertLinha(ss, nome, achar, valoresPorColuna) {
  const sheet = garantirAba(ss, nome);
  const cabecalho = CABECALHOS[nome];
  const existentes = lerAbaComLinha(ss, nome);
  const alvo = existentes.filter(achar)[0];
  const linha = cabecalho.map(function (coluna) {
    return valoresPorColuna[coluna] === undefined ? "" : valoresPorColuna[coluna];
  });
  if (alvo) {
    sheet.getRange(alvo._row, 1, 1, cabecalho.length).setValues([linha]);
    return { row: alvo._row, criou: false };
  }
  const row = sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, cabecalho.length).setValues([linha]);
  return { row: row, criou: true };
}

function agoraISO() {
  return new Date().toISOString();
}

function textoDe(valor) {
  return String(valor === undefined || valor === null ? "" : valor).trim();
}

function ehVerdadeiro(valor) {
  const texto = textoDe(valor).toLowerCase();
  return texto === "true" || texto === "sim" || texto === "1" || valor === true;
}

/** Data operacional em YYYY-MM-DD, aceitando Date ou string da planilha. */
function dataISO(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, "America/Sao_Paulo", "yyyy-MM-dd");
  }
  return textoDe(valor).slice(0, 10);
}

/** 1 = segunda ... 7 = domingo, como o campo dias_semana do template. */
function diaDaSemanaOperacional(dataTexto) {
  const partes = String(dataTexto).split("-");
  const data = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  const dom0 = data.getDay();
  return dom0 === 0 ? 7 : dom0;
}

/** Template vale hoje? Lista vazia de dias significa todos os dias. */
function templateDevidoNaData(template, dataTexto) {
  if (!ehVerdadeiro(template.ativo)) return false;
  const dias = textoDe(template.dias_semana);
  if (!dias) return true;
  const hoje = String(diaDaSemanaOperacional(dataTexto));
  return dias.split(",").map(function (d) { return d.trim(); }).indexOf(hoje) >= 0;
}

/**
 * Quem esta chamando e admin? Vale o que esta na aba USUARIOS, nunca o que o
 * cliente afirma — o token viaja no bundle e qualquer um pode forjar payload.
 *
 * Usuario que so existe no acesso de reserva do aparelho nao e admin aqui.
 */
function ehAdminChk(ss, usuario) {
  const login = textoDe(usuario).toLowerCase();
  if (!login) return false;
  const achado = lerAba(ss, ABA_USUARIOS).filter(function (u) {
    return textoDe(u.login).toLowerCase() === login && ehVerdadeiro(u.ativo);
  })[0];
  if (!achado) return false;
  return textoDe(achado.perfil).toLowerCase().indexOf("admin") >= 0;
}

function exigirAdminChk(ss, usuario) {
  if (!ehAdminChk(ss, usuario)) {
    return { ok: false, error: "Acesso negado: esta tela e do administrador." };
  }
  return null;
}

/** O template e desta pessoa? Admin passa por cima. */
function podeExecutarTemplate(ss, template, usuario) {
  const login = textoDe(usuario).toLowerCase();
  if (textoDe(template.responsavel).toLowerCase() === login) return true;
  return ehAdminChk(ss, usuario);
}

// --- Leitura ---------------------------------------------------------------

/**
 * Os checklists devidos por esta pessoa nesta data, com o estado de cada um.
 * Nao cria execucao: so olhar a lista nao pode abrir nada.
 */
function rotaChkListarMeus(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usuario = textoDe(payload.usuario).toLowerCase();
  const data = dataISO(payload.data) || dataISO(new Date());
  if (!usuario) return { ok: false, error: "Informe o usuario." };

  const admin = ehAdminChk(ss, usuario);
  const templates = lerAba(ss, ABA_CHK_TEMPLATES).filter(function (t) {
    const meu = textoDe(t.responsavel).toLowerCase() === usuario;
    return (admin || meu) && templateDevidoNaData(t, data);
  });

  const itens = lerAba(ss, ABA_CHK_ITENS).filter(function (i) { return ehVerdadeiro(i.ativo); });
  const execucoes = lerAba(ss, ABA_CHK_EXECUCOES).filter(function (e) { return dataISO(e.data) === data; });
  const respostas = lerAba(ss, ABA_CHK_RESPOSTAS);

  const lista = templates.map(function (template) {
    const doTemplate = itens.filter(function (i) { return textoDe(i.template_id) === textoDe(template.template_id); });
    const execucao = execucoes.filter(function (e) {
      return textoDe(e.template_id) === textoDe(template.template_id) &&
        textoDe(e.usuario).toLowerCase() === textoDe(template.responsavel).toLowerCase();
    })[0];
    const respondidos = execucao
      ? respostas.filter(function (r) { return textoDe(r.execucao_id) === textoDe(execucao.execucao_id); }).length
      : 0;
    return {
      templateId: textoDe(template.template_id),
      nome: textoDe(template.nome),
      local: textoDe(template.local),
      momento: textoDe(template.momento),
      responsavel: textoDe(template.responsavel),
      totalItens: doTemplate.length,
      obrigatorios: doTemplate.filter(function (i) { return ehVerdadeiro(i.obrigatorio); }).length,
      respondidos: respondidos,
      execucaoId: execucao ? textoDe(execucao.execucao_id) : "",
      status: execucao ? textoDe(execucao.status) : "NAO_INICIADA",
    };
  });

  return { ok: true, data: data, admin: admin, checklists: lista };
}

/** Itens de um template, na ordem, com as respostas ja dadas na execucao. */
function rotaChkDetalhe(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const templateId = textoDe(payload.template_id);
  const execucaoId = textoDe(payload.execucao_id);
  if (!templateId) return { ok: false, error: "Informe o template." };

  const itens = lerAba(ss, ABA_CHK_ITENS)
    .filter(function (i) { return textoDe(i.template_id) === templateId && ehVerdadeiro(i.ativo); })
    .sort(function (a, b) { return (Number(a.ordem) || 0) - (Number(b.ordem) || 0); });

  const respostas = execucaoId
    ? lerAba(ss, ABA_CHK_RESPOSTAS).filter(function (r) { return textoDe(r.execucao_id) === execucaoId; })
    : [];
  const porItem = {};
  respostas.forEach(function (r) { porItem[textoDe(r.item_id)] = r; });

  const execucao = execucaoId
    ? lerAba(ss, ABA_CHK_EXECUCOES).filter(function (e) { return textoDe(e.execucao_id) === execucaoId; })[0]
    : null;

  return {
    ok: true,
    status: execucao ? textoDe(execucao.status) : "NAO_INICIADA",
    itens: itens.map(function (i) {
      const resposta = porItem[textoDe(i.item_id)];
      return {
        itemId: textoDe(i.item_id),
        ordem: Number(i.ordem) || 0,
        descricao: textoDe(i.descricao),
        tipoEvidencia: textoDe(i.tipo_evidencia),
        referencia: textoDe(i.referencia),
        obrigatorio: ehVerdadeiro(i.obrigatorio),
        valor: resposta ? textoDe(resposta.valor) : "",
        registradoEm: resposta ? textoDe(resposta.registrado_em) : "",
      };
    }),
  };
}

// --- Escrita ---------------------------------------------------------------

/**
 * Abre a execucao do dia. Idempotente pela chave (template_id, data): chamar
 * duas vezes devolve o mesmo execucao_id e deixa uma linha so.
 */
function rotaChkAbrirExecucao(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const templateId = textoDe(payload.template_id);
  const usuario = textoDe(payload.usuario).toLowerCase();
  const data = dataISO(payload.data) || dataISO(new Date());
  if (!templateId || !usuario) return { ok: false, error: "Informe o template e o usuario." };

  const template = lerAba(ss, ABA_CHK_TEMPLATES).filter(function (t) {
    return textoDe(t.template_id) === templateId;
  })[0];
  if (!template) return { ok: false, error: "Checklist nao encontrado." };
  if (!podeExecutarTemplate(ss, template, usuario)) {
    return { ok: false, error: "Este checklist e de " + textoDe(template.responsavel) + ".", codigo: 403 };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const jaAberta = lerAba(ss, ABA_CHK_EXECUCOES).filter(function (e) {
      return textoDe(e.template_id) === templateId && dataISO(e.data) === data;
    })[0];
    if (jaAberta) {
      return { ok: true, execucaoId: textoDe(jaAberta.execucao_id), status: textoDe(jaAberta.status), reaproveitada: true };
    }

    const execucaoId = novoId("exe");
    upsertLinha(ss, ABA_CHK_EXECUCOES,
      function (e) { return textoDe(e.execucao_id) === execucaoId; },
      {
        execucao_id: execucaoId,
        template_id: templateId,
        data: data,
        local: textoDe(template.local),
        usuario: textoDe(template.responsavel).toLowerCase(),
        status: "ABERTA",
        iniciado_em: agoraISO(),
        concluido_em: "",
      });
    return { ok: true, execucaoId: execucaoId, status: "ABERTA", reaproveitada: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Valida a evidencia de um item. Devolve string de erro ou "" quando passa.
 *
 * NUMERO aceita zero e recusa vazio: "nao tinha nenhum" e uma resposta,
 * "nao respondi" nao e.
 */
function validarEvidencia(ss, item, valor, execucao) {
  const tipo = textoDe(item.tipo_evidencia).toUpperCase();
  const texto = textoDe(valor);

  if (tipo === "TOGGLE") return "";

  if (tipo === "NUMERO") {
    if (texto === "") return "Preencha o numero. Zero vale como resposta; vazio nao.";
    if (!isFinite(Number(texto.replace(",", ".")))) return "Valor invalido: " + texto;
    return "";
  }

  if (tipo === "TEXTO") {
    if (texto.length < 3) return "Escreva pelo menos 3 caracteres.";
    return "";
  }

  if (tipo === "CONTAGEM") {
    const referencia = textoDe(item.referencia);
    if (!referencia) return "Este item pede contagem mas nao tem produto de referencia cadastrado.";
    const local = textoDe(execucao.local).toUpperCase();
    const data = dataISO(execucao.data);

    const produto = lerAba(ss, ABA_PRODUTOS).filter(function (p) {
      return normalizeName(p.nome_canonico) === normalizeName(referencia);
    })[0];
    if (!produto) return "Produto \"" + referencia + "\" nao existe no catalogo PRODUTOS.";

    const temContagem = lerAba(ss, ABA_MOVIMENTOS).some(function (m) {
      return textoDe(m.produto_id) === textoDe(produto.produto_id) &&
        String(m.timestamp).slice(0, 10) === data &&
        (textoDe(m.origem).toUpperCase() === local || textoDe(m.destino).toUpperCase() === local);
    });
    if (!temContagem) {
      return "Falta a contagem de \"" + referencia + "\" em " + local + " no dia " + data +
        ". Lance a contagem primeiro; este item so fecha com o movimento registrado.";
    }
    return "";
  }

  return "Tipo de evidencia desconhecido: " + tipo;
}

/**
 * Responde um item. Upsert por (execucao_id, item_id): reenviar a mesma
 * resposta tres vezes deixa uma linha so, com o timestamp da ultima.
 */
function rotaChkResponderItem(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const execucaoId = textoDe(payload.execucao_id);
  const itemId = textoDe(payload.item_id);
  const usuario = textoDe(payload.usuario).toLowerCase();
  if (!execucaoId || !itemId || !usuario) return { ok: false, error: "Informe execucao, item e usuario." };

  const execucao = lerAba(ss, ABA_CHK_EXECUCOES).filter(function (e) {
    return textoDe(e.execucao_id) === execucaoId;
  })[0];
  if (!execucao) return { ok: false, error: "Execucao nao encontrada." };

  const status = textoDe(execucao.status);
  if (status !== "ABERTA") {
    return { ok: false, error: "Esta execucao esta " + status + " e nao aceita mais resposta. Correcao e com o administrador." };
  }

  const template = lerAba(ss, ABA_CHK_TEMPLATES).filter(function (t) {
    return textoDe(t.template_id) === textoDe(execucao.template_id);
  })[0];
  if (template && !podeExecutarTemplate(ss, template, usuario)) {
    return { ok: false, error: "Este checklist e de " + textoDe(template.responsavel) + ".", codigo: 403 };
  }

  const item = lerAba(ss, ABA_CHK_ITENS).filter(function (i) { return textoDe(i.item_id) === itemId; })[0];
  if (!item) return { ok: false, error: "Item nao encontrado." };

  const erro = validarEvidencia(ss, item, payload.valor, execucao);
  if (erro) return { ok: false, error: erro };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const anterior = lerAba(ss, ABA_CHK_RESPOSTAS).filter(function (r) {
      return textoDe(r.execucao_id) === execucaoId && textoDe(r.item_id) === itemId;
    })[0];
    upsertLinha(ss, ABA_CHK_RESPOSTAS,
      function (r) { return textoDe(r.execucao_id) === execucaoId && textoDe(r.item_id) === itemId; },
      {
        resposta_id: anterior ? textoDe(anterior.resposta_id) : novoId("res"),
        execucao_id: execucaoId,
        item_id: itemId,
        valor: textoDe(payload.valor),
        usuario: usuario,
        registrado_em: agoraISO(),
      });
    return { ok: true, itemId: itemId, sobrescreveu: Boolean(anterior) };
  } finally {
    lock.releaseLock();
  }
}

/** Conclui a execucao, ou devolve a lista de obrigatorios que faltam. */
function rotaChkConcluir(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const execucaoId = textoDe(payload.execucao_id);
  const usuario = textoDe(payload.usuario).toLowerCase();
  if (!execucaoId) return { ok: false, error: "Informe a execucao." };

  const execucao = lerAba(ss, ABA_CHK_EXECUCOES).filter(function (e) {
    return textoDe(e.execucao_id) === execucaoId;
  })[0];
  if (!execucao) return { ok: false, error: "Execucao nao encontrada." };
  if (textoDe(execucao.status) !== "ABERTA") {
    return { ok: false, error: "Esta execucao esta " + textoDe(execucao.status) + "." };
  }

  const obrigatorios = lerAba(ss, ABA_CHK_ITENS).filter(function (i) {
    return textoDe(i.template_id) === textoDe(execucao.template_id) && ehVerdadeiro(i.ativo) && ehVerdadeiro(i.obrigatorio);
  });
  const respondidos = {};
  lerAba(ss, ABA_CHK_RESPOSTAS).forEach(function (r) {
    if (textoDe(r.execucao_id) === execucaoId) respondidos[textoDe(r.item_id)] = textoDe(r.valor);
  });

  const pendentes = obrigatorios.filter(function (i) {
    const valor = respondidos[textoDe(i.item_id)];
    if (valor === undefined) return true;
    return validarEvidencia(ss, i, valor, execucao) !== "";
  }).map(function (i) { return { itemId: textoDe(i.item_id), descricao: textoDe(i.descricao) }; });

  if (pendentes.length) {
    return { ok: false, error: "Faltam " + pendentes.length + " item(ns) obrigatorio(s).", pendentes: pendentes };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    upsertLinha(ss, ABA_CHK_EXECUCOES,
      function (e) { return textoDe(e.execucao_id) === execucaoId; },
      {
        execucao_id: execucaoId,
        template_id: textoDe(execucao.template_id),
        data: dataISO(execucao.data),
        local: textoDe(execucao.local),
        usuario: textoDe(execucao.usuario),
        status: "CONCLUIDA",
        iniciado_em: textoDe(execucao.iniciado_em),
        concluido_em: agoraISO(),
      });
    return { ok: true, execucaoId: execucaoId, status: "CONCLUIDA" };
  } finally {
    lock.releaseLock();
  }
}

// --- Painel, relatorio e CRUD (admin) --------------------------------------

/** Grade do dia: quem devia fazer o que, e em que pe esta. */
function rotaChkPainel(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const negado = exigirAdminChk(ss, payload.usuario);
  if (negado) return negado;

  const data = dataISO(payload.data) || dataISO(new Date());
  const templates = lerAba(ss, ABA_CHK_TEMPLATES).filter(function (t) {
    return templateDevidoNaData(t, data);
  });
  const execucoes = lerAba(ss, ABA_CHK_EXECUCOES).filter(function (e) { return dataISO(e.data) === data; });
  const itens = lerAba(ss, ABA_CHK_ITENS).filter(function (i) { return ehVerdadeiro(i.ativo); });
  const respostas = lerAba(ss, ABA_CHK_RESPOSTAS);

  const celulas = templates.map(function (template) {
    const execucao = execucoes.filter(function (e) {
      return textoDe(e.template_id) === textoDe(template.template_id);
    })[0];
    const doTemplate = itens.filter(function (i) { return textoDe(i.template_id) === textoDe(template.template_id); });
    const respondidos = execucao
      ? respostas.filter(function (r) { return textoDe(r.execucao_id) === textoDe(execucao.execucao_id); }).length
      : 0;
    return {
      templateId: textoDe(template.template_id),
      nome: textoDe(template.nome),
      local: textoDe(template.local),
      momento: textoDe(template.momento),
      responsavel: textoDe(template.responsavel),
      status: execucao ? textoDe(execucao.status) : "NAO_INICIADA",
      respondidos: respondidos,
      totalItens: doTemplate.length,
      concluidoEm: execucao ? textoDe(execucao.concluido_em) : "",
    };
  });

  const pendencias = celulas.filter(function (c) { return c.status !== "CONCLUIDA"; });
  return { ok: true, data: data, celulas: celulas, pendencias: pendencias };
}

/**
 * Metricas por pessoa no periodo. Sem grafico: tabela resolve.
 *
 * "Devidas" conta os dias em que o template valia, nao as execucoes abertas —
 * senao quem nunca abre o checklist teria 100% de conclusao.
 */
function rotaChkRelatorio(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const negado = exigirAdminChk(ss, payload.usuario);
  if (negado) return negado;

  const inicio = dataISO(payload.data_inicio);
  const fim = dataISO(payload.data_fim);
  if (!inicio || !fim) return { ok: false, error: "Informe data_inicio e data_fim." };
  const filtroUsuario = textoDe(payload.usuario_alvo).toLowerCase();

  const templates = lerAba(ss, ABA_CHK_TEMPLATES);
  const itens = lerAba(ss, ABA_CHK_ITENS).filter(function (i) { return ehVerdadeiro(i.ativo); });
  const execucoes = lerAba(ss, ABA_CHK_EXECUCOES).filter(function (e) {
    const d = dataISO(e.data);
    return d >= inicio && d <= fim;
  });
  const respostas = lerAba(ss, ABA_CHK_RESPOSTAS);
  const respostasPorExecucao = {};
  respostas.forEach(function (r) {
    const id = textoDe(r.execucao_id);
    if (!respostasPorExecucao[id]) respostasPorExecucao[id] = {};
    respostasPorExecucao[id][textoDe(r.item_id)] = true;
  });

  // Quantos dias cada template era devido no periodo.
  const devidasPorTemplate = {};
  const dias = [];
  for (let d = new Date(inicio + "T12:00:00"); dataISO(d) <= fim; d.setDate(d.getDate() + 1)) {
    dias.push(dataISO(d));
  }
  templates.forEach(function (t) {
    devidasPorTemplate[textoDe(t.template_id)] = dias.filter(function (dia) {
      return templateDevidoNaData(t, dia);
    }).length;
  });

  const porUsuario = {};
  function balde(login) {
    if (!porUsuario[login]) {
      porUsuario[login] = { usuario: login, devidas: 0, concluidas: 0, expiradas: 0, abertas: 0, minutos: [], horas: [] };
    }
    return porUsuario[login];
  }

  templates.forEach(function (t) {
    const login = textoDe(t.responsavel).toLowerCase();
    if (filtroUsuario && login !== filtroUsuario) return;
    balde(login).devidas += devidasPorTemplate[textoDe(t.template_id)] || 0;
  });

  execucoes.forEach(function (e) {
    const login = textoDe(e.usuario).toLowerCase();
    if (filtroUsuario && login !== filtroUsuario) return;
    const b = balde(login);
    const status = textoDe(e.status);
    if (status === "CONCLUIDA") {
      b.concluidas += 1;
      const ini = new Date(textoDe(e.iniciado_em));
      const fimEx = new Date(textoDe(e.concluido_em));
      if (!isNaN(ini) && !isNaN(fimEx)) {
        b.minutos.push((fimEx - ini) / 60000);
        b.horas.push(fimEx.getHours() + fimEx.getMinutes() / 60);
      }
    } else if (status === "EXPIRADA") {
      b.expiradas += 1;
    } else {
      b.abertas += 1;
    }
  });

  const media = function (lista) {
    if (!lista.length) return null;
    return lista.reduce(function (s, v) { return s + v; }, 0) / lista.length;
  };

  const pessoas = Object.keys(porUsuario).map(function (login) {
    const b = porUsuario[login];
    const minutosMedios = media(b.minutos);
    const horaMedia = media(b.horas);
    return {
      usuario: login,
      devidas: b.devidas,
      concluidas: b.concluidas,
      expiradas: b.expiradas,
      abertas: b.abertas,
      taxaConclusao: b.devidas ? Math.round((b.concluidas / b.devidas) * 100) : null,
      minutosMedios: minutosMedios === null ? null : Math.round(minutosMedios),
      horarioMedio: horaMedia === null ? null :
        ("0" + Math.floor(horaMedia)).slice(-2) + ":" + ("0" + Math.round((horaMedia % 1) * 60)).slice(-2),
    };
  }).sort(function (a, b) { return a.usuario.localeCompare(b.usuario); });

  // Itens que mais ficam sem resposta, para saber o que ninguem consegue fazer.
  const faltas = {};
  execucoes.forEach(function (e) {
    const respondidos = respostasPorExecucao[textoDe(e.execucao_id)] || {};
    itens.filter(function (i) { return textoDe(i.template_id) === textoDe(e.template_id); })
      .forEach(function (i) {
        const id = textoDe(i.item_id);
        if (!faltas[id]) faltas[id] = { itemId: id, descricao: textoDe(i.descricao), vezes: 0, faltou: 0 };
        faltas[id].vezes += 1;
        if (!respondidos[id]) faltas[id].faltou += 1;
      });
  });
  const itensProblema = Object.keys(faltas).map(function (id) { return faltas[id]; })
    .filter(function (f) { return f.faltou > 0; })
    .sort(function (a, b) { return (b.faltou / b.vezes) - (a.faltou / a.vezes); })
    .slice(0, 15)
    .map(function (f) {
      f.percentualFalta = Math.round((f.faltou / f.vezes) * 100);
      return f;
    });

  return { ok: true, inicio: inicio, fim: fim, pessoas: pessoas, itensProblema: itensProblema };
}

/** CRUD de template e de item. Uma acao por chamada, sempre upsert. */
function rotaChkCrudTemplate(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const negado = exigirAdminChk(ss, payload.usuario);
  if (negado) return negado;

  const operacao = textoDe(payload.operacao);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (operacao === "listar") {
      return {
        ok: true,
        templates: lerAba(ss, ABA_CHK_TEMPLATES).map(function (t) {
          return {
            templateId: textoDe(t.template_id), nome: textoDe(t.nome), local: textoDe(t.local),
            responsavel: textoDe(t.responsavel), momento: textoDe(t.momento),
            diasSemana: textoDe(t.dias_semana), ativo: ehVerdadeiro(t.ativo),
          };
        }),
        itens: lerAba(ss, ABA_CHK_ITENS).map(function (i) {
          return {
            itemId: textoDe(i.item_id), templateId: textoDe(i.template_id), ordem: Number(i.ordem) || 0,
            descricao: textoDe(i.descricao), tipoEvidencia: textoDe(i.tipo_evidencia),
            referencia: textoDe(i.referencia), obrigatorio: ehVerdadeiro(i.obrigatorio), ativo: ehVerdadeiro(i.ativo),
          };
        }).sort(function (a, b) { return a.ordem - b.ordem; }),
      };
    }

    if (operacao === "salvarTemplate") {
      const t = payload.template || {};
      const momento = textoDe(t.momento).toUpperCase();
      if (MOMENTOS_CHK.indexOf(momento) < 0) return { ok: false, error: "Momento invalido: " + momento };
      if (!textoDe(t.nome)) return { ok: false, error: "Informe o nome do checklist." };
      const id = textoDe(t.templateId) || novoId("tpl");
      const existente = lerAba(ss, ABA_CHK_TEMPLATES).filter(function (x) { return textoDe(x.template_id) === id; })[0];
      upsertLinha(ss, ABA_CHK_TEMPLATES,
        function (x) { return textoDe(x.template_id) === id; },
        {
          template_id: id,
          nome: textoDe(t.nome),
          local: textoDe(t.local).toUpperCase(),
          responsavel: textoDe(t.responsavel).toLowerCase(),
          momento: momento,
          dias_semana: textoDe(t.diasSemana),
          ativo: t.ativo === false ? false : true,
          criado_em: existente ? textoDe(existente.criado_em) : agoraISO(),
        });
      return { ok: true, templateId: id };
    }

    if (operacao === "salvarItem") {
      const i = payload.item || {};
      const tipo = textoDe(i.tipoEvidencia).toUpperCase();
      if (TIPOS_EVIDENCIA.indexOf(tipo) < 0) return { ok: false, error: "Tipo de evidencia invalido: " + tipo };
      if (!textoDe(i.descricao)) return { ok: false, error: "Descreva o item." };
      if (tipo === "CONTAGEM" && !textoDe(i.referencia)) {
        return { ok: false, error: "Item de CONTAGEM precisa do produto de referencia." };
      }
      const id = textoDe(i.itemId) || novoId("cki");
      upsertLinha(ss, ABA_CHK_ITENS,
        function (x) { return textoDe(x.item_id) === id; },
        {
          item_id: id,
          template_id: textoDe(i.templateId),
          ordem: Number(i.ordem) || 0,
          descricao: textoDe(i.descricao),
          tipo_evidencia: tipo,
          referencia: textoDe(i.referencia),
          obrigatorio: i.obrigatorio === false ? false : true,
          ativo: i.ativo === false ? false : true,
        });
      return { ok: true, itemId: id };
    }

    return { ok: false, error: "Operacao desconhecida: " + operacao };
  } finally {
    lock.releaseLock();
  }
}

// --- Expiracao -------------------------------------------------------------

/**
 * Execucao ABERTA com mais de 24h da data operacional vira EXPIRADA.
 * Nao apaga nada: expirada e read-only e continua contando como nao concluida
 * no relatorio, que e o ponto.
 *
 * Ligue como gatilho diario no editor do Apps Script:
 *   Acionadores > Adicionar acionador > chkExpirarAbertas > Baseado em tempo >
 *   Contador de dias > entre 4h e 5h.
 */
function chkExpirarAbertas() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = garantirAba(ss, ABA_CHK_EXECUCOES);
  const colStatus = CABECALHOS.CHK_EXECUCOES.indexOf("status") + 1;
  const limite = Date.now() - HORAS_ATE_EXPIRAR * 3600000;
  let expiradas = 0;

  lerAbaComLinha(ss, ABA_CHK_EXECUCOES).forEach(function (e) {
    if (textoDe(e.status) !== "ABERTA") return;
    const data = dataISO(e.data);
    if (!data) return;
    // Meia-noite da data operacional + 24h.
    if (new Date(data + "T00:00:00-03:00").getTime() >= limite) return;
    sheet.getRange(e._row, colStatus).setValue("EXPIRADA");
    expiradas += 1;
  });

  Logger.log("Execucoes expiradas: " + expiradas);
  return expiradas;
}

/**
 * Acrescenta as colunas novas no cabecalho de uma aba que ja tem dados.
 *
 * garantirAba so escreve cabecalho em aba vazia, entao aba com historico
 * nunca ganharia coluna nova sozinha. As colunas novas sempre entram a
 * DIREITA das antigas, e por isso reescrever a linha 1 inteira nao desloca
 * nenhuma celula ja gravada.
 */
function migrarCabecalho(ss, nome) {
  const sheet = garantirAba(ss, nome);
  const esperado = CABECALHOS[nome];
  const largura = Math.max(sheet.getLastColumn(), esperado.length);
  const atual = sheet.getRange(1, 1, 1, largura).getValues()[0]
    .map(function (c) { return String(c || "").trim(); });

  let faltando = 0;
  esperado.forEach(function (coluna, i) { if (atual[i] !== coluna) faltando += 1; });
  if (!faltando) return 0;

  sheet.getRange(1, 1, 1, esperado.length).setValues([esperado]);
  sheet.getRange(1, 1, 1, esperado.length).setFontWeight("bold");
  return faltando;
}

/**
 * Rode UMA VEZ no editor depois de colar o codigo novo.
 *
 * Acrescenta as colunas de papel em USUARIOS e as de autoria em REQUISICOES,
 * cria a aba NOTIFICACOES, e define os papeis do time.
 *
 * Usuario que ainda nao existe em USUARIOS e criado com a senha abaixo, que e
 * o PIN que a pessoa ja usa no acesso de reserva do aparelho — assim o login
 * dela nao muda. Usuario que ja existe mantem a senha; so os papeis mudam.
 *
 * Rodar de novo nao duplica ninguem.
 */
function migrarUsuariosEPapeis() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const colunasUsuarios = migrarCabecalho(ss, ABA_USUARIOS);
  const colunasRequisicoes = migrarCabecalho(ss, ABA_REQUISICOES);
  garantirAba(ss, ABA_NOTIFICACOES);

  // papel decide permissao; papel_operacional decide quem recebe qual aviso.
  // Nenhum dos dois esta amarrado a nome de pessoa no codigo.
  const time = [
    { nome: "Carlos Franco", login: "franco", senha: "0278", perfil: "admin", papel: "ADMIN", atribui: true, operacional: "" },
    { nome: "Jon", login: "jon", senha: "4060", perfil: "lider_turno, requisitante, separador", papel: "OPERADOR", atribui: false, operacional: "SEPARADOR" },
    { nome: "Sarah", login: "sarah", senha: "1020", perfil: "lider_turno, requisitante", papel: "OPERADOR", atribui: false, operacional: "" },
    { nome: "Daniel", login: "daniel", senha: "2030", perfil: "lider_turno, requisitante", papel: "OPERADOR", atribui: false, operacional: "" },
    { nome: "Yvison", login: "yvison", senha: "3040", perfil: "lider_turno, requisitante, separador", papel: "OPERADOR", atribui: true, operacional: "" },
  ];

  const sheet = garantirAba(ss, ABA_USUARIOS);
  const existentes = lerAbaComLinha(ss, ABA_USUARIOS);
  let criados = 0;
  let atualizados = 0;

  time.forEach(function (pessoa) {
    const atual = existentes.filter(function (u) { return normalizeLogin(u.login) === pessoa.login; })[0];
    if (atual) {
      // Senha e nome ficam como estao; so os papeis sao definidos.
      const linha = CABECALHOS.USUARIOS.map(function (coluna) { return atual[coluna]; });
      linha[CABECALHOS.USUARIOS.indexOf("papel")] = pessoa.papel;
      linha[CABECALHOS.USUARIOS.indexOf("pode_atribuir_tarefa")] = pessoa.atribui;
      linha[CABECALHOS.USUARIOS.indexOf("papel_operacional")] = pessoa.operacional;
      sheet.getRange(atual._row, 1, 1, CABECALHOS.USUARIOS.length).setValues([linha]);
      atualizados += 1;
      return;
    }
    sheet.appendRow(linhaUsuarioNova({
      nome: pessoa.nome, login: pessoa.login, senha: pessoa.senha, perfil: pessoa.perfil,
      papel: pessoa.papel, podeAtribuirTarefa: pessoa.atribui, papelOperacional: pessoa.operacional,
    }));
    criados += 1;
  });

  Logger.log(
    "USUARIOS: " + colunasUsuarios + " coluna(s) acrescentada(s), " + criados + " usuario(s) criado(s), " +
    atualizados + " atualizado(s). REQUISICOES: " + colunasRequisicoes + " coluna(s). Aba NOTIFICACOES pronta."
  );
  return { criados: criados, atualizados: atualizados };
}

/**
 * Rode UMA VEZ no editor do Apps Script, depois de colar o codigo novo.
 *
 * Cria as cinco abas da Fase 5 e semeia os seis checklists do escopo, sem
 * itens — os itens sao cadastrados pela tela de admin do app.
 *
 * Existe separada da rota chk_bootstrap porque a rota exige admin autenticado
 * pela aba USUARIOS, e quem abre o editor do script ja e o dono da planilha.
 * Rodar de novo nao duplica nada.
 */
function criarAbasChecklists() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  [ABA_CHK_TEMPLATES, ABA_CHK_ITENS, ABA_CHK_EXECUCOES, ABA_CHK_RESPOSTAS, ABA_RECADOS].forEach(function (aba) {
    garantirAba(ss, aba);
  });

  const semente = [
    ["Pre-operacao Bar 22", "BAR22", "yvison", "PRE_OPERACAO"],
    ["Pre-operacao Bar 23", "BAR23", "yvison", "PRE_OPERACAO"],
    ["Contagem Estoque Central", "GERAL", "jon", "FECHAMENTO"],
    ["Producao e pre-batch", "PRODUCAO", "sarah", "ABERTURA"],
    ["Reposicao e vidraria", "BAR22", "daniel", "ABERTURA"],
    ["Double-check geral", "GERAL", "yvison", "FECHAMENTO"],
  ];
  const existentes = lerAba(ss, ABA_CHK_TEMPLATES);
  let criados = 0;
  semente.forEach(function (linha) {
    if (existentes.some(function (t) { return normalizeName(t.nome) === normalizeName(linha[0]); })) return;
    upsertLinha(ss, ABA_CHK_TEMPLATES, function () { return false; }, {
      template_id: novoId("tpl"), nome: linha[0], local: linha[1], responsavel: linha[2],
      momento: linha[3], dias_semana: "", ativo: true, criado_em: agoraISO(),
    });
    criados += 1;
  });

  Logger.log("Abas da Fase 5 prontas. Checklists criados agora: " + criados +
    ". Ja existiam: " + existentes.length + ".");
  return criados;
}

/**
 * Rode UMA VEZ no editor para ligar a expiracao diaria das execucoes.
 *
 * Apaga o gatilho anterior da mesma funcao antes de criar, entao rodar de
 * novo nao acumula gatilhos duplicados disparando varias vezes por dia.
 */
function criarGatilhoDeExpiracao() {
  ScriptApp.getProjectTriggers().forEach(function (gatilho) {
    if (gatilho.getHandlerFunction() === "chkExpirarAbertas") ScriptApp.deleteTrigger(gatilho);
  });
  ScriptApp.newTrigger("chkExpirarAbertas").timeBased().atHour(4).everyDays(1).create();
  Logger.log("Gatilho diario de expiracao criado para rodar entre 4h e 5h.");
}

/**
 * Cria as abas do modulo e semeia os seis checklists do escopo, sem itens —
 * os itens sao cadastrados pela tela de admin. Rodar de novo nao duplica.
 */
function rotaChkBootstrap(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const negado = exigirAdminChk(ss, payload.usuario);
  if (negado) return negado;

  [ABA_CHK_TEMPLATES, ABA_CHK_ITENS, ABA_CHK_EXECUCOES, ABA_CHK_RESPOSTAS, ABA_RECADOS].forEach(function (aba) {
    garantirAba(ss, aba);
  });

  const semente = [
    ["Pre-operacao Bar 22", "BAR22", "yvison", "PRE_OPERACAO"],
    ["Pre-operacao Bar 23", "BAR23", "yvison", "PRE_OPERACAO"],
    ["Contagem Estoque Central", "GERAL", "jon", "FECHAMENTO"],
    ["Producao e pre-batch", "PRODUCAO", "sarah", "ABERTURA"],
    ["Reposicao e vidraria", "BAR22", "daniel", "ABERTURA"],
    ["Double-check geral", "GERAL", "yvison", "FECHAMENTO"],
  ];

  const existentes = lerAba(ss, ABA_CHK_TEMPLATES);
  let criados = 0;
  semente.forEach(function (linha) {
    const jaTem = existentes.some(function (t) { return normalizeName(t.nome) === normalizeName(linha[0]); });
    if (jaTem) return;
    upsertLinha(ss, ABA_CHK_TEMPLATES,
      function () { return false; },
      {
        template_id: novoId("tpl"), nome: linha[0], local: linha[1], responsavel: linha[2],
        momento: linha[3], dias_semana: "", ativo: true, criado_em: agoraISO(),
      });
    criados += 1;
  });

  return { ok: true, criados: criados, existentes: existentes.length };
}

// ===========================================================================
// BLOCO E — CORRECOES NA REQUISICAO
// ===========================================================================

/**
 * E1 — quantidade de requisicao e inteiro positivo.
 *
 * Nao existe requisitar meia garrafa: requisicao move unidade fechada do
 * estoque para o bar. Contagem e outra coisa e continua aceitando decimal —
 * garrafa aberta pela metade e 0,5 e isso esta certo. Esta funcao NAO e usada
 * no fluxo de contagem.
 *
 * Devolve null para invalido. Nunca arredonda: arredondar esconde erro de
 * digitacao, e a producao ja tem uma requisicao com 12,4 / 12,3 / 12,2 que
 * so pode ter vindo de dedo escorregando no teclado.
 */
function validarInteiro(valor) {
  var s = String(valor === undefined || valor === null ? "" : valor).trim();
  if (!/^\d+$/.test(s)) return null;   // rejeita vazio, sinal, ponto, virgula, notacao cientifica
  var n = parseInt(s, 10);
  if (n <= 0) return null;
  return n;
}

/**
 * E4 — data operacional.
 *
 * A casa opera depois da meia-noite: o historico tem lancamento as 01:25,
 * 02:06 e 02:35. Requisicao feita as 02:30 de sabado pertence a operacao de
 * sexta. Antes do corte, o movimento e do dia anterior.
 *
 * criado_em guarda o instante real; data_operacional guarda o dia de
 * operacao. Os dois coexistem — um nao substitui o outro.
 */
function dataOperacional(instante) {
  const data = instante ? new Date(instante) : new Date();
  // A hora sai formatada no fuso da casa; o dia anterior sai recuando 24h no
  // instante e formatando de novo. Sem ida-e-volta por string de data: o
  // parser de Date depende de formato e de fuso do runtime, e aqui os dois
  // precisam ser os da casa, nao os do servidor.
  const hora = Number(Utilities.formatDate(data, TIMEZONE_CASA, "H"));
  const ajustada = hora < HORA_CORTE_OPERACIONAL ? new Date(data.getTime() - 86400000) : data;
  return Utilities.formatDate(ajustada, TIMEZONE_CASA, "yyyy-MM-dd");
}

/** Nome de exibicao de um login, para o corpo do aviso. */
function nomeDoUsuario(ss, login) {
  const alvo = normalizeLogin(login);
  const achado = lerAba(ss, ABA_USUARIOS).filter(function (u) { return normalizeLogin(u.login) === alvo; })[0];
  return achado ? textoDe(achado.nome) || alvo : alvo;
}

// ===========================================================================
// BLOCO D — CAMADA DE AVISOS (IN-APP)
//
// Canal unico: INAPP. Nao existe push, e-mail nem WhatsApp aqui, e isso e
// deliberado — o ping de urgencia continua sendo pessoa mandando mensagem.
// Este modulo e o registro dentro do app.
//
// Como nao ha push, o aviso precisa ser dificil de perder DENTRO do app: alem
// do sino, cada aviso alimenta um badge no menu correspondente. Aviso que vive
// so no sino ninguem ve.
// ===========================================================================

const ABA_NOTIFICACOES = "NOTIFICACOES";

const TIPOS_NOTIFICACAO = [
  "TAREFA_ATRIBUIDA", "TAREFA_VENCENDO", "RECADO_NOVO", "REQUISICAO_CRIADA", "CHECKLIST_PENDENTE",
];

// Aviso mais velho que isto some da lista. A linha fica na planilha.
const DIAS_DE_AVISO = 30;

// Janela da deduplicacao, para quem pedir por chave. Salvar a requisicao duas
// vezes seguidas nao pode tocar o sino do Jon duas vezes.
const MINUTOS_DEDUPLICACAO = 5;

/**
 * A unica porta de saida de aviso do app. Todo modulo chama esta funcao e
 * nenhuma escreve na aba direto.
 *
 * NUNCA lanca. Se a gravacao do aviso falhar, a operacao que a chamou tem que
 * seguir: requisicao gravada sem aviso e um problema pequeno, requisicao
 * perdida por causa do aviso e um problema grande.
 *
 * `chaveDedup` e opcional e so quem pede e deduplicado. Antes a deduplicacao
 * era automatica por (usuario, tipo, link) e isso engolia recado: todo recado
 * aponta para /mural, entao o segundo em cinco minutos nao avisava ninguem.
 * Requisicao passa o req_id; recado nao passa nada e todo recado avisa.
 */
function notificar(opcoes) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const destinatarios = (opcoes.destinatarios || [])
      .map(function (d) { return textoDe(d).toLowerCase(); })
      .filter(Boolean);
    if (!destinatarios.length) return { ok: true, gravados: 0, motivo: "sem destinatarios" };

    const tipo = textoDe(opcoes.tipo).toUpperCase();
    const link = textoDe(opcoes.link);
    const chaveDedup = textoDe(opcoes.chaveDedup);
    const agora = agoraISO();
    const limiteDedup = Date.now() - MINUTOS_DEDUPLICACAO * 60000;

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const existentes = lerAba(ss, ABA_NOTIFICACOES);
      const sheet = garantirAba(ss, ABA_NOTIFICACOES);
      const novas = [];

      destinatarios.forEach(function (usuario) {
        // So deduplica quem pediu, por (usuario, tipo, chave) na janela.
        const recente = chaveDedup && existentes.some(function (n) {
          if (textoDe(n.usuario).toLowerCase() !== usuario) return false;
          if (textoDe(n.tipo).toUpperCase() !== tipo) return false;
          if (textoDe(n.link) !== chaveDedup) return false;
          const quando = new Date(textoDe(n.criada_em)).getTime();
          return quando && quando >= limiteDedup;
        });
        if (recente) return;
        novas.push([
          novoId("ntf"), usuario, tipo, textoDe(opcoes.titulo), textoDe(opcoes.corpo),
          link, false, agora,
        ]);
      });

      if (novas.length) {
        sheet.getRange(sheet.getLastRow() + 1, 1, novas.length, CABECALHOS.NOTIFICACOES.length).setValues(novas);
      }
      return { ok: true, gravados: novas.length, ignorados: destinatarios.length - novas.length };
    } finally {
      lock.releaseLock();
    }
  } catch (erro) {
    // Log e segue. O chamador nunca sabe que falhou.
    try { Logger.log("Falha ao notificar: " + erro.message); } catch (e) {}
    return { ok: false, error: String(erro && erro.message) };
  }
}

/** Logins ativos com aquele papel operacional. Resolvido por papel, nunca por nome. */
function usuariosComPapelOperacional(papel) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const alvo = textoDe(papel).toUpperCase();
  return lerAba(ss, ABA_USUARIOS)
    .filter(function (u) { return ehVerdadeiro(u.ativo) && textoDe(u.papel_operacional).toUpperCase() === alvo; })
    .map(function (u) { return normalizeLogin(u.login); });
}

/** Todos os logins ativos, menos os excluidos. Usado pelo mural. */
function usuariosAtivos(exceto) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const fora = (exceto || []).map(function (e) { return textoDe(e).toLowerCase(); });
  return lerAba(ss, ABA_USUARIOS)
    .filter(function (u) { return ehVerdadeiro(u.ativo); })
    .map(function (u) { return normalizeLogin(u.login); })
    .filter(function (login) { return login && fora.indexOf(login) < 0; });
}

/**
 * Avisos da pessoa: os 30 ultimos dias, mais recentes primeiro, com os
 * contadores que alimentam o sino e os badges de menu.
 *
 * Os badges saem daqui prontos, por tipo — a tela nao precisa saber que
 * REQUISICAO_CRIADA vira badge no menu de requisicoes.
 */
function rotaNotifListar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usuario = normalizeLogin(payload.usuario);
  if (!usuario) return { ok: false, error: "Informe o usuario." };

  const corte = Date.now() - DIAS_DE_AVISO * 86400000;
  const minhas = lerAba(ss, ABA_NOTIFICACOES)
    .filter(function (n) {
      if (normalizeLogin(n.usuario) !== usuario) return false;
      const quando = new Date(textoDe(n.criada_em)).getTime();
      return !quando || quando >= corte;
    })
    .map(function (n) {
      return {
        notifId: textoDe(n.notif_id), tipo: textoDe(n.tipo), titulo: textoDe(n.titulo),
        corpo: textoDe(n.corpo), link: textoDe(n.link), lida: ehVerdadeiro(n.lida),
        criadaEm: textoDe(n.criada_em),
      };
    })
    .sort(function (a, b) { return String(b.criadaEm).localeCompare(String(a.criadaEm)); });

  const naoLidas = minhas.filter(function (n) { return !n.lida; });
  const porTipo = {};
  naoLidas.forEach(function (n) { porTipo[n.tipo] = (porTipo[n.tipo] || 0) + 1; });

  return { ok: true, avisos: minhas, naoLidas: naoLidas.length, badges: porTipo };
}

function rotaNotifMarcarLida(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usuario = normalizeLogin(payload.usuario);
  const notifId = textoDe(payload.notif_id);
  if (!usuario || !notifId) return { ok: false, error: "Informe o aviso e o usuario." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = garantirAba(ss, ABA_NOTIFICACOES);
    const colLida = CABECALHOS.NOTIFICACOES.indexOf("lida") + 1;
    const alvo = lerAbaComLinha(ss, ABA_NOTIFICACOES).filter(function (n) {
      return textoDe(n.notif_id) === notifId && normalizeLogin(n.usuario) === usuario;
    })[0];
    // Aviso de outra pessoa nao e "nao encontrado" por acaso: ninguem marca
    // como lido o que nao e seu.
    if (!alvo) return { ok: false, error: "Aviso nao encontrado." };
    sheet.getRange(alvo._row, colLida).setValue(true);
    return { ok: true, notifId: notifId };
  } finally {
    lock.releaseLock();
  }
}

function rotaNotifMarcarTodasLidas(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usuario = normalizeLogin(payload.usuario);
  if (!usuario) return { ok: false, error: "Informe o usuario." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = garantirAba(ss, ABA_NOTIFICACOES);
    const colLida = CABECALHOS.NOTIFICACOES.indexOf("lida") + 1;
    let marcadas = 0;
    lerAbaComLinha(ss, ABA_NOTIFICACOES).forEach(function (n) {
      if (normalizeLogin(n.usuario) !== usuario || ehVerdadeiro(n.lida)) return;
      sheet.getRange(n._row, colLida).setValue(true);
      marcadas += 1;
    });
    return { ok: true, marcadas: marcadas };
  } finally {
    lock.releaseLock();
  }
}

// ===========================================================================
// BLOCO C — MURAL DE RECADOS
//
// Qualquer um posta, todos são avisados. Sem thread, sem reação, sem resposta
// e sem destinatário: recado é recado.
//
// Substituiu a aba MURAL da entrega anterior, que tinha status de resolvido e
// nenhuma linha gravada. Duas tabelas para a mesma ideia seria pior.
// ===========================================================================

const ABA_RECADOS = "RECADOS";

const TAMANHO_MIN_RECADO = 3;
const TAMANHO_MAX_RECADO = 500;

// Sem limite, um dia ruim vira 40 notificacoes para 5 pessoas.
const RECADOS_POR_DIA = 10;

// Mural com tudo fixado nao tem topo. Tres e o teto.
const MAX_FIXADOS = 3;

// Quanto o mural mostra sem pedir mais.
const DIAS_DE_MURAL = 30;

function recadoPublico(linha) {
  return {
    recadoId: textoDe(linha.recado_id),
    autor: textoDe(linha.autor),
    texto: textoDe(linha.texto),
    fixado: ehVerdadeiro(linha.fixado),
    ativo: ehVerdadeiro(linha.ativo),
    criadoEm: textoDe(linha.criado_em),
  };
}

/**
 * Feed do mural: fixados no topo, o resto do mais novo para o mais velho.
 *
 * Mostra os ultimos 30 dias por padrao. `desde` (YYYY-MM-DD) puxa mais para
 * tras — e o "carregar mais" da tela.
 */
function rotaRecadoListar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  garantirAba(ss, ABA_RECADOS);
  const desde = textoDe(payload.desde) ||
    new Date(Date.now() - DIAS_DE_MURAL * 86400000).toISOString().slice(0, 10);

  const recados = lerAba(ss, ABA_RECADOS)
    .map(recadoPublico)
    .filter(function (r) { return r.ativo && String(r.criadoEm).slice(0, 10) >= desde; })
    .sort(function (a, b) {
      // Fixado ganha do recente. Entre iguais, o mais novo primeiro.
      if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
      return String(b.criadoEm).localeCompare(String(a.criadoEm));
    });

  return { ok: true, desde: desde, recados: recados, fixados: recados.filter(function (r) { return r.fixado; }).length };
}

/**
 * Publica um recado e avisa todo mundo, menos quem escreveu.
 *
 * Recado nao e editavel depois de publicado — correcao e recado novo. Mural
 * editavel nao serve como registro: quem leu ontem nao leu o que esta escrito
 * hoje.
 */
function rotaRecadoPublicar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const autor = normalizeLogin(payload.usuario);
  const texto = textoDe(payload.texto);
  if (!autor) return { ok: false, error: "Informe o usuario." };
  if (texto.length < TAMANHO_MIN_RECADO) return { ok: false, error: "Escreva pelo menos " + TAMANHO_MIN_RECADO + " caracteres." };
  if (texto.length > TAMANHO_MAX_RECADO) {
    return { ok: false, error: "Recado passou de " + TAMANHO_MAX_RECADO + " caracteres (tem " + texto.length + ")." };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const hoje = dataOperacional();
    const doDia = lerAba(ss, ABA_RECADOS).filter(function (r) {
      return normalizeLogin(r.autor) === autor && dataOperacional(textoDe(r.criado_em)) === hoje;
    }).length;
    if (doDia >= RECADOS_POR_DIA) {
      return { ok: false, error: "Limite de " + RECADOS_POR_DIA + " recados por dia. Junte o que falta num recado so." };
    }

    const id = novoId("rec");
    upsertLinha(ss, ABA_RECADOS,
      function (r) { return textoDe(r.recado_id) === id; },
      { recado_id: id, autor: autor, texto: texto, fixado: false, ativo: true, criado_em: agoraISO() });

    // Todo mundo menos quem escreveu. notificar() nunca lanca.
    notificar({
      destinatarios: usuariosAtivos([autor]),
      tipo: "RECADO_NOVO",
      titulo: "Recado de " + nomeDoUsuario(ss, autor),
      corpo: texto.length > 90 ? texto.slice(0, 90) + "..." : texto,
      link: "/mural",
    });

    return { ok: true, recadoId: id, restantesHoje: RECADOS_POR_DIA - doDia - 1 };
  } finally {
    lock.releaseLock();
  }
}

/** Soft delete. Autor tira o proprio; admin tira qualquer um. Linha fica. */
function rotaRecadoDesativar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usuario = normalizeLogin(payload.usuario);
  const recadoId = textoDe(payload.recado_id);
  if (!usuario || !recadoId) return { ok: false, error: "Informe o recado e o usuario." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const recado = lerAba(ss, ABA_RECADOS).filter(function (r) { return textoDe(r.recado_id) === recadoId; })[0];
    if (!recado) return { ok: false, error: "Recado nao encontrado." };
    if (normalizeLogin(recado.autor) !== usuario && !ehAdminChk(ss, usuario)) {
      return { ok: false, error: "So o autor ou o administrador tira um recado do mural.", codigo: 403 };
    }
    upsertLinha(ss, ABA_RECADOS,
      function (r) { return textoDe(r.recado_id) === recadoId; },
      {
        recado_id: recadoId, autor: textoDe(recado.autor), texto: textoDe(recado.texto),
        fixado: false, ativo: false, criado_em: textoDe(recado.criado_em),
      });
    return { ok: true, recadoId: recadoId };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Fixa ou desafixa. So admin.
 *
 * Teto de tres: ao tentar o quarto, recusa pedindo para desafixar outro em
 * vez de empurrar o mais antigo sozinho — quem fixou tem que decidir qual sai.
 */
function rotaRecadoFixar(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const negado = exigirAdminChk(ss, payload.usuario);
  if (negado) return negado;
  const recadoId = textoDe(payload.recado_id);
  if (!recadoId) return { ok: false, error: "Informe o recado." };
  const fixar = payload.fixar === undefined ? true : ehVerdadeiro(payload.fixar);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const todos = lerAba(ss, ABA_RECADOS);
    const recado = todos.filter(function (r) { return textoDe(r.recado_id) === recadoId; })[0];
    if (!recado) return { ok: false, error: "Recado nao encontrado." };
    if (!ehVerdadeiro(recado.ativo)) return { ok: false, error: "Recado desativado nao vai para o topo." };

    const fixadosAgora = todos.filter(function (r) {
      return ehVerdadeiro(r.fixado) && ehVerdadeiro(r.ativo) && textoDe(r.recado_id) !== recadoId;
    });
    if (fixar && fixadosAgora.length >= MAX_FIXADOS) {
      return {
        ok: false,
        error: "Ja existem " + MAX_FIXADOS + " recados fixados. Desafixe um antes de fixar outro.",
        fixados: fixadosAgora.map(function (r) { return { recadoId: textoDe(r.recado_id), texto: textoDe(r.texto) }; }),
      };
    }

    upsertLinha(ss, ABA_RECADOS,
      function (r) { return textoDe(r.recado_id) === recadoId; },
      {
        recado_id: recadoId, autor: textoDe(recado.autor), texto: textoDe(recado.texto),
        fixado: fixar, ativo: true, criado_em: textoDe(recado.criado_em),
      });
    return { ok: true, recadoId: recadoId, fixado: fixar };
  } finally {
    lock.releaseLock();
  }
}
