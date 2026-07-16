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
7. **Distinguir "anunciado" de "só calculado"**: hoje, todo canal ganha um
   preço calculado assim que o produto existe (decisão 4) — isso mistura
   "preço hipotético, útil pra planejar" com "isso está de fato anunciado
   na plataforma". Cada canal de marketplace (`mlFull`, `mlClassico`, `sh`,
   `tt`) ganha uma marcação **anunciado / não anunciado**. Na tela
   principal, todo canal continua mostrando o preço calculado, mas com
   indicação visual clara de "ainda sem anúncio" quando não estiver
   marcado como anunciado. Na tela do parceiro, só aparecem linhas dos
   canais marcados como anunciados — ele não deve ver preço de canal sem
   anúncio real. Loja Própria não usa essa marcação (não é uma decisão de
   "anunciar ou não", é a própria loja da usuária).
8. **Rótulo Full/Clássico explícito também no parceiro**: a coluna
   Plataforma na tela do parceiro passa a mostrar "Mercado Livre FULL" /
   "Mercado Livre Clássico" como valores distintos (mesma convenção
   nome+tag que a tela principal já usa), não só "Mercado Livre" genérico
   pros dois.
9. **Correção do TikTok Shop, incluída na Parte 1 (antes da migração)**: o
   motor hoje trata o TikTok como comissão fixa de 6% + R$4 — a regra real
   é por faixa de preço, igual à Shopee: abaixo de R$50, 10% de comissão +
   R$4 fixo; a partir de R$50, 6% de comissão + R$6 fixo. Corrigido antes
   da migração/cobertura completa, pra esses registros já nascerem com o
   preço certo (evita recalcular tudo de novo depois).

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

### Correção do TikTok Shop (`src/lib/calculosMulticanal.ts`)

- Hoje o mecanismo de faixa automática (`autoBand`) só existe pra Shopee —
  `shopeeBand(preco)` está com a lógica de banda embutida direto dentro de
  `calcularCanalModoPreco`/`calcularCanalModoAnalise`, específica pra
  Shopee. Generalizar pra funcionar também com TikTok: extrair uma função
  `ttBand(preco): { com: number; fix: number }` (abaixo de R$50 → `{com:
  10, fix: 4}`; a partir de R$50 → `{com: 6, fix: 6}`), marcar
  `CANAIS_MULTICANAL['tt'].autoBand = true`, e trocar a chamada fixa de
  `shopeeBand` dentro do motor por uma seleção da função de banda
  correta conforme o canal (`def.key`), igual já acontece pro resto da
  configuração por canal.
- A tela principal ganha o mesmo tipo de toggle "ajustar faixa
  automaticamente" que a Shopee já tem, agora também pro card do TikTok
  Shop (hoje esse toggle é uma variável única `shAuto` compartilhada por
  toda a tela — precisa virar por-canal, já que Shopee e TikTok podem
  querer ligado/desligado independentemente).
- Tag do card do TikTok Shop (hoje "6% + frete grátis") atualiza pra
  refletir a faixa (ex: "faixa automática", igual ao rótulo da Shopee).

### Schema (`prisma/schema.prisma`)

- `CalculoMulticanal` ganha dois campos novos:
  - `codigosAnuncio Json?` — mapa `{ mlFull?: string, mlClassico?: string,
    sh?: string, tt?: string }` (chaves = as mesmas de `CANAIS_MULTICANAL`;
    `lp` nunca aparece aqui, Loja Própria não tem anúncio pra codificar).
  - `canaisAtivos Json?` — mapa `{ mlFull?: boolean, mlClassico?: boolean,
    sh?: boolean, tt?: boolean }`, marcando se aquele canal tem anúncio
    real (default `false` quando ausente). `lp` também não aparece aqui
    (não se aplica).
  Campos separados do `canais` (que guarda só configuração de cálculo),
  pra não misturar "parâmetro de cálculo" com "metadado operacional".
- `Precificacao` **continua existindo no schema até o fim da Onda B** —
  ela ainda alimenta os 5 pontos descobertos (Dashboard, Variações, Busca,
  Exportar, Importar) até serem repontados. Na Onda A, só as **rotas
  editáveis** (`/calculadora`, `/precificacao` e suas APIs de
  criar/editar) são removidas — o model e a sincronização de custo
  (`saveCompra.ts`) continuam rodando, mantendo os dados existentes vivos
  e atualizados (mesmo que congelados pra edição) até a Onda B terminar de
  repontar tudo e só então remover o model de vez.

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
  vira: 1 produto × 1 canal de marketplace **marcado como anunciado**
  (`canaisAtivos[canal] === true`) — canais sem anúncio real não aparecem
  pro parceiro, mesmo que já tenham um preço calculado. Coluna Plataforma
  mostra "Mercado Livre FULL" / "Mercado Livre Clássico" / "Shopee" /
  "TikTok Shop" (rótulo explícito, não genérico). Preço de venda e preço
  promocional calculados na hora com `calcularCanalModoPreco` (mesmo motor
  da tela principal). Código do anúncio lido/escrito em
  `codigosAnuncio[canal]`.
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
  equivalentes (comissão, taxa, frete, embalagem), `codigosAnuncio[canal]`
  com o `codigoAnuncio` antigo (se houver), e `canaisAtivos[canal] = true`
  (esses registros representam anúncios reais que já existiam). Preço
  final recalculado do zero pela metodologia nova, não copiado do antigo.
- Produtos/variações sem nenhum registro em nenhum dos dois sistemas:
  criar `CalculoMulticanal` com os 5 canais em valores padrão e
  `canaisAtivos` todo `false` (preço só de referência, nada anunciado
  ainda até a usuária confirmar).
- Backup completo antes de rodar (`node scripts/backup-db.js`), e um
  relatório (arquivo, não só console) comparando preço antigo × novo por
  SKU×canal, pra usuária revisar antes de considerar a migração concluída.

## Descoberta: mais 5 telas/funções dependem da Precificação antiga

Mapeando o código, além de `/calculadora` e `/precificacao` (já previstas),
mais 5 pontos leem `Precificacao` diretamente e quebrariam/congelariam se o
model fosse removido sem tratar:

- **`/api/dashboard`** (painel inicial) — contadores saudável/atenção/
  prejuízo, alertas de produtos com prejuízo, comparativo ML×Shopee, média
  de margem por plataforma e por categoria. Lógica própria, não é só trocar
  a fonte — precisa ser redesenhada em cima do `CalculoMulticanal`
  (comparativo generaliza pra todos os canais de marketplace, não só
  ML×Shopee; "sem preço" deixa de existir como conceito — já que todo
  produto tem preço calculado — e vira "sem canal anunciado").
- **`/variacoes`** e **`/busca`** — mostram um resumo/etiqueta de
  precificação por plataforma inline na lista. Passam a mostrar o
  equivalente calculado a partir do `CalculoMulticanal` (só canais
  anunciados, mesma regra da tela do parceiro).
- **`/api/exportar`** — a aba "Precificação" da planilha XLSX exportada
  vira uma linha por SKU×canal do `CalculoMulticanal` em vez de
  SKU×Plataforma da tabela antiga.
- **`/api/importar`** — a função `importarPrecificacao` (abas ML/Shopee/
  TikTok/Magalu) hoje cria registros direto em `Precificacao`. Passa a
  criar/atualizar `CalculoMulticanal` em vez disso, mapeando aba → canal
  (a aba "Magalu" já não bate em nenhuma plataforma ativa hoje — desde a
  remoção da plataforma Magalu num plano anterior — e continua sendo
  ignorada, sem mudança de comportamento aí).

**Decisão da usuária**: migrar tudo isso também, mas em duas ondas dentro
desta mesma Parte 1 — **Onda A** (motor único, correção do TikTok,
sincronização de custo, tela principal, `/parceiro`, `/api/gestao`, remoção
das telas antigas — já desenhada acima) vai pra execução primeiro. **Onda
B** (Dashboard, Variações, Busca, Exportar, Importar) ganha desenho próprio
logo depois, sem atrasar a Onda A.

## Fora de escopo (fica pra Parte 2, próximo ciclo)

- Planner/checklist de atualização de preço na Loja Própria (usuária pediu
  explicitamente que fosse depois desta parte, já que depende dela).
  Ideia já capturada em conversa, pra retomar no desenho da Parte 2: em vez
  de avisar a cada variação de custo entre lotes, o planner compara o
  preço calculado agora (que já fica sempre atualizado sozinho, graças à
  sincronização de custo desta Parte 1, alimentada a cada compra lançada)
  contra o preço que está de fato na loja, e só avisa quando a diferença
  passar de uma margem de tolerância configurável (ex: queda de margem
  abaixo de X%) — evita ruído de repreficar a cada pequena oscilação de
  custo entre lotes.
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
