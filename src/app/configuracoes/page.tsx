'use client'
// Reúne num lugar só os ajustes do sistema. Cada ajuste continua sendo editado
// na tela onde é usado; aqui ficam os valores de hoje e o caminho até lá.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Store, Leaf, CreditCard, KeyRound, ShoppingBag, ArrowRight } from 'lucide-react'
import { Spinner } from '@/components/ui'
import type { ConfigLoja } from '@/lib/precificacaoLoja'
import type { ConfigMkt } from '@/lib/precificacaoMkt'

const pct = (v: number | undefined) => (v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`)

function Valor({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-tinta-fraca">{rotulo}</span>
      <span className={`text-sm tabular-nums ${destaque ? 'font-bold text-tinta' : 'font-medium text-tinta'}`}>{valor}</span>
    </div>
  )
}

function Bloco({ icone: Icone, titulo, texto, href, botao, children }: {
  icone: React.ElementType; titulo: string; texto: string; href: string; botao: string; children?: React.ReactNode
}) {
  return (
    <section className="card p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-rdb-50 text-rdb-700 flex items-center justify-center shrink-0"><Icone size={17} /></div>
        <div>
          <h2 className="font-semibold text-tinta">{titulo}</h2>
          <p className="text-sm text-tinta-fraca mt-0.5">{texto}</p>
        </div>
      </div>
      {children && <div>{children}</div>}
      <div className="mt-auto pt-1">
        <Link href={href} className="btn-primary text-sm inline-flex items-center gap-1.5">{botao} <ArrowRight size={14} /></Link>
      </div>
    </section>
  )
}

export default function ConfiguracoesPage() {
  const [loja, setLoja] = useState<ConfigLoja | null>(null)
  const [mkt, setMkt] = useState<ConfigMkt | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/precificar/config').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/precificar-mkt/config').then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([l, m]) => { setLoja(l); setMkt(m) }).finally(() => setCarregando(false))
  }, [])

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="page-title">Configurações</h1>
        <p className="text-sm text-tinta-fraca mt-0.5">Os números que o sistema usa em todas as contas. Para mudar, clique no botão de cada bloco.</p>
      </div>

      {carregando && <div className="flex items-center gap-2 text-sm text-tinta-fraca"><Spinner size={14} /> Carregando os valores de hoje…</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <Bloco icone={Store} titulo="Margens da loja física e do site"
          texto="Meta, mínimo, imposto, taxas e embalagens usados em Precificar, Análise de preços e Promoções."
          href="/precificar?parametros=1" botao="Ajustar margens da loja e site">
          {loja && <>
            <Valor rotulo="Margem ideal (meta)" valor={pct(loja.meta)} destaque />
            <Valor rotulo="Margem mínima" valor={pct(loja.minimo)} destaque />
            <Valor rotulo="Imposto" valor={pct(loja.imposto)} />
            <Valor rotulo="Taxa de pagamento e caixa" valor={pct(loja.taxaVariavel)} />
          </>}
        </Bloco>

        <Bloco icone={Leaf} titulo="Margens e taxas dos marketplaces"
          texto="Mercado Livre, Shopee e TikTok: meta, mínimo, desconto da promoção, comissões e fretes."
          href="/precificar-marketplaces?parametros=1" botao="Ajustar marketplaces">
          {mkt && <>
            <Valor rotulo="Margem ideal (meta)" valor={pct(mkt.meta)} destaque />
            <Valor rotulo="Margem mínima" valor={pct(mkt.piso)} destaque />
            <Valor rotulo="Desconto da promoção (cadastro → venda)" valor={pct(mkt.descontoPromocao)} />
            <Valor rotulo="Comissão Mercado Livre" valor={pct(mkt.ml?.comissao)} />
            <Valor rotulo="Comissão Shopee" valor={pct(mkt.shopee?.comissao)} />
          </>}
        </Bloco>

        <Bloco icone={CreditCard} titulo="Plataformas de venda"
          texto="Cadastro dos canais com comissão, taxa fixa, frete e embalagem de cada um."
          href="/plataformas" botao="Abrir plataformas" />

        <Bloco icone={ShoppingBag} titulo="Ligação com a Shopee"
          texto="Autorizar a loja na Shopee e ver se a ligação está ativa."
          href="/painel-marketplaces" botao="Ver ligação da Shopee" />

        <Bloco icone={KeyRound} titulo="Chaves de acesso"
          texto="Chaves que deixam outros sistemas (como o Farol) consultarem dados do Precify."
          href="/chaves-api" botao="Gerenciar chaves" />
      </div>
    </div>
  )
}
