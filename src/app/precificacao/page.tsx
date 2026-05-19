'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { RefreshCw, Pencil, Plus, Filter, Calculator, Search, Truck } from 'lucide-react'
import { Modal, StatusBadge, Loading, Empty, Alert, Spinner } from '@/components/ui'

const brl = (v?: number | null) => v != null ? `R$ ${v.toFixed(2).replace('.', ',')}` : '—'
const pct = (v?: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '—'

interface Prec {
  id: string; skuVariacao: string; plataformaId: string
  custoEmbalagem: number; custoFrete: number; custoColeta: number
  comissaoPct: number; impostoPct: number; precoAtual: number | null
  tipoFreteML: string
  custoTotalCalc: number | null; lucroBruto: number | null; margemAtual: number | null
  precoMinimo: number | null; precoIdeal: number | null; precoMaximo: number | null
  precoPromocional: number | null; statusMargem: string | null
  variacao: {
    nomeVariacao: string; pesoGramas: number | null; custoTotal: number | null
    produto: { nome: string; skuPrincipal: string; categoria: string }
  }
  plataforma: { nome: string; slug: string; corHex: string }
}
interface Plat { id: string; nome: string; slug: string; comissaoPct: number; taxaFixa: number; impostoPct: number; corHex: string }

function PrecificacaoContent() {
  const sp = useSearchParams()
  const [precs, setPrecs] = useState<Prec[]>([])
  const [plats, setPlats] = useState<Plat[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filterPlat, setFilterPlat] = useState(sp.get('plataforma') ?? '')
  const [filterStatus, setFilterStatus] = useState(sp.get('status') ?? '')
  const [editModal, setEditModal] = useState<Prec | null>(null)
  const [addModal, setAddModal] = useState(false)
  const [precoInput, setPrecoInput] = useState('')
  const [tipoFreteEdit, setTipoFreteEdit] = useState('full')
  const [addForm, setAddForm] = useState({
    skuVariacao: '', plataformaId: '', custoEmbalagem: '',
    custoFrete: '', custoColeta: '', comissaoPct: '',
    impostoPct: '0.08', precoAtual: '', tipoFreteML: 'full',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (filterPlat) params.set('plataformaId', filterPlat)
    if (filterStatus) params.set('status', filterStatus)
    const [pr, pl] = await Promise.all([
      fetch('/api/precificacao?' + params).then(r => r.json()),
      fetch('/api/plataformas').then(r => r.json()),
    ])
    setPrecs(pr); setPlats(pl); setLoading(false)
  }, [q, filterPlat, filterStatus])

  useEffect(() => { load() }, [load])

  const openEdit = (p: Prec) => {
    setEditModal(p)
    setPrecoInput(String(p.precoAtual ?? ''))
    setTipoFreteEdit(p.tipoFreteML ?? 'full')
    setError('')
  }

  const savePrice = async () => {
    if (!editModal) return
    setSaving(true)
    const r = await fetch(`/api/precificacao/${editModal.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ precoAtual: precoInput || null, tipoFreteML: tipoFreteEdit }),
    })
    if (!r.ok) { setError('Erro ao salvar'); setSaving(false); return }
    setEditModal(null); setSaving(false); load()
  }

  const saveAdd = async () => {
    setSaving(true); setError('')
    if (!addForm.skuVariacao || !addForm.plataformaId || !addForm.comissaoPct) {
      setError('SKU, plataforma e comissão são obrigatórios'); setSaving(false); return
    }
    const r = await fetch('/api/precificacao', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro'); setSaving(false); return }
    setAddModal(false); setSaving(false); load()
  }

  const recalcAll = async () => {
    setSaving(true)
    for (const p of precs) {
      await fetch(`/api/precificacao/${p.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ precoAtual: p.precoAtual, tipoFreteML: p.tipoFreteML }),
      })
    }
    setSaving(false); load()
  }

  const isML = (p: Prec) => p.plataforma.slug === 'ml'
  const statusBg: Record<string, string> = { PREJUIZO: 'bg-red-50', ATENCAO: 'bg-amber-50/60' }

  const tipoFreteLabel: Record<string, string> = { full: 'FULL', flex: 'Flex', envios: 'Envios', fixo: 'Fixo' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Precificação</h1>
          <p className="text-sm text-gray-500 mt-0.5">{precs.length} linhas — SKU × plataforma · frete ML calculado automaticamente</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={recalcAll} className="btn-ghost text-xs" disabled={saving}>
            {saving ? <Spinner size={12} /> : <Calculator size={13} />} Recalcular tudo
          </button>
          <button onClick={() => {
            setAddForm({ skuVariacao: '', plataformaId: '', custoEmbalagem: '', custoFrete: '', custoColeta: '', comissaoPct: '', impostoPct: '0.08', precoAtual: '', tipoFreteML: 'full' })
            setError(''); setAddModal(true)
          }} className="btn-primary text-xs">
            <Plus size={13} /> Nova
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-2.5 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-40 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
            placeholder="Buscar SKU, produto…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="inp-sm w-auto" value={filterPlat} onChange={e => setFilterPlat(e.target.value)}>
          <option value="">Todas plataformas</option>
          {plats.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select className="inp-sm w-auto" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">Todos status</option>
          {['SAUDAVEL','ATENCAO','PREJUIZO'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
      </div>

      {/* Tabela */}
      <div className="card-tight overflow-auto">
        <table className="w-full min-w-[900px]">
          <thead className="tbl-head">
            <tr>
              <th className="th">SKU / Produto</th>
              <th className="th">Variação</th>
              <th className="th">Plat.</th>
              <th className="th text-center">Frete ML</th>
              <th className="th-r">Custo produto</th>
              <th className="th-r">Frete</th>
              <th className="th-r">Custo total</th>
              <th className="th-r">Preço atual</th>
              <th className="th-r">Margem</th>
              <th className="th-r">Ideal</th>
              <th className="th-r">Promoção</th>
              <th className="th text-center">Status</th>
              <th className="th w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <Loading />}
            {!loading && !precs.length && <Empty msg="Nenhuma precificação encontrada" />}
            {precs.map(p => (
              <tr key={p.id} className={`tr-row ${statusBg[p.statusMargem ?? ''] ?? ''}`}>
                <td className="td">
                  <div className="font-mono text-xs font-semibold text-indigo-600">{p.variacao.produto.skuPrincipal}</div>
                  <div className="text-xs font-medium text-gray-800 max-w-[130px] truncate">{p.variacao.produto.nome}</div>
                </td>
                <td className="td">
                  <div className="text-xs text-gray-700">{p.variacao.nomeVariacao}</div>
                  <div className="text-[10px] text-gray-400 font-mono">{p.skuVariacao}</div>
                  {p.variacao.pesoGramas && <div className="text-[10px] text-gray-400">{p.variacao.pesoGramas}g</div>}
                </td>
                <td className="td">
                  <span className="flex items-center gap-1 text-xs font-medium">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.plataforma.corHex }} />
                    {p.plataforma.slug.toUpperCase()}
                  </span>
                </td>
                {/* Tipo frete ML */}
                <td className="td text-center">
                  {isML(p) ? (
                    <span className={`badge text-[10px] ${p.tipoFreteML === 'full' ? 'bg-yellow-50 text-yellow-700' : p.tipoFreteML === 'flex' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      <Truck size={10} /> {tipoFreteLabel[p.tipoFreteML] ?? p.tipoFreteML}
                    </span>
                  ) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="td-r text-xs text-gray-500">{brl(p.variacao.custoTotal)}</td>
                <td className="td-r text-xs font-medium text-indigo-600">{brl(p.custoFrete)}</td>
                <td className="td-r text-xs font-semibold text-gray-700">{brl(p.custoTotalCalc)}</td>
                <td className="td-r text-sm font-semibold">
                  {p.precoAtual ? brl(p.precoAtual) : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className={`td-r text-xs font-bold ${!p.margemAtual ? 'text-gray-300' : p.margemAtual >= 0.25 ? 'text-emerald-600' : p.margemAtual >= 0.20 ? 'text-amber-600' : 'text-red-600'}`}>
                  {pct(p.margemAtual)}
                </td>
                <td className="td-r text-xs font-semibold text-indigo-600">{brl(p.precoIdeal)}</td>
                <td className="td-r text-xs text-purple-600">{brl(p.precoPromocional)}</td>
                <td className="td text-center"><StatusBadge status={p.statusMargem ?? 'SEM_PRECO'} /></td>
                <td className="td">
                  <button onClick={() => openEdit(p)} className="text-gray-300 hover:text-indigo-600 transition-colors">
                    <Pencil size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal editar */}
      <Modal title="Atualizar precificação" open={!!editModal} onClose={() => setEditModal(null)} wide>
        {editModal && (
          <div className="space-y-4">
            {/* Info do produto */}
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="font-semibold text-gray-800">{editModal.variacao.produto.nome} — {editModal.variacao.nomeVariacao}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
                <span>{editModal.plataforma.nome}</span>
                <span>·</span>
                <span className="font-mono">{editModal.skuVariacao}</span>
                {editModal.variacao.pesoGramas && <><span>·</span><span>{editModal.variacao.pesoGramas}g</span></>}
                <span>·</span>
                <span>Custo produto: <strong>{brl(editModal.variacao.custoTotal)}</strong></span>
              </div>
            </div>

            {/* Tipo de frete — só para ML */}
            {isML(editModal) && (
              <div>
                <label className="lbl flex items-center gap-1.5"><Truck size={12} /> Tipo de frete ML</label>
                <div className="flex gap-2">
                  {[['full', 'FULL (tabela automática)'], ['flex', 'Flex'], ['envios', 'Mercado Envios'], ['fixo', 'Fixo (digitar valor)']].map(([val, label]) => (
                    <button key={val} onClick={() => setTipoFreteEdit(val)}
                      className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium border transition-all
                        ${tipoFreteEdit === val ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {tipoFreteEdit !== 'fixo' && (
                  <p className="text-xs text-indigo-600 mt-1.5 bg-indigo-50 rounded-lg px-3 py-2">
                    Frete será calculado automaticamente pela tabela usando o peso ({editModal.variacao.pesoGramas}g) e o preço de venda informado.
                    {tipoFreteEdit === 'full' && ' Frete FULL atual: ' + brl(editModal.custoFrete)}
                  </p>
                )}
              </div>
            )}

            {/* Preços de referência */}
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Mínimo (20%)', editModal.precoMinimo, 'bg-amber-50 border-amber-200 text-amber-700'],
                ['Ideal ★ (25%)', editModal.precoIdeal, 'bg-indigo-50 border-indigo-200 text-indigo-700'],
                ['Promoção (+45%)', editModal.precoPromocional, 'bg-purple-50 border-purple-200 text-purple-700'],
              ].map(([label, val, cls]) => (
                <div key={String(label)} className={`border rounded-xl p-2.5 text-center ${cls}`}>
                  <div className="text-[10px] font-medium opacity-70">{label}</div>
                  <div className="text-sm font-bold mt-0.5">{brl(val as number | null)}</div>
                </div>
              ))}
            </div>

            {/* Detalhamento de custos */}
            <div className="bg-gray-50 rounded-xl p-3 text-xs space-y-1.5">
              <p className="font-semibold text-gray-600 mb-2">Composição do custo total</p>
              {[
                ['Custo produto', brl(editModal.variacao.custoTotal)],
                ['Embalagem', brl(editModal.custoEmbalagem)],
                [isML(editModal) ? `Frete ML (${tipoFreteLabel[editModal.tipoFreteML] ?? editModal.tipoFreteML})` : 'Frete/Taxa', brl(editModal.custoFrete)],
                ['Coleta', brl(editModal.custoColeta)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-700">{v}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 font-semibold">
                <span className="text-gray-700">Custo total</span>
                <span className="text-gray-900">{brl(editModal.custoTotalCalc)}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Comissão {pct(editModal.comissaoPct)} + Imposto {pct(editModal.impostoPct)}</span>
              </div>
            </div>

            {/* Preço atual */}
            <div>
              <label className="lbl">Preço praticado (R$)</label>
              <input className="inp text-lg font-bold" type="number" step="0.01"
                value={precoInput} onChange={e => setPrecoInput(e.target.value)}
                placeholder="0,00" autoFocus />
              <p className="text-xs text-gray-400 mt-1">
                Ao salvar, o frete {tipoFreteEdit !== 'fixo' && isML(editModal) ? 'FULL será recalculado pela tabela com esse preço como referência' : 'será mantido conforme configurado'}.
              </p>
            </div>

            {error && <Alert type="error">{error}</Alert>}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={savePrice} disabled={saving}>
                {saving ? <Spinner size={14} /> : null} Salvar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal nova precificação */}
      <Modal title="Nova precificação" open={addModal} onClose={() => setAddModal(false)}>
        <div className="space-y-3">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">SKU variação *</label>
              <input className="inp" value={addForm.skuVariacao} onChange={e => setAddForm(p => ({ ...p, skuVariacao: e.target.value }))} placeholder="242-O500" /></div>
            <div><label className="lbl">Plataforma *</label>
              <select className="inp" value={addForm.plataformaId} onChange={e => {
                const plat = plats.find(p => p.id === e.target.value)
                setAddForm(p => ({ ...p, plataformaId: e.target.value, comissaoPct: String(plat?.comissaoPct ?? ''), impostoPct: String(plat?.impostoPct ?? '0.08'), custoFrete: String(plat?.taxaFixa ?? '') }))
              }}>
                <option value="">Selecione…</option>
                {plats.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>

          {/* Tipo frete se ML */}
          {plats.find(p => p.id === addForm.plataformaId)?.slug === 'ml' && (
            <div>
              <label className="lbl flex items-center gap-1"><Truck size={11} /> Tipo de frete ML</label>
              <select className="inp" value={addForm.tipoFreteML} onChange={e => setAddForm(p => ({ ...p, tipoFreteML: e.target.value }))}>
                <option value="full">FULL (tabela automática)</option>
                <option value="flex">Flex</option>
                <option value="envios">Mercado Envios</option>
                <option value="fixo">Fixo (digitar valor)</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Comissão (ex: 0.14)</label>
              <input className="inp" type="number" step="0.001" value={addForm.comissaoPct} onChange={e => setAddForm(p => ({ ...p, comissaoPct: e.target.value }))} /></div>
            <div><label className="lbl">Imposto (ex: 0.08)</label>
              <input className="inp" type="number" step="0.001" value={addForm.impostoPct} onChange={e => setAddForm(p => ({ ...p, impostoPct: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="lbl">Embalagem R$</label>
              <input className="inp" type="number" step="0.01" value={addForm.custoEmbalagem} onChange={e => setAddForm(p => ({ ...p, custoEmbalagem: e.target.value }))} placeholder="0,60" /></div>
            {(addForm.tipoFreteML === 'fixo' || plats.find(p => p.id === addForm.plataformaId)?.slug !== 'ml') && (
              <div><label className="lbl">Frete/Taxa R$</label>
                <input className="inp" type="number" step="0.01" value={addForm.custoFrete} onChange={e => setAddForm(p => ({ ...p, custoFrete: e.target.value }))} placeholder="0,00" /></div>
            )}
          </div>
          <div><label className="lbl">Preço atual R$ (opcional)</label>
            <input className="inp" type="number" step="0.01" value={addForm.precoAtual} onChange={e => setAddForm(p => ({ ...p, precoAtual: e.target.value }))} placeholder="Deixe em branco para calcular depois" /></div>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setAddModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={saveAdd} disabled={saving}>
              {saving ? <Spinner size={14} /> : null} Criar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default function PrecificacaoPage() {
  return <Suspense><PrecificacaoContent /></Suspense>
}
