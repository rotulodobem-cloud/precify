'use client'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Search, RefreshCw, Lightbulb, ClipboardList, Send, Copy, TrendingUp, Users, BarChart2, ShoppingCart, Star, UserPlus, Package, Trash2, Building2, Download, Check, X, Upload, FileSpreadsheet, Pencil, Tag } from 'lucide-react'
import * as XLSX from 'xlsx'
import { Modal, StatusBadge, Loading, Empty, Alert, Spinner } from '@/components/ui'
import { useDebounce } from '@/lib/useDebounce'
import SugestaoCompras from './SugestaoCompras'

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

type Aba = 'sugestao' | 'historico' | 'fornecedores' | 'ranking' | 'melhor_preco' | 'curva' | 'pedido' | 'aliases'
const ABAS_VALIDAS: Aba[] = ['sugestao', 'historico', 'fornecedores', 'ranking', 'melhor_preco', 'curva', 'pedido', 'aliases']
// links antigos (?aba=dashboard, hist_mensal, mensal) caem na aba que absorveu a função
const abaInicial = (v: string | null): Aba =>
  v === 'mensal' ? 'curva' : ABAS_VALIDAS.includes(v as Aba) ? (v as Aba) : 'sugestao'

interface Compra {
  id: string; dataCompra: string; skuPrincipal: string; nomeProduto: string; fornecedor: string
  quantidade: number; custoTotal: number; frete: number; outrosCustos: number
  custoUnitario: number; custoAnterior: number | null
  variacaoPct: number | null; statusVariacao: string | null; precoVenda: number | null
  margem: number | null; statusFinanceiro: string | null; fonte: string
  numeroNF: string | null; numeroPedido: string | null
}

type LinhaVariacao = { sku: string; produto: string; custoAnt: number | null; custoAtual: number; variacaoPct: number | null; status: string; nCompras: number }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Sem busca: as 20 maiores variações. Com busca: todos os produtos comprados, sem ligar para acento. */
function filtrarVariacoes(d: DashCompras | null, busca: string): LinhaVariacao[] {
  const termos = semAcento(busca).split(/\s+/).filter(Boolean)
  if (!termos.length) return d?.ranking20 ?? []
  return (d?.variacoes ?? d?.ranking20 ?? []).filter(r => {
    const alvo = semAcento(`${r.sku} ${r.produto}`)
    return termos.every(t => alvo.includes(t))
  })
}

interface DashCompras {
  totalGasto: number; totalCompras: number; fornecedoresAtivos: number; mediaMargemComPreco: number
  porFornecedor: { fornecedor: string; total: number; qtdCompras: number; qtdItens: number }[]
  ranking20: LinhaVariacao[]
  variacoes?: LinhaVariacao[]
  volumeMensal: { sku: string; produto: string; mediaMensal: number; totalMeses: number; meses: Record<string, number> }[]
  melhorPreco: { sku: string; produto: string; fornecedores: { nome: string; precoMin: number }[]; melhor: string; economia: number }[]
  prejudizo: { sku: string; produto: string; custoUnit: number; precoVenda: number; margem: number; dataCompra: string }[]
}

interface Fornecedor { id: string; nome: string; contato?: string | null; obs?: string | null }

const emptyItem = { skuPrincipal: '', nomeProduto: '', quantidade: '', custoTotal: '' }
const emptyFormCompra = { dataCompra: new Date().toISOString().slice(0, 10), fornecedor: '', numeroNF: '', numeroPedido: '', frete: '0' }

const emptyForn = { nome: '', contato: '', obs: '' }

// ── Rascunho automático do lançamento (fica no navegador) ─────
const CHAVE_RASCUNHO = 'precify:compras:rascunho'
const CHAVE_ULTIMO   = 'precify:compras:ultimo-lancamento'
const CHAVE_PEDIDO   = 'precify:compras:pedido'
interface UltimoLancamento { fornecedor: string; numeroNF: string; numeroPedido: string; qtdItens: number; total: number; em: string }
const lerLocal = <T,>(chave: string): T | null => {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) as T : null } catch { return null }
}
const gravarLocal = (chave: string, valor: unknown | null) => {
  try { valor === null ? localStorage.removeItem(chave) : localStorage.setItem(chave, JSON.stringify(valor)) } catch { /* navegador sem storage */ }
}
const dataHora = (iso: string) => {
  const d = new Date(iso)
  const hoje = d.toDateString() === new Date().toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return hoje ? `hoje às ${hora}` : `${d.toLocaleDateString('pt-BR')} às ${hora}`
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
/** Giro do produto buscado em Montar pedido (mesma conta de "O que comprar") */
interface GiroPedido {
  unidade: string; saldo: number; vendaDia: number; venda30d: number
  sugestao: number; tendencia: number | null; prazoDias: number
}

interface SugestaoForn {
  ultimas2Compras: { fornecedor: string; custoUnitario: number; quantidade: number; dataCompra: string }[]
  fornecedorSugerido: string | null; aliases: AliasItem[]
  qtd30dias: number; ultimaQtd: number; sugestaoQtd: number
}

function ComprasContent() {
  const sp = useSearchParams()
  const [aba, setAba]             = useState<Aba>(abaInicial(sp.get('aba')))
  const [compras, setCompras]     = useState<Compra[]>([])
  const [dash, setDash]           = useState<DashCompras | null>(null)
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading]     = useState(true)

  // Filtros histórico
  const [q, setQ]                 = useState(sp.get('q') ?? '')
  const qBusca                    = useDebounce(q)
  const [fornFiltro, setFornFiltro] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim]     = useState('')

  // Modais
  const [modal, setModal]         = useState(false)
  const [modalForn, setModalForn] = useState(false)
  const [formCompra, setFormCompra] = useState(emptyFormCompra)
  const [itensCompra, setItensCompra] = useState([{ ...emptyItem }])
  const [formForn, setFormForn]   = useState(emptyForn)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [errorForn, setErrorForn] = useState('')
  const [editModal, setEditModal] = useState<Compra | null>(null)
  const [editForm, setEditForm]   = useState(emptyFormCompra)
  const [editItem, setEditItem]   = useState({ quantidade: '', custoTotal: '', frete: '', outrosCustos: '' })
  const [loteModal, setLoteModal] = useState<Compra | null>(null)
  const [loteForm, setLoteForm]   = useState({ numeroLote: '', quantidade: '', dataValidade: '' })
  const [loteError, setLoteError] = useState('')
  const [loteSaving, setLoteSaving] = useState(false)

  // SKU lookup
  const [skuLookups, setSkuLookups] = useState<Record<number, { nome?: string; fornecedor?: string; custo?: number } | null>>({})
  const [skuLoadingIdx, setSkuLoadingIdx] = useState<number | null>(null)

  // ── Estado das novas abas ─────────────────────────────────
  const [mesFiltro, setMesFiltro]     = useState('')
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
  const [diasPedido, setDiasPedido]   = useState('30')
  const [giroPedido, setGiroPedido]   = useState<GiroPedido | null | 'carregando'>(null)
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
  const skuTimer = useRef<NodeJS.Timeout>()

  const loadFornecedores = useCallback(async () => {
    const r = await fetch('/api/fornecedores')
    setFornecedores(await r.json())
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (qBusca) params.set('q', qBusca)
    if (fornFiltro) params.set('fornecedor', fornFiltro)
    if (dataInicio) params.set('dataInicio', dataInicio)
    if (dataFim) params.set('dataFim', dataFim)

    const [comp, d] = await Promise.all([
      fetch('/api/compras?' + params).then(r => r.json()),
      fetch('/api/compras/dashboard').then(r => r.json()),
    ])
    setCompras(comp); setDash(d); setLoading(false)
  }, [qBusca, fornFiltro, dataInicio, dataFim])

  useEffect(() => { load(); loadFornecedores() }, [load, loadFornecedores])

  // ── Rascunho automático ───────────────────────────────────
  const [rascunhoPronto, setRascunhoPronto]   = useState(false)
  const [rascunhoSalvoEm, setRascunhoSalvoEm] = useState<string | null>(null)
  const [ultimoLanc, setUltimoLanc]           = useState<UltimoLancamento | null>(null)

  // recupera o que ficou digitado (fechou o modal, recarregou a página, caiu a internet…)
  useEffect(() => {
    const r = lerLocal<{ form: typeof emptyFormCompra; itens: typeof emptyItem[]; salvoEm: string }>(CHAVE_RASCUNHO)
    if (r?.itens?.length) {
      setFormCompra({ ...emptyFormCompra, ...r.form })
      setItensCompra(r.itens)
      setRascunhoSalvoEm(r.salvoEm)
    }
    setUltimoLanc(lerLocal<UltimoLancamento>(CHAVE_ULTIMO))
    const ped = lerLocal<PedidoItemLocal[]>(CHAVE_PEDIDO)
    if (Array.isArray(ped) && ped.length) setPedido(ped)
    setRascunhoPronto(true)
  }, [])

  const itensPreenchidos = itensCompra.filter(it => it.skuPrincipal || it.nomeProduto || it.quantidade || it.custoTotal).length
  const temRascunho = itensPreenchidos > 0 || !!formCompra.fornecedor || !!formCompra.numeroNF || !!formCompra.numeroPedido

  // grava a cada alteração
  useEffect(() => {
    if (!rascunhoPronto) return
    if (!temRascunho) { gravarLocal(CHAVE_RASCUNHO, null); setRascunhoSalvoEm(null); return }
    const salvoEm = new Date().toISOString()
    gravarLocal(CHAVE_RASCUNHO, { form: formCompra, itens: itensCompra, salvoEm })
    setRascunhoSalvoEm(salvoEm)
  }, [rascunhoPronto, temRascunho, formCompra, itensCompra])

  // o pedido em montagem também sobrevive a fechar/recarregar a página
  useEffect(() => {
    if (rascunhoPronto) gravarLocal(CHAVE_PEDIDO, pedido.length ? pedido : null)
  }, [rascunhoPronto, pedido])

  const descartarRascunho = () => {
    if (!confirm('Descartar tudo que foi digitado neste lançamento?')) return
    setFormCompra(emptyFormCompra); setItensCompra([{ ...emptyItem }]); setSkuLookups({}); setError('')
  }

  // ── Lookup de SKU ao digitar (por linha) ──────────────────
  const handleItemSkuChange = (idx: number, val: string) => {
    setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, skuPrincipal: val, nomeProduto: '' } : it))
    setSkuLookups(prev => ({ ...prev, [idx]: null }))
    clearTimeout(skuTimer.current)
    if (val.length < 2) return
    setSkuLoadingIdx(idx)
    skuTimer.current = setTimeout(async () => {
      const r = await fetch(`/api/compras/sku?sku=${encodeURIComponent(val)}`)
      const d = await r.json()
      setSkuLoadingIdx(null)
      if (d?.produto || d?.ultimaCompra) {
        const nome = d.produto?.nome || d.ultimaCompra?.nomeProduto || ''
        const forn = d.produto?.fornecedorPrincipal || d.ultimaCompra?.fornecedor || ''
        const custo = d.produto?.custoPorKg || d.ultimaCompra?.custoUnitario || null
        setSkuLookups(prev => ({ ...prev, [idx]: { nome, fornecedor: forn, custo } }))
        setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, nomeProduto: nome } : it))
        setFormCompra(p => p.fornecedor ? p : { ...p, fornecedor: forn || p.fornecedor })
      }
    }, 400)
  }

  const addItemRow = () => {
    setItensCompra(prev => [{ ...emptyItem }, ...prev])
    setSkuLookups(prev => {
      const n: Record<number, { nome?: string; fornecedor?: string; custo?: number } | null> = {}
      for (const [key, value] of Object.entries(prev)) n[Number(key) + 1] = value
      return n
    })
    setSkuLoadingIdx(prev => (prev === null ? null : prev + 1))
  }
  const removeItemRow = (idx: number) => {
    setItensCompra(prev => prev.filter((_, i) => i !== idx))
    setSkuLookups(prev => {
      const n: Record<number, { nome?: string; fornecedor?: string; custo?: number } | null> = {}
      for (const [key, value] of Object.entries(prev)) {
        const k = Number(key)
        if (k < idx) n[k] = value
        else if (k > idx) n[k - 1] = value
        // k === idx is dropped (the removed row)
      }
      return n
    })
    setSkuLoadingIdx(prev => {
      if (prev === null) return null
      if (prev === idx) return null
      return prev > idx ? prev - 1 : prev
    })
  }

  const somaCustoItens = itensCompra.reduce((s, it) => s + (parseFloat(it.custoTotal) || 0), 0)
  const freteRateio = (custoTotalItem: string) => {
    const freteTotal = parseFloat(formCompra.frete) || 0
    const c = parseFloat(custoTotalItem) || 0
    if (freteTotal <= 0 || somaCustoItens <= 0) return 0
    return Math.round(freteTotal * (c / somaCustoItens) * 100) / 100
  }

  // ── Salvar compra ─────────────────────────────────────────
  const save = async () => {
    setSaving(true); setError('')
    if (!formCompra.fornecedor) { setError('Fornecedor é obrigatório'); setSaving(false); return }
    const itensValidos = itensCompra.filter(it => it.skuPrincipal && it.nomeProduto && it.quantidade && it.custoTotal)
    if (!itensValidos.length) { setError('Adicione ao menos um produto com SKU, quantidade e custo total'); setSaving(false); return }

    try {
      const r = await fetch('/api/compras', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formCompra, itens: itensValidos }),
      })
      if (!r.ok) {
        // resposta pode não ser JSON (ex.: timeout 504 da Vercel)
        const d = await r.json().catch(() => ({}))
        setError(d.error ?? `Erro ao registrar compra (HTTP ${r.status}). Confira a lista antes de tentar de novo — parte dos itens pode ter sido salva.`)
        load()
        return
      }
      const ultimo: UltimoLancamento = {
        fornecedor: formCompra.fornecedor, numeroNF: formCompra.numeroNF, numeroPedido: formCompra.numeroPedido,
        qtdItens: itensValidos.length,
        total: itensValidos.reduce((s, it) => s + (parseFloat(it.custoTotal) || 0), 0),
        em: new Date().toISOString(),
      }
      gravarLocal(CHAVE_ULTIMO, ultimo); setUltimoLanc(ultimo)
      setModal(false)
      setFormCompra(emptyFormCompra)
      setItensCompra([{ ...emptyItem }])
      setSkuLookups({})
      load()
    } catch {
      setError('Falha de conexão ao registrar compra. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  // ── Editar compra ──────────────────────────────────────────
  const openEditCompra = (c: Compra) => {
    setEditModal(c)
    setEditForm({
      dataCompra: c.dataCompra.slice(0, 10), fornecedor: c.fornecedor,
      numeroNF: c.numeroNF ?? '', numeroPedido: c.numeroPedido ?? '', frete: String(c.frete ?? 0),
    })
    setEditItem({ quantidade: String(c.quantidade), custoTotal: String(c.custoTotal), frete: '', outrosCustos: '' })
    setError('')
  }

  const saveEditCompra = async () => {
    if (!editModal) return
    setSaving(true); setError('')
    const r = await fetch(`/api/compras/${editModal.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dataCompra: editForm.dataCompra, fornecedor: editForm.fornecedor,
        numeroNF: editForm.numeroNF, numeroPedido: editForm.numeroPedido,
        quantidade: editItem.quantidade, custoTotal: editItem.custoTotal,
      }),
    })
    if (!r.ok) { const d = await r.json(); setError(d.error ?? 'Erro ao salvar'); setSaving(false); return }
    setEditModal(null); load(); setSaving(false)
  }

  // ── Lançar lote ─────────────────────────────────────────────
  const openLote = (c: Compra) => {
    setLoteModal(c)
    setLoteForm({ numeroLote: '', quantidade: String(c.quantidade), dataValidade: '' })
    setLoteError('')
  }

  const saveLote = async () => {
    if (!loteModal) return
    if (!loteForm.dataValidade) { setLoteError('Data de validade é obrigatória'); return }
    setLoteSaving(true); setLoteError('')
    const r = await fetch('/api/lotes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compraId: loteModal.id, numeroLote: loteForm.numeroLote, quantidade: loteForm.quantidade, dataValidade: loteForm.dataValidade }),
    })
    if (!r.ok) { const d = await r.json(); setLoteError(d.error ?? 'Erro ao salvar lote'); setLoteSaving(false); return }
    setLoteModal(null); setLoteSaving(false)
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
    setFormCompra(p => ({ ...p, [k]: e.target.value }))
  const ff = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormForn(p => ({ ...p, [k]: e.target.value }))

  const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
    { id: 'sugestao',     label: 'O que comprar',     icon: Lightbulb },
    { id: 'pedido',       label: 'Montar pedido',     icon: ClipboardList },
    { id: 'historico',    label: 'Lançamentos',       icon: ShoppingCart },
    { id: 'fornecedores', label: 'Por fornecedor',    icon: Users },
    { id: 'ranking',      label: 'Variação de preço', icon: TrendingUp },
    { id: 'melhor_preco', label: 'Melhor preço',      icon: Star },
    { id: 'curva',        label: 'Curva e volume',    icon: BarChart2 },
    { id: 'aliases',      label: 'Nomes fornecedor',  icon: Package },
  ]

  const limparFiltros = () => { setQ(''); setFornFiltro(''); setDataInicio(''); setDataFim(''); setMesFiltro('') }

  // filtro de mês preenche o período inteiro (substitui a antiga aba "Histórico mensal")
  const escolherMes = (m: string) => {
    setMesFiltro(m)
    if (!m) { setDataInicio(''); setDataFim(''); return }
    const [ano, mes] = m.split('-').map(Number)
    const ultimoDia = new Date(ano, mes, 0).getDate()
    setDataInicio(`${m}-01`); setDataFim(`${m}-${String(ultimoDia).padStart(2, '0')}`)
  }
  const resumoFiltro = {
    total: compras.reduce((s, c) => s + c.custoTotal, 0),
    produtos: new Set(compras.map(c => c.skuPrincipal)).size,
    fornecedores: new Set(compras.map(c => c.fornecedor)).size,
    comAumento: compras.filter(c => c.statusVariacao === 'AUMENTOU > 5%').length,
  }
  const volumePorSku = new Map((dash?.volumeMensal ?? []).map(v => [v.sku, v]))

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
    if (aba === 'curva') loadCurva()
    else if (aba === 'aliases') loadAliases()
  }, [aba, loadCurva, loadAliases])

  // a busca devolve { results: [...] }; com mais de um produto, a pessoa escolhe qual
  const [buscaOpcoes, setBuscaOpcoes] = useState<{ sku: string; nome: string }[]>([])
  const [buscaMsg, setBuscaMsg]       = useState('')

  // Quantidade sugerida pelo giro de vendas, para os dias escolhidos
  const carregarGiroPedido = async (sku: string, dias: string) => {
    setGiroPedido('carregando')
    try {
      const r = await fetch(`/api/compras/sugestao?cobertura=${dias}&sku=${encodeURIComponent(sku)}`)
      const d = r.ok ? await r.json() : null
      const g: GiroPedido | null = d?.item ?? null
      setGiroPedido(g)
      if (g) { setQtdInput(g.sugestao > 0 ? String(g.sugestao) : ''); setUnidInput(g.unidade === 'kg' ? 'kg' : 'un') }
    } catch { setGiroPedido(null) }
  }

  const escolherProduto = async (prod: { sku: string; nome: string }) => {
    setBuscando(true); setBuscaOpcoes([]); setBuscaMsg('')
    try {
      setBuscaRes(prod)
      const s = await fetch(`/api/compras/lista?tipo=sugestao&sku=${encodeURIComponent(prod.sku)}`)
      if (!s.ok) throw new Error()
      const sData = await s.json()
      setSugestao(sData)
      setFornSel(sData.fornecedorSugerido || '')
      setQtdInput('')
      await carregarGiroPedido(prod.sku, diasPedido)
    } catch {
      setBuscaRes(null); setBuscaMsg('Não foi possível carregar os dados desse produto. Tente de novo.')
    } finally { setBuscando(false) }
  }

  const buscarProduto = async () => {
    const termo = buscaPedido.trim()
    if (termo.length < 2) { setBuscaMsg('Digite ao menos 2 letras ou números.'); return }
    setBuscando(true); setSugestao(null); setBuscaRes(null); setBuscaOpcoes([]); setBuscaMsg('')
    try {
      const r = await fetch(`/api/busca?q=${encodeURIComponent(termo)}`)
      if (!r.ok) throw new Error()
      const data = await r.json()
      const lista: { skuPrincipal: string; nome: string }[] = Array.isArray(data) ? data : (data.results ?? [])
      const opcoes = lista.map(p => ({ sku: p.skuPrincipal, nome: p.nome }))
      if (!opcoes.length) { setBuscaMsg(`Nenhum produto encontrado para "${termo}".`); return }
      const exato = opcoes.find(o => o.sku.toLowerCase() === termo.toLowerCase())
      if (exato || opcoes.length === 1) { await escolherProduto(exato ?? opcoes[0]); return }
      setBuscaOpcoes(opcoes)
    } catch {
      setBuscaMsg('Falha ao buscar. Verifique a conexão e tente de novo.')
    } finally { setBuscando(false) }
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
    setBuscaPedido(''); setBuscaRes(null); setSugestao(null); setGiroPedido(null); setFornSel(''); setQtdInput('')
  }

  const textoPedido = (forn: string, itens: PedidoItemLocal[]) => {
    const linhas = itens.map((i, n) => {
      const nome = i.nomeNoFornecedor || i.nomeProduto
      const cod = i.codigoFornecedor ? ` (cód. ${i.codigoFornecedor})` : ''
      return `${n + 1}. ${nome}${cod} — ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(i.quantidade)} ${i.unidade}`
    })
    return `*Pedido de compra — Rótulo do Bem*\nFornecedor: ${forn}\nData: ${new Date().toLocaleDateString('pt-BR')}\n\n${linhas.join('\n')}\n\nTotal: ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`
  }
  const [copiado, setCopiado] = useState('')
  const copiarPedido = async (forn: string, itens: PedidoItemLocal[]) => {
    try { await navigator.clipboard.writeText(textoPedido(forn, itens)); setCopiado(forn); setTimeout(() => setCopiado(''), 2500) }
    catch { alert('Não foi possível copiar. Use o botão do WhatsApp.') }
  }
  const enviarWhatsApp = (forn: string, itens: PedidoItemLocal[]) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(textoPedido(forn, itens))}`, '_blank', 'noopener')
  }
  const alterarQtdPedido = (item: PedidoItemLocal, valor: string) => {
    const q = parseFloat(valor.replace(',', '.'))
    setPedido(p => p.map(x => x === item ? { ...x, quantidade: Number.isFinite(q) ? q : 0 } : x))
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
          <button onClick={() => { setError(''); setModal(true) }} className="btn-primary">
            {temRascunho
              ? <><Pencil size={14} /> Continuar lançamento ({itensPreenchidos} {itensPreenchidos === 1 ? 'produto' : 'produtos'})</>
              : <><Plus size={14} /> Registrar compra</>}
          </button>
        </div>
      </div>

      {ultimoLanc && (
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 w-fit">
          <Check size={13} className="text-emerald-600 shrink-0" />
          <span>
            Último lançamento salvo: <strong>{ultimoLanc.fornecedor}</strong>
            {ultimoLanc.numeroNF && <> · NF {ultimoLanc.numeroNF}</>}
            {!ultimoLanc.numeroNF && ultimoLanc.numeroPedido && <> · Pedido {ultimoLanc.numeroPedido}</>}
            {' '}· {ultimoLanc.qtdItens} {ultimoLanc.qtdItens === 1 ? 'produto' : 'produtos'} · {brl(ultimoLanc.total)} · {dataHora(ultimoLanc.em)}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {abas.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setAba(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all
              ${aba === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <Icon size={13} /> {label}
            {id === 'pedido' && pedido.length > 0 && <span className="bg-rdb-600 text-white rounded-full px-1.5 text-[10px]">{pedido.length}</span>}
          </button>
        ))}
      </div>

      {/* ── O QUE COMPRAR ── */}
      {aba === 'sugestao' && (
        <SugestaoCompras onAdicionar={novos => {
          setPedido(p => {
            const n = [...p]
            for (const item of novos) {
              const idx = n.findIndex(x => x.skuPrincipal === item.skuPrincipal && x.fornecedor === item.fornecedor)
              if (idx >= 0) n[idx] = item; else n.push(item)
            }
            return n
          })
          setAba('pedido')
        }} />
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
              <span className="text-xs text-gray-500 shrink-0">Mês:</span>
              <input type="month" className="inp-sm w-auto" value={mesFiltro} onChange={e => escolherMes(e.target.value)} />
              <span className="text-xs text-gray-500 shrink-0 ml-2">ou período:</span>
              <input type="date" className="inp-sm w-auto" value={dataInicio} onChange={e => { setMesFiltro(''); setDataInicio(e.target.value) }} />
              <span className="text-xs text-gray-400">até</span>
              <input type="date" className="inp-sm w-auto" value={dataFim} onChange={e => { setMesFiltro(''); setDataFim(e.target.value) }} />
              {(dataInicio || dataFim || fornFiltro || q) && (
                <button onClick={limparFiltros} className="text-xs text-rdb-700 hover:underline">Limpar filtros</button>
              )}
              <span className="text-xs text-gray-400 ml-auto">{compras.length} registros</span>
            </div>
          </div>

          {!loading && compras.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total comprado (filtro atual)', valor: brl(resumoFiltro.total) },
                { label: 'Produtos diferentes', valor: String(resumoFiltro.produtos) },
                { label: 'Fornecedores', valor: String(resumoFiltro.fornecedores) },
                { label: 'Itens com aumento acima de 5%', valor: String(resumoFiltro.comAumento), vermelho: resumoFiltro.comAumento > 0 },
              ].map(k => (
                <div key={k.label} className="card p-3">
                  <div className="text-xs text-gray-500 mb-1">{k.label}</div>
                  <div className={`text-lg font-semibold ${k.vermelho ? 'text-red-600' : 'text-gray-900'}`}>{k.valor}</div>
                </div>
              ))}
            </div>
          )}

          <div className="card-tight overflow-auto">
            <table className="w-full min-w-[800px]">
              <thead className="tbl-head"><tr>
                <th className="th">Data</th><th className="th">SKU / Produto</th><th className="th">Fornecedor</th>
                <th className="th-r">Qtd</th><th className="th-r">Custo unit.</th><th className="th-r">Anterior</th>
                <th className="th text-center">Variação</th><th className="th-r">P. Venda</th>
                <th className="th-r">Margem</th><th className="th text-center">Status</th><th className="th w-8"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {loading && <Loading />}
                {!loading && !compras.length && <Empty msg="Nenhuma compra encontrada" />}
                {compras.map(c => (
                  <tr key={c.id} className={`tr-row ${c.statusVariacao === 'AUMENTOU > 5%' ? 'bg-red-50/40' : ''}`}>
                    <td className="td text-xs text-gray-500">{dt(c.dataCompra)}</td>
                    <td className="td">
                      <div className="font-mono text-xs font-bold text-rdb-700">{c.skuPrincipal}</div>
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
                    <td className="td flex items-center gap-2">
                      <button onClick={() => openEditCompra(c)} className="text-gray-300 hover:text-rdb-700 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => openLote(c)} className="text-gray-300 hover:text-emerald-600 transition-colors" title="Lançar lote">
                        <Tag size={13} />
                      </button>
                    </td>
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
                  <div className="w-9 h-9 rounded-xl bg-rdb-50 flex items-center justify-center font-bold text-rdb-700 text-sm">
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
            <span className="text-xs text-gray-500">{buscaRanking.trim() ? 'Buscando em todos os produtos comprados' : 'As 20 maiores variações. Busque para ver qualquer produto.'}</span>
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
              {!loading && !filtrarVariacoes(dash, buscaRanking).length && (
                <Empty msg={buscaRanking.trim() ? `Nenhuma compra encontrada para "${buscaRanking.trim()}"` : 'Nenhuma variação registrada'} />
              )}
              {filtrarVariacoes(dash, buscaRanking).map((r, i) => (
                <tr key={r.sku + i} className={`tr-row ${r.status === 'AUMENTOU > 5%' ? 'bg-red-50/40' : r.status === 'DIMINUIU > 5%' ? 'bg-emerald-50/40' : ''}`}>
                  <td className="td text-xs text-gray-400">{i + 1}</td>
                  <td className="td font-mono text-xs font-bold text-rdb-700">{r.sku}</td>
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
                    <td className="td font-mono text-xs font-bold text-rdb-700">{m.sku}</td>
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

      {/* ── CURVA ABC ── */}
      {aba === 'curva' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Curva A/B/C e volume mensal</h2>
              <p className="text-xs text-gray-500">Produtos classificados por gasto, com a quantidade média comprada por mês</p>
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
                      <th className="th text-right">Gasto médio/mês</th>
                      <th className="th text-right">% do total</th>
                      <th className="th text-right">Qtd média/mês</th>
                      <th className="th w-32">Compras por mês</th>
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
                        {(() => {
                          const v = volumePorSku.get(item.sku)
                          if (!v) return <><td className="td text-right text-gray-300 text-xs">—</td><td className="td" /></>
                          const meses = Object.entries(v.meses).sort()
                          const maxVol = Math.max(...Object.values(v.meses), 1)
                          return (
                            <>
                              <td className="td text-right text-gray-700">{new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v.mediaMensal)}</td>
                              <td className="td">
                                <div className="flex items-end gap-0.5 h-7">
                                  {meses.map(([mes, vol]) => (
                                    <div key={mes} title={`${mes}: ${vol}`} className="bg-rdb-400 rounded-sm flex-1 min-w-[5px]"
                                      style={{ height: `${Math.max(15, (vol / maxVol) * 100)}%` }} />
                                  ))}
                                </div>
                              </td>
                            </>
                          )
                        })()}
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
              <p className="text-xs text-gray-500">Itens vindos de "O que comprar" ou adicionados aqui, separados por fornecedor e prontos para enviar</p>
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

            {buscaMsg && <p className="text-xs text-red-600 mt-2">{buscaMsg}</p>}
            {buscaOpcoes.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-600 mb-1.5">{buscaOpcoes.length} produtos encontrados — escolha um:</p>
                <div className="flex flex-wrap gap-1.5">
                  {buscaOpcoes.map(o => (
                    <button key={o.sku} onClick={() => escolherProduto(o)}
                      className="text-xs bg-white border border-gray-200 hover:border-rdb-600 rounded-lg px-2.5 py-1.5 text-left">
                      <span className="font-medium text-gray-800">{o.nome}</span> <span className="text-gray-400 font-mono">{o.sku}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

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
                    <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-100 p-2.5 text-xs text-gray-700 space-y-1">
                      <label className="flex items-center gap-1.5 font-medium text-emerald-900">
                        Comprar para
                        <select className="inp-sm w-auto" value={diasPedido}
                          onChange={e => { setDiasPedido(e.target.value); carregarGiroPedido(buscaRes.sku, e.target.value) }}>
                          {['15', '21', '30', '45', '60', '90'].map(d => <option key={d} value={d}>{d} dias</option>)}
                        </select>
                      </label>
                      {giroPedido === 'carregando' ? <div className="text-gray-400">Calculando pela venda…</div>
                        : giroPedido ? (<>
                          <div>Vende cerca de <strong>{(giroPedido.vendaDia * 7).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {giroPedido.unidade} por semana</strong> · estoque hoje <strong>{giroPedido.saldo.toLocaleString('pt-BR')} {giroPedido.unidade}</strong></div>
                          <div className="text-sm text-emerald-900">Sugestão para {diasPedido} dias: <strong>{giroPedido.sugestao.toLocaleString('pt-BR')} {giroPedido.unidade}</strong></div>
                          {giroPedido.tendencia != null && giroPedido.tendencia < -0.3 && (
                            <div className="text-amber-700">A venda caiu no último mês; a sugestão usa a média dos 3 meses.</div>
                          )}
                        </>)
                        : <div className="text-gray-500">Sem venda nos últimos 3 meses: digite a quantidade.</div>}
                    </div>
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
              Nenhum item no pedido ainda. Marque produtos na aba <button className="text-rdb-700 underline" onClick={() => setAba('sugestao')}>O que comprar</button> ou busque acima.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  <strong>{pedido.length}</strong> {pedido.length === 1 ? 'item' : 'itens'} · estimativa total{' '}
                  <strong>{brl(pedido.reduce((s, i) => s + (i.precoUnitario || 0) * i.quantidade, 0))}</strong> pelos últimos preços
                </span>
                <button onClick={() => { if (confirm('Esvaziar o pedido inteiro?')) setPedido([]) }} className="text-xs text-red-600 hover:underline">Esvaziar pedido</button>
              </div>
              {Object.entries(pedido.reduce<Record<string,PedidoItemLocal[]>>((acc, item) => {
                if (!acc[item.fornecedor]) acc[item.fornecedor] = []
                acc[item.fornecedor].push(item)
                return acc
              }, {})).map(([forn, itens]) => {
                const total = itens.reduce((s, i) => s + (i.precoUnitario || 0) * i.quantidade, 0)
                return (
                  <div key={forn} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 size={16} className="text-gray-500" />
                        <span className="font-medium text-gray-800">{forn}</span>
                        <span className="text-xs text-gray-400">{itens.length} {itens.length === 1 ? 'item' : 'itens'}</span>
                        {total > 0 && <span className="text-xs text-gray-600">· estimativa <strong>{brl(total)}</strong></span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => copiarPedido(forn, itens)} className="btn-ghost text-xs">
                          {copiado === forn ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar texto</>}
                        </button>
                        <button onClick={() => enviarWhatsApp(forn, itens)}
                          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg px-3 py-1.5">
                          <Send size={12} /> Enviar no WhatsApp
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {itens.map((item, i) => (
                        <div key={i} className="grid grid-cols-[1fr_170px_120px_110px_100px_32px] gap-3 px-4 py-2.5 items-center hover:bg-gray-50/50">
                          <div>
                            <div className="text-sm font-medium text-gray-800">{item.nomeProduto}</div>
                            <div className="text-xs text-gray-400">SKU {item.skuPrincipal}</div>
                          </div>
                          <div>
                            {item.nomeNoFornecedor ? (
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                                {item.nomeNoFornecedor}
                              </span>
                            ) : <span className="text-xs text-gray-300">— sem nome no fornecedor</span>}
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            <input className="inp-sm w-16 text-right" inputMode="decimal" defaultValue={item.quantidade}
                              onBlur={e => alterarQtdPedido(item, e.target.value)} />
                            <span className="text-xs text-gray-400 w-5">{item.unidade}</span>
                          </div>
                          <div className="text-xs text-right text-gray-500">{item.precoUnitario ? `${brl(item.precoUnitario)}/${item.unidade}` : 'sem preço'}</div>
                          <div className="text-sm text-right text-gray-700">{item.precoUnitario ? brl(item.precoUnitario * item.quantidade) : '—'}</div>
                          <div className="flex justify-end">
                            <button onClick={() => setPedido(p => p.filter(x => x !== item))}
                              className="p-1 text-gray-300 hover:text-red-400"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-gray-400">O texto enviado leva produto, código do fornecedor e quantidade — sem preços. O pedido fica guardado neste navegador até você esvaziar.</p>
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
      <Modal title="Registrar compra" open={modal} onClose={() => setModal(false)} wide fecharNoFundo={false}>
        <div className="space-y-3">
          {error && <Alert type="error">{error}</Alert>}

          {(rascunhoSalvoEm || ultimoLanc) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-600 space-y-1">
              {rascunhoSalvoEm && (
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Check size={12} className="text-emerald-600" />
                    Rascunho salvo automaticamente {dataHora(rascunhoSalvoEm)} — pode fechar ou recarregar a página sem perder nada.
                  </span>
                  <button onClick={descartarRascunho} className="text-red-600 hover:underline shrink-0">Descartar</button>
                </div>
              )}
              {ultimoLanc && (
                <div className="text-gray-500">
                  Último lançamento salvo: <strong className="text-gray-700">{ultimoLanc.fornecedor}</strong>
                  {ultimoLanc.numeroNF && <> · NF {ultimoLanc.numeroNF}</>}
                  {' '}· {ultimoLanc.qtdItens} {ultimoLanc.qtdItens === 1 ? 'produto' : 'produtos'} · {dataHora(ultimoLanc.em)}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="lbl">Data *</label>
              <input className="inp" type="date" value={formCompra.dataCompra} onChange={f('dataCompra')} />
            </div>
            <div>
              <label className="lbl">Fornecedor *</label>
              <input className="inp" list="forn-list" value={formCompra.fornecedor}
                onChange={f('fornecedor')} placeholder="Selecione ou digite" />
              <datalist id="forn-list">
                {fornecedores.map(fn => <option key={fn.id} value={fn.nome} />)}
              </datalist>
            </div>
            <div>
              <label className="lbl">Nº NF</label>
              <input className="inp" value={formCompra.numeroNF} onChange={f('numeroNF')} placeholder="Ex: 12345" />
            </div>
            <div>
              <label className="lbl">Nº Pedido</label>
              <input className="inp" value={formCompra.numeroPedido} onChange={f('numeroPedido')} placeholder="Ex: 12345" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="lbl mb-0">Produtos</label>
              <button onClick={addItemRow} className="btn-ghost text-xs"><Plus size={12} /> Adicionar produto</button>
            </div>
            {itensCompra.map((item, idx) => {
              const lookup = skuLookups[idx]
              const rateio = freteRateio(item.custoTotal)
              return (
                <div key={idx} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="relative">
                        <label className="lbl">SKU Principal *</label>
                        <input className="inp pr-7" value={item.skuPrincipal}
                          onChange={e => handleItemSkuChange(idx, e.target.value)} placeholder="Ex: 242" />
                        {skuLoadingIdx === idx && <div className="absolute right-2 top-7"><Spinner size={14} /></div>}
                      </div>
                      <div>
                        <label className="lbl">Nome do produto *</label>
                        <input className="inp" value={item.nomeProduto}
                          onChange={e => setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, nomeProduto: e.target.value } : it))}
                          placeholder={lookup ? '' : 'Digite o nome do produto'} />
                      </div>
                    </div>
                    {itensCompra.length > 1 && (
                      <button onClick={() => removeItemRow(idx)} className="mt-6 text-gray-300 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {lookup && (
                    <div className="bg-rdb-50 border border-rdb-200 rounded-lg px-3 py-1.5 text-xs text-rdb-800">
                      ✓ {lookup.nome} {lookup.custo && <span className="text-rdb-600">· último custo: {num(lookup.custo)}</span>}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="lbl">Quantidade (kg/un) *</label>
                      <input className="inp" type="number" step="0.01" value={item.quantidade}
                        onChange={e => setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, quantidade: e.target.value } : it))} />
                    </div>
                    <div>
                      <label className="lbl">Custo total R$ *</label>
                      <input className="inp" type="number" step="0.01" value={item.custoTotal}
                        onChange={e => setItensCompra(prev => prev.map((it, i) => i === idx ? { ...it, custoTotal: e.target.value } : it))} />
                    </div>
                    <div>
                      <label className="lbl">Frete rateado</label>
                      <div className="inp bg-gray-50 text-gray-500">{brl(rateio)}</div>
                    </div>
                  </div>
                  {item.quantidade && item.custoTotal && parseFloat(item.quantidade) > 0 && (
                    <p className="text-xs text-rdb-700">
                      Custo unitário: <strong>{num(parseFloat(item.custoTotal) / parseFloat(item.quantidade))}</strong>
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div>
            <label className="lbl">Frete total da compra R$ (dividido proporcionalmente entre os produtos acima)</label>
            <input className="inp" type="number" step="0.01" value={formCompra.frete} onChange={f('frete')} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-ghost" onClick={() => setModal(false)}>{temRascunho ? 'Fechar (mantém rascunho)' : 'Cancelar'}</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? <Spinner size={13} /> : null} Registrar {itensCompra.length > 1 ? `(${itensCompra.length} produtos)` : ''}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL EDITAR COMPRA ── */}
      <Modal title="Editar compra" open={!!editModal} onClose={() => setEditModal(null)}>
        {editModal && (
          <div className="space-y-3">
            {error && <Alert type="error">{error}</Alert>}
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500">
              {editModal.skuPrincipal} — {editModal.nomeProduto}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Data *</label>
                <input className="inp" type="date" value={editForm.dataCompra}
                  onChange={e => setEditForm(p => ({ ...p, dataCompra: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Fornecedor</label>
                <input className="inp" list="forn-list" value={editForm.fornecedor}
                  onChange={e => setEditForm(p => ({ ...p, fornecedor: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Nº NF</label>
                <input className="inp" value={editForm.numeroNF}
                  onChange={e => setEditForm(p => ({ ...p, numeroNF: e.target.value }))} placeholder="Ex: 12345" />
              </div>
              <div>
                <label className="lbl">Nº Pedido</label>
                <input className="inp" value={editForm.numeroPedido}
                  onChange={e => setEditForm(p => ({ ...p, numeroPedido: e.target.value }))} placeholder="Ex: 12345" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Quantidade *</label>
                <input className="inp" type="number" step="0.01" value={editItem.quantidade}
                  onChange={e => setEditItem(p => ({ ...p, quantidade: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Custo total R$ *</label>
                <input className="inp" type="number" step="0.01" value={editItem.custoTotal}
                  onChange={e => setEditItem(p => ({ ...p, custoTotal: e.target.value }))} />
              </div>
            </div>
            {editItem.quantidade && editItem.custoTotal && parseFloat(editItem.quantidade) > 0 && (
              <p className="text-xs text-rdb-700">
                Novo custo unitário: <strong>{num(parseFloat(editItem.custoTotal) / parseFloat(editItem.quantidade))}</strong>
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setEditModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveEditCompra} disabled={saving}>
                {saving ? <Spinner size={13} /> : null} Salvar
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL LANÇAR LOTE ── */}
      <Modal title="Lançar lote" open={!!loteModal} onClose={() => setLoteModal(null)}>
        {loteModal && (
          <div className="space-y-3">
            {loteError && <Alert type="error">{loteError}</Alert>}
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 space-y-0.5">
              <div><strong className="text-gray-700">{loteModal.nomeProduto}</strong> — SKU {loteModal.skuPrincipal}</div>
              <div>Fornecedor: {loteModal.fornecedor || '—'}</div>
              <div>Data da compra: {dt(loteModal.dataCompra)}</div>
              <div>NF/Pedido: {loteModal.numeroNF || loteModal.numeroPedido || '—'}</div>
            </div>
            <div>
              <label className="lbl">Número do lote (deixe em branco para gerar automaticamente)</label>
              <input className="inp" value={loteForm.numeroLote}
                onChange={e => setLoteForm(p => ({ ...p, numeroLote: e.target.value }))}
                placeholder="Se vazio, gera AAAAMMDD-SKU" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="lbl">Quantidade coberta por esse lote</label>
                <input className="inp" type="number" step="0.01" value={loteForm.quantidade}
                  onChange={e => setLoteForm(p => ({ ...p, quantidade: e.target.value }))} />
              </div>
              <div>
                <label className="lbl">Data de validade *</label>
                <input className="inp" type="date" value={loteForm.dataValidade}
                  onChange={e => setLoteForm(p => ({ ...p, dataValidade: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button className="btn-ghost" onClick={() => setLoteModal(null)}>Cancelar</button>
              <button className="btn-primary" onClick={saveLote} disabled={loteSaving}>
                {loteSaving ? <Spinner size={13} /> : null} Salvar lote
              </button>
            </div>
          </div>
        )}
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

export default function ComprasPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400 py-8">Carregando…</div>}>
      <ComprasContent />
    </Suspense>
  )
}
