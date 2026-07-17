'use client'
import { useState, useRef, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, Search, RefreshCw, Download, FileText, BarChart2, Plus, Trash2 } from 'lucide-react'
import { Alert, Spinner } from '@/components/ui'
import * as XLSX from 'xlsx'
import { parsearListaFornecedor, type ProdutoFornecedor } from '@/lib/parsearPDF'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const CANAL_LABEL: Record<string, string> = { ml_full: 'ML FULL', ml_classico: 'ML Clássico', ml_flex: 'ML Flex', shopee: 'Shopee', tray: 'Tray', loja: 'Loja' }
type Etapa = 'upload' | 'validacao' | 'concluido'
type Modo = 'planilha' | 'lista' | 'comparar'

interface LinhaRaw { linha: number; data: string; nomeProduto: string; fornecedor: string; quantidade: number; valorTotal: number; skuInformado?: string }
interface LinhaValidada extends LinhaRaw { status: 'confirmado' | 'sugestao' | 'novo' | 'sku_nao_encontrado'; skuSugerido: string | null; nomeCadastrado: string | null; custoPorKg: number | null; precoVenda: number | null; sugestoes: { skuPrincipal: string; nome: string }[]; skuFinal: string; isNovo: boolean }

interface ProdutoLista extends ProdutoFornecedor {
  selecionado: boolean; skuInterno: string | null; nomeInterno: string | null; custoPorKgAtual: number | null; variacao: number | null
}

interface ListaFornecedor {
  id: string
  nome: string
  produtos: ProdutoFornecedor[]
}

interface LinhaCmp {
  nomeProduto: string
  precos: Record<string, { preco: number; precoKg: number; qtd: number | null; un: string; produto: ProdutoFornecedor } | null>
  custoAtual: number | null
  fornecedorEscolhido: string | null
}

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function nomeBase(descricao: string) {
  return normalizar(descricao)
    .replace(/\d+[xX]\d+\s*(kg|g|lt|ml|un)?/gi, '')
    .replace(/\d+[.,]?\d*\s*(kg|g|lt|ml|un)/gi, '')
    .replace(/\s+/g, ' ').trim()
}

function similar(a: string, b: string) {
  const na = nomeBase(a), nb = nomeBase(b)
  if (na === nb) return true
  const wa = na.split(' ').filter(w => w.length > 3)
  const wb = nb.split(' ').filter(w => w.length > 3)
  const comuns = wa.filter(w => wb.includes(w))
  return comuns.length >= Math.min(2, Math.min(wa.length, wb.length))
}

export default function ImportarPage() {
  const [modo, setModo] = useState<Modo>('planilha')

  // planilha
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [linhas, setLinhas] = useState<LinhaValidada[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  // lista única
  const [listaFile, setListaFile] = useState<File | null>(null)
  const [listaDragOver, setListaDragOver] = useState(false)
  const [listaLoading, setListaLoading] = useState(false)
  const [listaError, setListaError] = useState('')
  const [listaProdutos, setListaProdutos] = useState<ProdutoLista[]>([])
  const [listaFornecedor, setListaFornecedor] = useState('')
  const [listaFiltro, setListaFiltro] = useState('')
  const [listaEtapa, setListaEtapa] = useState<'upload' | 'lista'>('upload')
  const listaRef = useRef<HTMLInputElement>(null)

  // comparar
  const [listas, setListas] = useState<ListaFornecedor[]>([])
  const [cmpLoading, setCmpLoading] = useState(false)
  const [cmpError, setCmpError] = useState('')
  const [cmpTabela, setCmpTabela] = useState<LinhaCmp[]>([])
  const [cmpFiltro, setCmpFiltro] = useState('')
  const [cmpEtapa, setCmpEtapa] = useState<'upload' | 'tabela'>('upload')
  const cmpRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { setError('Apenas .xlsx ou .xls'); return }
    setFile(f); setError('')
  }

  const lerPlanilha = useCallback(async (f: File): Promise<LinhaRaw[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: 'array', cellDates: true })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
          const linhasRaw: LinhaRaw[] = rows.map((row, i) => ({
            linha: i + 2,
            data: String(row['Data'] ?? row['data'] ?? ''),
            nomeProduto: String(row['Nome do produto'] ?? row['Produto'] ?? row['produto'] ?? ''),
            fornecedor: String(row['Fornecedor'] ?? row['fornecedor'] ?? ''),
            quantidade: parseFloat(String(row['Quantidade'] ?? row['quantidade'] ?? '0').replace(',', '.')),
            valorTotal: parseFloat(String(row['Valor total'] ?? row['valor_total'] ?? row['Total'] ?? '0').replace(',', '.')),
            skuInformado: String(row['SKU'] ?? row['sku'] ?? '').trim() || undefined,
          })).filter(r => r.nomeProduto && r.quantidade > 0 && r.valorTotal > 0)
          resolve(linhasRaw)
        } catch (err) { reject(err) }
      }
      reader.readAsArrayBuffer(f)
    })
  }, [])

  const validar = async () => {
    if (!file) return; setLoading(true); setError('')
    try {
      const linhasRaw = await lerPlanilha(file)
      if (!linhasRaw.length) { setError('Nenhuma linha válida.'); setLoading(false); return }
      const r = await fetch('/api/importar/validar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linhas: linhasRaw }) })
      const validadas = await r.json()
      setLinhas(validadas.map((v: LinhaValidada) => ({ ...v, skuFinal: v.skuSugerido ?? v.skuInformado ?? '', isNovo: v.status === 'novo' || v.status === 'sku_nao_encontrado' })))
      setEtapa('validacao')
    } catch { setError('Erro ao ler a planilha.') }
    setLoading(false)
  }

  const confirmar = async () => {
    const semSku = linhas.filter(l => !l.skuFinal.trim())
    if (semSku.length) { setError(`${semSku.length} linha(s) sem SKU.`); return }
    setConfirmando(true); setError('')
    const r = await fetch('/api/importar/confirmar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linhas: linhas.map(l => ({ ...l, skuFinal: l.skuFinal.trim() })) }) })
    setResultado(await r.json()); setEtapa('concluido'); setConfirmando(false)
  }

  const updateLinha = (idx: number, updates: Partial<LinhaValidada>) => setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l))
  const baixarModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Data', 'Nome do produto', 'Fornecedor', 'Quantidade', 'Valor total', 'SKU'], ['15/05/2026', 'Psyllium', 'BRASBOL', '10', '280.00', '242']])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Compras'); XLSX.writeFile(wb, 'modelo_compras.xlsx')
  }

  const lerListaArquivo = async (f: File): Promise<{ produtos: ProdutoFornecedor[], fornecedor: string }> => {
    if (f.name.match(/\.(xlsx|xls)$/i)) {
      const arrayBuffer = await f.arrayBuffer()
      const wb = XLSX.read(arrayBuffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      const fornecedor = String(rows[0]?.['Marca'] ?? rows[0]?.['Fornecedor'] ?? f.name.replace(/\.(xlsx|xls)$/i, ''))
      const produtos = rows.map(row => {
        const descricao = String(row['Descrição'] ?? row['Descricao'] ?? row['Descrição Comercial'] ?? row['descricao'] ?? row['Nome'] ?? '')
        const precoKg = parseFloat(String(row['Preço do kg'] ?? row['Preco do kg'] ?? '0').toString().replace(',', '.'))
        const precoTotal = parseFloat(String(row['Preço'] ?? row['Preco'] ?? row['Valor embalagem'] ?? row['Valor total'] ?? row['preco'] ?? '0').toString().replace(',', '.'))
        const un = String(row['Unidade'] ?? row['UN'] ?? row['Embalagem/Peso'] ?? row['un'] ?? '')
        const codigoFornecedor = String(row['Código'] ?? row['Codigo'] ?? row['codigo'] ?? '')
        const forn = String(row['Marca'] ?? row['Fornecedor'] ?? row['fornecedor'] ?? fornecedor)
        if (!descricao) return null
        const m = descricao.match(/(\d+(?:[.,]\d+)?)\s*(KG|G|LT|ML)\b/i)
        const qtd = m ? parseFloat(m[1].replace(',', '.')) * (m[2].toUpperCase() === 'G' || m[2].toUpperCase() === 'ML' ? 0.001 : 1) : null
        const unEmb = m ? (m[2].toUpperCase() === 'G' ? 'KG' : m[2].toUpperCase() === 'ML' ? 'LT' : m[2].toUpperCase()) : null
        const preco = precoTotal > 0 ? precoTotal : (precoKg > 0 && qtd ? precoKg * qtd : 0)
        const precoKgFinal = precoKg > 0 ? precoKg : (preco > 0 && qtd && qtd > 0 ? preco / qtd : 0)
        if (preco <= 0 && precoKgFinal <= 0) return null
        return { codigoFornecedor, un, descricao: descricao.replace(/-\d+.*$/, '').trim(), preco, qtdEmbalagem: qtd, unidadeEmbalagem: unEmb, fornecedor: forn, dataValidade: null, precoKg: precoKgFinal } as ProdutoFornecedor & { precoKg: number }
      }).filter(Boolean) as ProdutoFornecedor[]
      return { produtos, fornecedor }
    }
    throw new Error('Formato não suportado')
  }

  const handleListaFile = (f: File) => { setListaFile(f); setListaError('') }

  const processarLista = async () => {
    if (!listaFile) return
    setListaLoading(true); setListaError('')
    try {
      const { produtos, fornecedor } = await lerListaArquivo(listaFile)
      if (!produtos.length) { setListaError('Nenhum produto encontrado.'); setListaLoading(false); return }
      const res = await fetch('/api/importar/pdf-vincular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produtos }) })
      const vinculados = await res.json()
      setListaProdutos(vinculados.map((v: ProdutoLista) => ({ ...v, selecionado: false })))
      setListaFornecedor(fornecedor); setListaEtapa('lista')
    } catch (e) { console.error(e); setListaError('Erro ao processar o arquivo.') }
    setListaLoading(false)
  }

  const toggleSelecionado = (idx: number) => setListaProdutos(prev => prev.map((p, i) => i === idx ? { ...p, selecionado: !p.selecionado } : p))
  const toggleTodos = (val: boolean) => setListaProdutos(prev => prev.map(p => ({ ...p, selecionado: val })))
  const produtosFiltrados = listaProdutos.filter(p => !listaFiltro || p.descricao.toLowerCase().includes(listaFiltro.toLowerCase()))
  const selecionados = listaProdutos.filter(p => p.selecionado)

  const exportarSelecionados = () => {
    if (!selecionados.length) { alert('Selecione ao menos um produto'); return }
    const ws = XLSX.utils.aoa_to_sheet([['Data', 'Nome do produto', 'Fornecedor', 'Quantidade', 'Valor total', 'SKU'], ...selecionados.map(p => [new Date().toLocaleDateString('pt-BR'), p.descricao, p.fornecedor, p.qtdEmbalagem ?? 1, p.preco, p.skuInterno ?? ''])])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    XLSX.writeFile(wb, `pedido_${listaFornecedor}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
  }

  // ── comparar ──
  const adicionarLista = async (f: File) => {
    setCmpError('')
    try {
      const { produtos, fornecedor } = await lerListaArquivo(f)
      if (!produtos.length) { setCmpError(`Nenhum produto encontrado em ${f.name}`); return }
      const id = Date.now().toString()
      setListas(prev => [...prev, { id, nome: fornecedor, produtos }])
    } catch { setCmpError(`Erro ao ler ${f.name}`) }
  }

  const removerLista = (id: string) => setListas(prev => prev.filter(l => l.id !== id))

  const compararPrecos = async () => {
    if (listas.length < 2) { setCmpError('Adicione ao menos 2 listas para comparar.'); return }
    setCmpLoading(true); setCmpError('')
    try {
      // Buscar custos atuais
      const todosProdutos = listas.flatMap(l => l.produtos)
      const res = await fetch('/api/importar/pdf-vincular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produtos: todosProdutos }) })
      const vinculados: (ProdutoFornecedor & { custoPorKgAtual: number | null })[] = await res.json()

      // Montar mapa de custo atual por descrição
      const custoMap: Record<string, number | null> = {}
      vinculados.forEach(v => { if (v.custoPorKgAtual) custoMap[normalizar(v.descricao)] = v.custoPorKgAtual })

      // Coletar todos os nomes únicos (agrupando similares)
      const grupos: string[][] = []
      const todoNomes = listas.flatMap(l => l.produtos.map(p => p.descricao))
      for (const nome of todoNomes) {
        const grp = grupos.find(g => g.some(n => similar(n, nome)))
        if (grp) { if (!grp.includes(nome)) grp.push(nome) }
        else grupos.push([nome])
      }

      // Montar tabela
      const tabela: LinhaCmp[] = grupos
        .filter(g => {
          // só mostrar produtos que aparecem em pelo menos 2 fornecedores
          const fornSet = new Set(listas.filter(l => l.produtos.some(p => g.some(n => similar(p.descricao, n)))).map(l => l.id))
          return fornSet.size >= 1
        })
        .map(g => {
          const nomeProduto = g[0]
          const precos: LinhaCmp['precos'] = {}
          for (const lista of listas) {
            const match = lista.produtos.find(p => g.some(n => similar(p.descricao, n)))
            if (match) {
              const precoKg = (match as ProdutoFornecedor & { precoKg?: number }).precoKg ?? (match.qtdEmbalagem && match.qtdEmbalagem > 0 ? match.preco / match.qtdEmbalagem : match.preco)
              precos[lista.id] = { preco: match.preco, precoKg, qtd: match.qtdEmbalagem, un: match.un, produto: match }
            } else {
              precos[lista.id] = null
            }
          }
          const custoAtual = custoMap[normalizar(nomeProduto)] ?? null
          return { nomeProduto, precos, custoAtual, fornecedorEscolhido: null }
        })
        .sort((a, b) => a.nomeProduto.localeCompare(b.nomeProduto))

      setCmpTabela(tabela); setCmpEtapa('tabela')
    } catch (e) { console.error(e); setCmpError('Erro ao comparar preços.') }
    setCmpLoading(false)
  }

  const escolherFornecedor = (idxLinha: number, fornId: string | null) => {
    setCmpTabela(prev => prev.map((l, i) => i === idxLinha ? { ...l, fornecedorEscolhido: l.fornecedorEscolhido === fornId ? null : fornId } : l))
  }

  const exportarPedidos = () => {
    const selecionadas = cmpTabela.filter(l => l.fornecedorEscolhido)
    if (!selecionadas.length) { alert('Selecione ao menos um produto'); return }
    // Agrupar por fornecedor
    const porFornecedor: Record<string, typeof selecionadas> = {}
    for (const linha of selecionadas) {
      const fId = linha.fornecedorEscolhido!
      if (!porFornecedor[fId]) porFornecedor[fId] = []
      porFornecedor[fId].push(linha)
    }
    // Gerar um arquivo por fornecedor
    for (const [fId, linhas] of Object.entries(porFornecedor)) {
      const lista = listas.find(l => l.id === fId)
      if (!lista) continue
      const ws = XLSX.utils.aoa_to_sheet([
        ['Data', 'Nome do produto', 'Fornecedor', 'Quantidade', 'Valor total', 'SKU'],
        ...linhas.map(l => {
          const p = l.precos[fId]!.produto
          return [new Date().toLocaleDateString('pt-BR'), p.descricao, lista.nome, p.qtdEmbalagem ?? 1, p.preco, '']
        })
      ])
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Pedido')
      XLSX.writeFile(wb, `pedido_${lista.nome}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`)
    }
  }

  const cmpFiltrados = cmpTabela.filter(l => !cmpFiltro || l.nomeProduto.toLowerCase().includes(cmpFiltro.toLowerCase()))
  const melhorPreco = (linha: LinhaCmp) => {
    const precos = Object.entries(linha.precos).filter(([, v]) => v !== null) as [string, NonNullable<LinhaCmp['precos'][string]>][]
    if (!precos.length) return null
    return precos.reduce((a, b) => a[1].precoKg <= b[1].precoKg ? a : b)[0]
  }

  const statusCor: Record<string, string> = { confirmado: 'bg-emerald-50 border-emerald-200', sugestao: 'bg-yellow-50 border-yellow-200', novo: 'bg-blue-50 border-blue-200', sku_nao_encontrado: 'bg-red-50 border-red-200' }
  const statusLabel: Record<string, string> = { confirmado: '✅ Confirmado', sugestao: '🔍 Sugestão', novo: '➕ Produto novo', sku_nao_encontrado: '⚠️ SKU não encontrado' }
  const corVar = (v: number | null) => v === null ? 'text-gray-400' : v > 5 ? 'text-red-600 font-semibold' : v < -5 ? 'text-emerald-600 font-semibold' : 'text-gray-600'

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Importar compras</h1><p className="text-sm text-gray-500 mt-0.5">Importe planilha, consulte lista de preços ou compare fornecedores</p></div>
        {modo === 'planilha' && <button onClick={baixarModelo} className="btn-ghost text-xs"><Download size={13} /> Baixar modelo</button>}
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setModo('planilha')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${modo === 'planilha' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}><FileSpreadsheet size={15} /> Planilha de compras</button>
        <button onClick={() => setModo('lista')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${modo === 'lista' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}><FileText size={15} /> Lista de preços</button>
        <button onClick={() => setModo('comparar')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${modo === 'comparar' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}><BarChart2 size={15} /> Comparar fornecedores</button>
      </div>

      {/* ── PLANILHA ── */}
      {modo === 'planilha' && (<>
        <div className="flex items-center gap-2 text-xs">
          {['Upload', 'Validação', 'Concluído'].map((s, i) => (<div key={s} className="flex items-center gap-2"><div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${etapa === ['upload','validacao','concluido'][i] ? 'bg-indigo-600 text-white' : i < ['upload','validacao','concluido'].indexOf(etapa) ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{i < ['upload','validacao','concluido'].indexOf(etapa) ? '✓' : i + 1}</div><span className={etapa === ['upload','validacao','concluido'][i] ? 'font-semibold text-gray-800' : 'text-gray-400'}>{s}</span>{i < 2 && <div className="w-8 h-px bg-gray-200" />}</div>))}
        </div>
        {error && <Alert type="error">{error}</Alert>}
        {etapa === 'upload' && (<div className="space-y-4">
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700"><p className="font-semibold">Colunas: <strong>Data | Nome do produto | Fornecedor | Quantidade | Valor total</strong> + SKU (opcional)</p></div>
          <div className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`} onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }} onClick={() => ref.current?.click()}>
            <FileSpreadsheet size={40} className="mx-auto text-gray-300 mb-3" /><p className="font-medium text-gray-600">{file ? file.name : 'Arraste a planilha ou clique'}</p><p className="text-xs text-gray-400 mt-1">.xlsx ou .xls</p>
            <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
          {file && <button onClick={validar} disabled={loading} className="btn-primary w-full justify-center py-3">{loading ? <Spinner size={16} /> : <Search size={16} />}{loading ? 'Validando…' : 'Validar planilha'}</button>}
        </div>)}
        {etapa === 'validacao' && (<div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-xs">{Object.entries(statusLabel).map(([k, v]) => (<span key={k} className={`px-2 py-1 rounded-full border ${statusCor[k]}`}>{v}: {linhas.filter(l => l.status === k).length}</span>))}</div>
            <button onClick={() => { setEtapa('upload'); setFile(null) }} className="btn-ghost text-xs"><RefreshCw size={12} /> Recomeçar</button>
          </div>
          <div className="space-y-2">{linhas.map((linha, idx) => (<div key={idx} className={`border rounded-xl p-3 ${statusCor[linha.status]}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-gray-500">Linha {linha.linha}</span><span className="text-xs">{statusLabel[linha.status]}</span></div><div className="text-sm font-semibold">{linha.nomeProduto}</div><div className="text-xs text-gray-500">{linha.fornecedor} · {linha.quantidade} un · {brl(linha.valorTotal)}</div></div>
              <div className="shrink-0 w-64 space-y-1.5">
                {linha.status === 'sugestao' && linha.sugestoes.length > 0 && <div><label className="lbl">Produto:</label><select className="inp-sm w-full" value={linha.skuFinal} onChange={e => updateLinha(idx, { skuFinal: e.target.value, isNovo: e.target.value === '__novo__' })}><option value="">— selecione —</option>{linha.sugestoes.map(s => <option key={s.skuPrincipal} value={s.skuPrincipal}>{s.nome} ({s.skuPrincipal})</option>)}<option value="__novo__">➕ Novo</option></select></div>}
                {(linha.status === 'novo' || linha.status === 'sku_nao_encontrado' || linha.isNovo) && <div><label className="lbl">SKU novo *</label><input className="inp-sm w-full" value={linha.skuFinal === '__novo__' ? '' : linha.skuFinal} onChange={e => updateLinha(idx, { skuFinal: e.target.value, isNovo: true })} placeholder="Ex: 310" /></div>}
                {linha.status === 'confirmado' && !linha.isNovo && <div><label className="lbl">SKU confirmado</label><div className="flex gap-1"><div className="inp-sm flex-1 bg-emerald-50 text-emerald-700 font-semibold">{linha.skuFinal} — {linha.nomeCadastrado}</div><button onClick={() => updateLinha(idx, { status: 'sugestao', skuFinal: '', isNovo: false })} className="text-xs text-blue-600 px-2 py-1 border border-blue-200 rounded bg-blue-50">✏️</button></div></div>}
              </div>
            </div>
          </div>))}</div>
          <button onClick={confirmar} disabled={confirmando} className="btn-primary w-full justify-center py-3 font-semibold">{confirmando ? <Spinner size={16} /> : <CheckCircle2 size={16} />}{confirmando ? 'Lançando…' : `Confirmar ${linhas.length} compra(s)`}</button>
        </div>)}
        {etapa === 'concluido' && resultado && (<div className="space-y-4">
          <div className="card p-6 text-center"><CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" /><h2 className="text-xl font-bold mb-1">Importação concluída!</h2><div className="flex justify-center gap-6 mt-4"><div><div className="text-2xl font-bold">{String(resultado.total ?? 0)}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-2xl font-bold text-emerald-600">{String(resultado.criados ?? 0)}</div><div className="text-xs text-gray-500">Novos</div></div><div><div className="text-2xl font-bold text-indigo-600">{String(resultado.atualizados ?? 0)}</div><div className="text-xs text-gray-500">Atualizados</div></div></div></div>
          <div className="flex gap-3"><button onClick={() => { setEtapa('upload'); setFile(null); setLinhas([]); setResultado(null) }} className="btn-ghost flex-1 justify-center"><Upload size={14} /> Nova importação</button><a href="/compras" className="btn-primary flex-1 justify-center text-center">Ver compras →</a></div>
        </div>)}
      </>)}

      {/* ── LISTA ÚNICA ── */}
      {modo === 'lista' && (<div className="space-y-4">
        {listaError && <Alert type="error">{listaError}</Alert>}
        {listaEtapa === 'upload' && (<>
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700"><p className="font-semibold">Lista de preços do fornecedor</p><p>Suba o Excel com a lista. O sistema mostra variação vs. última compra e permite exportar o pedido.</p></div>
          <div className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${listaDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`} onDragOver={e => { e.preventDefault(); setListaDragOver(true) }} onDragLeave={() => setListaDragOver(false)} onDrop={e => { e.preventDefault(); setListaDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleListaFile(f) }} onClick={() => listaRef.current?.click()}>
            <FileText size={40} className="mx-auto text-gray-300 mb-3" /><p className="font-medium text-gray-600">{listaFile ? listaFile.name : 'Arraste o arquivo ou clique'}</p><p className="text-xs text-gray-400 mt-1">.xlsx, .xls ou .pdf</p>
            <input ref={listaRef} type="file" accept=".xlsx,.xls,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleListaFile(f) }} />
          </div>
          {listaFile && <button onClick={processarLista} disabled={listaLoading} className="btn-primary w-full justify-center py-3">{listaLoading ? <Spinner size={16} /> : <Search size={16} />}{listaLoading ? 'Processando…' : 'Processar lista'}</button>}
        </>)}
        {listaEtapa === 'lista' && (<div className="space-y-3">
          <div className="card p-3 flex items-center justify-between">
            <div><div className="font-semibold">{listaFornecedor}</div><div className="text-xs text-gray-500">{listaProdutos.length} produtos</div></div>
            <div className="flex gap-2">
              <button onClick={() => { setListaEtapa('upload'); setListaFile(null); setListaProdutos([]) }} className="btn-ghost text-xs"><RefreshCw size={12} /> Novo</button>
              <button onClick={exportarSelecionados} disabled={!selecionados.length} className="btn-primary text-xs"><Download size={13} /> Exportar ({selecionados.length})</button>
            </div>
          </div>
          <div className="flex gap-2"><input className="inp-sm flex-1" placeholder="Filtrar…" value={listaFiltro} onChange={e => setListaFiltro(e.target.value)} /><button onClick={() => toggleTodos(true)} className="btn-ghost text-xs">Todos</button><button onClick={() => toggleTodos(false)} className="btn-ghost text-xs">Limpar</button></div>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
            {produtosFiltrados.map((p, idx) => {
              const idxReal = listaProdutos.indexOf(p)
              return (<div key={idx} onClick={() => toggleSelecionado(idxReal)} className={`border rounded-xl p-3 cursor-pointer flex items-center gap-3 ${p.selecionado ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${p.selecionado ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>{p.selecionado && <span className="text-white text-xs">✓</span>}</div>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{p.descricao}</div>{p.skuInterno ? <div className="text-xs text-indigo-600">↳ {p.skuInterno} — {p.nomeInterno}</div> : <div className="text-xs text-gray-400">Não cadastrado</div>}</div>
                <div className="text-right shrink-0"><div className="text-sm font-semibold">{brl(p.preco)}</div>{p.qtdEmbalagem && <div className="text-xs text-gray-500">{brl(p.preco / p.qtdEmbalagem)}/kg</div>}{p.variacao !== null ? <div className={`text-xs ${corVar(p.variacao)}`}>{p.variacao > 0 ? '↑' : '↓'} {Math.abs(p.variacao).toFixed(1)}%</div> : <div className="text-xs text-gray-400">sem histórico</div>}</div>
              </div>)
            })}
          </div>
        </div>)}
      </div>)}

      {/* ── COMPARAR ── */}
      {modo === 'comparar' && (<div className="space-y-4">
        {cmpError && <Alert type="error">{cmpError}</Alert>}
        {cmpEtapa === 'upload' && (<>
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700">
            <p className="font-semibold">Compare preços entre fornecedores</p>
            <p>Adicione 2 ou mais listas de preços. O sistema cruza os produtos e mostra o mais barato por item.</p>
          </div>

          <div className="space-y-2">
            {listas.map(l => (
              <div key={l.id} className="card p-3 flex items-center justify-between">
                <div><div className="font-medium text-sm">{l.nome}</div><div className="text-xs text-gray-500">{l.produtos.length} produtos</div></div>
                <button onClick={() => removerLista(l.id)} className="text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>

          <div className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all border-gray-200 hover:border-indigo-300`} onClick={() => cmpRef.current?.click()}>
            <Plus size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="font-medium text-gray-600">Adicionar lista de fornecedor</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx ou .xls</p>
            <input ref={cmpRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) { await adicionarLista(f); e.target.value = '' } }} />
          </div>

          {listas.length >= 2 && (
            <button onClick={compararPrecos} disabled={cmpLoading} className="btn-primary w-full justify-center py-3">
              {cmpLoading ? <Spinner size={16} /> : <BarChart2 size={16} />}
              {cmpLoading ? 'Comparando…' : `Comparar ${listas.length} fornecedores`}
            </button>
          )}
        </>)}

        {cmpEtapa === 'tabela' && (<div className="space-y-3">
          <div className="card p-3 flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">{listas.map(l => l.nome).join(' × ')}</div>
              <div className="text-xs text-gray-500">{cmpTabela.length} produtos comparados</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCmpEtapa('upload')} className="btn-ghost text-xs"><RefreshCw size={12} /> Refazer</button>
              <button onClick={exportarPedidos} disabled={!cmpTabela.some(l => l.fornecedorEscolhido)} className="btn-primary text-xs"><Download size={13} /> Exportar pedidos ({cmpTabela.filter(l => l.fornecedorEscolhido).length})</button>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <input className="inp-sm flex-1" placeholder="Filtrar por produto…" value={cmpFiltro} onChange={e => setCmpFiltro(e.target.value)} />
            <div className="flex gap-1 text-xs">
              {listas.map(l => <div key={l.id} className="px-2 py-1 rounded bg-gray-100 text-gray-600 font-medium">{l.nome}</div>)}
            </div>
          </div>

          <div className="text-xs text-gray-500 flex gap-4">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 inline-block" /> Melhor preço</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-400 inline-block" /> Selecionado</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-semibold text-gray-700 min-w-[200px]">Produto</th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-500 text-xs">Custo atual</th>
                  {listas.map(l => <th key={l.id} className="text-right py-2 px-3 font-semibold text-gray-700">{l.nome}</th>)}
                </tr>
              </thead>
              <tbody>
                {cmpFiltrados.map((linha, idx) => {
                  const melhor = melhorPreco(linha)
                  return (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 font-medium text-gray-800 text-xs">{linha.nomeProduto}</td>
                      <td className="text-right py-2 px-3 text-xs text-gray-400">{linha.custoAtual ? brl(linha.custoAtual) + '/kg' : '—'}</td>
                      {listas.map(l => {
                        const p = linha.precos[l.id]
                        const isMelhor = melhor === l.id
                        const isEscolhido = linha.fornecedorEscolhido === l.id
                        return (
                          <td key={l.id} className="text-right py-2 px-3">
                            {p ? (
                              <button
                                onClick={() => escolherFornecedor(cmpTabela.indexOf(linha), l.id)}
                                className={`inline-flex flex-col items-end px-2 py-1 rounded-lg border transition-all w-full
                                  ${isEscolhido ? 'bg-indigo-100 border-indigo-400 ring-1 ring-indigo-400' : isMelhor ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                              >
                                <span className={`font-semibold text-xs ${isMelhor ? 'text-emerald-700' : 'text-gray-700'}`}>{brl(p.precoKg)}/kg</span>
                                <span className="text-[10px] text-gray-400">{brl(p.preco)} · {p.qtd ?? '?'}{p.un}</span>
                                {isMelhor && <span className="text-[10px] text-emerald-600 font-semibold">✓ menor</span>}
                              </button>
                            ) : <span className="text-gray-300 text-xs">—</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {cmpTabela.some(l => l.fornecedorEscolhido) && (
            <div className="card p-3 bg-indigo-50 border-indigo-200 flex items-center justify-between">
              <span className="text-sm text-indigo-800 font-medium">{cmpTabela.filter(l => l.fornecedorEscolhido).length} produto(s) selecionado(s) · {new Set(cmpTabela.filter(l => l.fornecedorEscolhido).map(l => l.fornecedorEscolhido)).size} pedido(s)</span>
              <button onClick={exportarPedidos} className="btn-primary text-sm"><Download size={14} /> Exportar pedidos separados</button>
            </div>
          )}
        </div>)}
      </div>)}
    </div>
  )
}