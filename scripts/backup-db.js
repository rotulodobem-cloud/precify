const fs = require('fs');
const path = require('path');

// Carrega o .env manualmente (evita depender do pacote dotenv)
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv(path.join(__dirname, '..', '.env'));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Todas as tabelas do schema.prisma
const MODELS = [
  'produto', 'variacao', 'plataforma', 'precificacao', 'compra', 'lote',
  'fornecedor', 'configuracao', 'kit', 'kitComponente',
  'faturamento', 'fornecedorAlias', 'pedidoCompra', 'pedidoItem',
];

const MAX_BACKUPS = 60; // mantém ~2 meses de backups diários

async function main() {
  const data = {};
  for (const model of MODELS) {
    data[model] = await prisma[model].findMany();
  }

  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');

  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  console.log(`Backup salvo em: ${file}`);
  console.log('Registros:', JSON.stringify(counts));

  const files = fs.readdirSync(dir)
    .filter((f) => f.startsWith('backup-') && f.endsWith('.json'))
    .sort();
  const excess = files.length - MAX_BACKUPS;
  if (excess > 0) {
    for (const f of files.slice(0, excess)) {
      fs.unlinkSync(path.join(dir, f));
    }
    console.log(`Removidos ${excess} backups antigos (mantendo os ${MAX_BACKUPS} mais recentes).`);
  }
}

main()
  .catch((e) => {
    console.error('Erro ao gerar backup:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
