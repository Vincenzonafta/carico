-- ═══ TRASFERIRE TUTTI I DATI DA UN ACCOUNT A UN ALTRO ═══
-- Da incollare nel SQL Editor di Supabase.
--
-- Tutte le tabelle sono legate a utente_id: spostare i dati significa riscrivere quel campo.
-- Non serve toccare l'app: al primo accesso col nuovo account si ritrova tutto.
--
-- ⚠️ PRIMA DI TUTTO
-- 1. Il nuovo account deve aver fatto accesso ALMENO UNA VOLTA nell'app (serve la sua riga
--    in `utente`, a cui tutto il resto si aggancia). Se non l'ha fatto, il punto 0 la crea.
-- 2. Fai un backup: nell'app, Profilo → Dati e app → Esporta dati. Costa dieci secondi.
-- 3. I dati eventualmente già presenti sul nuovo account VENGONO CANCELLATI: è un
--    trasferimento, non una fusione. Se ti servono entrambi, fermati e chiedi.

-- ── Gli id dei due account: Authentication → Users, colonna UID. Oppure: ──
-- select id, email, created_at from auth.users order by created_at;

begin;

-- Metti qui i due id (lasciando gli apici)
create temp table trasf as
select
  '00000000-0000-0000-0000-000000000000'::uuid as vecchio,
  '11111111-1111-1111-1111-111111111111'::uuid as nuovo;

-- 0. La riga `utente` del destinatario deve esistere (se ha già usato l'app, c'è già)
insert into utente (id, nome)
select nuovo, (select email from auth.users where id = nuovo) from trasf
on conflict (id) do nothing;

-- 1. Svuoto il destinatario: senza, i vincoli "una riga per giorno" (checkin, peso, acqua)
--    farebbero fallire tutto a metà.
delete from serie          where utente_id = (select nuovo from trasf);
delete from sessione       where utente_id = (select nuovo from trasf);
delete from checkin        where utente_id = (select nuovo from trasf);
delete from pasto          where utente_id = (select nuovo from trasf);
delete from peso_corporeo  where utente_id = (select nuovo from trasf);
delete from acqua          where utente_id = (select nuovo from trasf);
delete from fase           where utente_id = (select nuovo from trasf);
delete from nota_coach     where utente_id = (select nuovo from trasf);
delete from config         where utente_id = (select nuovo from trasf);

-- 2. Sposto tutto. `sessione` prima di `serie` non è obbligatorio (le serie puntano alla
--    sessione per id, che non cambia), ma tenerle insieme rende l'operazione leggibile.
update sessione      set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);
update serie         set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);
update checkin       set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);
update pasto         set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);
update peso_corporeo set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);
update acqua         set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);
update fase          set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);
update nota_coach    set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);
-- config è una riga sola per utente (chiave primaria): contiene schede, obiettivi, impostazioni
update config        set utente_id = (select nuovo from trasf) where utente_id = (select vecchio from trasf);

-- 3. Controllo prima di confermare: le righe devono stare tutte sul nuovo account
select 'serie' as tabella, count(*) filter (where utente_id = (select vecchio from trasf)) as restano_al_vecchio,
       count(*) filter (where utente_id = (select nuovo from trasf)) as ora_al_nuovo from serie
union all select 'sessione', count(*) filter (where utente_id = (select vecchio from trasf)), count(*) filter (where utente_id = (select nuovo from trasf)) from sessione
union all select 'checkin',  count(*) filter (where utente_id = (select vecchio from trasf)), count(*) filter (where utente_id = (select nuovo from trasf)) from checkin
union all select 'pasto',    count(*) filter (where utente_id = (select vecchio from trasf)), count(*) filter (where utente_id = (select nuovo from trasf)) from pasto
union all select 'config',   count(*) filter (where utente_id = (select vecchio from trasf)), count(*) filter (where utente_id = (select nuovo from trasf)) from config;

-- Se i numeri tornano (colonna "restano_al_vecchio" tutta a zero):
commit;
-- Se qualcosa non torna, al posto del commit esegui:  rollback;

-- ── DOPO ──
-- Sul telefono: esci dall'account e rientra col nuovo. L'app si accorge che i dati locali
-- erano di un altro utente, ne tiene una copia di sicurezza e scarica quelli nuovi dal cloud.
