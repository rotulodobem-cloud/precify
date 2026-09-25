import { Database, FlaskConical } from 'lucide-react'
import BarraFiltros from './BarraFiltros'
import type { PainelDados } from '@/lib/dados'
import { rotuloPeriodo, type Filtros } from '@/lib/filtros'
import { dataLonga } from '@/lib/fmt'

/** Cabeçalho de toda tela: título, explicação curta, filtros globais e de onde vêm os dados. */
export default function Topo({ titulo, descricao, dados, filtros, acoes }: {
  titulo: string; descricao: string; dados: PainelDados; filtros: Filtros; acoes?: React.ReactNode
}) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{titulo}</h1>
          <p className="mt-1 text-sm text-tinta-fraca">{descricao}</p>
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      <BarraFiltros campanhas={dados.nomesCampanhas} de={filtros.de} ate={filtros.ate} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tinta-fraca">
        {dados.fonte === 'demo' ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-sky-900 ring-1 ring-sky-200">
            <FlaskConical size={13} aria-hidden />Dados de demonstração — configure o Supabase para ver os dados reais da loja
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5"><Database size={13} aria-hidden />
            Relatório de anúncios de {dados.capturadoEm ? dataLonga(dados.capturadoEm) : '—'}
            {dados.relatorio.desde && dados.relatorio.ate ? ` (cobre ${dataLonga(dados.relatorio.desde)} a ${dataLonga(dados.relatorio.ate)})` : ''}
          </span>
        )}
        <span>Período: <b className="font-medium text-tinta">{rotuloPeriodo(filtros)}</b> ({dataLonga(filtros.de)} a {dataLonga(filtros.ate)})</span>
        {dados.avisos.map(a => <span key={a} className="text-amber-800">{a}</span>)}
      </div>
    </header>
  )
}
