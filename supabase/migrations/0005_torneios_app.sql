-- =====================================================================
-- App dos torneios de pádel dentro do Sports (antes era um artefacto à parte).
-- O estado (duplas, grupos, jogos, resultados, cronómetro) fica em torneios.dados.
-- Os nomes e contactos dos jogadores só são lidos pelo staff; o ecrã TV público
-- usa torneio_tv(), que tira os contactos e os jogadores sem par.
-- =====================================================================

drop policy if exists torneios_ler on public.torneios;   -- staff continua com torneios_staff

create or replace function public.torneio_tv(p_id uuid default null)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', t.id, 'nome', t.nome, 'data', t.data, 'data_fim', t.data_fim,
    'hora_inicio', t.hora_inicio, 'hora_fim', t.hora_fim, 'espacos', t.espacos,
    'atualizado_em', t.atualizado_em,
    'dados', (t.dados - 'individuais')
             || jsonb_build_object('duplas', coalesce((select jsonb_agg(d - 'tel')
                                                       from jsonb_array_elements(case when jsonb_typeof(t.dados->'duplas') = 'array' then t.dados->'duplas' else '[]'::jsonb end) d), '[]'::jsonb)))
  from torneios t cross join config c
  where t.publico
    and case when p_id is not null then t.id = p_id
             else (now() at time zone c.fuso)::date between t.data and coalesce(t.data_fim, t.data) end
  order by t.hora_inicio
  limit 1
$$;
revoke execute on function public.torneio_tv(uuid) from public;
grant  execute on function public.torneio_tv(uuid) to anon, authenticated;
