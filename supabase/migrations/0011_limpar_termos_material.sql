-- Termo de responsabilidade do material: o email e a assinatura do hóspede só se guardam enquanto são precisos.
-- Todos os dias, apaga-os dos empréstimos devolvidos sem problemas depois do check-out do quarto:
--   * devolvido (estado 'devolvido') até ao dia do check-out;
--   * sem danos nem perdas (incidentes 'Danificado' / 'Perdido');
--   * check-out já passou (doc.checkout, gravado na saída; senão a estadia na lista de hóspedes;
--     sem check-out conhecido, 7 dias depois da devolução).
-- Fica só a indicação de que foi assinado (assinadoEm, aceitouCondicoes) e o texto do termo.

create extension if not exists pg_cron;

create or replace function public.limpar_termos_material()
returns int
language plpgsql security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'Europe/Lisbon')::date;
  n int;
begin
  with c as (
    select e.id,
           coalesce(nullif(e.doc->>'checkout', '')::date,
                    (select s.partida from estadias s
                      where s.quarto = e.quarto and s.chegada <= d.saida_dia and s.partida >= d.saida_dia
                      order by s.partida desc limit 1)) as checkout,
           (to_timestamp((e.doc->>'devolvido')::numeric / 1000) at time zone 'Europe/Lisbon')::date as dev_dia
    from emprestimos e
    cross join lateral (select (to_timestamp(e.saida / 1000.0) at time zone 'Europe/Lisbon')::date as saida_dia) d
    where e.estado = 'devolvido'
      and e.doc->>'devolvido' is not null
      and (e.doc ? 'assinatura' or coalesce(e.doc->>'email', '') <> '')
      and not exists (select 1 from jsonb_array_elements(coalesce(e.doc->'incidentes', '[]'::jsonb)) i
                       where i->>'tipo' in ('Danificado', 'Perdido'))
  )
  update emprestimos e
     set doc = (e.doc - 'assinatura' - 'email' - 'emailEstado')
               || jsonb_build_object('dadosApagadosEm', (extract(epoch from now()) * 1000)::bigint)
    from c
   where c.id = e.id
     and ((c.checkout is not null and c.checkout < hoje and c.dev_dia <= c.checkout)
       or (c.checkout is null and c.dev_dia < hoje - 7));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.limpar_termos_material() from public, anon, authenticated;

-- todos os dias às 03:17 (UTC)
select cron.unschedule(jobid) from cron.job where jobname = 'limpar-termos-material';
select cron.schedule('limpar-termos-material', '17 3 * * *', 'select public.limpar_termos_material()');
