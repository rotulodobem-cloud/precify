-- ═══════════════════════════════════════════════════════════════════════════
-- Farol Ads Multicanal — tabelas, views e permissões (especificação, seções 3 e 6)
-- Projeto Supabase: vqrstpxblbicdfloztzh (mesmo banco do Farol)
--
-- Não quebra nada que já roda: ml_campanhas_snapshot e ml_alertas continuam
-- existindo e sendo gravadas pela tarefa diária; triggers espelham cada gravação
-- nas tabelas novas ads_* (com canal = 'mercado_livre').
--
-- Todas as tabelas novas têm RLS ligado e nenhuma policy: só o service role
-- (Edge Functions / ingestão) lê e grava. O painel usa a role painel_leitura,
-- que só enxerga as views ads_painel_*.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Configuração do motor (limites configuráveis, nunca fixos no código) ────
create table if not exists public.ads_config (
  chave text primary key,
  valor numeric not null,
  descricao text,
  atualizado_em timestamptz not null default now()
);
insert into public.ads_config (chave, valor, descricao) values
  ('minCliques', 50, 'Cliques mínimos para recomendar mudança'),
  ('minInvestimento', 30, 'Investimento mínimo acumulado (R$) para recomendar mudança'),
  ('diasObservacao', 7, 'Dias de observação após alteração (trava)'),
  ('margemPertoDeZeroPct', 0.02, 'Margem após ads considerada perto de zero'),
  ('margemSaudavelPct', 0.08, 'Margem após ads considerada saudável'),
  ('escalarMargemMinPct', 0.12, 'ESCALAR: margem após ads mínima'),
  ('escalarFolgaRoas', 0.30, 'ESCALAR: folga mínima do ROAS sobre o equilíbrio'),
  ('escalarMinVendas', 10, 'ESCALAR: vendas mínimas no período'),
  ('estoqueMinimoEscalar', 30, 'ESCALAR: estoque mínimo (unidades)'),
  ('ctrMinimo', 0.003, 'OTIMIZAR: CTR mínimo'),
  ('cvrMinimo', 0.015, 'OTIMIZAR: conversão mínima'),
  ('minCliquesConversao', 150, 'OTIMIZAR: cliques mínimos para julgar conversão'),
  ('deterioracaoPct', 0.30, 'OBSERVAR: piora vs. período anterior'),
  ('gravidadeCritico', 500, 'Gravidade crítica a partir de (R$ em risco)'),
  ('gravidadeImportante', 150, 'Gravidade importante a partir de (R$ em risco)'),
  ('gravidadeAtencao', 30, 'Gravidade atenção a partir de (R$ em risco)')
on conflict (chave) do nothing;

-- ── Comissão por canal e categoria (tabela de referência, preenchida à mão) ─
create table if not exists public.canais_comissao (
  canal text not null,
  categoria_ou_padrao text not null default 'padrao',
  comissao_pct numeric not null,
  taxa_fixa numeric not null default 0,
  observacao text,
  atualizado_em timestamptz not null default now(),
  primary key (canal, categoria_ou_padrao)
);
insert into public.canais_comissao (canal, categoria_ou_padrao, comissao_pct, taxa_fixa, observacao) values
  ('mercado_livre', 'padrao', 0.14, 0, 'Padrão usado no Precify'),
  ('mercado_livre', 'Encapsulados', 0.12, 0, 'Referência do Precify'),
  ('shopee', 'padrao', 0.20, 4, 'Precify'),
  ('tiktok', 'padrao', 0.10, 4, 'Precify')
on conflict do nothing;

-- ── Snapshot de campanhas (generaliza ml_campanhas_snapshot) ───────────────
create table if not exists public.ads_campanhas_snapshot (
  canal text not null default 'mercado_livre',
  nome_campanha text not null,
  capturado_em date not null,
  status text,
  orcamento numeric,
  roas_objetivo numeric,
  impressoes bigint,
  cliques bigint,
  investimento numeric,
  receita numeric,
  vendas bigint,
  relatorio_desde date,
  relatorio_ate date,
  criado_em timestamptz not null default now(),
  primary key (canal, nome_campanha, capturado_em)
);

insert into public.ads_campanhas_snapshot
  (canal, nome_campanha, capturado_em, status, orcamento, roas_objetivo, impressoes, cliques, investimento, receita, vendas, relatorio_desde, relatorio_ate, criado_em)
select 'mercado_livre', nome_campanha, capturado_em, status, orcamento, roas_objetivo, impressoes, cliques, investimento, receita, vendas, relatorio_desde, relatorio_ate, criado_em
from public.ml_campanhas_snapshot
on conflict do nothing;

create or replace function public.ads_espelhar_campanha_ml() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ads_campanhas_snapshot
    (canal, nome_campanha, capturado_em, status, orcamento, roas_objetivo, impressoes, cliques, investimento, receita, vendas, relatorio_desde, relatorio_ate, criado_em)
  values ('mercado_livre', new.nome_campanha, new.capturado_em, new.status, new.orcamento, new.roas_objetivo, new.impressoes, new.cliques,
          new.investimento, new.receita, new.vendas, new.relatorio_desde, new.relatorio_ate, new.criado_em)
  on conflict (canal, nome_campanha, capturado_em) do update set
    status = excluded.status, orcamento = excluded.orcamento, roas_objetivo = excluded.roas_objetivo,
    impressoes = excluded.impressoes, cliques = excluded.cliques, investimento = excluded.investimento,
    receita = excluded.receita, vendas = excluded.vendas, relatorio_desde = excluded.relatorio_desde,
    relatorio_ate = excluded.relatorio_ate;
  return new;
end $$;
drop trigger if exists trg_ads_espelhar_campanha_ml on public.ml_campanhas_snapshot;
create trigger trg_ads_espelhar_campanha_ml after insert or update on public.ml_campanhas_snapshot
  for each row execute function public.ads_espelhar_campanha_ml();

-- ── Snapshot de anúncios (novo — o nível de produto) ───────────────────────
create table if not exists public.ads_anuncios_snapshot (
  canal text not null default 'mercado_livre',
  codigo_anuncio text not null,             -- ex.: MLB6620253832
  nome_campanha text not null,
  capturado_em date not null,
  sku text,                                  -- de-para com Bling/Nuvemshop/Precify
  titulo_anuncio text,
  status text,
  impressoes bigint not null default 0,
  cliques bigint not null default 0,
  cpc numeric,
  ctr numeric,
  cvr numeric,
  investimento numeric not null default 0,
  receita numeric not null default 0,
  acos numeric,
  roas numeric,
  vendas_diretas integer not null default 0,
  vendas_indiretas integer not null default 0,
  perdeu_buy_box boolean,                    -- null = informação não disponível
  tipo_anuncio text,                         -- Catálogo / Clássico / Premium, quando o relatório traz
  relatorio_desde date,
  relatorio_ate date,
  arquivo_origem text,
  criado_em timestamptz not null default now(),
  -- um anúncio pode aparecer em mais de uma campanha ao longo do tempo (caso da Cúrcuma)
  primary key (canal, codigo_anuncio, nome_campanha, capturado_em)
);
create index if not exists ads_anuncios_snapshot_sku on public.ads_anuncios_snapshot (sku);
create index if not exists ads_anuncios_snapshot_captura on public.ads_anuncios_snapshot (canal, capturado_em desc);

-- De-para anúncio → SKU, quando o relatório não traz SKU
create table if not exists public.ads_sku_depara (
  canal text not null default 'mercado_livre',
  codigo_anuncio text not null,
  sku text not null,
  categoria text,
  atualizado_em timestamptz not null default now(),
  primary key (canal, codigo_anuncio)
);

-- ── Cache de custo do Precify (por SKU de variação, a cada 2 dias) ─────────
-- Complementa public.custos_produto (que só tem o SKU principal).
create table if not exists public.produtos_custo (
  sku text primary key,
  nome text,
  categoria text,
  custo_direto numeric,
  imposto_pct numeric,
  atualizado_em timestamptz not null default now()
);

-- ── Registro de alterações (trava de "alteração recente") ──────────────────
create table if not exists public.ads_alteracoes (
  id uuid primary key default gen_random_uuid(),
  canal text not null default 'mercado_livre',
  codigo_anuncio text,
  nome_campanha text,
  alterado_em timestamptz not null default now(),
  tipo_ultima_alteracao text not null,       -- preco | orcamento | lance | roas_objetivo | pausa | outro
  valor_anterior text,
  valor_novo text,
  recomendacao_origem uuid,                  -- ads_recomendacoes_historico.id, quando veio do Farol
  registrado_por text
);
create index if not exists ads_alteracoes_anuncio on public.ads_alteracoes (canal, codigo_anuncio, alterado_em desc);

-- ── Alertas (generaliza ml_alertas) ────────────────────────────────────────
create table if not exists public.ads_alertas (
  id uuid primary key default gen_random_uuid(),
  canal text not null default 'mercado_livre',
  tipo text not null check (tipo in (
    'anuncio_sem_venda', 'anuncio_margem_negativa', 'conflito_catalogo_classico',
    'promocao_encerrada', 'campanha_sem_performance', 'mudanca_estado', 'custo_nao_cadastrado')),
  item_id text,                              -- código do anúncio/item
  campanha_id text,                          -- nome da campanha
  sku text,
  titulo text,
  gravidade text not null default 'ATENCAO' check (gravidade in ('INFORMATIVO', 'ATENCAO', 'IMPORTANTE', 'CRITICO')),
  status text not null default 'aberto' check (status in ('aberto', 'em_analise', 'resolvido')),
  problema text,
  causa text,
  acao text,
  detalhe jsonb,
  criado_em timestamptz not null default now(),
  lido boolean not null default false,
  resolvido_em timestamptz,
  origem_ml_alerta uuid unique
);
create index if not exists ads_alertas_abertos on public.ads_alertas (status, criado_em desc);

insert into public.ads_alertas (canal, tipo, item_id, campanha_id, titulo, detalhe, criado_em, lido, origem_ml_alerta)
select 'mercado_livre', tipo, item_id, campanha_id, titulo, detalhe, criado_em, lido, id
from public.ml_alertas
where tipo in ('promocao_encerrada', 'campanha_sem_performance')
on conflict do nothing;

create or replace function public.ads_espelhar_alerta_ml() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo not in ('promocao_encerrada', 'campanha_sem_performance') then return new; end if;
  insert into public.ads_alertas (canal, tipo, item_id, campanha_id, titulo, detalhe, criado_em, lido, origem_ml_alerta,
                                  gravidade, problema)
  values ('mercado_livre', new.tipo, new.item_id, new.campanha_id, new.titulo, new.detalhe, new.criado_em, new.lido, new.id,
          'IMPORTANTE', new.titulo)
  on conflict (origem_ml_alerta) do update set lido = excluded.lido, detalhe = excluded.detalhe;
  return new;
end $$;
drop trigger if exists trg_ads_espelhar_alerta_ml on public.ml_alertas;
create trigger trg_ads_espelhar_alerta_ml after insert or update on public.ml_alertas
  for each row execute function public.ads_espelhar_alerta_ml();

-- ── Memória das decisões (6.6) ─────────────────────────────────────────────
create table if not exists public.ads_recomendacoes_historico (
  id uuid primary key default gen_random_uuid(),
  canal text not null default 'mercado_livre',
  codigo_anuncio text not null,
  nome_campanha text not null default '',    -- '' = decisão no nível do anúncio (todas as campanhas)
  sku text,
  gerado_em timestamptz not null default now(),
  capturado_em date not null,                -- snapshot que gerou a recomendação
  estado text not null check (estado in ('ESCALAR', 'MANTER', 'OBSERVAR', 'OTIMIZAR', 'REDUZIR', 'PAUSAR')),
  gravidade text not null check (gravidade in ('INFORMATIVO', 'ATENCAO', 'IMPORTANTE', 'CRITICO')),
  impacto numeric,
  motivo text not null,                      -- situação
  evidencias jsonb not null default '[]',
  impacto_texto text,
  acao_recomendada text not null,
  componente text,
  travas jsonb not null default '[]',
  proxima_data_reavaliacao date,
  metricas_no_momento jsonb not null,        -- entrada + economia usadas na decisão
  status_recomendacao text not null default 'pendente'
    check (status_recomendacao in ('pendente', 'aplicada', 'ignorada', 'resolvida')),
  resolvido_em timestamptz,
  unique (canal, codigo_anuncio, nome_campanha, capturado_em)
);
create index if not exists ads_recomendacoes_anuncio on public.ads_recomendacoes_historico (canal, codigo_anuncio, gerado_em desc);

-- ── RLS: ligado, sem policies (só service role) ────────────────────────────
alter table public.ads_config enable row level security;
alter table public.canais_comissao enable row level security;
alter table public.ads_campanhas_snapshot enable row level security;
alter table public.ads_anuncios_snapshot enable row level security;
alter table public.ads_sku_depara enable row level security;
alter table public.produtos_custo enable row level security;
alter table public.ads_alteracoes enable row level security;
alter table public.ads_alertas enable row level security;
alter table public.ads_recomendacoes_historico enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW calculada: ads_anuncios_margem (seção 3) — o que o painel e o chat consultam
-- ═══════════════════════════════════════════════════════════════════════════
create or replace view public.ads_anuncios_margem as
with base as (
  select s.*,
         coalesce(s.sku, d.sku) as sku_resolvido,
         d.categoria as categoria_depara
  from public.ads_anuncios_snapshot s
  left join public.ads_sku_depara d on d.canal = s.canal and d.codigo_anuncio = s.codigo_anuncio
),
custo as (
  select b.canal, b.codigo_anuncio, b.nome_campanha, b.capturado_em,
         coalesce(pc.custo_direto, cp.custo_atualizado, cp.custo_unitario) as custo_unitario,
         coalesce(pc.categoria, cp.categoria, b.categoria_depara) as categoria,
         coalesce(pc.imposto_pct,
           (select f.aliquota from public.parametros_fiscais f
             where f.vigencia_inicio <= b.capturado_em order by f.vigencia_inicio desc, f.criado_em desc limit 1)) as imposto_pct
  from base b
  left join public.produtos_custo pc on pc.sku = b.sku_resolvido
  left join public.custos_produto cp on cp.sku_principal = b.sku_resolvido
),
vendas as (
  -- Receita total do SKU no canal (ads + orgânico), no período do relatório
  select b.canal, b.codigo_anuncio, b.nome_campanha, b.capturado_em,
         sum(i.quantidade * i.valor_unitario - coalesce(i.desconto, 0)) as receita_total,
         sum(i.quantidade) as unidades
  from base b
  join public.pedido_itens i on i.sku = b.sku_resolvido
  join public.pedidos_venda p on p.id = i.pedido_id
  left join public.canais_venda cv on cv.loja_id = p.loja_id
  where b.sku_resolvido is not null
    and p.data between coalesce(b.relatorio_desde, b.capturado_em - 30) and coalesce(b.relatorio_ate, b.capturado_em)
    and case b.canal
          when 'mercado_livre' then (p.fonte = 'mercado_livre' or cv.plataforma_slug like 'ml\_%')
          else cv.plataforma_slug = b.canal
        end
  group by 1, 2, 3, 4
),
estoque as (
  select pr.sku, sum(e.saldo) as saldo
  from public.produtos pr
  join lateral (
    select es.saldo from public.estoque_snapshots es
    where es.produto_bling_id = pr.bling_id
      and es.capturado_em = (select max(capturado_em) from public.estoque_snapshots x where x.produto_bling_id = pr.bling_id)
  ) e on true
  where pr.sku is not null
  group by pr.sku
),
alteracao as (
  select distinct on (canal, codigo_anuncio) canal, codigo_anuncio, alterado_em, tipo_ultima_alteracao
  from public.ads_alteracoes order by canal, codigo_anuncio, alterado_em desc
),
calc as (
  select b.canal, b.codigo_anuncio, b.nome_campanha, b.capturado_em, b.relatorio_desde, b.relatorio_ate,
         b.sku_resolvido as sku, b.titulo_anuncio, b.status, c.categoria,
         b.impressoes, b.cliques, b.investimento, b.receita as receita_ads,
         b.vendas_diretas, b.vendas_indiretas, b.perdeu_buy_box,
         v.receita_total, v.unidades, c.custo_unitario, coalesce(c.imposto_pct, 0) as imposto_pct,
         coalesce(cc.comissao_pct, ccp.comissao_pct, 0) as comissao_pct,
         coalesce(cc.taxa_fixa, ccp.taxa_fixa, 0) as taxa_fixa_unit,
         est.saldo as estoque,
         alt.alterado_em as ultima_alteracao_em, alt.tipo_ultima_alteracao,
         -- sem vendas totais, a base cai para a receita atribuída a ads (margem parcial)
         coalesce(v.receita_total, b.receita) as receita_liquida,
         coalesce(v.unidades, b.vendas_diretas + b.vendas_indiretas) as unidades_base
  from base b
  left join custo c using (canal, codigo_anuncio, nome_campanha, capturado_em)
  left join vendas v using (canal, codigo_anuncio, nome_campanha, capturado_em)
  left join public.canais_comissao cc on cc.canal = b.canal and cc.categoria_ou_padrao = c.categoria
  left join public.canais_comissao ccp on ccp.canal = b.canal and ccp.categoria_ou_padrao = 'padrao'
  left join estoque est on est.sku = b.sku_resolvido
  left join alteracao alt on alt.canal = b.canal and alt.codigo_anuncio = b.codigo_anuncio
),
econ as (
  select k.*,
         round(k.unidades_base * k.custo_unitario, 2) as custo_direto,
         round(k.receita_liquida * k.imposto_pct, 2) as imposto_valor,
         round(k.receita_liquida * k.comissao_pct, 2) as comissao_valor,
         round(k.unidades_base * k.taxa_fixa_unit, 2) as taxa_fixa_valor,
         null::numeric as frete_empresa_valor,     -- ainda não disponível por SKU → "não incluído"
         case when k.custo_unitario is null then null else round(
           k.receita_liquida - k.unidades_base * k.custo_unitario - k.receita_liquida * k.imposto_pct
           - k.receita_liquida * k.comissao_pct - k.unidades_base * k.taxa_fixa_unit, 2) end as margem_pre_ads_valor
  from calc k
)
select e.canal, e.codigo_anuncio, e.nome_campanha, e.capturado_em, e.relatorio_desde, e.relatorio_ate,
       e.sku, e.titulo_anuncio, e.status, e.categoria,
       e.impressoes, e.cliques, e.investimento as investimento_ads, e.receita_ads,
       e.vendas_diretas, e.vendas_indiretas, e.perdeu_buy_box, e.estoque,
       e.receita_total, e.unidades, e.custo_unitario, e.imposto_pct, e.comissao_pct, e.taxa_fixa_unit,
       e.receita_liquida, e.custo_direto, e.imposto_valor, e.comissao_valor, e.taxa_fixa_valor, e.frete_empresa_valor,
       e.margem_pre_ads_valor,
       case when e.receita_liquida > 0 then e.margem_pre_ads_valor / e.receita_liquida end as margem_pre_ads_pct,
       e.margem_pre_ads_valor - e.investimento as margem_pos_ads_valor,
       case when e.receita_liquida > 0 then (e.margem_pre_ads_valor - e.investimento) / e.receita_liquida end as margem_pos_ads_pct,
       case when e.receita_ads > 0 then e.investimento / e.receita_ads end as acos,
       case when e.investimento > 0 then e.receita_ads / e.investimento end as roas,
       case when e.receita_liquida > 0 then e.investimento / e.receita_liquida end as tacos,
       case when e.receita_liquida > 0 then greatest(e.margem_pre_ads_valor / e.receita_liquida, 0) end as acos_equilibrio,
       case when e.receita_liquida > 0 and e.margem_pre_ads_valor > 0 then e.receita_liquida / e.margem_pre_ads_valor end as roas_equilibrio,
       case when e.impressoes > 0 then e.cliques::numeric / e.impressoes end as ctr,
       case when e.cliques > 0 then (e.vendas_diretas + e.vendas_indiretas)::numeric / e.cliques end as cvr,
       case when e.cliques > 0 then e.investimento / e.cliques end as cpc,
       (e.receita_total is null) as sem_vendas_totais,
       (e.custo_unitario is null) as custo_nao_cadastrado,
       e.ultima_alteracao_em, e.tipo_ultima_alteracao,
       r.estado as estado_motor, r.gravidade, r.impacto, r.proxima_data_reavaliacao,
       r.motivo, r.evidencias, r.impacto_texto, r.acao_recomendada, r.componente, r.travas, r.status_recomendacao,
       r.id as recomendacao_id
from econ e
left join public.ads_recomendacoes_historico r
  -- o motor decide por anúncio (somando todas as campanhas em que ele aparece): nome_campanha = ''
  on r.canal = e.canal and r.codigo_anuncio = e.codigo_anuncio and r.nome_campanha = '' and r.capturado_em = e.capturado_em;

-- ═══════════════════════════════════════════════════════════════════════════
-- Views do painel (as ÚNICAS que a role painel_leitura enxerga)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace view public.ads_painel_anuncios as
select * from public.ads_anuncios_margem;

create or replace view public.ads_painel_campanhas as
select c.*, (select count(distinct a.codigo_anuncio) from public.ads_anuncios_snapshot a
             where a.canal = c.canal and a.nome_campanha = c.nome_campanha and a.capturado_em = c.capturado_em) as anuncios
from public.ads_campanhas_snapshot c;

create or replace view public.ads_painel_alertas as
select id, canal, tipo, item_id, campanha_id, sku, titulo, gravidade, status, problema, causa, acao,
       criado_em, resolvido_em
from public.ads_alertas;

create or replace view public.ads_painel_recomendacoes as
select id, canal, codigo_anuncio, nome_campanha, sku, gerado_em, capturado_em, estado, gravidade, impacto,
       motivo, acao_recomendada, status_recomendacao, resolvido_em,
       metricas_no_momento->>'titulo' as titulo
from public.ads_recomendacoes_historico;

-- Promoções: estado atual de cada item e quando saiu de promoção
create or replace view public.ads_painel_promocoes as
with ult as (
  select distinct on (item_id) item_id, capturado_em, titulo, preco, preco_original, em_promocao
  from public.ml_itens_snapshot order by item_id, capturado_em desc
),
inicio as (
  -- início da sequência de dias em promoção que termina no último dia em promoção
  select s.item_id, max(s.capturado_em) as ultimo_dia_promo
  from public.ml_itens_snapshot s where s.em_promocao group by s.item_id
),
comeco as (
  select i.item_id,
         (select min(s.capturado_em) from public.ml_itens_snapshot s
           where s.item_id = i.item_id and s.em_promocao and s.capturado_em <= i.ultimo_dia_promo
             and not exists (select 1 from public.ml_itens_snapshot s2
                             where s2.item_id = i.item_id and not s2.em_promocao
                               and s2.capturado_em > s.capturado_em and s2.capturado_em < i.ultimo_dia_promo)) as desde,
         i.ultimo_dia_promo,
         (select min(s.capturado_em) from public.ml_itens_snapshot s
           where s.item_id = i.item_id and not s.em_promocao and s.capturado_em > i.ultimo_dia_promo) as encerrada_em
  from inicio i
)
select 'mercado_livre'::text as canal, u.item_id, u.titulo, d.sku, u.preco, u.preco_original,
       -- desconto do último dia em promoção (depois de encerrada, o preço original some do item)
       case when lp.preco_original > 0 then 1 - lp.preco / lp.preco_original end as desconto,
       case when u.em_promocao then 'ativa' else 'encerrada' end as status,
       c.desde, c.encerrada_em,
       (coalesce(c.encerrada_em, u.capturado_em) - c.desde) as dias_ativa,
       u.capturado_em,
       lp.preco as preco_promocional
from ult u
join comeco c on c.item_id = u.item_id
join public.ml_itens_snapshot lp on lp.item_id = u.item_id and lp.capturado_em = c.ultimo_dia_promo
left join public.ads_sku_depara d on d.canal = 'mercado_livre' and d.codigo_anuncio = u.item_id;

create or replace view public.ads_painel_config as
select chave, valor, descricao from public.ads_config;

create or replace view public.ads_painel_comissoes as
select canal, categoria_ou_padrao, comissao_pct, taxa_fixa from public.canais_comissao;

-- As views rodam com o dono (postgres): a role do painel lê pelas views sem
-- precisar de acesso às tabelas — e nunca vê tokens/segredos do ML ou do Precify.
revoke all on public.ads_anuncios_margem, public.ads_painel_anuncios, public.ads_painel_campanhas,
  public.ads_painel_alertas, public.ads_painel_recomendacoes, public.ads_painel_promocoes,
  public.ads_painel_config, public.ads_painel_comissoes from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'painel_leitura') then
    create role painel_leitura nologin;
  end if;
end $$;
grant painel_leitura to authenticator;
grant usage on schema public to painel_leitura;
grant select on public.ads_painel_anuncios, public.ads_painel_campanhas, public.ads_painel_alertas,
  public.ads_painel_recomendacoes, public.ads_painel_promocoes, public.ads_painel_config,
  public.ads_painel_comissoes to painel_leitura;
