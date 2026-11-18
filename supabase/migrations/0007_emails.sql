-- =====================================================================
-- Emails para os hóspedes (Brevo), enviados pela função enviar-email.
-- Depois de gravar uma reserva com email ou preparar um cacifo, a base de dados
-- avisa a função (pg_net, assíncrono: corre só se a transação for gravada).
-- A função lê os dados com a chave de serviço e marca o envio:
--   reservas.email_confirmacao_em · cacifo_usos.notificado_em
-- =====================================================================

create extension if not exists pg_net;

alter table public.reservas add column email_confirmacao_em timestamptz;

create or replace function public.avisar_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url     := 'https://ncisfqhfxqumoadikupm.supabase.co/functions/v1/enviar-email',
    body    := jsonb_build_object('tipo', tg_argv[0], 'id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000);
  return null;
end $$;
revoke execute on function public.avisar_email() from public, anon, authenticated;

create trigger reservas_email_confirmacao after insert on public.reservas
  for each row when (new.tipo = 'reserva' and new.email is not null)
  execute function public.avisar_email('confirmacao');

create trigger cacifo_usos_email after insert on public.cacifo_usos
  for each row execute function public.avisar_email('cacifo');
