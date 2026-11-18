-- Painel da receção atualiza sozinho (Supabase Realtime). O Realtime respeita a RLS:
-- só o staff recebe as alterações destas tabelas; sem login não chega nada.
alter publication supabase_realtime add table public.reservas, public.cacifo_usos, public.torneios;
