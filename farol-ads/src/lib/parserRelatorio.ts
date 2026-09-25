import * as XLSX from 'xlsx'

/**
 * Parser do relatório de anúncios do Mercado Livre ("Anúncios patrocinados / Padrão",
 * total por período) exportado manualmente e enviado para o Drive.
 *
 * O ML muda nomes de coluna com frequência e coloca linhas de título antes do
 * cabeçalho, então: (1) o cabeçalho é localizado procurando a linha que tem
 * "impressões" e "cliques"; (2) cada coluna é reconhecida por uma lista de apelidos.
 * Linhas repetidas do mesmo anúncio na mesma campanha são somadas.
 */

export interface LinhaAnuncioRelatorio {
  codigoAnuncio: string
  sku: string | null
  titulo: string
  campanha: string
  status: string | null
  /** "Catálogo" / "Clássico" / "Premium", quando o relatório traz. */
  tipoAnuncio: string | null
  impressoes: number
  cliques: number
  investimento: number
  receita: number
  vendasDiretas: number
  vendasIndiretas: number
  /** Campos derivados, recalculados a partir das somas (não copiados do relatório). */
  cpc: number | null
  ctr: number | null
  cvr: number | null
  acos: number | null
  roas: number | null
}

export interface ResultadoParser {
  linhas: LinhaAnuncioRelatorio[]
  periodo: { desde: string | null; ate: string | null }
  avisos: string[]
}

type Campo = 'codigo' | 'sku' | 'titulo' | 'campanha' | 'status' | 'tipo' | 'impressoes' | 'cliques'
  | 'investimento' | 'receita' | 'vendasDiretas' | 'vendasIndiretas' | 'vendas'

const APELIDOS: Record<Campo, string[]> = {
  codigo: ['codigo do anuncio', 'código do anúncio', 'id do anuncio', 'numero do anuncio', 'número do anúncio', 'anuncio id', 'item id', 'mlb', 'codigo'],
  sku: ['sku', 'codigo sku', 'sku do vendedor'],
  titulo: ['titulo do anuncio', 'título do anúncio', 'titulo', 'título', 'anuncio', 'anúncio', 'nome do anuncio'],
  campanha: ['campanha', 'nome da campanha', 'campanha nome'],
  status: ['status', 'estado', 'situacao', 'situação'],
  tipo: ['tipo de anuncio', 'tipo de anúncio', 'tipo de publicacao', 'tipo de publicação', 'tipo de listagem', 'catalogo', 'catálogo'],
  impressoes: ['impressoes', 'impressões', 'prints'],
  cliques: ['cliques', 'clicks'],
  investimento: ['investimento', 'investimento (moeda local)', 'custo', 'gasto', 'custo total'],
  receita: ['receita', 'receita (moeda local)', 'vendas brutas', 'faturamento', 'receita total'],
  vendasDiretas: ['vendas diretas', 'vendas por publicidade diretas', 'unidades vendidas diretas', 'qtd vendas diretas'],
  vendasIndiretas: ['vendas indiretas', 'vendas por publicidade indiretas', 'unidades vendidas indiretas', 'qtd vendas indiretas'],
  vendas: ['vendas', 'vendas por publicidade', 'quantidade de vendas', 'unidades vendidas'],
}

export function normalizar(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

/** "R$ 1.234,56" → 1234.56 · "12,5%" → 12.5 · número do Excel passa direto. */
export function numeroBR(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  let s = String(v ?? '').replace(/R\$|%|\s| /g, '').trim()
  if (!s || s === '-' || s === '--') return 0
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  // "12.000" sem vírgula: no relatório brasileiro o ponto é separador de milhar.
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  const n = Number(s)
  return isFinite(n) ? n : 0
}

function mapearCabecalho(cab: unknown[]): Partial<Record<Campo, number>> {
  const norm = cab.map(normalizar)
  const mapa: Partial<Record<Campo, number>> = {}
  const usados = new Set<number>()
  // Primeiro correspondência exata, depois "começa com" — evita "vendas" capturar "vendas diretas".
  for (const modo of ['exato', 'prefixo'] as const) {
    for (const campo of Object.keys(APELIDOS) as Campo[]) {
      if (mapa[campo] != null) continue
      for (const apelido of APELIDOS[campo].map(normalizar)) {
        const idx = norm.findIndex((h, i) => !usados.has(i) && (modo === 'exato' ? h === apelido : h.startsWith(apelido)))
        if (idx >= 0) { mapa[campo] = idx; usados.add(idx); break }
      }
    }
  }
  return mapa
}

function acharPeriodo(linhas: unknown[][]): { desde: string | null; ate: string | null } {
  const re = /(\d{2})\/(\d{2})\/(\d{4})/g
  for (const l of linhas.slice(0, 10)) {
    const texto = l.map(String).join(' ')
    const datas = [...texto.matchAll(re)].map(m => `${m[3]}-${m[2]}-${m[1]}`)
    if (datas.length >= 2) return { desde: datas[0], ate: datas[1] }
  }
  return { desde: null, ate: null }
}

export function parsearLinhas(linhas: unknown[][]): ResultadoParser {
  const avisos: string[] = []
  const idxCab = linhas.slice(0, 30).findIndex(l => {
    const n = l.map(normalizar)
    return n.some(h => h.startsWith('impress')) && n.some(h => h.startsWith('clique'))
  })
  if (idxCab < 0) throw new Error('Não encontrei o cabeçalho do relatório (linha com "Impressões" e "Cliques"). Confira se é o relatório "Anúncios patrocinados".')

  const mapa = mapearCabecalho(linhas[idxCab])
  if (mapa.codigo == null && mapa.titulo == null) throw new Error('O relatório não tem coluna de código nem de título do anúncio.')
  if (mapa.investimento == null) throw new Error('O relatório não tem coluna de investimento.')
  if (mapa.campanha == null) avisos.push('Relatório sem coluna de campanha — anúncios agrupados em "(sem campanha)".')
  if (mapa.sku == null) avisos.push('Relatório sem coluna de SKU — o de-para com o Precify será feito pelo código do anúncio (tabela ads_sku_depara).')
  if (mapa.vendasDiretas == null && mapa.vendas != null) avisos.push('Relatório sem separação de vendas diretas/indiretas — todas contadas como diretas.')

  const pegar = (l: unknown[], c: Campo) => (mapa[c] != null ? l[mapa[c]!] : undefined)
  const agregado = new Map<string, LinhaAnuncioRelatorio>()
  let ignoradas = 0

  for (const l of linhas.slice(idxCab + 1)) {
    if (!l || l.every(x => x == null || String(x).trim() === '')) continue
    const titulo = String(pegar(l, 'titulo') ?? '').trim()
    const codigoBruto = String(pegar(l, 'codigo') ?? '').trim()
    const codigo = (codigoBruto.match(/MLB-?\d+/i)?.[0].replace('-', '').toUpperCase()) || codigoBruto
    if (/^total/i.test(titulo) || /^total/i.test(codigoBruto)) continue
    if (!codigo && !titulo) { ignoradas++; continue }

    const campanha = String(pegar(l, 'campanha') ?? '').trim() || '(sem campanha)'
    const chave = `${codigo || titulo}||${campanha}`
    const diretas = numeroBR(pegar(l, 'vendasDiretas') ?? pegar(l, 'vendas'))
    const atual = agregado.get(chave) ?? {
      codigoAnuncio: codigo || titulo, sku: null, titulo: titulo || codigo, campanha, status: null, tipoAnuncio: null,
      impressoes: 0, cliques: 0, investimento: 0, receita: 0, vendasDiretas: 0, vendasIndiretas: 0,
      cpc: null, ctr: null, cvr: null, acos: null, roas: null,
    }
    atual.sku = atual.sku ?? (String(pegar(l, 'sku') ?? '').trim() || null)
    atual.status = atual.status ?? (String(pegar(l, 'status') ?? '').trim() || null)
    atual.tipoAnuncio = atual.tipoAnuncio ?? (String(pegar(l, 'tipo') ?? '').trim() || null)
    atual.impressoes += numeroBR(pegar(l, 'impressoes'))
    atual.cliques += numeroBR(pegar(l, 'cliques'))
    atual.investimento += numeroBR(pegar(l, 'investimento'))
    atual.receita += numeroBR(pegar(l, 'receita'))
    atual.vendasDiretas += diretas
    atual.vendasIndiretas += numeroBR(pegar(l, 'vendasIndiretas'))
    agregado.set(chave, atual)
  }
  if (ignoradas) avisos.push(`${ignoradas} linha(s) sem código nem título foram ignoradas.`)

  const out = [...agregado.values()].map(a => {
    const vendas = a.vendasDiretas + a.vendasIndiretas
    return {
      ...a,
      investimento: Math.round(a.investimento * 100) / 100,
      receita: Math.round(a.receita * 100) / 100,
      cpc: a.cliques ? a.investimento / a.cliques : null,
      ctr: a.impressoes ? a.cliques / a.impressoes : null,
      cvr: a.cliques ? vendas / a.cliques : null,
      acos: a.receita ? a.investimento / a.receita : null,
      roas: a.investimento ? a.receita / a.investimento : null,
    }
  })
  return { linhas: out, periodo: acharPeriodo(linhas.slice(0, idxCab + 1)), avisos }
}

/** Lê .xlsx/.xls/.csv. Usa a primeira aba que tiver o cabeçalho do relatório. */
export function parsearArquivo(buffer: ArrayBuffer | Buffer): ResultadoParser {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, codepage: 65001 })
  let ultimoErro: unknown = null
  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null })
    try { return parsearLinhas(linhas) } catch (e) { ultimoErro = e }
  }
  throw ultimoErro ?? new Error('Arquivo vazio.')
}
