import Link from 'next/link'
import { ArrowRight, X } from 'lucide-react'
import Topo from '@/components/Topo'
import BotaoExportar from '@/components/BotaoExportar'
import BotoesStatus from '@/components/BotoesStatus'
import { BlocoDiagnostico } from '@/components/blocos'
import { ESTILO_ESTADO, SeloCanal, SeloEstado, SeloGravidade, SeloStatus } from '@/components/selos'
import { Termo } from '@/components/Termo'
import { carregarPainel, type AnuncioPainel } from '@/lib/dados'
import { lerFiltros, queryFiltros } from '@/lib/filtros'
import { dataLonga, num, pct, reais } from '@/lib/fmt'
import type { Estado } from '@/lib/tipos'

const ABAS: { chave: string; rotulo: string; estados: Estado[] | null; descricao: string; cor: string; icone: Estado }[] = [
  { chave: 'acao', rotulo: 'Precisa de ação', estados: ['REDUZIR', 'PAUSAR', 'OTIMIZAR'], descricao: 'Podem estar gerando prejuízo ou consumindo margem em excesso.', cor: 'bg-red-50 ring-red-100 text-red-900', icone: 'REDUZIR' },
  { chave: 'observar', rotulo: 'Observar', estados: ['OBSERVAR'], descricao: 'Sinal de atenção, mas ainda sem evidência para mudar.', cor: 'bg-amber-50 ring-amber-100 text-amber-900', icone: 'OBSERVAR' },
  { chave: 'oportunidades', rotulo: 'Oportunidades de escala', estados: ['ESCALAR'], descricao: 'Boa margem e performance para testar mais investimento.', cor: 'bg-emerald-50 ring-emerald-100 text-emerald-900', icone: 'ESCALAR' },
  { chave: 'manter', rotulo: 'Manter', estados: ['MANTER'], descricao: 'Performance saudável, sem necessidade de alteração.', cor: 'bg-green-50 ring-green-100 text-green-900', icone: 'MANTER' },
]

// Maior perda primeiro; depois o maior potencial; por fim quem não tem impacto.
const grupo = (v: number) => (v < 0 ? 0 : v > 0 ? 1 : 2)
function porImpacto(x: AnuncioPainel, y: AnuncioPainel) {
  const a = x.diagnostico.impacto, b = y.diagnostico.impacto
  return grupo(a) - grupo(b) || (a < 0 ? a - b : b - a)
}

export default async function Recomendacoes({ searchParams }: { searchParams: Record<string, string> }) {
  const f = lerFiltros(searchParams)
  const d = await carregarPainel(f)
  const aba = ABAS.find(a => a.chave === searchParams.aba) ?? null
  const base = d.anuncios
  const lista = (aba?.estados ? base.filter(a => aba.estados!.includes(a.diagnostico.estado)) : base)
    .sort(porImpacto)
  const sel: AnuncioPainel | undefined = searchParams.sel ? base.find(a => a.codigoAnuncio === searchParams.sel) : undefined
  const link = (extra: Record<string, string | null>) => `/recomendacoes${queryFiltros(f, { aba: searchParams.aba ?? null, sel: searchParams.sel ?? null, ...extra })}`

  return (
    <>
      <Topo titulo="Recomendações" descricao="O que fazer em cada produto/anúncio, com base na margem, na performance e nos dados do Farol." dados={d} filtros={f}
        acoes={<BotaoExportar tipo="recomendacoes" rotulo="Exportar recomendações" />} />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ABAS.map(a => {
          const n = base.filter(x => a.estados!.includes(x.diagnostico.estado)).length
          const I = ESTILO_ESTADO[a.icone].icone
          return (
            <Link key={a.chave} href={link({ aba: a.chave, sel: null })} className={`rounded-xl p-4 ring-1 transition-shadow hover:shadow-card ${a.cor} ${aba?.chave === a.chave ? 'ring-2 ring-current' : ''}`}>
              <p className="flex items-center justify-between gap-2 font-semibold"><span className="flex items-center gap-2"><I size={18} aria-hidden />{a.rotulo}</span><ArrowRight size={16} aria-hidden /></p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{n}</p>
              <p className="mt-1 text-sm opacity-80">{a.descricao}</p>
            </Link>
          )
        })}
      </section>

      <section className={`grid gap-4 ${sel ? 'xl:grid-cols-[1fr_420px]' : ''}`}>
        <div className="card overflow-hidden min-w-0">
          <nav className="flex gap-1 overflow-x-auto border-b border-linha px-3" aria-label="Filtrar por grupo">
            <Link href={link({ aba: null })} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${!aba ? 'border-rdb-700 font-semibold text-rdb-800' : 'border-transparent text-tinta-fraca hover:text-tinta'}`}>Todas ({base.length})</Link>
            {ABAS.map(a => (
              <Link key={a.chave} href={link({ aba: a.chave })} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${aba?.chave === a.chave ? 'border-rdb-700 font-semibold text-rdb-800' : 'border-transparent text-tinta-fraca hover:text-tinta'}`}>
                {a.rotulo} ({base.filter(x => a.estados!.includes(x.diagnostico.estado)).length})
              </Link>
            ))}
          </nav>
          <div className="overflow-x-auto">
            <table className={`w-full ${sel ? 'min-w-[680px]' : 'min-w-[860px]'}`}>
              <thead className="bg-rdb-50/60"><tr>
                {!sel && <th className="th w-10"><span className="sr-only">Canal</span></th>}
                <th className="th">Produto</th>
                <th className="th text-right"><Termo t="Margem após ads">Margem após ads</Termo></th>
                <th className="th text-right"><Termo t="ROAS" /></th>
                {!sel && <th className="th text-right"><Termo t="ACOS" /></th>}
                <th className="th"><Termo t="Estado">Recomendação</Termo></th>
                <th className="th"><Termo t="Gravidade" /></th>
                <th className="th text-right"><Termo t="Impacto estimado" alinhar="direita">Impacto est.</Termo></th>
                <th className="th"><span className="sr-only">Ações</span></th>
              </tr></thead>
              <tbody>
                {lista.map(a => {
                  const e = a.economia
                  const ativo = sel?.codigoAnuncio === a.codigoAnuncio
                  return (
                    <tr key={a.codigoAnuncio} className={`border-t border-linha ${ativo ? 'bg-rdb-100/70' : (e.margemPosAds ?? 0) < 0 ? 'bg-red-50/60' : 'hover:bg-rdb-50/50'}`}>
                      {!sel && <td className="td"><SeloCanal canal={a.canal} /></td>}
                      <td className="td max-w-[220px]"><p className="truncate font-medium">{a.titulo}</p><p className="text-xs text-tinta-fraca">SKU {a.sku ?? '—'}</p></td>
                      <td className={`td num font-semibold ${(e.margemPosAds ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                        {e.custoNaoCadastrado ? <span className="text-xs font-medium text-amber-800">sem custo</span> : <>{reais(e.margemPosAds)}<span className="block text-[11px] font-normal">{pct(e.margemPosAdsPct)}</span></>}
                      </td>
                      <td className="td num">{num(e.roas)}<span className="block text-[11px] text-tinta-fraca">equil. {num(e.roasEquilibrio)}</span></td>
                      {!sel && <td className="td num">{pct(e.acos)}<span className="block text-[11px] text-tinta-fraca">equil. {pct(e.acosEquilibrio)}</span></td>}
                      <td className="td"><SeloEstado estado={a.diagnostico.estado} /></td>
                      <td className="td"><SeloGravidade gravidade={a.diagnostico.gravidade} /></td>
                      <td className={`td num font-medium ${a.diagnostico.impacto < 0 ? 'text-red-700' : a.diagnostico.impacto > 0 ? 'text-emerald-700' : 'text-tinta-fraca'}`}>{a.diagnostico.impacto === 0 ? '—' : reais(a.diagnostico.impacto, { sinal: true })}</td>
                      <td className="td"><Link scroll={false} href={link({ sel: a.codigoAnuncio })} className="btn-secundario px-2.5 py-1 text-xs" aria-current={ativo ? 'true' : undefined}>Ver detalhes</Link></td>
                    </tr>
                  )
                })}
                {lista.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-sm text-tinta-fraca">Nenhuma recomendação neste grupo.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {sel && (
          <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start" aria-label={`Recomendação para ${sel.titulo}`}>
            <div className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight">{sel.titulo}</p>
                  <p className="text-xs text-tinta-fraca">SKU {sel.sku ?? '—'} · {sel.codigoAnuncio}</p>
                </div>
                <Link scroll={false} href={link({ sel: null })} aria-label="Fechar detalhes" className="rounded-md p-1 text-tinta-fraca hover:bg-rdb-50"><X size={18} /></Link>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[
                  ['Margem após ads', reais(sel.economia.margemPosAds), (sel.economia.margemPosAds ?? 0) < 0],
                  ['ROAS', num(sel.economia.roas), false],
                  ['ACOS', pct(sel.economia.acos), false],
                  ['TACOS', pct(sel.economia.tacos), false],
                ].map(([r, v, ruim]) => (
                  <div key={String(r)} className="rounded-lg bg-rdb-50 px-1 py-2">
                    <p className="text-[10px] text-tinta-fraca">{r}</p>
                    <p className={`text-sm font-bold tabular-nums ${ruim ? 'text-red-700' : ''}`}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <BlocoDiagnostico d={sel.diagnostico} compacto />
            {sel.diagnostico.recomendacaoId && (
              <div className="card p-4 space-y-2">
                <p className="text-sm font-semibold">O que você fez com esta recomendação?</p>
                <p className="text-xs text-tinta-fraca">Marcar como aplicada liga o período de observação ({d.config.diasObservacao} dias) e fica na memória das decisões.</p>
                {sel.diagnostico.statusRecomendacao && sel.diagnostico.statusRecomendacao !== 'pendente'
                  ? <p className="text-sm">Status: <SeloStatus status={sel.diagnostico.statusRecomendacao} /></p>
                  : <BotoesStatus rota="/api/recomendacoes" id={sel.diagnostico.recomendacaoId} opcoes={[
                    { valor: 'aplicada', rotulo: 'Apliquei', icone: 'check', primario: true },
                    { valor: 'ignorada', rotulo: 'Não vou aplicar', icone: 'x' },
                  ]} />}
              </div>
            )}
            <Link href={`/produtos/${encodeURIComponent(sel.codigoAnuncio)}${queryFiltros(f)}`} className="btn-primario w-full justify-center">Ver produto completo <ArrowRight size={15} aria-hidden /></Link>
          </aside>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-linha px-4 py-3 font-semibold">Memória das decisões</h2>
        <p className="px-4 pt-3 text-xs text-tinta-fraca">O que o Farol recomendou antes e o que aconteceu depois.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">Data</th><th className="th">Produto</th><th className="th">Recomendação</th><th className="th">Motivo</th><th className="th">Ação</th><th className="th">Status</th></tr></thead>
            <tbody>
              {d.historico.slice(0, 30).map(h => (
                <tr key={`${h.codigoAnuncio}-${h.geradoEm}`} className="border-t border-linha">
                  <td className="td text-xs text-tinta-fraca">{dataLonga(h.geradoEm)}</td>
                  <td className="td font-medium">{h.titulo}</td>
                  <td className="td"><SeloEstado estado={h.estado} /></td>
                  <td className="td whitespace-normal text-sm text-tinta-fraca max-w-xs">{h.motivo}</td>
                  <td className="td whitespace-normal text-sm max-w-xs">{h.acao}</td>
                  <td className="td"><SeloStatus status={h.status} />{h.resolvidoEm && <span className="block text-[11px] text-tinta-fraca">{dataLonga(h.resolvidoEm)}</span>}</td>
                </tr>
              ))}
              {d.historico.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm text-tinta-fraca">Ainda não há histórico.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
