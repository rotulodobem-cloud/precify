'use client'
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, TrendingUp, Package, ShoppingCart, AlertTriangle, CheckCircle2, XCircle, Tag } from 'lucide-react'
import { StatusBadge, Spinner } from '@/components/ui'
import Link from 'next/link'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'
const pct = (v?: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '—'

interface DashData {
  metricas: { totalProdutos: number; totalVariacoes: number; totalPrecificacoes: number; totalCompras: number; saudavel: number; atencao: number; prejuizo: number; semPreco: number; margemMedia: number }
  alertas: { tipo: string; sku: string; produto: string; plataforma: string; margem: number | null; precoAtual: number | null; precoIdeal: number | null; extra?: string }[]
  comparativo: { sku: string; produto: string; variacao: string; margemML: number | null; margemShopee: number | null; precoIdealML: number | null; precoIdealShopee: number | null; melhor: string }[]
  porPlataforma: { plataforma: string; slug: string; cor: string; media: number | null; total: number }[]
  porCategoria: { categoria: string; media: number; n: number }[]
  custosAlterados: { skuPrincipal: string; nomeProduto: string; custoAnterior: number | null; custoUnitario: number; variacaoPct: number | null }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lotesVencendo, setLotesVencendo] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [r, rLotes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/lotes?vencendo=1'),
    ])
    setData(await r.json())
    const lotes = await rLotes.json()
    setLotesVencendo(Array.isArray(lotes) ? lotes.length : 0)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const m = data?.metricas

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Visão geral de precificação e alertas</p>
        </div>
        <button onClick={load} className="btn-ghost gap-1.5" disabled={loading}>
          {loading ? <Spinner size={14} /> : <RefreshCw size={14} />} Atualizar
        </button>
      </div>

      {!!lotesVencendo && (
        <Link href="/lotes" className="block bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800 hover:bg-amber-100 transition-colors">
          <strong>{lotesVencendo}</strong> {lotesVencendo === 1 ? 'lote está vencido ou vence' : 'lotes estão vencidos ou vencem'} nos próximos 30 dias — clique para ver.
        </Link>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Produtos ativos" value={m?.totalProdutos ?? '—'} sub={`${m?.totalVariacoes ?? 0} variações`} icon={Package} color="indigo" />
        <StatCard title="Margem saudável" value={m?.saudavel ?? '—'} sub={`de ${m?.totalPrecificacoes ?? 0} precificações`} icon={CheckCircle2} color="emerald" />
        <StatCard title="Atenção / Prejuízo" value={`${m?.atencao ?? 0} / ${m?.prejuizo ?? 0}`} sub="requerem revisão" icon={AlertTriangle} color="amber" />
        <StatCard title="Margem média" value={pct(m?.margemMedia)} sub={`${m?.totalCompras ?? 0} compras registradas`} icon={TrendingUp} color="blue" />
      </div>

      {/* Barra de distribuição de margem */}
      {m && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Distribuição de margem — {m.totalPrecificacoes} precificações</p>
          <div className="flex h-5 rounded-full overflow-hidden gap-0.5">
            {[
              { n: m.saudavel,  cls: 'bg-emerald-500', label: 'Saudável' },
              { n: m.atencao,   cls: 'bg-amber-400',   label: 'Atenção' },
              { n: m.prejuizo,  cls: 'bg-red-500',     label: 'Prejuízo' },
              { n: m.semPreco,  cls: 'bg-gray-200',    label: 'Sem preço' },
            ].map(b => {
              const pct2 = m.totalPrecificacoes ? (b.n / m.totalPrecificacoes) * 100 : 0
              return pct2 > 0 ? (
                <div key={b.label} title={`${b.label}: ${b.n} (${pct2.toFixed(0)}%)`}
                  className={`${b.cls} transition-all`} style={{ width: `${pct2}%` }} />
              ) : null
            })}
          </div>
          <div className="flex items-center gap-4 mt-2">
            {[['bg-emerald-500', 'Saudável', m.saudavel], ['bg-amber-400', 'Atenção', m.atencao], ['bg-red-500', 'Prejuízo', m.prejuizo], ['bg-gray-200', 'Sem preço', m.semPreco]].map(([cls, label, n]) => (
              <div key={String(label)} className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className={`w-2.5 h-2.5 rounded-full ${cls}`} />
                {label}: <span className="font-semibold text-gray-700">{n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Alertas */}
        <div className="card">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" /> Alertas ativos
            </h2>
            <Link href="/precificacao?status=PREJUIZO" className="text-xs text-indigo-600 hover:underline">Ver todos →</Link>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead className="tbl-head sticky top-0">
                <tr>
                  <th className="th">Produto</th>
                  <th className="th">Plataforma</th>
                  <th className="th-r">Margem</th>
                  <th className="th-r">Ideal</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm"><Spinner size={16} className="inline" /></td></tr>}
                {!loading && (!data?.alertas.length) && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">Nenhum alerta 🎉</td></tr>}
                {data?.alertas.map((a, i) => (
                  <tr key={i} className="tr-row">
                    <td className="td">
                      <div className="font-medium text-gray-800 text-xs truncate max-w-[150px]">{a.produto}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{a.sku}</div>
                    </td>
                    <td className="td text-xs text-gray-500">{a.plataforma || a.extra || '—'}</td>
                    <td className="td-r">
                      {a.margem != null ? (
                        <span className={`text-xs font-semibold ${a.margem < 0.20 ? 'text-red-600' : 'text-amber-600'}`}>{pct(a.margem)}</span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="td-r text-xs font-semibold text-indigo-600">{brl(a.precoIdeal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comparativo ML × Shopee */}
        <div className="card">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="section-title">Comparativo ML × Shopee</h2>
            <span className="text-xs text-gray-400">{data?.comparativo.length ?? 0} SKUs</span>
          </div>
          <div className="overflow-auto max-h-80">
            <table className="w-full">
              <thead className="tbl-head sticky top-0">
                <tr>
                  <th className="th">Produto</th>
                  <th className="th-r">ML</th>
                  <th className="th-r">Shopee</th>
                  <th className="th text-center">Melhor</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="py-8 text-center"><Spinner size={16} className="mx-auto" /></td></tr>}
                {!loading && !data?.comparativo.length && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">Nenhum SKU com ML e Shopee configurados</td></tr>}
                {data?.comparativo.map((c, i) => (
                  <tr key={i} className="tr-row">
                    <td className="td">
                      <div className="text-xs font-medium text-gray-800 truncate max-w-[150px]">{c.produto}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{c.sku}</div>
                    </td>
                    <td className={`td-r text-xs font-semibold ${c.melhor === 'ML' ? 'text-emerald-700' : 'text-gray-500'}`}>
                      {pct(c.margemML)}
                    </td>
                    <td className={`td-r text-xs font-semibold ${c.melhor === 'Shopee' ? 'text-emerald-700' : 'text-gray-500'}`}>
                      {pct(c.margemShopee)}
                    </td>
                    <td className="td text-center">
                      <span className={`badge ${c.melhor === 'ML' ? 'bg-yellow-50 text-yellow-700' : 'bg-orange-50 text-orange-700'}`}>
                        {c.melhor}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Por plataforma */}
        <div className="card p-4">
          <h2 className="section-title mb-3">Margem média por plataforma</h2>
          <div className="space-y-2">
            {data?.porPlataforma.map(p => (
              <div key={p.slug} className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.cor }} />
                <span className="text-sm text-gray-700 w-28 truncate">{p.plataforma}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.min((p.media ?? 0) * 100 / 0.35, 100)}%`, backgroundColor: p.cor }} />
                </div>
                <span className="text-xs font-semibold text-gray-700 w-12 text-right tabular-nums">{pct(p.media)}</span>
                <span className="text-xs text-gray-400 w-14 text-right">{p.total} itens</span>
              </div>
            ))}
          </div>
        </div>

        {/* Custos alterados */}
        <div className="card p-4">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <AlertTriangle size={13} className="text-red-500" /> Custos que aumentaram recentemente
          </h2>
          {!data?.custosAlterados.length ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum custo com aumento &gt; 5% recentemente</p>
          ) : (
            <div className="space-y-2">
              {data.custosAlterados.map((c, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <div>
                    <span className="font-medium text-gray-800">{c.nomeProduto}</span>
                    <span className="text-xs text-gray-400 ml-2">#{c.skuPrincipal}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-400">{brl(c.custoAnterior)} →</span>
                    <span className="text-sm font-semibold text-red-600 ml-1">{brl(c.custoUnitario)}</span>
                    <span className="text-xs text-red-500 ml-1">(+{pct(c.variacaoPct)})</span>
                  </div>
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
          <p className="stat-value mt-1 text-gray-900">{String(value)}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={`p-2 rounded-lg ${colors[color]}`}><Icon size={16} /></div>
      </div>
    </div>
  )
}
