-- ═══ UNIRE I DATI DI DUE ACCOUNT (senza cancellare niente) ═══
-- Diverso da trasferisci-utente.sql: quello SOSTITUISCE il destinatario, questo AGGIUNGE.
-- Utile quando un account vecchio (magari con un'email finta, in cui non si riesce più a
-- entrare) ha dati che vuoi portare in quello che usi adesso.
--
-- Non serve la password del vecchio account: si lavora sulle tabelle, non sull'accesso.
--
-- REGOLA DEI CONFLITTI: dove può esistere UNA SOLA riga per giorno (check-in, peso, acqua)
-- e per quel giorno il destinatario ha già qualcosa, VINCE il destinatario e la riga del
-- vecchio account viene lasciata dov'è. Non si sovrascrive mai il presente col passato.

begin;

-- ══ Metti qui i due id (Authentication → Users, colonna UID) ══
create temp table m as select
  'c8c83143-9eb6-4ffe-b51b-cd0c29d826f1'::uuid as sorgente,     -- da cui prendere (es. tonno@)
  '00000000-0000-0000-0000-000000000000'::uuid as destinazione; -- in cui mettere

-- ── PRIMA GUARDA: che cosa sto per spostare? ──
select 'serie' as cosa,
       (select count(*) from serie where utente_id = (select sorgente from m))     as nella_sorgente,
       (select count(*) from serie where utente_id = (select destinazione from m)) as gia_nella_destinazione
union all select 'sessioni',
       (select count(*) from sessione where utente_id = (select sorgente from m)),
       (select count(*) from sessione where utente_id = (select destinazione from m))
union all select 'check-in',
       (select count(*) from checkin where utente_id = (select sorgente from m)),
       (select count(*) from checkin where utente_id = (select destinazione from m))
union all select 'pasti',
       (select count(*) from pasto where utente_id = (select sorgente from m)),
       (select count(*) from pasto where utente_id = (select destinazione from m))
union all select 'pesate',
       (select count(*) from peso_corporeo where utente_id = (select sorgente from m)),
       (select count(*) from peso_corporeo where utente_id = (select destinazione from m));

-- Se i numeri hanno senso, prosegui. Altrimenti: rollback;

-- 1. Serie e sessioni: nessun vincolo per giorno, si spostano tutte
update sessione set utente_id = (select destinazione from m) where utente_id = (select sorgente from m);
update serie    set utente_id = (select destinazione from m) where utente_id = (select sorgente from m);

-- 2. Una riga per giorno: sposto SOLO i giorni che il destinatario non ha già
update checkin c set utente_id = (select destinazione from m)
 where c.utente_id = (select sorgente from m)
   and not exists (select 1 from checkin d where d.utente_id = (select destinazione from m) and d.data = c.data);

update peso_corporeo p set utente_id = (select destinazione from m)
 where p.utente_id = (select sorgente from m)
   and not exists (select 1 from peso_corporeo d where d.utente_id = (select destinazione from m) and d.data = p.data);

update acqua a set utente_id = (select destinazione from m)
 where a.utente_id = (select sorgente from m)
   and not exists (select 1 from acqua d where d.utente_id = (select destinazione from m) and d.data = a.data);

-- 3. Pasti: sposto solo i giorni in cui il destinatario non ha mangiato niente, altrimenti
--    le calorie di quel giorno si sommerebbero due volte
update pasto p set utente_id = (select destinazione from m)
 where p.utente_id = (select sorgente from m)
   and not exists (select 1 from pasto d where d.utente_id = (select destinazione from m) and d.data = p.data);

-- 4. Fasi e note del coach: nessun vincolo, si spostano
update fase       set utente_id = (select destinazione from m) where utente_id = (select sorgente from m);
update nota_coach set utente_id = (select destinazione from m) where utente_id = (select sorgente from m);

-- 5. SCHEDE: config è una riga sola per utente, non si può spostare. Accodo le schede
--    della sorgente a quelle della destinazione, senza toccare il resto (impostazioni,
--    obiettivi, record: restano quelli della destinazione).
update config d
   set dati = jsonb_set(d.dati, '{schede}',
        coalesce(d.dati->'schede', '[]'::jsonb) || coalesce(s.dati->'schede', '[]'::jsonb))
  from config s
 where d.utente_id = (select destinazione from m)
   and s.utente_id = (select sorgente from m);

-- Se la destinazione non avesse ancora una config, si prende in blocco quella della sorgente
update config set utente_id = (select destinazione from m)
 where utente_id = (select sorgente from m)
   and not exists (select 1 from config d where d.utente_id = (select destinazione from m));

-- ── CONTROLLO FINALE ──
select u.email,
  (select count(*) from serie   where utente_id = u.id) as serie,
  (select count(*) from checkin where utente_id = u.id) as checkin,
  (select jsonb_array_length(dati->'schede') from config where utente_id = u.id) as schede
from auth.users u
where u.id in (select sorgente from m) or u.id in (select destinazione from m);

-- Numeri giusti?
commit;
-- Altrimenti:  rollback;

-- ── DOPO, sul telefono ──
-- Entra con l'account di destinazione e usa: Profilo → Account e cloud → Carica i dati dal
-- cloud. Senza, l'app continua a mostrare quello che ha in memoria e non vedi l'unione.
