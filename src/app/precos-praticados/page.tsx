'use client'
import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, Search, RefreshCw } from 'lucide-react'
import { Alert, Spinner } from '@/components/ui'
import * as XLSX from 'xlsx'

const brl = (v?: number | null) => v != null ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'

interface LinhaRaw { linha: number; codigo: string; preco: number }
interface LinhaValidada extends LinhaRaw {
  precoNovo: number; encontrado: boolean; calculoId: string | null
  sku: string | null; nome: string | null; precoAntigo: number | null
}

type Etapa = 'upload' | 'validacao' | 'concluido'
const PASSOS: Etapa[] = ['upload', 'validacao', 'concluido']

export default function PrecosPraticadosPage() {
  const [etapa, setEtapa] = useState<Etapa>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [linhas, setLinhas] = useState<LinhaValidada[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<{ atualizados: number; erros: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { setError('Apenas .xlsx ou .xls'); return }
    setFile(f); setError('')
  }

  const lerPlanilha = (f: File): Promise<LinhaRaw[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
          const linhasRaw: LinhaRaw[] = rows.map((row, i) => ({
            linha: i + 2,
            codigo: String(row['Código'] ?? row['Codigo'] ?? row['SKU'] ?? row['Sku'] ?? row['codigo'] ?? '').trim(),
            preco: parseFloat(String(row['Preço'] ?? row['Preco'] ?? row['Valor'] ?? row['preco'] ?? '0').replace(',', '.')),
          })).filter(r => r.codigo && r.preco > 0)
          resolve(linhasRaw)
        } catch (err) { reject(err) }
      }
      reader.readAsArrayBuffer(f)
    })
  }

  const validar = async () => {
    if (!file) return
    setLoading(true); setError('')
    try {
      const linhasRaw = await lerPlanilha(file)
      if (!linhasRaw.length) {
        setError('Nenhuma linha válida encontrada — confira se a planilha tem colunas de código e preço.')
        setLoading(false); return
      }
      const r = await fetch('/api/precos-praticados/validar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linhas: linhasRaw }),
      })
      const validadas: LinhaValidada[] = await r.json()
      setLinhas(validadas)
      setEtapa('validacao')
    } catch { setError('Erro ao ler a planilha.') }
    setLoading(false)
  }

  const confirmar = async () => {
    const encontrados = linhas.filter(l => l.encontrado && l.calculoId)
    if (!encontrados.length) { setError('Nenhuma linha encontrada pra atualizar.'); return }
    setConfirmando(true); setError('')
    const r = await fetch('/api/precos-praticados/confirmar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linhas: encontrados.map(l => ({ calculoId: l.calculoId, precoNovo: l.precoNovo })) }),
    })
    setResultado(await r.json())
    setEtapa('concluido')
    setConfirmando(false)
  }

  const encontrados = linhas.filter(l => l.encontrado)
  const naoEncontrados = linhas.filter(l => !l.encontrado)

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="page-title">Preços praticados — Loja Própria</h1>
        <p className="text-sm text-gray-500 mt-0.5">Suba a planilha exportada do Bling pra atualizar os preços praticados em massa</p>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {['Upload', 'Prévia', 'Concluído'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${etapa === PASSOS[i] ? 'bg-indigo-600 text-white' : i < PASSOS.indexOf(etapa) ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {i < PASSOS.indexOf(etapa) ? '✓' : i + 1}
            </div>
            <span className={etapa === PASSOS[i] ? 'font-semibold text-gray-800' : 'text-gray-400'}>{s}</span>
            {i < 2 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {etapa === 'upload' && (
        <div className="space-y-4">
          <div className="card p-4 bg-blue-50 border-blue-100 text-sm text-blue-700">
            <p className="font-semibold">Colunas esperadas: <strong>Código (ou SKU)</strong> e <strong>Preço</strong></p>
            <p className="mt-1">O código deve bater com o SKU de variação já cadastrado no Multicanal RdB (ex: 242-O1kg).</p>
          </div>
          <div className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            onClick={() => ref.current?.click()}>
            <FileSpreadsheet size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-gray-600">{file ? file.name : 'Arraste a planilha ou clique'}</p>
            <p className="text-xs text-gray-400 mt-1">.xlsx ou .xls</p>
            <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </div>
          {file && (
            <button onClick={validar} disabled={loading} className="btn-primary w-full justify-center py-3">
              {loading ? <Spinner size={16} /> : <Search size={16} />}{loading ? 'Lendo…' : 'Ler planilha'}
            </button>
          )}
        </div>
      )}

      {etapa === 'validacao' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-3 text-xs">
              <span className="px-2 py-1 rounded-full border bg-emerald-50 border-emerald-200">Encontrados: {encontrados.length}</span>
              <span className="px-2 py-1 rounded-full border bg-red-50 border-red-200">Não encontrados: {naoEncontrados.length}</span>
            </div>
            <button onClick={() => { setEtapa('upload'); setFile(null); setLinhas([]) }} className="btn-ghost text-xs"><RefreshCw size={12} /> Recomeçar</button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="tbl-head sticky top-0">
                  <tr><th className="th">Código</th><th className="th">Produto</th><th className="th-r">Preço antigo</th><th className="th-r">Preço novo</th></tr>
                </thead>
                <tbody>
                  {encontrados.map((l, i) => (
                    <tr key={i} className="tr-row">
                      <td className="td font-mono text-xs">{l.codigo}</td>
                      <td className="td text-xs">{l.nome}</td>
                      <td className="td-r text-xs text-gray-400">{brl(l.precoAntigo)}</td>
                      <td className="td-r text-xs font-semibold">{brl(l.precoNovo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {naoEncontrados.length > 0 && (
            <div className="card p-3 bg-red-50 border-red-200">
              <p className="text-sm font-semibold text-red-700 mb-2">Códigos não encontrados no Precify ({naoEncontrados.length}) — não serão atualizados</p>
              <div className="flex flex-wrap gap-1.5">
                {naoEncontrados.map((l, i) => <span key={i} className="text-xs font-mono bg-white border border-red-200 rounded px-1.5 py-0.5">{l.codigo}</span>)}
              </div>
            </div>
          )}

          <button onClick={confirmar} disabled={confirmando || !encontrados.length} className="btn-primary w-full justify-center py-3 font-semibold">
            {confirmando ? <Spinner size={16} /> : <CheckCircle2 size={16} />}
            {confirmando ? 'Gravando…' : `Confirmar atualização de ${encontrados.length} preço(s)`}
          </button>
        </div>
      )}

      {etapa === 'concluido' && resultado && (
        <div className="space-y-4">
          <div className="card p-6 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-3" />
            <h2 className="text-xl font-bold mb-1">Preços atualizados!</h2>
            <p className="text-sm text-gray-500 mt-2">{resultado.atualizados} produto(s) atualizado(s)</p>
            {resultado.erros.length > 0 && <p className="text-sm text-red-600 mt-2">{resultado.erros.length} erro(s) — confira os logs</p>}
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setEtapa('upload'); setFile(null); setLinhas([]); setResultado(null) }} className="btn-ghost flex-1 justify-center"><Upload size={14} /> Nova importação</button>
            <a href="/precificacao-multicanal" className="btn-primary flex-1 justify-center text-center">Voltar ao Multicanal RdB →</a>
          </div>
        </div>
      )}
    </div>
  )
}
