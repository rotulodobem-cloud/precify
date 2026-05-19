'use client'
import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'
import { Alert, Spinner } from '@/components/ui'

interface Resultado {
  tipo: string; importados: number; erros: string[]
  avisos: string[]; mensagem?: string; custosAtualizados?: number
}

export default function ImportarPage() {
  const [tipo, setTipo] = useState<'auto' | 'compras' | 'precificacao'>('auto')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) { alert('Apenas arquivos .xlsx ou .xls'); return }
    setFile(f); setResultado(null)
  }

  const importar = async () => {
    if (!file) return
    setLoading(true); setResultado(null)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('tipo', tipo)
    const r = await fetch('/api/importar', { method: 'POST', body: fd })
    setResultado(await r.json())
    setLoading(false)
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="page-title">Importar planilha</h1>
        <p className="text-sm text-gray-500 mt-0.5">Importe a <strong>Planilha de Precificação</strong> (ML/Shopee) ou o <strong>Controle de Compras</strong></p>
      </div>

      {/* Tipo */}
      <div className="card p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tipo de planilha</p>
        {([
          ['auto',         'Detectar automaticamente', 'O sistema identifica se é planilha de compras ou precificação pelo nome das abas'],
          ['compras',      'Controle de Compras',       'CONTROLE_DE_COMPRAS.xlsx — importa aba "Compras", atualiza custo dos produtos automaticamente'],
          ['precificacao', 'Planilha de Precificação',  'Planilha_de_Precificação.xlsx — importa abas ML e Shopee com produtos, custos e preços'],
        ] as const).map(([val, label, desc]) => (
          <label key={val} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${tipo === val ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}>
            <input type="radio" value={val} checked={tipo === val} onChange={() => setTipo(val)} className="mt-0.5 accent-indigo-600" />
            <div>
              <div className="font-medium text-gray-800 text-sm">{label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
            </div>
          </label>
        ))}
      </div>

      {/* Drop zone */}
      <div
        className={`card p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all border-2 border-dashed ${dragOver ? 'border-indigo-400 bg-indigo-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
        onClick={() => ref.current?.click()}
      >
        <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        {file ? (
          <div className="text-center">
            <FileSpreadsheet size={40} className="text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-gray-800">{file.name}</p>
            <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB</p>
            <button className="mt-3 text-xs text-red-500 hover:text-red-700 flex items-center gap-1 mx-auto"
              onClick={e => { e.stopPropagation(); setFile(null); setResultado(null) }}>
              <X size={12} /> Remover
            </button>
          </div>
        ) : (
          <div className="text-center">
            <Upload size={36} className="text-gray-300 mx-auto mb-2" />
            <p className="font-medium text-gray-500">Arraste o arquivo aqui ou clique para selecionar</p>
            <p className="text-xs text-gray-400 mt-1">Aceita .xlsx e .xls</p>
          </div>
        )}
      </div>

      <button onClick={importar} disabled={!file || loading}
        className="btn-primary w-full justify-center py-3 text-base font-semibold disabled:opacity-50">
        {loading ? <><Spinner size={18} /> Importando…</> : 'Importar planilha'}
      </button>

      {/* Resultado */}
      {resultado && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-500" />
            <h3 className="font-semibold text-gray-800">Importação concluída</h3>
          </div>

          {resultado.mensagem && <Alert type="success">{resultado.mensagem}</Alert>}

          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              [resultado.importados, 'Importados', 'bg-emerald-50 text-emerald-700'],
              [resultado.avisos?.length ?? 0, 'Avisos', 'bg-amber-50 text-amber-700'],
              [resultado.erros?.length ?? 0, 'Erros', 'bg-red-50 text-red-700'],
            ].map(([n, label, cls]) => (
              <div key={String(label)} className={`rounded-xl p-3 ${cls}`}>
                <div className="text-2xl font-bold">{n}</div>
                <div className="text-xs mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {resultado.avisos?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">Avisos ({resultado.avisos.length}):</p>
              <div className="max-h-40 overflow-auto space-y-1">
                {resultado.avisos.map((a, i) => <div key={i} className="text-xs bg-amber-50 text-amber-700 rounded px-2 py-1">{a}</div>)}
              </div>
            </div>
          )}
          {resultado.erros?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1">Erros ({resultado.erros.length}):</p>
              <div className="max-h-40 overflow-auto space-y-1">
                {resultado.erros.map((e, i) => <div key={i} className="text-xs bg-red-50 text-red-700 rounded px-2 py-1">{e}</div>)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Referência estrutura */}
      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Info size={15} className="text-indigo-500" /> Estrutura esperada das planilhas
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">📊 Planilha de Precificação</p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-0.5">
              <div className="text-gray-400">— Aba ML —</div>
              <div>SKU | CUSTOS | Kg | 100 | 250 | 500 | 1Kg</div>
              <div>COMISSAO ML | FRETE FULL | IMPOSTO</div>
              <div>EMBALAGEM + Coleta FULL | CUSTO PRODUTO</div>
              <div>PREÇO DE VENDA | PV MINIMO | PV Máximo</div>
              <div className="text-gray-400 mt-1">— Aba Shopee —</div>
              <div>SKU | CUSTOS | COMISSAO Shoppee | Taxa Fixa</div>
              <div>IMPOSTO | EMBALAGEM + Coleta FULL</div>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2">🛒 Controle de Compras</p>
            <div className="bg-gray-50 rounded-lg p-3 text-xs font-mono text-gray-600 space-y-0.5">
              <div className="text-gray-400">— Aba Compras —</div>
              <div>Data_compra | SKU | Produto</div>
              <div>Fornecedor | Quantidade | Custo_total</div>
              <div>Frete | Outros_custos</div>
              <div>Custo_unitario (calculado)</div>
              <div>Preço de Venda | Margem</div>
            </div>
            <p className="text-xs text-gray-400 mt-2">Ao importar, o custo de cada produto é atualizado automaticamente e a variação vs compra anterior é calculada.</p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
          <AlertTriangle size={13} className="inline mr-1" />
          <strong>Dica:</strong> A importação é incremental — pode reimportar sem duplicar. SKUs novos são criados automaticamente. A importação da planilha de compras atualiza o custo/kg de todos os produtos encontrados.
        </div>
      </div>
    </div>
  )
}
