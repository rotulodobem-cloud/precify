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
  produtosPraAjustar: { sku: string; skuVariacao: string | null; nome: string; direcao: string; fonte: string; desvioPct: number | null; variacaoPct: number | null; dataCompra: string | null }[]
  porCategoria: { categoria: string; margemMedia: number; n: number }[]
  produtosParados: { skuPrincipal: string; nome: string; dataUltimaCompra: string | null }[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lotesVencendo, setLotesVencendo] = useState<number | null>(null)
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7))
  const [fornecedor, setFornecedor] = useState('')
  const [fornecedorDebounced, setFornecedorDebounced] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setFornecedorDebounced(fornecedor), 400)
    return () => clearTimeout(t)
  }, [fornecedor])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ mes })
      if (fornecedorDebounced) params.set('fornecedor', fornecedorDebounced)
      const [r, rLotes] = await Promise.all([
        fetch('/api/dashboard?' + params),
        fetch('/api/lotes?vencendo=1'),
      ])
      if (!r.ok || !rLotes.ok) throw new Error('Falha ao carregar dashboard')
      setData(await r.json())
      const lotes = await rLotes.json()
      setLotesVencendo(Array.isArray(lotes) ? lotes.length : 0)
    } catch {
      setError('Não foi possível carregar os dados do dashboard. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }, [mes, fornecedorDebounced])
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Gasto com compras" value={brl(data?.gastoTotal)} sub={`${data?.totalCompras ?? 0} compras no mês`} icon={ShoppingCart} color="indigo" />
        <StatCard title="Produtos pra ajustar preço" value={data?.produtosPraAjustar.length ?? '—'} sub="preço desatualizado ou custo mudou" icon={AlertTriangle} color="amber" />
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
                <tr><th className="th">Produto</th><th className="th text-center">Ação</th><th className="th-r">Desvio</th><th className="th-r">Origem</th></tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm"><Spinner size={16} className="inline" /></td></tr>}
                {!loading && !data?.produtosPraAjustar.length && <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">Nenhum produto sinalizado 🎉</td></tr>}
                {data?.produtosPraAjustar.map((p, i) => (
                  <tr key={p.skuVariacao ?? `${p.sku}-${i}`} className="tr-row">
                    <td className="td">
                      <div className="font-medium text-gray-800 text-xs truncate max-w-[160px]">{p.nome}</div>
                      <div className="text-[10px] text-gray-400 font-mono">{p.sku}</div>
                    </td>
                    <td className="td text-center">
                      {p.direcao === 'subir'
                        ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600"><TrendingUp size={12} /> subir</span>
                        : <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><TrendingDown size={12} /> baixar</span>}
                    </td>
                    <td className="td-r text-xs font-semibold">
                      {p.fonte === 'preco_praticado' ? pct(p.desvioPct) : pct(p.variacaoPct != null ? Math.abs(p.variacaoPct) : null)}
                    </td>
                    <td className="td-r text-xs text-gray-400">
                      {p.fonte === 'preco_praticado' ? 'preço desatualizado' : fmtData(p.dataCompra)}
                    </td>
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
