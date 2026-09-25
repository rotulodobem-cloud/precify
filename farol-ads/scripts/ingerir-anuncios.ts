/**
 * Ingestão pela linha de comando (mesmo pipeline da rota /api/ingestao):
 *   npx tsx --env-file=.env scripts/ingerir-anuncios.ts relatorio.xlsx [2026-09-25]
 */
import { readFileSync } from 'fs'
import { basename } from 'path'
import { ingerirRelatorio } from '../src/lib/ingestao'

const [arquivo, data] = process.argv.slice(2)
if (!arquivo) {
  console.error('Uso: npx tsx --env-file=.env scripts/ingerir-anuncios.ts <relatorio.xlsx|csv> [AAAA-MM-DD]')
  process.exit(1)
}
ingerirRelatorio(readFileSync(arquivo), { nomeArquivo: basename(arquivo), capturadoEm: data })
  .then(r => {
    console.log(r.resumo)
    console.error(`\n${r.linhas} linhas · ${r.anuncios} anúncios · ${r.custosAtualizados} custos do Precify · ${r.alertasCriados} alertas novos`)
  })
  .catch(e => { console.error('Falhou:', e.message); process.exit(1) })
