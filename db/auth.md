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

> 📄 I template già pronti, con la grafica di Carico, sono in **`db/email-templates.html`**:
> copia il primo blocco in *Confirm signup* e il secondo in *Reset password*.
> Sotto la versione minima, se preferisci partire da lì.

⚠️ **Lunghezza del codice**: di default è di 6 cifre, ma si può cambiare in
*Authentication → Sign In / Providers → Email → **Email OTP Length*** (6–10). L'app accetta
qualsiasi lunghezza da 6 a 10, quindi non devi toccarla — ma se vuoi il classico 6, è lì.

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
- **Gmail** — la via più corta per un'app personale: nessuna iscrizione a servizi, nessun
  dominio, nessun modulo aziendale. ~500 email al giorno, che per un uso privato sono tante.
- **Brevo** — 300 al giorno, non serve un dominio (basta verificare un mittente). Nel modulo
  d'iscrizione chiede un "nome azienda": **non devi avere una società**, ci metti il tuo nome
  e il tuo indirizzo. Può però chiederti di completare il profilo prima di abilitare l'SMTP.
- **Resend** — il più pulito, ma sul piano gratuito scrivi **solo a te stesso** finché non
  colleghi un dominio che possiedi. Ottimo se un dominio ce l'hai già.

### Gmail, passo per passo
1. Sul tuo account Google serve la **verifica in due passaggi attiva** (senza, le password
   per le app non esistono proprio).
   *Account Google → Sicurezza → Verifica in due passaggi*
2. *Account Google → Sicurezza → **Password per le app*** → creane una, chiamala "Carico".
   Ti dà 16 caratteri: copiali, non si rivedono più.

In Supabase → **Project Settings → Authentication → SMTP Settings**:

| Campo | Valore |
|---|---|
| Host | `smtp.gmail.com` |
| Port | `587` |
| Username | il tuo indirizzo Gmail per intero |
| Password | la **password per le app** da 16 caratteri (non quella del tuo account) |
| Sender email | lo stesso indirizzo Gmail |
| Sender name | `Carico` |

Da sapere: il destinatario vedrà il tuo indirizzo personale come mittente, e Gmail non è
pensato per invii di massa — ma per i codici di conferma di un'app tua è perfetto e gratis.

**Non serve un account nuovo**: la password per le app si crea su un account Google che hai
già. È legata all'account, non all'app, e puoi generarne quante ne vuoi.

#### Far comparire un altro indirizzo al posto della tua Gmail
Gmail può spedire "come" un altro indirizzo che possiedi (es. quello Outlook creato apposta),
senza pagare nulla:

1. In Gmail: **Impostazioni → Account e importazione → Invia messaggi come → Aggiungi un
   altro indirizzo email**. Metti l'indirizzo Outlook e lascia spuntato *Trattalo come alias*.
2. Google manda un codice **su quell'indirizzo**: aprilo e confermalo.
3. In Supabase, nelle impostazioni SMTP, come **Sender email** metti l'indirizzo Outlook,
   lasciando Host/Username/Password di Gmail.

Le email partono dai server di Google ma nel campo mittente si legge l'indirizzo Outlook.
Qualche client scrupoloso può mostrare un "via gmail.com" accanto al nome: se dà fastidio,
l'unica alternativa è un dominio tuo.

### Outlook / Hotmail: non va
Microsoft ha chiuso l'accesso SMTP con utente e password sugli account personali: ora
pretende OAuth2, che Supabase non parla. Un `smtp-mail.outlook.com` con la password
dell'account (o una password per le app) viene **rifiutato al login**. Se hai solo un
indirizzo Outlook, usalo come mittente dentro Brevo invece che come server SMTP.

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
