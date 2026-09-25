import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react'
import { Termo, type TermoGlossario } from './Termo'

/**
 * Número grande + comparação com o período anterior. `bomQuandoSobe` decide a cor da
 * variação (investimento subir não é "bom" por si só → neutro).
 */
export function Kpi({
  titulo, valor, termo, icone: Icone, variacao, rotuloVariacao, bomQuandoSobe = true, destaque, sub,
}: {
  titulo: string
  valor: string
  termo?: TermoGlossario
  icone?: LucideIcon
  variacao?: number | null
  rotuloVariacao?: string
  bomQuandoSobe?: boolean | null
  destaque?: 'negativo' | 'positivo'
  sub?: React.ReactNode
}) {
  const sobe = (variacao ?? 0) > 0
  const corVar = variacao == null || variacao === 0 || bomQuandoSobe == null ? 'text-tinta-fraca'
    : sobe === bomQuandoSobe ? 'text-emerald-700' : 'text-red-700'
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-tinta-fraca">{termo ? <Termo t={termo}>{titulo}</Termo> : titulo}</p>
        {Icone && <Icone size={18} className="shrink-0 text-rdb-600" aria-hidden />}
      </div>
      <p className={`mt-1.5 whitespace-nowrap text-xl 2xl:text-2xl font-bold tracking-tight tabular-nums ${destaque === 'negativo' ? 'text-red-700' : destaque === 'positivo' ? 'text-emerald-700' : 'text-tinta'}`}>{valor}</p>
      {variacao != null && isFinite(variacao) ? (
        <p className={`mt-1 flex items-center gap-1 text-xs ${corVar}`}>
          {sobe ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
          <span className="font-medium whitespace-nowrap">{rotuloVariacao ?? `${Math.abs(variacao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`}</span>
          <span className="text-tinta-fraca whitespace-nowrap">vs. anterior</span>
        </p>
      ) : sub ? <p className="mt-1 text-xs text-tinta-fraca">{sub}</p> : null}
    </div>
  )
}
