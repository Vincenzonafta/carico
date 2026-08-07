// Parser IA delle schede: da PDF/foto al formato dell'app, con la chiave dell'utente (BYOK).
// Structured output (responseSchema): Gemini NON può produrre un formato diverso dal nostro.
// A valle c'è comunque l'ANTEPRIMA obbligatoria: si importa solo dopo conferma dell'utente.
import { lookupMuscle, MUSCLES, type Scheda, type PlanItem, type SetSpec, type SetType, type MealPlan, type MealType, type PlanFood, type PlanSlot, type GiornoPiano } from '../coach'
import { postGemini } from './gemini'

const PROMPT = `Estrai TUTTO il programma di allenamento da questo documento (tabella, foto o testo, in qualsiasi lingua).

REGOLE DI TRADUZIONE:
- Ogni giorno/sessione del programma diventa un "day" con i suoi esercizi NELL'ORDINE del documento.
- Se il programma è organizzato in SETTIMANE (Week 5, Week 6, settimana 1...), produci UNA SCHEDA PER SETTIMANA
  chiamata "<nome programma> · Week N", ripetendo i giorni con i valori di quella settimana. Altrimenti una sola scheda.
- "sets" = numero di serie; "reps" = ripetizioni rappresentative (per un range tipo "10/12" usa il valore più alto e scrivi il range in "note").
- "rest" = recupero in SECONDI ("75/90" → 90; "1'30" → 90; "2 min" → 120). Se non indicato: 90.
- Serie DIVERSE tra loro (es. "10, 10, 8, 8" o percentuali/carichi diversi per serie) → compila "scheme" con una voce per ogni serie.
- Percentuali del massimale ("87%", "@80%") → "load" della serie (formato "@87%").

NOTAZIONE ITALIANA DA POWERLIFTING (attenzione, è la fonte di errore più comune):
- "10*3s" significa 10 RIPETIZIONI per 3 SERIE: la "s" sta per serie e l'ordine è REPS*SERIE,
  NON serie×reps. Quindi "10*3s" → reps=10, sets=3. Allo stesso modo "8*4s" → reps=8, sets=4.
- "@8" è un RPE (sforzo), MAI un carico. NON PERDERLO MAI:
  · se lo stesso RPE vale per tutte le serie dell'esercizio → campo "target" DELL'ESERCIZIO (es. "@8");
  · se cambia tra gruppi di serie → "target" della singola voce di "scheme".
  "RIR 2" si scrive "RIR2". Un esercizio con un RPE scritto nel documento DEVE avere "target" compilato,
  a livello di esercizio o di scheme.
- ";" separa prescrizioni DIVERSE dello stesso esercizio → una voce di "scheme" per ciascuna.
  Esempio: "3 @6 ; 3*3s" → scheme: [{reps:"3", target:"@6"}, {reps:"3"}, {reps:"3"}, {reps:"3"}]
  (prima una singola da 3 reps @6, poi 3 serie da 3).
  Esempio: "87% 2*5s" → 5 serie da 2 reps con load "@87%".
- RAPPRESENTAZIONE PER SERIE (formato dell'app, vale sempre): se l'RPE o il carico cambiano tra le serie,
  o se le serie sono elencate una per una, usa SEMPRE "scheme" col "target"/"load" su OGNI voce. Il
  "target" globale dell'esercizio va usato SOLO quando tutte le serie hanno davvero lo stesso valore
  e non c'è alcuna notazione che le elenchi separatamente.
- "F2''" = fermo di 2 secondi, "Iso3''" = isometria 3 secondi, "Salita lenta (3'')", "ist" = isometria:
  vanno tutti nel campo "tempo" dell'esercizio, non nelle note.
- "→" o "⇒" fra due prescrizioni dello STESSO esercizio = serie in stripping/scalata:
  "scheme" con le due voci, la seconda con type "drop".
- Se il documento riporta i massimali dell'atleta (es. "190 · 100 · 220" vicino a squat/panca/stacco),
  scrivili nella "note" del rispettivo esercizio come "massimale <n> kg": servono a interpretare le percentuali.
- SQUAT → Gambe; PANCA/panca piana → Petto; STACCO/stacco da terra → Schiena.
- Tempi, fermi e isometrie ("Iso3''", "fermo 2'' al petto", "3-1-1", "salita lenta") → campo "tempo" dell'esercizio.
- SUPERSET (esercizi uniti da "+" o indicati in coppia) → DUE esercizi consecutivi separati, con "ss": true sul PRIMO dei due.
- Esercizi a tempo (plank 60'', isometrie, cardio a durata) → sets = numero di serie, reps = i SECONDI,
  e OBBLIGATORIAMENTE "timed": true. Senza quel flag l'app conterebbe 60 ripetizioni e falserebbe il volume.
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
                  target: { type: 'string' }, // RPE/RIR valido per tutte le serie ("@8", "RIR2")
                  timed: { type: 'boolean' }, // serie a tempo: "reps" sono secondi
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

// Confronto "morbido" fra nomi: minuscole, via accenti, gradi e punteggiatura. Serve perché
// "Panca 60" e "Panca 60°" sono lo stesso esercizio, ma come stringhe sono diversi e
// finirebbero come due voci separate, ognuna col suo storico.
// ⚠️ I NUMERI RESTANO: "Panca 30" e "Panca 60" sono inclinazioni diverse e devono rimanere
// due esercizi distinti. Unire per sbaglio è molto peggio che lasciare un doppione.
const chiaveNome = (n: string) => n.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '') // accenti: però → pero
  .replace(/[°º^]/g, '')                            // gradi: 60° → 60
  .replace(/[^a-z0-9]+/g, ' ')                      // punteggiatura e simboli → spazio
  .trim()

// Manda un documento (PDF o foto) a Gemini e ne riporta il JSON. Condiviso fra il parser
// delle schede e quello della dieta: cambiano solo istruzioni e schema.
async function leggiDocumento(file: File, apiKey: string, istruzioni: string, schema: unknown): Promise<unknown> {
  const b64 = await new Promise<string>((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result).split(',')[1] ?? '')
    r.onerror = () => rej(new Error('File non leggibile'))
    r.readAsDataURL(file)
  })
  if (!b64) throw new Error('File vuoto o non leggibile')
  const j = await postGemini(apiKey, {
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: file.type || 'application/pdf', data: b64 } },
      { text: istruzioni },
    ] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
  })
  const testo = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  try { return JSON.parse(testo) } catch { throw new Error("L'IA non ha prodotto un formato valido: riprova.") }
}

// `nota` = spiegazione/correzione scritta dall'ATLETA sulla SUA scheda (la notazione del suo
// preparatore, che è specifica e NON universale). Va messa in cima e trattata come autoritativa:
// è lui che ha il documento davanti, e le sue regole battono quelle generali. Il default resta
// pulito, senza notazioni di un singolo utente.
export async function parseSchedaFile(file: File, apiKey: string, nota?: string, libreria: string[] = []): Promise<Scheda[]> {
  // La libreria dell'atleta va nel prompt: senza, una virgola o un grado di differenza
  // ("Panca 60" invece di "Panca 60°") crea un doppione con lo storico vuoto.
  const elenco = libreria.length
    ? `\n\nESERCIZI CHE L'ATLETA HA GIÀ (usa QUESTI nomi, identici, quando il documento indica
lo stesso esercizio anche se scritto in modo un po' diverso — maiuscole, accenti, gradi,
abbreviazioni, singolare/plurale). Inventa un nome nuovo SOLO se nessuno di questi corrisponde:
${libreria.join(' · ')}`
    : ''
  const istruzioni = nota?.trim()
    ? `⚠️ REGOLE DELL'ATLETA PER QUESTA SCHEDA — AUTORITATIVE. Leggile PRIMA di tutto e applicale ALLA LETTERA.
Descrivono la notazione del suo preparatore (specifica di questa scheda) e VINCONO SEMPRE su qualunque
regola generale più sotto ogni volta che la contraddicono. Valgono per l'INTERO documento.
Se una di queste regole implica valori PER SERIE (RPE, carico o ripetizioni diversi da una serie all'altra,
oppure una regola che "trascina"/ripete un valore alle serie successive), ESPANDILE in "scheme" con una
voce per OGNI serie, ognuna col suo valore — non riassumere in un unico target globale.
«««
${nota.trim()}
»»»

Qui sotto le regole GENERALI, da usare solo dove le regole dell'atleta qui sopra non dicono nulla:

${PROMPT}${elenco}`
    : PROMPT + elenco
  const raw = await leggiDocumento(file, apiKey, istruzioni, SCHEMA)
  const schede = sanitize(raw, libreria)
  if (!schede.length) throw new Error('Nessuna scheda riconosciuta nel documento.')
  return schede
}

// Difesa in profondità: anche col responseSchema, numeri e campi vengono rivalidati qui.
// `libreria` serve a ricondurre i nomi a quelli che l'atleta ha già: chiedere al modello di
// riusarli aiuta ma non basta, questo confronto invece è deterministico.
function sanitize(raw: unknown, libreria: string[] = []): Scheda[] {
  const canonico = new Map(libreria.map((n) => [chiaveNome(n), n]))
  if (!Array.isArray(raw)) return []
  const out: Scheda[] = []
  for (const sc of raw) {
    if (!sc || typeof sc !== 'object') continue
    const s2 = sc as Record<string, unknown>
    const dOut: Scheda['days'] = []
    for (const d of (Array.isArray(s2.days) ? s2.days : [])) {
      const d2 = d as Record<string, unknown>
      const items = (Array.isArray(d2.items) ? d2.items : [])
        .map((it) => sanItem(it as Record<string, unknown>, canonico))
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

function sanItem(it: Record<string, unknown>, canonico: Map<string, string>): PlanItem | null {
  const grezzo = String(it.ex ?? '').trim()
  if (!grezzo) return null
  // se esiste già un esercizio "uguale a meno di simboli", uso IL SUO nome: così l'import si
  // aggancia allo storico invece di aprire una voce gemella e vuota
  const ex = canonico.get(chiaveNome(grezzo)) ?? grezzo
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
    target: it.target ? String(it.target) : undefined,
    // se l'IA non lo marca ci pensa isTimed dal nome: meglio ridondanti che con un plank da 60 reps
    timed: it.timed === true || undefined,
    ss: it.ss === true ? true : undefined,
    scheme,
  }
}

// ═══════════════ PARSER DIETA ═══════════════
// Stessa impostazione delle schede: documento → JSON nel formato dell'app → anteprima.
// La differenza che conta: qui i NOMI devono agganciarsi all'archivio alimenti, altrimenti
// `foodLookup` non trova le calorie e il pasto entra a zero. Per questo l'elenco degli
// alimenti conosciuti va nel prompt, e a valle c'è comunque il confronto morbido.
const PROMPT_DIETA = `Estrai il piano alimentare da questo documento (tabella, foto o testo, in qualsiasi lingua).
Il piano è una LISTA DI GIORNI che si ripete a ciclo. Tu TRASCRIVI quello che c'è scritto:
non progettare una dieta, non correggerla, non completarla. Se il documento non dice una cosa,
non la dice nemmeno il tuo risultato.

QUANTI GIORNI:
- Se tutti i giorni sono uguali (un unico schema di pasti): UN SOLO giorno, nome "Ogni giorno".
- Se il documento distingue i giorni (lunedì, martedì… oppure "giorno 1, 2, 3"): un giorno per
  ciascuno, nell'ordine del documento, con il nome che usa il documento.
- Se una quantità RUOTA su un numero fisso di giorni ("carboidrati: 300, 150, 50, 50, 0 poi
  ricominci"): fai UN GIORNO PER OGNI VALORE della rotazione — qui 5 giorni. I pasti sono gli
  stessi in tutti, cambia solo quel valore, che scrivi nella "nota" del giorno ("carbo: 150 g").
- Se giorni diversi hanno pasti diversi, ripeti i pasti per intero in ogni giorno.

DENTRO IL GIORNO:
- Ogni pasto diventa uno "slot" con il suo "type", esattamente uno tra: colazione, pranzo,
  cena, spuntino. Merenda/snack/break → spuntino. Più spuntini = più slot "spuntino" separati.
- Un pasto che rimanda a un altro ("cena idem pranzo", "spuntino 2 come lo spuntino 1"):
  copia per intero gli alimenti del pasto a cui rimanda.
- "name" = il nome dell'alimento da solo, senza quantità né preparazione
  ("Petto di pollo alla piastra 150g" → name "Petto di pollo", grams 150).
- Integratori, caffè, acqua e tisane SENZA calorie: saltali, non sono alimenti da tracciare.

QUANTITÀ — la regola più importante:
- "grams" in grammi, numero intero. Converti le misure casalinghe: 1 uovo medio ≈ 60,
  1 cucchiaio di olio ≈ 10, 1 cucchiaino ≈ 5, 1 fetta di pane ≈ 30, 1 tazza di latte ≈ 250,
  1 vasetto di yogurt ≈ 125, 1 scatoletta di tonno ≈ 80 (sgocciolato).
  Se il documento dà un peso "da crudo" o "da secco", usa QUEL numero.
- Quantità a intervallo ("100-150 g"): usa il valore più alto.
- Se il documento NON indica la quantità ("+ carbo", "verdure a piacere"): metti grams NULL.
  MAI un numero inventato: è una dieta scritta da un professionista e la quantità la
  decide l'atleta. Un numero plausibile ma falso è l'errore peggiore che puoi fare qui.

ALTERNATIVE ("oppure", "o in alternativa", "/", opzioni elencate come scelte del pasto):
- Metti la prima come alimento e TUTTE le altre in "alt". Non buttarle via: è l'atleta
  che sceglie ogni giorno quale usare.

Metti in "note" le regole generali che non sono pasti (olio a crudo, verdure vietate,
litri d'acqua, sale, "nessuno sgarro"…), copiate dal documento.`

const CIBO_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    grams: { type: 'integer', nullable: true },
  },
  required: ['name'],
}

const SCHEMA_DIETA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    note: { type: 'string' },
    giorni: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          nota: { type: 'string' },
          slots: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['colazione', 'pranzo', 'cena', 'spuntino'] },
                items: {
                  type: 'array',
                  items: { ...CIBO_SCHEMA, properties: { ...CIBO_SCHEMA.properties, alt: { type: 'array', items: CIBO_SCHEMA } } },
                },
              },
              required: ['type', 'items'],
            },
          },
        },
        required: ['nome', 'slots'],
      },
    },
  },
  required: ['name', 'giorni'],
}

export async function parseDietaFile(file: File, apiKey: string, nota?: string, alimenti: string[] = []): Promise<MealPlan> {
  const elenco = alimenti.length
    ? `\n\nALIMENTI GIÀ IN ARCHIVIO (usa QUESTI nomi, identici, quando l'alimento è lo stesso anche
se scritto diversamente). Solo così l'app trova le calorie: un nome che non combacia entra a zero.
Se un alimento non è in elenco scrivilo come sta nel documento:
${alimenti.join(' · ')}`
    : ''
  const istruzioni = nota?.trim()
    ? `⚠️ REGOLE DELL'ATLETA PER QUESTO PIANO — AUTORITATIVE, applicale ALLA LETTERA e vincono
su qualunque regola generale più sotto quando la contraddicono.
«««
${nota.trim()}
»»»

Regole generali, da usare dove quelle sopra non dicono nulla:

${PROMPT_DIETA}${elenco}`
    : PROMPT_DIETA + elenco

  const raw = await leggiDocumento(file, apiKey, istruzioni, SCHEMA_DIETA)
  const piano = sanDieta(raw, alimenti)
  if (!piano.giorni.length) throw new Error('Nessun pasto riconosciuto nel documento.')
  return piano
}

const TIPI_PASTO = ['colazione', 'pranzo', 'cena', 'spuntino']

function sanDieta(raw: unknown, alimenti: string[]): MealPlan {
  const canonico = new Map(alimenti.map((n) => [chiaveNome(n), n]))
  const r = (raw ?? {}) as Record<string, unknown>

  // stesso aggancio degli esercizi: se l'alimento esiste già in archivio uso IL SUO nome,
  // così `foodLookup` trova le calorie invece di far entrare il pasto a zero
  const cibo = (x: unknown, conAlt: boolean): PlanFood | null => {
    const it = (x ?? {}) as Record<string, unknown>
    const grezzo = String(it.name ?? '').trim()
    if (!grezzo) return null
    // grams assente/nullo = quantità aperta, e ci resta: qui non si inventano numeri
    const g = it.grams == null ? null : num(it.grams, 1, 3000, 100)
    const alt = conAlt && Array.isArray(it.alt)
      ? it.alt.map((a) => cibo(a, false)).filter((a): a is PlanFood => a !== null)
      : []
    return { name: canonico.get(chiaveNome(grezzo)) ?? grezzo, grams: g, ...(alt.length ? { alt } : {}) }
  }

  const giorni: GiornoPiano[] = []
  for (const gr of (Array.isArray(r.giorni) ? r.giorni : [])) {
    const g2 = (gr ?? {}) as Record<string, unknown>
    const slots: PlanSlot[] = []
    for (const sl of (Array.isArray(g2.slots) ? g2.slots : [])) {
      const s2 = (sl ?? {}) as Record<string, unknown>
      const type = TIPI_PASTO.includes(String(s2.type)) ? String(s2.type) as MealType : 'spuntino'
      const items = (Array.isArray(s2.items) ? s2.items : [])
        .map((x) => cibo(x, true))
        .filter((x): x is PlanFood => x !== null)
      if (items.length) slots.push({ type, items })
    }
    if (slots.length) giorni.push({
      nome: String(g2.nome ?? `Giorno ${giorni.length + 1}`).slice(0, 40),
      ...(g2.nota ? { nota: String(g2.nota).slice(0, 200) } : {}),
      slots,
    })
  }
  return {
    name: String(r.name ?? 'Piano importato').slice(0, 80),
    ...(r.note ? { note: String(r.note).slice(0, 1000) } : {}),
    giorni,
  }
}
