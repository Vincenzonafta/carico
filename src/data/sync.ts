// Specchio eventi → Supabase, fire-and-forget con coda persistente.
// L'app scrive SEMPRE prima in localStorage (verità locale, funziona offline);
// qui l'evento viene accodato e spedito appena c'è rete + login. In palestra
// senza segnale non si perde niente: la coda parte al rientro.
import { supa } from './client'

type Op =
  | { op: 'ins'; t: string; row: Record<string, unknown> }
  | { op: 'upd'; t: string; id: string; patch: Record<string, unknown> }
  | { op: 'del'; t: string; id: string }

const QK = 'carico-syncq'
const q: Op[] = JSON.parse(localStorage.getItem(QK) ?? '[]')
const save = () => localStorage.setItem(QK, JSON.stringify(q))
const enq = (o: Op) => { q.push(o); save(); void flush() }

export const pending = () => q.length

// Stato cloud, sincrono, per dare feedback nell'app (off = senza chiavi, anon = non loggato, on = attivo).
let logged = false
export const cloudState = (): 'off' | 'anon' | 'on' => !supa ? 'off' : logged ? 'on' : 'anon'

let flushing = false
export async function flush() {
  if (!supa || flushing) return
  flushing = true
  try {
    const uid = (await supa.auth.getSession()).data.session?.user.id
    if (!uid) return
    while (q.length) {
      const o = q[0]
      const r = o.op === 'ins' ? await supa.from(o.t).insert({ utente_id: uid, ...o.row })
        : o.op === 'upd' ? await supa.from(o.t).update(o.patch).eq('id', o.id)
        : await supa.from(o.t).delete().eq('id', o.id)
      if (r.error && r.error.code !== '23505') { // 23505 = già inserita (flush doppio): ok
        console.warn('[sync]', o.t, r.error.message)
        break // offline o errore: la coda resta, si riprova al prossimo flush
      }
      q.shift(); save()
    }
  } finally { flushing = false }
}

window.addEventListener('online', () => void flush())
supa?.auth.onAuthStateChange((_e, sess) => {
  logged = !!sess?.user
  // al login: assicura il profilo, poi svuota la coda accumulata
  if (sess?.user && supa) void supa.from('utente').upsert({ id: sess.user.id, nome: sess.user.email }).then(() => flush())
})

// --- Sessione di allenamento corrente ---
// Persistita: sopravvive a reload e blocco telefono. 3 ore senza serie = seduta nuova.
const SK = 'carico-sess'
type Sess = { id: string; lastSetAt: number; n: number }
let sess: Sess | null = JSON.parse(localStorage.getItem(SK) ?? 'null')
const saveSess = () => localStorage.setItem(SK, JSON.stringify(sess))
const GAP_MS = 3 * 3600_000

// Registra una serie: apre la sessione se serve, misura il recupero REALE
// (tempo dall'ultima serie segnata, qualunque esercizio). Ritorna l'id della riga cloud.
export function serieLoggata(esercizio: string, peso: number, reps: number, rpe: number | null): string {
  const now = Date.now()
  if (!sess || now - sess.lastSetAt > GAP_MS) {
    sess = { id: crypto.randomUUID(), lastSetAt: now, n: 0 }
    enq({ op: 'ins', t: 'sessione', row: { id: sess.id, inizio: new Date(now).toISOString() } })
  }
  const recupero_sec = sess.n === 0 ? null : Math.round((now - sess.lastSetAt) / 1000)
  const id = crypto.randomUUID()
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
