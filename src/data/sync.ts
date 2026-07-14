// Specchio eventi → Supabase, fire-and-forget con coda persistente.
// L'app scrive SEMPRE prima in localStorage (verità locale, funziona offline);
// qui l'evento viene accodato e spedito appena c'è rete + login. In palestra
// senza segnale non si perde niente: la coda parte al rientro.
import { supa } from './client'

type Op =
  | { op: 'ins'; t: string; row: Record<string, unknown> }
  | { op: 'ups'; t: string; row: Record<string, unknown>; onConflict: string }
  | { op: 'upd'; t: string; id: string; patch: Record<string, unknown> }
  | { op: 'del'; t: string; id: string }
  | { op: 'delday'; t: string; date: string }

const QK = 'carico-syncq'
const q: Op[] = JSON.parse(localStorage.getItem(QK) ?? '[]')
const save = () => localStorage.setItem(QK, JSON.stringify(q))
const enq = (o: Op) => { q.push(o); save(); void flush() }

export const pending = () => q.length

// Stato cloud, sincrono, per dare feedback nell'app (off = senza chiavi, anon = non loggato, on = attivo).
let logged = false
export const cloudState = (): 'off' | 'anon' | 'on' => !supa ? 'off' : logged ? 'on' : 'anon'

let flushing = false
let utenteOk = false // il profilo utente esiste nel cloud (è la FK di tutte le tabelle)
export async function flush() {
  if (!supa || flushing) return
  flushing = true
  try {
    const sess = (await supa.auth.getSession()).data.session
    const uid = sess?.user.id
    if (!uid) return
    if (!utenteOk) { // il profilo DEVE esistere prima di ogni insert, o il vincolo FK rifiuta e il dato va perso
      const r = await supa.from('utente').upsert({ id: uid, nome: sess!.user.email })
      if (r.error) { console.warn('[sync] utente', r.error.message); return } // riprovo al prossimo flush
      utenteOk = true
    }
    while (q.length) {
      const o = q[0]
      const r = o.op === 'ins' ? await supa.from(o.t).insert({ utente_id: uid, ...o.row })
        : o.op === 'ups' ? await supa.from(o.t).upsert({ utente_id: uid, ...o.row }, { onConflict: o.onConflict })
        : o.op === 'upd' ? await supa.from(o.t).update(o.patch).eq('id', o.id)
        : o.op === 'delday' ? await supa.from(o.t).delete().eq('utente_id', uid).eq('data', o.date)
        : await supa.from(o.t).delete().eq('id', o.id)
      if (r.error) {
        if (!r.error.code) { // nessun codice = probabile assenza di rete: tengo la coda e riprovo dopo
          console.warn('[sync] rete?', o.t, r.error.message); break
        }
        if (r.error.code !== '23505') // errore lato DB permanente per questa op (es. vincolo): scarto e proseguo, così non blocca il resto
          console.warn('[sync] scartata', o.t, r.error.code, r.error.message)
        // 23505 = già inserita (flush doppio): ok, proseguo
      }
      q.shift(); save()
    }
  } finally { flushing = false }
}

window.addEventListener('online', () => void flush())
supa?.auth.onAuthStateChange((_e, sess) => {
  logged = !!sess?.user
  if (!sess?.user) utenteOk = false // al logout il prossimo login riverifica il profilo
  if (sess?.user) void flush() // flush garantisce il profilo utente prima di spedire la coda
})

// --- Sessione di allenamento corrente ---
// Persistita: sopravvive a reload e blocco telefono. 3 ore senza serie = seduta nuova.
const SK = 'carico-sess'
type Sess = { id: string; lastSetAt: number; n: number }
let sess: Sess | null = JSON.parse(localStorage.getItem(SK) ?? 'null')
const saveSess = () => localStorage.setItem(SK, JSON.stringify(sess))
const GAP_MS = 3 * 3600_000

// uuid() esiste SOLO in contesti sicuri (HTTPS o localhost). Sul telefono via
// http://192.168... è indefinito e farebbe fallire il salvataggio: qui un fallback che gira ovunque.
function uuid(): string {
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
export function serieLoggata(esercizio: string, peso: number, reps: number, rpe: number | null): string {
  const now = Date.now()
  if (!sess || now - sess.lastSetAt > GAP_MS) {
    sess = { id: uuid(), lastSetAt: now, n: 0 }
    enq({ op: 'ins', t: 'sessione', row: { id: sess.id, inizio: new Date(now).toISOString() } })
  }
  const recupero_sec = sess.n === 0 ? null : Math.round((now - sess.lastSetAt) / 1000)
  const id = uuid()
  sess.n += 1; sess.lastSetAt = now; saveSess()
  enq({ op: 'ins', t: 'serie', row: {
    id, sessione_id: sess.id, esercizio, ordine: sess.n,
    peso, reps, rpe, recupero_sec, ts: new Date(now).toISOString(),
  } })
  return id
}

// Spunta tolta nell'app: la riga cloud sparisce (il DB deve restare la verità)
export function serieRimossa(id: string) { enq({ op: 'del', t: 'serie', id }) }

export function sessioneChiusa() {
  if (!sess) return
  enq({ op: 'upd', t: 'sessione', id: sess.id, patch: { fine: new Date().toISOString() } })
  sess = null; saveSess()
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

// --- Definizioni (schede, obiettivi, impostazioni, custom, piano): un blob per utente ---
// Le tengo come snapshot unico in config.dati; l'IA le legge intere. Coalescio gli upsert
// consecutivi così una raffica di modifiche non gonfia la coda.
export function configSalvata(st: Record<string, unknown>) {
  const dati = {
    schede: st.schede, activeScheda: st.activeScheda, activeDay: st.activeDay,
    customExercises: st.customExercises, extras: st.extras, target: st.target,
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
    log: (se.data ?? []).map((r) => ({ id: r.id, date: String(r.ts).slice(0, 10), ex: r.esercizio, kg: Number(r.peso), reps: r.reps, rpe: r.rpe })),
    checkins: (ci.data ?? []).map((c) => ({ date: c.data, sonno: c.sonno, energia: c.energia, doms: c.doms, stress: c.stress, ore: c.ore ?? undefined })),
    meals: (pa.data ?? []).map((p) => ({ date: p.data, type: p.tipo, name: p.nome, kcal: p.kcal, protein: Number(p.prot), carbs: Number(p.carbo), fat: Number(p.grassi), grams: p.grammi ?? undefined })),
    body: (pe.data ?? []).map((b) => ({ date: b.data, kg: Number(b.kg) })),
    water: (ac.data ?? []).map((w) => ({ date: w.data, ml: w.ml })),
  }
}
