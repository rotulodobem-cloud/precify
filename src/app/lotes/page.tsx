'use client'
import { useEffect, useState, useCallback } from 'react'
import { Search, RefreshCw, Tag, Printer } from 'lucide-react'
import { Loading, Empty } from '@/components/ui'
import Link from 'next/link'

const dt = (d: string) => new Date(d).toLocaleDateString('pt-BR')

interface LoteItem {
  id: string; numeroLote: string; geradoAuto: boolean; quantidade: number; dataValidade: string
  compra: { skuPrincipal: string; nomeProduto: string; fornecedor: string; dataCompra: string; numeroNF: string | null; numeroPedido: string | null }
}

function statusValidade(dataValidade: string): 'vencido' | 'vencendo' | 'ok' {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const val = new Date(dataValidade)
  const dias = Math.floor((val.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  if (dias < 0) return 'vencido'
  if (dias <= 30) return 'vencendo'
  return 'ok'
}

export default function LotesPage() {
  const [lotes, setLotes] = useState<LoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    const r = await fetch('/api/lotes?' + params)
    setLotes(await r.json())
    setLoading(false)
  }, [q])

  useEffect(() => { load() }, [load])

  const rowCls: Record<string, string> = { vencido: 'bg-red-50', vencendo: 'bg-amber-50/60', ok: '' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><Tag size={20} className="text-indigo-500" /> Lotes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Rastreabilidade de lote e validade para vigilância sanitária</p>
        </div>
      </div>

      <div className="card p-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-40 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
            placeholder="Buscar por número do lote…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
      </div>

      <div className="card-tight overflow-auto">
        <table className="w-full min-w-[800px]">
          <thead className="tbl-head">
            <tr>
              <th className="th">Produto</th>
              <th className="th">Lote</th>
              <th className="th">Fornecedor</th>
              <th className="th-r">Qtd</th>
              <th className="th">Validade</th>
              <th className="th">Compra</th>
              <th className="th w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <Loading />}
            {!loading && !lotes.length && <Empty msg="Nenhum lote lançado ainda" />}
            {lotes.map(l => {
              const status = statusValidade(l.dataValidade)
              return (
                <tr key={l.id} className={`tr-row ${rowCls[status]}`}>
                  <td className="td">
                    <div className="text-sm font-medium text-gray-800">{l.compra.nomeProduto}</div>
                    <div className="text-xs text-gray-400 font-mono">{l.compra.skuPrincipal}</div>
                  </td>
                  <td className="td">
                    <span className="font-mono text-xs">{l.numeroLote}</span>
                    {l.geradoAuto && <span className="ml-1 text-[10px] text-gray-400">(gerado)</span>}
                  </td>
                  <td className="td text-xs text-gray-600">{l.compra.fornecedor || '—'}</td>
                  <td className="td-r text-xs">{l.quantidade}</td>
                  <td className="td">
                    <span className={`text-xs font-semibold ${status === 'vencido' ? 'text-red-700' : status === 'vencendo' ? 'text-amber-700' : 'text-gray-600'}`}>
                      {dt(l.dataValidade)}
                    </span>
                  </td>
                  <td className="td text-xs text-gray-400">
                    {dt(l.compra.dataCompra)} {(l.compra.numeroNF || l.compra.numeroPedido) && `· NF ${l.compra.numeroNF || l.compra.numeroPedido}`}
                  </td>
                  <td className="td">
                    <Link href={`/lotes/${l.id}/etiqueta`} target="_blank" className="text-gray-300 hover:text-indigo-600 transition-colors">
                      <Printer size={14} />
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
