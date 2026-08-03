# Verifica che i dati siano al sicuro

Da rifare dopo ogni modifica al codice di sincronizzazione. Dieci minuti, e chiude la
domanda "ma i miei dati ci sono davvero?".

## Com'è fatto il sistema (per sapere cosa stiamo verificando)

**La verità sta in due posti diversi, di proposito:**

| | dove vive | come arriva nel cloud |
|---|---|---|
| Serie, sessioni | tabelle `serie` / `sessione` | una alla volta, appena spunti la serie |
| Check-in, pasti, peso, acqua | tabelle loro | appena li salvi |
| **Schede, piano alimentare, obiettivi, record, impostazioni** | riga `config`, colonna JSON | riscritta INTERA a ogni modifica |

Sul telefono c'è sempre una copia completa (`carico-v1`): l'app funziona senza rete e la coda
(`carico-syncq`) parte da sola al rientro. Quindi un dato può essere: solo locale (rete
assente), locale + in coda, oppure sincronizzato.

**Le tre protezioni aggiunte dopo l'incidente del 2 agosto 2026:**
1. I dati locali sanno di CHI sono (`carico-uid`): cambiando account non si mescolano.
2. Ogni operazione in coda è timbrata col suo utente: le serie di uno non finiscono nell'account di un altro.
3. Un errore del database non butta il dato: si riprova sei volte prima di mollarlo.

---

## A. Verifiche sul telefono

### A1 — La serie arriva nel cloud
1. Segna una serie in allenamento.
2. Su Supabase: `select * from serie order by ts desc limit 5;`
3. ✅ La serie c'è, con peso, reps, RPE e `recupero_sec`.

### A2 — Senza rete non si perde niente
1. Modalità aereo.
2. Segna **tre** serie. In Profilo → Account e cloud deve comparire il numero in coda.
3. Riattiva la rete, aspetta qualche secondo.
4. ✅ Le tre serie compaiono nel cloud e la coda torna a zero.

### A3 — La chiusura dell'app non perde la coda
1. Modalità aereo, segna una serie, **chiudi del tutto l'app**.
2. Riapri con la rete attiva.
3. ✅ La serie sale lo stesso: la coda è su disco, non in memoria.

### A4 — Le schede arrivano nel cloud
1. Cambia il nome di una scheda.
2. `select updated_at, jsonb_array_length(dati->'schede') from config where utente_id = 'TUO-ID';`
3. ✅ `updated_at` è di adesso.

### A5 — ⭐ Due account non si mescolano (è il bug del 2 agosto)
1. Esci e entra con un **altro** account.
2. ✅ NON devi vedere le schede del primo. Se le vedi, la protezione non funziona: **fermati e segnalalo**.
3. Segna una serie con questo secondo account.
4. `select u.email, count(*) from serie s join auth.users u on u.id=s.utente_id group by u.email;`
5. ✅ La serie nuova sta sotto il secondo account, e i totali del primo **non sono cambiati**.
6. Rientra col primo: ✅ ritrovi le tue schede.

### A6 — Un telefono nuovo recupera tutto
1. Apri l'app in una finestra di navigazione anonima ed entra.
2. ✅ Schede, storico, check-in e peso ci sono. È lo stesso percorso di un telefono nuovo.

---

## B. Verifiche sul server

### B1 — Nessuna serie orfana o senza padrone
```sql
select count(*) as serie_senza_sessione from serie s
 where not exists (select 1 from sessione x where x.id = s.sessione_id);

select count(*) as serie_con_utente_diverso_dalla_sessione
  from serie s join sessione x on x.id = s.sessione_id
 where s.utente_id <> x.utente_id;
```
✅ Entrambi **0**. Il secondo diverso da zero significa account mescolati.

### B2 — I totali combaciano con l'app
```sql
select u.email,
  (select count(*) from serie where utente_id = u.id)   as serie,
  (select count(*) from checkin where utente_id = u.id) as checkin,
  (select jsonb_array_length(dati->'schede') from config where utente_id = u.id) as schede
from auth.users u order by u.created_at;
```
✅ I numeri corrispondono a quelli che vedi in **Stats → 90 giorni**.

### B3 — Nessun buco nei giorni allenati
```sql
select ts::date as giorno, count(*) as serie
  from serie where utente_id = 'TUO-ID'
 group by giorno order by giorno desc limit 30;
```
✅ Ci sono tutti i giorni in cui ti sei allenato. Un giorno mancante = quello non è mai salito.

### B4 — La cronologia delle schede funziona
Dopo aver lanciato `storico-config.sql`, modifica una scheda e poi:
```sql
select id, salvato_il, jsonb_array_length(dati->'schede') as schede
  from config_storico where utente_id = 'TUO-ID' order by salvato_il desc limit 5;
```
✅ Compare una riga nuova a ogni modifica: è la versione **precedente**, quella da cui tornare indietro.

---

## C. Se qualcosa non torna

| Sintomo | Strumento |
|---|---|
| Nel cloud manca roba che sul telefono c'è | Profilo → Dati e app → **Rimanda tutto nel cloud** |
| Sul telefono manca roba che nel cloud c'è | Profilo → Account e cloud → **Carica i dati dal cloud** |
| Ho perso le schede | `storico-config.sql`, sezione "come recuperare una versione" |
| Dati sparsi su due account | `unisci-utenti.sql` (aggiunge, non cancella) |
| Non so dove siano finiti | `diagnosi.sql` (solo letture) |

**Prima di qualunque operazione sui dati: Profilo → Dati e app → Esporta dati.**
Il piano gratuito di Supabase **non ha backup ripristinabili**: quel file è l'unica rete vera.
