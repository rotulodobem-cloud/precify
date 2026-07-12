import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

// Permite chamadas do sistema de gestão financeira (arquivo HTML local)
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
          skuPrincipal: true,
          nome: true,
          categoria: true,
          custoAtualizado: true,
          custoUnitario: true,
          custoPorKg: true,
          unidadeCompra: true,
          fornecedorPrincipal: true,
          dataUltimaCompra: true,
          variacoes: {
            where: { status: 'ativo' },
            select: {
              skuVariacao: true,
              nomeVariacao: true,
              pesoGramas: true,
              custoTotal: true,
              custoCalculado: true,
              precificacoes: {
                select: {
                  precoAtual: true,
                  precoMinimo: true,
                  precoIdeal: true,
                  precoMaximo: true,
                  precoPromocional: true,
                  margemAtual: true,
                  statusMargem: true,
                  comissaoPct: true,
                  impostoPct: true,
                  plataforma: { select: { slug: true } },
                }
              }
            }
          }
        },
        orderBy: { nome: 'asc' }
      })

      // Mantém o formato de resposta externo: cada variação expõe `anuncios`
      // (não `precificacoes`), com `canal` derivado de `plataforma.slug`.
      const produtosResposta = produtos.map(produto => ({
        ...produto,
        variacoes: produto.variacoes.map(variacao => {
          const { precificacoes, ...restoVariacao } = variacao
          return {
            ...restoVariacao,
            anuncios: precificacoes.map(p => ({
              canal: p.plataforma.slug,
              precoAtual: p.precoAtual,
              precoMinimo: p.precoMinimo,
              precoIdeal: p.precoIdeal,
              precoMaximo: p.precoMaximo,
              precoPromocional: p.precoPromocional,
              margemAtual: p.margemAtual,
              statusMargem: p.statusMargem,
              comissaoPct: p.comissaoPct,
              impostoPct: p.impostoPct,
            }))
          }
        })
      }))

      return NextResponse.json({ ok: true, data: produtosResposta }, { headers: CORS_HEADERS })
    }

    // ── 2. PRODUTO ESPECÍFICO POR SKU ─────────────────────────────────────
    if (tipo === 'produto' && sku) {
      const produto = await db.produto.findFirst({
        where: {
          OR: [
            { skuPrincipal: { contains: sku } },
            { nome: { contains: sku } },
            { variacoes: { some: { skuVariacao: { contains: sku } } } }
          ]
        },
        include: {
          variacoes: {
            where: { status: 'ativo' },
            include: {
              precificacoes: {
                include: { plataforma: true }
              }
            }
          }
        }
      })

      if (!produto) {
        return NextResponse.json(
          { ok: false, error: 'Produto não encontrado' },
          { status: 404, headers: CORS_HEADERS }
        )
      }
      return NextResponse.json({ ok: true, data: produto }, { headers: CORS_HEADERS })
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
      const plataformas = await db.plataforma.findMany({
        where: { ativa: true },
        orderBy: { nome: 'asc' }
      })
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

      const [totalProdutos, faturamentos, plataformas] = await Promise.all([
        db.produto.count({ where: { status: 'ativo' } }),
        db.faturamento.findMany({ where: { data: { gte: inicio, lte: fim } } }),
        db.plataforma.findMany({ where: { ativa: true } })
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
          plataformas: plataformas.map(p => ({
            slug: p.slug,
            nome: p.nome,
            comissaoPct: p.comissaoPct,
            taxaFixa: p.taxaFixa,
            impostoPct: p.impostoPct
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