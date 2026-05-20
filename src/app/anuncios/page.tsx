'use client'
import { useEffect, useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Search, RefreshCw, Tag, ToggleLeft, ToggleRight } from 'lucide-react'
import { Modal, StatusBadge, Loading, Empty, Alert, Spinner } from '@/components/ui'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const pct = (v?: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '—'

const CANAIS = [
  { value: 'ml_full',     label: 'ML FULL',      cor: '#FFE600', textCor: '#7a6800', comissao: 0.14 },
  { value: 'ml_classico', label: 'ML Clássico',  cor: '#FFF0AA', textCor: '#7a6800', comissao: 0.14 },
  { value: 'ml_flex',     label: 'ML Flex',      cor: '#FFE600', textCor: '#7a6800', comissao: 0.14 },
  { value: 'shopee',      label: 'Shopee',        cor: '#FF5722', textCor: '#fff',    comissao: 0.20 },
  { value: 'tray',        label: 'Tray',          cor: '#0066cc', textCor: '#fff',    comissao: 0.12 },
  { value: 'loja',        label: 'Loja Física',   cor: '#22c55e', textCor: '#fff',    comissao: 0 },
]

interface Anuncio {
  id: string; skuVariacao: string; canal: string; codigoAnuncio: string | null
  codigoCatalogo: string | null; skuCanal: string | null; nomeAnuncio: string | null
  ativo: boolean; custoEmbalagem: number; custoColeta: number; custoFrete: number
  tipoFrete: string; comissaoPct: number; impostoPct: number; precoAtual: number | null
  custoTotalCalc: number | null; lucroBruto: number | null; margemAtual: number | null
  precoMinimo: number | null; precoIdeal: number | null; precoMaximo: number | null
  precoPromocional: number | null; statusMargem: string | null
  variacao: {
    skuVariacao: string; nomeVariacao: string; pesoGramas: number | null; custoTotal: number | null
    produto: { nome: string; skuPrincipal: string; categoria: string }
  }
}

const emptyForm = {
  skuVariacao: '', canal: 'ml_full', codigoAnuncio: '', codigoCatalogo: '',
  skuCanal: '', nomeAnuncio: '', ativo: true,
  custoEmbalagem: '0', custoColeta: '0.60', custoFrete: '0',
  comissaoPct: '0.14', impostoPct: '0.0829', precoAtual: '',
}

export default function AnunciosPage() {
  const [anuncios, setAnuncios] = useState<Anuncio[]>([])
  const [loading, setLoading]   = useState(true)
  const [q, setQ]               = useState('')
  const [filtroCanal, setFiltroCanal] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState('')
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState<string | null>(null)
  const [form, setForm]         = useState(emptyForm)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (filtroCanal) params.set('canal', filtroCanal)
    if (filtroAtivo !== '') params.set('ativo', filtroAtivo)
    const r = await fetch('/api/anuncios?' + params)
    setAnuncios(await r.json())
    setLoading(false)
  }, [q, filtroCanal, filtroAtivo])

  useEffect(() => { load() }, [load])

  const openAdd = () => { setForm(emptyForm); setEditing(null); setError(''); setModal(true) }
  const openEdit = (a: Anuncio) => {
    setForm({
      skuVariacao: a.skuVariacao, canal: a.canal,
      codigoAnuncio: a.codigoAnuncio ?? '', codigoCatalogo: a.codigoCatalogo ?? '',
      skuCanal: a.skuCanal ?? '', nomeAnuncio: a.nomeAnuncio ?? '',
      ativo: a.ativo,
      custoEmbalagem: String(a.custoEmbalagem), custoColeta: String(a.custoColeta),
      custoFrete: String(a.custoFrete), comissaoPct: String(a.comissaoPct),
      impostoPct: String(a.impostoPct), precoAtual: String(a.precoAtual ?? ''),
    })
    setEditing(a.id); setError(''); setModal(true)
  }

  const handleCanalChange = (canal: string) => {
    const cfg = CANAIS.find(c => c.value === canal)
    setForm(p => ({
      ...p, canal,
      comissaoPct: String(cfg?.comissao ?? 0.14),
      custoEmbalagem: canal === 'ml_full' ? '0' : p.custoEmbalagem,
      custoColeta: canal === 'ml_full' ? '0.60' : '0',
    }))
  }

  const save = async () => {
    setSaving(true); setError('')
    const url    = editing ? `/api/anuncios/${editing}` : '/api/anuncios'
    const method = editing ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro'); setSaving(false); return }
    setModal(false); load(); setSaving(false)
  }

  const del = async (id: string) => {
    if (!confirm('Excluir este anúncio?')) return
    await fetch(`/api/anuncios/${id}`, { method: 'DELETE' })
    load()
  }

  const toggleAtivo = async (a: Anuncio) => {
    await fetch(`/api/anuncios/${a.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !a.ativo }),
    })
    load()
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const canalCfg = (canal: string) => CANAIS.find(c => c.value === canal) ?? CANAIS[0]
  const statusBg: Record<string, string> = { PREJUIZO: 'bg-red-50/50', ATENCAO: 'bg-amber-50/50' }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Anúncios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Precificação por variação × canal de venda</p>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus size={14} /> Novo anúncio
        </button>
      </div>

      {/* Filtros */}
      <div className="card p-2.5 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-1 min-w-40 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
          <Search size={13} className="text-gray-400" />
          <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar SKU, produto, código…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="inp-sm w-auto" value={filtroCanal} onChange={e => setFiltroCanal(e.target.value)}>
          <option value="">Todos canais</option>
          {CANAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="inp-sm w-auto" value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)}>
          <option value="">Ativos e inativos</option>
          <option value="true">Somente ativos</option>
          <option value="false">Somente inativos</option>
        </select>
        <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
        <span className="text-xs text-gray-400">{anuncios.length} anúncios</span>
      </div>

      {/* Tabela */}
      <div className="card-tight overflow-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="tbl-head">
            <tr>
              <th className="th">SKU / Produto</th>
              <th className="th">Variação</th>
              <th className="th">Canal</th>
              <th className="th">Código anúncio</th>
              <th className="th">SKU canal</th>
              <th className="th-r">Custo prod.</th>
              <th className="th-r">Embal.</th>
              <th className="th-r">Coleta</th>
              <th className="th-r">Frete</th>
              <th className="th-r">Custo total</th>
              <th className="th-r">Preço atual</th>
              <th className="th-r">Margem</th>
              <th className="th-r">Ideal</th>
              <th className="th text-center">Status</th>
              <th className="th text-center">Ativo</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading && <Loading />}
            {!loading && !anuncios.length && <Empty msg="Nenhum anúncio cadastrado — clique em + Novo anúncio" />}
            {anuncios.map(a => {
              const cfg = canalCfg(a.canal)
              return (
                <tr key={a.id} className={`tr-row ${!a.ativo ? 'opacity-50' : ''} ${statusBg[a.statusMargem ?? ''] ?? ''}`}>
                  <td className="td">
                    <div className="font-mono text-xs font-bold text-indigo-600">{a.variacao.produto.skuPrincipal}</div>
                    <div className="text-xs text-gray-700 max-w-[120px] truncate">{a.variacao.produto.nome}</div>
                  </td>
                  <td className="td">
                    <div className="text-xs">{a.variacao.nomeVariacao}</div>
                    <div className="text-[10px] text-gray-400 font-mono">{a.skuVariacao}</div>
                  </td>
                  <td className="td">
                    <span className="badge text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: cfg.cor + '33', color: cfg.textCor === '#fff' ? cfg.cor : cfg.textCor }}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="td">
                    {a.codigoAnuncio && <div className="text-xs font-mono text-gray-700">{a.codigoAnuncio}</div>}
                    {a.codigoCatalogo && <div className="text-[10px] text-gray-400 font-mono">Cat: {a.codigoCatalogo}</div>}
                    {!a.codigoAnuncio && <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="td text-xs font-mono text-gray-600">{a.skuCanal ?? '—'}</td>
                  <td className="td-r text-xs text-gray-500">{brl(a.variacao.custoTotal)}</td>
                  <td className="td-r text-xs">{brl(a.custoEmbalagem)}</td>
                  <td className="td-r text-xs">{brl(a.custoColeta)}</td>
                  <td className="td-r text-xs text-indigo-600 font-medium">{brl(a.custoFrete)}</td>
                  <td className="td-r text-xs font-semibold">{brl(a.custoTotalCalc)}</td>
                  <td className="td-r font-semibold">
                    {a.precoAtual ? brl(a.precoAtual) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className={`td-r text-xs font-bold ${!a.margemAtual ? 'text-gray-300' : a.margemAtual >= 0.25 ? 'text-emerald-600' : a.margemAtual >= 0.20 ? 'text-amber-600' : 'text-red-600'}`}>
                    {pct(a.margemAtual)}
                  </td>
                  <td className="td-r text-xs font-semibold text-indigo-600">{brl(a.precoIdeal)}</td>
                  <td className="td text-center"><StatusBadge status={a.statusMargem ?? 'SEM_PRECO'} /></td>
                  <td className="td text-center">
                    <button onClick={() => toggleAtivo(a)} className="transition-colors">
                      {a.ativo
                        ? <ToggleRight size={20} className="text-emerald-500" />
                        : <ToggleLeft size={20} className="text-gray-300" />}
                    </button>
                  </td>
                  <td className="td">
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => openEdit(a)} className="text-gray-300 hover:text-indigo-600 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => del(a.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal title={editing ? 'Editar anúncio' : 'Novo anúncio'} open={modal} onClose={() => setModal(false)} wide>
        <div className="space-y-4">
          {error && <Alert type="error">{error}</Alert>}

          {/* Produto e canal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">SKU da variação *</label>
              <input className="inp" value={form.skuVariacao} onChange={f('skuVariacao')}
                disabled={!!editing} placeholder="Ex: 242-O500" />
            </div>
            <div>
              <label className="lbl">Canal de venda *</label>
              <select className="inp" value={form.canal}
                onChange={e => handleCanalChange(e.target.value)}>
                {CANAIS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Identificação */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Código do anúncio (MLB…)</label>
              <input className="inp" value={form.codigoAnuncio} onChange={f('codigoAnuncio')}
                placeholder="MLB6620253832" />
            </div>
            <div>
              <label className="lbl">Código catálogo (sincronizado)</label>
              <input className="inp" value={form.codigoCatalogo} onChange={f('codigoCatalogo')}
                placeholder="MLB4562038243" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">SKU do canal</label>
              <input className="inp" value={form.skuCanal} onChange={f('skuCanal')}
                placeholder="VS000592" />
            </div>
            <div>
              <label className="lbl">Nome do anúncio</label>
              <input className="inp" value={form.nomeAnuncio} onChange={f('nomeAnuncio')}
                placeholder="Cúrcuma com Pimenta Preta 120caps" />
            </div>
          </div>

          {/* Info sobre custos por canal */}
          {form.canal === 'ml_full' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
              <strong>ML FULL:</strong> embalagem é por conta do ML (zero). Custo de coleta: R$ 0,60/unidade.
              Frete calculado automaticamente pela tabela FULL.
            </div>
          )}
          {(form.canal === 'ml_classico' || form.canal === 'ml_flex') && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-xs text-yellow-800">
              <strong>{form.canal === 'ml_classico' ? 'ML Clássico' : 'ML Flex'}:</strong> inclui embalagem e frete por peso.
            </div>
          )}

          {/* Custos */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="lbl">Embalagem R$</label>
              <input className="inp" type="number" step="0.01" value={form.custoEmbalagem}
                onChange={f('custoEmbalagem')} disabled={form.canal === 'ml_full'}
                placeholder="0,60" />
            </div>
            <div>
              <label className="lbl">Coleta R$ {form.canal === 'ml_full' ? '(FULL/un)' : ''}</label>
              <input className="inp" type="number" step="0.01" value={form.custoColeta}
                onChange={f('custoColeta')} placeholder="0,60" />
            </div>
            <div>
              <label className="lbl">Comissão %</label>
              <input className="inp" type="number" step="0.001" value={form.comissaoPct}
                onChange={f('comissaoPct')} placeholder="0.14" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Imposto % (ex: 0.0829)</label>
              <input className="inp" type="number" step="0.0001" value={form.impostoPct}
                onChange={f('impostoPct')} placeholder="0.0829" />
            </div>
            <div>
              <label className="lbl">Preço atual R$</label>
              <input className="inp" type="number" step="0.01" value={form.precoAtual}
                onChange={f('precoAtual')} placeholder="Deixe em branco para calcular" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="ativo-check" checked={form.ativo}
              onChange={e => setForm(p => ({ ...p, ativo: e.target.checked }))} className="accent-indigo-600" />
            <label htmlFor="ativo-check" className="text-sm text-gray-700">Anúncio ativo neste canal</label>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner size={13} /> : null} {editing ? 'Salvar' : 'Criar anúncio'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
