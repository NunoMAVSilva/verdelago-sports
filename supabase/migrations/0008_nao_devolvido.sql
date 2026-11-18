-- =====================================================================
-- Material não devolvido: a receção do Sports marca o cacifo como "não devolvido"
-- (com o que falta) e a receção do resort recebe um email com os dados do hóspede,
-- para o contactar ou cobrar. O cacifo fica livre.
-- =====================================================================

alter table public.cacifo_usos drop constraint cacifo_usos_estado_check;
alter table public.cacifo_usos add constraint cacifo_usos_estado_check
  check (estado in ('preparado', 'devolvido', 'cancelado', 'nao_devolvido'));

alter table public.cacifo_usos add column nao_devolvido_em timestamptz;
alter table public.cacifo_usos add column falta text;             -- o que não foi devolvido
alter table public.cacifo_usos add column marcado_por uuid references auth.users(id);
alter table public.cacifo_usos add column aviso_rececao_em timestamptz;

-- Para onde vai o aviso (receção do resort)
alter table public.config add column email_rececao text;
update public.config set email_rececao = 'frontdesk@verdelago.com';

create trigger cacifo_usos_nao_devolvido after update of estado on public.cacifo_usos
  for each row when (new.estado = 'nao_devolvido' and old.estado is distinct from 'nao_devolvido')
  execute function public.avisar_email('nao_devolvido');
