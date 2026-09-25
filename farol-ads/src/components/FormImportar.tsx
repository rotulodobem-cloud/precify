'use client'
import { useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'

export default function FormImportar({ hoje }: { hoje: string }) {
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'ok' | 'erro'>('parado')
  const [msg, setMsg] = useState('')
  const [resumo, setResumo] = useState('')

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setEstado('enviando'); setMsg(''); setResumo('')
    const r = await fetch('/api/importar', { method: 'POST', body: new FormData(e.currentTarget) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setEstado('erro'); setMsg(j.error ?? 'Falha ao importar.'); return }
    setEstado('ok')
    setMsg(`${j.anuncios} anúncios processados · ${j.custosAtualizados} custos atualizados do Precify · ${j.alertasCriados} alertas novos.`)
    setResumo(j.resumo)
  }

  return (
    <form onSubmit={enviar} className="card space-y-4 p-5">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-rdb-200 bg-rdb-50/50 px-6 py-10 text-center hover:border-rdb-400">
        <FileSpreadsheet size={32} className="text-rdb-600" aria-hidden />
        <span className="font-medium">Escolha o relatório "Anúncios patrocinados / Padrão"</span>
        <span className="text-sm text-tinta-fraca">Arquivo .xlsx ou .csv exportado do Mercado Livre (total por período)</span>
        <input type="file" name="arquivo" accept=".xlsx,.xls,.csv" required className="mt-2 text-sm" />
      </label>
      <label className="flex flex-wrap items-center gap-3 text-sm">
        Data do relatório
        <input type="date" name="capturado_em" defaultValue={hoje} max={hoje} className="campo py-1.5" />
      </label>
      <button disabled={estado === 'enviando'} className="btn-primario disabled:opacity-60"><Upload size={15} aria-hidden />{estado === 'enviando' ? 'Processando…' : 'Importar e rodar o motor'}</button>
      {msg && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${estado === 'erro' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`}>{msg}</p>}
      {resumo && <pre className="whitespace-pre-wrap rounded-lg bg-rdb-50 p-4 text-xs leading-relaxed">{resumo}</pre>}
    </form>
  )
}
