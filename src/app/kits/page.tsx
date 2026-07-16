'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, RefreshCw, Package, X, Calculator } from 'lucide-react'
import { Modal, StatusBadge, Loading, Empty, Alert, Spinner } from '@/components/ui'
import Link from 'next/link'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const num4 = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v) : '—'

interface Componente {
  id?: string
  skuProduto: string
  nomeProduto: string
  quantidadeGramas: number | null
  quantidadeUn: number | null
  custoUnitario: number
}

interface Kit {
  id: string
  skuKit: string
  nome: string
  categoria: string
  custoTotal: number | null
  custoEmbalagem: number
  observacoes: string | null
  status: string
  componentes: Componente[]
}

interface ProdutoInfo {
  skuPrincipal: string
  nome: string
  custoPorKg: number | null
  custoUnitario: number | null
  custoAtualizado: number | null
  unidadeCompra: string
}

const emptyForm = {
  skuKit: '', nome: '', categoria: 'Kits',
  custoEmbalagem: '0', observacoes: '', status: 'ativo',
}

const emptyComp = { skuProduto: '', nomeProduto: '', quantidadeGramas: '', quantidadeUn: '', custoUnitario: 0 }

export default function KitsPage() {
  const [kits, setKits] = useState<Kit[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [componentes, setComponentes] = useState<typeof emptyComp[]>([{ ...emptyComp }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [produtoInfos, setProdutoInfos] = useState<Record<string, ProdutoInfo>>({})
  const [buscandoProd, setBuscandoProd] = useState<Record<number, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/kits?q=${q}`)
    setKits(await r.json())
    setLoading(false)
  }, [q])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setForm(emptyForm); setComponentes([{ ...emptyComp }])
    setEditing(null); setError(''); setProdutoInfos({}); setModal(true)
  }

  const openEdit = (kit: Kit) => {
    setForm({
      skuKit: kit.skuKit, nome: kit.nome, categoria: kit.categoria,
      custoEmbalagem: String(kit.custoEmbalagem), observacoes: kit.observacoes ?? '', status: kit.status,
    })
    setComponentes(kit.componentes.map(c => ({
      skuProduto: c.skuProduto, nomeProduto: c.nomeProduto,
      quantidadeGramas: String(c.quantidadeGramas ?? ''),
      quantidadeUn: String(c.quantidadeUn ?? ''),
      custoUnitario: c.custoUnitario,
    })))
    setEditing(kit.skuKit); setError(''); setModal(true)
  }

  // Buscar produto ao digitar SKU do componente
  const buscarProduto = async (idx: number, sku: string) => {
    if (!sku || sku.length < 2) return
    setBuscandoProd(p => ({ ...p, [idx]: true }))
    try {
      const r = await fetch(`/api/produtos/${encodeURIComponent(sku)}`)
      if (r.ok) {
        const p: ProdutoInfo = await r.json()
        setProdutoInfos(prev => ({ ...prev, [sku]: p }))
        setComponentes(prev => prev.map((c, i) => i === idx ? { ...c, nomeProduto: p.nome } : c))
      }
    } finally {
      setBuscandoProd(p => ({ ...p, [idx]: false }))
    }
  }

  // Calcular custo do componente em tempo real
  const calcCustoComp = (idx: number) => {
    const comp = componentes[idx]
    const info = produtoInfos[comp.skuProduto]
    if (!info) return

    let custo = 0
    if (comp.quantidadeGramas && info.custoPorKg) {
      custo = (info.custoPorKg * parseFloat(comp.quantidadeGramas)) / 1000
    } else if (comp.quantidadeUn && info.custoUnitario) {
      custo = info.custoUnitario * parseFloat(comp.quantidadeUn)
    } else if (comp.quantidadeGramas && info.custoAtualizado) {
      custo = (info.custoAtualizado * parseFloat(comp.quantidadeGramas)) / 1000
    }

    setComponentes(prev => prev.map((c, i) => i === idx ? { ...c, custoUnitario: Math.round(custo * 10000) / 10000 } : c))
  }

  const updateComp = (idx: number, key: string, val: string) => {
    setComponentes(prev => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c))
  }

  // Custo total calculado em tempo real
  const custoTotalPreview = componentes.reduce((sum, c) => sum + (c.custoUnitario || 0), 0) + parseFloat(form.custoEmbalagem || '0')

  const save = async () => {
    setSaving(true); setError('')
    if (!form.skuKit.trim() || !form.nome.trim()) {
      setError('SKU e nome são obrigatórios'); setSaving(false); return
    }
    if (componentes.some(c => !c.skuProduto.trim())) {
      setError('Todos os componentes precisam ter um SKU'); setSaving(false); return
    }

    const url    = editing ? `/api/kits/${editing}` : '/api/kits'
    const method = editing ? 'PUT' : 'POST'

    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, componentes }),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro'); setSaving(false); return }
    setModal(false); load(); setSaving(false)
  }

  const del = async (skuKit: string) => {
    if (!confirm(`Excluir kit ${skuKit}?`)) return
    await fetch(`/api/kits/${skuKit}`, { method: 'DELETE' })
    load()
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Kits</h1>
          <p className="text-sm text-gray-500 mt-0.5">Produtos compostos por múltiplos componentes</p>
        </div>
        <div className="flex gap-2">
          <Link href="/precificacao-multicanal" className="btn-ghost text-xs">
            <Calculator size={13} /> Calcular preço
          </Link>
          <button onClick={openAdd} className="btn-primary">
            <Plus size={14} /> Novo kit
          </button>
        </div>
      </div>

      {/* Filtro */}
      <div className="card p-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar SKU ou nome…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
        <span className="text-xs text-gray-400">{kits.length} kits</span>
      </div>

      {/* Tabela */}
      <div className="card-tight overflow-auto">
        <table className="w-full">
          <thead className="tbl-head"><tr>
            <th className="th">SKU Kit</th>
            <th className="th">Nome</th>
            <th className="th">Componentes</th>
            <th className="th-r">Embalagem</th>
            <th className="th-r">Custo total</th>
            <th className="th text-center">Status</th>
            <th className="th"></th>
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <Loading />}
            {!loading && !kits.length && <Empty msg="Nenhum kit cadastrado" />}
            {kits.map(kit => (
              <tr key={kit.id} className="tr-row">
                <td className="td font-mono text-xs font-bold text-indigo-600">{kit.skuKit}</td>
                <td className="td font-medium text-gray-800">{kit.nome}</td>
                <td className="td">
                  <div className="flex flex-wrap gap-1">
                    {kit.componentes.map((c, i) => (
                      <span key={i} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                        {c.nomeProduto}
                        {c.quantidadeGramas && ` ${c.quantidadeGramas}g`}
                        {c.quantidadeUn && ` ${c.quantidadeUn}un`}
                        <span className="text-indigo-400 ml-1">= {brl(c.custoUnitario)}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="td-r text-xs">{brl(kit.custoEmbalagem)}</td>
                <td className="td-r font-bold text-gray-800">{brl(kit.custoTotal)}</td>
                <td className="td text-center"><StatusBadge status={kit.status} /></td>
                <td className="td">
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={() => openEdit(kit)} className="text-gray-300 hover:text-indigo-600 transition-colors"><Pencil size={13} /></button>
                    <button onClick={() => del(kit.skuKit)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal title={editing ? 'Editar kit' : 'Novo kit'} open={modal} onClose={() => setModal(false)} wide>
        <div className="space-y-4">
          {error && <Alert type="error">{error}</Alert>}

          {/* Dados do kit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">SKU do kit *</label>
              <input className="inp" value={form.skuKit} onChange={f('skuKit')}
                disabled={!!editing} placeholder="KIT0045" />
            </div>
            <div>
              <label className="lbl">Status</label>
              <select className="inp" value={form.status} onChange={f('status')}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Nome do kit *</label>
              <input className="inp" value={form.nome} onChange={f('nome')} placeholder="Kit Linhaça + Chia 500g" />
            </div>
            <div>
              <label className="lbl">Categoria</label>
              <input className="inp" value={form.categoria} onChange={f('categoria')} placeholder="Kits" />
            </div>
          </div>

          {/* Componentes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="lbl mb-0">Componentes do kit</label>
              <button onClick={() => setComponentes(p => [...p, { ...emptyComp }])}
                className="btn-sm btn-ghost text-xs">
                <Plus size={12} /> Adicionar componente
              </button>
            </div>

            <div className="space-y-2">
              {componentes.map((comp, idx) => (
                <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-500 w-6">{idx + 1}.</span>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <label className="lbl">SKU do produto *</label>
                        <div className="relative">
                          <input className="inp pr-7" value={comp.skuProduto}
                            onChange={e => updateComp(idx, 'skuProduto', e.target.value)}
                            onBlur={() => buscarProduto(idx, comp.skuProduto)}
                            placeholder="220" />
                          {buscandoProd[idx] && <div className="absolute right-2 top-2.5"><Spinner size={13} /></div>}
                        </div>
                        {comp.nomeProduto && <p className="text-xs text-indigo-600 mt-0.5">✓ {comp.nomeProduto}</p>}
                      </div>
                      <div>
                        <label className="lbl">Nome (preenchido auto)</label>
                        <input className="inp" value={comp.nomeProduto}
                          onChange={e => updateComp(idx, 'nomeProduto', e.target.value)}
                          placeholder="Linhaça Dourada" />
                      </div>
                    </div>
                    {componentes.length > 1 && (
                      <button onClick={() => setComponentes(p => p.filter((_, i) => i !== idx))}
                        className="text-gray-300 hover:text-red-500 transition-colors shrink-0 mt-4">
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  <div className="flex items-end gap-2 ml-8">
                    <div className="flex-1">
                      <label className="lbl">Quantidade em gramas</label>
                      <input className="inp" type="number" step="1" value={comp.quantidadeGramas}
                        onChange={e => updateComp(idx, 'quantidadeGramas', e.target.value)}
                        onBlur={() => calcCustoComp(idx)}
                        placeholder="500" />
                    </div>
                    <div className="text-xs text-gray-400 pb-2">ou</div>
                    <div className="flex-1">
                      <label className="lbl">Quantidade em unidades</label>
                      <input className="inp" type="number" step="1" value={comp.quantidadeUn}
                        onChange={e => updateComp(idx, 'quantidadeUn', e.target.value)}
                        onBlur={() => calcCustoComp(idx)}
                        placeholder="1" />
                    </div>
                    <div className="flex-1">
                      <label className="lbl">Custo deste componente</label>
                      <div className={`inp bg-gray-100 font-semibold ${comp.custoUnitario > 0 ? 'text-indigo-700' : 'text-gray-400'}`}>
                        {comp.custoUnitario > 0 ? brl(comp.custoUnitario) : 'calculado auto'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Embalagem */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Custo de embalagem R$</label>
              <input className="inp" type="number" step="0.01" value={form.custoEmbalagem}
                onChange={f('custoEmbalagem')} placeholder="0,80" />
              <p className="text-xs text-gray-400 mt-1">Embalagem específica do kit (caixa, sachê, etc.)</p>
            </div>
            <div>
              <label className="lbl">Observações</label>
              <textarea className="inp" rows={2} value={form.observacoes} onChange={f('observacoes')} />
            </div>
          </div>

          {/* Preview do custo total */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-indigo-800">Custo total do kit</span>
              <span className="text-xl font-bold text-indigo-700">{brl(custoTotalPreview)}</span>
            </div>
            <div className="mt-2 space-y-1">
              {componentes.map((c, i) => c.custoUnitario > 0 && (
                <div key={i} className="flex justify-between text-xs text-indigo-600">
                  <span>{c.nomeProduto || c.skuProduto} {c.quantidadeGramas ? `(${c.quantidadeGramas}g)` : c.quantidadeUn ? `(${c.quantidadeUn}un)` : ''}</span>
                  <span>{brl(c.custoUnitario)}</span>
                </div>
              ))}
              {parseFloat(form.custoEmbalagem) > 0 && (
                <div className="flex justify-between text-xs text-indigo-600">
                  <span>Embalagem</span>
                  <span>{brl(parseFloat(form.custoEmbalagem))}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-indigo-500 mt-2">
              No Multicanal RdB, use o SKU <strong>{form.skuKit || 'do kit'}</strong> para ver os preços por canal com margem, frete, imposto e comissão.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner size={13} /> : null} {editing ? 'Salvar alterações' : 'Criar kit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
