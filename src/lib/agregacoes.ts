import { statusMargem } from './calculos'

export interface CompraAgregavel {
  dataCompra: Date
  skuPrincipal: string
  nomeProduto: string
  fornecedor: string
  custoTotal: number
  custoUnitario: number
}

export interface PontoMensal {
  mes: string   // 'YYYY-MM'
  total: number
  compras: number
}

const chaveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const arredonda2 = (v: number) => Math.round(v * 100) / 100

/**
 * Série de gasto dos últimos `meses` meses terminando em `referencia` (inclusive),
 * do mais antigo para o mais recente. Meses sem compra aparecem zerados.
 */
export function serieMensalDeGastos(compras: CompraAgregavel[], meses: number, referencia: Date): PontoMensal[] {
  const serie: PontoMensal[] = []
  const indice = new Map<string, PontoMensal>()

  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(referencia.getFullYear(), referencia.getMonth() - i, 1)
    const ponto: PontoMensal = { mes: chaveMes(d), total: 0, compras: 0 }
    serie.push(ponto)
    indice.set(ponto.mes, ponto)
  }

  for (const c of compras) {
    const ponto = indice.get(chaveMes(c.dataCompra))
    if (!ponto) continue   // fora da janela
    ponto.total += c.custoTotal
    ponto.compras += 1
  }

  for (const ponto of serie) ponto.total = arredonda2(ponto.total)
  return serie
}

export interface DistribuicaoMargem {
  saudavel: number
  atencao: number
  prejuizo: number
  total: number
}

/** Conta quantas margens caem em cada faixa, usando os mesmos cortes de `statusMargem`. */
export function distribuirMargens(margens: number[]): DistribuicaoMargem {
  const d: DistribuicaoMargem = { saudavel: 0, atencao: 0, prejuizo: 0, total: 0 }
  for (const m of margens) {
    const status = statusMargem(m)
    if (status === 'SAUDAVEL') d.saudavel++
    else if (status === 'ATENCAO') d.atencao++
    else if (status === 'PREJUIZO') d.prejuizo++
    else continue   // SEM_PRECO não entra na distribuição
    d.total++
  }
  return d
}

export interface ItemCurva {
  sku: string
  produto: string
  totalGasto: number
  qtdCompras: number
  pctTotal: number
  curva: 'A' | 'B' | 'C'
  fornecedorPrincipal: string
  outrosFornecedores: string[]
  custoAtual: number
  melhorFornecedor: { nome: string; custoUnitario: number } | null
  historicoCusto: number[]
}

const MAX_PONTOS_HISTORICO = 12

/**
 * Tolerância na comparação do acumulado: somar frações em ponto flutuante
 * produz 0.9500000000000001, o que jogaria para a curva C um item que está
 * exatamente no limite de 95%.
 */
const EPSILON = 1e-9

/**
 * Classifica os SKUs em curva A/B/C pelo gasto acumulado (A até 80%, B até 95%, C o resto)
 * e, para cada um, informa o custo atual, a evolução do custo e qual fornecedor
 * pratica o menor custo unitário médio.
 */
export function curvaABC(compras: CompraAgregavel[]): ItemCurva[] {
  interface Acumulado {
    sku: string
    produto: string
    totalGasto: number
    qtdCompras: number
    gastoPorFornecedor: Map<string, number>
    somaCustoPorFornecedor: Map<string, { soma: number; n: number }>
    porData: { data: number; custoUnitario: number }[]
  }

  const porSku = new Map<string, Acumulado>()
  for (const c of compras) {
    let acc = porSku.get(c.skuPrincipal)
    if (!acc) {
      acc = {
        sku: c.skuPrincipal, produto: c.nomeProduto, totalGasto: 0, qtdCompras: 0,
        gastoPorFornecedor: new Map(), somaCustoPorFornecedor: new Map(), porData: [],
      }
      porSku.set(c.skuPrincipal, acc)
    }
    acc.totalGasto += c.custoTotal
    acc.qtdCompras += 1
    acc.porData.push({ data: c.dataCompra.getTime(), custoUnitario: c.custoUnitario })
    if (c.fornecedor) {
      acc.gastoPorFornecedor.set(c.fornecedor, (acc.gastoPorFornecedor.get(c.fornecedor) ?? 0) + c.custoTotal)
      const m = acc.somaCustoPorFornecedor.get(c.fornecedor) ?? { soma: 0, n: 0 }
      m.soma += c.custoUnitario
      m.n += 1
      acc.somaCustoPorFornecedor.set(c.fornecedor, m)
    }
  }

  const ordenados = [...porSku.values()].sort((a, b) => b.totalGasto - a.totalGasto)
  const totalGeral = ordenados.reduce((s, i) => s + i.totalGasto, 0)

  let acumulado = 0
  return ordenados.map(acc => {
    const pct = totalGeral > 0 ? acc.totalGasto / totalGeral : 0
    acumulado += pct
    const curva: 'A' | 'B' | 'C' =
      acumulado <= 0.80 + EPSILON ? 'A' : acumulado <= 0.95 + EPSILON ? 'B' : 'C'

    const porGasto = [...acc.gastoPorFornecedor.entries()].sort((a, b) => b[1] - a[1])
    const medias = [...acc.somaCustoPorFornecedor.entries()]
      .map(([nome, m]) => ({ nome, custoUnitario: arredonda2(m.soma / m.n) }))
      .sort((a, b) => a.custoUnitario - b.custoUnitario)

    const cronologico = acc.porData.sort((a, b) => a.data - b.data).map(p => p.custoUnitario)
    const historicoCusto = cronologico.slice(-MAX_PONTOS_HISTORICO)

    return {
      sku: acc.sku,
      produto: acc.produto,
      totalGasto: arredonda2(acc.totalGasto),
      qtdCompras: acc.qtdCompras,
      pctTotal: Math.round(pct * 1000) / 10,
      curva,
      fornecedorPrincipal: porGasto[0]?.[0] ?? '',
      outrosFornecedores: porGasto.slice(1).map(([f]) => f),
      custoAtual: cronologico[cronologico.length - 1] ?? 0,
      melhorFornecedor: medias[0] ?? null,
      historicoCusto,
    }
  })
}
