import { carregarPainel } from '@/lib/dados'
import { lerFiltros } from '@/lib/filtros'
import { CONFIG_EM_PERCENTUAL, ROTULO_CONFIG, type ConfigMotor } from '@/lib/motor'
import { lerView, supabaseConfigurado } from '@/lib/supabase'
import { nomeCanal } from '@/lib/tipos'
import { pct, reais } from '@/lib/fmt'

export default async function Configuracoes() {
  const d = await carregarPainel(lerFiltros({}))
  const comissoes = supabaseConfigurado()
    ? await lerView<{ canal: string; categoria_ou_padrao: string; comissao_pct: number; taxa_fixa: number }>('ads_painel_comissoes', {}, { order: 'canal,categoria_ou_padrao' })
    : [
      { canal: 'mercado_livre', categoria_ou_padrao: 'padrao', comissao_pct: 0.14, taxa_fixa: 0 },
      { canal: 'mercado_livre', categoria_ou_padrao: 'Encapsulados', comissao_pct: 0.12, taxa_fixa: 0 },
      { canal: 'shopee', categoria_ou_padrao: 'padrao', comissao_pct: 0.2, taxa_fixa: 4 },
      { canal: 'tiktok', categoria_ou_padrao: 'padrao', comissao_pct: 0.1, taxa_fixa: 4 },
    ]
  const fmt = (k: keyof ConfigMotor, v: number) =>
    CONFIG_EM_PERCENTUAL.includes(k) ? pct(v, k === 'ctrMinimo' ? 2 : 1) : /gravidade|Investimento/.test(k) ? reais(v) : String(v)

  return (
    <>
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-tinta-fraca">Limites do motor de decisão e comissões por canal. Os valores ficam no Supabase (tabelas <code>ads_config</code> e <code>canais_comissao</code>) — nada é fixo no código.</p>
      </header>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden">
          <h2 className="border-b border-linha px-4 py-3 font-semibold">Limites do motor</h2>
          <table className="w-full">
            <tbody>
              {(Object.keys(ROTULO_CONFIG) as (keyof ConfigMotor)[]).map(k => (
                <tr key={k} className="border-t border-linha first:border-0">
                  <td className="td whitespace-normal">{ROTULO_CONFIG[k]}<span className="block text-[11px] text-tinta-fraca">{k}</span></td>
                  <td className="td num font-semibold">{fmt(k, d.config[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <h2 className="border-b border-linha px-4 py-3 font-semibold">Comissão por canal e categoria</h2>
            <table className="w-full">
              <thead className="bg-rdb-50/60"><tr><th className="th">Canal</th><th className="th">Categoria</th><th className="th text-right">Comissão</th><th className="th text-right">Taxa fixa</th></tr></thead>
              <tbody>
                {comissoes.map(c => (
                  <tr key={c.canal + c.categoria_ou_padrao} className="border-t border-linha">
                    <td className="td">{nomeCanal(c.canal)}</td><td className="td">{c.categoria_ou_padrao === 'padrao' ? 'Padrão' : c.categoria_ou_padrao}</td>
                    <td className="td num">{pct(Number(c.comissao_pct))}</td><td className="td num">{reais(Number(c.taxa_fixa))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card space-y-2 p-4 text-sm text-tinta-fraca">
            <p className="font-semibold text-tinta">Como alterar</p>
            <p>No Supabase (Table Editor), edite <code>ads_config</code> (limites) ou <code>canais_comissao</code> (comissões). A próxima ingestão já usa os valores novos.</p>
            <p>Imposto: vem do Precify (tabela <code>parametros_fiscais</code>, vigência mais recente). Custo: API do Precify, sincronizado a cada relatório.</p>
          </div>
        </div>
      </section>
    </>
  )
}
