import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { calcularGiro, serieSemanal, arredondarCompra, prazoEntrega } from '@/lib/sugestaoCompra'

export const dynamic = 'force-dynamic'

// Estoque e vendas vêm do Farol (Supabase), que sincroniza com o Bling.
// O Farol expõe uma função só de leitura, protegida por chave própria.
interface ItemFarol {
  sku: string; saldo: number | null; dias_foto: number; dias_zerado: number
  semanas: { s: number; un: number; kg: number }[]; itens_sem_peso: number
}
interface RespostaFarol { gerado_em: string; foto_estoque: string | null; itens: ItemFarol[] }

let cache: { em: number; dados: RespostaFarol } | null = null
const CACHE_MS = 10 * 60 * 1000

async function lerFarol(forcar: boolean): Promise<RespostaFarol> {
  if (!forcar && cache && Date.now() - cache.em < CACHE_MS) return cache.dados
  const { FAROL_URL, FAROL_ANON_KEY, FAROL_CHAVE_LEITURA } = process.env
  if (!FAROL_URL || !FAROL_ANON_KEY || !FAROL_CHAVE_LEITURA) throw new Error('SEM_CONFIG')
  const r = await fetch(`${FAROL_URL}/rest/v1/rpc/precify_giro_estoque`, {
    method: 'POST', cache: 'no-store',
    headers: { apikey: FAROL_ANON_KEY, Authorization: `Bearer ${FAROL_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_chave: FAROL_CHAVE_LEITURA }),
  })
  if (!r.ok) throw new Error(`FAROL_${r.status}`)
  const dados = await r.json() as RespostaFarol
  cache = { em: Date.now(), dados }
  return dados
}

export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams
  const coberturaDias = Math.min(180, Math.max(7, Number(sp.get('cobertura')) || 30))

  let farol: RespostaFarol
  try {
    farol = await lerFarol(sp.get('atualizar') === '1')
  } catch (e) {
    const msg = (e as Error).message
    return NextResponse.json({
      error: msg === 'SEM_CONFIG'
        ? 'A ligação com o Farol (estoque e vendas do Bling) ainda não foi configurada neste servidor.'
        : `Não foi possível ler estoque e vendas do Farol (${msg}).`,
    }, { status: 503 })
  }

  const umAno = new Date(); umAno.setDate(umAno.getDate() - 365)
  const [produtos, compras, aliases] = await Promise.all([
    db.produto.findMany({
      where: { status: 'ativo' },
      select: { skuPrincipal: true, nome: true, categoria: true, unidadeCompra: true, fornecedorPrincipal: true, custoAtualizado: true, custoPorKg: true, custoUnitario: true },
    }),
    db.compra.findMany({
      where: { dataCompra: { gte: umAno }, fornecedor: { not: '' } },
      orderBy: { dataCompra: 'desc' },
      select: { skuPrincipal: true, fornecedor: true, custoUnitario: true, quantidade: true, dataCompra: true },
    }),
    db.fornecedorAlias.findMany({ where: { ativo: true }, select: { skuPrincipal: true, fornecedor: true, nomeNoFornecedor: true, codigoFornecedor: true } }),
  ])

  const aliasDe = new Map(aliases.map(a => [`${a.skuPrincipal}|${a.fornecedor}`, a]))
  // por SKU: a compra mais recente de cada fornecedor (a lista já vem da mais nova para a mais antiga)
  const fornPorSku = new Map<string, Map<string, { preco: number; data: Date; qtd: number }>>()
  for (const c of compras) {
    let m = fornPorSku.get(c.skuPrincipal)
    if (!m) { m = new Map(); fornPorSku.set(c.skuPrincipal, m) }
    if (!m.has(c.fornecedor)) m.set(c.fornecedor, { preco: c.custoUnitario, data: c.dataCompra, qtd: c.quantidade })
  }

  const farolPorSku = new Map(farol.itens.map(i => [i.sku, i]))
  const skusPrecify = new Set(produtos.map(p => p.skuPrincipal))

  const itens = produtos.flatMap(p => {
    const f = farolPorSku.get(p.skuPrincipal)
    if (!f) return []
    // granel tem SKU só numérico; os demais códigos (AB…, CP…, VS…) são vendidos por unidade
    const emKg = p.unidadeCompra === 'kg' && /^[0-9]+$/.test(p.skuPrincipal)
    const semanas = serieSemanal(f.semanas.map(s => ({ s: s.s, valor: emKg ? s.kg : s.un })))

    const fornMap = fornPorSku.get(p.skuPrincipal)
    const fornecedores = [...(fornMap?.entries() ?? [])].map(([nome, u]) => {
      const a = aliasDe.get(`${p.skuPrincipal}|${nome}`)
      return { nome, preco: u.preco, data: u.data, qtd: u.qtd, nomeNoFornecedor: a?.nomeNoFornecedor ?? null, codigo: a?.codigoFornecedor ?? null }
    })
    const fornecedorPadrao = fornecedores[0]?.nome ?? p.fornecedorPrincipal ?? ''
    // preço velho não é oferta: só compara compras dos últimos 120 dias
    const recentes = fornecedores.filter(x => Date.now() - x.data.getTime() < 120 * 86400000)
    const melhorPreco = recentes.length > 1 ? recentes.reduce((a, b) => (b.preco < a.preco ? b : a)).nome : null

    const prazoDias = prazoEntrega(fornecedorPadrao, p.nome, p.categoria)
    const g = calcularGiro({ semanas, saldo: f.saldo, diasFoto: f.dias_foto, diasZerado: f.dias_zerado, prazoDias, coberturaDias })
    if (g.status === 'sem_venda') return []

    const custoRef = fornecedores[0]?.preco ?? p.custoAtualizado ?? (emKg ? p.custoPorKg : p.custoUnitario) ?? null
    return [{
      sku: p.skuPrincipal, nome: p.nome, categoria: p.categoria, unidade: emKg ? 'kg' : 'un',
      saldo: Math.max(0, f.saldo ?? 0), semSaldoNoBling: f.saldo == null,
      venda30d: g.venda30d, venda90d: g.venda90d, vendaDia: g.vendaDia, tendencia: g.tendencia,
      cobertura: g.coberturaAtual, prazoDias, status: g.status, corrigidoRuptura: g.corrigidoRuptura,
      sugestao: arredondarCompra(g.sugestao, emKg ? 'kg' : 'un'),
      semanas: [...semanas].reverse(), // do mais antigo ao mais recente, para o gráfico
      fornecedores, fornecedorPadrao, melhorPreco, custoRef,
      valorParado: g.status === 'parado' && custoRef ? Math.max(0, f.saldo ?? 0) * custoRef : 0,
    }]
  })

  return NextResponse.json({
    fotoEstoque: farol.foto_estoque,
    geradoEm: farol.gerado_em,
    coberturaDias,
    semCadastro: farol.itens.filter(i => i.semanas.length > 0 && !skusPrecify.has(i.sku) && !/^KIT/i.test(i.sku)).length,
    itens,
  })
}
