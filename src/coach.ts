// Motore del coach: logica pura, zero UI. Tutto deterministico.

export type SetLog = { date: string; ex: string; kg: number; reps: number; rpe: number | null }
export type SetType = 'normal' | 'warmup' | 'ramp' | 'backoff' | 'drop' | 'amrap' | 'failure'
export type SetSpec = { type: SetType; reps: string; load?: string }
export type PlanItem = { ex: string; sets: number; reps: number; rest: number; muscle: string; note?: string; scheme?: SetSpec[] }
export type Day = { name: string; items: PlanItem[] }
export type Scheda = { name: string; days: Day[] }
export type Checkin = { date: string; sonno: number; energia: number; doms: number; stress: number }
export type Meal = { date: string; name: string; kcal: number; protein: number }
export type BodyLog = { date: string; kg: number }
export type Goal = { ex: string; targetKg: number }
export type Water = { date: string; ml: number }
export type Exercise = { name: string; muscle: string }
export type State = {
  schede: Scheda[]; activeScheda: number; activeDay: number
  customExercises: Exercise[]
  extras: { date: string; item: PlanItem }[]
  checkin: Checkin; checkins: Checkin[]; log: SetLog[]
  meals: Meal[]; target: { kcal: number; protein: number }
  body: BodyLog[]; goal: Goal; water: Water[]
}

export const today = () => new Date().toISOString().slice(0, 10)
export const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',')

// --- Schede: scheda e giorno attivi, esercizi correnti ---
export const curScheda = (s: State) => s.schede[s.activeScheda] ?? s.schede[0]
export const curDay = (s: State) => { const sc = curScheda(s); return sc?.days[s.activeDay] ?? sc?.days[0] }
export const curItems = (s: State) => curDay(s)?.items ?? []
export const allItems = (s: State) => s.schede.flatMap((sc) => sc.days.flatMap((d) => d.items))

// 1RM stimato (Epley) e arrotondamento al disco da 2,5 kg
export const e1rm = (kg: number, reps: number) => kg * (1 + reps / 30)
export const round25 = (x: number) => Math.round(x / 2.5) * 2.5

const dates = (log: SetLog[], ex: string) =>
  [...new Set(log.filter((s) => s.ex === ex).map((s) => s.date))].sort()

const sessE1 = (log: SetLog[], ex: string, date: string) =>
  Math.max(...log.filter((s) => s.ex === ex && s.date === date).map((s) => e1rm(s.kg, s.reps)))

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
  const v = log.filter((s) => s.ex === ex)
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

// Riepilogo di una sessione: tonnellaggio, RPE medio, serie
export function sessionSummary(log: SetLog[], date: string) {
  const sets = log.filter((s) => s.date === date)
  const tonnage = sets.reduce((a, s) => a + s.kg * s.reps, 0)
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
    (a, m) => ({ kcal: a.kcal + m.kcal, protein: a.protein + m.protein }), { kcal: 0, protein: 0 })

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
  return 2500 + (s.log.some((l) => l.date === today()) ? 700 : 0)
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
export const totalTonnage = (log: SetLog[]) => log.reduce((a, l) => a + l.kg * l.reps, 0)
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
  ...['Panca piana', 'Panca inclinata', 'Panca manubri', 'Croci ai cavi', 'Chest press', 'Dip zavorrate', 'Piegamenti'].map((name) => ({ name, muscle: 'Petto' })),
  ...['Trazioni', 'Lat machine', 'Rematore bilanciere', 'Rematore manubrio', 'Pulley basso', 'Stacco da terra', 'Pullover'].map((name) => ({ name, muscle: 'Dorso' })),
  ...['Military press', 'Lento avanti', 'Alzate laterali', 'Alzate frontali', 'Alzate posteriori', 'Arnold press', 'Tirate al mento'].map((name) => ({ name, muscle: 'Spalle' })),
  ...['Curl bilanciere', 'Curl manubri', 'Curl a martello', 'Curl ai cavi', 'Panca Scott'].map((name) => ({ name, muscle: 'Bicipiti' })),
  ...['French press', 'Push down', 'Dip alle parallele', 'Estensioni sopra la testa', 'Kickback'].map((name) => ({ name, muscle: 'Tricipiti' })),
  ...['Squat', 'Squat frontale', 'Leg press', 'Affondi', 'Leg extension', 'Leg curl', 'Hack squat', 'Stacco rumeno'].map((name) => ({ name, muscle: 'Gambe' })),
  ...['Hip thrust', 'Ponte glutei', 'Slanci'].map((name) => ({ name, muscle: 'Glutei' })),
  ...['Plank', 'Crunch', 'Russian twist', 'Leg raise', 'Ab wheel'].map((name) => ({ name, muscle: 'Core' })),
  ...['Calf in piedi', 'Calf da seduto'].map((name) => ({ name, muscle: 'Polpacci' })),
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
  console.assert(itemReps({ ex: 'x', sets: 4, reps: 8, rest: 0, muscle: '', scheme: ramp }) === 5, 'itemReps salta il warmup')
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
    customExercises: [], extras: [],
    checkin: { date: '', sonno: 7, energia: 7, doms: 3, stress: 3 },
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
      { date: today(), name: 'Colazione — avena, uova', kcal: 520, protein: 34 },
      { date: today(), name: 'Pranzo — riso, pollo', kcal: 780, protein: 62 },
    ],
    target: { kcal: 2600, protein: 170 },
    body: [
      { date: d(56), kg: 77.2 }, { date: d(42), kg: 77.6 }, { date: d(28), kg: 77.9 },
      { date: d(14), kg: 78.1 }, { date: today(), kg: 78.4 },
    ],
    goal: { ex: 'Panca piana', targetKg: 110 },
    water: [{ date: today(), ml: 1500 }],
  }
}
