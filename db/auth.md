# Email di conferma con CODICE — configurazione Supabase

L'app chiede un **codice a 6 cifre** dopo la registrazione (e per il recupero password).
Supabase però, di default, nelle email manda un **link** e non il codice: il codice esiste
sempre, va solo aggiunto al testo dell'email. Sono due modifiche nel pannello, una volta sola.

> Se non fai nulla, l'app funziona lo stesso: chi riceve il link lo apre e viene loggato.
> Il campo del codice resterebbe però inutilizzabile, ed è quello che rende il flusso pulito
> anche quando leggi la posta su un altro dispositivo.

## 1. Attiva la conferma dell'email
**Authentication → Sign In / Providers → Email**
- `Confirm email` = **ON** (senza, chiunque entra senza verificare la casella)

## 2. Metti il codice nelle email
**Authentication → Emails → Templates**

Nel template **Confirm signup** aggiungi il codice (puoi lasciare anche il link):

```html
<h2>Conferma il tuo account CARICO</h2>
<p>Il tuo codice è:</p>
<p style="font-size:30px;font-weight:800;letter-spacing:6px">{{ .Token }}</p>
<p>Scrivilo nell'app per completare la registrazione. Scade tra un'ora.</p>
<p>Oppure apri direttamente questo link: <a href="{{ .ConfirmationURL }}">conferma</a></p>
```

Stessa cosa nel template **Reset password** (serve al "Password dimenticata?"):

```html
<h2>Reimposta la password di CARICO</h2>
<p>Il tuo codice è:</p>
<p style="font-size:30px;font-weight:800;letter-spacing:6px">{{ .Token }}</p>
<p>Scrivilo nell'app, poi scegli la nuova password. Scade tra un'ora.</p>
```

`{{ .Token }}` è il codice a 6 cifre, `{{ .ConfirmationURL }}` è il link: nella stessa email
possono convivere.

## 3. Se usi il link, dichiara gli indirizzi di ritorno
**Authentication → URL Configuration**
- `Site URL`: l'indirizzo dell'app su Vercel
- `Redirect URLs`: aggiungi anche `http://localhost:5173` per le prove in locale

Senza questo il link di conferma rimanda a un indirizzo sbagliato.

## 4. SMTP tuo (serve appena l'app la usa qualcun altro)

Il servizio email incluso di Supabase manda **poche email all'ora**, è dichiarato "solo per
sviluppo" e può consegnare in ritardo o finire in spam. Quando si esaurisce, l'app mostra
"Troppi tentativi: riprova tra poco" e la registrazione si blocca.

### Quale servizio
- **Brevo** — 300 email al giorno gratis e, soprattutto, **non serve un dominio tuo**: basta
  verificare un singolo indirizzo mittente (anche una Gmail). È la scelta giusta se non hai
  un dominio.
- **Resend** — più pulito, ma sul piano gratuito puoi scrivere **solo a te stesso** finché
  non colleghi un dominio che possiedi. Ottimo se hai già un dominio.

### Brevo, passo per passo
1. Crea l'account su brevo.com.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: metti il tuo indirizzo
   (es. `vsasso06@gmail.com`). Ricevi una mail di verifica: confermala.
3. **SMTP & API → SMTP**: qui trovi i dati. La password NON è quella dell'account, è la
   *SMTP key*: se non c'è, generane una e copiala subito.

Poi in Supabase: **Project Settings → Authentication → SMTP Settings** → *Enable Custom SMTP*

| Campo | Valore |
|---|---|
| Sender email | l'indirizzo che hai verificato al punto 2 |
| Sender name | `Carico` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | il login SMTP che ti mostra Brevo (spesso un codice tipo `8xxxxx001@smtp-brevo.com`) |
| Password | la **SMTP key** |

⚠️ Il *Sender email* deve essere **esattamente** l'indirizzo verificato in Brevo: se non
combacia, Brevo rifiuta e non parte nessuna email.

### Resend (se hai un dominio)
| Campo | Valore |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` |
| Password | la tua API key (`re_...`) |
| Sender email | un indirizzo del dominio verificato (es. `no-reply@tuodominio.it`) |

### Dopo aver salvato
**Authentication → Rate Limits**: alza il limite di invio email (di default resta basso
anche con SMTP tuo). Poi prova una registrazione vera con un'email che non hai mai usato:
se non arriva nulla, il log è in **Authentication → Logs**, e Brevo ha il suo in *Statistics
→ Email*.
