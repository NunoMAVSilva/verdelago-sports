-- =====================================================================
-- Numeração da sinalética dos campos (placas à porta de cada campo):
--   1 Polidesportivo · 2-3 Ténis · 4 Beach Volley · 5-12 Pádel · 15 Futebol 7
-- Os ids não mudam (reservas e torneios guardam o id); muda o nome e a ordem.
-- Pádel: padel-N passa a "Pádel N+4" (padel-1 = campo 5 ... padel-8 = campo 12).
-- =====================================================================

alter table public.espacos add column numero int;

update public.espacos set numero = 1  where id = 'polidesportivo';
update public.espacos set numero = 2, nome = 'Ténis 2' where id = 'tenis-1';
update public.espacos set numero = 3, nome = 'Ténis 3' where id = 'tenis-2';
update public.espacos set numero = 4  where id = 'beach-volley';
update public.espacos set numero = 15 where id = 'futebol-7';
update public.espacos set numero = substring(id from 'padel-(\d+)')::int + 4,
                          nome = 'Pádel ' || (substring(id from 'padel-(\d+)')::int + 4)
 where id like 'padel-%';

update public.espacos set ordem = numero;
alter table public.espacos alter column numero set not null;
alter table public.espacos add constraint espacos_numero_uk unique (numero);
