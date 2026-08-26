import { PAR_SERVICO, PRODUCOES } from "./producoes.js";
import { insumoPorChave } from "./insumos.js";
import { coquetelPorId, nomeDaReferencia, ordemDeProducao, preBatches, producaoPorId, totalDoBatch } from "./index.js";

const LOTE = { litro: 1000, galao: 5000 };

function arredondarLote(ml, modo) {
  const passo = LOTE[modo] || LOTE.litro;
  return Math.ceil(ml / passo) * passo;
}

const arredonda2 = (valor) => Math.round(valor * 100) / 100;

/**
 * Explosão em cascata de dois níveis. A ordem importa e é esta:
 *
 *   1. déficit de cada pré-batch, arredondado para cima em lote fechado;
 *   2. demanda de produções gerada por esses lotes;
 *   3. produções resolvidas na ordem de dependência — quem consome primeiro,
 *      xarope de açúcar por último;
 *   4. produções explodidas em insumos base;
 *   5. conversão para embalagem fechada.
 *
 * `saldos` vem de MOVIMENTOS, em ml, indexado pela chave da ficha. Nenhum
 * saldo é guardado aqui: esta função só recebe e calcula.
 *
 * A prateleira de serviço (PAR_SERVICO) SOMA à demanda em cascata. Descontar
 * derruba o xarope de açúcar de 39,40 L para 23,40 L.
 */
export function explodirCascata({ saldos = {}, arredondamento = "litro" } = {}) {
  const saldoDe = (chave) => Math.max(0, Number(saldos[chave]) || 0);
  const demanda = {};
  const acrescentar = (chave, ml) => { demanda[chave] = (demanda[chave] || 0) + ml; };

  // 1. Pré-batches: déficit contra o par, em lote fechado.
  const lotesPreBatch = preBatches().map((coquetel) => {
    const par = coquetel.parLitros * 1000;
    const saldo = saldoDe(coquetel.id);
    const deficit = Math.max(0, par - saldo);
    const produzir = deficit ? arredondarLote(deficit, arredondamento) : 0;
    return { chave: coquetel.id, nome: coquetel.nome, par, saldo, deficit, produzir };
  });

  // 2. Cada lote de pré-batch explode em seus componentes, rateados pelo
  //    total da dose. A receita escala.
  lotesPreBatch.forEach((lote) => {
    if (!lote.produzir) return;
    const coquetel = coquetelPorId(lote.chave);
    const total = totalDoBatch(lote.chave);
    coquetel.batch.forEach((linha) => acrescentar(linha.insumo, lote.produzir * linha.ml / total));
  });

  // 3. Prateleira de serviço entra como demanda adicional, não como desconto.
  Object.entries(PAR_SERVICO).forEach(([chave, ml]) => acrescentar(chave, ml));

  // 4 e 5: resolver produções e converter para unidade de estoque.
  const { lotesProducao, separacao, insumosBase } = resolverEConverter(demanda, acrescentar, saldoDe);

  return { preBatches: lotesPreBatch, producoes: lotesProducao, separacao, insumosBase };
}

/**
 * Miolo compartilhado entre a sugestão automática e a lista montada à mão:
 * resolve as produções na ordem de dependência e converte tudo para unidade
 * de estoque.
 *
 * Só se consome insumo do que de fato se vai produzir, por isso a explosão
 * usa `produzir`, não `necessario`.
 */
function resolverEConverter(demanda, acrescentar, saldoDe) {
  const insumosBase = {};
  const lotesProducao = [];

  ordemDeProducao().forEach((chave) => {
    const necessario = demanda[chave] || 0;
    const saldo = saldoDe(chave);
    const produzir = Math.max(0, necessario - saldo);
    if (necessario > 0 || saldo > 0) {
      lotesProducao.push({ chave, nome: nomeDaReferencia(chave), necessario, saldo, produzir });
    }
    if (!produzir) return;

    const producao = producaoPorId(chave);
    producao.insumos.forEach((linha) => {
      const quantidade = produzir * linha.qtd / producao.rendimento;
      if (producaoPorId(linha.insumo)) acrescentar(linha.insumo, quantidade);
      else insumosBase[linha.insumo] = (insumosBase[linha.insumo] || 0) + quantidade;
    });
  });

  // Embalagem fechada sobe para a unidade inteira; granel sai no exato.
  const separacao = Object.entries(demanda)
    .filter(([chave]) => !producaoPorId(chave) && insumoPorChave(chave))
    .map(([chave, qtd]) => montarLinha(chave, qtd))
    .filter(Boolean)
    .sort((a, b) => b.unidades - a.unidades);

  const base = Object.entries(insumosBase)
    .map(([chave, qtd]) => montarLinha(chave, qtd))
    .filter(Boolean)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return { lotesProducao, separacao, insumosBase: base };
}

/**
 * O que entra no galão de N ml de um pré-batch, rateado pelo total da dose.
 * Sai cru — quem publica arredonda; quem soma na demanda usa o número exato.
 */
function componentesCrus(coquetelId, ml) {
  const coquetel = coquetelPorId(coquetelId);
  if (!coquetel || !ml) return [];
  const total = totalDoBatch(coquetelId);
  return coquetel.batch.map((linha) => ({
    chave: linha.insumo,
    nome: nomeDaReferencia(linha.insumo),
    ml: ml * linha.ml / total,
  }));
}

export function componentesDoBatch(coquetelId, ml) {
  return componentesCrus(coquetelId, ml).map((linha) => ({ ...linha, ml: arredonda2(linha.ml) }));
}

/**
 * Ordem de produção montada à mão: "quero fazer esta lista, nestes volumes".
 *
 * Não olha saldo nem par — quem monta a lista já decidiu o que vai produzir.
 * Aceita pré-batch e produção na mesma lista: o pré-batch explode em seus
 * componentes, a produção entra direto como demanda, e a cascata resolve o
 * resto na ordem de dependência.
 *
 * Uma lista de um item só é o antigo cálculo avulso.
 */
export function explodirLista({ itens = [] } = {}) {
  const demanda = {};
  const acrescentar = (chave, quantidade) => { demanda[chave] = (demanda[chave] || 0) + quantidade; };

  const lotes = itens
    .map((item) => ({ chave: item.chave, ml: Math.max(0, Number(item.litros) || 0) * 1000 }))
    .filter((item) => item.ml > 0)
    .map(({ chave, ml }) => {
      const coquetel = coquetelPorId(chave);
      if (coquetel) {
        const componentes = componentesCrus(chave, ml);
        componentes.forEach((linha) => acrescentar(linha.chave, linha.ml));
        return {
          chave,
          nome: coquetel.nome,
          tipo: "prebatch",
          ml: arredonda2(ml),
          componentes: componentes.map((linha) => ({ ...linha, ml: arredonda2(linha.ml) })),
        };
      }
      const producao = producaoPorId(chave);
      if (!producao) return null;
      acrescentar(chave, ml);
      return { chave, nome: producao.nome, tipo: "producao", ml: arredonda2(ml), componentes: [] };
    })
    .filter(Boolean);

  const { lotesProducao, separacao, insumosBase } = resolverEConverter(demanda, acrescentar, () => 0);

  return { lotes, producoes: lotesProducao, separacao, insumosBase };
}

function montarLinha(chave, qtdReceita) {
  const insumo = insumoPorChave(chave);
  // Água entra na receita mas não consome estoque: não vira linha de separação.
  if (!insumo || insumo.semEstoque) return null;
  const bruto = qtdReceita / insumo.volume;
  return {
    chave,
    nome: insumo.nome,
    qtdReceita: arredonda2(qtdReceita),
    unidadeReceita: insumo.unidadeReceita,
    unidades: insumo.embalagemFechada ? Math.ceil(bruto) : arredonda2(bruto),
    unidadeEstoque: insumo.unidadeEstoque,
    embalagemFechada: insumo.embalagemFechada,
  };
}

export const MODOS_ARREDONDAMENTO = Object.keys(LOTE);
