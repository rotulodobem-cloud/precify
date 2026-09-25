import Link from 'next/link'
import { ArrowRight, CircleCheck, CircleAlert, Search, Target, X } from 'lucide-react'
import Topo from '@/components/Topo'
import BotaoExportar from '@/components/BotaoExportar'
import BotoesStatus from '@/components/BotoesStatus'
import { ESTILO_GRAVIDADE, SeloCanal, SeloEstado, SeloGravidade, SeloStatus } from '@/components/selos'
import { carregarPainel } from '@/lib/dados'
import { lerFiltros, queryFiltros } from '@/lib/filtros'
import { dataHora, num, pct, reais } from '@/lib/fmt'
import { GRAVIDADES, ROTULO_TIPO } from '@/lib/tipos'


const ABAS = [
  { chave: null, rotulo: 'Todos' },
  { chave: 'aberto', rotulo: 'Abertos' },
  { chave: 'em_analise', rotulo: 'Em análise' },
  { chave: 'resolvido', rotulo: 'Resolvidos' },
] as const

export default async function Alertas({ searchParams }: { searchParams: Record<string, string> }) {
  const f = lerFiltros(searchParams)
  const d = await carregarPainel(f)
  const status = ABAS.find(a => a.chave === searchParams.status)?.chave ?? null
  const grav = GRAVIDADES.includes(searchParams.gravidade as never) ? searchParams.gravidade : null
  // Alertas não dependem do relatório do período: mostra o que foi criado dentro do período.
  const doPeriodo = d.alertas.filter(a => a.criadoEm.slice(0, 10) >= f.de && a.criadoEm.slice(0, 10) <= f.ate)
  const lista = doPeriodo.filter(a => (!status || a.status === status) && (!grav || a.gravidade === grav))
  const sel = searchParams.sel ? d.alertas.find(a => a.id === searchParams.sel) : undefined
  const anuncio = sel?.codigoAnuncio ? d.anuncios.find(a => a.codigoAnuncio === sel.codigoAnuncio) : undefined
  const link = (extra: Record<string, string | null>) => `/alertas${queryFiltros(f, { status, gravidade: grav, sel: searchParams.sel ?? null, ...extra })}`
  const abertos = doPeriodo.filter(a => a.status !== 'resolvido')

  const cartoes = [
    ...GRAVIDADES.map(g => ({ chave: g, rotulo: ESTILO_GRAVIDADE[g].rotulo, n: abertos.filter(a => a.gravidade === g).length, icone: ESTILO_GRAVIDADE[g].icone,
      sub: { CRITICO: 'Ação urgente necessária', IMPORTANTE: 'Impacto relevante na margem', ATENCAO: 'Ficar de olho', INFORMATIVO: 'Mudanças e status' }[g],
      cls: { CRITICO: 'bg-red-50 ring-red-100 text-red-900', IMPORTANTE: 'bg-orange-50 ring-orange-100 text-orange-900', ATENCAO: 'bg-amber-50 ring-amber-100 text-amber-900', INFORMATIVO: 'bg-slate-50 ring-slate-200 text-slate-800' }[g],
      href: link({ gravidade: grav === g ? null : g, status: null, sel: null }), ativo: grav === g })),
    { chave: 'resolvidos', rotulo: 'Resolvidos', n: doPeriodo.filter(a => a.status === 'resolvido').length, icone: CircleCheck, sub: 'No período',
      cls: 'bg-emerald-50 ring-emerald-100 text-emerald-900', href: link({ status: 'resolvido', gravidade: null, sel: null }), ativo: status === 'resolvido' },
  ]

  return (
    <>
      <Topo titulo="Alertas" descricao="Problemas, oportunidades e mudanças importantes nos seus anúncios e campanhas — sempre com problema, causa e ação." dados={d} filtros={f}
        acoes={<BotaoExportar tipo="alertas" />} />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {cartoes.map(c => (
          <Link key={c.chave} href={c.href} className={`rounded-xl p-4 ring-1 hover:shadow-card ${c.cls} ${c.ativo ? 'ring-2 ring-current' : ''}`}>
            <p className="flex items-center gap-2 font-semibold"><c.icone size={17} aria-hidden />{c.rotulo}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{c.n}</p>
            <p className="text-sm opacity-80">{c.sub}</p>
          </Link>
        ))}
      </section>

      <section className={`grid gap-4 ${sel ? 'xl:grid-cols-[1fr_420px]' : ''}`}>
        <div className="card overflow-hidden min-w-0">
          <nav className="flex gap-1 overflow-x-auto border-b border-linha px-3" aria-label="Filtrar por status">
            {ABAS.map(a => (
              <Link key={a.rotulo} href={link({ status: a.chave, sel: null })} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm ${status === a.chave ? 'border-rdb-700 font-semibold text-rdb-800' : 'border-transparent text-tinta-fraca hover:text-tinta'}`}>
                {a.rotulo} ({doPeriodo.filter(x => !a.chave || x.status === a.chave).length})
              </Link>
            ))}
          </nav>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-rdb-50/60"><tr>
                <th className="th">Data/hora</th>{!sel && <th className="th w-10"><span className="sr-only">Canal</span></th>}<th className="th">Produto / campanha</th>
                {!sel && <th className="th">Tipo</th>}<th className="th">Resumo</th><th className="th">Gravidade</th><th className="th">Status</th><th className="th"><span className="sr-only">Ações</span></th>
              </tr></thead>
              <tbody>
                {lista.map(a => (
                  <tr key={a.id} className={`border-t border-linha ${sel?.id === a.id ? 'bg-rdb-100/70' : 'hover:bg-rdb-50/50'}`}>
                    <td className="td text-xs text-tinta-fraca">{dataHora(a.criadoEm)}</td>
                    {!sel && <td className="td"><SeloCanal canal={a.canal} /></td>}
                    <td className="td max-w-[220px]"><p className="truncate font-medium">{a.titulo}</p><p className="truncate text-xs text-tinta-fraca">{a.sku ? `SKU ${a.sku} · ` : ''}{a.campanha ?? ''}</p></td>
                    {!sel && <td className="td text-xs font-medium">{ROTULO_TIPO[a.tipo] ?? a.tipo}</td>}
                    <td className="td min-w-[240px] max-w-[320px] whitespace-normal text-sm text-tinta-fraca">{a.problema}</td>
                    <td className="td"><SeloGravidade gravidade={a.gravidade} /></td>
                    <td className="td"><SeloStatus status={a.status} /></td>
                    <td className="td"><Link scroll={false} href={link({ sel: a.id })} className="btn-secundario px-2.5 py-1 text-xs">Detalhes</Link></td>
                  </tr>
                ))}
                {lista.length === 0 && <tr><td colSpan={sel ? 6 : 8} className="py-10 text-center text-sm text-tinta-fraca">Nenhum alerta com esses filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {sel && (
          <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start" aria-label="Detalhe do alerta">
            <div className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-tinta-fraca">{ROTULO_TIPO[sel.tipo]}</p>
                  <p className="text-lg font-bold leading-tight">{sel.titulo}</p>
                  <p className="text-xs text-tinta-fraca">{sel.sku ? `SKU ${sel.sku}` : ''}{sel.campanha ? ` · Campanha: ${sel.campanha}` : ''}{sel.codigoAnuncio ? ` · ${sel.codigoAnuncio}` : ''}</p>
                </div>
                <Link scroll={false} href={link({ sel: null })} aria-label="Fechar" className="rounded-md p-1 text-tinta-fraca hover:bg-rdb-50"><X size={18} /></Link>
              </div>
              <div className="mt-2 flex gap-2"><SeloGravidade gravidade={sel.gravidade} /><SeloStatus status={sel.status} /></div>
            </div>
            <div className="card divide-y divide-linha">
              {[{ i: CircleAlert, t: 'Problema', c: sel.problema }, { i: Search, t: 'Causa provável', c: sel.causa }, { i: Target, t: 'Ação recomendada', c: sel.acao }].map(x => (
                <div key={x.t} className="flex gap-3 p-4 text-sm"><x.i size={18} className="mt-0.5 shrink-0 text-rdb-700" aria-hidden /><div><p className="font-semibold">{x.t}</p><p className="text-tinta-fraca">{x.c || '—'}</p></div></div>
              ))}
            </div>
            {anuncio && (
              <div className="card p-4 text-sm">
                <p className="mb-2 flex items-center justify-between font-semibold">Situação atual do anúncio <SeloEstado estado={anuncio.diagnostico.estado} /></p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[['Margem após ads', reais(anuncio.economia.margemPosAds)], ['ROAS', num(anuncio.economia.roas)], ['ACOS', pct(anuncio.economia.acos)], ['TACOS', pct(anuncio.economia.tacos)]].map(([r, v]) => (
                    <div key={r} className="rounded-lg bg-rdb-50 px-1 py-2"><p className="text-[10px] text-tinta-fraca">{r}</p><p className="font-bold tabular-nums">{v}</p></div>
                  ))}
                </div>
                <Link href={`/produtos/${encodeURIComponent(anuncio.codigoAnuncio)}${queryFiltros(f)}`} className="mt-3 inline-flex items-center gap-1 font-medium text-rdb-700 hover:underline">Ver produto <ArrowRight size={14} aria-hidden /></Link>
              </div>
            )}
            {sel.status !== 'resolvido' && (
              <BotoesStatus rota="/api/alertas" id={sel.id} opcoes={[
                { valor: 'resolvido', rotulo: 'Marcar como resolvido', icone: 'check', primario: true },
                ...(sel.status === 'aberto' ? [{ valor: 'em_analise', rotulo: 'Em análise', icone: 'eye' as const }] : []),
              ]} />
            )}
          </aside>
        )}
      </section>
    </>
  )
}
