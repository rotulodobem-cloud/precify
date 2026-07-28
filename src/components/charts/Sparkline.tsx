/**
 * Mini-gráfico de linha para tendência de custo. Sem eixos: a leitura é a forma.
 * A cor indica a direção (custo subindo é ruim), mas quem lê nunca depende só
 * dela — a coluna ao lado sempre mostra a variação em número.
 */
export default function Sparkline({ valores, largura = 84, altura = 26 }: {
  valores: number[]; largura?: number; altura?: number
}) {
  if (valores.length < 2) {
    return <span className="text-xs text-tinta-fraca">sem histórico</span>
  }

  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const amplitude = max - min || 1
  const passo = largura / (valores.length - 1)
  const y = (v: number) => altura - 3 - ((v - min) / amplitude) * (altura - 6)

  const pontos = valores.map((v, i) => `${i * passo},${y(v)}`).join(' ')
  const primeiro = valores[0]
  const ultimo = valores[valores.length - 1]
  const cor = ultimo > primeiro ? '#A21309' : ultimo < primeiro ? '#2E9E4F' : '#5C6B60'

  return (
    <svg width={largura} height={altura} className="overflow-visible" role="img"
      aria-label={`Custo ao longo de ${valores.length} compras, de ${primeiro} a ${ultimo}`}>
      <polyline points={pontos} fill="none" stroke={cor} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* anel na cor da superfície separa o ponto final da linha */}
      <circle cx={(valores.length - 1) * passo} cy={y(ultimo)} r="3.5" fill={cor} stroke="#fff" strokeWidth="2" />
    </svg>
  )
}
