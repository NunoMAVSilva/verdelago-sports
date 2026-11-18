-- =====================================================================
-- Material desportivo (empréstimos ao balcão), vindo da app do Spa
-- (verdelago-spa/material-desportivo, Firebase). Fase 1: Balcão, Material, Histórico.
-- Os documentos ficam como na app original (jsonb), para a lógica e a importação
-- serem as mesmas; estado/saida/quarto são colunas geradas para filtrar.
-- Acesso: staff (inclui os postos com PIN). Gestores (papel 'gestor') veem as Definições.
-- =====================================================================

alter table public.staff add column papel text not null default 'gestor' check (papel in ('gestor', 'posto'));

create table public.emprestimos (
  id              text primary key default gen_random_uuid()::text,
  doc             jsonb not null,
  estado          text   generated always as (doc->>'estado') stored,
  saida           bigint generated always as (((doc->>'saida')::numeric)::bigint) stored,   -- ms desde 1970, como na app
  quarto          text   generated always as (doc->>'quarto') stored,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid()
);
create index emprestimos_estado_idx on public.emprestimos (estado);
create index emprestimos_saida_idx  on public.emprestimos (saida desc);

-- 'main' = definições (inventário, colaboradores, prazos, ...); 'avarias' = peças fora de serviço
create table public.material_config (
  chave           text primary key check (chave in ('main', 'avarias')),
  valor           jsonb not null,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid default auth.uid()
);

create or replace function public.material_tocar()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); new.atualizado_por := auth.uid(); return new; end $$;
create trigger emprestimos_tocar before update on public.emprestimos for each row execute function public.material_tocar();
create trigger material_config_tocar before update on public.material_config for each row execute function public.material_tocar();

alter table public.emprestimos     enable row level security;
alter table public.material_config enable row level security;
create policy emprestimos_staff on public.emprestimos     for all to authenticated using (public.e_staff()) with check (public.e_staff());
create policy material_ler      on public.material_config for select to authenticated using (public.e_staff());
create policy material_gestor   on public.material_config for all to authenticated
  using (exists (select 1 from public.staff where user_id = auth.uid() and papel = 'gestor'))
  with check (exists (select 1 from public.staff where user_id = auth.uid() and papel = 'gestor'));
-- as peças fora de serviço são marcadas no Balcão/Material por qualquer posto
create policy material_avarias  on public.material_config for all to authenticated
  using (chave = 'avarias' and public.e_staff()) with check (chave = 'avarias' and public.e_staff());

alter publication supabase_realtime add table public.emprestimos, public.material_config;
