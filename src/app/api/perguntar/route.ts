// "Perguntar ao Precify": recebe uma pergunta em português, monta um pacote
// com os números de compras e giro de estoque e pede a resposta a um modelo
// Claude. O modelo só vê o JSON que vai junto — não tem acesso ao banco.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import db from '@/lib/db'
import { montarSugestoes, resumirSugestoes, ErroFarol, type ItemSugestao } from '@/lib/giroEstoque'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MODELO = process.env.PRECIFY_IA_MODELO || 'claude-opus-5-5'

const SISTEMA = `Você é o analista de compras do Precify, o sistema oficial de CMV da Rótulo do Bem: loja de produtos naturais (granel, chás, temperos, castanhas, suplementos) com Loja Física, Loja Online, Mercado Livre, Shopee e TikTok Shop. Quem pergunta é a Michele, dona do negócio, que decide o que comprar, de quem e em que quantidade. Responda em português do Brasil, direto, como um comprador experiente que conhece a operação.

Como ler o JSON que vem com a pergunta:
- giro: estoque vem do Bling (foto do dia em foto_estoque) e as vendas somam todos os canais nas últimas 13 semanas. Cada produto tem: un (kg ou un), saldo, v30 (venda em 30 dias), dias (quantos dias o saldo dura no ritmo previsto; null = sem venda), sug (quantidade sugerida para cobrir prazo de entrega + cobertura_dias, já arredondada), forn (fornecedor da última compra), preco (último custo unitário pago), valor (sug × preco), tend (variação das 4 últimas semanas contra a média das 13; 0.2 = +20%), zerou (true = ficou dias sem estoque, então a venda real é maior que a registrada), v30_em_kits (parte de v30 que saiu dentro de kits; a venda de kits JÁ está somada na demanda dos componentes, e os kits não aparecem como item de compra), precos (último preço de cada fornecedor com a data) e mais_barato (fornecedor com menor preço nos últimos 120 dias, quando há mais de um).
- status: "urgente" = o saldo acaba antes de uma nova entrega chegar; "comprar" = entra na compra desta rodada; "ok" = coberto; "parado" = mais de 120 dias de estoque ou sem venda com saldo.
- pedido_por_fornecedor: soma do que está em urgente + comprar, por fornecedor da última compra.
- compras: gasto do mês atual e do anterior, por fornecedor, pela data da compra lançada no Precify.
- aumentos_de_custo: compras dos últimos 60 dias em que o custo unitário subiu mais de 5% contra a compra anterior do mesmo produto.
- produtos_citados_na_pergunta: produtos cujo nome, SKU ou fornecedor bate com palavras da pergunta, com todos os campos. Se a pergunta é sobre um produto e ele não aparece aqui nem nas listas, diga que não achou.
- As listas urgentes, comprar e parados trazem só os maiores por valor; os totais em resumo valem para todos.

Regras de resposta:
1. Primeiro a resposta em uma ou duas frases. Depois os números que sustentam. Depois o que fazer, se couber.
2. Use só os números do JSON. Se algo não está lá, diga que não está. Nunca invente produto, preço ou fornecedor.
3. Saldo absurdo (centenas de kg de um item que vende pouco) quase sempre é erro de cadastro no Bling: aponte como dado a conferir, não como estoque real.
4. Ao sugerir de quem comprar, compare o último preço de cada fornecedor e considere a data: preço com mais de 120 dias é referência, não oferta.
5. Formato: texto corrido e listas simples com "-". Sem tabelas, sem títulos com #, sem negrito com asteriscos. Valores em R$ com duas casas, quantidades com a unidade. Seja breve: no máximo cerca de 250 palavras, a não ser que a pergunta peça a lista completa.`

const PARAR = new Set(['para', 'como', 'qual', 'quais', 'esse', 'essa', 'este', 'esta', 'isso', 'aqui', 'onde', 'quando', 'posso', 'fazer', 'produto', 'produtos', 'sobre', 'mais', 'menos', 'muito', 'pouco', 'hoje', 'ontem', 'semana', 'meses', 'custo', 'custos', 'preco', 'preço', 'precos', 'preços', 'venda', 'vendas', 'quanto', 'quantos', 'quanta', 'tenho', 'temos', 'devo', 'deveria', 'pode', 'ainda', 'tambem', 'também', 'porque', 'entao', 'então', 'minha', 'nosso', 'nossa', 'comprar', 'compra', 'compras', 'compro', 'comprei', 'estoque', 'fornecedor', 'fornecedores', 'pedido', 'parado', 'parados', 'acabando', 'acaba', 'falta', 'faltando', 'preciso', 'precisa', 'melhor', 'barato', 'caro', 'esta', 'está', 'estao', 'estão', 'gastei', 'gasto', 'total', 'lista', 'todos', 'todas', 'urgente', 'urgentes', 'dias', 'quem', 'deste', 'desta', 'desse', 'dessa', 'último', 'ultimo', 'última', 'ultima'])

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function termosDe(pergunta: string): string[] {
  const vistos = new Set<string>()
  for (const bruto of semAcento(pergunta).split(/[^a-z0-9]+/)) {
    const ehSku = /^[0-9]{2,}$/.test(bruto) || /^[a-z]{2}[0-9]{4,}$/.test(bruto)
    if (!ehSku && (bruto.length < 4 || PARAR.has(bruto))) continue
    vistos.add(bruto)
    if (vistos.size >= 8) break
  }
  return [...vistos]
}

const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10)
const r2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100)
const dia = (d: Date) => d.toISOString().slice(0, 10)

function linha(i: ItemSugestao, completo = false) {
  return {
    sku: i.sku, nome: i.nome, un: i.unidade, status: i.status,
    saldo: r1(i.saldo), v30: r1(i.venda30d), dias: i.cobertura == null ? null : Math.floor(i.cobertura),
    sug: i.sugestao, forn: i.fornecedorPadrao || null, preco: r2(i.custoRef), valor: r2(i.valorSugerido),
    ...(i.tendencia != null && Math.abs(i.tendencia) >= 0.15 ? { tend: r2(i.tendencia) } : {}),
    ...(i.corrigidoRuptura ? { zerou: true } : {}),
    ...(i.viaKits30d > 0 ? { v30_em_kits: r1(i.viaKits30d) } : {}),
    ...(i.melhorPreco && i.melhorPreco !== i.fornecedorPadrao ? { mais_barato: i.melhorPreco } : {}),
    ...(i.status === 'parado' ? { valor_parado: r2(i.valorParado) } : {}),
    ...(completo ? { prazo_entrega_dias: i.prazoDias, v90: r1(i.venda90d), precos: i.fornecedores.map(f => ({ forn: f.nome, preco: r2(f.preco), data: dia(f.data), qtd: r1(f.qtd) })) } : {}),
  }
}

async function montarContexto(pergunta: string) {
  const s = await montarSugestoes(30)
  const resumo = resumirSugestoes(s, 0)
  const por = (st: ItemSugestao['status'], campo: 'valorSugerido' | 'valorParado', n: number) =>
    s.itens.filter(i => i.status === st).sort((a, b) => b[campo] - a[campo]).slice(0, n).map(i => linha(i))

  const termos = termosDe(pergunta)
  const citados = termos.length
    ? s.itens.filter(i => {
        const alvo = semAcento(`${i.sku} ${i.nome} ${i.fornecedores.map(f => f.nome).join(' ')} ${i.fornecedorPadrao}`)
        return termos.some(t => (/^[0-9]+$/.test(t) ? i.sku === t : alvo.includes(t)))
      }).sort((a, b) => b.valorSugerido + b.valorParado - (a.valorSugerido + a.valorParado)).slice(0, 60).map(i => linha(i, true))
    : []

  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const inicioAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)
  const ha60 = new Date(agora.getTime() - 60 * 86400000)
  const [doisMeses, aumentos] = await Promise.all([
    db.compra.findMany({ where: { dataCompra: { gte: inicioAnterior } }, select: { dataCompra: true, fornecedor: true, custoTotal: true } }),
    db.compra.findMany({
      where: { dataCompra: { gte: ha60 }, variacaoPct: { gt: 0.05 } }, orderBy: { variacaoPct: 'desc' }, take: 25,
      select: { skuPrincipal: true, nomeProduto: true, fornecedor: true, custoAnterior: true, custoUnitario: true, variacaoPct: true, dataCompra: true },
    }),
  ])
  const gasto = (lista: typeof doisMeses) => {
    const m = new Map<string, number>()
    for (const c of lista) m.set(c.fornecedor || 'Sem fornecedor', (m.get(c.fornecedor || 'Sem fornecedor') ?? 0) + c.custoTotal)
    return {
      total: r2(lista.reduce((a, c) => a + c.custoTotal, 0)), lancamentos: lista.length,
      por_fornecedor: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([forn, valor]) => ({ forn, valor: r2(valor) })),
    }
  }

  return {
    hoje: dia(agora),
    giro: {
      foto_estoque: s.fotoEstoque, cobertura_dias: s.coberturaDias,
      prazo_entrega: 'cada produto traz o seu em prazo_entrega_dias quando citado; no geral são 2 dias',
      resumo: { urgentes: resumo.urgentes, comprar: resumo.comprar, parados: resumo.parados, produtos_vendidos_sem_cadastro_no_precify: s.semCadastro, kits_vendidos_sem_composicao_cadastrada: s.kitsSemComposicao },
      pedido_por_fornecedor: resumo.pedidoPorFornecedor.slice(0, 25),
      urgentes: por('urgente', 'valorSugerido', 40),
      comprar: por('comprar', 'valorSugerido', 40),
      parados: por('parado', 'valorParado', 30),
    },
    compras: {
      mes_atual: gasto(doisMeses.filter(c => c.dataCompra >= inicioMes)),
      mes_anterior: gasto(doisMeses.filter(c => c.dataCompra < inicioMes)),
    },
    aumentos_de_custo: aumentos.map(a => ({
      sku: a.skuPrincipal, nome: a.nomeProduto, forn: a.fornecedor, de: r2(a.custoAnterior), para: r2(a.custoUnitario),
      aumento_pct: r1((a.variacaoPct ?? 0) * 100), data: dia(a.dataCompra),
    })),
    produtos_citados_na_pergunta: citados,
  }
}

export async function GET() {
  return NextResponse.json({ configurada: !!process.env.ANTHROPIC_API_KEY })
}

export async function POST(req: NextRequest) {
  const corpo = await req.json().catch(() => ({}))
  const pergunta = String(corpo.pergunta ?? '').trim().slice(0, 2000)
  const historico: { papel: string; texto: string }[] = Array.isArray(corpo.historico) ? corpo.historico.slice(-6) : []
  if (!pergunta) return NextResponse.json({ error: 'Escreva a pergunta.' }, { status: 400 })
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'A chave da IA ainda não foi configurada neste servidor (variável ANTHROPIC_API_KEY).' }, { status: 503 })
  }

  let contexto: Awaited<ReturnType<typeof montarContexto>>
  try {
    contexto = await montarContexto(pergunta)
  } catch (e) {
    if (e instanceof ErroFarol) return NextResponse.json({ error: e.mensagem }, { status: 503 })
    throw e
  }

  const mensagens: Anthropic.Beta.BetaMessageParam[] = [
    ...historico.filter(h => h?.texto).map((h): Anthropic.Beta.BetaMessageParam => ({
      role: h.papel === 'precify' ? 'assistant' : 'user', content: String(h.texto).slice(0, 4000),
    })),
    { role: 'user', content: `DADOS DO PRECIFY (JSON):\n${JSON.stringify(contexto)}\n\nPERGUNTA: ${pergunta}` },
  ]

  const client = new Anthropic()
  try {
    const resp = await client.beta.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: SISTEMA,
      messages: mensagens,
      // respostas rápidas sobre números já calculados: esforço baixo basta
      output_config: { effort: 'low' },
      // se o modelo recusar por filtro de segurança, a API repete em outro modelo
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    })
    if (resp.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'O modelo não respondeu a essa pergunta. Tente reformular.' }, { status: 422 })
    }
    const resposta = resp.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('\n').trim()
    return NextResponse.json({
      resposta: resposta || 'Não consegui montar uma resposta. Tente reformular a pergunta.',
      modelo: resp.model,
      tokens: { entrada: resp.usage.input_tokens, saida: resp.usage.output_tokens },
    })
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: 'A Anthropic recusou a chave configurada (ANTHROPIC_API_KEY).' }, { status: 502 })
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: 'Limite de uso da IA atingido agora. Tente de novo em um minuto.' }, { status: 429 })
    if (e instanceof Anthropic.BadRequestError) return NextResponse.json({ error: `A Anthropic rejeitou o pedido: ${e.message.slice(0, 200)}` }, { status: 502 })
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `A IA está indisponível agora (erro ${e.status ?? 'de conexão'}). Tente de novo.` }, { status: 502 })
    throw e
  }
}
