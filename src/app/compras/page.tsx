'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Search, RefreshCw, AlertTriangle, TrendingUp, Users, BarChart2, ShoppingCart, Star, Calendar, UserPlus } from 'lucide-react'
import { Modal, StatusBadge, Loading, Empty, Alert, Spinner } from '@/components/ui'

// ── Formatadores ─────────────────────────────────────────────
const brl = (v?: number | null) =>
  v != null
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
    : '—'

const num = (v?: number | null) =>
  v != null
    ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(v)
    : '—'

const pct = (v?: number | null) => v != null ? `${(v * 100).toFixed(1)}%` : '—'
const dt  = (d: string) => new Date(d).toLocaleDateString('pt-BR')

type Aba = 'dashboard' | 'historico' | 'fornecedores' | 'ranking' | 'mensal' | 'melhor_preco'

interface Compra {
  id: string; dataCompra: string; skuPrincipal: string; nomeProduto: string; fornecedor: string
  quantidade: number; custoTotal: number; custoUnitario: number; custoAnterior: number | null
  variacaoPct: number | null; statusVariacao: string | null; precoVenda: number | null
  margem: number | null; statusFinanceiro: string | null; fonte: string
}

interface DashCompras {
  totalGasto: number; totalCompras: number; fornecedoresAtivos: number; mediaMargemComPreco: number
  porFornecedor: { fornecedor: string; total: number; qtdCompras: number; qtdItens: number }[]
  ranking20: { sku: string; produto: string; custoAnt: number | null; custoAtual: number; variacaoPct: number | null; status: string; nCompras: number }[]
  volumeMensal: { sku: string; produto: string; mediaMensal: number; totalMeses: number; meses: Record<string, number> }[]
  melhorPreco: { sku: string; produto: string; fornecedores: { nome: string; precoMin: number }[]; melhor: string; economia: number }[]
  prejudizo: { sku: string; produto: string; custoUnit: number; precoVenda: number; margem: number }[]
}

interface Fornecedor { id: string; nome: string; contato?: string | null; obs?: string | null }

const emptyF = {
  dataCompra: new Date().toISOString().slice(0, 10),
  skuPrincipal: '', nomeProduto: '', fornecedor: '',
  quantidade: '', custoTotal: '', frete: '0', outrosCustos: '0', precoVenda: ''
}

const emptyForn = { nome: '', contato: '', obs: '' }

export default function ComprasPage() {
  const [aba, setAba]             = useState<Aba>('dashboard')
  const [compras, setCompras]     = useState<Compra[]>([])
  const [dash, setDash]           = useState<DashCompras | null>(null)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading]     = useState(true)

  // Filtros histórico
  const [q, setQ]                 = useState('')
  const [fornFiltro, setFornFiltro] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]     = useState('')

  // Modais
  const [modal, setModal]         = useState(false)
  const [modalForn, setModalForn] = useState(false)
  const [form, setForm]           = useState(emptyF)
  const [formForn, setFormForn]   = useState(emptyForn)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [errorForn, setErrorForn] = useState('')

  // SKU lookup
  const [skuLookup, setSkuLookup]   = useState<{ nome?: string; fornecedor?: string; custo?: number } | null>(null)
  const [skuLoading, setSkuLoading] = useState(false)
  const skuTimer = useRef<NodeJS.Timeout>()

  const loadFornecedores = useCallback(async () => {
    const r = await fetch('/api/fornecedores')
    setFornecedores(await r.json())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (fornFiltro) params.set('fornecedor', fornFiltro)
    if (dataInicio) params.set('dataInicio', dataInicio)
    if (dataFim) params.set('dataFim', dataFim)

    const [comp, d] = await Promise.all([
      fetch('/api/compras?' + params).then(r => r.json()),
      fetch('/api/compras/dashboard').then(r => r.json()),
    ])
    setCompras(comp); setDash(d); setLoading(false)
  }, [q, fornFiltro, dataInicio, dataFim])

  useEffect(() => { load(); loadFornecedores() }, [load, loadFornecedores])

  // ── Lookup de SKU ao digitar ──────────────────────────────
  const handleSkuChange = (val: string) => {
    setForm(p => ({ ...p, skuPrincipal: val, nomeProduto: '' }))
    setSkuLookup(null)
    clearTimeout(skuTimer.current)
    if (val.length < 2) return
    setSkuLoading(true)
    skuTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/compras/sku?sku=${encodeURIComponent(val)}`)
      const d = await r.json()
      setSkuLoading(false)
      if (d?.produto || d?.ultimaCompra) {
        const nome = d.produto?.nome || d.ultimaCompra?.nomeProduto || ''
        const forn = d.produto?.fornecedorPrincipal || d.ultimaCompra?.fornecedor || ''
        const custo = d.produto?.custoPorKg || d.ultimaCompra?.custoUnitario || null
        setSkuLookup({ nome, fornecedor: forn, custo })
        setForm(p => ({
          ...p,
          nomeProduto: nome,
          fornecedor: forn || p.fornecedor,
        }))
      }
    }, 400)
  }

  // ── Salvar compra ─────────────────────────────────────────
  const save = async () => {
    setSaving(true); setError('')
    if (!form.skuPrincipal || !form.nomeProduto || !form.quantidade || !form.custoTotal) {
      setError('SKU, produto, quantidade e custo total são obrigatórios')
      setSaving(false); return
    }
    const r = await fetch('/api/compras', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro'); setSaving(false); return }
    setModal(false); setForm(emptyF); setSkuLookup(null); load(); setSaving(false)
  }

  // ── Salvar fornecedor ─────────────────────────────────────
  const saveForn = async () => {
    setSaving(true); setErrorForn('')
    const r = await fetch('/api/fornecedores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formForn),
    })
    if (!r.ok) { const d = await r.json(); setErrorForn(d.error ?? 'Erro'); setSaving(false); return }
    setModalForn(false); setFormForn(emptyForn); loadFornecedores(); setSaving(false)
  }

  const f  = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))
  const ff = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormForn(p => ({ ...p, [k]: e.target.value }))

  const custoUnit = form.quantidade && form.custoTotal
    ? (parseFloat(form.custoTotal) / parseFloat(form.quantidade))
    : null

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard',    label: 'Resumo',           icon: BarChart2 },
    { id: 'historico',    label: 'Histórico',         icon: ShoppingCart },
    { id: 'fornecedores', label: 'Por fornecedor',    icon: Users },
    { id: 'ranking',      label: 'Variação de preço', icon: TrendingUp },
    { id: 'mensal',       label: 'Volume mensal',     icon: Calendar },
    { id: 'melhor_preco', label: 'Melhor preço',      icon: Star },
  ]

  const limparFiltros = () => { setQ(''); setFornFiltro(''); setDataInicio(''); setDataFim('') }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Compras</h1>
          <p className="text-sm text-gray-500 mt-0.5">Controle de custos, fornecedores e volume</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setFormForn(emptyForn); setErrorForn(''); setModalForn(true) }} className="btn-ghost text-xs">
            <UserPlus size={13} /> Novo fornecedor
          </button>
          <button onClick={() => { setForm(emptyF); setSkuLookup(null); setError(''); setModal(true) }} className="btn-primary">
            <Plus size={14} /> Registrar compra
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {abas.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${aba === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* ── RESUMO ── */}
      {aba === 'dashboard' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ['Gasto total', brl(dash?.totalGasto), 'text-indigo-600'],
              ['Total de compras', String(dash?.totalCompras ?? '—'), 'text-emerald-600'],
              ['Fornecedores ativos', String(dash?.fornecedoresAtivos ?? '—'), 'text-amber-600'],
              ['Margem média', pct(dash?.mediaMargemComPreco), 'text-blue-600'],
            ].map(([label, value, cls]) => (
              <div key={label} className="card p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-xl font-bold mt-1 ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {(dash?.ranking20 ?? []).filter(r => r.status === 'AUMENTOU > 5%').length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-800 font-semibold text-sm mb-2">
                <AlertTriangle size={15} /> Custos que aumentaram mais de 5%
              </div>
              <div className="flex flex-wrap gap-2">
                {dash!.ranking20.filter(r => r.status === 'AUMENTOU > 5%').map(r => (
                  <span key={r.sku} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                    {r.produto}: {brl(r.custoAnt)} → {brl(r.custoAtual)} (+{pct(r.variacaoPct)})
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <h3 className="section-title mb-3">Gasto por fornecedor</h3>
            <div className="space-y-2">
              {(dash?.porFornecedor ?? []).slice(0, 10).map(fn => {
                const pctTotal = dash?.totalGasto ? (fn.total / dash.totalGasto) * 100 : 0
                return (
                  <div key={fn.fornecedor} className="flex items-center gap-3">
                    <span className="text-xs text-gray-700 w-36 truncate">{fn.fornecedor}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-indigo-500 transition-all" style={{ width: `${pctTotal}%` }} />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 w-28 text-right tabular-nums">{brl(fn.total)}</span>
                    <span className="text-xs text-gray-400 w-14 text-right">{fn.qtdCompras}x</span>
                  </div>
                )
              })}
            </div>
          </div>

          {(dash?.prejudizo ?? []).length > 0 && (
            <div className="card p-4">
              <h3 className="section-title mb-3 text-red-700 flex items-center gap-1.5">
                <AlertTriangle size={14} /> Produtos com margem mais baixa
              </h3>
              <table className="w-full text-sm">
                <thead className="tbl-head"><tr>
                  <th className="th">SKU</th><th className="th">Produto</th>
                  <th className="th-r">Custo</th><th className="th-r">Preço venda</th><th className="th-r">Margem</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {dash!.prejudizo.slice(0, 10).map(p => (
                    <tr key={p.sku} className="tr-row">
                      <td className="td font-mono text-xs text-indigo-600">{p.sku}</td>
                      <td className="td text-xs">{p.produto}</td>
                      <td className="td-r text-xs">{brl(p.custoUnit)}</td>
                      <td className="td-r text-xs">{brl(p.precoVenda)}</td>
                      <td className="td-r text-xs font-bold text-red-600">{pct(p.margem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── HISTÓRICO ── */}
      {aba === 'historico' && (
        <div className="space-y-3">
          {/* Filtros */}
          <div className="card p-3 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-1 min-w-48 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
                <Search size={13} className="text-gray-400" />
                <input className="flex-1 text-sm outline-none bg-transparent" placeholder="Buscar SKU ou produto…"
                  value={q} onChange={e => setQ(e.target.value)} />
              </div>
              <select className="inp-sm w-auto" value={fornFiltro} onChange={e => setFornFiltro(e.target.value)}>
                <option value="">Todos fornecedores</option>
                {fornecedores.map(fn => <option key={fn.id} value={fn.nome}>{fn.nome}</option>)}
              </select>
              <button onClick={load} className="btn-icon btn-ghost"><RefreshCw size={13} /></button>
            </div>
            {/* Filtro de período */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 shrink-0">Período:</span>
              <input type="date" className="inp-sm w-auto" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              <span className="text-xs text-gray-400">até</span>
              <input type="date" className="inp-sm w-auto" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              {(dataInicio || dataFim || fornFiltro || q) && (
                <button onClick={limparFiltros} className="text-xs text-indigo-600 hover:underline">Limpar filtros</button>
              )}
              <span className="text-xs text-gray-400 ml-auto">{compras.length} registros</span>
            </div>
          </div>

          <div className="card-tight overflow-auto">
            <table className="w-full min-w-[800px]">
              <thead className="tbl-head"><tr>
                <th className="th">Data</th><th className="th">SKU / Produto</th><th className="th">Fornecedor</th>
                <th className="th-r">Qtd</th><th className="th-r">Custo unit.</th><th className="th-r">Anterior</th>
                <th className="th text-center">Variação</th><th className="th-r">P. Venda</th>
                <th className="th-r">Margem</th><th className="th text-center">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {loading && <Loading />}
                {!loading && !compras.length && <Empty msg="Nenhuma compra encontrada" />}
                {compras.map(c => (
                  <tr key={c.id} className={`tr-row ${c.statusVariacao === 'AUMENTOU > 5%' ? 'bg-red-50/40' : ''}`}>
                    <td className="td text-xs text-gray-500">{dt(c.dataCompra)}</td>
                    <td className="td">
                      <div className="font-mono text-xs font-bold text-indigo-600">{c.skuPrincipal}</div>
                      <div className="text-xs text-gray-700">{c.nomeProduto}</div>
                    </td>
                    <td className="td text-xs">{c.fornecedor}</td>
                    <td className="td-r text-xs">{new Intl.NumberFormat('pt-BR').format(c.quantidade)}</td>
                    <td className="td-r font-semibold">{num(c.custoUnitario)}</td>
                    <td className="td-r text-xs text-gray-400">{num(c.custoAnterior)}</td>
                    <td className="td text-center">
                      <StatusBadge status={c.statusVariacao} />
                      {c.variacaoPct != null && (
                        <div className={`text-[10px] mt-0.5 ${c.variacaoPct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {c.variacaoPct > 0 ? '+' : ''}{pct(c.variacaoPct)}
                        </div>
                      )}
                    </td>
                    <td className="td-r text-xs">{brl(c.precoVenda)}</td>
                    <td className={`td-r text-xs font-bold ${!c.margem ? 'text-gray-300' : c.margem >= 0.25 ? 'text-emerald-700' : c.margem >= 0.10 ? 'text-amber-700' : 'text-red-700'}`}>
                      {pct(c.margem)}
                    </td>
                    <td className="td text-center"><StatusBadge status={c.statusFinanceiro} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── POR FORNECEDOR ── */}
      {aba === 'fornecedores' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(dash?.porFornecedor ?? []).map(fn => {
            const produtosForn = [...new Set(compras.filter(c => c.fornecedor === fn.fornecedor).map(c => c.nomeProduto))]
            const cadastrado = fornecedores.find(f => f.nome === fn.fornecedor)
            return (
              <div key={fn.fornecedor} className="card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center font-bold text-indigo-600 text-sm">
                    {fn.fornecedor.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-800">{fn.fornecedor}</span>
                    {cadastrado?.contato && <div className="text-xs text-gray-400">{cadastrado.contato}</div>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {[['Gasto total', brl(fn.total)], ['Compras', fn.qtdCompras], ['Itens (kg/un)', new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(fn.qtdItens)]].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between text-xs">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-medium text-gray-800">{String(v)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-1.5">Produtos ({produtosForn.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {produtosForn.slice(0, 6).map(nome => (
                      <span key={nome} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded truncate max-w-[130px]">{nome}</span>
                    ))}
                    {produtosForn.length > 6 && <span className="text-[10px] text-gray-400">+{produtosForn.length - 6}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── RANKING ── */}
      {aba === 'ranking' && (
        <div className="card-tight overflow-auto">
          <div className="px-4 py-3 border-b bg-gray-50">
            <span className="section-title">Top 20 — variação de preço de compra (vs. anterior)</span>
          </div>
          <table className="w-full">
            <thead className="tbl-head"><tr>
              <th className="th">#</th><th className="th">SKU</th><th className="th">Produto</th>
              <th className="th-r">Anterior</th><th className="th-r">Atual</th>
              <th className="th-r">Variação</th><th className="th text-center">Status</th><th className="th-r">Compras</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading && <Loading />}
              {!loading && !dash?.ranking20.length && <Empty msg="Nenhuma variação registrada" />}
              {(dash?.ranking20 ?? []).map((r, i) => (
                <tr key={r.sku + i} className={`tr-row ${r.status === 'AUMENTOU > 5%' ? 'bg-red-50/40' : r.status === 'DIMINUIU > 5%' ? 'bg-emerald-50/40' : ''}`}>
                  <td className="td text-xs text-gray-400">{i + 1}</td>
                  <td className="td font-mono text-xs font-bold text-indigo-600">{r.sku}</td>
                  <td className="td text-sm font-medium">{r.produto}</td>
                  <td className="td-r text-xs text-gray-500">{num(r.custoAnt)}</td>
                  <td className="td-r font-semibold">{num(r.custoAtual)}</td>
                  <td className={`td-r font-bold ${!r.variacaoPct ? 'text-gray-400' : r.variacaoPct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {r.variacaoPct != null ? `${r.variacaoPct > 0 ? '+' : ''}${pct(r.variacaoPct)}` : '—'}
                  </td>
                  <td className="td text-center"><StatusBadge status={r.status} /></td>
                  <td className="td-r text-xs text-gray-500">{r.nCompras}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── VOLUME MENSAL ── */}
      {aba === 'mensal' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Quanto de cada produto é comprado por mês em média.</p>
          <div className="card-tight overflow-auto">
            <table className="w-full">
              <thead className="tbl-head"><tr>
                <th className="th">SKU</th><th className="th">Produto</th>
                <th className="th-r">Média/mês</th><th className="th-r">Meses ativos</th>
                <th className="th">Distribuição</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {loading && <Loading />}
                {!loading && !dash?.volumeMensal.length && <Empty msg="Sem dados suficientes" />}
                {(dash?.volumeMensal ?? []).slice(0, 30).map(v => {
                  const meses = Object.entries(v.meses).sort()
                  const maxVol = Math.max(...Object.values(v.meses), 1)
                  return (
                    <tr key={v.sku} className="tr-row">
                      <td className="td font-mono text-xs font-bold text-indigo-600">{v.sku}</td>
                      <td className="td text-sm">{v.produto}</td>
                      <td className="td-r font-semibold">{new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(v.mediaMensal)}</td>
                      <td className="td-r text-xs text-gray-500">{v.totalMeses}</td>
                      <td className="td">
                        <div className="flex items-end gap-0.5 h-8">
                          {meses.map(([mes, vol]) => (
                            <div key={mes} title={`${mes}: ${vol}`}
                              className="bg-indigo-400 rounded-sm flex-1 min-w-[6px]"
                              style={{ height: `${Math.max(15, (vol / maxVol) * 100)}%` }} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MELHOR PREÇO ── */}
      {aba === 'melhor_preco' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Produtos comprados de mais de um fornecedor — qual oferece o menor preço.</p>
          <div className="card-tight overflow-auto">
            <table className="w-full">
              <thead className="tbl-head"><tr>
                <th className="th">SKU</th><th className="th">Produto</th>
                <th className="th">Comparativo</th>
                <th className="th text-center">Melhor opção</th>
                <th className="th-r">Economia/un.</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {loading && <Loading />}
                {!loading && !dash?.melhorPreco.length && <Empty msg="Nenhum produto com múltiplos fornecedores" />}
                {(dash?.melhorPreco ?? []).map(m => (
                  <tr key={m.sku} className="tr-row">
                    <td className="td font-mono text-xs font-bold text-indigo-600">{m.sku}</td>
                    <td className="td text-sm font-medium">{m.produto}</td>
                    <td className="td">
                      <div className="flex flex-col gap-1">
                        {m.fornecedores.map(fn => (
                          <div key={fn.nome} className={`flex items-center justify-between text-xs px-2 py-1 rounded-lg ${fn.nome === m.melhor ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50'}`}>
                            <span className={`font-medium ${fn.nome === m.melhor ? 'text-emerald-700' : 'text-gray-600'}`}>
                              {fn.nome === m.melhor && '★ '}{fn.nome}
                            </span>
                            <span className={`font-bold tabular-nums ${fn.nome === m.melhor ? 'text-emerald-700' : 'text-gray-500'}`}>
                              {num(fn.precoMin)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="td text-center"><span className="badge-green font-bold">{m.melhor}</span></td>
                    <td className="td-r"><span className="text-emerald-700 font-bold">{brl(m.economia)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL REGISTRAR COMPRA ── */}
      <Modal title="Registrar compra" open={modal} onClose={() => { setModal(false); setSkuLookup(null) }}>
        <div className="space-y-3">
          {error && <Alert type="error">{error}</Alert>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Data *</label>
              <input className="inp" type="date" value={form.dataCompra} onChange={f('dataCompra')} />
            </div>
            <div>
              <label className="lbl">SKU Principal *</label>
              <div className="relative">
                <input className="inp pr-7" value={form.skuPrincipal}
                  onChange={e => handleSkuChange(e.target.value)} placeholder="Ex: 242" />
                {skuLoading && <div className="absolute right-2 top-2.5"><Spinner size={14} /></div>}
              </div>
            </div>
          </div>

          {/* Info do produto encontrado */}
          {skuLookup && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-xs text-indigo-700 flex items-center gap-2">
              <span>✓ Produto encontrado:</span>
              <span className="font-semibold">{skuLookup.nome}</span>
              {skuLookup.custo && <span className="text-indigo-500">· último custo: {num(skuLookup.custo)}</span>}
            </div>
          )}

          <div>
            <label className="lbl">Nome do produto *</label>
            <input className="inp" value={form.nomeProduto} onChange={f('nomeProduto')}
              placeholder={skuLookup ? '' : 'Digite o nome do produto'} />
          </div>

          <div>
            <label className="lbl">Fornecedor</label>
            <input className="inp" list="forn-list" value={form.fornecedor}
              onChange={f('fornecedor')} placeholder="Selecione ou digite" />
            <datalist id="forn-list">
              {fornecedores.map(fn => <option key={fn.id} value={fn.nome} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">Quantidade (kg/un) *</label>
              <input className="inp" type="number" step="0.01" value={form.quantidade} onChange={f('quantidade')} />
            </div>
            <div>
              <label className="lbl">Custo total R$ *</label>
              <input className="inp" type="number" step="0.01" value={form.custoTotal} onChange={f('custoTotal')} />
            </div>
          </div>

          {custoUnit !== null && custoUnit > 0 && (
            <div className="bg-indigo-50 rounded-lg px-3 py-2 text-sm text-indigo-700">
              Custo unitário calculado: <strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 }).format(custoUnit)}</strong>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div><label className="lbl">Frete R$</label><input className="inp" type="number" step="0.01" value={form.frete} onChange={f('frete')} /></div>
            <div><label className="lbl">Outros</label><input className="inp" type="number" step="0.01" value={form.outrosCustos} onChange={f('outrosCustos')} /></div>
            <div><label className="lbl">Preço venda</label><input className="inp" type="number" step="0.01" value={form.precoVenda} onChange={f('precoVenda')} /></div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => { setModal(false); setSkuLookup(null) }}>Cancelar</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner size={13} /> : null} Registrar
            </button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL NOVO FORNECEDOR ── */}
      <Modal title="Cadastrar fornecedor" open={modalForn} onClose={() => setModalForn(false)}>
        <div className="space-y-3">
          {errorForn && <Alert type="error">{errorForn}</Alert>}
          <div>
            <label className="lbl">Nome *</label>
            <input className="inp" value={formForn.nome} onChange={ff('nome')} placeholder="BRASBOL" />
          </div>
          <div>
            <label className="lbl">Contato (telefone, e-mail)</label>
            <input className="inp" value={formForn.contato} onChange={ff('contato')} placeholder="(11) 99999-9999" />
          </div>
          <div>
            <label className="lbl">Observações</label>
            <textarea className="inp" rows={2} value={formForn.obs} onChange={ff('obs')} placeholder="Condições de pagamento, prazo de entrega…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setModalForn(false)}>Cancelar</button>
            <button className="btn-primary" onClick={saveForn} disabled={saving}>
              {saving ? <Spinner size={13} /> : null} Cadastrar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
