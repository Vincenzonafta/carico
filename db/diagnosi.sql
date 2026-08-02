-- ═══ DOVE SONO I MIEI DATI? — solo letture, non modifica niente ═══
-- Da incollare nel SQL Editor di Supabase. Serve a capire la situazione PRIMA di agire.

-- 1. Quanti dati ha ogni account, e a quale email corrisponde
select
  u.email,
  s.utente_id,
  count(*) filter (where true)                as serie,
  min(s.ts)::date                             as prima_serie,
  max(s.ts)::date                             as ultima_serie
from serie s
join auth.users u on u.id = s.utente_id
group by u.email, s.utente_id
order by serie desc;

-- 2. Le schede (vivono nel blob config): quante ne ha ciascuno e come si chiamano
select
  u.email,
  jsonb_array_length(c.dati->'schede')                       as n_schede,
  (select string_agg(x->>'name', ' · ') from jsonb_array_elements(c.dati->'schede') x) as nomi,
  c.updated_at
from config c
join auth.users u on u.id = c.utente_id
order by c.updated_at desc;

-- 3. Giorni allenati per account: serve a vedere SE mancano giorni precisi
select u.email, s.ts::date as giorno, count(*) as serie
from serie s join auth.users u on u.id = s.utente_id
group by u.email, giorno
order by giorno desc
limit 40;

-- 4. Gli altri dati, per account
select u.email,
  (select count(*) from checkin       where utente_id = u.id) as checkin,
  (select count(*) from pasto         where utente_id = u.id) as pasti,
  (select count(*) from peso_corporeo where utente_id = u.id) as pesate,
  (select count(*) from acqua         where utente_id = u.id) as acqua,
  (select count(*) from sessione      where utente_id = u.id) as sessioni
from auth.users u
order by u.created_at;

-- 5. Tutti gli account e i loro id (per copiare gli UUID senza sbagliarli)
select id, email, created_at, last_sign_in_at from auth.users order by created_at;

-- 6. ⭐ C'È ANCORA L'ALLENAMENTO DI UN GIORNO PRECISO? (cambia le date se serve)
--    Guarda TUTTI gli account insieme: se un allenamento è finito su un altro utente,
--    qui salta fuori. Se non compare nessuna riga per quella data, allora non c'è più.
select u.email, s.ts::date as giorno, count(*) as serie,
       string_agg(distinct s.esercizio, ' · ') as esercizi
from serie s join auth.users u on u.id = s.utente_id
where s.ts::date between '2026-07-28' and current_date
group by u.email, giorno
order by giorno desc, serie desc;

-- 7. Le schede esistono ancora da qualche parte? (con l'ora dell'ultima modifica)
select u.email,
       jsonb_array_length(c.dati->'schede') as n_schede,
       (select string_agg(x->>'name', ' · ') from jsonb_array_elements(c.dati->'schede') x) as nomi,
       c.updated_at
from config c join auth.users u on u.id = c.utente_id
order by c.updated_at desc;
