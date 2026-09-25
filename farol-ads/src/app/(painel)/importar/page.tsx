import FormImportar from '@/components/FormImportar'
import { hojeISO } from '@/lib/filtros'
import { supabaseConfigurado } from '@/lib/supabase'

export default function Importar() {
  return (
    <>
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Importar relatório de anúncios</h1>
        <p className="mt-1 text-sm text-tinta-fraca">Normalmente a tarefa diária das 8h faz isso sozinha a partir da pasta do Drive. Use esta tela quando quiser processar um relatório na hora.</p>
      </header>
      {!supabaseConfigurado() && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-200">O painel está em modo demonstração: a importação só funciona depois de configurar o Supabase.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <FormImportar hoje={hojeISO()} />
        <aside className="card space-y-3 p-5 text-sm text-tinta-fraca">
          <p className="font-semibold text-tinta">O que acontece ao importar</p>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>O relatório é lido e somado por anúncio e campanha (um anúncio pode estar em mais de uma).</li>
            <li>O SKU de cada anúncio é conferido; sem SKU, a margem não é calculada.</li>
            <li>O custo de cada SKU é atualizado pela API do Precify.</li>
            <li>A margem antes/após ads e os pontos de equilíbrio são recalculados.</li>
            <li>O motor decide o estado de cada anúncio e grava na memória de decisões.</li>
            <li>Alertas novos são abertos (sem repetir os que já estão abertos).</li>
          </ol>
          <p>Como exportar no ML: <b>Publicidade → Product Ads → Relatórios → Anúncios patrocinados → Padrão</b>, total por período.</p>
        </aside>
      </div>
    </>
  )
}
