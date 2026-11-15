// Monta a sugestão de compras juntando estoque e vendas (Farol/Bling) com
// preços e fornecedores (Precify). Usado pela tela "O que comprar", pelo
// Dashboard e pelas perguntas rápidas. Só roda no servidor.
import db from '@/lib/db'
import { calcularGiro, serieSemanal, arredondarCompra, prazoEntrega, type StatusGiro } from '@/lib/sugestaoCompra'

// O Farol (Supabase) sincroniza com o Bling e expõe uma função só de leitura,
// protegida por chave própria.
interface ItemFarol {
  sku: string; saldo: number | null; dias_foto: number; dias_zerado: number
  semanas: { s: number; un: number; kg: number }[]; itens_sem_peso: number
}
interface RespostaFarol { gerado_em: string; foto_estoque: string | null; itens: ItemFarol[] }

export class ErroFarol extends Error {
  constructor(public codigo: string) { super(codigo) }
  get mensagem() {
    return this.codigo === 'SEM_CONFIG'
      ? 'A ligação com o Farol (estoque e vendas do Bling) ainda não foi configurada neste servidor.'
      : `Não foi possível ler estoque e vendas do Farol (${this.codigo}).`
  }
}

let cache: { em: number; dados: RespostaFarol } | null = null
const CACHE_MS = 10 * 60 * 1000

async function lerFarol(forcar: boolean): Promise<RespostaFarol> {
  if (!forcar && cache && Date.now() - cache.em < CACHE_MS) return cache.dados
  const { FAROL_URL, FAROL_ANON_KEY, FAROL_CHAVE_LEITURA } = process.env
  if (!FAROL_URL || !FAROL_ANON_KEY || !FAROL_CHAVE_LEITURA) throw new ErroFarol('SEM_CONFIG')
  let r: Response
  try {
    r = await fetch(`${FAROL_URL}/rest/v1/rpc/precify_giro_estoque`, {
      method: 'POST', cache: 'no-store',
      headers: { apikey: FAROL_ANON_KEY, Authorization: `Bearer ${FAROL_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_chave: FAROL_CHAVE_LEITURA }),
    })
  } catch { throw new ErroFarol('SEM_CONEXAO') }
  if (!r.ok) throw new ErroFarol(`HTTP_${r.status}`)
  const dados = await r.json() as RespostaFarol
  cache = { em: Date.now(), dados }
  return dados
}

export interface FornecedorSugestao {
  nome: string; preco: number; data: Date; qtd: number; nomeNoFornecedor: string | null; codigo: string | null
}
export interface ItemSugestao {
  sku: string; nome: string; categoria: string; unidade: 'kg' | 'un'
  saldo: number; semSaldoNoBling: boolean
  venda30d: number; venda90d: number; vendaDia: number; tendencia: number | null
  cobertura: number | null; prazoDias: number
  status: Exclude<StatusGiro, 'sem_venda'>; corrigidoRuptura: boolean
  sugestao: number; semanas: number[]
  fornecedores: FornecedorSugestao[]; fornecedorPadrao: string; melhorPreco: string | null
  custoRef: number | null; valorSugerido: number; valorParado: number
}
export interface Sugestoes {
  fotoEstoque: string | null; geradoEm: string; coberturaDias: number; semCadastro: number; itens: ItemSugestao[]
}

export async function montarSugestoes(coberturaDias = 30, forcar = false): Promise<Sugestoes> {
  const farol = await lerFarol(forcar)

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

  const itens = produtos.flatMap((p): ItemSugestao[] => {
    const f = farolPorSku.get(p.skuPrincipal)
    if (!f) return []
    // granel tem SKU só numérico; os demais códigos (AB…, CP…, VS…) são vendidos por unidade
    const emKg = p.unidadeCompra === 'kg' && /^[0-9]+$/.test(p.skuPrincipal)
    const semanas = serieSemanal(f.semanas.map(s => ({ s: s.s, valor: emKg ? s.kg : s.un })))

    const fornecedores = [...(fornPorSku.get(p.skuPrincipal)?.entries() ?? [])].map(([nome, u]) => {
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
    const saldo = Math.max(0, f.saldo ?? 0)
    const sugestao = arredondarCompra(g.sugestao, emKg ? 'kg' : 'un')
    return [{
      sku: p.skuPrincipal, nome: p.nome, categoria: p.categoria, unidade: emKg ? 'kg' : 'un',
      saldo, semSaldoNoBling: f.saldo == null,
      venda30d: g.venda30d, venda90d: g.venda90d, vendaDia: g.vendaDia, tendencia: g.tendencia,
      cobertura: g.coberturaAtual, prazoDias, status: g.status, corrigidoRuptura: g.corrigidoRuptura,
      sugestao,
      semanas: [...semanas].reverse(), // do mais antigo ao mais recente, para o gráfico
      fornecedores, fornecedorPadrao, melhorPreco, custoRef,
      valorSugerido: sugestao * (custoRef ?? 0),
      valorParado: g.status === 'parado' && custoRef ? saldo * custoRef : 0,
    }]
  })

  return {
    fotoEstoque: farol.foto_estoque,
    geradoEm: farol.gerado_em,
    coberturaDias,
    semCadastro: farol.itens.filter(i => i.semanas.length > 0 && !skusPrecify.has(i.sku) && !/^KIT/i.test(i.sku)).length,
    itens,
  }
}

/** Números de cabeçalho e as listas curtas que o Dashboard mostra. */
export function resumirSugestoes(s: Sugestoes, top = 8) {
  const de = (st: ItemSugestao['status']) => s.itens.filter(i => i.status === st)
  const urg = de('urgente'), com = de('comprar'), par = de('parado')
  const soma = (l: ItemSugestao[], campo: 'valorSugerido' | 'valorParado') => Math.round(l.reduce((a, i) => a + i[campo], 0) * 100) / 100
  const curto = (i: ItemSugestao) => ({
    sku: i.sku, nome: i.nome, unidade: i.unidade, saldo: i.saldo, venda30d: i.venda30d, cobertura: i.cobertura,
    sugestao: i.sugestao, fornecedor: i.fornecedorPadrao, melhorPreco: i.melhorPreco,
    valorSugerido: i.valorSugerido, valorParado: i.valorParado,
  })

  const porForn = new Map<string, { itens: number; valor: number; urgentes: number }>()
  for (const i of [...urg, ...com]) {
    const k = i.fornecedorPadrao || 'Sem fornecedor'
    const a = porForn.get(k) ?? { itens: 0, valor: 0, urgentes: 0 }
    a.itens++; a.valor += i.valorSugerido; if (i.status === 'urgente') a.urgentes++
    porForn.set(k, a)
  }

  return {
    fotoEstoque: s.fotoEstoque, coberturaDias: s.coberturaDias, semCadastro: s.semCadastro,
    urgentes: { n: urg.length, valor: soma(urg, 'valorSugerido') },
    comprar: { n: com.length, valor: soma(com, 'valorSugerido') },
    parados: { n: par.length, valor: soma(par, 'valorParado') },
    topUrgentes: [...urg].sort((a, b) => b.valorSugerido - a.valorSugerido).slice(0, top).map(curto),
    topParados: [...par].sort((a, b) => b.valorParado - a.valorParado).slice(0, top).map(curto),
    pedidoPorFornecedor: [...porForn.entries()]
      .map(([fornecedor, v]) => ({ fornecedor, itens: v.itens, urgentes: v.urgentes, valor: Math.round(v.valor * 100) / 100 }))
      .sort((a, b) => b.valor - a.valor),
  }
}
