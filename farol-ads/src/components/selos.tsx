import {
  CircleCheck, CirclePause, Eye, Info, OctagonAlert, TrendingDown, TrendingUp, TriangleAlert, Wrench, type LucideIcon,
} from 'lucide-react'
import type { Estado, Gravidade } from '@/lib/tipos'

/**
 * Cor por estado, sempre a mesma em qualquer tela (seção 7): verde ESCALAR/MANTER,
 * amarelo OBSERVAR, laranja OTIMIZAR, vermelho REDUZIR/PAUSAR — e nunca só cor:
 * sempre ícone + texto junto.
 */
export const ESTILO_ESTADO: Record<Estado, { rotulo: string; icone: LucideIcon; classe: string; ponto: string; resumo: string }> = {
  ESCALAR: { rotulo: 'Escalar', icone: TrendingUp, classe: 'bg-emerald-50 text-emerald-800 ring-emerald-200', ponto: 'bg-emerald-600', resumo: 'Boa margem e performance: testar mais verba aos poucos.' },
  MANTER: { rotulo: 'Manter', icone: CircleCheck, classe: 'bg-green-50 text-green-800 ring-green-200', ponto: 'bg-green-600', resumo: 'Saudável: não mexer.' },
  OBSERVAR: { rotulo: 'Observar', icone: Eye, classe: 'bg-amber-50 text-amber-800 ring-amber-200', ponto: 'bg-amber-400', resumo: 'Sinal de atenção, mas ainda sem evidência para mudar.' },
  OTIMIZAR: { rotulo: 'Otimizar', icone: Wrench, classe: 'bg-orange-50 text-orange-800 ring-orange-200', ponto: 'bg-orange-500', resumo: 'Problema de anúncio (foto, preço, concorrência), não de verba.' },
  REDUZIR: { rotulo: 'Reduzir', icone: TrendingDown, classe: 'bg-red-50 text-red-800 ring-red-200', ponto: 'bg-red-600', resumo: 'Ads consumindo margem demais: reduzir aos poucos.' },
  PAUSAR: { rotulo: 'Pausar', icone: CirclePause, classe: 'bg-red-100 text-red-900 ring-red-300', ponto: 'bg-red-800', resumo: 'Segue ruim mesmo após ajustes: avaliar pausa.' },
}

export const ESTILO_GRAVIDADE: Record<Gravidade, { rotulo: string; icone: LucideIcon; classe: string }> = {
  CRITICO: { rotulo: 'Crítico', icone: OctagonAlert, classe: 'bg-red-600 text-white ring-red-600' },
  IMPORTANTE: { rotulo: 'Importante', icone: TriangleAlert, classe: 'bg-orange-100 text-orange-900 ring-orange-300' },
  ATENCAO: { rotulo: 'Atenção', icone: Info, classe: 'bg-amber-50 text-amber-900 ring-amber-200' },
  INFORMATIVO: { rotulo: 'Informativo', icone: Info, classe: 'bg-slate-50 text-slate-700 ring-slate-200' },
}

export function SeloEstado({ estado, grande = false }: { estado: Estado; grande?: boolean }) {
  const e = ESTILO_ESTADO[estado]
  const I = e.icone
  return (
    <span title={e.resumo} className={`inline-flex items-center gap-1.5 rounded-md font-semibold ring-1 ring-inset ${e.classe} ${grande ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs'}`}>
      <I size={grande ? 15 : 13} aria-hidden strokeWidth={2.4} />
      {e.rotulo}
    </span>
  )
}

export function SeloGravidade({ gravidade }: { gravidade: Gravidade }) {
  const g = ESTILO_GRAVIDADE[gravidade]
  const I = g.icone
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${g.classe}`}>
      <I size={12} aria-hidden strokeWidth={2.4} />
      {g.rotulo}
    </span>
  )
}

export function SeloStatus({ status }: { status: string }) {
  const s = status.toLowerCase()
  const cls = /ativ/.test(s) ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    : /paus/.test(s) ? 'bg-slate-100 text-slate-700 ring-slate-200'
      : /encerr/.test(s) ? 'bg-red-50 text-red-800 ring-red-200'
        : /resolv/.test(s) ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          : /analise|análise/.test(s) ? 'bg-sky-50 text-sky-800 ring-sky-200'
            : /aberto/.test(s) ? 'bg-red-50 text-red-800 ring-red-200'
              : 'bg-slate-50 text-slate-700 ring-slate-200'
  const rotulo = s === 'em_analise' ? 'Em análise' : status.charAt(0).toUpperCase() + status.slice(1)
  return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{rotulo}</span>
}

/** Canal com marcador textual (sem logos de terceiros). */
export function SeloCanal({ canal }: { canal: string }) {
  const m: Record<string, [string, string]> = {
    mercado_livre: ['ML', 'bg-yellow-300 text-slate-900'],
    shopee: ['SH', 'bg-orange-500 text-white'],
    tiktok: ['TT', 'bg-slate-900 text-white'],
  }
  const [sigla, cls] = m[canal] ?? ['?', 'bg-slate-200']
  const nome = canal === 'mercado_livre' ? 'Mercado Livre' : canal === 'shopee' ? 'Shopee' : canal === 'tiktok' ? 'TikTok Shop' : canal
  return <span title={nome} aria-label={nome} className={`inline-flex h-6 w-7 items-center justify-center rounded-md text-[10px] font-bold ${cls}`}>{sigla}</span>
}
