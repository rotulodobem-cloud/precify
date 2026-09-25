'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Calendar, FilterX } from 'lucide-react'
import { useTransition } from 'react'
import { PERIODOS } from '@/lib/filtros'
import { CANAIS, ESTADOS } from '@/lib/tipos'
import { ESTILO_ESTADO } from './selos'

/**
 * Filtros sempre visíveis no topo (nunca escondidos em menu). Ficam na URL, então
 * valem para todas as telas ao mesmo tempo.
 */
export default function BarraFiltros({ campanhas, de, ate }: { campanhas: string[]; de: string; ate: string }) {
  const router = useRouter()
  const path = usePathname()
  const sp = useSearchParams()
  const [pendente, iniciar] = useTransition()

  const mudar = (mudancas: Record<string, string | null>) => {
    const q = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(mudancas)) if (v) q.set(k, v); else q.delete(k)
    q.delete('pagina')
    iniciar(() => router.push(`${path}${q.toString() ? `?${q}` : ''}`, { scroll: false }))
  }

  const periodo = sp.get('periodo') ?? '30d'
  const temFiltro = ['canal', 'campanha', 'estado'].some(k => sp.get(k)) || periodo !== '30d'
  const rotulo = 'text-xs font-medium text-tinta-fraca'
  const sel = 'campo py-1.5 pr-8 min-w-0'

  return (
    <div className={`card flex flex-wrap items-end gap-3 px-4 py-3 transition-opacity ${pendente ? 'opacity-60' : ''}`} role="search" aria-label="Filtros globais">
      <label className="flex flex-col gap-1">
        <span className={rotulo}><Calendar size={12} className="inline -mt-0.5 mr-1" aria-hidden />Período</span>
        <select className={sel} value={periodo}
          onChange={e => mudar(e.target.value === 'custom' ? { periodo: 'custom', de, ate } : { periodo: e.target.value === '30d' ? null : e.target.value, de: null, ate: null })}>
          {PERIODOS.map(p => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
        </select>
      </label>
      {periodo === 'custom' && (
        <>
          <label className="flex flex-col gap-1"><span className={rotulo}>De</span>
            <input type="date" className="campo py-1.5" defaultValue={de} max={ate} onChange={e => e.target.value && mudar({ de: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1"><span className={rotulo}>Até</span>
            <input type="date" className="campo py-1.5" defaultValue={ate} min={de} onChange={e => e.target.value && mudar({ ate: e.target.value })} />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Canal</span>
        <select className={sel} value={sp.get('canal') ?? ''} onChange={e => mudar({ canal: e.target.value || null })}>
          <option value="">Todos os canais</option>
          {CANAIS.map(c => <option key={c.slug} value={c.slug} disabled={!c.ativo}>{c.nome}{c.ativo ? '' : ' (em breve)'}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 min-w-0 basis-full sm:basis-auto sm:w-64">
        <span className={rotulo}>Campanha</span>
        <select className={`${sel} w-full`} value={sp.get('campanha') ?? ''} onChange={e => mudar({ campanha: e.target.value || null })}>
          <option value="">Todas as campanhas</option>
          {campanhas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={rotulo}>Estado do Farol</span>
        <select className={sel} value={sp.get('estado') ?? ''} onChange={e => mudar({ estado: e.target.value || null })}>
          <option value="">Todos os estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{ESTILO_ESTADO[e].rotulo}</option>)}
        </select>
      </label>
      {temFiltro && (
        <button type="button" className="btn-secundario py-1.5" onClick={() => mudar({ periodo: null, de: null, ate: null, canal: null, campanha: null, estado: null })}>
          <FilterX size={15} aria-hidden /> Limpar filtros
        </button>
      )}
    </div>
  )
}
