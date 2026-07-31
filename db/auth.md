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

## Limite da sapere
Il servizio email incluso di Supabase manda **poche email all'ora** ed è pensato per lo
sviluppo. Per un uso vero conviene collegare un SMTP tuo (Resend, Brevo, Postmark…) in
**Project Settings → Authentication → SMTP Settings**, altrimenti dopo qualche tentativo
le email smettono di partire e l'app mostra "Troppi tentativi: riprova tra poco".
