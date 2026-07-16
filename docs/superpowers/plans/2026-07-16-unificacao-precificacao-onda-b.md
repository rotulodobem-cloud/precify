# Unificação da Precificação — Onda B — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repontar os 4 últimos consumidores do model `Precificacao` antigo (Dashboard, Variações, Busca, Exportar) pro `CalculoMulticanal`, remover a importação de planilha de precificação (não usada), e então remover o model `Precificacao` de vez do banco.

**Architecture:** Dashboard é redesenhado do zero em torno de gestão interna (compras, custo, decisão) — não mais margem/preço de marketplace. Variações, Busca e Exportar são repontados pro `CalculoMulticanal`, mostrando só canais anunciados, com preço calculado na hora (mesmo padrão de `/api/parceiro` e `/api/gestao` da Onda A). Depois de tudo migrado e testado, `Precificacao` e o código morto associado são removidos numa única passada final.

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma 5, PostgreSQL, TypeScript.

## Global Constraints

- Sem framework de testes automatizado — verificação por `npx tsc --noEmit`, `npm run build`, testes ao vivo.
- Sem banco de staging — `DATABASE_URL` aponta pra produção. `db push` de remoção do `Precificacao` só roda no final (Task 7), depois de tudo testado, executado pelo controlador, não por subagent.
- **Nenhuma parte do Dashboard mostra preço ou margem específica de canal/anúncio de marketplace** — isso é decisão explícita da usuária, não uma omissão.
- Só canais com `canaisAtivos[canal] === true` contam nas telas/exports repontados (mesma regra da Onda A).
- Trabalhar direto na branch `main`.

---

### Task 1: Dashboard — nova API

**Contexto:** `/api/dashboard` hoje é inteiramente baseado em `Precificacao` (contadores de margem, alertas, comparativo ML×Shopee). Vira gestão interna: gastos com compras, produtos que provavelmente precisam de ajuste de preço, margem média por categoria, fornecedor com maior gasto, produtos parados.

**Files:**
- Modify: `src/app/api/dashboard/route.ts`

**Interfaces:**
- Produces: `GET /api/dashboard?mes=YYYY-MM&fornecedor=...` → `{ mes, fornecedorFiltro, gastoTotal, totalCompras, fornecedores: [{fornecedor, total}], produtosPraAjustar: [{sku, nome, direcao, variacaoPct, dataCompra}], porCategoria: [{categoria, margemMedia, n}], produtosParados: [{skuPrincipal, nome, dataUltimaCompra}] }`.

- [ ] **Step 1: Substituir o conteúdo da rota**

Substituir todo o conteúdo de `src/app/api/dashboard/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'

const DIAS_PARADO = 60

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') || new Date().toISOString().slice(0, 7)
  const fornecedorFiltro = searchParams.get('fornecedor')?.trim()

  const [ano, mesNum] = mes.split('-').map(Number)
  const inicio = new Date(ano, mesNum - 1, 1)
  const fim = new Date(ano, mesNum, 0, 23, 59, 59)

  const whereCompras: Record<string, unknown> = { dataCompra: { gte: inicio, lte: fim } }
  if (fornecedorFiltro) whereCompras.fornecedor = { contains: fornecedorFiltro, mode: 'insensitive' }

  const compras = await db.compra.findMany({ where: whereCompras })

  const gastoTotal = compras.reduce((a, c) => a + c.custoTotal, 0)

  const porFornecedor = new Map<string, number>()
  for (const c of compras) porFornecedor.set(c.fornecedor, (porFornecedor.get(c.fornecedor) ?? 0) + c.custoTotal)
  const fornecedores = [...porFornecedor.entries()]
    .map(([fornecedor, total]) => ({ fornecedor, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total)

  const comprasComVariacao = compras.filter(c => c.statusVariacao === 'AUMENTOU > 5%' || c.statusVariacao === 'DIMINUIU > 5%')
  const skusComVariacao = [...new Set(comprasComVariacao.map(c => c.skuPrincipal))]
  const calculosDosSkus = skusComVariacao.length
    ? await db.calculoMulticanal.findMany({
        where: { sku: { in: skusComVariacao } },
        select: { sku: true, nome: true, canaisAtivos: true },
      })
    : []
  const skusComAnuncio = new Set(
    calculosDosSkus
      .filter(c => c.canaisAtivos && Object.values(c.canaisAtivos as Record<string, boolean>).some(Boolean))
      .map(c => c.sku)
  )
  const nomesPorSku = new Map(calculosDosSkus.map(c => [c.sku, c.nome]))
  const produtosPraAjustar = comprasComVariacao
    .filter(c => skusComAnuncio.has(c.skuPrincipal))
    .map(c => ({
      sku: c.skuPrincipal,
      nome: nomesPorSku.get(c.skuPrincipal) ?? c.nomeProduto,
      direcao: c.statusVariacao === 'AUMENTOU > 5%' ? 'aumentou' : 'diminuiu',
      variacaoPct: c.variacaoPct != null ? Math.round(c.variacaoPct * 10000) / 100 : null,
      dataCompra: c.dataCompra,
    }))
    .filter((v, i, arr) => arr.findIndex(x => x.sku === v.sku) === i)

  const produtos = await db.produto.findMany({ where: { status: 'ativo' }, select: { skuPrincipal: true, categoria: true } })
  const categoriaPorSku = new Map(produtos.map(p => [p.skuPrincipal, p.categoria]))
  const todosCalculos = await db.calculoMulticanal.findMany({
    select: { sku: true, custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true },
  })
  const margensPorCategoria = new Map<string, number[]>()
  for (const calc of todosCalculos) {
    const categoria = calc.sku ? categoriaPorSku.get(calc.sku) : null
    if (!categoria) continue
    const ativos = (calc.canaisAtivos ?? {}) as Record<string, boolean>
    const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
    for (const key of Object.keys(ativos)) {
      if (!ativos[key]) continue
      const def = CANAIS_MULTICANAL.find(d => d.key === key)
      const cfg = canaisCfg[key]
      if (!def || !cfg) continue
      const r = calcularCanalModoPreco({
        custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
        pesoGramas: calc.pesoGramas, canal: cfg as any, def, shAuto: true,
      })
      if (!r) continue
      if (!margensPorCategoria.has(categoria)) margensPorCategoria.set(categoria, [])
      margensPorCategoria.get(categoria)!.push(r.margem)
    }
  }
  const porCategoria = [...margensPorCategoria.entries()]
    .map(([categoria, margens]) => ({
      categoria,
      margemMedia: Math.round((margens.reduce((a, m) => a + m, 0) / margens.length) * 10000) / 100,
      n: margens.length,
    }))
    .sort((a, b) => b.margemMedia - a.margemMedia)

  const limite = new Date()
  limite.setDate(limite.getDate() - DIAS_PARADO)
  const produtosParados = await db.produto.findMany({
    where: { status: 'ativo', OR: [{ dataUltimaCompra: { lt: limite } }, { dataUltimaCompra: null }] },
    select: { skuPrincipal: true, nome: true, dataUltimaCompra: true },
    orderBy: { dataUltimaCompra: 'asc' },
    take: 30,
  })

  return NextResponse.json({
    mes, fornecedorFiltro: fornecedorFiltro ?? null,
    gastoTotal: Math.round(gastoTotal * 100) / 100,
    totalCompras: compras.length,
    fornecedores, produtosPraAjustar, porCategoria, produtosParados,
  })
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit`
Expected: sem erros em `src/app/api/dashboard/route.ts` (a página `src/app/page.tsx` vai dar erro de tipo até a Task 2 — esperado, não corrigir aqui).

Run (com `npm run dev` ativo, logado como admin): `curl "http://localhost:3001/api/dashboard?mes=2026-07"` — confirmar que responde 200 com as chaves `gastoTotal`, `produtosPraAjustar`, `porCategoria`, `fornecedores`, `produtosParados`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/dashboard/route.ts
git commit -m "Dashboard: nova API focada em gestao interna (compras, ajuste de preco, categoria, fornecedor, parados)"
```

---

### Task 2: Dashboard — nova página

**Contexto:** A página consome a nova API da Task 1. Sai todo o bloco de margem/marketplace, entram filtro por mês/fornecedor e os 5 blocos novos.

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/dashboard?mes=...&fornecedor=...` (Task 1).

- [ ] **Step 1: Substituir o conteúdo da página**

Substituir todo o conteúdo de `src/app/page.tsx`:

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, TrendingDown, TrendingUp, ShoppingCart, AlertTriangle, PackageX, Building2 } from 'lucide-react'
import { Spinner } from '@/components/ui'
import Link from 'next/link'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'
const pct = (v?: number | null) => v != null ? `${v.toFixed(1)}%` : '—'
const fmtData = (v?: string | null) => v ? new Date(v).toLocaleDateString('pt-BR') : '—'

interface DashData {
  mes: string
  fornecedorFiltro: string | null
  gastoTotal: number
  totalCompras: number
  fornecedores: { fornecedor: string; total: number }[]
  produtosPraAjustar: { sku: string; nome: string; direcao: string; variacaoPct: number | null; dataCompra: string }[]
  porCategoria: { categoria: string; margemMedia: number; n: number }[]
  produtosParados: { skuPrincipal: string; nome: string; dataUltimaCompra: string | null }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lotesVencendo, setLotesVencendo] = useState<number | null>(null)
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [fornecedor, setFornecedor] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ mes })
    if (fornecedor) params.set('fornecedor', fornecedor)
    const [r, rLotes] = await Promise.all([
      fetch('/api/dashboard?' + params),
      fetch('/api/lotes?vencendo=1'),
    ])
    setData(await r.json())
    const lotes = await rLotes.json()
    setLotesVencendo(Array.isArray(lotes) ? lotes.length : 0)
    setLoading(false)
  }, [mes, fornecedor])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Compras, custos e decisões — preço de marketplace fica no Multicanal RdB</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="inp-sm w-auto" value={mes} onChange={e => setMes(e.target.value)} />
          <input className="inp-sm w-40" placeholder="Filtrar fornecedor…" value={fornecedor} onChange={e => setFornecedor(e.target.value)} />
          <button onClick={load} className="btn-ghost gap-1.5" disabled={loading}>
            {loading ? <Spinner size={14} /> : <RefreshCw size={14} />} Atualizar
          </button>
        </div>
      </div>

      {!!lotesVencendo && (
        <Link href="/lotes" className="block bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          <strong>{lotesVencendo}</strong> {lotesVencendo === 1 ? 'lote está vencido ou vence' : 'lotes estão vencidos ou vencem'} nos próximos 30 dias — clique para ver.
        </Link>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Gasto com compras" value={brl(data?.gastoTotal)} sub={`${data?.totalCompras ?? 0} compras no mês`} icon={ShoppingCart} color="indigo" />
        <StatCard title="Produtos pra ajustar preço" value={data?.produtosPraAjustar.length ?? '—'} sub="custo mudou e tem anúncio ativo" icon={AlertTriangle} color="amber" />
        <StatCard title="Produtos parados" value={data?.produtosParados.length ?? '—'} sub="sem compra recente" icon={PackageX} color="blue" />
        <StatCard title="Fornecedor principal" value={data?.fornecedores[0]?.fornecedor ?? '—'} sub={data?.fornecedores[0] ? brl(data.fornecedores[0].total) : ''} icon={Building2} color="emerald" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" /> Produtos que provavelmente precisam de ajuste de preço
            </h2>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead className="tbl-head sticky top-0">
                <tr><th className="th">Produto</th><th className="th text-center">Custo</th><th className="th-r">Variação</th><th className="th-r">Data</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm"><Spinner size={16} className="inline" /></td></tr>}
                {!loading && !data?.produtosPraAjustar.length && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">Nenhum produto sinalizado 🎉</td></tr>}
                {data?.produtosPraAjustar.map((p, i) => (
                  <tr key={i} className="tr-row">
                    <td className="td">
                      <div className="font-medium text-gray-800 text-xs truncate max-w-[160px]">{p.nome}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{p.sku}</div>
                    </td>
                    <td className="td text-center">
                      {p.direcao === 'aumentou'
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><TrendingUp size={12} /> subiu</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><TrendingDown size={12} /> caiu</span>}
                    </td>
                    <td className="td-r text-xs font-semibold">{p.variacaoPct != null ? pct(Math.abs(p.variacaoPct)) : '—'}</td>
                    <td className="td-r text-xs text-gray-400">{fmtData(p.dataCompra)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="section-title">Fornecedores no período</h2>
            <span className="text-xs text-gray-400">{data?.fornecedores.length ?? 0} fornecedores</span>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead className="tbl-head sticky top-0">
                <tr><th className="th">Fornecedor</th><th className="th-r">Total gasto</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={2} className="py-8 text-center"><Spinner size={16} className="mx-auto" /></td></tr>}
                {!loading && !data?.fornecedores.length && <tr><td colSpan={2} className="py-8 text-center text-gray-400 text-sm">Nenhuma compra no período</td></tr>}
                {data?.fornecedores.map((f, i) => (
                  <tr key={i} className="tr-row">
                    <td className="td text-sm">{f.fornecedor}</td>
                    <td className="td-r text-sm font-semibold">{brl(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card p-4">
          <h2 className="section-title mb-3">Margem média por categoria</h2>
          {!data?.porCategoria.length ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum produto anunciado ainda</p>
          ) : (
            <div className="space-y-2">
              {data.porCategoria.map(c => (
                <div key={c.categoria} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-28 truncate">{c.categoria}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min(Math.max(c.margemMedia, 0) * 100 / 35, 100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-14 text-right tabular-nums">{pct(c.margemMedia)}</span>
                  <span className="text-xs text-gray-400 w-16 text-right">{c.n} canais</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <PackageX size={13} className="text-gray-400" /> Produtos sem compra recente
          </h2>
          {!data?.produtosParados.length ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum produto parado</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto">
              {data.produtosParados.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="font-medium text-gray-800">{p.nome}</span>
                    <span className="text-xs text-gray-400 ml-2">#{p.skuPrincipal}</span>
                  </div>
                  <span className="text-xs text-gray-400">{p.dataUltimaCompra ? `última: ${fmtData(p.dataUltimaCompra)}` : 'nunca comprado'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, sub, icon: Icon, color }: { title: string; value: unknown; sub?: string; icon: React.ElementType; color: string }) {
  const colors: Record<string, string> = { indigo: 'bg-indigo-50 text-indigo-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', blue: 'bg-blue-50 text-blue-600' }
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 truncate">{title}</p>
          <p className="stat-value mt-1 text-gray-900 truncate">{String(value)}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${colors[color]} shrink-0`}><Icon size={16} /></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 3: Verificar ao vivo**

Com `npm run dev`: abrir `/`, confirmar que os 4 cartões de estatística, os produtos-pra-ajustar, fornecedores, margem por categoria e produtos parados aparecem com dado real. Testar o filtro de mês (trocar pra um mês sem compras, confirmar que mostra "Nenhuma compra no período") e o filtro de fornecedor.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "Dashboard: nova pagina focada em gestao interna"
```

---

### Task 3: Repontar Variações

**Files:**
- Modify: `src/app/api/variacoes/route.ts`
- Modify: `src/app/variacoes/page.tsx`

**Interfaces:**
- Produces: `GET /api/variacoes` → cada item ganha `precosAnunciados: [{ canal: string, preco: number | null }]` no lugar de `precificacoes`.

- [ ] **Step 1: Repontar a rota**

Em `src/app/api/variacoes/route.ts`, adicionar o import e trocar a função `GET` inteira. Trocar:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcCustoVariacao, round2 } from '@/lib/calculos'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const skuPrincipal = searchParams.get('skuPrincipal')
  const q = searchParams.get('q')

  const where: Record<string, unknown> = {}
  if (skuPrincipal) where.skuPrincipal = skuPrincipal
  if (q) where.OR = [{ skuVariacao: { contains: q, mode: 'insensitive' } }, { nomeVariacao: { contains: q, mode: 'insensitive' } }]

  const variacoes = await db.variacao.findMany({
    where,
    include: {
      produto: { select: { nome: true, custoPorKg: true, custoUnitario: true, tipoPrecificacao: true, categoria: true } },
      precificacoes: { include: { plataforma: true } },
    },
    orderBy: [{ skuPrincipal: 'asc' }, { pesoGramas: 'asc' }],
  })
  return NextResponse.json(variacoes)
}
```

por:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcCustoVariacao, round2 } from '@/lib/calculos'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'

const ROTULOS: Record<string, string> = { lp: 'Loja Própria', mlFull: 'ML FULL', mlClassico: 'ML Clássico', sh: 'Shopee', tt: 'TikTok' }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const skuPrincipal = searchParams.get('skuPrincipal')
  const q = searchParams.get('q')

  const where: Record<string, unknown> = {}
  if (skuPrincipal) where.skuPrincipal = skuPrincipal
  if (q) where.OR = [{ skuVariacao: { contains: q, mode: 'insensitive' } }, { nomeVariacao: { contains: q, mode: 'insensitive' } }]

  const variacoes = await db.variacao.findMany({
    where,
    include: {
      produto: { select: { nome: true, custoPorKg: true, custoUnitario: true, tipoPrecificacao: true, categoria: true } },
    },
    orderBy: [{ skuPrincipal: 'asc' }, { pesoGramas: 'asc' }],
  })

  const skusVariacao = variacoes.map(v => v.skuVariacao)
  const calculos = skusVariacao.length
    ? await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: skusVariacao } },
        select: { skuVariacao: true, custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true },
      })
    : []
  const porSku = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

  const resposta = variacoes.map(v => {
    const calc = porSku.get(v.skuVariacao)
    const precosAnunciados: { canal: string; preco: number | null }[] = []
    if (calc) {
      const ativos = (calc.canaisAtivos ?? {}) as Record<string, boolean>
      const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
      for (const key of Object.keys(ativos)) {
        if (!ativos[key]) continue
        const def = CANAIS_MULTICANAL.find(d => d.key === key)
        const cfg = canaisCfg[key]
        if (!def || !cfg) continue
        const r = calcularCanalModoPreco({
          custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
          pesoGramas: calc.pesoGramas, canal: cfg as any, def, shAuto: true,
        })
        precosAnunciados.push({ canal: ROTULOS[key] ?? key, preco: r ? r.preco : null })
      }
    }
    return { ...v, precosAnunciados }
  })

  return NextResponse.json(resposta)
}
```

(a função `POST` que vem depois no arquivo não muda — manter como está)

- [ ] **Step 2: Atualizar a interface e a exibição na página**

Em `src/app/variacoes/page.tsx`, trocar a interface (linha ~9-15):

```ts
interface Variacao {
  id: string; skuVariacao: string; skuPrincipal: string; nomeVariacao: string
  pesoGramas: number | null; fatorConversao: number | null; custoCalculado: number | null
  custoAdicional: number; custoTotal: number | null; embalagem: string | null; status: string
  produto: { nome: string; custoPorKg: number | null; tipoPrecificacao: string; categoria: string }
  precificacoes: { id: string; precoIdeal: number | null; statusMargem: string | null; plataforma: { nome: string; slug: string; corHex: string } }[]
}
```

por:

```ts
interface Variacao {
  id: string; skuVariacao: string; skuPrincipal: string; nomeVariacao: string
  pesoGramas: number | null; fatorConversao: number | null; custoCalculado: number | null
  custoAdicional: number; custoTotal: number | null; embalagem: string | null; status: string
  produto: { nome: string; custoPorKg: number | null; tipoPrecificacao: string; categoria: string }
  precosAnunciados: { canal: string; preco: number | null }[]
}
```

Trocar o bloco de exibição da coluna "Preços" (linha ~99-108):

```tsx
                <td className="td">
                  <div className="flex gap-1 flex-wrap">
                    {v.precificacoes.map(p => (
                      <span key={p.id} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium"
                        style={{ backgroundColor: p.plataforma.corHex + '20', color: p.plataforma.corHex }}>
                        {p.plataforma.slug.toUpperCase()} {p.precoIdeal ? brl(p.precoIdeal) : '?'}
                      </span>
                    ))}
                    {!v.precificacoes.length && <span className="text-xs text-gray-300">sem preço</span>}
                  </div>
                </td>
```

por:

```tsx
                <td className="td">
                  <div className="flex gap-1 flex-wrap">
                    {v.precosAnunciados.map((p, i) => (
                      <span key={i} className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-50 text-indigo-700">
                        {p.canal} {p.preco != null ? brl(p.preco) : '?'}
                      </span>
                    ))}
                    {!v.precosAnunciados.length && <span className="text-xs text-gray-300">sem anúncio</span>}
                  </div>
                </td>
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 4: Verificar ao vivo**

Com `npm run dev`: abrir `/variacoes`, confirmar que a coluna "Preços" mostra os canais anunciados (ou "sem anúncio" quando nenhum) pros produtos que já têm registro no Multicanal RdB.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/variacoes/route.ts src/app/variacoes/page.tsx
git commit -m "Repontar Variacoes para ler precos anunciados do CalculoMulticanal"
```

---

### Task 4: Repontar Busca

**Files:**
- Modify: `src/app/api/busca/route.ts`
- Modify: `src/app/busca/page.tsx`

**Interfaces:**
- Produces: `GET /api/busca?q=...` → cada `variacao` ganha `canaisAnunciados: [{ canal, nome, cor, precoIdeal, precoPromocional, margem, statusMargem }]` no lugar de `precificacoes`.

- [ ] **Step 1: Repontar a rota**

Substituir todo o conteúdo de `src/app/api/busca/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'
import { statusMargem } from '@/lib/calculos'

const ROTULOS: Record<string, string> = { lp: 'Loja Própria', mlFull: 'Mercado Livre FULL', mlClassico: 'Mercado Livre Clássico', sh: 'Shopee', tt: 'TikTok Shop' }
const CORES: Record<string, string> = { lp: '#055E2B', mlFull: '#FFE600', mlClassico: '#FFE600', sh: '#EE4D2D', tt: '#111111' }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ results: [] })

  const produtos = await db.produto.findMany({
    where: {
      OR: [
        { skuPrincipal: { contains: q, mode: 'insensitive' } },
        { nome: { contains: q, mode: 'insensitive' } },
        { variacoes: { some: { skuVariacao: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    include: {
      variacoes: { orderBy: { pesoGramas: 'asc' } },
      compras: { orderBy: { dataCompra: 'desc' }, take: 3 },
    },
    take: 10,
  })

  const skusVariacao = produtos.flatMap(p => p.variacoes.map(v => v.skuVariacao))
  const calculos = skusVariacao.length
    ? await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: skusVariacao } },
        select: { skuVariacao: true, custoProduto: true, pesoGramas: true, despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true },
      })
    : []
  const porSku = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

  const results = produtos.map(produto => ({
    ...produto,
    variacoes: produto.variacoes.map(v => {
      const calc = porSku.get(v.skuVariacao)
      const canaisAnunciados: { canal: string; nome: string; cor: string; precoIdeal: number | null; precoPromocional: number | null; margem: number | null; statusMargem: string }[] = []
      if (calc) {
        const ativos = (calc.canaisAtivos ?? {}) as Record<string, boolean>
        const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
        for (const key of Object.keys(ativos)) {
          if (!ativos[key]) continue
          const def = CANAIS_MULTICANAL.find(d => d.key === key)
          const cfg = canaisCfg[key]
          if (!def || !cfg) continue
          const r = calcularCanalModoPreco({
            custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
            pesoGramas: calc.pesoGramas, canal: cfg as any, def, shAuto: true,
          })
          canaisAnunciados.push({
            canal: key, nome: ROTULOS[key] ?? key, cor: CORES[key] ?? '#666',
            precoIdeal: r ? r.preco : null,
            precoPromocional: r ? Math.round(r.preco * 1.4 * 100) / 100 : null,
            margem: r ? r.margem : null,
            statusMargem: r ? statusMargem(r.margem) : 'SEM_PRECO',
          })
        }
      }
      return { ...v, canaisAnunciados }
    }),
  }))

  return NextResponse.json({ results })
}
```

- [ ] **Step 2: Atualizar a interface e a exibição na página**

Em `src/app/busca/page.tsx`, trocar a interface `ProdResult` (linhas 9-20):

```ts
interface ProdResult {
  skuPrincipal: string; nome: string; categoria: string; custoAtualizado: number | null
  dataUltimaCompra: string | null; fornecedorPrincipal: string | null
  variacoes: {
    id: string; skuVariacao: string; nomeVariacao: string; pesoGramas: number | null; custoTotal: number | null
    precificacoes: {
      id: string; precoAtual: number | null; precoMinimo: number | null; precoIdeal: number | null; precoMaximo: number | null; precoPromocional: number | null; margemAtual: number | null; statusMargem: string | null; custoTotalCalc: number | null; comissaoPct: number; impostoPct: number
      plataforma: { nome: string; slug: string; corHex: string }
    }[]
  }[]
  compras: { id: string; dataCompra: string; custoUnitario: number; fornecedor: string; statusVariacao: string | null }[]
}
```

por:

```ts
interface ProdResult {
  skuPrincipal: string; nome: string; categoria: string; custoAtualizado: number | null
  dataUltimaCompra: string | null; fornecedorPrincipal: string | null
  variacoes: {
    id: string; skuVariacao: string; nomeVariacao: string; pesoGramas: number | null; custoTotal: number | null
    canaisAnunciados: { canal: string; nome: string; cor: string; precoIdeal: number | null; precoPromocional: number | null; margem: number | null; statusMargem: string | null }[]
  }[]
  compras: { id: string; dataCompra: string; custoUnitario: number; fornecedor: string; statusVariacao: string | null }[]
}
```

Trocar o bloco "Preços por plataforma" inteiro (linhas ~109-152):

```tsx
              {/* Preços por plataforma */}
              {expanded.has(v.id) && (
                <div className="bg-gray-50 px-4 pb-3">
                  {v.precificacoes.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3">Sem precificação cadastrada</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {v.precificacoes.map(p => (
                        <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.plataforma.corHex }} />
                              <span className="text-xs font-bold text-gray-700">{p.plataforma.nome}</span>
                            </div>
                            <StatusBadge status={p.statusMargem ?? 'SEM_PRECO'} />
                          </div>
                          {/* Price grid */}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                            {[
                              ['Custo total', brl(p.custoTotalCalc), false],
                              ['Preço atual', brl(p.precoAtual), !!p.precoAtual],
                              ['Margem atual', pct(p.margemAtual), false],
                              ['Comissão', pct(p.comissaoPct), false],
                            ].map(([k, v, bold]) => (
                              <div key={String(k)}>
                                <p className="text-[10px] text-gray-400">{k}</p>
                                <p className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{v}</p>
                              </div>
                            ))}
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-gray-100 grid grid-cols-3 gap-1 text-center">
                            {[['Mínimo', p.precoMinimo, 'text-amber-600'], ['Ideal ★', p.precoIdeal, 'text-indigo-600'], ['Promoção', p.precoPromocional, 'text-purple-600']].map(([label, val, cls]) => (
                              <div key={String(label)}>
                                <p className="text-[10px] text-gray-400">{label}</p>
                                <p className={`text-xs font-bold ${cls}`}>{brl(val as number | null)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
```

por:

```tsx
              {/* Canais anunciados */}
              {expanded.has(v.id) && (
                <div className="bg-gray-50 px-4 pb-3">
                  {v.canaisAnunciados.length === 0 ? (
                    <p className="text-xs text-gray-400 py-3">Nenhum canal anunciado</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {v.canaisAnunciados.map(c => (
                        <div key={c.canal} className="bg-white rounded-xl border border-gray-200 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.cor }} />
                              <span className="text-xs font-bold text-gray-700">{c.nome}</span>
                            </div>
                            <StatusBadge status={c.statusMargem ?? 'SEM_PRECO'} />
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                            <div><p className="text-[10px] text-gray-400">Margem</p><p className="text-sm text-gray-700">{pct(c.margem)}</p></div>
                            <div><p className="text-[10px] text-gray-400">Preço ideal</p><p className="text-sm font-bold text-indigo-600">{brl(c.precoIdeal)}</p></div>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-gray-100 text-center">
                            <p className="text-[10px] text-gray-400">Preço promocional</p>
                            <p className="text-xs font-bold text-purple-600">{brl(c.precoPromocional)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
```

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 4: Verificar ao vivo**

Com `npm run dev`: abrir `/busca`, buscar um produto que já tenha canal anunciado, expandir a variação, confirmar que mostra os canais certos com preço/margem/status.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/busca/route.ts src/app/busca/page.tsx
git commit -m "Repontar Busca para ler canais anunciados do CalculoMulticanal"
```

---

### Task 5: Repontar Exportar XLSX

**Files:**
- Modify: `src/app/api/exportar/route.ts`

- [ ] **Step 1: Reescrever a rota**

Substituir todo o conteúdo de `src/app/api/exportar/route.ts`:

```ts
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'
import { statusMargem } from '@/lib/calculos'

const ROTULOS: Record<string, string> = { lp: 'Loja Própria', mlFull: 'Mercado Livre FULL', mlClassico: 'Mercado Livre Clássico', sh: 'Shopee', tt: 'TikTok Shop' }

export async function GET() {
  const calculos = await db.calculoMulticanal.findMany({
    where: { skuVariacao: { not: null } },
    orderBy: [{ sku: 'asc' }, { variacao: 'asc' }],
  })

  const rows: Record<string, unknown>[] = []
  for (const calc of calculos) {
    const ativos = (calc.canaisAtivos ?? {}) as Record<string, boolean>
    const canaisCfg = (calc.canais ?? {}) as Record<string, Record<string, number>>
    for (const key of Object.keys(ativos)) {
      if (!ativos[key]) continue
      const def = CANAIS_MULTICANAL.find(d => d.key === key)
      const cfg = canaisCfg[key]
      if (!def || !cfg) continue
      const r = calcularCanalModoPreco({
        custoProduto: calc.custoProduto, despVarPct: calc.despesasVariaveisPct, despFixPct: calc.despesasFixasPct,
        pesoGramas: calc.pesoGramas, canal: cfg as any, def, shAuto: true,
      })
      rows.push({
        'SKU Variação':      calc.skuVariacao,
        'SKU Principal':     calc.sku ?? '',
        'Produto':           calc.nome,
        'Variação':          calc.variacao,
        'Peso (g)':          calc.pesoGramas ?? '',
        'Plataforma':        ROTULOS[key] ?? key,
        'Custo Produto R$':  calc.custoProduto.toFixed(2),
        'Embalagem R$':      cfg.emb != null ? cfg.emb.toFixed(2) : '',
        'Comissão %':        cfg.com != null ? `${cfg.com.toFixed(1)}%` : '',
        'Preço Ideal R$':    r ? r.preco.toFixed(2) : '',
        'Preço Promoção R$': r ? (Math.round(r.preco * 1.4 * 100) / 100).toFixed(2) : '',
        'Margem %':          r ? `${(r.margem * 100).toFixed(1)}%` : '',
        'Status Margem':     r ? statusMargem(r.margem) : 'SEM_PRECO',
      })
    }
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [12,12,28,16,8,20,14,10,10,12,14,10,14].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws, 'Precificação')

  const compras = await db.compra.findMany({ orderBy: { dataCompra: 'desc' }, take: 500 })
  const rowsC = compras.map(c => ({
    'Data':              new Date(c.dataCompra).toLocaleDateString('pt-BR'),
    'SKU':               c.skuPrincipal,
    'Produto':           c.nomeProduto,
    'Fornecedor':        c.fornecedor,
    'Quantidade':        c.quantidade,
    'Custo Total R$':    c.custoTotal.toFixed(2),
    'Custo Unitário R$': c.custoUnitario.toFixed(2),
    'Anterior R$':       c.custoAnterior?.toFixed(2) ?? '',
    'Variação %':        c.variacaoPct != null ? `${(c.variacaoPct * 100).toFixed(1)}%` : '',
    'Status Variação':   c.statusVariacao ?? '',
    'Preço Venda R$':    c.precoVenda?.toFixed(2) ?? '',
    'Margem %':          c.margem != null ? `${(c.margem * 100).toFixed(1)}%` : '',
    'Status Financeiro': c.statusFinanceiro ?? '',
    'Fonte':             c.fonte,
  }))
  const wsC = XLSX.utils.json_to_sheet(rowsC)
  XLSX.utils.book_append_sheet(wb, wsC, 'Compras')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="precify_export_${new Date().toISOString().slice(0,10)}.xlsx"`,
    },
  })
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 3: Verificar ao vivo**

Com `npm run dev` e logado: baixar `/api/exportar`, abrir o XLSX, confirmar que a aba "Precificação" tem uma linha por SKU×canal anunciado com os valores certos, e a aba "Compras" continua igual.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/exportar/route.ts
git commit -m "Repontar Exportar XLSX para ler do CalculoMulticanal"
```

---

### Task 6: Remover importação de planilha de precificação

**Contexto:** A usuária confirmou que não usa essa função. Fica só a importação de compras.

**Files:**
- Modify: `src/app/api/importar/route.ts`

- [ ] **Step 1: Substituir o conteúdo da rota**

Substituir todo o conteúdo de `src/app/api/importar/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { saveCompra } from '@/lib/saveCompra'

function parseExcelDate(v: unknown): Date | null {
  if (!v) return null
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

function n(v: unknown, fallback = 0): number {
  const p = parseFloat(String(v ?? ''))
  return isNaN(p) ? fallback : p
}

function s(v: unknown): string {
  return String(v ?? '').trim()
}

// ─── Importar CONTROLE_DE_COMPRAS ────────────────────────────
async function importarCompras(wb: XLSX.WorkBook) {
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('compra')) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  let importados = 0
  const erros: string[] = []
  const avisos: string[] = []
  const custosAtualizados = new Set<string>()

  for (const row of rows) {
    try {
      const skuRaw   = s(row['SKU'] ?? row['Sku'] ?? '')
      const produto  = s(row['Produto'] ?? row['produto'] ?? '')
      const fornec   = s(row['Fornecedor'] ?? row['fornecedor'] ?? '')
      const qtd      = n(row['Quantidade'] ?? row['quantidade'])
      const custoT   = n(row['Custo_total'] ?? row['CustoTotal'] ?? row['Custo total'])
      const frete    = n(row['Frete'] ?? row['frete'])
      const outros   = n(row['Outros_custos'] ?? row['OutrosCustos'])
      const pVenda   = n(row['Preço de Venda'] ?? row['preco_venda'] ?? 0) || null
      const imposto  = n(row['Imposto'] ?? row['imposto'] ?? 0.0829)

      const dataRaw  = row['Data_compra'] ?? row['Data'] ?? row['data_compra']
      const dataCompra = parseExcelDate(dataRaw) ?? new Date()

      if (!skuRaw || !produto || !qtd || !custoT) {
        if (skuRaw) avisos.push(`Linha ignorada (dados incompletos): SKU=${skuRaw}`)
        continue
      }

      await saveCompra({
        dataCompra: dataCompra.toISOString(),
        skuPrincipal: skuRaw,
        nomeProduto: produto,
        fornecedor: fornec,
        quantidade: qtd,
        custoTotal: custoT,
        frete, outrosCustos: outros,
        precoVenda: pVenda,
        impostoPct: imposto > 1 ? imposto / 100 : imposto,
        fonte: 'xlsx',
      })

      custosAtualizados.add(skuRaw)
      importados++
    } catch (e) {
      erros.push(String(e))
    }
  }

  return { importados, erros, avisos, custosAtualizados: custosAtualizados.size }
}

// ─── Handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: false })

  const resultado = await importarCompras(wb) as Record<string, unknown>
  resultado.tipo = 'compras'
  resultado.mensagem = `${resultado.importados} compras importadas. Custos de ${resultado.custosAtualizados} produtos atualizados automaticamente.`

  return NextResponse.json(resultado)
}
```

- [ ] **Step 2: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

Run: `grep -rn "importarPrecificacao\|hasPrecificacao" src`
Expected: nenhuma ocorrência.

- [ ] **Step 3: Verificar ao vivo**

Com `npm run dev`: em `/importar`, subir uma planilha de compras real (ou de teste) e confirmar que ainda funciona normalmente.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/importar/route.ts
git commit -m "Remove importacao de planilha de precificacao (nao utilizada)"
```

---

### Task 7 (executada pelo controlador, não delegada): Remoção final do `Precificacao`

**Contexto:** Só executar depois que as Tasks 1-6 estiverem todas commitadas e testadas ao vivo com sucesso.

- [ ] **Step 1: Backup**

Run: `node scripts/backup-db.js`

- [ ] **Step 2: Confirmar que nada mais referencia `Precificacao`**

Run: `grep -rln "db.precificacao\|Precificacao\b" src prisma/schema.prisma`
Expected: só aparece a definição do model em `schema.prisma`, o bloco de sincronização em `saveCompra.ts` (a remover no próximo step), e as rotas `/api/precificacao` (já removidas na Onda A — não devem aparecer).

- [ ] **Step 3: Remover a sincronização antiga em `saveCompra.ts`**

Em `src/lib/saveCompra.ts`, remover o import de `calcPrecificacaoComFreteML` (mantendo `calcCustoVariacao, round2`) e remover o bloco `for (const prec of v.precificacoes) { ... }` inteiro (o que resta é só a sincronização nova do `CalculoMulticanal`, já feita na Onda A). Remover também `include: { precificacoes: { include: { plataforma: true } } }` da query de `variacoes` no topo da função, já que não é mais necessário.

- [ ] **Step 4: Remover funções mortas de `calculos.ts`**

Rodar, pra cada uma dessas funções, `grep -rn "NOME_DA_FUNCAO" src` e remover de `src/lib/calculos.ts` só as que não têm mais nenhum uso fora da própria definição: `calcPrecificacaoComFreteML`, `calcPrecificacaoCompleta`, `calcPrecoMinimo`, `calcPrecoIdeal`, `calcPrecoMaximo`, `calcPrecoVenda`, `calcMargem`, `calcFreteFlexMLInternal`, `estimarPrecoSemFrete`. Manter `calcCustoVariacao`, `calcCustoTotal`, `calcFreteFullML`, `round2`, `fmtBRL`, `fmtPct`, `fmtDate`, `calcPrecoPromocional`, `statusMargem`, `StatusMargem` (ainda em uso).

- [ ] **Step 5: Remover o model do schema**

Em `prisma/schema.prisma`: remover o model `Precificacao` inteiro, e remover a linha `precificacoes Precificacao[]` dos models `Variacao` e `Plataforma`.

Run: `npx prisma generate`

- [ ] **Step 6: Verificar**

Run: `npx tsc --noEmit` e `npm run build`
Expected: ambos sem erros.

- [ ] **Step 7: Aplicar no banco**

Run: `npx prisma db push`
Expected: confirma a remoção da tabela `Precificacao` (perda de dado esperada e já coberta pelo backup do Step 1).

- [ ] **Step 8: Backup pós-remoção e verificação ao vivo final**

Run: `node scripts/backup-db.js` — confirmar que roda sem erro (prova que o resto do schema está consistente) e que `precificacao` não aparece mais na lista de modelos (vai dar erro se `scripts/backup-db.js` ainda listar `'precificacao'` no array `MODELS` — nesse caso, remover essa entrada do array antes de rodar).

Testar ao vivo: Dashboard, Variações, Busca, Exportar, Multicanal RdB, Parceiro — todos funcionando normalmente.

- [ ] **Step 9: Push e deploy**

```bash
git add -A
git commit -m "Remove model Precificacao e codigo morto associado - unificacao da precificacao concluida"
git push origin main
```

- [ ] **Step 10: Atualizar o ledger**

Anotar em `.superpowers/sdd/progress.md` a conclusão da Onda B e da Unificação da Precificação como um todo.
