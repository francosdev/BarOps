import { COQUETEIS, GALAO_ML, GIN_PADRAO, PLANILHA_DESATUALIZADA, PROIBIDOS_EM_PRE_BATCH, VALIDADE_PRE_BATCH_DIAS } from "./coqueteis.js";
import { INSUMOS, embalagemDe, insumoPorChave, paraUnidadesDeEstoque } from "./insumos.js";
import { EM_ABERTO, ROTULOS_COQUETEL, ROTULOS_PRODUCAO, estaEmAberto, pendenciasDe } from "./pendencias.js";
import { PAR_SERVICO, PRODUCOES } from "./producoes.js";

export { COQUETEIS, PRODUCOES, INSUMOS, PAR_SERVICO, EM_ABERTO, GALAO_ML, GIN_PADRAO, PLANILHA_DESATUALIZADA, VALIDADE_PRE_BATCH_DIAS };
export { estaEmAberto, embalagemDe, insumoPorChave, paraUnidadesDeEstoque };

const PRODUCAO_POR_ID = new Map(PRODUCOES.map((producao) => [producao.id, producao]));
const COQUETEL_POR_ID = new Map(COQUETEIS.map((coquetel) => [coquetel.id, coquetel]));

export function producaoPorId(id) {
  return PRODUCAO_POR_ID.get(id) || null;
}

export function coquetelPorId(id) {
  return COQUETEL_POR_ID.get(id) || null;
}

export function ehProducao(chave) {
  return PRODUCAO_POR_ID.has(chave);
}

/** Nome legível de qualquer referência de receita, seja produção ou insumo. */
export function nomeDaReferencia(chave) {
  return producaoPorId(chave)?.nome || insumoPorChave(chave)?.nome || chave;
}

/**
 * Fator por litro, derivado — nunca guardado.
 *
 *     fator = qtd_insumo / rendimento * 1000
 *
 * Quantos ml (ou g) daquele insumo entram em 1 litro do produto acabado.
 */
export function fatorPorLitro(producaoId, insumoChave) {
  const producao = producaoPorId(producaoId);
  if (!producao) return 0;
  const linha = producao.insumos.find((item) => item.insumo === insumoChave);
  if (!linha) return 0;
  return (linha.qtd / producao.rendimento) * 1000;
}

/** Todos os fatores de uma produção, para a tela de consulta. */
export function fatoresDe(producaoId) {
  const producao = producaoPorId(producaoId);
  if (!producao) return [];
  return producao.insumos.map((linha) => ({
    chave: linha.insumo,
    nome: nomeDaReferencia(linha.insumo),
    qtd: linha.qtd,
    unidade: linha.unidade,
    porLitro: (linha.qtd / producao.rendimento) * 1000,
  }));
}

/** Rendimento em galões de 5 L, que é como a produção trabalha na bancada. */
export function rendimentoEmGaloes(producaoId) {
  const producao = producaoPorId(producaoId);
  return producao ? producao.rendimento / 5000 : 0;
}

/**
 * Uma produção é insumo intermediário quando outra produção a consome.
 * Derivado das receitas, não marcado à mão — assim, mudar uma receita ajusta
 * a classificação sozinha.
 */
export function ehIntermediaria(producaoId) {
  return PRODUCOES.some((producao) => (
    producao.id !== producaoId && producao.insumos.some((linha) => linha.insumo === producaoId)
  ));
}

/**
 * Ordem em que as produções devem ser resolvidas na cascata.
 *
 * Quem CONSOME vem antes de quem é consumido: só dá para saber quanto xarope
 * de açúcar fazer depois de saber quanto manjericão e framboesa vão puxar
 * dele. Por isso o xarope de açúcar sempre sai por último.
 *
 * Ordenação topológica sobre as receitas — se alguém acrescentar uma produção
 * que consome outra, a ordem se corrige sozinha.
 */
export function ordemDeProducao() {
  const grauEntrada = new Map(PRODUCOES.map((producao) => [producao.id, 0]));
  const consumidoPor = new Map(PRODUCOES.map((producao) => [producao.id, []]));

  PRODUCOES.forEach((producao) => {
    producao.insumos.forEach((linha) => {
      if (!PRODUCAO_POR_ID.has(linha.insumo)) return;
      // producao consome linha.insumo => producao vem antes.
      consumidoPor.get(producao.id).push(linha.insumo);
      grauEntrada.set(linha.insumo, grauEntrada.get(linha.insumo) + 1);
    });
  });

  const fila = PRODUCOES.filter((producao) => grauEntrada.get(producao.id) === 0).map((p) => p.id);
  const ordem = [];
  while (fila.length) {
    const atual = fila.shift();
    ordem.push(atual);
    consumidoPor.get(atual).forEach((dependencia) => {
      grauEntrada.set(dependencia, grauEntrada.get(dependencia) - 1);
      if (grauEntrada.get(dependencia) === 0) fila.push(dependencia);
    });
  }

  if (ordem.length !== PRODUCOES.length) {
    throw new Error("Ciclo nas receitas: uma produção consome a si mesma, direta ou indiretamente.");
  }
  return ordem;
}

/** Pré-batches ativos, na ordem em que aparecem na ficha. */
export function preBatches() {
  return COQUETEIS.filter((coquetel) => coquetel.preBatch);
}

export function montadosNaHora() {
  return COQUETEIS.filter((coquetel) => !coquetel.preBatch);
}

/** Total em ml de uma dose batcheável — a base do rateio da explosão. */
export function totalDoBatch(coquetelId) {
  const coquetel = coquetelPorId(coquetelId);
  if (!coquetel) return 0;
  return coquetel.batch.reduce((total, linha) => total + linha.ml, 0);
}

const ehLinhaEmMl = (linha) => (insumoPorChave(linha.insumo)?.unidadeReceita ?? "ml") === "ml";

/**
 * Total em ml do que é acrescentado no serviço. Só soma o que está em ml:
 * lata não entra na conta, senão o Jägerbomb viraria "51 ml".
 */
export function totalDoServico(coquetelId) {
  const coquetel = coquetelPorId(coquetelId);
  if (!coquetel || !Array.isArray(coquetel.servico)) return 0;
  return coquetel.servico.filter(ehLinhaEmMl).reduce((total, linha) => total + linha.ml, 0);
}

/**
 * O total do serviço só faz sentido quando tudo está na mesma unidade. Onde
 * entra lata, a própria ficha não imprime total — e nós também não.
 */
export function servicoTemTotal(coquetelId) {
  const coquetel = coquetelPorId(coquetelId);
  if (!coquetel || !Array.isArray(coquetel.servico) || !coquetel.servico.length) return false;
  return coquetel.servico.every(ehLinhaEmMl);
}

/**
 * Doses que um galão de 5 L rende, sobre a parte batcheável. Arredonda para
 * baixo: dose incompleta não se serve.
 */
export function dosesPorGalao(coquetelId) {
  const total = totalDoBatch(coquetelId);
  return total ? Math.floor(GALAO_ML / total) : 0;
}

/** O par expresso em galões de bancada, que é como a produção trabalha. */
export function parEmGaloes(coquetelId) {
  const coquetel = coquetelPorId(coquetelId);
  if (!coquetel) return 0;
  return Math.round((coquetel.parLitros * 1000 / GALAO_ML) * 10) / 10;
}

/**
 * Tem parte batcheável mas está fora da rotação da OP. A ficha classifica
 * estes como pré-batch; o escopo da Fase 4 diz que são montados na hora.
 */
export function batchavelForaDaOP(coquetel) {
  return !coquetel.preBatch && coquetel.batch.length > 0;
}

export function pendenciasDoCoquetel(coquetel) {
  return pendenciasDe(coquetel, ROTULOS_COQUETEL);
}

export function pendenciasDaProducao(producao) {
  return pendenciasDe(producao, ROTULOS_PRODUCAO);
}

/** Quantos campos ainda estão EM ABERTO em toda a ficha. */
export function resumoDePendencias() {
  const coqueteis = COQUETEIS.map((coquetel) => ({ nome: coquetel.nome, campos: pendenciasDoCoquetel(coquetel) })).filter((item) => item.campos.length);
  const producoes = PRODUCOES.map((producao) => ({ nome: producao.nome, campos: pendenciasDaProducao(producao) })).filter((item) => item.campos.length);
  const total = [...coqueteis, ...producoes].reduce((soma, item) => soma + item.campos.length, 0);
  return { coqueteis, producoes, total };
}

/**
 * Confere as regras de receita que não se negociam. Devolve a lista de
 * problemas; vazia significa ficha consistente.
 */
export function validarFichas() {
  const problemas = [];

  // Nenhum coquetel pode ter carbonatado ou limão na parte batcheável — vale
  // inclusive para os que têm batch mas estão fora da rotação da OP.
  COQUETEIS.forEach((coquetel) => {
    coquetel.batch.forEach((linha) => {
      if (PROIBIDOS_EM_PRE_BATCH.includes(linha.insumo)) {
        problemas.push(`${coquetel.nome}: ${nomeDaReferencia(linha.insumo)} nunca entra em batch.`);
      }
    });
    // Toda referência, de batch ou de serviço, precisa existir no registro.
    const referencias = [...coquetel.batch, ...(Array.isArray(coquetel.servico) ? coquetel.servico : [])];
    referencias.forEach((linha) => {
      if (!PRODUCAO_POR_ID.has(linha.insumo) && !insumoPorChave(linha.insumo)) {
        problemas.push(`${coquetel.nome}: insumo "${linha.insumo}" não existe no registro.`);
      }
    });
  });

  preBatches().forEach((coquetel) => {
    if (!coquetel.parLitros) problemas.push(`${coquetel.nome}: está na rotação da OP sem par definido.`);
    if (!coquetel.batch.length) problemas.push(`${coquetel.nome}: está na rotação da OP sem parte batcheável.`);
  });

  PRODUCOES.forEach((producao) => {
    if (!producao.rendimento) problemas.push(`${producao.nome}: rendimento zerado — a derivação de fator dividiria por zero.`);
    producao.insumos.forEach((linha) => {
      if (!PRODUCAO_POR_ID.has(linha.insumo) && !insumoPorChave(linha.insumo)) {
        problemas.push(`${producao.nome}: insumo "${linha.insumo}" não existe no registro.`);
      }
    });
  });

  // Todo gin da casa é Tanqueray: nenhuma receita pode citar outro gin.
  COQUETEIS.forEach((coquetel) => {
    coquetel.batch.forEach((linha) => {
      const nome = nomeDaReferencia(linha.insumo).toLowerCase();
      if (nome.includes("gin ") && linha.insumo !== GIN_PADRAO) {
        problemas.push(`${coquetel.nome}: usa ${nomeDaReferencia(linha.insumo)}; todo gin da casa é Tanqueray.`);
      }
    });
  });

  try {
    ordemDeProducao();
  } catch (error) {
    problemas.push(error.message);
  }

  return problemas;
}

/**
 * Produtos que o catálogo PRODUTOS precisa ter para a Fase 4 funcionar:
 * os insumos base, as seis produções e os cinco pré-batches.
 *
 * Produções e pré-batches entram com unidade fixa em ml — a conversão para
 * litro é só apresentação — e com `produzido` e `requisitavel` ligados: batch
 * pronto é produto como qualquer garrafa.
 */
export function produtosExigidos() {
  const doRegistro = INSUMOS
    // Água não consome estoque; apelidos (preparos do mesmo produto) não
    // viram um segundo cadastro.
    .filter((insumo) => !insumo.semEstoque && !insumo.aliasDe)
    .map((insumo) => ({
      chave: insumo.chave,
      nome: insumo.nome,
      categoria: insumo.categoria,
      unidade: insumo.unidadeEstoque,
      // Quanto cabe na embalagem, para a requisição dizer o que é "1".
      embalagem: embalagemDe(insumo.chave),
      minimo: null,
      // Até 26/08/2026 insumo de produção não era requisitável: a ideia era
      // que a produção puxasse direto do estoque. Carlos corrigiu — quem
      // produz pede açúcar e mel pelo mesmo fluxo de qualquer garrafa, e sem
      // isso a requisição não servia para a produção.
      requisitavel: true,
      produzido: false,
    }));

  const dasProducoes = PRODUCOES.map((producao) => ({
    chave: producao.id,
    nome: producao.nome,
    categoria: "Produção",
    unidade: "ml",
    embalagem: "ml",
    minimo: PAR_SERVICO[producao.id] || null,
    requisitavel: true,
    produzido: true,
  }));

  const dosPreBatches = preBatches().map((coquetel) => ({
    chave: coquetel.id,
    nome: coquetel.nome,
    categoria: "Pré-batch",
    unidade: "ml",
    embalagem: "ml",
    minimo: coquetel.parLitros * 1000,
    requisitavel: true,
    produzido: true,
  }));

  return [...doRegistro, ...dasProducoes, ...dosPreBatches];
}

/** Validade em dias de qualquer item produzido, pela ponta conservadora. */
export function validadeDias(chave) {
  if (COQUETEL_POR_ID.has(chave)) return VALIDADE_PRE_BATCH_DIAS;
  return producaoPorId(chave)?.validadeDias ?? 0;
}
