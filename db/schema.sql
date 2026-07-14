-- Schema Postgres per CARICO — incollare nel SQL Editor di Supabase ed eseguire.
-- Disegno: EVENTI immutabili (l'IA legge qui) + STATO CORRENTE (config) + MEMORIA del coach.
-- I derivati (readiness, proposte, streak, badge) NON si salvano: si calcolano dagli eventi.

-- ═══ UTENTE: profilo agganciato a Supabase Auth (id = auth.users.id) ═══
create table utente (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  obiettivo  text,
  created_at timestamptz not null default now()
);

-- ═══ EVENTI ═══

-- Un allenamento. fine = null: chiusa implicitamente, fa fede il ts dell'ultima serie.
create table sessione (
  id        uuid primary key,
  utente_id uuid not null references utente (id) on delete cascade,
  inizio    timestamptz not null,
  fine      timestamptz,
  nota      text
);

-- IL CUORE: la singola serie eseguita.
-- utente_id ridondante (c'è già via sessione) ma rende dirette RLS e la query
-- più calda dell'IA: storico per utente+esercizio senza join.
create table serie (
  id           uuid primary key,
  utente_id    uuid not null references utente (id) on delete cascade,
  sessione_id  uuid not null references sessione (id) on delete cascade,
  esercizio    text not null,
  ordine       int not null,             -- n° progressivo della serie nella seduta
  peso         numeric(6,2) not null,
  reps         int not null,
  rpe          numeric(3,1),             -- 6-10, sforzo percepito
  recupero_sec int,                      -- riposo REALE prima di questa serie (null = prima della seduta)
  ts           timestamptz not null
);

-- Check-in giornaliero (voti 1-10 come nell'app + ore dormite)
create table checkin (
  id        uuid primary key default gen_random_uuid(),
  utente_id uuid not null references utente (id) on delete cascade,
  data      date not null,
  sonno     int, energia int, doms int, stress int,
  ore       numeric(3,1),
  unique (utente_id, data)
);

create table pasto (
  id        uuid primary key default gen_random_uuid(),
  utente_id uuid not null references utente (id) on delete cascade,
  data      date not null,
  tipo      text,                        -- colazione | pranzo | cena | spuntino
  nome      text,
  kcal      int,
  prot      numeric(6,1), carbo numeric(6,1), grassi numeric(6,1),
  grammi    int
);

create table peso_corporeo (
  id        uuid primary key default gen_random_uuid(),
  utente_id uuid not null references utente (id) on delete cascade,
  data      date not null,
  kg        numeric(5,2) not null,
  unique (utente_id, data)
);

create table acqua (
  id        uuid primary key default gen_random_uuid(),
  utente_id uuid not null references utente (id) on delete cascade,
  data      date not null,
  ml        int not null,
  unique (utente_id, data)                -- una riga (totale) per giorno: upsert
);

-- Fase alimentare/di programma: carica, scarica, mantenimento. data_fine null = fase attuale.
create table fase (
  id          uuid primary key default gen_random_uuid(),
  utente_id   uuid not null references utente (id) on delete cascade,
  tipo        text not null,
  data_inizio date not null,
  data_fine   date,
  kcal_target int
);

-- ═══ MEMORIA DEL COACH: osservazioni che l'IA scrive e rilegge ═══
create table nota_coach (
  id        uuid primary key default gen_random_uuid(),
  utente_id uuid not null references utente (id) on delete cascade,
  ts        timestamptz not null default now(),
  testo     text not null,
  tag       text                          -- es. 'recupero' | 'sonno' | nome esercizio
);

-- ═══ STATO CORRENTE: definizioni, l'IA le legge intere ═══
-- Un blob unico per utente (schede, obiettivi, impostazioni, custom, piano): niente
-- normalizzazione, l'app lo scrive/legge intero.
create table config (
  utente_id  uuid primary key references utente (id) on delete cascade,
  dati       jsonb,
  updated_at timestamptz not null default now()
);

-- ═══ INDICI: le rotte calde delle query dell'IA ═══
create index on serie (utente_id, esercizio, ts desc);
create index on serie (sessione_id);
create index on sessione (utente_id, inizio desc);
create index on checkin (utente_id, data desc);
create index on pasto (utente_id, data desc);
create index on nota_coach (utente_id, ts desc);

-- ═══ RLS: ognuno vede e scrive solo le proprie righe ═══
alter table utente        enable row level security;
alter table sessione      enable row level security;
alter table serie         enable row level security;
alter table checkin       enable row level security;
alter table pasto         enable row level security;
alter table peso_corporeo enable row level security;
alter table acqua         enable row level security;
alter table fase          enable row level security;
alter table nota_coach    enable row level security;
alter table config        enable row level security;

create policy own on utente        for all using (id = auth.uid())        with check (id = auth.uid());
create policy own on sessione      for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
create policy own on serie         for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
create policy own on checkin       for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
create policy own on pasto         for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
create policy own on peso_corporeo for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
create policy own on acqua         for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
create policy own on fase          for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
create policy own on nota_coach    for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
create policy own on config        for all using (utente_id = auth.uid()) with check (utente_id = auth.uid());
