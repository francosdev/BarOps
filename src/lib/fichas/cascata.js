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
 * Miolo compartilhado entre a sugestão automática e o cálculo avulso:
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
 * Cálculo avulso: "quero fazer N litros deste pré-batch, o que preciso?".
 *
 * Não olha saldo nem par — é conta de receita pura, para quem já decidiu o
 * volume. Devolve o que vai no batch, as produções que isso exige se forem
 * feitas do zero, e os insumos base correspondentes.
 */
export function explodirAvulso({ coquetelId, litros }) {
  const coquetel = coquetelPorId(coquetelId);
  const ml = Math.max(0, Number(litros) || 0) * 1000;
  if (!coquetel || !ml) {
    return { coquetel, ml: 0, componentes: [], producoes: [], separacao: [], insumosBase: [] };
  }

  const demanda = {};
  const acrescentar = (chave, quantidade) => { demanda[chave] = (demanda[chave] || 0) + quantidade; };
  const total = totalDoBatch(coquetelId);

  // O que entra no galão, rateado pelo total da dose.
  const componentes = coquetel.batch.map((linha) => {
    const quantidade = ml * linha.ml / total;
    acrescentar(linha.insumo, quantidade);
    return { chave: linha.insumo, nome: nomeDaReferencia(linha.insumo), ml: arredonda2(quantidade) };
  });

  // Sem saldo: quem pede avulso quer a conta do zero.
  const { lotesProducao, separacao, insumosBase } = resolverEConverter(demanda, acrescentar, () => 0);

  return { coquetel, ml, componentes, producoes: lotesProducao, separacao, insumosBase };
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

/** Total de produções que a cascata mandou fazer, para o resumo da tela. */
export function resumoDaCascata(resultado) {
  return {
    preBatches: resultado.preBatches.filter((lote) => lote.produzir).length,
    producoes: resultado.producoes.filter((lote) => lote.produzir).length,
    litros: arredonda2(
      [...resultado.preBatches, ...resultado.producoes].reduce((total, lote) => total + lote.produzir, 0) / 1000
    ),
  };
}

export const MODOS_ARREDONDAMENTO = Object.keys(LOTE);
