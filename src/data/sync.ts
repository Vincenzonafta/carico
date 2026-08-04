// Specchio eventi → Supabase, fire-and-forget con coda persistente.
// L'app scrive SEMPRE prima in localStorage (verità locale, funziona offline);
// qui l'evento viene accodato e spedito appena c'è rete + login. In palestra
// senza segnale non si perde niente: la coda parte al rientro.
import { supa } from './client'

// u = utente a cui appartiene l'operazione, timbrato quando entra in coda. Senza, una coda
// creata da un account partirebbe con l'utente_id di CHI È LOGGATO ADESSO, scrivendo i dati
// di uno dentro l'account di un altro.
// n = tentativi falliti. Un errore del DB non significa "dato da buttare": la riga utente o
// la sessione a cui si aggancia possono non esserci ANCORA. Si riprova, e solo dopo N volte
// si molla — prima bastava un errore per perdere una serie per sempre.
const MAX_TENT = 6
type Op = { u?: string; n?: number } & (
  | { op: 'ins'; t: string; row: Record<string, unknown> }
  | { op: 'ups'; t: string; row: Record<string, unknown>; onConflict: string }
  | { op: 'upd'; t: string; id: string; patch: Record<string, unknown> }
  | { op: 'del'; t: string; id: string }
  | { op: 'delday'; t: string; date: string }
)

const QK = 'carico-syncq'
const q: Op[] = JSON.parse(localStorage.getItem(QK) ?? '[]')
const save = () => localStorage.setItem(QK, JSON.stringify(q))
let curUid: string | null = null // ultimo utente conosciuto, per timbrare la coda
export const utenteCorrente = () => curUid
const enq = (o: Op) => { q.push({ ...o, u: curUid ?? undefined }); save(); void flush() }

export const pending = () => q.length

// Stato cloud, sincrono, per dare feedback nell'app (off = senza chiavi, anon = non loggato, on = attivo).
let logged = false
export const cloudState = (): 'off' | 'anon' | 'on' => !supa ? 'off' : logged ? 'on' : 'anon'

let flushing = false
// PER QUALE utente ho già verificato il profilo. Prima era un semplice sì/no: cambiando
// account restava "sì" del precedente, il profilo del nuovo non veniva creato e ogni suo
// inserimento falliva per chiave mancante.
let utenteOkPer: string | null = null
export async function flush() {
  if (!supa || flushing) return
  flushing = true
  try {
    const sess = (await supa.auth.getSession()).data.session
    const uid = sess?.user.id
    if (!uid) return
    if (utenteOkPer !== uid) { // il profilo DEVE esistere prima di ogni insert, o il vincolo FK rifiuta
      const r = await supa.from('utente').upsert({ id: uid, nome: sess!.user.email })
      if (r.error) { console.warn('[sync] utente', r.error.message); return } // riprovo al prossimo flush
      utenteOkPer = uid
    }
    // Spedisco SOLO le operazioni di questo utente. Quelle di un altro account restano in
    // coda intatte e partiranno quando rientra lui: scartarle perderebbe dati suoi.
    let i = 0
    while (i < q.length) {
      const o = q[i]
      if (o.u && o.u !== uid) { i++; continue }
      const r = o.op === 'ins' ? await supa.from(o.t).insert({ utente_id: uid, ...o.row })
        : o.op === 'ups' ? await supa.from(o.t).upsert({ utente_id: uid, ...o.row }, { onConflict: o.onConflict })
        : o.op === 'upd' ? await supa.from(o.t).update(o.patch).eq('id', o.id)
        : o.op === 'delday' ? await supa.from(o.t).delete().eq('utente_id', uid).eq('data', o.date)
        : await supa.from(o.t).delete().eq('id', o.id)
      if (r.error) {
        if (!r.error.code) { // nessun codice = probabile assenza di rete: tengo la coda e riprovo dopo
          console.warn('[sync] rete?', o.t, r.error.message); break
        }
        // 23505 = già inserita (flush doppio): è a posto, la tolgo dalla coda.
        if (r.error.code !== '23505') {
          // Ogni altro errore può essere temporaneo (profilo utente o sessione non ancora
          // create): la tengo e riprovo. Solo dopo MAX_TENT la mollo, senza perdere il resto.
          o.n = (o.n ?? 0) + 1
          if (o.n < MAX_TENT) {
            console.warn('[sync] riprovo', o.t, r.error.code, r.error.message, `(${o.n}/${MAX_TENT})`)
            save(); i++; continue
          }
          console.warn('[sync] scartata dopo', o.n, 'tentativi:', o.t, r.error.code, r.error.message)
        }
      }
      q.splice(i, 1); save()
    }
  } finally { flushing = false }
}

window.addEventListener('online', () => void flush())
// curUid va tenuto aggiornato PRIMA di ogni enq: all'avvio e a ogni cambio di sessione
void supa?.auth.getSession().then(({ data }) => { curUid = data.session?.user.id ?? null })
supa?.auth.onAuthStateChange((_e, sess) => {
  logged = !!sess?.user
  curUid = sess?.user.id ?? null
  if (sess?.user) void flush() // flush garantisce il profilo utente prima di spedire la coda
})

// --- Sessione di allenamento corrente ---
// Persistita: sopravvive a reload e blocco telefono. 3 ore senza serie = seduta nuova.
const SK = 'carico-sess'
// u = di chi è questa seduta. Senza, cambiando account le serie nuove si sarebbero agganciate
// alla sessione del vecchio utente (che sta in un altro account, o non esiste più).
type Sess = { id: string; lastSetAt: number; n: number; ids: string[]; u?: string }
let sess: Sess | null = JSON.parse(localStorage.getItem(SK) ?? 'null')
const saveSess = () => localStorage.setItem(SK, JSON.stringify(sess))
const GAP_MS = 3 * 3600_000
// La seduta aperta vale solo per chi l'ha aperta: per chiunque altro è come non esistesse.
const sessMia = () => (sess && (!sess.u || sess.u === curUid) ? sess : null)

// uuid() esiste SOLO in contesti sicuri (HTTPS o localhost). Sul telefono via
// http://192.168... è indefinito e farebbe fallire il salvataggio: qui un fallback che gira ovunque.
export function uuid(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const b = new Uint8Array(16)
  if (c?.getRandomValues) c.getRandomValues(b)
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256)
  b[6] = (b[6] & 0x0f) | 0x40 // versione 4
  b[8] = (b[8] & 0x3f) | 0x80 // variante
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// Registra una serie: apre la sessione se serve, misura il recupero REALE
// (tempo dall'ultima serie segnata, qualunque esercizio). Ritorna l'id della riga cloud.
export function serieLoggata(esercizio: string, peso: number, reps: number, rpe: number | null): { id: string; rec: number | null } {
  const now = Date.now()
  const mia = sessMia()
  if (!mia || now - mia.lastSetAt > GAP_MS) {
    sess = { id: uuid(), lastSetAt: now, n: 0, ids: [], u: curUid ?? undefined }
    enq({ op: 'ins', t: 'sessione', row: { id: sess.id, inizio: new Date(now).toISOString() } })
  } else sess = mia
  const recupero_sec = sess.n === 0 ? null : Math.round((now - sess.lastSetAt) / 1000)
  const id = uuid()
  sess.n += 1; sess.lastSetAt = now; (sess.ids ??= []).push(id); saveSess()
  enq({ op: 'ins', t: 'serie', row: {
    id, sessione_id: sess.id, esercizio, ordine: sess.n,
    peso, reps, rpe, recupero_sec, ts: new Date(now).toISOString(),
  } })
  return { id, rec: recupero_sec } // rec: lo storico locale lo teneva solo sul cloud, ora anche qui
}

// Spunta tolta nell'app: la riga cloud sparisce (il DB deve restare la verità)
export function serieRimossa(id: string) { enq({ op: 'del', t: 'serie', id }) }

// Serie corretta a posteriori: dal calendario (peso/reps/rpe) o dall'unione di due esercizi
// (esercizio). Aggiorna la riga cloud, così il rinomino non resta solo sul telefono.
export function serieModificata(id: string, patch: { peso?: number; reps?: number; rpe?: number | null; esercizio?: string }) {
  enq({ op: 'upd', t: 'serie', id, patch })
}

export function sessioneChiusa() {
  const mia = sessMia()
  if (!mia) return
  enq({ op: 'upd', t: 'sessione', id: mia.id, patch: { fine: new Date().toISOString() } })
  sess = null; saveSess()
}

// Abbandona la sessione: cancella dal cloud le serie segnate + la sessione, e torna i loro id
// così l'app le toglie anche dallo stato locale.
export function sessioneAnnullata(): string[] {
  const mia = sessMia()
  if (!mia) return []
  const ids = mia.ids ?? []
  for (const id of ids) enq({ op: 'del', t: 'serie', id })
  enq({ op: 'del', t: 'sessione', id: mia.id })
  sess = null; saveSess()
  return ids
}

// --- Eventi giornalieri: upsert per giorno (una riga per data) ---
export function checkinSalvato(c: { date: string; sonno?: number; energia?: number; doms?: number; stress?: number; ore?: number }) {
  enq({ op: 'ups', t: 'checkin', onConflict: 'utente_id,data',
    row: { data: c.date, sonno: c.sonno, energia: c.energia, doms: c.doms, stress: c.stress, ore: c.ore } })
}
export function pesoSalvato(date: string, kg: number) {
  enq({ op: 'ups', t: 'peso_corporeo', onConflict: 'utente_id,data', row: { data: date, kg } })
}
export function acquaSalvata(date: string, ml: number) {
  if (ml > 0) enq({ op: 'ups', t: 'acqua', onConflict: 'utente_id,data', row: { data: date, ml } })
  else enq({ op: 'delday', t: 'acqua', date }) // azzerata: via la riga del giorno
}

// --- Pasti: multi-riga per giorno. Rimpiazzo l'intero giorno invece di tracciare id per riga. ---
// ponytail: delday + insert a ogni modifica; se i pasti per giorno diventano molti si passa agli id.
export function pastiOggiAggiornati(
  meals: { date: string; type: string; name: string; kcal: number; protein: number; carbs: number; fat: number; grams?: number }[],
  date: string,
) {
  enq({ op: 'delday', t: 'pasto', date })
  for (const m of meals) if (m.date === date)
    enq({ op: 'ins', t: 'pasto', row: {
      data: m.date, tipo: m.type, nome: m.name,
      kcal: m.kcal, prot: m.protein, carbo: m.carbs, grassi: m.fat, grammi: m.grams ?? null } })
}

// ═══ RIPRISTINO: rimanda nel cloud TUTTO lo stato locale ═══
// Serve quando il cloud ha perso dei dati che in locale ci sono ancora (cancellazioni
// sbagliate, account mescolati). Normalmente le serie salgono una alla volta quando le
// segni: qui si ricostruisce l'intero storico.
// È RIPETIBILE senza creare doppioni: le serie viaggiano col loro id (un secondo invio
// viene rifiutato come già presente) e la sessione di ogni giorno ha un id derivato dalla
// data, quindi è sempre la stessa.
const sessioneDelGiorno = (date: string) => `5e551e00-0000-4000-8000-${date.replace(/-/g, '').padEnd(12, '0')}`

type LogRiga = { id?: string; date: string; ex: string; kg: number; reps: number; rpe: number | null; rec?: number | null }
export function ricaricaNelCloud(st: {
  log: LogRiga[]
  checkins: { date: string; sonno?: number; energia?: number; doms?: number; stress?: number; ore?: number }[]
  meals: { date: string; type: string; name: string; kcal: number; protein: number; carbs: number; fat: number; grams?: number }[]
  body: { date: string; kg: number }[]
  water: { date: string; ml: number }[]
  durate?: Record<string, number>
}): { log: LogRiga[]; n: number } {
  const giorni = [...new Set(st.log.map((l) => l.date))].sort()
  const conId: LogRiga[] = st.log.map((l) => ({ ...l, id: l.id ?? uuid() })) // gli id mancanti li fisso ORA
  for (const d of giorni) {
    const sid = sessioneDelGiorno(d)
    const dur = st.durate?.[d] ?? 0
    const inizio = new Date(`${d}T12:00:00`)
    enq({ op: 'ins', t: 'sessione', row: {
      id: sid, inizio: inizio.toISOString(),
      fine: dur ? new Date(inizio.getTime() + dur * 1000).toISOString() : null,
    } })
    conId.filter((l) => l.date === d).forEach((l, i) => {
      enq({ op: 'ins', t: 'serie', row: {
        id: l.id, sessione_id: sid, esercizio: l.ex, ordine: i + 1,
        peso: l.kg, reps: l.reps, rpe: l.rpe, recupero_sec: l.rec ?? null,
        ts: new Date(inizio.getTime() + i * 60000).toISOString(), // orari finti ma in ordine
      } })
    })
  }
  for (const c of st.checkins) checkinSalvato(c)
  for (const b of st.body) pesoSalvato(b.date, b.kg)
  for (const w of st.water) acquaSalvata(w.date, w.ml)
  for (const d of new Set(st.meals.map((m) => m.date))) pastiOggiAggiornati(st.meals, d)
  return { log: conId, n: conId.length }
}

// --- Definizioni (schede, obiettivi, impostazioni, custom, piano): un blob per utente ---
// Le tengo come snapshot unico in config.dati; l'IA le legge intere. Coalescio gli upsert
// consecutivi così una raffica di modifiche non gonfia la coda.
export function configSalvata(st: Record<string, unknown>) {
  const dati = {
    schede: st.schede, activeScheda: st.activeScheda, activeDay: st.activeDay,
    customExercises: st.customExercises, extras: st.extras, sessionEx: st.sessionEx,
    exVideo: st.exVideo, exDesc: st.exDesc, refMax: st.refMax, durate: st.durate, allenamento: st.allenamento,
    misure: st.misure, target: st.target,
    // chat troncata: il blob è uno snapshot, una conversazione lunga lo gonfierebbe senza motivo
    chat: Array.isArray(st.chat) ? st.chat.slice(-60) : [],
    mealPlan: st.mealPlan, goal: st.goal, settings: st.settings, customFoods: st.customFoods,
  }
  const last = q[q.length - 1]
  if (last && last.op === 'ups' && last.t === 'config') { last.row = { dati }; save(); void flush() }
  else enq({ op: 'ups', t: 'config', onConflict: 'utente_id', row: { dati } })
}

// Scarica TUTTO dal cloud e lo rimappa nella forma dello State locale (per il ripristino al login).
export async function pullAll(uid: string) {
  if (!supa) return null
  const [cfg, se, ci, pa, pe, ac] = await Promise.all([
    supa.from('config').select('dati').eq('utente_id', uid).maybeSingle(),
    supa.from('serie').select('*').eq('utente_id', uid),
    supa.from('checkin').select('*').eq('utente_id', uid),
    supa.from('pasto').select('*').eq('utente_id', uid),
    supa.from('peso_corporeo').select('*').eq('utente_id', uid),
    supa.from('acqua').select('*').eq('utente_id', uid),
  ])
  return {
    dati: (cfg.data?.dati ?? null) as Record<string, unknown> | null,
    // ordinate per ts: il contesto (posizione nella seduta, pre-affaticamento) si deriva
    // dall'ordine del log, quindi dev'essere quello di esecuzione anche dopo il pull dal cloud
    log: (se.data ?? []).slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
      .map((r) => ({ id: r.id, date: String(r.ts).slice(0, 10), ex: r.esercizio, kg: Number(r.peso), reps: r.reps, rpe: r.rpe, rec: r.recupero_sec ?? null })),
    checkins: (ci.data ?? []).map((c) => ({ date: c.data, sonno: c.sonno, energia: c.energia, doms: c.doms, stress: c.stress, ore: c.ore ?? undefined })),
    meals: (pa.data ?? []).map((p) => ({ date: p.data, type: p.tipo, name: p.nome, kcal: p.kcal, protein: Number(p.prot), carbs: Number(p.carbo), fat: Number(p.grassi), grams: p.grammi ?? undefined })),
    body: (pe.data ?? []).map((b) => ({ date: b.data, kg: Number(b.kg) })),
    water: (ac.data ?? []).map((w) => ({ date: w.data, ml: w.ml })),
  }
}
