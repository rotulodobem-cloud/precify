import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import db from '@/lib/db'
import { calcPrecificacaoCompleta, round2 } from '@/lib/calculos'
import { saveCompra } from '../compras/route'

// ─── Tipo do arquivo ─────────────────────────────────────────
// tipo=compras → CONTROLE_DE_COMPRAS.xlsx
// tipo=precificacao → Planilha_de_Precificação.xlsx
// tipo=auto → tenta detectar automaticamente


function parseExcelDate(v: unknown): Date | null {
  if (!v) return null
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

function n(v: unknown, fallback = 0): number {
  const p = parseFloat(String(v ?? ''))
  return isNaN(p) ? fallback : p
}

function s(v: unknown): string {
  return String(v ?? '').trim()
}

// ─── Importar CONTROLE_DE_COMPRAS ────────────────────────────
async function importarCompras(wb: XLSX.WorkBook) {
  const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('compra')) ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

  let importados = 0
  const erros: string[] = []
  const avisos: string[] = []
  const custosAtualizados = new Set<string>()

  for (const row of rows) {
    try {
      const skuRaw   = s(row['SKU'] ?? row['Sku'] ?? '')
      const produto  = s(row['Produto'] ?? row['produto'] ?? '')
      const fornec   = s(row['Fornecedor'] ?? row['fornecedor'] ?? '')
      const qtd      = n(row['Quantidade'] ?? row['quantidade'])
      const custoT   = n(row['Custo_total'] ?? row['CustoTotal'] ?? row['Custo total'])
      const frete    = n(row['Frete'] ?? row['frete'])
      const outros   = n(row['Outros_custos'] ?? row['OutrosCustos'])
      const pVenda   = n(row['Preço de Venda'] ?? row['preco_venda'] ?? 0) || null
      const imposto  = n(row['Imposto'] ?? row['imposto'] ?? 0.0829)

      const dataRaw  = row['Data_compra'] ?? row['Data'] ?? row['data_compra']
      const dataCompra = parseExcelDate(dataRaw) ?? new Date()

      if (!skuRaw || !produto || !qtd || !custoT) {
        if (skuRaw) avisos.push(`Linha ignorada (dados incompletos): SKU=${skuRaw}`)
        continue
      }

      await saveCompra({
        dataCompra: dataCompra.toISOString(),
        skuPrincipal: skuRaw,
        nomeProduto: produto,
        fornecedor: fornec,
        quantidade: qtd,
        custoTotal: custoT,
        frete, outrosCustos: outros,
        precoVenda: pVenda,
        impostoPct: imposto > 1 ? imposto / 100 : imposto,
        fonte: 'xlsx',
      })

      custosAtualizados.add(skuRaw)
      importados++
    } catch (e) {
      erros.push(String(e))
    }
  }

  return { importados, erros, avisos, custosAtualizados: custosAtualizados.size }
}

// ─── Importar PLANILHA DE PRECIFICAÇÃO ──────────────────────
async function importarPrecificacao(wb: XLSX.WorkBook) {
  const plataformas = await db.plataforma.findMany()
  const platMap: Record<string, typeof plataformas[0] | undefined> = {}
  for (const p of plataformas) platMap[p.slug] = p

  const abas: Record<string, string> = { ML: 'ml', Shopee: 'shopee', SHOPEE: 'shopee', TIKTOK: 'tiktok', TikTok: 'tiktok', Magalu: 'magalu' }

  let importados = 0
  const erros: string[] = []
  const avisos: string[] = []

  for (const sheetName of wb.SheetNames) {
    const slug = abas[sheetName]
    if (!slug) continue
    const plat = platMap[slug]
    if (!plat) { avisos.push(`Plataforma "${sheetName}" não encontrada no banco`); continue }

    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

    for (const row of rows) {
      try {
        const skuRaw  = s(row['SKU'])
        const nomeRaw = s(row['CUSTOS'] ?? row['ITEM'] ?? row['Produto'] ?? '')
        if (!nomeRaw || nomeRaw.length < 2) continue

        const custoPorKg   = n(row['Kg']) || null
        const custoProduct = n(row['CUSTO PRODUTO'] ?? row['CUSTO'] ?? 0)
        const embalColeta  = n(row['EMBALAGEM + Coleta FULL'] ?? row['EMBALAGEM'] ?? 0)
        const freteProd    = n(row['FRETE FULL'] ?? row['Taxa Fixa'] ?? row['FRETE'] ?? plat.taxaFixa)
        const comissao     = n(row['COMISSAO ML'] ?? row['COMISSAO Shoppee'] ?? row['COMISSAO TIKTOK'] ?? row['COMISSAO MAGALU'] ?? plat.comissaoPct)
        const imposto      = n(row['IMPOSTO'] ?? plat.impostoPct)
        const precoVenda   = n(row['PREÇO DE VENDA'] ?? 0) || null
        const comissaoReal = comissao > 1 ? comissao / 100 : comissao
        const impostoReal  = imposto > 1 ? imposto / 100 : imposto

        // SKU: se blank, criar ID único baseado no nome
        const skuFinal = skuRaw || `IMP_${nomeRaw.substring(0, 12).replace(/\s/g, '_').toUpperCase()}`

        // Produto
        const custo = custoPorKg ?? (custoProduct > 0 ? custoProduct : null)
        let produto = await db.produto.findUnique({ where: { skuPrincipal: skuFinal } })
        if (!produto) {
          produto = await db.produto.create({
            data: { skuPrincipal: skuFinal, nome: nomeRaw, categoria: 'Importado', unidadeCompra: custoPorKg ? 'kg' : 'unidade', custoPorKg: custoPorKg ?? null, custoUnitario: !custoPorKg && custoProduct > 0 ? custoProduct : null, custoAtualizado: custo, tipoPrecificacao: custoPorKg ? 'peso_proporcional' : 'custo_fixo', status: 'ativo' },
          })
          avisos.push(`Produto criado: ${skuFinal} — ${nomeRaw}`)
        }

        // Variação: criar 1kg como principal se peso_proporcional, senão OUni
        const pesoGramas = custoPorKg ? 1000 : null
        const skuVar = custoPorKg ? `${skuFinal}-O1kg` : `${skuFinal}-OUni`
        const custoVar = custoPorKg ? round2(custoPorKg * 1) : custoProduct
        const nomVar = custoPorKg ? `${nomeRaw} 1kg` : nomeRaw

        let variacao = await db.variacao.findUnique({ where: { skuVariacao: skuVar } })
        if (!variacao) {
          variacao = await db.variacao.create({
            data: { skuVariacao: skuVar, skuPrincipal: skuFinal, nomeVariacao: nomVar, pesoGramas, fatorConversao: pesoGramas ? 1 : null, custoCalculado: custoVar, custoAdicional: 0, custoTotal: custoVar, status: 'ativo' },
          })
        }

        // Precificação
        const calc = calcPrecificacaoCompleta({
          custoProduto: custoVar,
          custoEmbalagem: embalColeta,
          custoFrete: freteProd,
          custoColeta: 0,
          comissaoPct: comissaoReal,
          impostoPct: impostoReal,
          precoAtual: precoVenda,
        })

        await db.precificacao.upsert({
          where: { skuVariacao_plataformaId: { skuVariacao: skuVar, plataformaId: plat.id } },
          update: { custoEmbalagem: embalColeta, custoFrete: freteProd, comissaoPct: comissaoReal, impostoPct: impostoReal, precoAtual: precoVenda, ...calc },
          create: { skuVariacao: skuVar, plataformaId: plat.id, custoEmbalagem: embalColeta, custoFrete: freteProd, custoColeta: 0, comissaoPct: comissaoReal, impostoPct: impostoReal, precoAtual: precoVenda, ...calc },
        })

        importados++
      } catch (e) {
        erros.push(`${sheetName}: ${String(e)}`)
      }
    }
  }

  return { importados, erros, avisos }
}

// ─── Handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null
  const tipo = (fd.get('tipo') as string) || 'auto'

  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: false })

  // Auto-detecção: se tiver aba "Compras" → é planilha de compras
  const hasCompras    = wb.SheetNames.some(n => n.toLowerCase().includes('compra'))
  const hasPrecificacao = wb.SheetNames.some(n => ['ML', 'Shopee', 'SHOPEE', 'TIKTOK', 'Magalu'].includes(n))

  let resultado: Record<string, unknown>

  if (tipo === 'compras' || (tipo === 'auto' && hasCompras && !hasPrecificacao)) {
    resultado = await importarCompras(wb)
    resultado.tipo = 'compras'
    resultado.mensagem = `${resultado.importados} compras importadas. Custos de ${resultado.custosAtualizados} produtos atualizados automaticamente.`
  } else if (tipo === 'precificacao' || (tipo === 'auto' && hasPrecificacao)) {
    resultado = await importarPrecificacao(wb)
    resultado.tipo = 'precificacao'
    resultado.mensagem = `${resultado.importados} precificações importadas das abas detectadas.`
  } else {
    // Tentar os dois
    const r1 = hasCompras ? await importarCompras(wb) : { importados: 0, erros: [], avisos: [] }
    const r2 = hasPrecificacao ? await importarPrecificacao(wb) : { importados: 0, erros: [], avisos: [] }
    resultado = {
      tipo: 'ambos',
      importados: (r1.importados ?? 0) + (r2.importados ?? 0),
      erros: [...(r1.erros ?? []), ...(r2.erros ?? [])],
      avisos: [...(r1.avisos ?? []), ...(r2.avisos ?? [])],
      mensagem: `Compras: ${r1.importados} | Precificação: ${r2.importados}`,
    }
  }

  return NextResponse.json(resultado)
}
