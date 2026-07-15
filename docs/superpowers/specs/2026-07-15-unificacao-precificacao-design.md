# Unificação da Precificação (Parte 1) — Design

Data: 2026-07-15
Status: Aprovado pela usuária em conversa ("Sim, pode escrever a spec")

## Contexto

O sistema hoje tem **dois motores de precificação de marketplace que não se
conversam**, e isso está gerando retrabalho real pra usuária:

1. **Precificação antiga** (`Precificacao` model, telas `/precificacao` e
   `/calculadora`) — um registro por SKU×Plataforma. Cobertura esparsa (122
   registros, só o que alguém precificou manualmente por ali). Só guarda 1
   preço de Mercado Livre por vez (`tipoFreteML`: `'full'` ou `'classico'`,
   nunca os dois simultaneamente pro mesmo SKU). Não tem Loja Própria — a
   metodologia dela (comissão %, imposto %, taxa de plataforma) não
   representa uma loja própria, que não tem esses custos. Atualiza sozinha
   quando o custo do produto muda (via `recalcularVariacoesEPrecificacoes`
   em `saveCompra.ts`).

2. **Multicanal RdB** (`CalculoMulticanal` model, tela
   `/precificacao-multicanal`) — um registro por produto, guardando os 5
   canais (Loja Própria, ML Full, ML Clássico, Shopee, TikTok) ao mesmo
   tempo. Estrutura certa, mas só 23 produtos foram salvos ali até agora,
   não tem código de anúncio, e não atualiza sozinho quando o custo muda.

A tela do parceiro (`/parceiro`, feature anterior) foi construída em cima da
Precificação antiga — a mais fraca das duas — e isso deixou o problema mais
visível: SKU de Mercado Livre sem distinção clara Full/Clássico, cobertura
incompleta.

## Decisões confirmadas com a usuária

1. **Motor único**: `CalculoMulticanal` vira a única fonte de preço pra
   todos os canais, aposentando o model `Precificacao`.
2. **Telas antigas saem**: `/calculadora` e `/precificacao` são removidas do
   menu e do código. `/precificacao-multicanal` vira a tela única de
   precificação (nome da rota pode continuar o mesmo, ou ser renomeado —
   decisão de implementação, não muda o comportamento).
3. **Código de anúncio**: guardado no `CalculoMulticanal` (novo campo), mas
   só aparece/edita na tela do parceiro (`/parceiro`) — a tela de
   precificação (admin) não precisa mostrar esse campo.
4. **Cobertura completa desde o dia 1**: produtos sem nenhum preço
   calculado ainda ganham um registro novo com os valores padrão de cada
   canal (`CANAIS_MULTICANAL[].default`), em vez de ficarem em branco.
5. **Migração revisável, não silenciosa**: os 122 registros que hoje só
   existem em `Precificacao` são convertidos pra `CalculoMulticanal` num
   script à parte, com um relatório antes/depois (preço antigo vs. preço
   recalculado pela metodologia nova) pra usuária conferir — o preço pode
   mudar um pouco ao trocar de motor de cálculo, e isso não deve ser
   silencioso.
6. **Sem sincronização de preço**: diferente da Precificação antiga (que
   guarda o preço calculado e precisa re-sincronizar), o Multicanal RdB
   sempre calcula o preço na hora, a partir do `custoProduto` guardado no
   registro. "Atualizar sozinho quando o custo muda" vira só: manter o
   `custoProduto` do `CalculoMulticanal` sincronizado com o custo real do
   produto sempre que uma compra nova mudar esse custo — o preço
   recalculado aparece automaticamente, sem guardar nem re-sincronizar
   nenhum valor de preço.

## Descoberta: `/api/gestao` também depende da Precificação antiga

O painel externo em HTML que a usuária já usa (`/api/gestao`, endpoint CORS
público) lê `Precificacao` pros tipos `produtos`, `produto`, `plataformas` e
`resumo`. Precisa ser repontado pro `CalculoMulticanal` como parte deste
projeto, senão quebra. Isso é, na verdade, uma chance de resolver uma
pendência antiga: uma mudança anterior (fora deste projeto) já tinha
colapsado a distinção ML Full/Clássico nesse endpoint pra só `'ml'`
genérico (ficou registrado como pendência não resolvida) — o
`CalculoMulticanal`, tendo os dois canais separados, resolve isso de vez.

## Arquitetura

### Schema (`prisma/schema.prisma`)

- `CalculoMulticanal` ganha um campo novo: `codigosAnuncio Json?` — mapa
  `{ mlFull?: string, mlClassico?: string, sh?: string, tt?: string }`
  (chaves = as mesmas de `CANAIS_MULTICANAL`; `lp` nunca aparece aqui, Loja
  Própria não tem anúncio pra codificar). Campo separado do `canais`
  (que guarda só configuração de cálculo), pra não misturar "parâmetro de
  cálculo" com "metadado operacional".
- `Precificacao` e as rotas/telas que dependem só dela são removidas depois
  que a migração for confirmada e tudo estiver repontado (não antes).

### Sincronização de custo (substitui "recálculo automático")

- `src/lib/saveCompra.ts`: a função que hoje atualiza `Precificacao` quando
  o custo de um produto muda (`recalcularVariacoesEPrecificacoes`) passa a
  também atualizar `CalculoMulticanal.custoProduto` (e `pesoGramas`, se
  aplicável) pros registros cujo `skuVariacao` bate com a variação que
  mudou de custo. Só afeta registros com `skuVariacao` preenchido (ligados
  a um produto real via a busca-e-preenchimento da tela) — registros
  digitados manualmente sem vínculo (sku vazio) não têm como ser
  atualizados com segurança e continuam como estão hoje.

### `/api/parceiro/precificacao` (repontar)

- Passa a ler de `CalculoMulticanal` em vez de `Precificacao`. Cada linha
  vira: 1 produto × 1 canal de marketplace (`mlFull`, `mlClassico`, `sh`,
  `tt` — Loja Própria nunca aparece pro parceiro, mesmo comportamento de
  hoje). Preço de venda e preço promocional calculados na hora com
  `calcularCanalModoPreco` (mesmo motor da tela principal). Código do
  anúncio lido/escrito em `codigosAnuncio[canal]`.
- Mesma regra de segurança de antes (a que já existe e foi revisada): só os
  campos permitidos saem no `select`/resposta, nunca custo/margem/comissão
  em bruto — aqui não tem "select" de banco pra restringir campo, já que o
  preço vem de cálculo em memória, então a rota constrói a resposta
  explicitamente com só os campos permitidos, nunca devolvendo o objeto de
  configuração do canal (`canal.emb`, `canal.com` etc.) inteiro.

### `/api/gestao` (repontar)

- Tipos `produtos`, `produto`, `plataformas`, `resumo`: trocar a leitura de
  `Precificacao`/`Plataforma` por `CalculoMulticanal`, mantendo o formato
  de resposta externo mais próximo possível do atual (o painel HTML já
  existente não deve quebrar). `canal` no retorno passa a poder ser
  `ml_full`/`ml_classico` (resolvendo a pendência antiga), além de
  `shopee`/`tiktok`/`loja_propria` (novo).

### Migração (script pontual, executado pelo controlador, não pela UI)

- Para cada registro de `Precificacao`: mapear `plataforma.slug` +
  `tipoFreteML` pro canal (`ml`+`full`→`mlFull`, `ml`+`classico`→`mlClassico`,
  `shopee`→`sh`, `tiktok`→`tt`). Encontrar ou criar o `CalculoMulticanal` do
  produto/variação correspondente. Preencher `canais[canal]` com os valores
  equivalentes (comissão, taxa, frete, embalagem) e `codigosAnuncio[canal]`
  com o `codigoAnuncio` antigo, se houver. Preço final recalculado do zero
  pela metodologia nova, não copiado do antigo.
- Produtos/variações sem nenhum registro em nenhum dos dois sistemas:
  criar `CalculoMulticanal` com os 5 canais em valores padrão.
- Backup completo antes de rodar (`node scripts/backup-db.js`), e um
  relatório (arquivo, não só console) comparando preço antigo × novo por
  SKU×canal, pra usuária revisar antes de considerar a migração concluída.

## Fora de escopo (fica pra Parte 2, próximo ciclo)

- Planner/checklist de atualização de preço na Loja Própria (usuária pediu
  explicitamente que fosse depois desta parte, já que depende dela).
- Qualquer alteração de fluxo pro parceiro além do repontamento de dados
  (a tela `/parceiro` continua igual, só troca a fonte por baixo).

## Riscos e verificação

- **Preços podem mudar visivelmente** depois da migração (metodologia
  nova). Mitigado pelo relatório antes/depois — usuária revisa antes de
  aprovar como definitivo.
- **`/api/gestao` é uma integração externa viva** (painel HTML que a
  usuária já usa hoje) — qualquer mudança de formato de resposta precisa
  ser confirmada com ela antes de ir pra produção, não só testada
  internamente.
- Sem framework de testes automatizado — verificação por
  `npx tsc --noEmit`, `npm run build`, e testes ao vivo (Playwright/curl)
  cobrindo: tela de precificação única funcionando pra todos os canais,
  `/parceiro` continuando a funcionar (com dados vindos do novo lugar),
  `/api/gestao` respondendo no formato esperado pro painel externo.
