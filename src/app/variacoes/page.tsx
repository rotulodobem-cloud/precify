'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Pencil, Trash2, Search, RefreshCw } from 'lucide-react'
import { Modal, StatusBadge, Loading, Empty, Alert, Spinner } from '@/components/ui'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'

interface Variacao {
  id: string; skuVariacao: string; skuPrincipal: string; nomeVariacao: string
  pesoGramas: number | null; fatorConversao: number | null; custoCalculado: number | null
  custoAdicional: number; custoTotal: number | null; embalagem: string | null; status: string
  produto: { nome: string; custoPorKg: number | null; tipoPrecificacao: string; categoria: string }
  precosAnunciados: { canal: string; preco: number | null }[]
}

const emptyV = { skuVariacao: '', skuPrincipal: '', nomeVariacao: '', pesoGramas: '', custoAdicional: '0', embalagem: '', status: 'ativo' }

function VariacoesContent() {
  const sp = useSearchParams()
  const [vars, setVars] = useState<Variacao[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [skuFiltro] = useState(sp.get('skuPrincipal') ?? '')
  const [modal, setModal] = useState(false); const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ ...emptyV, skuPrincipal: skuFiltro })
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (skuFiltro) params.set('skuPrincipal', skuFiltro)
    const r = await fetch('/api/variacoes?' + params)
    setVars(await r.json()); setLoading(false)
  }, [q, skuFiltro])
  useEffect(() => { load() }, [load])

  const openAdd = () => { setForm({ ...emptyV, skuPrincipal: skuFiltro }); setEditing(null); setError(''); setModal(true) }
  const openEdit = (v: Variacao) => {
    setForm({ skuVariacao: v.skuVariacao, skuPrincipal: v.skuPrincipal, nomeVariacao: v.nomeVariacao, pesoGramas: String(v.pesoGramas ?? ''), custoAdicional: String(v.custoAdicional), embalagem: v.embalagem ?? '', status: v.status })
    setEditing(v.id); setError(''); setModal(true)
  }
  const save = async () => {
    setSaving(true); setError('')
    const r = await fetch(editing ? `/api/variacoes/${editing}` : '/api/variacoes', {
      method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro'); setSaving(false); return }
    setModal(false); load(); setSaving(false)
  }
  const del = async (id: string, sku: string) => {
    if (!confirm(`Excluir variação ${sku}?`)) return
    await fetch(`/api/variacoes/${id}`, { method: 'DELETE' }); load()
  }
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Variações {skuFiltro && <span className="text-indigo-600">— {skuFiltro}</span>}</h1>
          <p className="text-sm text-gray-500 mt-0.5">SKUs de variação por peso ou unidade</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus size={14} /> Nova variação</button>
      </div>

      <div className="card p-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar SKU, nome…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
        <span className="text-xs text-gray-400">{vars.length} variações</span>
      </div>

      <div className="card-tight overflow-auto">
        <table className="w-full min-w-[700px]">
          <thead className="tbl-head"><tr>
            <th className="th">SKU Variação</th><th className="th">Produto</th><th className="th">Nome</th>
            <th className="th-r">Peso (g)</th><th className="th-r">Custo calc.</th><th className="th-r">Adicional</th>
            <th className="th-r">Total</th><th className="th">Preços</th><th className="th text-center">Status</th><th className="th"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <Loading />}
            {!loading && !vars.length && <Empty msg="Nenhuma variação encontrada" />}
            {vars.map(v => (
              <tr key={v.id} className="tr-row">
                <td className="td font-mono text-xs font-bold text-indigo-600">{v.skuVariacao}</td>
                <td className="td text-xs">
                  <div className="font-medium text-gray-800">{v.produto.nome}</div>
                  <div className="text-gray-400 font-mono">{v.skuPrincipal}</div>
                </td>
                <td className="td text-sm">{v.nomeVariacao}</td>
                <td className="td-r text-xs">{v.pesoGramas ?? '—'}</td>
                <td className="td-r text-xs">{brl(v.custoCalculado)}</td>
                <td className="td-r text-xs text-amber-600">{v.custoAdicional > 0 ? `+${brl(v.custoAdicional)}` : '—'}</td>
                <td className="td-r font-semibold">{brl(v.custoTotal)}</td>
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
                <td className="td text-center"><StatusBadge status={v.status} /></td>
                <td className="td">
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => openEdit(v)} className="text-gray-300 hover:text-indigo-600 transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => del(v.id, v.skuVariacao)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={editing ? 'Editar variação' : 'Nova variação'} open={modal} onClose={() => setModal(false)}>
        <div className="space-y-3">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">SKU variação *</label><input className="inp" value={form.skuVariacao} onChange={f('skuVariacao')} disabled={!!editing} placeholder="242-O250" /></div>
            <div><label className="lbl">SKU principal *</label><input className="inp" value={form.skuPrincipal} onChange={f('skuPrincipal')} placeholder="242" /></div>
          </div>
          <div><label className="lbl">Nome da variação *</label><input className="inp" value={form.nomeVariacao} onChange={f('nomeVariacao')} placeholder="Psyllium 250g" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Peso (gramas)</label><input className="inp" type="number" value={form.pesoGramas} onChange={f('pesoGramas')} placeholder="250" /></div>
            <div><label className="lbl">Custo adicional (R$)</label><input className="inp" type="number" step="0.01" value={form.custoAdicional} onChange={f('custoAdicional')} placeholder="0,00" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Embalagem</label><input className="inp" value={form.embalagem} onChange={f('embalagem')} placeholder="Saco kraft 250g" /></div>
            <div><label className="lbl">Status</label><select className="inp" value={form.status} onChange={f('status')}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></div>
          </div>
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2">Custo = (custo/kg × peso) / 1000 + adicional. Calculado automaticamente.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={13} /> : null} {editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function VariacoesPage() { return <Suspense><VariacoesContent /></Suspense> }
