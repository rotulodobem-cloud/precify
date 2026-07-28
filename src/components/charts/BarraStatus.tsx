import type { DistribuicaoMargem } from '@/lib/agregacoes'

const FAIXAS = [
  { chave: 'saudavel', rotulo: 'saudáveis',   detalhe: 'margem 25% ou mais', cor: '#2E9E4F' },
  { chave: 'atencao',  rotulo: 'em atenção',  detalhe: 'margem entre 20% e 25%', cor: '#E09E12' },
  { chave: 'prejuizo', rotulo: 'no prejuízo', detalhe: 'margem abaixo de 20%', cor: '#A21309' },
] as const

/**
 * Barra empilhada única com quantos canais estão em cada faixa de margem.
 * A contagem aparece sempre em número ao lado do rótulo: a cor reforça,
 * não carrega sozinha a informação.
 */
export default function BarraStatus({ dist }: { dist: DistribuicaoMargem }) {
  if (!dist.total) {
    return <p className="text-sm text-tinta-fraca py-6 text-center">Nenhum canal precificado ainda</p>
  }

  return (
    <div className="space-y-3">
      {/* gap de 2px entre segmentos: separa as faixas sem depender do contraste entre cores */}
      <div className="flex h-3.5 gap-0.5" role="img"
        aria-label={`${dist.saudavel} canais saudáveis, ${dist.atencao} em atenção, ${dist.prejuizo} no prejuízo`}>
        {FAIXAS.map(f => {
          const n = dist[f.chave]
          if (!n) return null
          return (
            <div key={f.chave} className="first:rounded-l-full last:rounded-r-full"
              style={{ width: `${(n / dist.total) * 100}%`, backgroundColor: f.cor }} />
          )
        })}
      </div>
      <ul className="space-y-1.5">
        {FAIXAS.map(f => (
          <li key={f.chave} className="flex items-baseline gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 translate-y-0.5" style={{ backgroundColor: f.cor }} />
            <strong className="text-tinta tabular-nums">{dist[f.chave]}</strong>
            <span className="text-tinta">{f.rotulo}</span>
            <span className="text-tinta-fraca">· {f.detalhe}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
