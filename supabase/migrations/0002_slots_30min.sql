-- =====================================================================
-- Slots de 30 minutos em todos os espaços; o hóspede escolhe a duração
-- (múltiplo de 30, até max_duracao_min). Sem limite de reservas por quarto
-- (max_reservas_quarto_dia = null desliga a regra).
-- =====================================================================

alter table public.config alter column max_reservas_quarto_dia drop not null;
update public.config set max_reservas_quarto_dia = null;

alter table public.espacos add column passo_min int not null default 30
  check (passo_min between 5 and 120);
alter table public.espacos add column max_duracao_min int not null default 120;
alter table public.espacos drop column duracao_min;
alter table public.espacos add constraint espacos_max_duracao_ck
  check (max_duracao_min >= passo_min and max_duracao_min % passo_min = 0);

drop function if exists public.criar_reserva(text, timestamptz, text, text, text, text, text, int, boolean, text);

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

revoke execute on function public.criar_reserva(text, timestamptz, int, text, text, text, text, text, int, boolean, text) from public;
grant  execute on function public.criar_reserva(text, timestamptz, int, text, text, text, text, text, int, boolean, text) to anon, authenticated;
