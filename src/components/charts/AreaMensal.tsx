import type { PontoMensal } from '@/lib/agregacoes'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const rotuloMes = (mes: string) => {
  const [ano, m] = mes.split('-')
  return `${MESES[Number(m) - 1]}/${ano.slice(2)}`
}

/**
 * Gasto mês a mês. Série única — o título nomeia o que é, então não há legenda.
 * O total do mês selecionado vem como número em destaque acima do gráfico,
 * porque é o valor que se lê primeiro.
 */
export default function AreaMensal({ serie }: { serie: PontoMensal[] }) {
  if (serie.length < 2) {
    return <p className="text-sm text-tinta-fraca py-8 text-center">Histórico ainda insuficiente para mostrar tendência</p>
  }

  const L = 560, A = 150, base = A - 24
  const max = Math.max(...serie.map(p => p.total)) || 1
  const passo = L / (serie.length - 1)
  const y = (v: number) => base - (v / max) * (base - 10)

  const linha = serie.map((p, i) => `${i * passo},${y(p.total)}`).join(' ')
  const area = `0,${base} ${linha} ${L},${base}`
  const ultimo = serie[serie.length - 1]
  // Em séries longas, rotular todo mês colide; alterna para caber.
  const intervalo = serie.length > 8 ? 2 : 1

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-2xl font-bold font-titulo tabular-nums text-tinta">{brl(ultimo.total)}</span>
        <span className="text-xs text-tinta-fraca">
          em {rotuloMes(ultimo.mes)} · {ultimo.compras} {ultimo.compras === 1 ? 'compra' : 'compras'}
        </span>
      </div>
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full h-auto" role="img"
        aria-label={`Gasto mensal dos últimos ${serie.length} meses, terminando em ${brl(ultimo.total)}`}>
        <line x1="0" y1={base} x2={L} y2={base} stroke="#DDE7D4" strokeWidth="1" />
        <polygon points={area} fill="#055E2B" opacity="0.08" />
        <polyline points={linha} fill="none" stroke="#055E2B" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={(serie.length - 1) * passo} cy={y(ultimo.total)} r="4" fill="#055E2B" stroke="#fff" strokeWidth="2" />
        {serie.map((p, i) => (
          i % intervalo === 0 || i === serie.length - 1 ? (
            <text key={p.mes} x={i * passo} y={A - 5}
              textAnchor={i === 0 ? 'start' : i === serie.length - 1 ? 'end' : 'middle'}
              fill="#5C6B60" fontSize="10">{rotuloMes(p.mes)}</text>
          ) : null
        ))}
      </svg>
    </div>
  )
}
