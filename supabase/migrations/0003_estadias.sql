-- =====================================================================
-- Estadias importadas do Opera (In House + Arrivals) através do Beach OPS.
-- Só quarto, datas e n.º de pessoas: sem nomes. Usadas para validar o quarto
-- nas reservas online (config.validar_quarto).
-- =====================================================================

-- Mesmo formato do Beach OPS: A123, T045 (3 dígitos), V12 (sem zeros)
create or replace function public.norm_quarto(t text)
returns text language plpgsql immutable as $$
declare s text; m text[]; n int;
begin
  s := upper(regexp_replace(coalesce(t, ''), '[\s\-_.]', '', 'g'));
  m := regexp_match(s, '^([ATV])0*([0-9]{1,3})$');
  if m is null then return null; end if;
  n := m[2]::int;
  if m[1] = 'V' then return case when n between 1 and 99 then 'V' || n end; end if;
  return case when n between 1 and 999 then m[1] || lpad(n::text, 3, '0') end;
end $$;

create table public.estadias (
  quarto        text not null,
  chegada       date,
  partida       date,
  adultos       int,
  criancas      int,
  proprietario  boolean not null default false
);
create index estadias_quarto_idx on public.estadias (quarto);

create table public.importacoes (
  id       bigserial primary key,
  em       timestamptz not null default now(),
  dia      date,
  quartos  int,
  origem   text,
  por      text
);

alter table public.estadias    enable row level security;
alter table public.importacoes enable row level security;
create policy estadias_staff    on public.estadias    for select to authenticated using (public.e_staff());
create policy importacoes_staff on public.importacoes for select to authenticated using (public.e_staff());

alter table public.config add column validar_quarto boolean not null default false;

-- Substitui a lista (chamada só pela função sincronizar-quartos, com a chave de serviço)
create or replace function public.substituir_estadias(p_dia date, p_rooms jsonb, p_origem text, p_por text)
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if jsonb_typeof(p_rooms) <> 'array' then raise exception 'lista inválida'; end if;
  delete from estadias where true;
  insert into estadias (quarto, chegada, partida, adultos, criancas, proprietario)
  select q, nullif(r->>'chegada', '')::date, nullif(r->>'partida', '')::date,
         nullif(r->>'adultos', '')::int, nullif(r->>'criancas', '')::int, coalesce((r->>'proprietario')::boolean, false)
  from jsonb_array_elements(p_rooms) r, lateral (select public.norm_quarto(r->>'quarto') q) x
  where q is not null;
  get diagnostics n = row_count;
  insert into importacoes (dia, quartos, origem, por) values (p_dia, n, p_origem, left(p_por, 80));
  return n;
end $$;
revoke execute on function public.substituir_estadias(date, jsonb, text, text) from public, anon, authenticated;

create or replace function public.criar_reserva(
  p_espaco       text,
  p_inicio       timestamptz,
  p_duracao_min  int,
  p_quarto       text,
  p_apelido      text,
  p_nome         text,
  p_email        text,
  p_telefone     text    default null,
  p_jogadores    int     default null,
  p_material     boolean default false,
  p_notas        text    default null
) returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  c        config;
  e        espacos;
  v_local  timestamp;
  v_fim    timestamptz;
  v_dur    int;
  v_quarto text := coalesce(public.norm_quarto(p_quarto), upper(btrim(coalesce(p_quarto, ''))));
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

  v_dur := coalesce(p_duracao_min, e.passo_min);
  if v_dur < e.passo_min or v_dur > e.max_duracao_min or v_dur % e.passo_min <> 0 then
    raise exception 'Duração inválida para este espaço.';
  end if;

  v_local := p_inicio at time zone c.fuso;
  v_fim   := p_inicio + make_interval(mins => v_dur);

  if p_inicio < now() + make_interval(mins => c.antecedencia_minima_min) then
    raise exception 'Já não é possível reservar este horário.';
  end if;
  if v_local::date > (now() at time zone c.fuso)::date + c.dias_antecedencia then
    raise exception 'Só é possível reservar até % dias de antecedência.', c.dias_antecedencia;
  end if;
  if v_local::time < e.abre
     or (v_fim at time zone c.fuso)::time > e.fecha
     or (v_fim at time zone c.fuso)::date <> v_local::date
     or (extract(epoch from (v_local::time - e.abre)) / 60)::int % e.passo_min <> 0 then
    raise exception 'Horário inválido para este espaço.';
  end if;

  -- Quarto tem de ter estadia nesse dia (lista do Opera via Beach OPS).
  -- Só valida se estiver ligado e houver uma importação recente (evita bloquear tudo se ninguém importar).
  if c.validar_quarto and exists (select 1 from importacoes where em > now() - interval '48 hours') then
    if not exists (select 1 from estadias s
                   where s.quarto = v_quarto
                     and (s.chegada is null or s.chegada <= v_local::date)
                     and (s.partida is null or s.partida >= v_local::date)) then
      raise exception 'Não encontrámos o quarto % com estadia nesse dia. Confirme o número ou fale com a receção.', v_quarto;
    end if;
  end if;

  if c.max_reservas_quarto_dia is not null then
    select count(*) into v_n
    from reservas r
    where r.tipo = 'reserva' and r.estado = 'confirmada' and r.quarto = v_quarto
      and (r.inicio at time zone c.fuso)::date = v_local::date;
    if v_n >= c.max_reservas_quarto_dia then
      raise exception 'Este quarto já tem % reservas neste dia.', v_n;
    end if;
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

