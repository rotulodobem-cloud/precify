'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Check, Eye, X } from 'lucide-react'

type Opcao = { valor: string; rotulo: string; icone: 'check' | 'eye' | 'x'; primario?: boolean }
const ICONES = { check: Check, eye: Eye, x: X }

/** Muda o status de um alerta ou recomendação (grava com a service role, no servidor). */
export default function BotoesStatus({ rota, id, opcoes }: { rota: '/api/alertas' | '/api/recomendacoes'; id: string; opcoes: Opcao[] }) {
  const router = useRouter()
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  async function enviar(status: string) {
    setOcupado(true); setMsg(null)
    const r = await fetch(rota, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    setOcupado(false)
    if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error ?? 'Não foi possível salvar.'); return }
    router.refresh()
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {opcoes.map(o => {
          const I = ICONES[o.icone]
          return <button key={o.valor} disabled={ocupado} onClick={() => enviar(o.valor)} className={`${o.primario ? 'btn-primario' : 'btn-secundario'} disabled:opacity-60`}><I size={15} aria-hidden />{o.rotulo}</button>
        })}
      </div>
      {msg && <p role="alert" className="text-xs text-amber-800">{msg}</p>}
    </div>
  )
}
