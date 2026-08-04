-- ═══ ESERCIZI DOPPI: trovarli e fonderli ═══
-- Operazione UNA TANTUM. Non è una funzione dell'app di proposito: da quando l'import
-- riconduce i nomi alla libreria (commit 124282e) i doppioni non dovrebbero più nascere.
-- Serve a ripulire quelli creati prima, quando "Panca 60" e "Panca 60°" diventavano due
-- esercizi separati con lo storico diviso a metà.

-- ══════════ PARTE 1 — GUARDARE (nessuna modifica) ══════════

-- 1a. ⭐ DOPPIONI CERTI: nomi che diventano identici togliendo maiuscole, gradi e punteggiatura
--     ⚠️ il trim() è indispensabile: un simbolo IN FONDO ("Spider curl 30°") lascia uno spazio
--     in coda e senza trim la coppia non veniva trovata.
select
  trim(regexp_replace(lower(esercizio), '[^a-z0-9]+', ' ', 'g')) as nome_normalizzato,
  string_agg(distinct esercizio, '  |  ')                   as varianti_scritte,
  count(*)                                                  as serie_totali,
  min(ts)::date as dal, max(ts)::date as al
from serie
where utente_id = (select id from auth.users where email = 'vincisasso2005@gmail.com')
group by 1
having count(distinct esercizio) > 1
order by serie_totali desc;

-- 1b. TUTTI gli esercizi con quante serie hanno: serve a scovare a occhio i quasi-doppioni
--     che la normalizzazione non prende ("Panca 60" vs "Panca inclinata 60")
select esercizio, count(*) as serie, min(ts)::date as dal, max(ts)::date as al
from serie
where utente_id = (select id from auth.users where email = 'vincisasso2005@gmail.com')
group by esercizio
order by esercizio;

-- 1c. Esercizi presenti nelle SCHEDE (config) ma senza nessuna serie: spesso sono
--     proprio i doppioni nati dall'import, quelli con lo storico vuoto
select distinct it->>'ex' as esercizio_in_scheda
from config c,
     jsonb_array_elements(c.dati->'schede')      sc,
     jsonb_array_elements(sc->'days')            gg,
     jsonb_array_elements(gg->'items')           it
where c.utente_id = (select id from auth.users where email = 'vincisasso2005@gmail.com')
  and not exists (
    select 1 from serie s
     where s.utente_id = c.utente_id and s.esercizio = it->>'ex'
  )
order by 1;


-- ══════════ PARTE 2 — FONDERE (una coppia per volta) ══════════
-- Ripeti questo blocco per ogni coppia trovata sopra.
-- VECCHIO = il nome sbagliato che sparisce · NUOVO = quello giusto che resta.

begin;

create temp table f as select
  (select id from auth.users where email = 'vincisasso2005@gmail.com') as utente,
  'Panca 60'::text  as vecchio,   -- ⬅️ scrivilo IDENTICO a come appare nelle query sopra
  'Panca 60°'::text as nuovo;     -- ⬅️ il nome da tenere

-- Prima di toccare: quante serie sto spostando, e il nuovo nome esiste già?
select (select count(*) from serie where utente_id = (select utente from f) and esercizio = (select vecchio from f)) as serie_da_spostare,
       (select count(*) from serie where utente_id = (select utente from f) and esercizio = (select nuovo from f))   as serie_gia_sul_nuovo;

-- 2a. Lo storico: le serie del nome vecchio passano al nuovo
update serie set esercizio = (select nuovo from f)
 where utente_id = (select utente from f) and esercizio = (select vecchio from f);

-- 2b. Schede, record, video, descrizioni, note: il nome compare in molti punti del blob
--     `config`. Sostituisco la stringa TRA VIRGOLETTE, così colpisce solo il nome intero
--     e non pezzi di altri nomi (cercare  Panca  cambierebbe anche "Panca piana").
update config
   set dati = replace(
         dati::text,
         '"' || (select vecchio from f) || '"',
         '"' || (select nuovo from f) || '"'
       )::jsonb
 where utente_id = (select utente from f);

-- Controllo: il vecchio nome non deve più esistere da nessuna parte
select (select count(*) from serie where utente_id = (select utente from f) and esercizio = (select vecchio from f)) as serie_rimaste_col_vecchio,
       (select count(*) from serie where utente_id = (select utente from f) and esercizio = (select nuovo from f))   as serie_ora_sul_nuovo,
       (select position('"' || (select vecchio from f) || '"' in dati::text) from config where utente_id = (select utente from f)) as posizione_nel_blob_zero_se_pulito;

-- Se "serie_rimaste_col_vecchio" è 0 e il blob è pulito:
commit;
-- Altrimenti:  rollback;

-- ⚠️ Se un GIORNO di scheda conteneva ENTRAMBI i nomi, dopo la fusione si ritrova lo stesso
--    esercizio due volte: va tolto a mano dall'app (Schede → giorno → esercizio → Rimuovi).
--    La query 1c aiuta a capirlo prima.

-- Dopo tutte le fusioni, sul telefono: Profilo → Account e cloud → Carica i dati dal cloud.


-- ══════════ PARTE 3 — LE COPPIE DI VINCENZO (2 ago 2026), GIÀ PRONTE ══════════
-- Tre doppioni certi, nati dall'import di oggi. In ogni coppia tengo il nome che sta nella
-- SCHEDA APPENA IMPORTATA: così gli allenamenti futuri ci finiscono dentro da soli.
-- Esegui tutto il blocco in una volta.

begin;

create temp table coppie (vecchio text, nuovo text);
insert into coppie values
  -- storico del 19 lug  →  nome della scheda nuova (col simbolo dei gradi)
  ('Bicipite singolo su panca 60 in piedi', 'Bicipite singolo su panca 60° in piedi'),
  ('Spider curl manubri 30',                'Spider curl manubri 30°'),
  -- qui invece tengo la grafia corretta e più usata (6 serie contro 3)
  ('Lowrow presa supina stretta',           'Low row presa supina stretta');

create temp table u as select id from auth.users where email = 'vincisasso2005@gmail.com';

-- Prima: quante serie si spostano e quante ce n'erano già sul nome buono
select c.vecchio, c.nuovo,
  (select count(*) from serie where utente_id = (select id from u) and esercizio = c.vecchio) as da_spostare,
  (select count(*) from serie where utente_id = (select id from u) and esercizio = c.nuovo)   as gia_presenti
from coppie c;

-- Lo storico
update serie s set esercizio = c.nuovo
  from coppie c
 where s.utente_id = (select id from u) and s.esercizio = c.vecchio;

-- Schede, record, video, descrizioni e note: il nome sta in molti punti del blob config,
-- sostituito TRA VIRGOLETTE per non intaccare nomi che lo contengono
do $$
declare r record;
begin
  for r in select * from coppie loop
    update config
       set dati = replace(dati::text, '"' || r.vecchio || '"', '"' || r.nuovo || '"')::jsonb
     where utente_id = (select id from u);
  end loop;
end $$;

-- Controllo: i nomi vecchi devono essere spariti da entrambi i posti
select c.vecchio,
  (select count(*) from serie where utente_id = (select id from u) and esercizio = c.vecchio) as serie_rimaste,
  (select position('"' || c.vecchio || '"' in dati::text) from config where utente_id = (select id from u)) as trovato_nel_blob,
  (select count(*) from serie where utente_id = (select id from u) and esercizio = c.nuovo) as totale_unito
from coppie c;

-- Tutti gli "serie_rimaste" e "trovato_nel_blob" a zero?
commit;
-- Altrimenti:  rollback;
