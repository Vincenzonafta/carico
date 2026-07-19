// Parser IA delle schede: da PDF/foto al formato dell'app, con la chiave dell'utente (BYOK).
// Structured output (responseSchema): Gemini NON può produrre un formato diverso dal nostro.
// A valle c'è comunque l'ANTEPRIMA obbligatoria: si importa solo dopo conferma dell'utente.
import { lookupMuscle, MUSCLES, type Scheda, type PlanItem, type SetSpec, type SetType } from '../coach'

const MODEL = 'gemini-3.5-flash'

const PROMPT = `Estrai TUTTO il programma di allenamento da questo documento (tabella, foto o testo, in qualsiasi lingua).

REGOLE DI TRADUZIONE:
- Ogni giorno/sessione del programma diventa un "day" con i suoi esercizi NELL'ORDINE del documento.
- Se il programma è organizzato in SETTIMANE (Week 5, Week 6, settimana 1...), produci UNA SCHEDA PER SETTIMANA
  chiamata "<nome programma> · Week N", ripetendo i giorni con i valori di quella settimana. Altrimenti una sola scheda.
- "sets" = numero di serie; "reps" = ripetizioni rappresentative (per un range tipo "10/12" usa il valore più alto e scrivi il range in "note").
- "rest" = recupero in SECONDI ("75/90" → 90; "1'30" → 90; "2 min" → 120). Se non indicato: 90.
- Serie DIVERSE tra loro (es. "10, 10, 8, 8" o percentuali/carichi diversi per serie) → compila "scheme" con una voce per ogni serie.
- Percentuali del massimale ("87%", "@80%") → "load" della serie (formato "@87%").
- Target di sforzo (RPE "@8", "RIR 2") → "target" della serie (formato "@8" oppure "RIR2").
- Tempi, fermi e isometrie ("Iso3''", "fermo 2'' al petto", "3-1-1", "salita lenta") → campo "tempo" dell'esercizio.
- SUPERSET (esercizi uniti da "+" o indicati in coppia) → DUE esercizi consecutivi separati, con "ss": true sul PRIMO dei due.
- Esercizi a tempo (plank 60'') → sets = numero di serie, reps = secondi, e in "note" scrivi "durata in secondi".
- "muscle" = gruppo muscolare principale, esattamente uno tra: ${MUSCLES.join(', ')}, Altro.
- Indicazioni di esecuzione del coach → "note" dell'esercizio.
- NON inventare esercizi o valori assenti dal documento. Mantieni i nomi degli esercizi come scritti (in italiano se lo sono).`

const SET_TYPES = ['normal', 'warmup', 'ramp', 'backoff', 'drop', 'amrap', 'failure']

const SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      days: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  ex: { type: 'string' },
                  sets: { type: 'integer' },
                  reps: { type: 'integer' },
                  rest: { type: 'integer' },
                  muscle: { type: 'string' },
                  note: { type: 'string' },
                  tempo: { type: 'string' },
                  ss: { type: 'boolean' },
                  scheme: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string', enum: SET_TYPES },
                        reps: { type: 'string' },
                        load: { type: 'string' },
                        target: { type: 'string' },
                      },
                      required: ['type', 'reps'],
                    },
                  },
                },
                required: ['ex', 'sets', 'reps', 'rest', 'muscle'],
              },
            },
          },
          required: ['name', 'items'],
        },
      },
    },
    required: ['name', 'days'],
  },
}

export async function parseSchedaFile(file: File, apiKey: string): Promise<Scheda[]> {
  const b64 = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = () => rej(new Error('File non leggibile'))
    r.readAsDataURL(file)
  })
  if (!b64) throw new Error('File vuoto o non leggibile')
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: file.type || 'application/pdf', data: b64 } },
        { text: PROMPT },
      ] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => null) as { error?: { message?: string } } | null
    const msg = err?.error?.message ?? r.statusText
    if (r.status === 400 && /api key/i.test(msg)) throw new Error('Chiave API non valida: controllala in Profilo → ⚙ → Coach IA.')
    if (r.status === 429) throw new Error('Limite richieste raggiunto: riprova tra un minuto.')
    throw new Error('Errore IA: ' + msg)
  }
  const j = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const testo = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  let raw: unknown
  try { raw = JSON.parse(testo) } catch { throw new Error('L\'IA non ha prodotto un formato valido: riprova.') }
  const schede = sanitize(raw)
  if (!schede.length) throw new Error('Nessuna scheda riconosciuta nel documento.')
  return schede
}

// Difesa in profondità: anche col responseSchema, numeri e campi vengono rivalidati qui.
function sanitize(raw: unknown): Scheda[] {
  if (!Array.isArray(raw)) return []
  const out: Scheda[] = []
  for (const sc of raw) {
    if (!sc || typeof sc !== 'object') continue
    const s2 = sc as Record<string, unknown>
    const dOut: Scheda['days'] = []
    for (const d of (Array.isArray(s2.days) ? s2.days : [])) {
      const d2 = d as Record<string, unknown>
      const items = (Array.isArray(d2.items) ? d2.items : [])
        .map((it) => sanItem(it as Record<string, unknown>))
        .filter((x): x is PlanItem => x !== null)
      if (items.length) dOut.push({ name: String(d2.name ?? 'Giorno'), items })
    }
    if (dOut.length) out.push({ name: String(s2.name ?? 'Scheda importata'), days: dOut })
  }
  return out
}

const num = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : dflt
}

function sanItem(it: Record<string, unknown>): PlanItem | null {
  const ex = String(it.ex ?? '').trim()
  if (!ex) return null
  const scheme = Array.isArray(it.scheme) && it.scheme.length
    ? (it.scheme as Record<string, unknown>[]).map((sp): SetSpec => ({
        type: (SET_TYPES.includes(String(sp.type)) ? String(sp.type) : 'normal') as SetType,
        reps: String(sp.reps ?? '8'),
        load: sp.load ? String(sp.load) : undefined,
        target: sp.target ? String(sp.target) : undefined,
      }))
    : undefined
  return {
    ex,
    muscle: MUSCLES.includes(String(it.muscle)) ? String(it.muscle) : lookupMuscle(ex),
    sets: num(it.sets, 1, 20, 3),
    reps: num(it.reps, 1, 600, 10), // fino a 600: gli esercizi a tempo usano i secondi
    rest: num(it.rest, 0, 900, 90),
    note: it.note ? String(it.note) : undefined,
    tempo: it.tempo ? String(it.tempo) : undefined,
    ss: it.ss === true ? true : undefined,
    scheme,
  }
}
