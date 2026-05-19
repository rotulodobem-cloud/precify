'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, RefreshCw, ChevronRight } from 'lucide-react'
import { Modal, StatusBadge, Loading, Empty, Alert, Spinner } from '@/components/ui'
import Link from 'next/link'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'

interface Produto {
  skuPrincipal: string; nome: string; categoria: string; unidadeCompra: string
  custoPorKg: number | null; custoUnitario: number | null; custoAtualizado: number | null
  fornecedorPrincipal: string | null; tipoPrecificacao: string; status: string; observacoes: string | null
  variacoes: { id: string; skuVariacao: string }[]
}

const emptyP = { skuPrincipal: '', nome: '', categoria: 'Geral', unidadeCompra: 'kg', custoPorKg: '', custoUnitario: '', fornecedorPrincipal: '', tipoPrecificacao: 'peso_proporcional', status: 'ativo', observacoes: '' }

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState(''); const [filtroCat, setFiltroCat] = useState('Todas')
  const [modal, setModal] = useState(false); const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(emptyP); const [saving, setSaving] = useState(false); const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/produtos?q=${q}&categoria=${filtroCat === 'Todas' ? '' : filtroCat}`)
    const d = await r.json()
    setProdutos(d.produtos ?? []); setCategorias(d.categorias ?? [])
    setLoading(false)
  }, [q, filtroCat])
  useEffect(() => { load() }, [load])

  const openAdd = () => { setForm(emptyP); setEditing(null); setError(''); setModal(true) }
  const openEdit = (p: Produto) => {
    setForm({ skuPrincipal: p.skuPrincipal, nome: p.nome, categoria: p.categoria, unidadeCompra: p.unidadeCompra, custoPorKg: String(p.custoPorKg ?? ''), custoUnitario: String(p.custoUnitario ?? ''), fornecedorPrincipal: p.fornecedorPrincipal ?? '', tipoPrecificacao: p.tipoPrecificacao, status: p.status, observacoes: p.observacoes ?? '' })
    setEditing(p.skuPrincipal); setError(''); setModal(true)
  }
  const save = async () => {
    setSaving(true); setError('')
    const r = await fetch(editing ? `/api/produtos/${editing}` : '/api/produtos', {
      method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro'); setSaving(false); return }
    setModal(false); load(); setSaving(false)
  }
  const del = async (sku: string) => {
    if (!confirm(`Excluir ${sku} e todas as variações/precificações?`)) return
    await fetch(`/api/produtos/${sku}`, { method: 'DELETE' }); load()
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Produtos</h1><p className="text-sm text-gray-500 mt-0.5">SKUs principais</p></div>
        <button onClick={openAdd} className="btn-primary"><Plus size={14} /> Novo produto</button>
      </div>

      <div className="card p-2.5 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-40 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar por nome, SKU…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="inp-sm w-auto" value={filtroCat} onChange={e => setFiltroCat(e.target.value)}>
          <option value="Todas">Todas categorias</option>
          {categorias.map(c => <option key={c}>{c}</option>)}
        </select>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
        <span className="text-xs text-gray-400">{produtos.length} produtos</span>
      </div>

      <div className="card-tight overflow-auto">
        <table className="w-full">
          <thead className="tbl-head"><tr>
            <th className="th">SKU</th><th className="th">Nome</th><th className="th">Categoria</th>
            <th className="th">Unid.</th><th className="th-r">Custo/kg</th><th className="th">Fornecedor</th>
            <th className="th text-center">Variações</th><th className="th text-center">Status</th><th className="th"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <Loading />}
            {!loading && !produtos.length && <Empty msg="Nenhum produto encontrado" />}
            {produtos.map(p => (
              <tr key={p.skuPrincipal} className="tr-row">
                <td className="td font-mono text-xs font-bold text-indigo-600">{p.skuPrincipal}</td>
                <td className="td font-medium text-gray-800">{p.nome}</td>
                <td className="td text-xs text-gray-500">{p.categoria}</td>
                <td className="td text-xs text-gray-500">{p.unidadeCompra}</td>
                <td className="td-r font-semibold">{brl(p.custoAtualizado)}</td>
                <td className="td text-xs text-gray-500">{p.fornecedorPrincipal ?? '—'}</td>
                <td className="td text-center">
                  <Link href={`/variacoes?skuPrincipal=${p.skuPrincipal}`} className="inline-flex items-center gap-0.5 text-indigo-600 hover:text-indigo-800 text-xs font-medium">
                    {p.variacoes.length} <ChevronRight size={11} />
                  </Link>
                </td>
                <td className="td text-center"><StatusBadge status={p.status} /></td>
                <td className="td">
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => openEdit(p)} className="text-gray-300 hover:text-indigo-600 transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => del(p.skuPrincipal)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title={editing ? 'Editar produto' : 'Novo produto'} open={modal} onClose={() => setModal(false)}>
        <div className="space-y-3">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">SKU Principal *</label><input className="inp" value={form.skuPrincipal} onChange={f('skuPrincipal')} disabled={!!editing} placeholder="242" /></div>
            <div><label className="lbl">Status</label><select className="inp" value={form.status} onChange={f('status')}><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></div>
          </div>
          <div><label className="lbl">Nome *</label><input className="inp" value={form.nome} onChange={f('nome')} placeholder="Psyllium" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Categoria</label><input className="inp" value={form.categoria} onChange={f('categoria')} placeholder="Fibras, Sementes…" /></div>
            <div><label className="lbl">Unidade de compra</label><select className="inp" value={form.unidadeCompra} onChange={f('unidadeCompra')}><option value="kg">Quilograma</option><option value="unidade">Unidade</option><option value="pote">Pote</option><option value="caixa">Caixa</option><option value="pacote">Pacote</option></select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {form.unidadeCompra === 'kg'
              ? <div><label className="lbl">Custo por kg (R$)</label><input className="inp" type="number" step="0.01" value={form.custoPorKg} onChange={f('custoPorKg')} placeholder="15.00" /></div>
              : <div><label className="lbl">Custo unitário (R$)</label><input className="inp" type="number" step="0.01" value={form.custoUnitario} onChange={f('custoUnitario')} placeholder="12.00" /></div>}
            <div><label className="lbl">Tipo de precificação</label><select className="inp" value={form.tipoPrecificacao} onChange={f('tipoPrecificacao')}><option value="peso_proporcional">Peso proporcional</option><option value="custo_fixo">Custo fixo</option></select></div>
          </div>
          <div><label className="lbl">Fornecedor</label><input className="inp" value={form.fornecedorPrincipal} onChange={f('fornecedorPrincipal')} placeholder="BRASBOL" /></div>
          <div><label className="lbl">Observações</label><textarea className="inp" rows={2} value={form.observacoes} onChange={f('observacoes')} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={13} /> : null} {editing ? 'Salvar' : 'Criar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
