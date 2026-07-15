// ══════════════════════════════════════════════════════════════
//  Motor de Cálculo — Precify
//  Fórmulas derivadas da planilha de precificação real
// ══════════════════════════════════════════════════════════════

/**
 * Preço de venda a partir de custo e margens.
 *
 * Como comissão e imposto incidem sobre a RECEITA BRUTA (preço de venda),
 * precisamos isolar o preço:
 *
 *   precoVenda = custoTotal / (1 - comissao - imposto - margem)
 *
 * Planilha usa exatamente esta fórmula em todas as abas (ML, Shopee, TikTok, Magalu).
 */
export function calcPrecoVenda(custoTotal: number, comissao: number, imposto: number, margem: number): number {
  const divisor = 1 - comissao - imposto - margem
  if (divisor <= 0) return 0
  return round2(custoTotal / divisor)
}

/**
 * Custo de uma variação proporcional ao peso.
 *   custo_var = (custoPorKg × pesoGramas) / 1000
 *
 * Exemplo: Camomila R$27/kg → 250g = R$6,75
 */
export function calcCustoVariacao(custoPorKg: number, pesoGramas: number, adicional = 0): number {
  return round2((custoPorKg * pesoGramas) / 1000 + adicional)
}

/** Custo total = produto + embalagem + frete + coleta (custos fixos R$) */
export function calcCustoTotal(produto: number, embalagem: number, frete: number, coleta: number): number {
  return round2(produto + embalagem + frete + coleta)
}

/** Preço mínimo para margem de 20% */
export function calcPrecoMinimo(ct: number, comissao: number, imposto: number): number {
  return calcPrecoVenda(ct, comissao, imposto, 0.20)
}

/** Preço ideal para margem de 25% */
export function calcPrecoIdeal(ct: number, comissao: number, imposto: number): number {
  return calcPrecoVenda(ct, comissao, imposto, 0.25)
}

/** Preço máximo para margem de 30% */
export function calcPrecoMaximo(ct: number, comissao: number, imposto: number): number {
  return calcPrecoVenda(ct, comissao, imposto, 0.30)
}

/**
 * Preço promocional = precoIdeal × 1,40
 *
 * Inflacionado 40% acima do ideal para suportar desconto de até ~28,6%
 * mantendo margem acima de 20%.
 */
export function calcPrecoPromocional(precoIdeal: number): number {
  return round2(precoIdeal * 1.40)
}

/** Margem bruta sobre receita bruta */
export function calcMargem(precoVenda: number, custoTotal: number): number {
  if (!precoVenda || precoVenda <= 0) return 0
  return (precoVenda - custoTotal) / precoVenda
}

export type StatusMargem = 'SAUDAVEL' | 'ATENCAO' | 'PREJUIZO' | 'SEM_PRECO'

export function statusMargem(margem?: number | null): StatusMargem {
  if (margem === null || margem === undefined) return 'SEM_PRECO'
  if (margem >= 0.25) return 'SAUDAVEL'
  if (margem >= 0.20) return 'ATENCAO'
  return 'PREJUIZO'
}

/** Calcula todos os campos de precificação de uma vez */
export function calcPrecificacaoCompleta(p: {
  custoProduto: number
  custoEmbalagem: number
  custoFrete: number
  custoColeta: number
  comissaoPct: number
  impostoPct: number
  precoAtual?: number | null
}) {
  const ct = calcCustoTotal(p.custoProduto, p.custoEmbalagem, p.custoFrete, p.custoColeta)
  const pMin   = calcPrecoMinimo(ct, p.comissaoPct, p.impostoPct)
  const pIdeal = calcPrecoIdeal(ct, p.comissaoPct, p.impostoPct)
  const pMax   = calcPrecoMaximo(ct, p.comissaoPct, p.impostoPct)
  const pPromo = calcPrecoPromocional(pIdeal)

  let lucroBruto: number | null = null
  let margemAtual: number | null = null
  let status: StatusMargem = 'SEM_PRECO'

  if (p.precoAtual && p.precoAtual > 0) {
    lucroBruto = round2(p.precoAtual - ct)
    margemAtual = calcMargem(p.precoAtual, ct)
    status = statusMargem(margemAtual)
  }

  return {
    custoTotalCalc: ct,
    precoMinimo: pMin,
    precoIdeal: pIdeal,
    precoMaximo: pMax,
    precoPromocional: pPromo,
    lucroBruto,
    margemAtual,
    statusMargem: status,
  }
}

/**
 * Versão que resolve o frete ML automaticamente pela tabela FULL
 * antes de calcular os preços.
 *
 * Para plataformas não-ML, usa o custoFrete passado diretamente.
 * Para ML:
 *   - tipoFreteML = 'full'   → busca na tabela FULL usando peso + precoAtual (ou precoIdeal estimado)
 *   - tipoFreteML = 'flex'   → tabela Flex/Envios pelo peso
 *   - tipoFreteML = 'fixo'   → usa o custoFrete passado sem alterar
 */
export function calcPrecificacaoComFreteML(p: {
  custoProduto: number
  custoEmbalagem: number
  custoFrete: number        // usado só se tipoFreteML = 'fixo' ou plataforma não-ML
  custoColeta: number
  comissaoPct: number
  impostoPct: number
  precoAtual?: number | null
  isML: boolean
  tipoFreteML?: string      // 'full' | 'flex' | 'fixo'
  pesoGramas?: number | null
}) {
  // Importação dinâmica da tabela (evita circular dependency no browser)
  let freteResolvido = p.custoFrete

  if (p.isML && p.tipoFreteML !== 'fixo' && p.pesoGramas) {
    const pesoKg = p.pesoGramas / 1000
    if (p.tipoFreteML === 'flex' || p.tipoFreteML === 'envios') {
      freteResolvido = calcFreteFlexMLInternal(pesoKg)
    } else {
      // full — para calcular o frete precisamos de um preço de referência.
      // Usamos o precoAtual se existir, senão fazemos uma estimativa inicial
      // sem frete para depois corrigir iterativamente.
      const precoRef = p.precoAtual ?? estimarPrecoSemFrete(p.custoProduto, p.custoEmbalagem, p.custoColeta, p.comissaoPct, p.impostoPct)
      freteResolvido = calcFreteFullML(pesoKg, precoRef)
    }
  }

  return {
    ...calcPrecificacaoCompleta({ ...p, custoFrete: freteResolvido }),
    custoFrete: round2(freteResolvido),
  }
}

// ── Tabela FULL inline (evita import circular no server) ─────
export function calcFreteFullML(pesoKg: number, precoVenda: number): number {
  const faixasPreco = [
    { min: 0,   max: 18.99 },
    { min: 19,  max: 28.99 },
    { min: 29,  max: 48.99 },
    { min: 49,  max: 78.99 },
    { min: 79,  max: 98.99 },
    { min: 99,  max: 198.99 },
    { min: 199, max: Infinity },
  ]
  const tabela: [number, number[]][] = [
    [0.3,  [1.25, 1.50, 2.00, 3.00, 4.00,  6.00,  20.95]],
    [0.5,  [1.25, 1.50, 2.00, 3.00, 4.00,  6.00,  22.55]],
    [1.0,  [1.25, 1.50, 2.00, 3.00, 4.00,  6.00,  23.65]],
    [2.0,  [1.75, 2.00, 2.50, 3.50, 4.50,  6.50,  24.65]],
    [3.0,  [2.00, 2.50, 3.00, 4.00, 5.00,  7.00,  26.25]],
    [4.0,  [2.00, 2.50, 3.00, 4.00, 5.00,  7.00,  28.35]],
    [5.0,  [2.50, 3.50, 4.00, 5.00, 6.00,  7.50,  30.75]],
    [6.0,  [2.50, 3.50, 4.00, 5.00, 6.00,  7.50,  39.75]],
    [7.0,  [4.00, 5.00, 5.50, 6.50, 7.00,  7.50,  44.05]],
    [8.0,  [4.00, 5.00, 5.50, 6.50, 7.00,  7.50,  48.05]],
    [9.0,  [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  49.35]],
    [11.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  68.65]],
    [15.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  74.95]],
    [20.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00,  91.15]],
    [30.0, [5.00, 6.00, 6.50, 7.00, 7.50,  8.00, 106.95]],
  ]
  const colIdx = faixasPreco.findIndex(f => precoVenda >= f.min && precoVenda <= f.max)
  const col = colIdx === -1 ? faixasPreco.length - 1 : colIdx
  const linha = tabela.find(([max]) => pesoKg <= max) ?? tabela[tabela.length - 1]
  return linha[1][col]
}

function calcFreteFlexMLInternal(pesoKg: number): number {
  const tabela: [number, number][] = [
    [0.3, 12], [0.5, 14], [1.0, 16], [2.0, 19],
    [3.0, 22], [5.0, 27], [10.0, 35], [30.0, 55],
  ]
  return (tabela.find(([max]) => pesoKg <= max) ?? tabela[tabela.length - 1])[1]
}

function estimarPrecoSemFrete(custoProduto: number, embalagem: number, coleta: number, comissao: number, imposto: number): number {
  // Estimativa inicial sem frete para ter um preço de referência
  const ct = custoProduto + embalagem + coleta
  return calcPrecoIdeal(ct, comissao, imposto)
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100
}

export function fmtBRL(v?: number | null): string {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function fmtPct(v?: number | null, decimals = 1): string {
  if (v === null || v === undefined) return '—'
  return `${(v * 100).toFixed(decimals)}%`
}

export function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('pt-BR')
}
