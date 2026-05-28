'use client'
import { useState, useRef, useCallback } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Search, Plus, RefreshCw, Download } from 'lucide-react'
import { Alert, Spinner } from '@/components/ui'
import * as XLSX from 'xlsx'

const brl = (v?: number | null) => v != null
  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'

const CANAL_LABEL: Record<string, string> = {
  ml_full: 'ML FULL', ml_classico: 'ML Clássico', ml_flex: 'ML Flex',
  shopee: 'Shopee', tray: 'Tray', loja: 'Loja'
}

type Etapa = 'upload' | 'validacao' | 'concluido'

interface LinhaRaw {
  linha: number
  data: string
  nomeProduto: string
  fornecedor: string
  quantidade: number
  valorTotal: number
  skuInformado?: string
}

interface LinhaValidada extends LinhaRaw {
  status: 'confirmado' | 'sugestao' | 'novo' | 'sku_nao_encontrado'
  skuSugerido: string | null
  nomeCadastrado: string | null
  custoPorKg: number | null
  precoVenda: number | null
  canalPreco: string | null
  sugestoes: { skuPrincipal: string; nome: string }[]
  // campos editáveis pelo usuário
  skuFinal: string
  isNovo: boolean
}

export default function ImportarPage() {
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [linhas, setLinhas] = useState<LinhaValidada[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<Record<string, unknown> | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { alert('Apenas arquivos .xlsx ou .xls'); return }
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

          const linhasRaw: LinhaRaw[] = rows
            .map((row, i) => {
              // Suportar diferentes nomes de coluna
              const data = String(row['Data'] ?? row['data'] ?? row['DATA'] ?? '')
              const nome = String(row['Nome do produto'] ?? row['Produto'] ?? row['produto'] ?? row['PRODUTO'] ?? '')
              const forn = String(row['Fornecedor'] ?? row['fornecedor'] ?? '')
              const qtd  = parseFloat(String(row['Quantidade'] ?? row['quantidade'] ?? row['Qtd'] ?? '0').replace(',', '.'))
              const val  = parseFloat(String(row['Valor total'] ?? row['valor_total'] ?? row['Total'] ?? row['Custo total'] ?? '0').replace(',', '.'))
              const sku  = String(row['SKU'] ?? row['sku'] ?? '').trim()

              return { linha: i + 2, data, nomeProduto: nome, fornecedor: forn, quantidade: qtd, valorTotal: val, skuInformado: sku || undefined }
            })
            .filter(r => r.nomeProduto && r.quantidade > 0 && r.valorTotal > 0)

          resolve(linhasRaw)
        } catch (err) { reject(err) }
      }
      reader.readAsArrayBuffer(f)
    })
  }, [])

  const validar = async () => {
    if (!file) return
    setLoading(true); setError('')
    try {
      const linhasRaw = await lerPlanilha(file)
      if (!linhasRaw.length) { setError('Nenhuma linha válida encontrada na planilha.'); setLoading(false); return }

      const r = await fetch('/api/importar/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linhas: linhasRaw }),
      })
      const validadas = await r.json()

      setLinhas(validadas.map((v: LinhaValidada) => ({
        ...v,
        skuFinal: v.skuSugerido ?? v.skuInformado ?? '',
        isNovo: v.status === 'novo' || v.status === 'sku_nao_encontrado',
      })))
      setEtapa('validacao')
    } catch (e) {
      setError('Erro ao ler a planilha. Verifique o formato.')
    }
    setLoading(false)
  }

  const confirmar = async () => {
    const semSku = linhas.filter(l => !l.skuFinal.trim())
    if (semSku.length) { setError(`${semSku.length} linha(s) sem SKU definido. Preencha todos antes de confirmar.`); return }

    setConfirmando(true); setError('')
    const r = await fetch('/api/importar/confirmar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linhas: linhas.map(l => ({ ...l, skuFinal: l.skuFinal.trim() })) }),
    })
    const res = await r.json()
    setResultado(res)
    setEtapa('concluido')
    setConfirmando(false)
  }

  const updateLinha = (idx: number, updates: Partial<LinhaValidada>) => {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l))
  }

  const baixarModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Data', 'Nome do produto', 'Fornecedor', 'Quantidade', 'Valor total', 'SKU'],
      ['15/05/2026', 'Psyllium', 'BRASBOL', '10', '280.00', '242'],
      ['15/05/2026', 'Camomila', 'LIBANES', '5', '150.00', ''],
    ])
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    XLSX.writeFile(wb, 'modelo_compras.xlsx')
  }

  const statusCor: Record<string, string> = {
    confirmado: 'bg-emerald-50 border-emerald-200',
    sugestao:   'bg-yellow-50 border-yellow-200',
    novo:       'bg-blue-50 border-blue-200',
    sku_nao_encontrado: 'bg-red-50 border-red-200',
  }

  const statusLabel: Record<string, string> = {
    confirmado: '✅ Confirmado',
    sugestao:   '🔍 Sugestão encontrada',
    novo:       '➕ Produto novo',
    sku_nao_encontrado: '⚠️ SKU não encontrado',
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Importar compras</h1>
          <p className="text-sm text-gray-500 mt-0.5">Importe uma planilha de pedidos e valide antes de lançar</p>
        </div>
        <button onClick={baixarModelo} className="btn-ghost text-xs">
          <Download size={13} /> Baixar planilha modelo
        </button>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 text-xs">
        {['Upload', 'Validação', 'Concluído'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs
              ${etapa === ['upload','validacao','concluido'][i] ? 'bg-indigo-600 text-white' : i < ['upload','validacao','concluido'].indexOf(etapa) ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {i < ['upload','validacao','concluido'].indexOf(etapa) ? '✓' : i + 1}
            </div>
            <span className={etapa === ['upload','validacao','concluido'][i] ? 'font-semibold text-gray-800' : 'text-gray-400'}>{s}</span>
            {i < 2 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* ── ETAPA 1: UPLOAD ── */}
      {etapa === 'upload' && (
        <div className="space-y-4">
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700 space-y-1">
            <p className="font-semibold">Formato da planilha:</p>
            <p>Colunas obrigatórias: <strong>Data | Nome do produto | Fornecedor | Quantidade | Valor total</strong></p>
            <p>Coluna opcional: <strong>SKU</strong> — se não informar, o sistema busca pelo nome do produto</p>
            <p>Clique em <strong>"Baixar planilha modelo"</strong> para ver o formato correto.</p>
          </div>

          <div
            className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
              ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => ref.current?.click()}
          >
            <FileSpreadsheet size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">{file ? file.name : 'Arraste a planilha ou clique para selecionar'}</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx ou .xls</p>
            <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>

          {file && (
            <button onClick={validar} disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? <Spinner size={16} /> : <Search size={16} />}
              {loading ? 'Validando…' : 'Validar planilha'}
            </button>
          )}
        </div>
      )}

      {/* ── ETAPA 2: VALIDAÇÃO ── */}
      {etapa === 'validacao' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-xs">
              {Object.entries(statusLabel).map(([k, v]) => (
                <span key={k} className={`px-2 py-1 rounded-full border ${statusCor[k]}`}>{v}: {linhas.filter(l => l.status === k).length}</span>
              ))}
            </div>
            <button onClick={() => { setEtapa('upload'); setFile(null) }} className="btn-ghost text-xs">
              <RefreshCw size={12} /> Recomeçar
            </button>
          </div>

          <div className="space-y-2">
            {linhas.map((linha, idx) => (
              <div key={idx} className={`border rounded-xl p-3 ${statusCor[linha.status]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-500">Linha {linha.linha}</span>
                      <span className="text-xs">{statusLabel[linha.status]}</span>
                    </div>
                    <div className="text-sm font-semibold text-gray-800">{linha.nomeProduto}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {linha.fornecedor} · {linha.quantidade} kg/un · {brl(linha.valorTotal)} · 
                      custo unit: <strong>{brl(linha.valorTotal / linha.quantidade)}</strong>
                    </div>
                    {linha.precoVenda && (
                      <div className="text-xs text-indigo-600 mt-0.5">
                        Último preço de venda: <strong>{brl(linha.precoVenda)}</strong>
                        {linha.canalPreco && ` (${CANAL_LABEL[linha.canalPreco] ?? linha.canalPreco})`}
                      </div>
                    )}
                  </div>

                  {/* Controles de SKU */}
                  <div className="shrink-0 w-64 space-y-1.5">
                    {linha.status === 'sugestao' && linha.sugestoes.length > 0 && (
                      <div>
                        <label className="lbl">Selecione o produto:</label>
                        <select className="inp-sm w-full" value={linha.skuFinal}
                          onChange={e => updateLinha(idx, { skuFinal: e.target.value, isNovo: false })}>
                          <option value="">— selecione —</option>
                          {linha.sugestoes.map(s => (
                            <option key={s.skuPrincipal} value={s.skuPrincipal}>{s.nome} ({s.skuPrincipal})</option>
                          ))}
                          <option value="__novo__">➕ Cadastrar como novo</option>
                        </select>
                      </div>
                    )}

                    {(linha.status === 'novo' || linha.status === 'sku_nao_encontrado' || linha.skuFinal === '__novo__') && (
                      <div>
                        <label className="lbl">SKU novo *</label>
                        <input className="inp-sm w-full" value={linha.skuFinal === '__novo__' ? '' : linha.skuFinal}
                          onChange={e => updateLinha(idx, { skuFinal: e.target.value, isNovo: true })}
                          placeholder="Ex: 310" />
                        <p className="text-[10px] text-blue-600 mt-0.5">Será criado com 4 variações (100g, 250g, 500g, 1kg)</p>
                      </div>
                    )}

                    {linha.status === 'confirmado' && (
                      <div>
                        <label className="lbl">SKU confirmado</label>
                        <div className="inp-sm w-full bg-emerald-50 text-emerald-700 font-semibold">
                          {linha.skuFinal} — {linha.nomeCadastrado}
                        </div>
                      </div>
                    )}

                    {/* Preço de venda editável */}
                    <div>
                      <label className="lbl">Preço de venda (R$)</label>
                      <input className="inp-sm w-full" type="number" step="0.01"
                        value={linha.precoVenda ?? ''}
                        onChange={e => updateLinha(idx, { precoVenda: e.target.value ? parseFloat(e.target.value) : null })}
                        placeholder="Preenchido automaticamente" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={confirmar} disabled={confirmando}
            className="btn-primary w-full justify-center py-3 text-base font-semibold">
            {confirmando ? <Spinner size={16} /> : <CheckCircle2 size={16} />}
            {confirmando ? 'Lançando compras…' : `Confirmar e lançar ${linhas.length} compra(s)`}
          </button>
        </div>
      )}

      {/* ── ETAPA 3: CONCLUÍDO ── */}
      {etapa === 'concluido' && resultado && (
        <div className="space-y-4">
          <div className="card p-6 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
            <h2 className="text-xl font-bold text-gray-800 mb-1">Importação concluída!</h2>
            <div className="flex justify-center gap-6 mt-4 text-sm">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-800">{String(resultado.total ?? 0)}</div>
                <div className="text-gray-500 text-xs">Total</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{String(resultado.criados ?? 0)}</div>
                <div className="text-gray-500 text-xs">Novos produtos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">{String(resultado.atualizados ?? 0)}</div>
                <div className="text-gray-500 text-xs">Custos atualizados</div>
              </div>
              {Number(resultado.erros ?? 0) > 0 && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{String(resultado.erros)}</div>
                  <div className="text-gray-500 text-xs">Erros</div>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setEtapa('upload'); setFile(null); setLinhas([]); setResultado(null) }}
              className="btn-ghost flex-1 justify-center">
              <Upload size={14} /> Nova importação
            </button>
            <a href="/compras" className="btn-primary flex-1 justify-center text-center">
              Ver compras →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
