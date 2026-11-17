-- =====================================================================
-- Verdelago Sports Center · esquema inicial
-- Espaços, reservas (e bloqueios/torneios), cacifos, torneios, staff.
-- Colar no Supabase: SQL Editor › New query › Run.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------
-- Staff (receção / gestão). Utilizadores criados em Authentication;
-- depois: insert into public.staff (user_id, nome) values ('<uuid>', 'Nome');
-- ---------------------------------------------------------------------
create table public.staff (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nome      text not null,
  criado_em timestamptz not null default now()
);

create or replace function public.e_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- Configuração geral (uma só linha)
-- ---------------------------------------------------------------------
create table public.config (
  id                       int primary key default 1 check (id = 1),
  fuso                     text not null default 'Europe/Lisbon',
  dias_antecedencia        int  not null default 7,   -- reservar até N dias à frente
  antecedencia_minima_min  int  not null default 30,  -- não reservar a menos de N min do início
  max_reservas_quarto_dia  int  not null default 2,
  rececao_abre             time not null default '08:00',
  rececao_fecha            time not null default '20:00'
);
insert into public.config default values;

-- ---------------------------------------------------------------------
-- Espaços desportivos
-- ---------------------------------------------------------------------
create table public.espacos (
  id              text primary key,
  nome            text not null,
  modalidade      text not null,
  ordem           int  not null default 0,
  abre            time not null default '08:00',
  fecha           time not null default '22:00',
  duracao_min     int  not null default 60 check (duracao_min between 15 and 240),
  ativo           boolean not null default true,
  reserva_online  boolean not null default true,
  check (fecha > abre)
);

insert into public.espacos (id, nome, modalidade, ordem, duracao_min) values
  ('padel-1', 'Pádel 1', 'padel', 1, 90),
  ('padel-2', 'Pádel 2', 'padel', 2, 90),
  ('padel-3', 'Pádel 3', 'padel', 3, 90),
  ('padel-4', 'Pádel 4', 'padel', 4, 90),
  ('padel-5', 'Pádel 5', 'padel', 5, 90),
  ('padel-6', 'Pádel 6', 'padel', 6, 90),
  ('padel-7', 'Pádel 7', 'padel', 7, 90),
  ('padel-8', 'Pádel 8', 'padel', 8, 90),
  ('tenis-1', 'Ténis 1', 'tenis', 11, 60),
  ('tenis-2', 'Ténis 2', 'tenis', 12, 60),
  ('futebol-7', 'Futebol 7', 'futebol', 21, 60),
  ('beach-volley', 'Beach Volley', 'beach-volley', 31, 60),
  ('polidesportivo', 'Polidesportivo', 'polidesportivo', 41, 60);

-- ---------------------------------------------------------------------
-- Torneios (o estado do torneio fica em "dados", como na app atual)
-- ---------------------------------------------------------------------
create table public.torneios (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  data           date,
  publico        boolean not null default true,
  dados          jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Ocupações: reservas de hóspedes, bloqueios e torneios na mesma tabela,
-- para a base de dados impedir sobreposições num mesmo espaço.
-- ---------------------------------------------------------------------
create table public.reservas (
  id                uuid primary key default gen_random_uuid(),
  espaco_id         text not null references public.espacos(id),
  tipo              text not null default 'reserva' check (tipo in ('reserva','bloqueio','torneio')),
  estado            text not null default 'confirmada' check (estado in ('confirmada','cancelada')),
  inicio            timestamptz not null,
  fim               timestamptz not null,
  -- hóspede
  quarto            text,
  apelido           text,
  nome              text,
  email             text,
  telefone          text,
  jogadores         int check (jogadores is null or jogadores between 1 and 30),
  precisa_material  boolean not null default false,
  notas             text,
  -- bloqueio / torneio
  motivo            text,
  torneio_id        uuid references public.torneios(id) on delete cascade,
  -- controlo
  origem            text not null default 'online' check (origem in ('online','rececao')),
  token             text not null unique default replace(gen_random_uuid()::text, '-', ''),
  criado_em         timestamptz not null default now(),
  cancelado_em      timestamptz,
  check (fim > inicio),
  check (tipo <> 'reserva' or (quarto is not null and apelido is not null)),
  check (tipo <> 'torneio' or torneio_id is not null),
  constraint sem_sobreposicao exclude using gist
    (espaco_id with =, tstzrange(inicio, fim) with &&) where (estado = 'confirmada')
);
create index reservas_inicio_idx on public.reservas (inicio);
create index reservas_quarto_idx on public.reservas (quarto) where tipo = 'reserva';

-- ---------------------------------------------------------------------
-- Cacifos e utilizações (código definido pela receção ao preparar)
-- ---------------------------------------------------------------------
create table public.cacifos (
  id        int primary key,               -- número do cacifo
  tamanho   text not null default 'medio' check (tamanho in ('medio','grande')),
  ativo     boolean not null default true,
  notas     text
);
insert into public.cacifos (id, tamanho)
select n, case when n > 6 then 'grande' else 'medio' end from generate_series(1, 8) n;

create table public.cacifo_usos (
  id             uuid primary key default gen_random_uuid(),
  cacifo_id      int  not null references public.cacifos(id),
  reserva_id     uuid not null references public.reservas(id) on delete cascade,
  codigo         text not null check (codigo ~ '^[0-9]{3,8}$'),
  material       text,
  estado         text not null default 'preparado' check (estado in ('preparado','devolvido','cancelado')),
  preparado_em   timestamptz not null default now(),
  preparado_por  uuid references auth.users(id),
  notificado_em  timestamptz,
  devolvido_em   timestamptz,
  notas          text
);
-- um cacifo só pode estar ocupado por uma reserva de cada vez, e vice-versa
create unique index cacifo_ocupado_uidx on public.cacifo_usos (cacifo_id)  where estado = 'preparado';
create unique index reserva_cacifo_uidx on public.cacifo_usos (reserva_id) where estado = 'preparado';

-- =====================================================================
-- Segurança (RLS): hóspedes só usam as funções abaixo; staff vê tudo.
-- =====================================================================
alter table public.staff        enable row level security;
alter table public.config       enable row level security;
alter table public.espacos      enable row level security;
alter table public.torneios     enable row level security;
alter table public.reservas     enable row level security;
alter table public.cacifos      enable row level security;
alter table public.cacifo_usos  enable row level security;

create policy staff_ler      on public.staff       for select to authenticated using (user_id = auth.uid() or public.e_staff());
create policy config_ler     on public.config      for select to anon, authenticated using (true);
create policy config_editar  on public.config      for update to authenticated using (public.e_staff()) with check (public.e_staff());
create policy espacos_ler    on public.espacos     for select to anon, authenticated using (true);
create policy espacos_staff  on public.espacos     for all    to authenticated using (public.e_staff()) with check (public.e_staff());
create policy torneios_ler   on public.torneios    for select to anon, authenticated using (publico or public.e_staff());
create policy torneios_staff on public.torneios    for all    to authenticated using (public.e_staff()) with check (public.e_staff());
create policy reservas_staff on public.reservas    for all    to authenticated using (public.e_staff()) with check (public.e_staff());
create policy cacifos_staff  on public.cacifos     for all    to authenticated using (public.e_staff()) with check (public.e_staff());
create policy usos_staff     on public.cacifo_usos for all    to authenticated using (public.e_staff()) with check (public.e_staff());

-- =====================================================================
-- Funções públicas (hóspedes, sem conta)
-- =====================================================================

-- Ocupação de um dia (sem dados pessoais), para a grelha pública e o ecrã TV.
create or replace function public.ocupacao(p_dia date)
returns table (espaco_id text, inicio timestamptz, fim timestamptz, tipo text, titulo text)
language sql stable security definer set search_path = public as $$
  select r.espaco_id, r.inicio, r.fim, r.tipo,
         case r.tipo when 'reserva' then 'Reservado'
                     when 'torneio' then coalesce(t.nome, 'Torneio')
                     else 'Indisponível' end
  from reservas r
  left join torneios t on t.id = r.torneio_id
  cross join config c
  where r.estado = 'confirmada'
    and r.inicio < ((p_dia + 1)::timestamp at time zone c.fuso)
    and r.fim    > ( p_dia::timestamp      at time zone c.fuso)
  order by r.espaco_id, r.inicio
$$;

-- Criar reserva online. Devolve o token (link privado da reserva).
create or replace function public.criar_reserva(
  p_espaco    text,
  p_inicio    timestamptz,
  p_quarto    text,
  p_apelido   text,
  p_nome      text,
  p_email     text,
  p_telefone  text    default null,
  p_jogadores int     default null,
  p_material  boolean default false,
  p_notas     text    default null
) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  c        config;
  e        espacos;
  v_local  timestamp;
  v_fim    timestamptz;
  v_quarto text := upper(btrim(coalesce(p_quarto, '')));
  v_n      int;
  v_token  text;
begin
  select * into c from config limit 1;
  select * into e from espacos where id = p_espaco;
  if not found or not e.ativo or not e.reserva_online then
    raise exception 'Este espaço não está disponível para reserva online.';
  end if;
  if v_quarto = '' or btrim(coalesce(p_apelido, '')) = '' then
    raise exception 'Indique o número do quarto e o apelido.';
  end if;
  if coalesce(p_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Indique um email válido.';
  end if;

  v_local := p_inicio at time zone c.fuso;
  v_fim   := p_inicio + make_interval(mins => e.duracao_min);

  if p_inicio < now() + make_interval(mins => c.antecedencia_minima_min) then
    raise exception 'Já não é possível reservar este horário.';
  end if;
  if v_local::date > (now() at time zone c.fuso)::date + c.dias_antecedencia then
    raise exception 'Só é possível reservar até % dias de antecedência.', c.dias_antecedencia;
  end if;
  if v_local::time < e.abre
     or (v_fim at time zone c.fuso)::time > e.fecha
     or (v_fim at time zone c.fuso)::date <> v_local::date
     or (extract(epoch from (v_local::time - e.abre)) / 60)::int % e.duracao_min <> 0 then
    raise exception 'Horário inválido para este espaço.';
  end if;

  select count(*) into v_n
  from reservas r
  where r.tipo = 'reserva' and r.estado = 'confirmada' and r.quarto = v_quarto
    and (r.inicio at time zone c.fuso)::date = v_local::date;
  if v_n >= c.max_reservas_quarto_dia then
    raise exception 'Este quarto já tem % reservas neste dia.', v_n;
  end if;

  begin
    insert into reservas (espaco_id, tipo, inicio, fim, quarto, apelido, nome, email, telefone,
                          jogadores, precisa_material, notas, origem)
    values (e.id, 'reserva', p_inicio, v_fim, v_quarto, btrim(p_apelido), nullif(btrim(p_nome), ''),
            lower(btrim(p_email)), nullif(btrim(p_telefone), ''), p_jogadores,
            coalesce(p_material, false), nullif(btrim(p_notas), ''), 'online')
    returning token into v_token;
  exception when exclusion_violation then
    raise exception 'Este horário acabou de ser reservado. Escolha outro.';
  end;
  return v_token;
end $$;

-- Ver uma reserva pelo token (inclui cacifo e código quando preparado).
create or replace function public.ver_reserva(p_token text)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'espaco', e.nome, 'modalidade', e.modalidade,
    'inicio', r.inicio, 'fim', r.fim, 'estado', r.estado,
    'quarto', r.quarto, 'apelido', r.apelido, 'nome', r.nome,
    'jogadores', r.jogadores, 'precisa_material', r.precisa_material,
    'pode_cancelar', r.estado = 'confirmada' and r.inicio > now(),
    'cacifo', (select json_build_object('numero', u.cacifo_id, 'codigo', u.codigo, 'material', u.material)
               from cacifo_usos u where u.reserva_id = r.id and u.estado = 'preparado')
  )
  from reservas r join espacos e on e.id = r.espaco_id
  where r.token = p_token and r.tipo = 'reserva'
$$;

-- Cancelar uma reserva pelo token (antes da hora de início).
create or replace function public.cancelar_reserva(p_token text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  update reservas set estado = 'cancelada', cancelado_em = now()
  where token = p_token and tipo = 'reserva' and estado = 'confirmada' and inicio > now()
  returning id into v_id;
  if v_id is null then
    raise exception 'Esta reserva já não pode ser cancelada.';
  end if;
  update cacifo_usos set estado = 'cancelado' where reserva_id = v_id and estado = 'preparado';
  return true;
end $$;

revoke execute on function public.criar_reserva(text, timestamptz, text, text, text, text, text, int, boolean, text) from public;
revoke execute on function public.ver_reserva(text)      from public;
revoke execute on function public.cancelar_reserva(text) from public;
revoke execute on function public.ocupacao(date)         from public;
grant  execute on function public.criar_reserva(text, timestamptz, text, text, text, text, text, int, boolean, text) to anon, authenticated;
grant  execute on function public.ver_reserva(text)      to anon, authenticated;
grant  execute on function public.cancelar_reserva(text) to anon, authenticated;
grant  execute on function public.ocupacao(date)         to anon, authenticated;
