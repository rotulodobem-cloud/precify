import { NextResponse, type NextRequest } from 'next/server'
import * as XLSX from 'xlsx'
import { carregarPainel } from '@/lib/dados'
import { lerFiltros } from '@/lib/filtros'
import { nomeCanal, ROTULO_TIPO } from '@/lib/tipos'

export const runtime = 'nodejs'

const r2 = (v: number | null | undefined) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100)
const p1 = (v: number | null | undefined) => (v == null || !isFinite(v) ? null : Math.round(v * 1000) / 10)

export async function GET(req: NextRequest) {
  const sp = Object.fromEntries(req.nextUrl.searchParams)
  const f = lerFiltros(sp)
  const d = await carregarPainel(f)
  const tipo = sp.tipo ?? 'produtos'
  let linhas: Record<string, unknown>[] = []

  if (tipo === 'produtos' || tipo === 'recomendacoes') {
    linhas = d.anuncios.map(a => ({
      Canal: nomeCanal(a.canal), Anúncio: a.codigoAnuncio, SKU: a.sku, Produto: a.titulo, Categoria: a.categoria, Campanhas: a.campanhas.join(' | '),
      'Receita total': r2(a.economia.receitaLiquida), 'Investimento ads': r2(a.investimento), 'Receita atribuída': r2(a.receitaAds),
      Vendas: a.economia.vendas, Cliques: a.cliques, Impressões: a.impressoes,
      'Margem antes de ads (R$)': r2(a.economia.margemPreAds), 'Margem antes de ads (%)': p1(a.economia.margemPreAdsPct),
      'Margem após ads (R$)': r2(a.economia.margemPosAds), 'Margem após ads (%)': p1(a.economia.margemPosAdsPct),
      ROAS: r2(a.economia.roas), 'ROAS equilíbrio': r2(a.economia.roasEquilibrio), 'ROAS objetivo': a.roasObjetivo,
      'ACOS (%)': p1(a.economia.acos), 'ACOS equilíbrio (%)': p1(a.economia.acosEquilibrio), 'TACOS (%)': p1(a.economia.tacos),
      'CTR (%)': p1(a.economia.ctr), 'CVR (%)': p1(a.economia.cvr), CPC: r2(a.economia.cpc),
      Estado: a.diagnostico.estado, Gravidade: a.diagnostico.gravidade, 'Impacto estimado': r2(a.diagnostico.impacto),
      Situação: a.diagnostico.situacao, Evidência: a.diagnostico.evidencias.join(' | '), Impacto: a.diagnostico.impactoTexto, Ação: a.diagnostico.acao,
      'Margem parcial': a.economia.margemParcial ? 'sim' : 'não', 'Custo cadastrado': a.economia.custoNaoCadastrado ? 'não' : 'sim',
    }))
    if (tipo === 'recomendacoes') linhas.sort((x, y) => Number(x['Impacto estimado']) - Number(y['Impacto estimado']))
  } else if (tipo === 'campanhas') {
    linhas = d.campanhas.map(c => ({
      Canal: nomeCanal(c.canal), Campanha: c.nome, Status: c.status, 'Orçamento/dia': c.orcamento, 'ROAS objetivo': c.roasObjetivo,
      Impressões: c.impressoes, Cliques: c.cliques, Investimento: r2(c.investimento), 'Receita atribuída': r2(c.receita), Vendas: c.vendas,
      ROAS: r2(c.investimento ? c.receita / c.investimento : null), 'Margem após ads (R$)': r2(c.margemPosAds), 'Margem após ads (%)': p1(c.margemPosAdsPct),
      Anúncios: c.anuncios, Estado: c.estado, Gravidade: c.gravidade,
    }))
  } else if (tipo === 'alertas') {
    linhas = d.alertas.map(a => ({
      Data: a.criadoEm, Canal: nomeCanal(a.canal), Tipo: ROTULO_TIPO[a.tipo] ?? a.tipo, Produto: a.titulo, SKU: a.sku, Campanha: a.campanha,
      Gravidade: a.gravidade, Status: a.status, Problema: a.problema, Causa: a.causa, Ação: a.acao, 'Resolvido em': a.resolvidoEm,
    }))
  } else if (tipo === 'promocoes') {
    linhas = d.promocoes.map(p => ({
      Canal: nomeCanal(p.canal), Item: p.itemId, Produto: p.titulo, SKU: p.sku, Preço: p.preco, 'Preço original': p.precoOriginal,
      'Desconto (%)': p1(p.desconto), Status: p.status, Início: p.desde, 'Encerrada em': p.encerradaEm, 'Dias ativa': p.diasAtiva,
    }))
  } else {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), tipo.slice(0, 31))
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="farol-${tipo}-${f.de}_${f.ate}.xlsx"`,
    },
  })
}
