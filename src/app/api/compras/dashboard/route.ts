import { NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET() {
  const compras = await db.compra.findMany({
    orderBy: { dataCompra: 'desc' },
    take: 1000,
  })

  // ── Métricas gerais ──────────────────────────────────────────
  const totalGasto = compras.reduce((s, c) => s + c.custoTotal, 0)
  const totalCompras = compras.length
  const fornecedoresAtivos = new Set(compras.map(c => c.fornecedor).filter(Boolean)).size

  const comPreco = compras.filter(c => c.margem !== null)
  const mediaMargemComPreco = comPreco.length
    ? comPreco.reduce((s, c) => s + (c.margem ?? 0), 0) / comPreco.length
    : 0

  // ── Por fornecedor ───────────────────────────────────────────
  const fornMap: Record<string, { total: number; qtdCompras: number; qtdItens: number }> = {}
  for (const c of compras) {
    const f = c.fornecedor || 'Sem fornecedor'
    if (!fornMap[f]) fornMap[f] = { total: 0, qtdCompras: 0, qtdItens: 0 }
    fornMap[f].total += c.custoTotal
    fornMap[f].qtdCompras += 1
    fornMap[f].qtdItens += c.quantidade
  }
  const porFornecedor = Object.entries(fornMap)
    .map(([fornecedor, v]) => ({ fornecedor, ...v }))
    .sort((a, b) => b.total - a.total)

  // ── Ranking 20 — variação de preço ──────────────────────────
  // Pegar o par mais recente (atual vs anterior) por SKU
  const skuVars: Record<string, {
    sku: string; produto: string; custoAnt: number | null
    custoAtual: number; variacaoPct: number | null; status: string; nCompras: number
  }> = {}

  const skuContagem: Record<string, number> = {}
  for (const c of compras) {
    skuContagem[c.skuPrincipal] = (skuContagem[c.skuPrincipal] ?? 0) + 1
  }

  // Compras ordenadas por data desc — pegar a mais recente com variação
  for (const c of compras) {
    if (!skuVars[c.skuPrincipal] && c.statusVariacao) {
      skuVars[c.skuPrincipal] = {
        sku: c.skuPrincipal,
        produto: c.nomeProduto,
        custoAnt: c.custoAnterior,
        custoAtual: c.custoUnitario,
        variacaoPct: c.variacaoPct,
        status: c.statusVariacao,
        nCompras: skuContagem[c.skuPrincipal] ?? 1,
      }
    }
  }

  const ranking20 = Object.values(skuVars)
    .sort((a, b) => Math.abs(b.variacaoPct ?? 0) - Math.abs(a.variacaoPct ?? 0))
    .slice(0, 20)

  // ── Volume mensal ────────────────────────────────────────────
  const skuMeses: Record<string, { produto: string; meses: Record<string, number> }> = {}
  for (const c of compras) {
    const d = new Date(c.dataCompra)
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!skuMeses[c.skuPrincipal]) skuMeses[c.skuPrincipal] = { produto: c.nomeProduto, meses: {} }
    skuMeses[c.skuPrincipal].meses[mes] = (skuMeses[c.skuPrincipal].meses[mes] ?? 0) + c.quantidade
  }

  const volumeMensal = Object.entries(skuMeses)
    .map(([sku, { produto, meses }]) => {
      const vals = Object.values(meses)
      return {
        sku, produto,
        mediaMensal: vals.reduce((s, v) => s + v, 0) / vals.length,
        totalMeses: vals.length,
        meses,
      }
    })
    .sort((a, b) => b.mediaMensal - a.mediaMensal)
    .slice(0, 30)

  // ── Melhor preço por fornecedor ──────────────────────────────
  const skuForn: Record<string, { produto: string; forn: Record<string, number[]> }> = {}
  for (const c of compras) {
    if (!c.fornecedor || c.custoUnitario <= 0) continue
    if (!skuForn[c.skuPrincipal]) skuForn[c.skuPrincipal] = { produto: c.nomeProduto, forn: {} }
    if (!skuForn[c.skuPrincipal].forn[c.fornecedor]) skuForn[c.skuPrincipal].forn[c.fornecedor] = []
    skuForn[c.skuPrincipal].forn[c.fornecedor].push(c.custoUnitario)
  }

  const melhorPreco = Object.entries(skuForn)
    .filter(([, { forn }]) => Object.keys(forn).length > 1)
    .map(([sku, { produto, forn }]) => {
      const fornecedores = Object.entries(forn).map(([nome, precos]) => ({
        nome,
        precoMin: Math.min(...precos),
      })).sort((a, b) => a.precoMin - b.precoMin)

      const melhor = fornecedores[0].nome
      const pior = fornecedores[fornecedores.length - 1].precoMin
      const melhorPrecoVal = fornecedores[0].precoMin
      const economia = pior - melhorPrecoVal

      return { sku, produto, fornecedores, melhor, economia: Math.round(economia * 100) / 100 }
    })
    .sort((a, b) => b.economia - a.economia)

  // ── Produtos com pior margem ─────────────────────────────────
  const skuMargem: Record<string, { sku: string; produto: string; custoUnit: number; precoVenda: number; margem: number }> = {}
  for (const c of compras) {
    if (c.margem !== null && c.precoVenda && c.precoVenda > 0) {
      if (!skuMargem[c.skuPrincipal] || c.margem < skuMargem[c.skuPrincipal].margem) {
        skuMargem[c.skuPrincipal] = {
          sku: c.skuPrincipal,
          produto: c.nomeProduto,
          custoUnit: c.custoUnitario,
          precoVenda: c.precoVenda,
          margem: c.margem,
        }
      }
    }
  }
  const prejudizo = Object.values(skuMargem)
    .sort((a, b) => a.margem - b.margem)
    .slice(0, 20)

  return NextResponse.json({
    totalGasto: Math.round(totalGasto * 100) / 100,
    totalCompras,
    fornecedoresAtivos,
    mediaMargemComPreco,
    porFornecedor,
    ranking20,
    volumeMensal,
    melhorPreco,
    prejudizo,
  })
}
