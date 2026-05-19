'use client'
import { useState, useRef } from 'react'
import { Search, Tag, TrendingUp, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { StatusBadge, Spinner } from '@/components/ui'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'
const pct = (v?: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '—'

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

export default function BuscaPage() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<ProdResult[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const timerRef = useRef<NodeJS.Timeout>()

  const search = async (val: string) => {
    if (val.length < 2) { setResults([]); return }
    setLoading(true)
    const r = await fetch(`/api/busca?q=${encodeURIComponent(val)}`)
    const d = await r.json()
    setResults(d.results ?? [])
    setLoading(false)
  }

  const handleChange = (v: string) => {
    setQ(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(v), 300)
  }

  const toggle = (id: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="page-title">Busca por SKU</h1>
        <p className="text-sm text-gray-500 mt-0.5">Encontre um produto pelo SKU principal ou de variação e veja todos os preços</p>
      </div>

      {/* Search box */}
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <Search size={20} className="text-gray-400 shrink-0" />
          <input
            className="flex-1 text-lg outline-none bg-transparent placeholder:text-gray-300 font-mono"
            placeholder="Digite SKU ou nome… (ex: 242, Psyllium, 134-O250)"
            value={q} onChange={e => handleChange(e.target.value)}
            autoFocus
          />
          {loading && <Spinner size={18} />}
          {q && !loading && <span className="text-xs text-gray-400">{results.length} encontrado(s)</span>}
        </div>
      </div>

      {/* Results */}
      {results.map(prod => (
        <div key={prod.skuPrincipal} className="card overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-gray-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package size={16} className="text-indigo-400" />
              <div>
                <span className="font-bold">{prod.nome}</span>
                <span className="text-gray-400 text-sm ml-2">· {prod.skuPrincipal}</span>
                <span className="text-gray-500 text-xs ml-2">· {prod.categoria}</span>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="text-gray-300">Custo/kg: <span className="text-white font-semibold">{brl(prod.custoAtualizado)}</span></div>
              {prod.fornecedorPrincipal && <div className="text-gray-500 text-xs">{prod.fornecedorPrincipal}</div>}
            </div>
          </div>

          {/* Variações */}
          {prod.variacoes.map(v => (
            <div key={v.id} className="border-b border-gray-100 last:border-0">
              {/* Variação header */}
              <button
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                onClick={() => toggle(v.id)}
              >
                <div className="flex items-center gap-3">
                  <Tag size={13} className="text-indigo-500" />
                  <span className="font-medium text-gray-800 text-sm">{v.nomeVariacao}</span>
                  <span className="text-xs text-gray-400 font-mono">{v.skuVariacao}</span>
                  {v.pesoGramas && <span className="badge-blue text-xs">{v.pesoGramas}g</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">Custo: <span className="font-semibold text-gray-700">{brl(v.custoTotal)}</span></span>
                  {expanded.has(v.id) ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
              </button>

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
            </div>
          ))}

          {/* Últimas compras */}
          {prod.compras.length > 0 && (
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
              <TrendingUp size={12} />
              <span>Últimas compras:</span>
              {prod.compras.slice(0, 3).map(c => (
                <span key={c.id} className="flex items-center gap-1">
                  <span className="font-semibold text-gray-700">{brl(c.custoUnitario)}/kg</span>
                  <span className="text-gray-400">({c.fornecedor}, {new Date(c.dataCompra).toLocaleDateString('pt-BR')})</span>
                  {c.statusVariacao && <StatusBadge status={c.statusVariacao} />}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}

      {!loading && q.length >= 2 && results.length === 0 && (
        <div className="card p-12 text-center text-gray-400">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum produto encontrado para "{q}"</p>
          <p className="text-sm mt-1">Verifique o SKU ou <a href="/produtos" className="text-indigo-600 hover:underline">cadastre o produto</a></p>
        </div>
      )}
    </div>
  )
}
