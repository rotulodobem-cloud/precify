'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Modal, Alert, Spinner } from '@/components/ui'

const pct = (v: number) => `${(v * 100).toFixed(1)}%`
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

interface Plataforma { id: string; nome: string; slug: string; comissaoPct: number; taxaFixa: number; custoFrete: number; custoColeta: number; custoEmbalagem: number; impostoPct: number; corHex: string; ativa: boolean; observacoes: string | null }

const empty = { nome: '', slug: '', comissaoPct: '', taxaFixa: '', custoFrete: '', custoColeta: '', custoEmbalagem: '', impostoPct: '0.08', corHex: '#6366f1', observacoes: '' }

export default function PlataformasPage() {
  const [plats, setPlats] = useState<Plataforma[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false); const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(empty); const [saving, setSaving] = useState(false); const [error, setError] = useState('')

  const load = useCallback(async () => { setLoading(true); const r = await fetch('/api/plataformas'); setPlats(await r.json()); setLoading(false) }, [])
  useEffect(() => { load() }, [load])

  const openAdd = () => { setForm(empty); setEditing(null); setError(''); setModal(true) }
  const openEdit = (p: Plataforma) => {
    setForm({ nome: p.nome, slug: p.slug, comissaoPct: String(p.comissaoPct), taxaFixa: String(p.taxaFixa), custoFrete: String(p.custoFrete), custoColeta: String(p.custoColeta), custoEmbalagem: String(p.custoEmbalagem), impostoPct: String(p.impostoPct), corHex: p.corHex, observacoes: p.observacoes ?? '' })
    setEditing(p.id); setError(''); setModal(true)
  }
  const save = async () => {
    setSaving(true)
    const r = await fetch(editing ? `/api/plataformas/${editing}` : '/api/plataformas', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro'); setSaving(false); return }
    setModal(false); load(); setSaving(false)
  }
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }))
  const remover = async (p: Plataforma) => {
    if (!confirm(`Excluir a plataforma "${p.nome}"? Isso apaga também todo o histórico de precificação ligado a ela. Essa ação não pode ser desfeita.`)) return
    const r = await fetch(`/api/plataformas/${p.id}`, { method: 'DELETE' })
    if (!r.ok) { alert('Erro ao excluir plataforma'); return }
    load()
  }

  // Simulação de preço com custo R$10
  const sim = (com: string, imp: string) => {
    const c = parseFloat(com) || 0; const i = parseFloat(imp) || 0
    return [0.20, 0.25, 0.30].map(m => {
      const d = 1 - c - i - m; return d > 0 ? (10 / d).toFixed(2) : '—'
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Plataformas</h1><p className="text-sm text-gray-500 mt-0.5">Mercado Livre, Shopee e outros canais</p></div>
        <button onClick={openAdd} className="btn-primary"><Plus size={14} /> Nova plataforma</button>
      </div>

      {loading && <div className="text-gray-400 text-sm py-8 text-center">Carregando…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {plats.map(p => {
          const initials = p.slug.toUpperCase().slice(0, 2)
          return (
            <div key={p.id} className={`card p-4 ${!p.ativa ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: p.corHex }}>
                    {initials}
                  </div>
                  <div><div className="font-semibold text-gray-900">{p.nome}</div><div className="text-xs text-gray-400">/{p.slug}</div></div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(p)} className="text-gray-300 hover:text-indigo-600 transition-colors"><Pencil size={15} /></button>
                  <button onClick={() => remover(p)} className="text-gray-300 hover:text-red-600 transition-colors"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                {[['Comissão', pct(p.comissaoPct)], ['Taxa fixa', brl(p.taxaFixa)], ['Embalagem', brl(p.custoEmbalagem)], ['Frete médio', brl(p.custoFrete)], ['Imposto s/ receita', pct(p.impostoPct)]].map(([k, v]) => (
                  <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span className="font-medium text-gray-800">{v}</span></div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                <div className="flex justify-between"><span>Divisor ideal (25%):</span><span className="font-mono font-semibold text-indigo-700">{(1 - p.comissaoPct - p.impostoPct - 0.25).toFixed(3)}</span></div>
              </div>
              {p.observacoes && <p className="text-xs text-gray-400 mt-2 italic">{p.observacoes}</p>}
            </div>
          )
        })}
      </div>

      <Modal title={editing ? 'Editar plataforma' : 'Nova plataforma'} open={modal} onClose={() => setModal(false)}>
        <div className="space-y-3">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Nome *</label><input className="inp" value={form.nome} onChange={f('nome')} placeholder="Mercado Livre" /></div>
            <div><label className="lbl">Slug *</label><input className="inp" value={form.slug} onChange={f('slug')} placeholder="ml" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Comissão (0.14 = 14%) *</label><input className="inp" type="number" step="0.001" value={form.comissaoPct} onChange={f('comissaoPct')} placeholder="0.14" /></div>
            <div><label className="lbl">Imposto s/ receita</label><input className="inp" type="number" step="0.001" value={form.impostoPct} onChange={f('impostoPct')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Taxa fixa R$</label><input className="inp" type="number" step="0.01" value={form.taxaFixa} onChange={f('taxaFixa')} /></div>
            <div><label className="lbl">Frete médio R$</label><input className="inp" type="number" step="0.01" value={form.custoFrete} onChange={f('custoFrete')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Custo embalagem R$</label><input className="inp" type="number" step="0.01" value={form.custoEmbalagem} onChange={f('custoEmbalagem')} placeholder="0,60" /></div>
            <div><label className="lbl">Cor hex</label><input className="inp h-9 p-0.5 cursor-pointer" type="color" value={form.corHex} onChange={f('corHex')} /></div>
          </div>
          {form.comissaoPct && (
            <div className="bg-indigo-50 rounded-xl p-3 text-xs">
              <p className="font-semibold text-indigo-800 mb-1.5">Simulação com custo R$10,00:</p>
              <div className="grid grid-cols-3 gap-2">
                {[['Mínimo 20%', 0], ['Ideal 25%', 1], ['Máximo 30%', 2]].map(([label, idx]) => (
                  <div key={String(label)} className="bg-white rounded-lg p-2 text-center">
                    <div className="text-gray-500">{label}</div>
                    <div className="font-bold text-indigo-700">R$ {sim(form.comissaoPct, form.impostoPct)[idx as number]}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div><label className="lbl">Observações</label><textarea className="inp" rows={2} value={form.observacoes} onChange={f('observacoes')} /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>{saving ? <Spinner size={13} /> : null} Salvar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
