'use client'
import { useState, useRef, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, Search, RefreshCw, Download, FileText } from 'lucide-react'
import { Alert, Spinner } from '@/components/ui'
import * as XLSX from 'xlsx'
import { parsearListaFornecedor, type ProdutoFornecedor } from '@/lib/parsearPDF'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'
const CANAL_LABEL: Record<string, string> = { ml_full: 'ML FULL', ml_classico: 'ML Clássico', ml_flex: 'ML Flex', shopee: 'Shopee', tray: 'Tray', loja: 'Loja' }
type Etapa = 'upload' | 'validacao' | 'concluido'
type Modo = 'planilha' | 'lista'

interface LinhaRaw { linha: number; data: string; nomeProduto: string; fornecedor: string; quantidade: number; valorTotal: number; skuInformado?: string }
interface LinhaValidada extends LinhaRaw { status: 'confirmado' | 'sugestao' | 'novo' | 'sku_nao_encontrado'; skuSugerido: string | null; nomeCadastrado: string | null; custoPorKg: number | null; precoVenda: number | null; canalPreco: string | null; sugestoes: { skuPrincipal: string; nome: string }[]; skuFinal: string; isNovo: boolean }
interface ProdutoLista extends ProdutoFornecedor { selecionado: boolean; skuInterno: string | null; nomeInterno: string | null; custoPorKgAtual: number | null; variacao: number | null }

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

  // lista de preços
  const [listaFile, setListaFile] = useState<File | null>(null)
  const [listaDragOver, setListaDragOver] = useState(false)
  const [listaLoading, setListaLoading] = useState(false)
  const [listaError, setListaError] = useState('')
  const [listaProdutos, setListaProdutos] = useState<ProdutoLista[]>([])
  const [listaFornecedor, setListaFornecedor] = useState('')
  const [listaFiltro, setListaFiltro] = useState('')
  const [listaEtapa, setListaEtapa] = useState<'upload' | 'lista'>('upload')
  const listaRef = useRef<HTMLInputElement>(null)

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

  // ── lista de preços ──
  const handleListaFile = (f: File) => {
    setListaFile(f); setListaError('')
  }

  const processarLista = async () => {
    if (!listaFile) return
    setListaLoading(true); setListaError('')
    try {
      let produtos: ProdutoFornecedor[] = []
      let fornecedor = ''

      if (listaFile.name.match(/\.(xlsx|xls)$/i)) {
        // Ler Excel
        const arrayBuffer = await listaFile.arrayBuffer()
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        fornecedor = String(rows[0]?.['Marca'] ?? rows[0]?.['Fornecedor'] ?? 'Fornecedor')
        produtos = rows.map(row => {
          const descricao = String(row['Descrição'] ?? row['Descricao'] ?? row['descricao'] ?? row['Nome'] ?? '')
          const preco = parseFloat(String(row['Preço'] ?? row['Preco'] ?? row['preco'] ?? row['Valor'] ?? '0').toString().replace(',', '.'))
          const un = String(row['Unidade'] ?? row['UN'] ?? row['un'] ?? '')
          const codigoFornecedor = String(row['Código'] ?? row['Codigo'] ?? row['codigo'] ?? '')
          const forn = String(row['Marca'] ?? row['Fornecedor'] ?? row['fornecedor'] ?? '')
          if (!descricao || preco <= 0) return null
          const m = descricao.match(/(\d+(?:[.,]\d+)?)\s*(KG|G|LT|ML)\b/i)
          const qtd = m ? parseFloat(m[1].replace(',','.')) * (m[2].toUpperCase()==='G'||m[2].toUpperCase()==='ML' ? 0.001 : 1) : null
          const unEmb = m ? (m[2].toUpperCase()==='G'?'KG':m[2].toUpperCase()==='ML'?'LT':m[2].toUpperCase()) : null
          return { codigoFornecedor, un, descricao, preco, qtdEmbalagem: qtd, unidadeEmbalagem: unEmb, fornecedor: forn, dataValidade: null }
        }).filter(Boolean) as ProdutoFornecedor[]
      } else {
        // Ler PDF
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const arrayBuffer = await listaFile.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        let textoCompleto = ''
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i)
          const content = await page.getTextContent()
          textoCompleto += content.items.map((item: { str?: string }) => 'str' in item ? item.str ?? '' : '').join(' ') + '\n'
        }
        const resultado = parsearListaFornecedor(textoCompleto)
        produtos = resultado.produtos
        fornecedor = resultado.fornecedor
      }

      if (!produtos.length) { setListaError('Nenhum produto encontrado.'); setListaLoading(false); return }

      const res = await fetch('/api/importar/pdf-vincular', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ produtos }) })
      const vinculados = await res.json()
      setListaProdutos(vinculados.map((v: ProdutoLista) => ({ ...v, selecionado: false })))
      setListaFornecedor(fornecedor)
      setListaEtapa('lista')
    } catch (e) { console.error(e); setListaError('Erro ao processar o arquivo.') }
    setListaLoading(false)
  }

  const toggleSelecionado = (idx: number) => setListaProdutos(prev => prev.map((p, i) => i === idx ? { ...p, selecionado: !p.selecionado } : p))
  const toggleTodos = (val: boolean) => setListaProdutos(prev => prev.map(p => ({ ...p, selecionado: val })))
  const produtosFiltrados = listaProdutos.filter(p => !listaFiltro || p.descricao.toLowerCase().includes(listaFiltro.toLowerCase()) || p.nomeInterno?.toLowerCase().includes(listaFiltro.toLowerCase()))
  const selecionados = listaProdutos.filter(p => p.selecionado)

  const exportarSelecionados = () => {
    if (!selecionados.length) { alert('Selecione ao menos um produto'); return }
    const ws = XLSX.utils.aoa_to_sheet([
      ['Data', 'Nome do produto', 'Fornecedor', 'Quantidade', 'Valor total', 'SKU'],
      ...selecionados.map(p => [new Date().toLocaleDateString('pt-BR'), p.descricao, p.fornecedor, p.qtdEmbalagem ?? 1, p.preco, p.skuInterno ?? ''])
    ])
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    XLSX.writeFile(wb, `pedido_${listaFornecedor}_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')}.xlsx`)
  }

  const statusCor: Record<string, string> = { confirmado: 'bg-emerald-50 border-emerald-200', sugestao: 'bg-yellow-50 border-yellow-200', novo: 'bg-blue-50 border-blue-200', sku_nao_encontrado: 'bg-red-50 border-red-200' }
  const statusLabel: Record<string, string> = { confirmado: '✅ Confirmado', sugestao: '🔍 Sugestão', novo: '➕ Produto novo', sku_nao_encontrado: '⚠️ SKU não encontrado' }
  const corVar = (v: number | null) => v === null ? 'text-gray-400' : v > 5 ? 'text-red-600 font-semibold' : v < -5 ? 'text-emerald-600 font-semibold' : 'text-gray-600'

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div><h1 className="page-title">Importar compras</h1><p className="text-sm text-gray-500 mt-0.5">Importe planilha de compras ou lista de preços do fornecedor</p></div>
        {modo === 'planilha' && <button onClick={baixarModelo} className="btn-ghost text-xs"><Download size={13} /> Baixar modelo</button>}
      </div>

      <div className="flex gap-2">
        <button onClick={() => setModo('planilha')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${modo === 'planilha' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}><FileSpreadsheet size={15} /> Planilha de compras</button>
        <button onClick={() => setModo('lista')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${modo === 'lista' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}><FileText size={15} /> Lista de preços do fornecedor</button>
      </div>

      {modo === 'planilha' && (<>
        <div className="flex items-center gap-2 text-xs">
          {['Upload', 'Validação', 'Concluído'].map((s, i) => (<div key={s} className="flex items-center gap-2"><div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${etapa === ['upload','validacao','concluido'][i] ? 'bg-indigo-600 text-white' : i < ['upload','validacao','concluido'].indexOf(etapa) ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{i < ['upload','validacao','concluido'].indexOf(etapa) ? '✓' : i + 1}</div><span className={etapa === ['upload','validacao','concluido'][i] ? 'font-semibold text-gray-800' : 'text-gray-400'}>{s}</span>{i < 2 && <div className="w-8 h-px bg-gray-200" />}</div>))}
        </div>
        {error && <Alert type="error">{error}</Alert>}
        {etapa === 'upload' && (<div className="space-y-4">
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700 space-y-1"><p className="font-semibold">Formato esperado:</p><p>Colunas: <strong>Data | Nome do produto | Fornecedor | Quantidade | Valor total</strong> + SKU (opcional)</p></div>
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
              <div className="flex-1"><div className="flex items-center gap-2 mb-1"><span className="text-xs font-semibold text-gray-500">Linha {linha.linha}</span><span className="text-xs">{statusLabel[linha.status]}</span></div><div className="text-sm font-semibold text-gray-800">{linha.nomeProduto}</div><div className="text-xs text-gray-500 mt-0.5">{linha.fornecedor} · {linha.quantidade} kg/un · {brl(linha.valorTotal)}</div>{linha.precoVenda && <div className="text-xs text-indigo-600 mt-0.5">Último preço: <strong>{brl(linha.precoVenda)}</strong>{linha.canalPreco && ` (${CANAL_LABEL[linha.canalPreco] ?? linha.canalPreco})`}</div>}</div>
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
          <div className="card p-6 text-center"><CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" /><h2 className="text-xl font-bold mb-1">Importação concluída!</h2><div className="flex justify-center gap-6 mt-4 text-sm"><div><div className="text-2xl font-bold">{String(resultado.total ?? 0)}</div><div className="text-xs text-gray-500">Total</div></div><div><div className="text-2xl font-bold text-emerald-600">{String(resultado.criados ?? 0)}</div><div className="text-xs text-gray-500">Novos</div></div><div><div className="text-2xl font-bold text-indigo-600">{String(resultado.atualizados ?? 0)}</div><div className="text-xs text-gray-500">Atualizados</div></div></div></div>
          <div className="flex gap-3"><button onClick={() => { setEtapa('upload'); setFile(null); setLinhas([]); setResultado(null) }} className="btn-ghost flex-1 justify-center"><Upload size={14} /> Nova importação</button><a href="/compras" className="btn-primary flex-1 justify-center text-center">Ver compras →</a></div>
        </div>)}
      </>)}

      {modo === 'lista' && (<div className="space-y-4">
        {listaError && <Alert type="error">{listaError}</Alert>}
        {listaEtapa === 'upload' && (<>
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700 space-y-1">
            <p className="font-semibold">Lista de preços do fornecedor</p>
            <p>Suba o Excel ou PDF com a lista de preços. O sistema mostra variação vs. última compra e permite exportar o pedido.</p>
          </div>
          <div className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${listaDragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`} onDragOver={e => { e.preventDefault(); setListaDragOver(true) }} onDragLeave={() => setListaDragOver(false)} onDrop={e => { e.preventDefault(); setListaDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleListaFile(f) }} onClick={() => listaRef.current?.click()}>
            <FileText size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">{listaFile ? listaFile.name : 'Arraste o arquivo ou clique'}</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx, .xls ou .pdf</p>
            <input ref={listaRef} type="file" accept=".xlsx,.xls,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleListaFile(f) }} />
          </div>
          {listaFile && <button onClick={processarLista} disabled={listaLoading} className="btn-primary w-full justify-center py-3">{listaLoading ? <Spinner size={16} /> : <Search size={16} />}{listaLoading ? 'Processando…' : 'Processar lista de preços'}</button>}
        </>)}
        {listaEtapa === 'lista' && (<div className="space-y-3">
          <div className="card p-3 flex items-center justify-between gap-4">
            <div><div className="font-semibold text-gray-800">{listaFornecedor}</div><div className="text-xs text-gray-500">{listaProdutos.length} produtos encontrados</div></div>
            <div className="flex gap-2">
              <button onClick={() => { setListaEtapa('upload'); setListaFile(null); setListaProdutos([]) }} className="btn-ghost text-xs"><RefreshCw size={12} /> Novo arquivo</button>
              <button onClick={exportarSelecionados} disabled={!selecionados.length} className="btn-primary text-xs"><Download size={13} /> Exportar pedido ({selecionados.length})</button>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <input className="inp-sm flex-1" placeholder="Filtrar por nome…" value={listaFiltro} onChange={e => setListaFiltro(e.target.value)} />
            <button onClick={() => toggleTodos(true)} className="btn-ghost text-xs">Todos</button>
            <button onClick={() => toggleTodos(false)} className="btn-ghost text-xs">Limpar</button>
          </div>
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto pr-1">
            {produtosFiltrados.map((p, idx) => {
              const idxReal = listaProdutos.indexOf(p)
              return (<div key={idx} onClick={() => toggleSelecionado(idxReal)} className={`border rounded-xl p-3 cursor-pointer flex items-center gap-3 transition-all ${p.selecionado ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${p.selecionado ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>{p.selecionado && <span className="text-white text-xs">✓</span>}</div>
                <div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-xs text-gray-400">{p.un}</span><span className="text-sm font-medium text-gray-800 truncate">{p.descricao}</span></div>{p.skuInterno ? <div className="text-xs text-indigo-600 mt-0.5">↳ {p.skuInterno} — {p.nomeInterno}</div> : <div className="text-xs text-gray-400 mt-0.5">Não cadastrado</div>}</div>
                <div className="text-right shrink-0"><div className="text-sm font-semibold">{brl(p.preco)}</div>{p.qtdEmbalagem && <div className="text-xs text-gray-500">{brl(p.preco / p.qtdEmbalagem)}/{p.unidadeEmbalagem ?? 'kg'}</div>}{p.variacao !== null ? <div className={`text-xs mt-0.5 ${corVar(p.variacao)}`}>{p.variacao > 0 ? '↑' : '↓'} {Math.abs(p.variacao).toFixed(1)}%</div> : <div className="text-xs text-gray-400">sem histórico</div>}</div>
              </div>)
            })}
          </div>
          {selecionados.length > 0 && <div className="card p-3 bg-indigo-50 border-indigo-200 flex items-center justify-between"><span className="text-sm text-indigo-800 font-medium">{selecionados.length} produto(s) selecionado(s)</span><button onClick={exportarSelecionados} className="btn-primary text-sm"><Download size={14} /> Exportar como pedido</button></div>}
        </div>)}
      </div>)}
    </div>
  )
}