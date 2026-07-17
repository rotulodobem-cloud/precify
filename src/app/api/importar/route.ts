import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { saveCompra } from '@/lib/saveCompra'

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

// ─── Handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const fd = await req.formData()
  const file = fd.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Arquivo obrigatório' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: false })

  const resultado = await importarCompras(wb) as Record<string, unknown>
  resultado.tipo = 'compras'
  resultado.mensagem = `${resultado.importados} compras importadas. Custos de ${resultado.custosAtualizados} produtos atualizados automaticamente.`

  return NextResponse.json(resultado)
}
