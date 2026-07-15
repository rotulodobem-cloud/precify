'use client'
import { useEffect, useState, useCallback } from 'react'
import { Search, RefreshCw, Save } from 'lucide-react'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'

interface LinhaParceiro {
  id: string
  codigoAnuncio: string | null
  precoIdeal: number | null
  precoPromocional: number | null
  plataforma: { nome: string }
  variacao: { skuVariacao: string; nomeVariacao: string; produto: { nome: string; skuPrincipal: string } }
}

const PLATAFORMAS = ['Mercado Livre', 'Shopee', 'TikTok Shop']

export default function ParceiroPage() {
  const [linhas, setLinhas] = useState<LinhaParceiro[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [plataforma, setPlataforma] = useState('')
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (plataforma) params.set('plataforma', plataforma)
    const r = await fetch(`/api/parceiro/precificacao?${params}`)
    const d = await r.json()
    setLinhas(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [q, plataforma])
  useEffect(() => { load() }, [load])

  const salvarCodigo = async (id: string) => {
    setSalvando(s => ({ ...s, [id]: true }))
    await fetch(`/api/parceiro/precificacao/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoAnuncio: edit[id] ?? '' }),
    })
    setSalvando(s => ({ ...s, [id]: false }))
    load()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Anúncios</h1>
        <p className="text-sm text-gray-500 mt-0.5">Preço de venda, preço promocional e código do anúncio por plataforma</p>
      </div>

      <div className="card p-2.5 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-40 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar por SKU ou nome…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="inp-sm w-auto" value={plataforma} onChange={e => setPlataforma(e.target.value)}>
          <option value="">Todas plataformas</option>
          {PLATAFORMAS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
        <span className="text-xs text-gray-400">{linhas.length} anúncios</span>
      </div>

      <div className="card-tight overflow-auto">
        <table className="w-full">
          <thead className="tbl-head"><tr>
            <th className="th">SKU</th><th className="th">Produto</th><th className="th">Variação</th>
            <th className="th">Plataforma</th><th className="th">Código do anúncio</th>
            <th className="th-r">Preço de venda</th><th className="th-r">Preço promocional</th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-6">Carregando…</td></tr>}
            {!loading && linhas.length === 0 && <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-6">Nenhum anúncio encontrado.</td></tr>}
            {linhas.map(l => (
              <tr key={l.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-sm">{l.variacao.skuVariacao}</td>
                <td className="px-3 py-2 text-sm">{l.variacao.produto.nome}</td>
                <td className="px-3 py-2 text-sm">{l.variacao.nomeVariacao || '—'}</td>
                <td className="px-3 py-2 text-sm">{l.plataforma.nome}</td>
                <td className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-1.5">
                    <input
                      className="inp-sm"
                      placeholder="código do anúncio"
                      value={edit[l.id] ?? l.codigoAnuncio ?? ''}
                      onChange={e => setEdit(s => ({ ...s, [l.id]: e.target.value }))}
                    />
                    <button className="btn-icon btn-ghost" disabled={!!salvando[l.id]} onClick={() => salvarCodigo(l.id)}>
                      <Save size={13} />
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2 text-sm text-right font-medium">{brl(l.precoIdeal)}</td>
                <td className="px-3 py-2 text-sm text-right font-medium text-indigo-600">{brl(l.precoPromocional)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
