import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'
import { CANAIS_MULTICANAL, calcularCanalModoPreco } from '@/lib/calculosMulticanal'
import { statusMargem } from '@/lib/calculos'

// Permite chamadas do sistema de gestão financeira (arquivo HTML local)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const CANAIS_EXTERNOS = ['lp', 'mlFull', 'mlClassico', 'sh', 'tt']
const SLUG_EXTERNO: Record<string, string> = {
  lp: 'loja_propria', mlFull: 'ml_full', mlClassico: 'ml_classico', sh: 'shopee', tt: 'tiktok',
}
// Só ML Full/Clássico precisam de sufixo pro nome ficar distinguível --
// "Shopee"/"TikTok Shop" já são únicos sozinhos, e o `tag` deles é uma
// frase descritiva (ex: "faixa automática"), não um sufixo de nome.
const NOME_EXTERNO: Record<string, string> = {
  lp: 'Loja Própria', mlFull: 'Mercado Livre FULL', mlClassico: 'Mercado Livre Clássico',
  sh: 'Shopee', tt: 'TikTok Shop',
}

function montarAnuncios(c: {
  custoProduto: number; pesoGramas: number | null
  despesasVariaveisPct: number; despesasFixasPct: number
  canais: unknown; canaisAtivos: unknown
}) {
  const ativos = (c.canaisAtivos ?? {}) as Record<string, boolean>
  const canaisCfg = (c.canais ?? {}) as Record<string, Record<string, number>>
  const anuncios: Record<string, unknown>[] = []

  for (const key of CANAIS_EXTERNOS) {
    if (key !== 'lp' && !ativos[key]) continue
    const def = CANAIS_MULTICANAL.find(d => d.key === key)
    const cfg = canaisCfg[key] ?? def?.default
    if (!def || !cfg) continue

    const r = calcularCanalModoPreco({
      custoProduto: c.custoProduto, despVarPct: c.despesasVariaveisPct, despFixPct: c.despesasFixasPct,
      pesoGramas: c.pesoGramas, canal: cfg as any, def, shAuto: true,
    })

    anuncios.push({
      canal: SLUG_EXTERNO[key],
      precoAtual: null,
      precoMinimo: r ? r.precoMinimo : null,
      precoIdeal: r ? r.preco : null,
      precoMaximo: null,
      precoPromocional: r ? Math.round(r.preco * 1.4 * 100) / 100 : null,
      margemAtual: r ? r.margem : null,
      statusMargem: r ? statusMargem(r.margem) : 'SEM_PRECO',
      comissaoPct: cfg.com != null ? cfg.com / 100 : null,
      impostoPct: null,
    })
  }
  return anuncios
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo')
  const sku = searchParams.get('sku')
  const mes = searchParams.get('mes') // formato: 2026-05

  try {
    // ── 1. CATÁLOGO COMPLETO DE PRODUTOS ──────────────────────────────────
    if (tipo === 'produtos') {
      const produtos = await db.produto.findMany({
        where: { status: 'ativo' },
        select: {
          skuPrincipal: true, nome: true, categoria: true,
          custoAtualizado: true, custoUnitario: true, custoPorKg: true,
          unidadeCompra: true, fornecedorPrincipal: true, dataUltimaCompra: true,
          variacoes: {
            where: { status: 'ativo' },
            select: { skuVariacao: true, nomeVariacao: true, pesoGramas: true, custoTotal: true, custoCalculado: true },
          },
        },
        orderBy: { nome: 'asc' },
      })

      const calculos = await db.calculoMulticanal.findMany({
        select: {
          skuVariacao: true, custoProduto: true, pesoGramas: true,
          despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true,
        },
      })
      const porSkuVariacao = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

      const produtosResposta = produtos.map(produto => ({
        ...produto,
        variacoes: produto.variacoes.map(variacao => {
          const calc = porSkuVariacao.get(variacao.skuVariacao)
          return { ...variacao, anuncios: calc ? montarAnuncios(calc) : [] }
        }),
      }))

      return NextResponse.json({ ok: true, data: produtosResposta }, { headers: CORS_HEADERS })
    }

    // ── 2. PRODUTO ESPECÍFICO POR SKU ─────────────────────────────────────
    if (tipo === 'produto' && sku) {
      const produto = await db.produto.findFirst({
        where: {
          OR: [
            { skuPrincipal: { contains: sku, mode: 'insensitive' } },
            { nome: { contains: sku, mode: 'insensitive' } },
            { variacoes: { some: { skuVariacao: { contains: sku, mode: 'insensitive' } } } },
          ],
        },
        include: { variacoes: { where: { status: 'ativo' } } },
      })

      if (!produto) {
        return NextResponse.json({ ok: false, error: 'Produto não encontrado' }, { status: 404, headers: CORS_HEADERS })
      }

      const skusVariacao = produto.variacoes.map(v => v.skuVariacao)
      const calculos = await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: skusVariacao } },
        select: {
          skuVariacao: true, custoProduto: true, pesoGramas: true,
          despesasVariaveisPct: true, despesasFixasPct: true, canais: true, canaisAtivos: true,
        },
      })
      const porSkuVariacao = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

      const produtoResposta = {
        ...produto,
        variacoes: produto.variacoes.map(variacao => {
          const calc = porSkuVariacao.get(variacao.skuVariacao)
          return { ...variacao, anuncios: calc ? montarAnuncios(calc) : [] }
        }),
      }

      return NextResponse.json({ ok: true, data: produtoResposta }, { headers: CORS_HEADERS })
    }

    // ── 3. FATURAMENTO DIÁRIO POR MÊS ─────────────────────────────────────
    if (tipo === 'faturamento') {
      const anoMes = mes || new Date().toISOString().substring(0, 7)
      const [ano, mesNum] = anoMes.split('-').map(Number)
      const inicio = new Date(ano, mesNum - 1, 1)
      const fim = new Date(ano, mesNum, 0, 23, 59, 59)

      const faturamentos = await db.faturamento.findMany({
        where: {
          data: { gte: inicio, lte: fim }
        },
        orderBy: { data: 'asc' }
      })

      // Agrupa por data
      const porData: Record<string, Record<string, number>> = {}
      for (const f of faturamentos) {
        const dia = f.data.toISOString().substring(0, 10)
        if (!porData[dia]) porData[dia] = {}
        porData[dia][f.canal] = f.faturamentoBruto
      }

      const totalMes = faturamentos.reduce((a, f) => a + f.faturamentoBruto, 0)
      const impostoEstimado = faturamentos.reduce((a, f) => a + (f.impostoValor || f.faturamentoBruto * f.impostoPct), 0)

      return NextResponse.json({
        ok: true,
        data: {
          mes: anoMes,
          totalMes,
          impostoEstimado,
          porData,
          detalhes: faturamentos
        }
      }, { headers: CORS_HEADERS })
    }

    // ── 4. PLATAFORMAS E TAXAS ────────────────────────────────────────────
    if (tipo === 'plataformas') {
      const plataformas = CANAIS_MULTICANAL.map(def => ({
        slug: SLUG_EXTERNO[def.key], nome: NOME_EXTERNO[def.key],
        comissaoPct: def.default.com / 100, taxaFixa: def.default.fix, impostoPct: null,
      }))
      return NextResponse.json({ ok: true, data: plataformas }, { headers: CORS_HEADERS })
    }

    // ── 5. ALÍQUOTA E CONFIGURAÇÕES ───────────────────────────────────────
    if (tipo === 'imposto') {
      const mesAtual = new Date().toISOString().substring(0, 7).replace('-', '_')
      const chaves = [
        `imposto_${mesAtual}`,
        'imposto_atual',
        'aliquota_simples',
      ]
      const configs = await db.configuracao.findMany({
        where: { chave: { in: chaves } }
      })

      // Fallback: busca qualquer configuração de imposto
      const todasConfigs = configs.length === 0
        ? await db.configuracao.findMany({
            where: { chave: { contains: 'imposto' } },
            orderBy: { updatedAt: 'desc' },
            take: 3
          })
        : configs

      const aliquota = todasConfigs.length > 0
        ? parseFloat(todasConfigs[0].valor)
        : 0.0829

      return NextResponse.json({
        ok: true,
        data: {
          aliquota,
          aliquotaPct: (aliquota * 100).toFixed(2) + '%',
          configs: todasConfigs
        }
      }, { headers: CORS_HEADERS })
    }

    // ── 6. RESUMO DO DASHBOARD ────────────────────────────────────────────
    if (tipo === 'resumo') {
      const mesAtual = new Date().toISOString().substring(0, 7)
      const [ano, mesNum] = mesAtual.split('-').map(Number)
      const inicio = new Date(ano, mesNum - 1, 1)
      const fim = new Date(ano, mesNum, 0, 23, 59, 59)

      const [totalProdutos, faturamentos] = await Promise.all([
        db.produto.count({ where: { status: 'ativo' } }),
        db.faturamento.findMany({ where: { data: { gte: inicio, lte: fim } } }),
      ])

      const faturamentoMes = faturamentos.reduce((a, f) => a + f.faturamentoBruto, 0)
      const impostoMes = faturamentos.reduce((a, f) => a + (f.impostoValor || f.faturamentoBruto * f.impostoPct), 0)

      const porCanal: Record<string, number> = {}
      for (const f of faturamentos) {
        porCanal[f.canal] = (porCanal[f.canal] || 0) + f.faturamentoBruto
      }

      return NextResponse.json({
        ok: true,
        data: {
          mes: mesAtual,
          totalProdutosAtivos: totalProdutos,
          faturamentoMes,
          impostoMes,
          porCanal,
          plataformas: CANAIS_MULTICANAL.map(def => ({
            slug: SLUG_EXTERNO[def.key], nome: NOME_EXTERNO[def.key],
            comissaoPct: def.default.com / 100, taxaFixa: def.default.fix, impostoPct: null,
          }))
        }
      }, { headers: CORS_HEADERS })
    }

    return NextResponse.json(
      { ok: false, error: 'Parâmetro tipo inválido. Use: produtos, produto, faturamento, plataformas, imposto, resumo' },
      { status: 400, headers: CORS_HEADERS }
    )

  } catch (error) {
    console.error('[API Gestão] Erro:', error)
    return NextResponse.json(
      { ok: false, error: 'Erro interno', detalhes: String(error) },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}