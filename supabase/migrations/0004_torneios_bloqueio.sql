-- =====================================================================
-- Torneios bloqueiam os campos automaticamente.
-- Cada torneio tem dias (data..data_fim), horas e espaços. Um trigger mantém
-- as linhas tipo 'torneio' em "reservas" (uma por espaço e por dia).
-- Se houver reservas no caminho, nada é gravado e o erro diz quais são.
-- =====================================================================

alter table public.torneios add column data_fim    date;
alter table public.torneios add column hora_inicio time not null default '09:00';
alter table public.torneios add column hora_fim    time not null default '13:00';
alter table public.torneios add column espacos     text[] not null default '{}';
alter table public.torneios add column notas       text;
alter table public.torneios add column criado_em   timestamptz not null default now();
alter table public.torneios add constraint torneios_horas_ck check (hora_fim > hora_inicio);
alter table public.torneios add constraint torneios_datas_ck check (data_fim is null or (data is not null and data_fim >= data and data_fim <= data + 14));

-- Mantém os bloqueios do torneio. Corre depois de gravar (AFTER), para a
-- chave estrangeira reservas.torneio_id já existir. A escrita em "torneios"
-- já está limitada ao staff pela RLS.
create or replace function public.torneio_sincronizar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c       config;
  v_conf  text;
  v_mau   text;
begin
  if tg_op = 'UPDATE'
     and new.data is not distinct from old.data and new.data_fim is not distinct from old.data_fim
     and new.hora_inicio = old.hora_inicio and new.hora_fim = old.hora_fim
     and new.espacos = old.espacos and new.nome = old.nome then
    return null;  -- só mudaram os dados do quadro/resultados
  end if;

  select string_agg(x, ', ') into v_mau
  from unnest(new.espacos) x where not exists (select 1 from espacos e where e.id = x);
  if v_mau is not null then raise exception 'Espaço desconhecido: %', v_mau; end if;

  select * into c from config limit 1;
  delete from reservas where torneio_id = new.id and tipo = 'torneio';
  if new.data is null or cardinality(new.espacos) = 0 then return null; end if;

  -- marcações que ficariam por baixo do torneio
  with alvo as (
    select x as espaco_id,
           (d::date + new.hora_inicio) at time zone c.fuso as inicio,
           (d::date + new.hora_fim)    at time zone c.fuso as fim
    from unnest(new.espacos) x,
         generate_series(new.data, coalesce(new.data_fim, new.data), interval '1 day') d
  )
  select string_agg(format('%s %s %s–%s (%s)', e.nome,
                           to_char(r.inicio at time zone c.fuso, 'DD/MM'),
                           to_char(r.inicio at time zone c.fuso, 'HH24:MI'),
                           to_char(r.fim at time zone c.fuso, 'HH24:MI'),
                           case r.tipo when 'reserva' then 'quarto ' || r.quarto || ' ' || r.apelido
                                       when 'torneio' then coalesce(r.motivo, 'outro torneio')
                                       else coalesce(r.motivo, 'bloqueio') end),
                    '; ' order by r.inicio, e.ordem)
    into v_conf
  from alvo a
  join reservas r on r.espaco_id = a.espaco_id and r.estado = 'confirmada'
                 and r.inicio < a.fim and r.fim > a.inicio
  join espacos e on e.id = r.espaco_id;
  if v_conf is not null then
    raise exception 'Há marcações no horário do torneio: %. Cancele-as ou escolha outros campos ou horas.', v_conf;
  end if;

  insert into reservas (espaco_id, tipo, inicio, fim, motivo, torneio_id, origem)
  select x, 'torneio',
         (d::date + new.hora_inicio) at time zone c.fuso,
         (d::date + new.hora_fim)    at time zone c.fuso,
         new.nome, new.id, 'rececao'
  from unnest(new.espacos) x,
       generate_series(new.data, coalesce(new.data_fim, new.data), interval '1 day') d;
  return null;
end $$;
revoke execute on function public.torneio_sincronizar() from public, anon, authenticated;

create trigger torneios_bloquear after insert or update on public.torneios
  for each row execute function public.torneio_sincronizar();

create or replace function public.torneio_tocar()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

create trigger torneios_tocar before update on public.torneios
  for each row execute function public.torneio_tocar();

-- Apagar um torneio apaga os bloqueios (on delete cascade em reservas.torneio_id).

-- Hóspedes e ecrã TV: nome do torneio só se for público.
create or replace function public.ocupacao(p_dia date)
returns table (espaco_id text, inicio timestamptz, fim timestamptz, tipo text, titulo text)
language sql stable security definer set search_path = public as $$
  select r.espaco_id, r.inicio, r.fim, r.tipo,
         case r.tipo when 'reserva' then 'Reservado'
                     when 'torneio' then case when t.publico then t.nome else 'Torneio' end
                     else 'Indisponível' end
  from reservas r
  left join torneios t on t.id = r.torneio_id
  cross join config c
  where r.estado = 'confirmada'
    and r.inicio < ((p_dia + 1)::timestamp at time zone c.fuso)
    and r.fim    > ( p_dia::timestamp      at time zone c.fuso)
  order by r.espaco_id, r.inicio
$$;
