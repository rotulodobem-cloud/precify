// ══════════════════════════════════════════════════════════════
//  Motor de Cálculo — Precify
//  Fórmulas derivadas da planilha de precificação real
// ══════════════════════════════════════════════════════════════

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

/**
 * Preço promocional = precoIdeal × 1,40
 *
 * Inflacionado 40% acima do ideal para suportar desconto de até ~28,6%
 * mantendo margem acima de 20%.
 */
export function calcPrecoPromocional(precoIdeal: number): number {
  return round2(precoIdeal * 1.40)
}

export type StatusMargem = 'SAUDAVEL' | 'ATENCAO' | 'PREJUIZO' | 'SEM_PRECO'

export function statusMargem(margem?: number | null): StatusMargem {
  if (margem === null || margem === undefined) return 'SEM_PRECO'
  if (margem >= 0.25) return 'SAUDAVEL'
  if (margem >= 0.20) return 'ATENCAO'
  return 'PREJUIZO'
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
