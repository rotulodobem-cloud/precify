import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

interface LinhaRaw {
  linha: number
  codigo: string
  preco: number
}

export async function POST(req: NextRequest) {
  const { linhas }: { linhas: LinhaRaw[] } = await req.json()

  const codigos = [...new Set(linhas.map(l => l.codigo).filter(Boolean))]

  const calculos = codigos.length
    ? await db.calculoMulticanal.findMany({
        where: { skuVariacao: { in: codigos } },
        select: { id: true, skuVariacao: true, sku: true, nome: true, variacao: true, precoPraticadoLP: true },
      })
    : []
  const porCodigoCalculo = new Map(calculos.filter(c => c.skuVariacao).map(c => [c.skuVariacao as string, c]))

  const codigosSemCalculo = codigos.filter(c => !porCodigoCalculo.has(c))
  const variacoes = codigosSemCalculo.length
    ? await db.variacao.findMany({
        where: { skuVariacao: { in: codigosSemCalculo } },
        include: { produto: { select: { nome: true } } },
      })
    : []
  const porCodigoVariacao = new Map(variacoes.map(v => [v.skuVariacao, v]))

  const codigosSemVariacao = codigosSemCalculo.filter(c => !porCodigoVariacao.has(c))
  const produtos = codigosSemVariacao.length
    ? await db.produto.findMany({ where: { skuPrincipal: { in: codigosSemVariacao } } })
    : []
  const porCodigoProduto = new Map(produtos.map(p => [p.skuPrincipal, p]))

  const resultado = linhas.map(l => {
    const calc = porCodigoCalculo.get(l.codigo)
    if (calc) {
      return {
        linha: l.linha, codigo: l.codigo, precoNovo: l.preco,
        encontrado: true, calculoId: calc.id, skuVariacao: calc.skuVariacao,
        sku: calc.sku, nome: calc.variacao ? `${calc.nome} ${calc.variacao}` : calc.nome,
        precoAntigo: calc.precoPraticadoLP, novoRegistro: false,
      }
    }
    const v = porCodigoVariacao.get(l.codigo)
    if (v) {
      return {
        linha: l.linha, codigo: l.codigo, precoNovo: l.preco,
        encontrado: true, calculoId: null, skuVariacao: v.skuVariacao,
        sku: v.skuPrincipal, nome: `${v.produto.nome} ${v.nomeVariacao}`,
        precoAntigo: null, novoRegistro: true,
      }
    }
    const p = porCodigoProduto.get(l.codigo)
    if (p) {
      return {
        linha: l.linha, codigo: l.codigo, precoNovo: l.preco,
        encontrado: true, calculoId: null, skuVariacao: null,
        sku: p.skuPrincipal, nome: p.nome,
        precoAntigo: null, novoRegistro: true,
      }
    }
    return {
      linha: l.linha, codigo: l.codigo, precoNovo: l.preco,
      encontrado: false, calculoId: null, skuVariacao: null,
      sku: null, nome: null, precoAntigo: null, novoRegistro: false,
    }
  })

  return NextResponse.json(resultado)
}
