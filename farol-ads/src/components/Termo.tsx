import { CircleHelp } from 'lucide-react'

/** Glossário embutido: todo termo técnico tem um "?" que explica em uma frase simples. */
export const GLOSSARIO = {
  ACOS: 'Quanto das vendas por ads foi gasto em ads. ACOS 20% = gastou R$ 20 para vender R$ 100.',
  ROAS: 'Quanto voltou em vendas para cada R$ 1 investido em ads. ROAS 4 = R$ 4 vendidos para cada R$ 1 gasto.',
  TACOS: 'Investimento em ads dividido por TODA a receita do produto (ads + vendas orgânicas). Mostra o peso dos ads no produto inteiro.',
  'ACOS de equilíbrio': 'O ACOS máximo que este produto aguenta sem dar prejuízo. É igual à margem antes de ads.',
  'ROAS de equilíbrio': 'O ROAS mínimo para este produto não perder dinheiro com ads. Abaixo dele, os ads comem toda a margem.',
  'ROAS objetivo': 'A meta de ROAS configurada na campanha do Mercado Livre. É meta publicitária, não viabilidade econômica.',
  'Margem antes de ads': 'Receita menos custo do produto, imposto, comissão e taxas do canal, antes de pagar os ads. Não é lucro: despesas fixas da empresa não entram.',
  'Margem após ads': 'Margem antes de ads menos o investimento em ads. É o número principal do Farol: positivo = os ads deixam dinheiro.',
  'Receita atribuída': 'Vendas que o Mercado Livre atribui aos anúncios patrocinados (diretas + indiretas).',
  'Receita total': 'Todas as vendas do produto no canal, com e sem ads (vêm do Bling).',
  CTR: 'De cada 100 pessoas que viram o anúncio, quantas clicaram.',
  CVR: 'Conversão: de cada 100 cliques, quantos viraram venda.',
  CPC: 'Custo médio de cada clique.',
  Gravidade: 'Quanto dinheiro está em jogo (valor em risco em reais), não só o percentual. Perder R$ 8 e perder R$ 800 nunca têm o mesmo peso.',
  Estado: 'A recomendação do Farol para o anúncio: Escalar, Manter, Observar, Otimizar, Reduzir ou Pausar.',
  'Impacto estimado': 'Valor em reais em risco (negativo) ou potencial de ganho (positivo) se a recomendação for seguida.',
} as const

export type TermoGlossario = keyof typeof GLOSSARIO

export function Termo({ t, children, alinhar = 'centro' }: { t: TermoGlossario; children?: React.ReactNode; alinhar?: 'centro' | 'direita' | 'esquerda' }) {
  const pos = alinhar === 'direita' ? 'right-0' : alinhar === 'esquerda' ? 'left-0' : 'left-1/2 -translate-x-1/2'
  return (
    <span className="relative inline-flex items-center gap-1 group/termo">
      {children ?? t}
      <button type="button" aria-label={`O que é ${t}?`} className="text-tinta-fraca/70 hover:text-rdb-700 focus:text-rdb-700 outline-none">
        <CircleHelp size={13} aria-hidden />
      </button>
      <span role="tooltip" className={`pointer-events-none absolute top-full z-50 mt-1.5 w-64 rounded-lg bg-rdb-900 px-3 py-2 text-left text-xs font-normal normal-case leading-snug text-white hidden shadow-lg group-hover/termo:block group-focus-within/termo:block whitespace-normal ${pos}`}>
        <strong className="block font-semibold mb-0.5">{t}</strong>
        {GLOSSARIO[t]}
      </span>
    </span>
  )
}
