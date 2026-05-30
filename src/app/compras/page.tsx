'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, Search, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Minus, Users, BarChart2, ShoppingCart, Star, Calendar, UserPlus, Package, Trash2, Building2, Download, Check, X, Upload, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
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

type Aba = 'dashboard' | 'historico' | 'fornecedores' | 'ranking' | 'mensal' | 'melhor_preco' | 'hist_mensal' | 'curva' | 'pedido' | 'aliases'

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


// ── Tipos para lista de compras ───────────────────────────────
interface HistoricoMensalItem {
  skuPrincipal: string; nomeProduto: string; fornecedor: string
  quantidade: number; custoUnitario: number; custoTotal: number
  dataCompra: string; variacaoPct: number | null; custoAnterior: number | null
  sugestao: string
}
interface HistoricoMensalData {
  mes: string; totalGasto: number; totalItens: number
  fornecedoresAtivos: number; comAumento: number; itens: HistoricoMensalItem[]
}
interface CurvaItem {
  sku: string; produto: string; curva: 'A' | 'B' | 'C'
  totalGasto: number; mediaGastoMes: number; qtdCompras: number
  fornecedorPrincipal: string; outrosFornecedores: string[]; pctTotal: number
}
interface CurvaData {
  periodo: string; totalGeral: number; qtdA: number; qtdB: number; qtdC: number; itens: CurvaItem[]
}
interface AliasItem {
  id: string; skuPrincipal: string; fornecedor: string
  nomeNoFornecedor: string; codigoFornecedor: string | null
  embalagem: string | null; ultimoPreco: number | null; dataUltimoPreco: string | null
  produto?: { nome: string }
}
interface PedidoItemLocal {
  skuPrincipal: string; nomeProduto: string; nomeNoFornecedor?: string
  codigoFornecedor?: string; quantidade: number; unidade: string
  precoUnitario?: number; fornecedor: string
}
interface SugestaoForn {
  ultimas2Compras: { fornecedor: string; custoUnitario: number; quantidade: number; dataCompra: string }[]
  fornecedorSugerido: string | null; aliases: AliasItem[]
  qtd30dias: number; ultimaQtd: number; sugestaoQtd: number
}

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

  // ── Estado das novas abas ─────────────────────────────────
  const [histMensal, setHistMensal]   = useState<HistoricoMensalData | null>(null)
  const [curvaData, setCurvaData]     = useState<CurvaData | null>(null)
  const [aliases, setAliases]         = useState<AliasItem[]>([])
  const [pedido, setPedido]           = useState<PedidoItemLocal[]>([])
  const [buscaPedido, setBuscaPedido] = useState('')
  const [buscaRes, setBuscaRes]       = useState<{ sku: string; nome: string } | null>(null)
  const [sugestao, setSugestao]       = useState<SugestaoForn | null>(null)
  const [buscando, setBuscando]       = useState(false)
  const [fornSel, setFornSel]         = useState('')
  const [qtdInput, setQtdInput]       = useState('')
  const [unidInput, setUnidInput]     = useState('kg')
  const [mesesCurva, setMesesCurva]   = useState('3')
  const [filtroCurva, setFiltroCurva] = useState<'todos'|'A'|'B'|'C'>('todos')
  const [aliasForm, setAliasForm]     = useState({ skuPrincipal:'', fornecedor:'', nomeNoFornecedor:'', codigoFornecedor:'', embalagem:'', ultimoPreco:'' })
  const [modalAlias, setModalAlias]   = useState(false)
  const [importStep, setImportStep]   = useState<'idle'|'parsing'|'review'|'saving'>('idle')
  const [importForn, setImportForn]   = useState('')
  const [importItens, setImportItens] = useState<{descricao:string;codigo?:string;preco?:number;embalagem?:string;status?:string;skuPrincipal?:string;sugestoes?:{sku:string;nome:string;score:number}[];skuFinal?:string;ignorar?:boolean}[]>([])
  const [importStats, setImportStats] = useState<{total:number;vinculados:number;sugestoes:number;novos:number}|null>(null)
  const [loadingLista, setLoadingLista] = useState(false)
  const [buscaRanking, setBuscaRanking]     = useState('')
  const [buscaMelhor, setBuscaMelhor]       = useState('')
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

  const abas: { id: Aba; label: string; icon: React.ElementType; grupo?: string }[] = [
    { id: 'dashboard',    label: 'Resumo',           icon: BarChart2 },
    { id: 'historico',    label: 'Histórico',         icon: ShoppingCart },
    { id: 'fornecedores', label: 'Por fornecedor',    icon: Users },
    { id: 'ranking',      label: 'Variação de preço', icon: TrendingUp },
    { id: 'mensal',       label: 'Volume mensal',     icon: Calendar },
    { id: 'melhor_preco', label: 'Melhor preço',      icon: Star },
    { id: 'hist_mensal',  label: 'Histórico mensal',  icon: Calendar,  grupo: 'lista' },
    { id: 'curva',        label: 'Curva A/B/C',       icon: BarChart2, grupo: 'lista' },
    { id: 'pedido',       label: 'Montar pedido',     icon: ShoppingCart, grupo: 'lista' },
    { id: 'aliases',      label: 'Nomes fornecedor',  icon: Package,   grupo: 'lista' },
  ]

  const limparFiltros = () => { setQ(''); setFornFiltro(''); setDataInicio(''); setDataFim('') }

  const loadHistMensal = useCallback(async () => {
    setLoadingLista(true)
    const r = await fetch('/api/compras/lista?tipo=historico')
    setHistMensal(await r.json())
    setLoadingLista(false)
  }, [])

  const loadCurva = useCallback(async () => {
    setLoadingLista(true)
    const r = await fetch(`/api/compras/lista?tipo=curva&meses=${mesesCurva}`)
    setCurvaData(await r.json())
    setLoadingLista(false)
  }, [mesesCurva])

  const loadAliases = useCallback(async () => {
    setLoadingLista(true)
    const r = await fetch('/api/aliases')
    setAliases(await r.json())
    setLoadingLista(false)
  }, [])

  useEffect(() => {
    if (aba === 'hist_mensal') loadHistMensal()
    else if (aba === 'curva') loadCurva()
    else if (aba === 'aliases') loadAliases()
  }, [aba, loadHistMensal, loadCurva, loadAliases])

  const buscarProduto = async () => {
    if (!buscaPedido.trim()) return
    setBuscando(true); setSugestao(null); setBuscaRes(null)
    const r = await fetch(`/api/busca?q=${encodeURIComponent(buscaPedido)}`)
    const data = await r.json()
    if (!data.length) { setBuscando(false); return }
    const prod = data[0]
    setBuscaRes({ sku: prod.skuPrincipal, nome: prod.nome })
    const s = await fetch(`/api/compras/lista?tipo=sugestao&sku=${prod.skuPrincipal}`)
    const sData = await s.json()
    setSugestao(sData)
    setFornSel(sData.fornecedorSugerido || '')
    setQtdInput(String(sData.sugestaoQtd || ''))
    setBuscando(false)
  }

  const adicionarAoPedido = () => {
    if (!buscaRes || !fornSel || !qtdInput) return
    const alias = sugestao?.aliases.find(a => a.fornecedor === fornSel)
    const item: PedidoItemLocal = {
      skuPrincipal: buscaRes.sku, nomeProduto: buscaRes.nome,
      nomeNoFornecedor: alias?.nomeNoFornecedor,
      codigoFornecedor: alias?.codigoFornecedor || undefined,
      quantidade: parseFloat(qtdInput), unidade: unidInput,
      precoUnitario: alias?.ultimoPreco || sugestao?.ultimas2Compras[0]?.custoUnitario,
      fornecedor: fornSel,
    }
    const idx = pedido.findIndex(p => p.skuPrincipal === item.skuPrincipal && p.fornecedor === item.fornecedor)
    if (idx >= 0) { const n = [...pedido]; n[idx] = item; setPedido(n) }
    else setPedido(p => [...p, item])
    setBuscaPedido(''); setBuscaRes(null); setSugestao(null); setFornSel(''); setQtdInput('')
  }

  const exportarFornecedor = (forn: string, itens: PedidoItemLocal[]) => {
    const data = new Date().toLocaleDateString('pt-BR')
    let txt = `PEDIDO DE COMPRA — ${forn}\nData: ${data}\n${'─'.repeat(40)}\n\n`
    itens.forEach(i => {
      const nome = i.nomeNoFornecedor || i.nomeProduto
      const cod = i.codigoFornecedor ? ` (cod. ${i.codigoFornecedor})` : ''
      txt += `• ${nome}${cod}: ${i.quantidade} ${i.unidade}\n`
    })
    navigator.clipboard.writeText(txt)
    alert('Lista copiada!')
  }

  const salvarAlias = async () => {
    await fetch('/api/aliases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(aliasForm) })
    setModalAlias(false)
    setAliasForm({ skuPrincipal:'', fornecedor:'', nomeNoFornecedor:'', codigoFornecedor:'', embalagem:'', ultimoPreco:'' })
    loadAliases()
  }

  const handleImportFile = async (file: File) => {
    if (!importForn) { alert('Selecione o fornecedor primeiro'); return }
    setImportStep('parsing')

    let itens: {descricao:string;codigo?:string;preco?:number;embalagem?:string}[] = []

    if (file.name.toLowerCase().endsWith('.pdf')) {
      const form = new FormData()
      form.append('file', file)
      const pdfRes = await fetch('/api/aliases/importar-pdf', { method: 'POST', body: form })
      const pdfData = await pdfRes.json()
      if (pdfData.servicoOffline) {
        alert('O serviço de PDF não está rodando.\n\nAbra um novo terminal na pasta do projeto e execute:\n  python python\\pdf_parser.py\n\nDepois tente subir o PDF novamente.')
        setImportStep('idle')
        return
      }
      if (pdfData.error) {
        alert('Erro ao processar PDF: ' + pdfData.error)
        setImportStep('idle')
        return
      }
      itens = pdfData.itens || []
    } else {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string,unknown>>(ws, { defval: '' })
      itens = rows.map(r => {
        const desc = String(r['Descri\u00e7\u00e3o'] ?? r['Descricao'] ?? r['descricao'] ?? r['DESCRI\u00c7\u00c3O'] ?? r['Nome'] ?? r['nome'] ?? r['Produto'] ?? r['produto'] ?? Object.values(r)[0] ?? '').trim()
        const cod  = String(r['Cod.'] ?? r['Cod'] ?? r['cod'] ?? r['C\u00f3digo'] ?? r['codigo'] ?? r['COD'] ?? '').trim() || undefined
        const precoStr = String(r['\u00c1 vista'] ?? r['A vista'] ?? r['D\u00e9bito/Cr\u00e9dito'] ?? r['Pre\u00e7o'] ?? r['preco'] ?? r['Valor'] ?? '').replace(/[R$\s.]/g, '').replace(',', '.')
        const preco = parseFloat(precoStr) || undefined
        const embMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*(KG|G|ML|L|UN|SC|PC|CX|FD)\b/i)
        const embalagem = embMatch ? embMatch[0] : undefined
        return { descricao: desc, codigo: cod, preco, embalagem }
      }).filter(i => i.descricao.length > 2)
    }

    if (!itens.length) { alert('Nenhum produto encontrado no arquivo'); setImportStep('idle'); return }

    const r = await fetch('/api/aliases/importar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fornecedor: importForn, itens })
    })
    const data = await r.json()
    setImportItens(data.resultado.map((it: Record<string,unknown>) => ({ ...it, skuFinal: it.skuPrincipal || '', ignorar: false })))
    setImportStats(data.stats)
    setImportStep('review')
  }

  const salvarImport = async () => {
    setImportStep('saving')
    const vinculos = importItens.filter(i => !i.ignorar && i.skuFinal).map(i => ({
      descricao: i.descricao, codigo: i.codigo, embalagem: i.embalagem, preco: i.preco, skuPrincipal: i.skuFinal!,
    }))
    await fetch('/api/aliases/importar', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fornecedor: importForn, vinculos })
    })
    setImportStep('idle'); setImportItens([]); setImportStats(null); setImportForn('')
    loadAliases()
  }

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
        {abas.filter(a => !a.grupo).map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${aba === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={13} /> {label}
          </button>
        ))}
        <div className="w-px bg-gray-300 mx-1 self-stretch" />
        {abas.filter(a => a.grupo === 'lista').map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${aba === id ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-50'}`}>
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
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
            <span className="section-title">Variação de preço de compra (vs. anterior)</span>
            <input type="text" placeholder="Buscar por nome ou SKU..." value={buscaRanking}
              onChange={e => setBuscaRanking(e.target.value)}
              className="inp-sm w-60" />
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
              {(dash?.ranking20 ?? []).filter(r => !buscaRanking || r.sku.toLowerCase().includes(buscaRanking.toLowerCase()) || r.produto.toLowerCase().includes(buscaRanking.toLowerCase())).map((r, i) => (
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-gray-500">Produtos comprados de mais de um fornecedor — qual oferece o menor preço.</p>
            <input type="text" placeholder="Buscar por nome ou SKU..." value={buscaMelhor}
              onChange={e => setBuscaMelhor(e.target.value)}
              className="inp-sm w-60" />
          </div>
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
                {(dash?.melhorPreco ?? []).filter(m => !buscaMelhor || m.sku.toLowerCase().includes(buscaMelhor.toLowerCase()) || m.produto.toLowerCase().includes(buscaMelhor.toLowerCase())).map(m => (
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

      {/* ── HISTÓRICO MENSAL ── */}
      {aba === 'hist_mensal' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Histórico do mês anterior</h2>
              <p className="text-xs text-gray-500 mt-0.5">Base para planejar as compras do próximo mês</p>
            </div>
          </div>
          {loadingLista ? <Loading /> : !histMensal ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
              Carregando dados do mês anterior...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: `Total comprado (${histMensal.mes})`, valor: brl(histMensal.totalGasto) },
                  { label: 'Produtos diferentes', valor: String(histMensal.totalItens) },
                  { label: 'Fornecedores ativos', valor: String(histMensal.fornecedoresAtivos) },
                  { label: 'Com aumento de preço', valor: String(histMensal.comAumento), vermelho: histMensal.comAumento > 0 },
                ].map(k => (
                  <div key={k.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">{k.label}</div>
                    <div className={`text-xl font-semibold ${k.vermelho ? 'text-red-600' : 'text-gray-900'}`}>{k.valor}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="th">Produto</th>
                      <th className="th">Fornecedor</th>
                      <th className="th text-right">Qtd</th>
                      <th className="th text-right">Custo unit.</th>
                      <th className="th text-right">Variação</th>
                      <th className="th">Sugestão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {histMensal.itens.map((item, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="td">
                          <div className="font-medium text-gray-900">{item.nomeProduto}</div>
                          <div className="text-xs text-gray-400">SKU {item.skuPrincipal}</div>
                        </td>
                        <td className="td">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.fornecedor || '—'}</span>
                        </td>
                        <td className="td text-right text-gray-700">{item.quantidade} kg</td>
                        <td className="td text-right text-gray-700">{brl(item.custoUnitario)}</td>
                        <td className="td text-right">
                          {item.variacaoPct != null ? (
                            <span className={`text-xs font-medium ${item.variacaoPct > 0.05 ? 'text-red-600' : item.variacaoPct < -0.05 ? 'text-green-600' : 'text-gray-500'}`}>
                              {item.variacaoPct > 0 ? '▲' : item.variacaoPct < 0 ? '▼' : '='} {pct(Math.abs(item.variacaoPct))}
                            </span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="td">
                          <div className="flex items-center gap-1.5">
                            {item.sugestao === 'revisar_aumento' ? <TrendingUp size={13} className="text-red-500" /> :
                             item.sugestao === 'oportunidade' ? <TrendingDown size={13} className="text-green-600" /> :
                             <Minus size={13} className="text-gray-400" />}
                            <span className="text-xs text-gray-600">
                              {item.sugestao === 'revisar_aumento' ? 'Preço subiu — revisar' :
                               item.sugestao === 'oportunidade' ? 'Preço caiu' : 'Manter quantidade'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CURVA ABC ── */}
      {aba === 'curva' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Curva A/B/C</h2>
              <p className="text-xs text-gray-500">Produtos classificados por volume de gasto</p>
            </div>
            <select value={mesesCurva} onChange={e => setMesesCurva(e.target.value)}
              className="ml-auto text-sm border border-gray-200 rounded-lg px-3 py-1.5">
              <option value="1">Último mês</option>
              <option value="3">Últimos 3 meses</option>
              <option value="6">Últimos 6 meses</option>
            </select>
            <div className="flex gap-1">
              {(['todos','A','B','C'] as const).map(f => (
                <button key={f} onClick={() => setFiltroCurva(f)}
                  className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    filtroCurva === f
                      ? f === 'A' ? 'bg-blue-600 text-white border-blue-600'
                        : f === 'B' ? 'bg-green-600 text-white border-green-600'
                        : f === 'C' ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-gray-700 text-white border-gray-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {f === 'todos' ? 'Todos' : `Curva ${f}`}
                </button>
              ))}
            </div>
          </div>
          {loadingLista ? <Loading /> : !curvaData ? null : (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Total gasto', valor: brl(curvaData.totalGeral) },
                  { label: 'Curva A (80% gasto)', valor: `${curvaData.qtdA} produtos`, cor: 'text-blue-600' },
                  { label: 'Curva B', valor: `${curvaData.qtdB} produtos`, cor: 'text-green-600' },
                  { label: 'Curva C', valor: `${curvaData.qtdC} produtos`, cor: 'text-amber-600' },
                ].map(k => (
                  <div key={k.label} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="text-xs text-gray-500 mb-1">{k.label}</div>
                    <div className={`text-lg font-semibold ${k.cor || 'text-gray-900'}`}>{k.valor}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="th w-16">Curva</th>
                      <th className="th">Produto</th>
                      <th className="th text-right">Média/mês</th>
                      <th className="th text-right">% do total</th>
                      <th className="th">Fornecedor principal</th>
                      <th className="th">Outros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curvaData.itens.filter(i => filtroCurva === 'todos' || i.curva === filtroCurva).map((item, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="td">
                          <span className={`text-xs font-bold px-2 py-1 rounded ${
                            item.curva === 'A' ? 'bg-blue-100 text-blue-700' :
                            item.curva === 'B' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>{item.curva}</span>
                        </td>
                        <td className="td">
                          <div className="font-medium text-gray-900">{item.produto}</div>
                          <div className="text-xs text-gray-400">SKU {item.sku}</div>
                        </td>
                        <td className="td text-right text-gray-700">{brl(item.mediaGastoMes)}</td>
                        <td className="td text-right text-gray-500 text-xs">{item.pctTotal}%</td>
                        <td className="td">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{item.fornecedorPrincipal || '—'}</span>
                        </td>
                        <td className="td">
                          <div className="flex flex-wrap gap-1">
                            {item.outrosFornecedores.map(f => (
                              <span key={f} className="text-xs bg-gray-50 text-gray-500 border border-gray-100 px-1.5 py-0.5 rounded">{f}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MONTAR PEDIDO ── */}
      {aba === 'pedido' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Montar pedido de compra</h2>
              <p className="text-xs text-gray-500">Busque produtos, o sistema sugere o fornecedor e monta a lista</p>
            </div>
          </div>

          {/* Busca */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <div className="text-sm font-medium text-emerald-800 mb-3">Adicionar produto ao pedido</div>
            <div className="flex gap-2">
              <input type="text" placeholder="Buscar por nome ou SKU..."
                value={buscaPedido} onChange={e => setBuscaPedido(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscarProduto()}
                className="inp flex-1" />
              <button onClick={buscarProduto} disabled={buscando} className="btn-primary">
                <Search size={14} /> {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>

            {buscaRes && sugestao && (
              <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">{buscaRes.nome}</div>
                    <div className="text-xs text-gray-400">SKU {buscaRes.sku}</div>
                  </div>
                  <button onClick={() => { setBuscaRes(null); setSugestao(null) }}>
                    <X size={16} className="text-gray-400 hover:text-gray-600" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-2">Últimas 2 compras</div>
                    {sugestao.ultimas2Compras.length === 0 ? (
                      <div className="text-xs text-gray-400">Nenhuma compra registrada</div>
                    ) : sugestao.ultimas2Compras.map((c, i) => (
                      <div key={i} className="text-xs text-gray-600 mb-1">
                        <span className="bg-gray-100 px-1.5 py-0.5 rounded mr-2">{c.fornecedor}</span>
                        {brl(c.custoUnitario)}/kg — {dt(c.dataCompra)}
                      </div>
                    ))}
                    {sugestao.qtd30dias > 0 && (
                      <div className="text-xs text-gray-500 mt-2">Últimos 30 dias: <strong>{sugestao.qtd30dias} kg</strong></div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs font-medium text-gray-600 block mb-1">Fornecedor</label>
                      <select value={fornSel} onChange={e => setFornSel(e.target.value)} className="inp w-full text-sm">
                        <option value="">Selecionar...</option>
                        {sugestao.fornecedorSugerido && (
                          <option value={sugestao.fornecedorSugerido}>✓ {sugestao.fornecedorSugerido} (sugerido)</option>
                        )}
                        {fornecedores.filter(f => f.nome !== sugestao.fornecedorSugerido).map(f => (
                          <option key={f.id} value={f.nome}>{f.nome}</option>
                        ))}
                      </select>
                      {fornSel && sugestao.aliases.find(a => a.fornecedor === fornSel) && (
                        <div className="text-xs text-blue-600 mt-1">
                          Nome neste fornecedor: <strong>{sugestao.aliases.find(a => a.fornecedor === fornSel)?.nomeNoFornecedor}</strong>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-gray-600 block mb-1">Quantidade</label>
                        <input type="number" value={qtdInput} onChange={e => setQtdInput(e.target.value)} className="inp" min="0" step="0.5" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Unidade</label>
                        <select value={unidInput} onChange={e => setUnidInput(e.target.value)} className="inp">
                          <option value="kg">kg</option>
                          <option value="un">un</option>
                          <option value="cx">cx</option>
                          <option value="sc">sc</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={adicionarAoPedido} disabled={!fornSel || !qtdInput}
                      className="btn-primary w-full justify-center disabled:opacity-40">
                      <Plus size={14} /> Adicionar ao pedido
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pedido agrupado */}
          {pedido.length === 0 ? (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
              Nenhum item no pedido ainda. Busque produtos acima para adicionar.
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(pedido.reduce<Record<string,PedidoItemLocal[]>>((acc, item) => {
                if (!acc[item.fornecedor]) acc[item.fornecedor] = []
                acc[item.fornecedor].push(item)
                return acc
              }, {})).map(([forn, itens]) => {
                const total = itens.reduce((s, i) => s + (i.precoUnitario || 0) * i.quantidade, 0)
                return (
                  <div key={forn} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-gray-500" />
                        <span className="font-medium text-gray-800">{forn}</span>
                        <span className="text-xs text-gray-400">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {total > 0 && <span className="text-xs text-gray-500">Estimativa: {brl(total)}</span>}
                        <button onClick={() => exportarFornecedor(forn, itens)}
                          className="btn-ghost text-xs"><Download size={12} /> Copiar lista</button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {itens.map((item, i) => (
                        <div key={i} className="grid grid-cols-[1fr_160px_80px_40px] gap-3 px-4 py-3 items-center hover:bg-gray-50/50">
                          <div>
                            <div className="text-sm font-medium text-gray-800">{item.nomeProduto}</div>
                            <div className="text-xs text-gray-400">SKU {item.skuPrincipal}</div>
                          </div>
                          <div>
                            {item.nomeNoFornecedor ? (
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                                {item.nomeNoFornecedor}
                              </span>
                            ) : <span className="text-xs text-gray-300">— sem alias</span>}
                          </div>
                          <div className="text-sm text-right text-gray-700">{item.quantidade} {item.unidade}</div>
                          <div className="flex justify-end">
                            <button onClick={() => setPedido(p => p.filter((_, j) => j !== pedido.indexOf(item)))}
                              className="p-1 text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── NOMES POR FORNECEDOR (ALIASES) ── */}
      {aba === 'aliases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Nomes por fornecedor</h2>
              <p className="text-xs text-gray-500">Importe a tabela de preços do fornecedor para associar os produtos</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalAlias(true)} className="btn-ghost text-xs">
                <Plus size={13} /> Alias manual
              </button>
            </div>
          </div>

          {/* IMPORTAR LISTA DO FORNECEDOR */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="text-sm font-medium text-emerald-800 mb-3 flex items-center gap-2">
              <FileSpreadsheet size={16} /> Importar lista de preços do fornecedor
            </div>

            {importStep === 'idle' && (
              <div className="space-y-3">
                <div>
                  <label className="lbl">Fornecedor *</label>
                  <select className="inp w-full max-w-xs" value={importForn} onChange={e => setImportForn(e.target.value)}>
                    <option value="">Selecionar fornecedor...</option>
                    {fornecedores.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${importForn ? 'border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'}`}>
                    <Upload size={16} />
                    <span className="text-sm font-medium">Subir tabela do fornecedor (PDF, Excel ou CSV)</span>
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv,.pdf"
                      disabled={!importForn}
                      onChange={e => { if (e.target.files?.[0]) handleImportFile(e.target.files[0]); e.target.value = '' }} />
                  </label>
                </div>
                <p className="text-xs text-gray-500">Formatos aceitos: PDF, Excel (.xlsx, .xls) ou CSV. O sistema extrai automaticamente os produtos da tabela.</p>
              </div>
            )}

            {importStep === 'parsing' && (
              <div className="text-center py-6">
                <div className="text-sm text-emerald-700">Processando planilha e buscando correspondências...</div>
              </div>
            )}

            {importStep === 'review' && importStats && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="text-lg font-semibold">{importStats.total}</div>
                    <div className="text-xs text-gray-500">Total</div>
                  </div>
                  <div className="bg-emerald-100 rounded-lg p-2 border border-emerald-200">
                    <div className="text-lg font-semibold text-emerald-700">{importStats.vinculados}</div>
                    <div className="text-xs text-emerald-600">Já vinculados</div>
                  </div>
                  <div className="bg-amber-100 rounded-lg p-2 border border-amber-200">
                    <div className="text-lg font-semibold text-amber-700">{importStats.sugestoes}</div>
                    <div className="text-xs text-amber-600">Sugestões</div>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-2 border border-gray-200">
                    <div className="text-lg font-semibold text-gray-700">{importStats.novos}</div>
                    <div className="text-xs text-gray-500">Não reconhecidos</div>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 overflow-auto max-h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="th w-8"></th>
                        <th className="th">Produto no fornecedor</th>
                        <th className="th w-16">Cód.</th>
                        <th className="th text-right w-20">Preço</th>
                        <th className="th w-20">Status</th>
                        <th className="th w-64">Vincular ao produto (Precify)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {importItens.map((item, idx) => (
                        <tr key={idx} className={`text-xs ${item.ignorar ? 'opacity-40' : ''} ${item.status === 'vinculado' ? 'bg-emerald-50/30' : item.status === 'sugestao' ? 'bg-amber-50/30' : ''}`}>
                          <td className="td">
                            <input type="checkbox" checked={!item.ignorar}
                              onChange={e => { const n=[...importItens]; n[idx]={...n[idx],ignorar:!e.target.checked}; setImportItens(n) }} />
                          </td>
                          <td className="td font-medium">{item.descricao}</td>
                          <td className="td text-gray-500">{item.codigo || '—'}</td>
                          <td className="td text-right">{item.preco ? brl(item.preco) : '—'}</td>
                          <td className="td">
                            <span className={`badge ${item.status === 'vinculado' ? 'badge-green' : item.status === 'sugestao' ? 'badge-amber' : 'badge-gray'}`}>
                              {item.status === 'vinculado' ? '✓' : item.status === 'sugestao' ? '?' : 'novo'}
                            </span>
                          </td>
                          <td className="td">
                            {!item.ignorar && (
                              <select className="inp-sm w-full" value={item.skuFinal || ''}
                                onChange={e => { const n=[...importItens]; n[idx]={...n[idx],skuFinal:e.target.value}; setImportItens(n) }}>
                                <option value="">— ignorar / não vincular —</option>
                                {item.sugestoes?.map(s => (
                                  <option key={s.sku} value={s.sku}>{s.nome} ({s.sku}) — {Math.round(s.score*100)}%</option>
                                ))}
                                {item.skuPrincipal && !item.sugestoes?.find(s => s.sku === item.skuPrincipal) && (
                                  <option value={item.skuPrincipal}>{item.skuPrincipal} (vinculado)</option>
                                )}
                                <option value="__buscar__">🔍 Buscar outro produto...</option>
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setImportStep('idle'); setImportItens([]); setImportStats(null) }}
                    className="btn-ghost">Cancelar</button>
                  <button onClick={salvarImport} className="btn-primary">
                    <Check size={14} /> Salvar {importItens.filter(i => !i.ignorar && i.skuFinal).length} vínculos
                  </button>
                </div>
              </div>
            )}

            {importStep === 'saving' && (
              <div className="text-center py-6 text-sm text-emerald-700">Salvando vínculos...</div>
            )}
          </div>
          {loadingLista ? <Loading /> : aliases.length === 0 ? (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
              Nenhum alias cadastrado ainda.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="th">Produto (Precify)</th>
                    <th className="th">Fornecedor</th>
                    <th className="th">Nome no fornecedor</th>
                    <th className="th">Código deles</th>
                    <th className="th">Embalagem</th>
                    <th className="th text-right">Último preço</th>
                    <th className="th"></th>
                  </tr>
                </thead>
                <tbody>
                  {aliases.map(alias => (
                    <tr key={alias.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="td">
                        <div className="font-medium text-gray-900">{alias.produto?.nome || alias.skuPrincipal}</div>
                        <div className="text-xs text-gray-400">SKU {alias.skuPrincipal}</div>
                      </td>
                      <td className="td"><span className="badge-gray">{alias.fornecedor}</span></td>
                      <td className="td"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">{alias.nomeNoFornecedor}</span></td>
                      <td className="td text-xs text-gray-500">{alias.codigoFornecedor || '—'}</td>
                      <td className="td text-xs text-gray-500">{alias.embalagem || '—'}</td>
                      <td className="td text-right text-sm text-gray-700">
                        {alias.ultimoPreco ? brl(alias.ultimoPreco) : '—'}
                        {alias.dataUltimoPreco && <div className="text-xs text-gray-400">{dt(alias.dataUltimoPreco)}</div>}
                      </td>
                      <td className="td">
                        <button onClick={async () => { await fetch(`/api/aliases/${alias.id}`, { method: 'DELETE' }); loadAliases() }}
                          className="p-1 text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Modal alias */}
          {modalAlias && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-gray-900">Adicionar alias</h3>
                  <button onClick={() => setModalAlias(false)}><X size={18} className="text-gray-400" /></button>
                </div>
                {[
                  { label: 'SKU do produto (Precify) *', key: 'skuPrincipal', placeholder: 'ex: 242' },
                  { label: 'Nome no fornecedor *', key: 'nomeNoFornecedor', placeholder: 'ex: SEMENTE DE CHIA 25KG' },
                  { label: 'Código do fornecedor', key: 'codigoFornecedor', placeholder: 'ex: 571 (opcional)' },
                  { label: 'Embalagem', key: 'embalagem', placeholder: 'ex: SC 25kg' },
                  { label: 'Último preço visto', key: 'ultimoPreco', placeholder: 'ex: 525.00' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="lbl">{f.label}</label>
                    <input className="inp" value={(aliasForm as Record<string,string>)[f.key]}
                      onChange={e => setAliasForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder} />
                  </div>
                ))}
                <div>
                  <label className="lbl">Fornecedor *</label>
                  <select className="inp w-full" value={aliasForm.fornecedor}
                    onChange={e => setAliasForm(p => ({ ...p, fornecedor: e.target.value }))}>
                    <option value="">Selecionar...</option>
                    {fornecedores.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={salvarAlias}
                    disabled={!aliasForm.skuPrincipal || !aliasForm.fornecedor || !aliasForm.nomeNoFornecedor}
                    className="btn-primary flex-1 justify-center disabled:opacity-40">Salvar alias</button>
                  <button onClick={() => setModalAlias(false)} className="btn-ghost">Cancelar</button>
                </div>
              </div>
            </div>
          )}
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
