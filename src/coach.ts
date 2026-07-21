// Motore del coach: logica pura, zero UI. Tutto deterministico.

// id: riga specchiata nel cloud (i salvataggi vecchi non ce l'hanno)
// timed = serie a tempo: "reps" sono SECONDI, non ripetizioni. Segnato al momento di
// registrarla, così lo storico resta interpretabile anche se poi cambi la scheda.
export type SetLog = { id?: string; date: string; ex: string; kg: number; reps: number; rpe: number | null; timed?: boolean }
export type SetType = 'normal' | 'warmup' | 'ramp' | 'backoff' | 'drop' | 'amrap' | 'failure'
// target = sforzo prescritto per la serie ("@8", "RIR2"): testo libero, l'IA e il parser lo capiscono
export type SetSpec = { type: SetType; reps: string; load?: string; target?: string }
// ss = superset con l'esercizio immediatamente successivo del giorno; tempo = tempi/fermi ("disc. 3s, fermo 2s")
// target = sforzo prescritto per TUTTE le serie ("@8", "RIR2"). Senza questo campo le schede
// di powerlifting perdevano gli RPE: esistevano solo dentro scheme, cioè a serie differenziate.
export type PlanItem = { ex: string; sets: number; reps: number; rest: number; muscle: string; note?: string; scheme?: SetSpec[]; ss?: boolean; tempo?: string; target?: string; timed?: boolean }
export type Day = { name: string; items: PlanItem[] }
export type Scheda = { name: string; days: Day[] }
// Cosa è successo a un esercizio in UNA data, oltre alle serie registrate: saltato solo oggi,
// nota personale di quel giorno, e i video delle SINGOLE SERIE (indice serie → url).
// Vive per data come extras, così la SCHEDA resta intatta: lì ci sono solo le note generali.
// NB: il video dimostrativo "come si esegue" NON sta qui: è in State.exVideo, perché vale
// sempre e per ogni scheda in cui l'esercizio compare, non solo per la seduta di oggi.
export type SessionEx = { date: string; ex: string; skip?: boolean; note?: string; setVideos?: Record<number, string> }
export type Checkin = { date: string; sonno: number; energia: number; doms: number; stress: number; ore?: number }
export type MealType = 'colazione' | 'pranzo' | 'cena' | 'spuntino'
export type Meal = { date: string; type: MealType; name: string; kcal: number; protein: number; carbs: number; fat: number; grams?: number }
export type Food = { name: string; cat: string; kcal: number; protein: number; carbs: number; fat: number } // valori per 100 g
export type BodyLog = { date: string; kg: number }
export type Goal = { ex: string; targetKg: number }
export type Water = { date: string; ml: number }
export type Exercise = { name: string; muscle: string }
export type State = {
  schede: Scheda[]; activeScheda: number; activeDay: number
  customExercises: Exercise[]
  extras: { date: string; item: PlanItem }[]
  sessionEx: SessionEx[]
  // Video dimostrativo per NOME esercizio: "come va fatto". Sta qui e non sul PlanItem
  // perché è una proprietà dell'esercizio in sé — se la panca compare in tre schede,
  // la dimostrazione è la stessa e la registri una volta sola.
  exVideo: Record<string, string>
  // Massimale di RIFERIMENTO scritto dall'utente, come serie {kg, reps}: reps=1 è un 1RM vero,
  // altrimenti è il PR di ripetizioni e Epley lo converte. Ancora le proposte a % e RPE a un
  // numero VERO invece che alla stima dello storico (che manca se il PR è precedente all'app).
  refMax: Record<string, { kg: number; reps: number }>
  checkin: Checkin; checkins: Checkin[]; log: SetLog[]
  meals: Meal[]; customFoods: Food[]; target: { kcal: number; protein: number; carbs: number; fat: number; water: number }
  mealPlan: MealPlan | null
  body: BodyLog[]; goal: Goal; water: Water[]
  // geminiKey: chiave IA dell'utente (BYOK).
  // schedaNota: come è fatta la SUA scheda, scritto da lui. Persistente perché il suo coach
  // usa sempre la stessa notazione: la spiega una volta e vale per ogni import futuro.
  settings: { sound: boolean; vibrate: boolean; geminiKey?: string; schedaNota?: string }
  finishedDate?: string // giorno (YYYY-MM-DD) in cui l'allenamento è stato concluso con "Finito"
  finishedKcal?: number // calorie stimate dell'allenamento concluso (per la vista)
  finishedHealth?: { durata: number; calorie: number; distanza: number } // payload JSON pronto per Apple Health
}

export const today = () => new Date().toISOString().slice(0, 10)
export const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',')

// --- Schede: scheda e giorno attivi, esercizi correnti ---
export const curScheda = (s: State) => s.schede[s.activeScheda] ?? s.schede[0]
export const curDay = (s: State) => { const sc = curScheda(s); return sc?.days[s.activeDay] ?? sc?.days[0] }
export const curItems = (s: State) => curDay(s)?.items ?? []
export const allItems = (s: State) => s.schede.flatMap((sc) => sc.days.flatMap((d) => d.items))

// 1RM stimato (Epley) e arrotondamento al disco da 2,5 kg
// ?? [] ovunque: gli stati già salvati (localStorage e blob cloud) non hanno il campo.
export const sessionExOf = (s: State, ex: string, date: string) =>
  (s.sessionEx ?? []).find((x) => x.date === date && x.ex === ex)
/** Upsert su (data, esercizio): ritorna la lista nuova, da passare a setS. */
export function setSessionEx(s: State, ex: string, date: string, patch: Partial<SessionEx>): SessionEx[] {
  const list = s.sessionEx ?? []
  const i = list.findIndex((x) => x.date === date && x.ex === ex)
  if (i < 0) return [...list, { date, ex, ...patch }]
  const next = [...list]
  next[i] = { ...next[i], ...patch }
  return next
}

export const e1rm = (kg: number, reps: number) => kg * (1 + reps / 30)
export const round25 = (x: number) => Math.round(x / 2.5) * 2.5

// ===== ESERCIZI A TEMPO (plank, isometrie, cardio): i "reps" sono SECONDI =====
// Il nome basta a riconoscerli nelle schede vecchie, dove il flag non esiste;
// il flag esplicito, quando c'è, ha sempre l'ultima parola.
// Verificata sui 90 esercizi in archivio. Attenzione ai tranelli, già costati due
// falsi positivi: "camminat" prendeva gli AFFONDI camminati, "corda" il push down
// alla corda, e "bici" prenderebbe i BICIpiti. Nel dubbio si lascia fuori: sbagliare
// per difetto costa una spunta nell'editor, sbagliare per eccesso falsa le statistiche.
const TIMED_RE = /plank|isometri|\bhollow\b|wall ?sit|cyclette|tapis|\bcorsa\b|\bcamminata\b|vogatore|\bbici(cletta)?\b/i
export const isTimed = (it: { ex: string; timed?: boolean }) => it.timed ?? TIMED_RE.test(it.ex)

/**
 * Volume sollevato in kg. UNICA definizione: le serie a tempo restano fuori,
 * perché kg × secondi non è un tonnellaggio e falserebbe ogni statistica.
 */
export const volume = (log: SetLog[]) => log.reduce((a, l) => a + (l.timed ? 0 : l.kg * l.reps), 0)

// ===== RPE ↔ % del massimale (tabella RTS) =====
// La tabella classica è 10 RPE × 12 reps, ma ogni cella dipende SOLO da
// n = reps + RIR = le ripetizioni che avresti fatto arrivando a cedimento.
// (3 reps @8 e 5 reps @10 valgono entrambe n=5 → 86.3%.) Quindi 120 celle = 12 numeri.
// ponytail: oltre n=12 resto sull'ultimo valore; per le alte ripetizioni la stima
// conta poco e la tabella RTS lì è comunque inaffidabile.
const RPE_PCT = [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 71.7, 69.4]
/** Frazione del massimale (0..1) per una serie di `reps` chiusa a quell'`rpe`. */
export const rpePct = (reps: number, rpe: number) => {
  const n = Math.max(1, reps + (10 - rpe))
  const lo = Math.min(RPE_PCT.length, Math.floor(n))
  const hi = Math.min(RPE_PCT.length, lo + 1)
  return (RPE_PCT[lo - 1] + (RPE_PCT[hi - 1] - RPE_PCT[lo - 1]) * (n - Math.floor(n))) / 100
}
/** Massimale stimato da una serie chiusa a un dato RPE: più onesto di Epley sui carichi alti. */
export const e1rmRpe = (kg: number, reps: number, rpe: number) => kg / rpePct(reps, rpe)
/** Carico consigliato per centrare `reps` a quell'`rpe`, arrotondato a 2.5 kg. */
export const caricoPerRpe = (max: number, reps: number, rpe: number) => round25(max * rpePct(reps, rpe))

/** Legge lo sforzo prescritto: "@8" | "8" | "RPE 8" → 8; "RIR2" | "RIR 2" → 8 (RPE = 10 − RIR). */
export function parseTarget(t?: string): number | null {
  if (!t) return null
  const rir = t.match(/rir\s*(\d+(?:[.,]\d)?)/i)
  if (rir) { const v = 10 - +rir[1].replace(',', '.'); return v >= 1 && v <= 10 ? v : null }
  const m = t.match(/(\d+(?:[.,]\d)?)/)
  if (!m) return null
  const v = +m[1].replace(',', '.')
  return v >= 1 && v <= 10 ? v : null
}

/** Massimale stimato dallo storico: usa l'RPE dove c'è, altrimenti Epley. Serie a tempo escluse. */
export function maxStimato(log: SetLog[], ex: string): number {
  const v = log.filter((l) => l.ex === ex && !l.timed && l.kg > 0)
  return v.length ? Math.max(...v.map((l) => (l.rpe != null ? e1rmRpe(l.kg, l.reps, l.rpe) : e1rm(l.kg, l.reps)))) : 0
}

/** Massimale da usare per le proposte: il riferimento scritto dall'utente vince (è un dato
 *  vero), altrimenti la stima dello storico. `fonte` distingue i due per mostrarlo con onestà. */
export function massimale(s: State, ex: string): { kg: number; fonte: 'ref' | 'stima' | 'nessuno' } {
  const r = (s.refMax ?? {})[ex]
  // reps=1 è un 1RM VERO: vale il peso stesso. Epley a 1 rep lo gonferebbe (120→124).
  if (r && r.kg > 0 && r.reps >= 1) return { kg: r.reps === 1 ? r.kg : e1rm(r.kg, r.reps), fonte: 'ref' }
  const st = maxStimato(s.log, ex)
  return st > 0 ? { kg: st, fonte: 'stima' } : { kg: 0, fonte: 'nessuno' }
}

// !s.timed ovunque si stimi un massimale: su un plank da 60 secondi e1rm darebbe
// un "1RM" da 3× il carico. Escluse qui, spariscono da proposta, record e festa PR.
const dates = (log: SetLog[], ex: string) =>
  [...new Set(log.filter((s) => s.ex === ex && !s.timed).map((s) => s.date))].sort()

const sessE1 = (log: SetLog[], ex: string, date: string) =>
  Math.max(...log.filter((s) => s.ex === ex && s.date === date && !s.timed).map((s) => e1rm(s.kg, s.reps)))

const bestE1 = (log: SetLog[], ex: string) => {
  const ds = dates(log, ex)
  return ds.length ? Math.max(...ds.slice(-5).map((d) => sessE1(log, ex, d))) : 0
}

const avgRpe = (log: SetLog[], ex: string, date: string) => {
  const v = log.filter((s) => s.ex === ex && s.date === date && s.rpe != null)
  return v.length ? v.reduce((a, s) => a + (s.rpe as number), 0) / v.length : 0
}

// Quanto è salito lo sforzo a parità di lavoro: la firma della fatica accumulata
export const rpeDelta = (log: SetLog[], ex: string) => {
  const ds = dates(log, ex)
  if (ds.length < 2) return 0
  return avgRpe(log, ex, ds[ds.length - 1]) - avgRpe(log, ex, ds[0])
}

// Readiness 0-100 dal check-in soggettivo
export const readiness = (c: Checkin) =>
  Math.round((0.35 * c.sonno + 0.3 * c.energia + 0.2 * (10 - c.doms) + 0.15 * (10 - c.stress)) * 10)

// Readiness di un giorno passato, se quel giorno il check-in fu fatto
export const readinessOn = (s: State, date: string) => {
  const c = s.checkins.find((x) => x.date === date) ?? (s.checkin.date === date ? s.checkin : null)
  return c ? readiness(c) : null
}

// Il cuore: peso proposto = 1RM storico -> % del rep range -> correzione readiness + fatica
export function proposta(s: State, ex: string, targetReps: number) {
  const b = bestE1(s.log, ex)
  if (!b) return null
  const r = readiness(s.checkin)
  let adj = r >= 80 ? 1 : r >= 65 ? 0.95 : 0.9
  const dR = rpeDelta(s.log, ex)
  if (dR >= 1) adj *= 0.97
  const why =
    (dR >= 1 ? `RPE in salita (+${fmt(dR)} in ${dates(s.log, ex).length} sessioni). ` : '') +
    (r < 80 ? `Readiness ${r}/100.` : 'Readiness alto: giornata buona.')
  return { kg: round25((b / (1 + targetReps / 30)) * adj), why }
}

// Record: la serie migliore di sempre per e1rm
export function record(log: SetLog[], ex: string) {
  const v = log.filter((s) => s.ex === ex && !s.timed)
  if (!v.length) return null
  return v.reduce((a, s) => (e1rm(s.kg, s.reps) > e1rm(a.kg, a.reps) ? s : a))
}

// Record battuti in una sessione: e1rm di oggi supera il miglior giorno precedente
export function prsForSession(log: SetLog[], date: string) {
  const exs = [...new Set(log.filter((s) => s.date === date).map((s) => s.ex))]
  return exs.filter((ex) => {
    const prev = dates(log, ex).filter((d) => d < date)
    const prevBest = prev.length ? Math.max(...prev.map((d) => sessE1(log, ex, d))) : 0
    return prevBest > 0 && sessE1(log, ex, date) > prevBest + 0.01
  })
}

// Stima grezza delle calorie di una seduta di pesi: MET ~4.5 (sforzo intermittente, molto recupero)
// per il peso corporeo e la durata. È una prima approssimazione onesta; l'IA (#14) la raffinerà con più dati.
// ponytail: solo durata × peso; se serve, poi si pesa anche l'intensità (RPE, densità del tonnellaggio).
export function stimaCalorie(durataSec: number, pesoCorporeoKg: number): number {
  const ore = Math.max(0, durataSec) / 3600
  return Math.round(4.5 * (pesoCorporeoKg || 75) * ore)
}

// Riepilogo di una sessione: tonnellaggio, RPE medio, serie
export function sessionSummary(log: SetLog[], date: string) {
  const sets = log.filter((s) => s.date === date)
  const tonnage = volume(sets)
  const rpes = sets.filter((s) => s.rpe != null).map((s) => s.rpe as number)
  const avg = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 0
  return { sets: sets.length, tonnage, avgRpe: avg }
}

// Verdetto settimanale: scarico consigliato se un esercizio accumula fatica
export function weeklyReport(s: State) {
  const exes = [...new Set(s.log.map((l) => l.ex))]
  const flags = exes.map((ex) => ({ ex, d: rpeDelta(s.log, ex) })).filter((x) => x.d >= 1)
  return { scarico: flags.length > 0, flags }
}

export const nutritionToday = (meals: Meal[], date: string) =>
  meals.filter((m) => m.date === date).reduce(
    (a, m) => ({ kcal: a.kcal + (m.kcal || 0), protein: a.protein + (m.protein || 0), carbs: a.carbs + (m.carbs || 0), fat: a.fat + (m.fat || 0) }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 })

// --- Alimentazione: tipi pasto e archivio alimenti (valori per 100 g) ---
export const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'colazione', label: 'Colazione' }, { key: 'pranzo', label: 'Pranzo' },
  { key: 'cena', label: 'Cena' }, { key: 'spuntino', label: 'Spuntini' },
]
export const FOOD_CATS = ['Proteine', 'Carbo', 'Frutta/Verdura', 'Latticini', 'Grassi']
const mkFoods = (cat: string, rows: [string, number, number, number, number][]): Food[] =>
  rows.map(([name, kcal, protein, carbs, fat]) => ({ name, cat, kcal, protein, carbs, fat }))
export const FOODS: Food[] = [
  ...mkFoods('Proteine', [
    ['Petto di pollo', 165, 31, 0, 3.6], ['Fesa di tacchino', 135, 29, 0, 1.5], ['Uovo', 155, 13, 1.1, 11],
    ['Albume', 52, 11, 0.7, 0.2], ['Tonno al naturale', 116, 26, 0, 1], ['Salmone', 208, 20, 0, 13],
    ['Merluzzo', 82, 18, 0, 0.7], ['Manzo magro', 187, 26, 0, 9], ['Bresaola', 151, 32, 0, 2],
    ['Prosciutto cotto', 145, 20, 1, 6], ['Proteine whey', 400, 80, 8, 6],
  ]),
  ...mkFoods('Carbo', [
    ['Riso bianco cotto', 130, 2.7, 28, 0.3], ['Pasta cotta', 158, 5.8, 31, 0.9], ['Pane', 265, 9, 49, 3.2],
    ['Avena', 389, 17, 66, 7], ['Patate', 77, 2, 17, 0.1], ['Fagioli cotti', 127, 8.7, 22, 0.5],
    ['Lenticchie cotte', 116, 9, 20, 0.4], ['Ceci cotti', 164, 8.9, 27, 2.6], ['Pizza margherita', 266, 11, 33, 10],
    ['Miele', 304, 0.3, 82, 0],
  ]),
  ...mkFoods('Frutta/Verdura', [
    ['Banana', 89, 1.1, 23, 0.3], ['Mela', 52, 0.3, 14, 0.2], ['Pomodoro', 18, 0.9, 3.9, 0.2],
    ['Insalata', 15, 1.4, 2.9, 0.2], ['Zucchine', 17, 1.2, 3.1, 0.3], ['Broccoli', 34, 2.8, 7, 0.4],
  ]),
  ...mkFoods('Latticini', [
    ['Latte p.s.', 46, 3.4, 4.8, 1.5], ['Yogurt greco', 97, 9, 3.6, 5], ['Skyr', 63, 11, 4, 0.2],
    ['Parmigiano', 431, 38, 4, 29], ['Mozzarella', 253, 18, 3, 19],
  ]),
  ...mkFoods('Grassi', [
    ['Olio d\'oliva', 884, 0, 0, 100], ['Burro d\'arachidi', 588, 25, 20, 50], ['Mandorle', 579, 21, 22, 49],
    ['Cioccolato fondente', 546, 4.9, 61, 31], ['Avocado', 160, 2, 9, 15],
  ]),
]
// Meal calcolato da un alimento su una quantità in grammi
export const mealFromFood = (f: Food, grams: number, type: MealType): Meal => ({
  date: today(), type, name: f.name, grams,
  kcal: Math.round(f.kcal * grams / 100),
  protein: Math.round(f.protein * grams / 10) / 10,
  carbs: Math.round(f.carbs * grams / 10) / 10,
  fat: Math.round(f.fat * grams / 10) / 10,
})

// Cerca un prodotto per codice a barre su OpenFoodFacts (database aperto, senza chiave)
export async function fetchFoodByBarcode(code: string): Promise<Food | null> {
  const c = code.replace(/\D/g, '')
  if (!c) return null
  const url = `https://world.openfoodfacts.org/api/v2/product/${c}.json?fields=product_name,product_name_it,brands,nutriments`
  const r = await fetch(url)
  if (!r.ok) return null
  const j = await r.json()
  if (j.status !== 1 || !j.product) return null
  return offToFood({ ...j.product, product_name: j.product.product_name || 'Prodotto' })
}

// Mappa un prodotto OpenFoodFacts nel nostro Food (valori per 100 g)
function offToFood(p: Record<string, unknown>): Food | null {
  const n = (p.nutriments as Record<string, number>) || {}
  const r1 = (x: number) => Math.round((x || 0) * 10) / 10
  const kcal = n['energy-kcal_100g'] ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : 0)
  const nm = (p.product_name_it as string) || (p.product_name as string)
  if (!nm || !kcal) return null
  const brand = p.brands ? String(p.brands).split(',')[0].trim() : ''
  return {
    name: brand && !nm.toLowerCase().includes(brand.toLowerCase()) ? `${nm} · ${brand}` : nm,
    cat: 'Altro', kcal: Math.round(kcal), protein: r1(n.proteins_100g), carbs: r1(n.carbohydrates_100g), fat: r1(n.fat_100g),
  }
}

// Cerca alimenti per nome su OpenFoodFacts (es. "nutella" -> prodotti reali).
// La ricerca full-text di OFF non manda header CORS, quindi la instradiamo via proxy.
// ponytail: proxy pubblico come stopgap; un piccolo worker proprio è l'upgrade se serve affidabilità.
export async function searchFoods(term: string): Promise<Food[]> {
  const off = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,product_name_it,brands,nutriments`
  const r = await fetch('https://corsproxy.io/?url=' + encodeURIComponent(off))
  if (!r.ok) return []
  const j = await r.json()
  const out: Food[] = []
  for (const p of (j.products ?? [])) { const f = offToFood(p); if (f) out.push(f) }
  return out.filter((f, i) => out.findIndex((x) => x.name === f.name) === i).slice(0, 15)
}

// Trova un alimento per nome (esatto o parziale), fra archivio + personalizzati
export function foodLookup(name: string, extra: Food[] = []): Food | null {
  const all = [...FOODS, ...extra]
  const n = name.toLowerCase().trim()
  return all.find((f) => f.name.toLowerCase() === n)
    || all.find((f) => f.name.toLowerCase().includes(n) || n.includes(f.name.toLowerCase()))
    || null
}

// --- Piani alimentari: import da testo/JSON (la stessa struttura che l'IA produrrà) ---
export type PlanFood = { name: string; grams: number }
export type MealPlan = { name: string; slots: { type: MealType; items: PlanFood[] }[] }

export function planItemToMeal(item: PlanFood, type: MealType, extra: Food[] = []): Meal {
  const f = foodLookup(item.name, extra)
  return f ? mealFromFood(f, item.grams, type)
    : { date: today(), type, name: item.name, grams: item.grams, kcal: 0, protein: 0, carbs: 0, fat: 0 }
}

const mealTypeOf = (s: string): MealType | null => {
  const l = s.toLowerCase()
  if (/colaz|breakfast/.test(l)) return 'colazione'
  if (/pranz|lunch/.test(l)) return 'pranzo'
  if (/cena|dinner/.test(l)) return 'cena'
  if (/spunt|merend|snack/.test(l)) return 'spuntino'
  return null
}
// Parser piano: righe come "Colazione: Avena 80g, Uova 100g" oppure JSON dell'app
export function parseMealPlan(text: string): MealPlan | null {
  const t = text.trim(); if (!t) return null
  if (t[0] === '{' || t[0] === '[') {
    try { const j = JSON.parse(t); const p = Array.isArray(j) ? j[0] : j; if (p?.slots?.length) return p as MealPlan } catch { /* non JSON */ }
  }
  let name = 'Piano importato'
  const slots: MealPlan['slots'] = []
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue
    if (/^#/.test(line)) { name = line.replace(/^#+\s*/, ''); continue }
    const m = line.match(/^(.+?)\s*[:\-–]\s*(.+)$/)
    if (!m) continue
    const type = mealTypeOf(m[1]); if (!type) continue
    const items = m[2].split(/[,;]+/).map((x) => x.trim()).filter(Boolean).map((part) => {
      const gm = part.match(/(\d+(?:[.,]\d+)?)\s*g\b/i) || part.match(/(\d+(?:[.,]\d+)?)\s*$/)
      const grams = gm ? Math.round(parseFloat(gm[1].replace(',', '.'))) : 100
      const nm = part.replace(/\d+(?:[.,]\d+)?\s*g?\b/ig, '').replace(/[·\-–—:]+$/, '').trim()
      return { name: nm || part, grams }
    })
    if (items.length) slots.push({ type, items })
  }
  return slots.length ? { name, slots } : null
}

// Volume per gruppo muscolare (serie allenanti negli ultimi N giorni)
export function muscleVolume(s: State, days = 7): Record<string, number> {
  const t = new Date(); t.setDate(t.getDate() - days)
  const since = t.toISOString().slice(0, 10)
  const byEx: Record<string, string> = {}
  for (const it of allItems(s)) byEx[it.ex] = it.muscle
  for (const e of EXERCISES) if (!byEx[e.name]) byEx[e.name] = e.muscle
  const map: Record<string, number> = {}
  for (const l of s.log) if (l.date > since) {
    const m = byEx[l.ex] || 'Altro'
    map[m] = (map[m] || 0) + 1
  }
  return map
}

// Idratazione: obiettivo dinamico, più alto nei giorni di allenamento
export const waterToday = (w: Water[], date: string) =>
  w.filter((x) => x.date === date).reduce((a, x) => a + x.ml, 0)
export function waterGoal(s: State) {
  return (s.target.water ?? 2500) + (s.log.some((l) => l.date === today()) ? 700 : 0)
}

// Adattamento dinamico: taglia la seduta se hai poco tempo
export function adaptSession(items: PlanItem[], minutes: number): PlanItem[] {
  if (minutes >= 60) return items.map((p) => ({ ...p }))
  const keep = minutes >= 45 ? items.length : Math.max(1, Math.ceil(items.length * 0.6))
  const cut = minutes >= 45 ? 1 : 2
  return items.slice(0, keep).map((p) => p.scheme
    ? { ...p, scheme: p.scheme.slice(0, Math.max(2, p.scheme.length - cut)) }
    : { ...p, sets: Math.max(2, p.sets - cut) })
}

// --- Tipi di serie e schemi personalizzati ---
export const SET_TYPES: { key: SetType; label: string; abbr: string }[] = [
  { key: 'normal', label: 'Normale', abbr: 'N' },
  { key: 'warmup', label: 'Riscaldamento', abbr: 'W' },
  { key: 'ramp', label: 'Ramping', abbr: 'R' },
  { key: 'backoff', label: 'Back-off', abbr: 'B' },
  { key: 'drop', label: 'Drop set', abbr: 'D' },
  { key: 'amrap', label: 'AMRAP', abbr: 'A' },
  { key: 'failure', label: 'Cedimento', abbr: 'F' },
]
export const setTypeLabel = (k: SetType) => SET_TYPES.find((t) => t.key === k)?.label ?? k

export const itemSetCount = (it: PlanItem) => it.scheme?.length ?? it.sets
// ripetizioni rappresentative per la proposta carico (salta i riscaldamenti)
export const itemReps = (it: PlanItem) => {
  if (!it.scheme) return it.reps
  const work = it.scheme.find((x) => x.type !== 'warmup') ?? it.scheme[0]
  return parseInt(work.reps, 10) || it.reps || 8
}
export function schemeSummary(it: PlanItem) {
  if (!it.scheme) return `${it.sets} × ${it.reps}`
  return it.scheme.map((x) => x.reps).join(' / ')
}
export function schemeTag(it: PlanItem) {
  if (!it.scheme) return null
  const special = it.scheme.find((x) => x.type !== 'normal' && x.type !== 'warmup')
  return special ? setTypeLabel(special.type) : 'Personalizzata'
}
// Preset che compilano le serie in un tocco
export function makePreset(kind: string, base: number): SetSpec[] {
  const r = String(base || 8)
  switch (kind) {
    case 'ramping': return [
      { type: 'warmup', reps: String(base + 4), load: '@50%' },
      { type: 'ramp', reps: r, load: '@70%' },
      { type: 'ramp', reps: r, load: '@80%' },
      { type: 'ramp', reps: r, load: '@90% top' },
    ]
    case 'backoff': return [
      { type: 'ramp', reps: r, load: 'top set' },
      { type: 'backoff', reps: String(base + 2), load: '@85%' },
      { type: 'backoff', reps: String(base + 2), load: '@85%' },
      { type: 'backoff', reps: String(base + 2), load: '@85%' },
    ]
    case 'pyramid': return [
      { type: 'normal', reps: r, load: '@100%' },
      { type: 'normal', reps: String(base + 2), load: '@90%' },
      { type: 'normal', reps: String(base + 4), load: '@80%' },
    ]
    case 'drop': return [
      { type: 'normal', reps: r },
      { type: 'normal', reps: r },
      { type: 'drop', reps: 'max', load: '-20%' },
    ]
    default: return [{ type: 'normal', reps: r }]
  }
}

// Gamification: streak, livello, badge, tonnellaggio
export function streak(log: SetLog[]) {
  const days = new Set(log.map((l) => l.date))
  const d = new Date()
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1) }
  return n
}
export const totalWorkouts = (log: SetLog[]) => new Set(log.map((l) => l.date)).size
export const totalTonnage = volume
export function level(log: SetLog[]) {
  const t = totalWorkouts(log)
  return { n: Math.floor(t / 5) + 1, into: t % 5, need: 5 }
}
export function badges(s: State) {
  const tw = totalWorkouts(s.log), ton = totalTonnage(s.log), st = streak(s.log)
  return [
    { name: '10 sessioni', icon: '✓', got: tw >= 10 },
    { name: '50 sessioni', icon: '✓✓', got: tw >= 50 },
    { name: 'Club 100 kg panca', icon: '🏋', got: bestE1(s.log, 'Panca piana') >= 100 },
    { name: '7 giorni di fila', icon: '🔥', got: st >= 7 },
    { name: '50 t sollevate', icon: '⚡', got: ton >= 50000 },
    { name: 'Primo record', icon: '★', got: s.log.length > 0 },
  ]
}

export const historyDates = dates
export const sessionE1rm = sessE1
export const bestE1rm = bestE1
export const avgRpeOf = avgRpe

// --- Archivio esercizi (il "database" da cui pescare) ---
export const MUSCLES = ['Petto', 'Dorso', 'Spalle', 'Bicipiti', 'Tricipiti', 'Gambe', 'Glutei', 'Core', 'Polpacci']
export const EXERCISES: Exercise[] = [
  ...['Panca piana', 'Panca inclinata', 'Panca declinata', 'Panca manubri', 'Panca presa stretta', 'Panca Larsen',
    'Croci ai cavi', 'Croci con manubri', 'Croci inclinata manubri', 'Pec deck', 'Chest press', 'Dip zavorrate', 'Piegamenti'].map((name) => ({ name, muscle: 'Petto' })),
  ...['Trazioni', 'Trazioni presa neutra', 'Lat machine', 'Lat machine presa neutra', 'Pulldown braccia tese',
    'Rematore bilanciere', 'Rematore manubrio', 'Rematore T-bar', 'Rematore seduto ai cavi', 'Pulley basso',
    'Stacco da terra', 'Stacco sumo', 'Pullover', 'Shrug', 'Iperestensioni'].map((name) => ({ name, muscle: 'Dorso' })),
  ...['Military press', 'Lento avanti', 'Lento dietro', 'Shoulder press', 'Alzate laterali', 'Alzate laterali ai cavi',
    'Alzate frontali', 'Alzate posteriori', 'Face pull', 'Arnold press', 'Tirate al mento'].map((name) => ({ name, muscle: 'Spalle' })),
  ...['Curl bilanciere', 'Curl manubri', 'Curl a martello', 'Curl a martello ai cavi', 'Curl ai cavi',
    'Curl concentrato', 'Curl panca inclinata', 'Spider curl', 'Panca Scott'].map((name) => ({ name, muscle: 'Bicipiti' })),
  ...['French press', 'Push down', 'Push down corda', 'Push down presa inversa', 'Dip alle parallele',
    'Estensioni sopra la testa', 'Estensioni ai cavi dietro la testa', 'Kickback'].map((name) => ({ name, muscle: 'Tricipiti' })),
  ...['Squat', 'Squat frontale', 'Goblet squat', 'Box squat', 'Sissy squat', 'Leg press', 'Affondi', 'Affondi camminati',
    'Leg extension', 'Leg curl', 'Hack squat', 'Stacco rumeno', 'Good morning', 'Adduttori alla macchina', 'Abduttori alla macchina'].map((name) => ({ name, muscle: 'Gambe' })),
  ...['Hip thrust', 'Ponte glutei', 'Kickback ai cavi', 'Slanci'].map((name) => ({ name, muscle: 'Glutei' })),
  ...['Plank', 'Plank zavorrato', 'Side plank', 'Copenhagen plank', 'Crunch', 'Cable crunch', 'Russian twist',
    'Leg raise', 'Hanging leg raise', 'Dead bug', 'Ab wheel'].map((name) => ({ name, muscle: 'Core' })),
  ...['Calf in piedi', 'Calf da seduto', 'Calf alla pressa'].map((name) => ({ name, muscle: 'Polpacci' })),
]

export function lookupMuscle(name: string) {
  const n = name.toLowerCase().trim()
  const hit = EXERCISES.find((e) => e.name.toLowerCase() === n)
    || EXERCISES.find((e) => n.includes(e.name.toLowerCase()) || e.name.toLowerCase().includes(n))
  return hit?.muscle ?? 'Altro'
}

// Parser import: testo semplice ("Giorno: Push A" + "Panca piana 4x8") o JSON dell'app.
// È la stessa struttura che l'IA produrrà da foto/PDF quando collegheremo l'API.
export function parseScheda(text: string): Scheda | null {
  const t = text.trim()
  if (!t) return null
  if (t[0] === '{' || t[0] === '[') {
    try {
      const j = JSON.parse(t)
      const sc = Array.isArray(j) ? j[0] : j
      if (sc?.days?.length) return sc as Scheda
    } catch { /* non è JSON valido, provo il testo */ }
  }
  const days: Day[] = []
  let name = 'Scheda importata'
  let cur: Day | null = null
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^#/.test(line)) { name = line.replace(/^#+\s*/, ''); continue }
    const dm = line.match(/^(?:giorno|day|gg)\s*:?\s*(.+)/i)
    if (dm) { cur = { name: dm[1].trim(), items: [] }; days.push(cur); continue }
    const em = line.match(/^(.+?)\s+(\d+)\s*[x×]\s*(\d+)/i)
    if (em) {
      if (!cur) { cur = { name: 'Giorno 1', items: [] }; days.push(cur) }
      const ex = em[1].replace(/[-–—:]+$/, '').trim()
      cur.items.push({ ex, sets: +em[2], reps: +em[3], rest: 120, muscle: lookupMuscle(ex) })
    }
  }
  return days.length ? { name, days } : null
}

// ponytail: self-check in dev, gira nella console del browser all'avvio.
if (import.meta.env.DEV) {
  console.assert(Math.abs(e1rm(80, 8) - 101.33) < 0.1, 'e1rm')
  console.assert(round25(78.9) === 80 && round25(76) === 75, 'round25')
  const s = seed()
  console.assert(rpeDelta(s.log, 'Panca piana') > 0.9, 'la fatica accumulata deve emergere')
  console.assert((proposta(s, 'Panca piana', 8)?.kg ?? 0) < 80, 'peso proposto ridotto per fatica')
  console.assert(weeklyReport(s).scarico, 'con accumulo il report deve consigliare scarico')
  const p = parseScheda('Giorno: Push\nPanca piana 4x8\nAlzate laterali 3x15')
  console.assert(p?.days[0].items.length === 2 && p.days[0].items[1].muscle === 'Spalle', 'parser scheda')
  const ramp = makePreset('ramping', 5)
  console.assert(ramp.length === 4 && ramp[0].type === 'warmup', 'preset ramping')
  const mp = parseMealPlan('Colazione: Avena 80g, Uova 100g\nCena: Salmone 150g')
  console.assert(mp?.slots.length === 2 && mp.slots[0].items[0].grams === 80, 'parser piano alimentare')
  console.assert(planItemToMeal({ name: 'Salmone', grams: 200 }, 'cena').kcal === 416, 'plan item -> meal con macro')
  console.assert(itemReps({ ex: 'x', sets: 4, reps: 8, rest: 0, muscle: '', scheme: ramp }) === 5, 'itemReps salta il warmup')
}

// Stato vuoto: nuovo utente, nessun dato demo. Le cose le crea l'utente.
export function emptyState(): State {
  return {
    schede: [], activeScheda: 0, activeDay: 0,
    customExercises: [], extras: [], sessionEx: [], exVideo: {}, refMax: {},
    checkin: { date: '', sonno: 7, energia: 7, doms: 3, stress: 3, ore: 7.5 },
    checkins: [], log: [],
    meals: [], customFoods: [],
    target: { kcal: 2600, protein: 170, carbs: 280, fat: 80, water: 2500 },
    mealPlan: null,
    body: [], goal: { ex: 'Panca piana', targetKg: 100 }, water: [],
    settings: { sound: true, vibrate: true },
  }
}

// Dati di esempio: 3 settimane di panca con RPE che sale = accumulo visibile
export function seed(): State {
  const d = (n: number) => {
    const t = new Date()
    t.setDate(t.getDate() - n)
    return t.toISOString().slice(0, 10)
  }
  const mk = (date: string, ex: string, kg: number, reps: number[], rpes: number[]): SetLog[] =>
    reps.map((r, i) => ({ date, ex, kg, reps: r, rpe: rpes[i] }))
  const it = (ex: string, sets: number, reps: number, rest: number): PlanItem =>
    ({ ex, sets, reps, rest, muscle: lookupMuscle(ex) })
  return {
    schede: [{
      name: 'Push / Pull',
      days: [
        { name: 'Push A', items: [it('Panca piana', 4, 8, 150), it('Military press', 4, 10, 120), it('Dip zavorrate', 3, 8, 120)] },
        { name: 'Pull A', items: [it('Trazioni', 4, 8, 150), it('Rematore bilanciere', 4, 10, 120), it('Curl bilanciere', 3, 12, 90)] },
      ],
    }],
    activeScheda: 0, activeDay: 0,
    customExercises: [], extras: [], sessionEx: [], exVideo: {}, refMax: {},
    checkin: { date: '', sonno: 7, energia: 7, doms: 3, stress: 3, ore: 7.5 },
    checkins: [
      { date: d(16), sonno: 8, energia: 8, doms: 2, stress: 2 },
      { date: d(9), sonno: 7, energia: 7, doms: 3, stress: 2 },
      { date: d(2), sonno: 6, energia: 6, doms: 5, stress: 4 },
    ],
    log: [
      ...mk(d(16), 'Panca piana', 80, [8, 8, 8, 8], [7, 7.5, 7.5, 8]),
      ...mk(d(9), 'Panca piana', 80, [8, 8, 8, 7], [7.5, 8, 8.5, 9]),
      ...mk(d(2), 'Panca piana', 80, [8, 8, 7, 6], [8, 8.5, 9, 9]),
      ...mk(d(9), 'Military press', 38, [10, 10, 10, 9], [7, 7.5, 8, 8]),
      ...mk(d(2), 'Military press', 38, [10, 10, 9, 9], [7.5, 8, 8, 8.5]),
    ],
    meals: [
      { date: today(), type: 'colazione', name: 'Avena e uova', kcal: 520, protein: 34, carbs: 55, fat: 18 },
      { date: today(), type: 'pranzo', name: 'Riso e pollo', kcal: 780, protein: 62, carbs: 95, fat: 14 },
    ],
    customFoods: [],
    target: { kcal: 2600, protein: 170, carbs: 280, fat: 80, water: 2500 },
    mealPlan: null,
    body: [
      { date: d(56), kg: 77.2 }, { date: d(42), kg: 77.6 }, { date: d(28), kg: 77.9 },
      { date: d(14), kg: 78.1 }, { date: today(), kg: 78.4 },
    ],
    goal: { ex: 'Panca piana', targetKg: 110 },
    water: [{ date: today(), ml: 1500 }],
    settings: { sound: true, vibrate: true },
  }
}
