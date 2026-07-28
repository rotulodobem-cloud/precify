const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/**
 * Gasto por fornecedor no mês, do maior para o menor. Uma cor só: a barra
 * codifica magnitude, não identidade. A variação contra o mês anterior vem
 * com seta e número, então a cor apenas reforça o sinal.
 */
export default function BarrasFornecedor({ itens }: {
  itens: { fornecedor: string; total: number; variacaoPct: number | null }[]
}) {
  if (!itens.length) {
    return <p className="text-sm text-tinta-fraca py-8 text-center">Nenhuma compra no período</p>
  }

  const max = Math.max(...itens.map(i => i.total)) || 1

  return (
    <ul className="space-y-2.5">
      {itens.slice(0, 8).map(i => (
        <li key={i.fornecedor} className="flex items-center gap-3">
          <span className="text-xs text-tinta w-28 truncate shrink-0" title={i.fornecedor}>{i.fornecedor}</span>
          <div className="flex-1 min-w-8 h-2.5">
            <div className="h-2.5 rounded-r bg-rdb-700" style={{ width: `${Math.max((i.total / max) * 100, 2)}%` }} />
          </div>
          <span className="text-xs font-semibold text-tinta tabular-nums w-20 text-right shrink-0">{brl(i.total)}</span>
          <span className="text-xs tabular-nums w-16 text-right shrink-0"
            style={{ color: i.variacaoPct == null ? '#5C6B60' : i.variacaoPct > 0 ? '#A21309' : '#2E9E4F' }}>
            {i.variacaoPct == null ? 'novo' : `${i.variacaoPct > 0 ? '↑' : '↓'} ${Math.abs(i.variacaoPct)}%`}
          </span>
        </li>
      ))}
    </ul>
  )
}
