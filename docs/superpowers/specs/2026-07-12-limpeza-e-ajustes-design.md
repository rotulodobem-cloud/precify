# Limpeza e Ajustes — Design

Data: 2026-07-12
Status: Aprovado pelo usuário em conversa (sim, faz sentido)

## Contexto

O sistema Precify acumulou duas frentes de precificação paralelas que não se
comunicam (`Precificacao`/`Plataforma`, legado, e `Anuncio`/canal, mais novo),
e uma área de "precificação multicanal" (Config Multicanal, Lista de Ação,
Simulador de Frete Grátis) que nunca foi totalmente implementada — falta
seed de dados e falta a rota de criar `Canal`, então essas 3 telas nunca
funcionaram. A dona do sistema decidiu consolidar em `Precificacao`/
`Plataforma` e remover a área multicanal por completo, em vez de terminar
de implementá-la.

## Escopo

### 1. Remover módulo Anúncios

- Remover `src/app/anuncios/` (page.tsx e qualquer subpasta).
- Remover `src/app/api/anuncios/` (route.ts e `[id]/route.ts`).
- Remover o link "Anúncios" do `src/components/ui/Sidebar.tsx`.
- Adicionar campo `codigoAnuncio: String?` ao model `Precificacao` em
  `prisma/schema.prisma` (o campo já existe em `Anuncio`, só precisa migrar
  o conceito para `Precificacao`).
- Expor esse campo na UI de `src/app/precificacao/page.tsx` (formulário de
  nova/editar precificação e coluna na tabela).
- Decidir se o model `Anuncio` em si é removido do schema ou apenas
  descontinuado (não usado pela UI). Recomendo remover o model e rodar
  `prisma db push` para não deixar tabela órfã — não há UI que dependa
  dela depois dessa mudança, e a Calculadora (item 3) para de gravar nela.

### 2. Remover Configuração Multicanal, Lista de Ação, Simulador de Frete Grátis

- Remover `src/app/configuracao-multicanal/`, `src/app/lista-acao/`,
  `src/app/simulador-frete-gratis/`.
- Remover `src/app/api/canais/`, `src/app/api/configuracao-precificacao/`,
  `src/app/api/faixas-embalagem/`, `src/app/api/faixas-frete/`,
  `src/app/api/lista-acao/`.
- Remover `src/lib/precificacaoMulticanal.ts` (usado só por essas telas —
  confirmar antes de apagar que nada mais importa dele).
- Remover os 3 links do Sidebar adicionados na sessão de recuperação
  (Config. Multicanal, Lista de Ação, Simulador Frete Grátis).
- Remover do `prisma/schema.prisma`: `Canal`, `ComissaoCategoria`,
  `FaixaEmbalagem`, `FaixaFrete`, `ConfiguracaoPrecificacao`,
  `ListaAcaoPrecificacao`, enum `TipoAcaoPrecificacao`.
- Rodar `prisma db push` para remover essas tabelas do banco de produção
  (dados existentes nelas — 7 canais, 4 faixas de embalagem, 3 faixas de
  frete, 1 configuração — não são usados pela dona do sistema hoje;
  confirmado em conversa que a Lista de Ação era desconhecida pra ela).

### 3. TikTok como Plataforma + Calculadora usando a tabela Plataforma

- Cadastrar "TikTok" como novo registro em `Plataforma` (via UI normal de
  cadastro de plataformas, não precisa de migration).
- Reescrever `src/app/calculadora/page.tsx` para buscar canais de
  `GET /api/plataformas` (filtrando `ativa: true`) em vez do array fixo
  `CANAIS_PADRAO` (ml_full, ml_classico, shopee).
- Os campos de cálculo por canal (comissão, taxa fixa, custo de frete,
  custo de coleta, imposto) passam a vir dos campos já existentes em
  `Plataforma`: `comissaoPct`, `taxaFixa`, `custoFrete`, `custoColeta`,
  `impostoPct`.
- "Salvar" na Calculadora passa a gravar em `Precificacao` (plataformaId +
  skuVariacao), não mais em `Anuncio` (que está sendo removido no item 1).

### 4. Layout da Calculadora — sem rolagem lateral

- Confirmado por print: os cartões de variação já ficam empilhados
  verticalmente. O problema real é a tabela de cada canal, que tem 8
  colunas (Canal, Frete, Custo total, Mínimo, Ideal, Máximo, Promoção,
  Salvar) e passa da largura da tela, exigindo rolagem lateral para ver
  Máximo/Promoção/Salvar. Trocar a tabela por um cartão por canal, com os
  4 preços (Mínimo, Ideal, Máximo, Promoção) num grid que quebra linha
  em vez de colunas fixas — elimina a rolagem horizontal.

### 5. Plataformas: excluir Magalu + botão de excluir

- A rota `DELETE /api/plataformas/[id]` já existe. Adicionar botão de
  lixeira (com confirmação) em `src/app/plataformas/page.tsx`, ao lado do
  botão de editar que já existe.
- Executar a exclusão da plataforma "Magalu" nos dados reais — isso apaga
  em cascata (`onDelete: Cascade`) todas as `Precificacao` ligadas a ela.
  Confirmado com a dona do sistema que é intencional (não usa mais Magalu).

## Fora de escopo (para follow-up separado, não bloqueia esse spec)

- Investigar o relato de "busca por SKU não funciona" — código já busca
  por SKU e nome (`src/app/api/busca/route.ts`), então é provável que seja
  um caso específico ou mal-entendido. Precisa de um exemplo concreto da
  usuária pra reproduzir antes de mexer em algo.

## Riscos e observações

- Remover `Anuncio`/`Canal`/etc. do schema e rodar `db push` é uma mudança
  destrutiva no banco de produção (zephyr). Fazer backup manual
  (`npm run db:backup`) imediatamente antes de rodar o push, além dos
  backups automáticos já configurados.
- A exclusão da Magalu é irreversível (cascade delete). Confirmar
  novamente antes de executar, já que apaga histórico de precificação.
- Remover o link de Anúncios do Sidebar e as rotas de API é uma mudança de
  produção (dispara redeploy no Railway ao dar push). Sem riscos técnicos
  identificados (mesma situação já validada em sessões anteriores: sem
  `prisma migrate deploy` no start command).
