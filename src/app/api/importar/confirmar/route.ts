import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

const VARIACOES_PADRAO = [
  { sufixo: '0100', nome: '100g',  pesoGramas: 100  },
  { sufixo: '0250', nome: '250g',  pesoGramas: 250  },
  { sufixo: '0500', nome: '500g',  pesoGramas: 500  },
  { sufixo: '01kg', nome: '1kg',   pesoGramas: 1000 },
]

interface LinhaConfirmada {
  linha: number
  data: string
  nomeProduto: string
  fornecedor: string
  quantidade: number
  valorTotal: number
  skuFinal: string       // SKU definido pelo usuário após validação
  precoVenda?: number | null
  isNovo: boolean        // true = precisa criar produto + variações
}

export async function POST(req: NextRequest) {
  const { linhas }: { linhas: LinhaConfirmada[] } = await req.json()

  const resultados = []
  let criados = 0
  let atualizados = 0
  let erros = 0

  for (const linha of linhas) {
    try {
      const custoUnit = linha.quantidade > 0
        ? Math.round((linha.valorTotal / linha.quantidade) * 10000) / 10000
        : 0

      // 1. Criar produto + variações se for novo
      if (linha.isNovo) {
        const existe = await db.produto.findUnique({ where: { skuPrincipal: linha.skuFinal } })

        if (!existe) {
          await db.produto.create({
            data: {
              skuPrincipal:    linha.skuFinal,
              nome:            linha.nomeProduto,
              categoria:       'Geral',
              unidadeCompra:   'kg',
              custoPorKg:      custoUnit,
              custoAtualizado: custoUnit,
              fornecedorPrincipal: linha.fornecedor || null,
              tipoPrecificacao: 'peso_proporcional',
              status:          'ativo',
            },
          })

          // Criar 4 variações padrão
          for (const v of VARIACOES_PADRAO) {
            const skuVar = `${linha.skuFinal}-O${v.sufixo}`
            const varExiste = await db.variacao.findUnique({ where: { skuVariacao: skuVar } })
            if (!varExiste) {
              const custoVar = Math.round((custoUnit * v.pesoGramas / 1000) * 10000) / 10000
              await db.variacao.create({
                data: {
                  skuVariacao:   skuVar,
                  skuPrincipal:  linha.skuFinal,
                  nomeVariacao:  `${linha.nomeProduto} ${v.nome}`,
                  pesoGramas:    v.pesoGramas,
                  custoCalculado: custoVar,
                  custoTotal:    custoVar,
                  status:        'ativo',
                },
              })
            }
          }
        } else {
          // Produto já existe, só atualizar custo
          await db.produto.update({
            where: { skuPrincipal: linha.skuFinal },
            data: { custoPorKg: custoUnit, custoAtualizado: custoUnit },
          })
        }
        criados++
      } else {
        // Produto existente — atualizar custo
        await db.produto.update({
          where: { skuPrincipal: linha.skuFinal },
          data: {
            custoPorKg:      custoUnit,
            custoAtualizado: custoUnit,
            fornecedorPrincipal: linha.fornecedor || undefined,
          },
        })

        // Recalcular variações
        const variacoes = await db.variacao.findMany({ where: { skuPrincipal: linha.skuFinal } })
        for (const v of variacoes) {
          if (v.pesoGramas) {
            const novoCusto = Math.round((custoUnit * v.pesoGramas / 1000) * 10000) / 10000
            await db.variacao.update({
              where: { id: v.id },
              data: { custoCalculado: novoCusto, custoTotal: novoCusto },
            })
          }
        }
        atualizados++
      }

      // 2. Registrar compra
      const ultima = await db.compra.findFirst({
        where: { skuPrincipal: linha.skuFinal },
        orderBy: { dataCompra: 'desc' },
      })

      let variacaoPct = null
      let statusVariacao = null
      if (ultima?.custoUnitario) {
        variacaoPct = (custoUnit - ultima.custoUnitario) / ultima.custoUnitario
        statusVariacao = Math.abs(variacaoPct) <= 0.05
          ? 'ESTAVEL ± 5%'
          : variacaoPct > 0 ? 'AUMENTOU > 5%' : 'DIMINUIU > 5%'
      }

      const dataCompra = linha.data?.includes('T')
        ? new Date(linha.data)
        : new Date((linha.data || new Date().toISOString().slice(0, 10)) + 'T12:00:00')

      await db.compra.create({
        data: {
          dataCompra,
          skuPrincipal:    linha.skuFinal,
          nomeProduto:     linha.nomeProduto,
          fornecedor:      linha.fornecedor || '',
          quantidade:      linha.quantidade,
          custoTotal:      linha.valorTotal,
          frete:           0,
          outrosCustos:    0,
          custoUnitario:   custoUnit,
          custoAnterior:   ultima?.custoUnitario ?? null,
          variacaoPct,
          statusVariacao,
          precoVenda:      linha.precoVenda ?? null,
          impostoPct:      0.0829,
          margem:          null,
          statusFinanceiro: linha.precoVenda ? 'Com preço' : 'Sem preço de venda',
          fonte:           'importacao',
        },
      })

      resultados.push({ linha: linha.linha, ok: true })
    } catch (e) {
      erros++
      resultados.push({ linha: linha.linha, ok: false, erro: String(e) })
    }
  }

  return NextResponse.json({
    ok: true,
    total: linhas.length,
    criados,
    atualizados,
    erros,
    resultados,
  })
}
