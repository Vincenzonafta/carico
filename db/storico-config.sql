-- ═══ CRONOLOGIA DELLE SCHEDE — rete di sicurezza contro le sovrascritture ═══
-- Da lanciare UNA VOLTA nel SQL Editor di Supabase.
--
-- Schede, piano alimentare, obiettivi, record e impostazioni vivono tutti nella riga `config`
-- di ogni utente. Quella riga viene RISCRITTA a ogni modifica: se qualcosa la sporca (un bug
-- dell'app, un account confuso, un import sbagliato), la versione di prima è persa per sempre.
--
-- Qui un trigger salva la versione PRECEDENTE a ogni scrittura. Sta nel database, quindi
-- funziona anche se l'app ha un bug: è l'unico punto che il client non può rompere.
-- Tiene le ultime 20 versioni per utente, poi le più vecchie cadono da sole.

create table if not exists config_storico (
  id         bigserial primary key,
  utente_id  uuid not null references utente (id) on delete cascade,
  dati       jsonb not null,
  salvato_il timestamptz not null default now()
);
create index if not exists config_storico_utente_idx on config_storico (utente_id, salvato_il desc);

alter table config_storico enable row level security;
drop policy if exists own on config_storico;
create policy own on config_storico for all
  using (utente_id = auth.uid()) with check (utente_id = auth.uid());

create or replace function salva_storico_config() returns trigger as $$
begin
  -- solo se cambia davvero: i salvataggi identici non devono consumare la cronologia
  if old.dati is distinct from new.dati then
    insert into config_storico (utente_id, dati) values (old.utente_id, old.dati);
    delete from config_storico
     where id in (
       select id from config_storico
        where utente_id = old.utente_id
        order by salvato_il desc
        offset 20
     );
  end if;
  return new;
end $$ language plpgsql security definer;

drop trigger if exists config_storico_trg on config;
create trigger config_storico_trg before update on config
  for each row execute function salva_storico_config();


-- ══════════════ COME RECUPERARE UNA VERSIONE ══════════════

-- 1. Vedere le versioni salvate: quante schede aveva ognuna e come si chiamavano
-- select id, salvato_il,
--        jsonb_array_length(dati->'schede') as schede,
--        (select string_agg(x->>'name', ' · ') from jsonb_array_elements(dati->'schede') x) as nomi
--   from config_storico
--  where utente_id = 'METTI-QUI-IL-TUO-ID'
--  order by salvato_il desc;

-- 2. Rimettere in uso una versione intera (prendi l'id dalla query sopra)
-- update config set dati = (select dati from config_storico where id = 123)
--  where utente_id = 'METTI-QUI-IL-TUO-ID';

-- 3. Oppure recuperare SOLO le schede, lasciando intatto il resto (impostazioni, record…)
-- update config c
--    set dati = jsonb_set(c.dati, '{schede}', (select dati->'schede' from config_storico where id = 123))
--  where c.utente_id = 'METTI-QUI-IL-TUO-ID';

-- Dopo il recupero, sul telefono: Profilo → Account e cloud → Carica i dati dal cloud.
