import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  type State, type Scheda, type PlanItem, today, fmt, proposta, readiness, readinessOn, rpeDelta,
  historyDates, sessionE1rm, bestE1rm, avgRpeOf, record,
  prsForSession, sessionSummary, weeklyReport, nutritionToday, emptyState,
  muscleVolume, waterToday, waterGoal, adaptSession,
  streak, level, badges, totalWorkouts, totalTonnage,
  curScheda, curDay, curItems, allItems, MUSCLES, EXERCISES, lookupMuscle, parseScheda,
  type SetType, type SetSpec, SET_TYPES, setTypeLabel, itemReps, itemSetCount, schemeSummary, schemeTag, makePreset,
  type MealType, type Food, MEAL_TYPES, FOOD_CATS, FOODS, mealFromFood,
  foodLookup, planItemToMeal, parseMealPlan, fetchFoodByBarcode, searchFoods,
} from './coach'
import { DialogHost, confirmDlg, promptDlg, toast } from './dialog'
import { supa } from './data/client'
import { serieLoggata, serieRimossa, sessioneChiusa, pending, cloudState, checkinSalvato, pesoSalvato, acquaSalvata, pastiOggiAggiornati, configSalvata, pullAll, flush } from './data/sync'

// Colore per gruppo muscolare: la scheda si legge a colpo d'occhio
const MCOLOR: Record<string, string> = {
  Petto: '#FB6F84', Dorso: '#63A6F5', Spalle: '#F5B84A', Bicipiti: '#A78BFA',
  Tricipiti: '#F472B6', Gambe: '#31E0B4', Glutei: '#FF9A62', Core: '#8BD450', Polpacci: '#9AA7B5',
}
const mcolor = (m: string) => MCOLOR[m] ?? '#7E8A9A'

// Audio fine recupero: il contesto va creato da un gesto utente (il ✓), poi riusato
let actx: AudioContext | null = null
const ensureAudio = () => { try { actx ??= new AudioContext(); if (actx.state === 'suspended') actx.resume() } catch { /* niente audio */ } }
function beep() {
  if (!actx) return
  try {
    const t = actx.currentTime
    for (const [f, at] of [[880, 0], [1175, 0.22]] as const) {
      const o = actx.createOscillator(), g = actx.createGain()
      o.connect(g); g.connect(actx.destination)
      o.frequency.value = f
      g.gain.setValueAtTime(0.001, t + at)
      g.gain.exponentialRampToValueAtTime(0.2, t + at + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, t + at + 0.3)
      o.start(t + at); o.stop(t + at + 0.32)
    }
  } catch { /* niente audio */ }
}

// Evento install catturato a livello modulo: può arrivare prima del mount di React
let installEvt: { prompt: () => void; userChoice: Promise<unknown> } | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installEvt = e as unknown as typeof installEvt
  window.dispatchEvent(new Event('carico-installable'))
})

// Ingranaggio (feather "settings"): icona pulita, riusata in Allena e Profilo
const Gear = ({ size = 20 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size}
    style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', display: 'block' }}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

// Icone del menu esercizio: stroke pulito, stesso stile di Icon/Gear
const MenuIcon = ({ t }: { t: 'swap' | 'reorder' | 'link' }) => {
  const p: Record<string, string[]> = {
    swap: ['M16 3l4 4-4 4', 'M20 7H9', 'M8 21l-4-4 4-4', 'M4 17h11'],
    reorder: ['M8 6v13', 'M5 9l3-3 3 3', 'M16 18V5', 'M13 15l3 3 3-3'],
    link: ['M9 12h6', 'M9 8H7a4 4 0 0 0 0 8h2', 'M15 8h2a4 4 0 0 1 0 8h-2'],
  }
  return <svg viewBox="0 0 24 24" className="misvg">{p[t].map((d, i) => <path key={i} d={d} />)}</svg>
}
const Clock = () => (
  <svg viewBox="0 0 24 24" className="misvg" style={{ width: 15, height: 15 }}>
    <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 1.9" />
  </svg>
)

const LS = 'carico-v1'
let cloudNudged = false // un solo avviso di stato cloud per caricamento pagina
const wasFresh = !localStorage.getItem(LS) // all'avvio non c'è dato locale: device nuovo, si può ripristinare dal cloud

// Ricostruisce lo State locale dai dati scaricati dal cloud (gli eventi vincono sul seed).
function statoDaCloud(cloud: NonNullable<Awaited<ReturnType<typeof pullAll>>>): State {
  const base = emptyState()
  return {
    ...base, ...(cloud.dati ?? {}),
    log: cloud.log, checkins: cloud.checkins,
    checkin: cloud.checkins.find((c) => c.date === today()) ?? base.checkin,
    meals: cloud.meals, body: cloud.body, water: cloud.water,
  } as State
}
function load(): State {
  try {
    const raw = localStorage.getItem(LS)
    if (raw) {
      const p = JSON.parse(raw)
      // migrazione: vecchio salvataggio con `plan` piatto -> una scheda con un giorno
      if (p.plan && !p.schede) {
        p.schede = [{ name: 'La mia scheda', days: [{ name: 'Giorno 1', items: p.plan }] }]
        p.activeScheda = 0; p.activeDay = 0; delete p.plan
      }
      const base = emptyState()
      const m = { ...base, ...p } // i campi nuovi ereditano i default
      m.target = { ...base.target, ...(p.target ?? {}) } // carbo/grassi per i salvataggi vecchi
      m.settings = { ...base.settings, ...(p.settings ?? {}) }
      return m
    }
  } catch { /* storage non disponibile */ }
  return emptyState()
}

type Tab = 'oggi' | 'schede' | 'allena' | 'cibo' | 'coach' | 'profilo'
const TABS: Tab[] = ['oggi', 'schede', 'allena', 'cibo', 'coach', 'profilo']

const muscleOf = (s: State, ex: string) =>
  [...EXERCISES, ...s.customExercises].find((e) => e.name === ex)?.muscle ?? lookupMuscle(ex)

const rColor = (r: number) => (r >= 80 ? 'var(--teal)' : r >= 65 ? 'var(--amber)' : 'var(--coral)')

// Ogni cambio di schermata (tab o vista interna) riparte dall'inizio, senza flash
const useTop = (dep: unknown) => { useLayoutEffect(() => { window.scrollTo(0, 0) }, [dep]) }

export default function App() {
  const [s, setS] = useState<State>(load)
  const [tab, setTab] = useState<Tab>('oggi')
  const [kbOpen, setKbOpen] = useState(false) // tastiera mobile aperta: nascondo la navbar fixed
  // Login obbligatorio: authed dalla sessione Supabase (nessuna modalità locale).
  const [authed, setAuthed] = useState<boolean | null>(supa ? null : false)
  const [synced, setSynced] = useState(false) // decisione pull/push al login completata
  const sRef = useRef(s); sRef.current = s
  useEffect(() => {
    if (!supa) return
    supa.auth.getSession().then(({ data }) => setAuthed(!!data.session))
    const { data: sub } = supa.auth.onAuthStateChange((_e, s2) => { setAuthed(!!s2); if (!s2) setSynced(false) })
    return () => sub.subscription.unsubscribe()
  }, [])
  // Al login, una volta sola: device nuovo con dati nel cloud -> ripristino; altrimenti il locale è la
  // verità e lo carico nel cloud. Prima svuoto la coda così non perdo eventuali modifiche locali in sospeso.
  useEffect(() => {
    if (!supa || authed !== true || synced) return
    let cancel = false
    ;(async () => {
      try {
        const uid = (await supa!.auth.getSession()).data.session?.user.id
        if (!uid || cancel) return
        await flush()
        const cloud = await pullAll(uid)
        if (cancel || !cloud) return
        const hasCloud = !!cloud.dati || cloud.log.length > 0 || cloud.checkins.length > 0 || cloud.meals.length > 0 || cloud.body.length > 0 || cloud.water.length > 0
        if (wasFresh && hasCloud) setS(statoDaCloud(cloud))
        else configSalvata(sRef.current)
      } catch (e) {
        console.warn('[hydrate]', e) // qualunque errore: NON lasciare l'app bloccata sullo splash
      } finally {
        if (!cancel) setSynced(true)
      }
    })()
    return () => { cancel = true }
  }, [authed, synced])
  // Definizioni (schede, obiettivi...) nel cloud a ogni modifica, ma solo dopo la sincro iniziale.
  useEffect(() => {
    if (supa && authed === true && synced) configSalvata(s)
  }, [s.schede, s.activeScheda, s.activeDay, s.customExercises, s.extras, s.target, s.mealPlan, s.goal, s.settings, s.customFoods]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try { localStorage.setItem(LS, JSON.stringify(s)) } catch { /* ignora */ }
  }, [s])
  useTop(tab)
  // La navbar fixed "salta" quando si apre la tastiera: la nascondo finché la tastiera è su.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let full = vv.height
    const onResize = () => { if (vv.height > full) full = vv.height; setKbOpen(vv.height < full - 150) }
    vv.addEventListener('resize', onResize)
    return () => vv.removeEventListener('resize', onResize)
  }, [])

  // Timer globali: vivono qui, così sopravvivono al cambio di tab
  const [timer, setTimer] = useState<number | null>(null)
  const [total, setTotal] = useState(120)
  const [workoutStart, setWorkoutStart] = useState<number | null>(null)
  const [, tick] = useState(0) // ridisegna ogni secondo per far scorrere la durata
  useEffect(() => {
    if (timer == null) return
    if (timer <= 0) {
      setTimer(null)
      if (s.settings.vibrate) navigator.vibrate?.(300)
      if (s.settings.sound) beep()
      return
    }
    const id = setTimeout(() => setTimer(timer - 1), 1000)
    return () => clearTimeout(id)
  }, [timer]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (workoutStart == null) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [workoutStart])
  const startRest = (sec: number) => { ensureAudio(); setTimer(sec); setTotal(sec) }

  const r = readiness(s.checkin)
  const rLabel = r >= 80 ? 'PRONTO' : r >= 65 ? 'OK' : 'SCARICA'
  const rColor = r >= 80 ? 'var(--teal)' : r >= 65 ? 'var(--amber)' : 'var(--coral)'

  if (supa && authed === null)
    return <div className="authgate"><div className="authbrand"><span className="mark">CARICO</span><span className="dot" /></div></div>
  if (supa && !authed) // login obbligatorio: senza accesso non si procede
    return <AuthGate />
  if (supa && authed === true && wasFresh && !synced) // device nuovo: aspetto il caricamento dal cloud
    return <div className="authgate"><div className="authbrand"><span className="mark">CARICO</span><span className="dot" /></div></div>

  return (
    <div id="app" className={timer != null ? 'pad-timer' : ''}>
      <header>
        <span className="mark">CARICO</span><span className="dot" />
        <span className="rpill num" style={{ color: rColor, background: `color-mix(in srgb, ${rColor} 14%, transparent)` }}>
          {r} · {rLabel}
        </span>
      </header>

      <InstallPrompt />

      {tab === 'oggi' && <Oggi s={s} setS={setS} goAllena={() => setTab('allena')} />}
      {tab === 'schede' && <Schede s={s} setS={setS} onStart={() => setTab('allena')} />}
      {tab === 'allena' && <Allena s={s} setS={setS} startRest={startRest}
        workoutStart={workoutStart} setWorkoutStart={setWorkoutStart} />}
      {tab === 'cibo' && <Cibo s={s} setS={setS} />}
      {tab === 'coach' && <Coach s={s} />}
      {tab === 'profilo' && <Profilo s={s} setS={setS} />}

      <TimerBar timer={timer} total={total} onTimer={setTimer} onTotal={setTotal} />
      <nav className={kbOpen ? 'kb' : ''}>
        {TABS.map((t) => (
          <a key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span className="ico"><Icon t={t} /></span>{t}
          </a>
        ))}
      </nav>
      <DialogHost />
      <div className="rotate"><span className="ri">📱</span>Gira il telefono in verticale</div>
    </div>
  )
}

// Schermata dedicata alla scelta esercizi: ricerca + filtro per gruppo muscolare
function ExPicker({ lib, title, onPick, onClose, onCreate }: {
  lib: { name: string; muscle: string }[]; title: string
  onPick: (name: string) => void; onClose: () => void; onCreate: () => void
}) {
  const [q, setQ] = useState('')
  const [mus, setMus] = useState<string | null>(null)
  const groups = [...new Set(lib.map((e) => e.muscle))]
  const list = lib
    .filter((e) => (!mus || e.muscle === mus) && e.name.toLowerCase().includes(q.toLowerCase().trim()))
    .sort((a, b) => (a.muscle === b.muscle ? a.name.localeCompare(b.name) : a.muscle.localeCompare(b.muscle)))
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bc" style={{ margin: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb">Archivio esercizi</div>
            <div className="bt1">{title}</div>
          </div>
          <button className="pen" onClick={onClose}>✕</button>
        </div>
        <input placeholder="Cerca esercizio…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontFamily: 'var(--sans)' }} />
        <div className="chips scrollx">
          <button className={'chip' + (!mus ? ' on' : '')} onClick={() => setMus(null)}>Tutti</button>
          {groups.map((m) => (
            <button key={m} className={'chip' + (mus === m ? ' on' : '')} onClick={() => setMus(mus === m ? null : m)}>
              <span className="mdot" style={{ background: mcolor(m) }} />{m}
            </button>
          ))}
        </div>
        <div className="plist">
          {list.map((e) => (
            <div className="prow2" key={e.name} onClick={() => onPick(e.name)}>
              <span className="exbar" style={{ background: mcolor(e.muscle) }} />
              <div style={{ minWidth: 0 }}><b>{e.name}</b><div className="meta" style={{ color: mcolor(e.muscle) }}>{e.muscle}</div></div>
              <span className="chev" style={{ color: 'var(--lime)' }}>＋</span>
            </div>
          ))}
          {!list.length && <p className="sm mut" style={{ margin: '14px 2px' }}>Niente con questo nome: crealo tu ↓</p>}
        </div>
        <button className="ghost" onClick={onCreate}>+ Crea nuovo esercizio</button>
      </div>
    </div>
  )
}

// Anello di readiness: il punteggio del giorno a colpo d'occhio
function Ring({ v, color }: { v: number; color: string }) {
  const R = 32, C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 80 80" className="ring">
      <circle className="ring-bg" cx="40" cy="40" r={R} />
      <circle className="ring-fg" cx="40" cy="40" r={R} stroke={color}
        strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(100, Math.max(0, v)) / 100)} />
      <text className="ring-v" x="40" y="41">{v}</text>
    </svg>
  )
}

function Oggi({ s, setS, goAllena }: { s: State; setS: (u: State) => void; goAllena: () => void }) {
  const [minutes, setMinutes] = useState(60)
  const commitCheckin = (c: State['checkin']) => {
    setS({ ...s, checkin: c, checkins: [...s.checkins.filter((x) => x.date !== today()), c] })
    checkinSalvato(c) // specchio cloud: upsert per giorno
  }
  const set = (k: keyof State['checkin'], v: number) => commitCheckin({ ...s.checkin, [k]: v, date: today() })
  const setSleep = (oreRaw: number) => {
    const ore = Math.max(0, Math.min(14, Math.round(oreRaw * 2) / 2))
    const sonno = Math.max(0, Math.min(10, Math.round(ore / 8 * 10 * 2) / 2))
    commitCheckin({ ...s.checkin, ore, sonno, date: today() })
  }
  const sliders: [keyof State['checkin'], string][] = [
    ['energia', 'Energia'], ['doms', 'Indolenzimento (DOMS)'], ['stress', 'Stress'],
  ]

  const r = readiness(s.checkin)
  const rLabel = r >= 80 ? 'PRONTO' : r >= 65 ? 'OK' : 'SCARICA'
  const rCol = r >= 80 ? 'var(--teal)' : r >= 65 ? 'var(--amber)' : 'var(--coral)'
  const rHead = r >= 80 ? 'Giornata da spingere' : r >= 65 ? 'Giornata nella norma' : 'Meglio andarci piano'
  const ciToday = s.checkin.date === today()
  const ore = s.checkin.ore ?? 7.5
  const rHist = [...s.checkins].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-8).map(readiness)

  const day = curDay(s)
  const items = curItems(s)
  const adapted = adaptSession(items, minutes)
  const muscles = [...new Set(items.map((it) => it.muscle))]
  const estMin = Math.round(items.reduce((a, it) => a + itemSetCount(it) * (it.rest + 45), 0) / 60)

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const since = weekAgo.toISOString().slice(0, 10)
  const wl = s.log.filter((l) => l.date > since)
  const weekSessions = new Set(wl.map((l) => l.date)).size
  const weekTon = wl.reduce((a, l) => a + l.kg * l.reps, 0)
  const st = streak(s.log), lvl = level(s.log)

  const tot = nutritionToday(s.meals, today())
  const wt = waterToday(s.water, today()), wg = waterGoal(s)
  const kcalLeft = s.target.kcal - tot.kcal

  const mv = muscleVolume(s)
  const mvEntries = Object.entries(mv).sort((a, b) => b[1] - a[1])
  const under = mvEntries.filter(([, n]) => n < 8).map(([m]) => m)

  const cur = s.body.length ? s.body[s.body.length - 1].kg : 0
  const first = s.body.length ? s.body[0].kg : cur

  const h = new Date().getHours()
  const hi = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'
  const nudge = !ciToday
    ? 'Fai il check-in di oggi: 20 secondi e i pesi proposti diventano affidabili.'
    : r < 65 ? `Readiness ${r}/100: ho ridotto i carichi del 10%, punta a serie pulite.`
    : weeklyReport(s).scarico ? 'Fatica in accumulo su un fondamentale: valuta una settimana di scarico.'
    : 'Tutto in linea. Chiudi le serie a RPE 8 e la progressione va da sé.'

  return (
    <>
      <p className="hello">{hi} · <b>{day?.name ?? 'riposo'}</b> in programma oggi</p>

      <div className="card ready">
        <Ring v={r} color={rCol} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rl" style={{ color: rCol }}>{rLabel} · READINESS</div>
          <div className="rh">{rHead}</div>
          <div className="rd">{nudge}</div>
        </div>
      </div>
      {rHist.length >= 2 && (
        <div className="card" style={{ marginTop: 10, paddingBottom: 8 }}>
          <div className="mono sm mut" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>Andamento readiness</div>
          <Sparkline values={rHist} color={rCol} h={48} />
        </div>
      )}

      <div className="tiles" style={{ marginTop: 10 }}>
        <div className="tile"><div className="l">Streak</div><div className="v num">{st} <span className="sm mut">gg</span></div></div>
        <div className="tile"><div className="l">Settimana</div><div className="v num">{weekSessions} <span className="sm mut">sedute</span></div></div>
        <div className="tile"><div className="l">Volume 7gg</div><div className="v num">{fmt(weekTon / 1000)} <span className="sm mut">t</span></div></div>
        <div className="tile"><div className="l">Livello</div><div className="v num">{lvl.n}</div></div>
      </div>

      <h2>Come stai oggi</h2>
      <div className="card">
        <div className="sleepbox">
          <button className="qbtn" onClick={() => setSleep(ore - 0.5)}>−</button>
          <div className="sleepval">
            <div className="num" style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{fmt(ore)}<span className="sm mut"> h</span></div>
            <div className="l" style={{ marginTop: 4 }}>ore di sonno</div>
          </div>
          <button className="qbtn" onClick={() => setSleep(ore + 0.5)}>＋</button>
        </div>
        {sliders.map(([k, lab]) => (
          <div className="sl" key={k}>
            <div className="top"><b>{lab}</b><span className="val num">{s.checkin[k]}/10</span></div>
            <input type="range" min={0} max={10} step={1} value={s.checkin[k]}
              onChange={(e) => set(k, +e.target.value)} />
          </div>
        ))}
      </div>

      <h2>Seduta di oggi</h2>
      {items.length ? (
        <div className="card startcard">
          <div className="sh">
            <span className="exbar" style={{ background: mcolor(muscles[0] ?? ''), minHeight: 40 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <b>{day?.name}</b>
              <div className="meta num">{items.length} esercizi{estMin > 0 && <> · ~{estMin} min</>}</div>
              <div className="mdots">{muscles.map((m) => <span className="mdot" key={m} style={{ background: mcolor(m) }} />)}</div>
            </div>
          </div>
          <button onClick={goAllena}>▶ Inizia l'allenamento</button>
          <div className="seg" style={{ marginTop: 12 }}>
            {[60, 45, 30].map((mi) => (
              <button key={mi} className={'sg' + (minutes === mi ? ' on' : '')} onClick={() => setMinutes(mi)}>{mi} min</button>
            ))}
          </div>
          <div className="plan" style={{ padding: '4px 0 0' }}>
            {adapted.map((p) => {
              const pr = proposta(s, p.ex, itemReps(p))
              return (
                <div className="pl" key={p.ex}>
                  <span className="exbar" style={{ background: mcolor(p.muscle) }} />
                  <div style={{ minWidth: 0 }}><div className="ex" style={{ fontSize: 15 }}>{p.ex}</div>
                    <div className="meta num"><span style={{ color: mcolor(p.muscle) }}>{p.muscle}</span> · {schemeSummary(p)}</div></div>
                  <span className="wb num">{pr ? fmt(pr.kg) + ' kg' : 'a sensaz.'}</span>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <p className="sm mut" style={{ margin: '4px 2px', lineHeight: 1.6 }}>Giorno di riposo. Scegli un giorno in <b>Schede</b> per allenarti.</p>
      )}

      <h2>Nutrizione di oggi</h2>
      <div className="card">
        <div className="kcalhead">
          <div>
            <div className="kcalbig num" style={{ color: kcalLeft < 0 ? 'var(--coral)' : 'var(--chalk)' }}>{Math.abs(Math.round(kcalLeft))}</div>
            <div className="l">{kcalLeft < 0 ? 'kcal oltre il target' : 'kcal rimaste'}</div>
          </div>
          <div className="kcalsub num">{Math.round(tot.kcal)} <span className="mut">/ {s.target.kcal}</span></div>
        </div>
        <div className="macros">
          <MacroRing v={tot.protein} max={s.target.protein} color="var(--teal)" label="Proteine" />
          <MacroRing v={tot.carbs} max={s.target.carbs} color="var(--amber)" label="Carbo" />
          <MacroRing v={tot.fat} max={s.target.fat} color="#A78BFA" label="Grassi" />
        </div>
        <div style={{ marginTop: 12 }}><Bar v={wt} max={wg} color="var(--blue)" label="Acqua" unit="ml" /></div>
      </div>

      {mvEntries.length > 0 && (<>
        <h2>Volume settimanale · per gruppo</h2>
        <div className="card">
          {mvEntries.map(([m, n]) => (
            <div className="bar" key={m}>
              <span className="bn" style={{ color: mcolor(m) }}>{m}</span>
              <div className="bt"><i style={{ width: Math.min(100, n / 16 * 100) + '%', background: n < 8 ? 'var(--amber)' : 'var(--lime)' }} /></div>
              <span className="bv num">{n} serie</span>
            </div>
          ))}
          <p className="hint">Target 10–20 serie/gruppo · <span style={{ color: 'var(--amber)' }}>ambra</span> = sotto quota</p>
        </div>
      </>)}

      {s.body.length >= 2 && (<>
        <h2>Andamento peso</h2>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 28, fontWeight: 800 }} className="num">{fmt(cur)}<span className="sm mut"> kg</span></div>
            <span className="delta num">{cur - first >= 0 ? '▲ +' : '▼ '}{fmt(cur - first)} kg</span>
          </div>
          <Sparkline values={s.body.map((b) => b.kg)} color="#31E0B4" h={50} />
        </div>
      </>)}

      <h2>Consiglio del coach</h2>
      <div className="msg"><div className="who">Carico Coach</div>{nudge}</div>
      {under.length > 0 && (
        <div className="msg" style={{ marginTop: 8 }}><div className="who">Carico Coach</div>
          Questa settimana <b>{under.join(', ')}</b> {under.length === 1 ? 'è' : 'sono'} sotto quota: aggiungi 1–2 esercizi per recuperare volume.
        </div>
      )}
    </>
  )
}

// Tab Schede: gestione schede + calendario allenamenti (coerente con lo stile del Cibo)
function Schede({ s, setS, onStart }: { s: State; setS: (u: State) => void; onStart: () => void }) {
  const [tab, setTab] = useState<'schede' | 'cal' | 'stats'>('schede')
  const [statsEx, setStatsEx] = useState<string | null>(null)
  const repeatDay = (date: string) => {
    const sets = s.log.filter((l) => l.date === date)
    const already = new Set([...curItems(s).map((i) => i.ex), ...s.extras.filter((e) => e.date === today()).map((e) => e.item.ex)])
    const items = [...new Set(sets.map((x) => x.ex))].filter((ex) => !already.has(ex)).map((ex) => {
      const v = sets.filter((x) => x.ex === ex)
      return { ex, sets: v.length, reps: Math.round(v.reduce((a, x) => a + x.reps, 0) / v.length), rest: 120, muscle: muscleOf(s, ex) }
    })
    setS({ ...s, extras: [...s.extras, ...items.map((item) => ({ date: today(), item }))] })
    toast('Seduta copiata in oggi'); onStart()
  }
  return (
    <>
      <div className="seg" style={{ marginTop: 4, marginBottom: 4 }}>
        {([['schede', 'Schede'], ['cal', 'Calendario'], ['stats', 'Stats']] as const).map(([k, l]) => (
          <button key={k} className={'sg' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'schede' && <SchedeManager s={s} setS={setS} onStart={onStart} />}
      {tab === 'cal' && <Calendario s={s} onRepeat={repeatDay} />}
      {tab === 'stats' && <Statistiche s={s} onOpen={setStatsEx} />}
      {statsEx && <ExStats s={s} ex={statsEx} onClose={() => setStatsEx(null)} />}
    </>
  )
}

function SchedeManager({ s, setS, onStart }: { s: State; setS: (u: State) => void; onStart: () => void }) {
  const sc = curScheda(s)
  const items = curItems(s)
  const lib = [...EXERCISES, ...s.customExercises]
  const [edit, setEdit] = useState<number | null>(null)
  const [imp, setImp] = useState(false); const [text, setText] = useState('')
  const [view, setView] = useState<'list' | 'scheda' | 'day'>('list')
  const [picker, setPicker] = useState(false)
  useTop(view)

  const mutate = (fn: (d: State) => void) => { const d = structuredClone(s); fn(d); setS(d) }
  const dayItems = (d: State) => d.schede[s.activeScheda].days[s.activeDay].items
  const addItemByName = (name: string) => {
    const muscle = lib.find((e) => e.name === name)?.muscle ?? lookupMuscle(name)
    mutate((d) => { dayItems(d).push({ ex: name, sets: 4, reps: 8, rest: 120, muscle }) })
    setEdit(items.length); setPicker(false) // apre subito l'editor del nuovo esercizio
  }
  const createAndAdd = async () => {
    const v = await promptDlg('Nuovo esercizio', [
      { label: 'Nome', placeholder: 'es. Panca presa stretta' },
      { label: 'Gruppo muscolare', options: [...MUSCLES, 'Altro'] },
    ])
    const name = v?.[0]?.trim(); if (!name) return
    const existing = lib.find((e) => e.name.toLowerCase() === name.toLowerCase())
    const muscle = existing?.muscle ?? (v![1] || 'Altro')
    const exName = existing?.name ?? name
    mutate((d) => {
      if (!existing) d.customExercises.push({ name: exName, muscle })
      dayItems(d).push({ ex: exName, sets: 4, reps: 8, rest: 120, muscle })
    })
    setEdit(items.length); setPicker(false)
  }
  const updItem = (i: number, patch: Partial<PlanItem>) => mutate((d) => { Object.assign(dayItems(d)[i], patch) })
  const removeItem = (i: number) => { mutate((d) => { dayItems(d).splice(i, 1) }); setEdit(null) }
  const moveItem = (i: number, dir: number) => mutate((d) => {
    const a = dayItems(d), j = i + dir; if (j < 0 || j >= a.length) return
    ;[a[i], a[j]] = [a[j], a[i]]
  })
  const customize = (i: number) => mutate((d) => {
    const it = dayItems(d)[i]
    it.scheme = Array.from({ length: it.sets }, () => ({ type: 'normal' as SetType, reps: String(it.reps) }))
  })
  const toUniform = (i: number) => mutate((d) => { delete dayItems(d)[i].scheme })
  const applyPreset = (i: number, kind: string) => mutate((d) => {
    const it = dayItems(d)[i]; it.scheme = makePreset(kind, it.reps || 8)
  })
  const addSet = (i: number) => mutate((d) => {
    const it = dayItems(d)[i]; (it.scheme ??= []).push({ type: 'normal', reps: String(it.reps || 8) })
  })
  const updSet = (i: number, j: number, patch: object) => mutate((d) => { Object.assign(dayItems(d)[i].scheme![j], patch) })
  const removeSet = (i: number, j: number) => mutate((d) => {
    const it = dayItems(d)[i]; it.scheme!.splice(j, 1); if (!it.scheme!.length) delete it.scheme
  })
  const addDay = async () => {
    const v = await promptDlg('Nuovo giorno', [{ label: 'Nome', value: 'Giorno ' + (sc.days.length + 1) }])
    const name = v?.[0]?.trim(); if (!name) return
    mutate((d) => { const days = d.schede[s.activeScheda].days; days.push({ name, items: [] }); d.activeDay = days.length - 1 })
    setView('day')
  }
  const removeDay = (i: number) => mutate((d) => { d.schede[s.activeScheda].days.splice(i, 1); d.activeDay = 0 })
  const addScheda = async () => {
    const v = await promptDlg('Nuova scheda', [{ label: 'Nome', placeholder: 'es. Ipertrofia agosto' }])
    const name = v?.[0]?.trim(); if (!name) return
    mutate((d) => { d.schede.push({ name, days: [{ name: 'Giorno 1', items: [] }] }); d.activeScheda = d.schede.length - 1; d.activeDay = 0 })
    setView('scheda')
  }
  const renameScheda = async () => {
    const v = await promptDlg('Rinomina scheda', [{ label: 'Nome', value: sc?.name }])
    const n = v?.[0]?.trim()
    if (n) mutate((d) => { d.schede[s.activeScheda].name = n })
  }
  const renameDay = async () => {
    const v = await promptDlg('Rinomina giorno', [{ label: 'Nome', value: curDay(s)?.name }])
    const n = v?.[0]?.trim()
    if (n) mutate((d) => { d.schede[s.activeScheda].days[s.activeDay].name = n })
  }
  const readFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) f.text().then(setText) }
  const doImport = () => {
    const parsed: Scheda | null = parseScheda(text)
    if (!parsed) return toast('Formato non riconosciuto: usa righe come "Giorno: Push A" e "Panca piana 4x8"')
    mutate((d) => { d.schede.push(parsed); d.activeScheda = d.schede.length - 1; d.activeDay = 0 })
    setImp(false); setText(''); setView('scheda')
    toast('Scheda importata')
  }

  // --- Vista 1 · elenco schede ---
  if (view === 'list') return (
    <>
      <h2>Le tue schede</h2>
      {s.schede.map((x, i) => {
        const nEx = x.days.reduce((a, dd) => a + dd.items.length, 0)
        const mus = [...new Set(x.days.flatMap((dd) => dd.items.map((it) => it.muscle)))]
        return (
          <div className="navcard" key={i} onClick={() => { setS({ ...s, activeScheda: i, activeDay: 0 }); setView('scheda') }}>
            <div style={{ minWidth: 0 }}>
              <b>{x.name}</b>{i === s.activeScheda && <span className="stag">Attiva</span>}
              <div className="meta num">{x.days.length} {x.days.length === 1 ? 'giorno' : 'giorni'} · {nEx} esercizi</div>
              <div className="mdots">{mus.map((m) => <span className="mdot" key={m} style={{ background: mcolor(m) }} />)}</div>
            </div>
            <span className="chev">›</span>
          </div>
        )
      })}
      <button className="ghost" onClick={addScheda}>+ Nuova scheda</button>

      <h2>Importa scheda</h2>
      {!imp ? (
        <button className="ghost" onClick={() => setImp(true)}>Importa da file o testo</button>
      ) : (
        <div className="card">
          <input type="file" accept=".txt,.json" onChange={readFile} className="file" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
            placeholder={'Giorno: Push A\nPanca piana 4x8\nMilitary press 4x10\nGiorno: Pull A\nTrazioni 4x8'} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="ghost" onClick={() => { setImp(false); setText('') }}>Annulla</button>
            <button onClick={doImport}>Importa</button>
          </div>
        </div>
      )}
    </>
  )

  // --- Vista 2 · giorni della scheda ---
  if (view === 'scheda') return (
    <>
      <div className="bc">
        <button className="back" onClick={() => setView('list')}>‹</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crumb">Scheda</div>
          <div className="bt1">{sc?.name}</div>
        </div>
        <button className="pen" onClick={renameScheda}>✎</button>
      </div>
      <h2>Giorni</h2>
      {sc?.days.map((dd, i) => {
        const mus = [...new Set(dd.items.map((it) => it.muscle))]
        const min = Math.round(dd.items.reduce((a, it) => a + itemSetCount(it) * (it.rest + 45), 0) / 60)
        return (
          <div className="navcard" key={i} onClick={() => { setS({ ...s, activeDay: i }); setEdit(null); setView('day') }}>
            <div style={{ minWidth: 0 }}>
              <b>{dd.name}</b>
              <div className="meta num">{dd.items.length} esercizi{min > 0 && <> · ~{min} min</>}</div>
              <div className="mdots">{mus.map((m) => <span className="mdot" key={m} style={{ background: mcolor(m) }} />)}</div>
            </div>
            <span className="chev">›</span>
          </div>
        )
      })}
      <button className="ghost" onClick={addDay}>+ Nuovo giorno</button>
      {sc && (
        <button className="ghost" style={{ marginTop: 20, color: 'var(--coral)' }}
          onClick={async () => { if (await confirmDlg('Eliminare questa scheda?', sc?.name)) { mutate((d) => { d.schede.splice(s.activeScheda, 1); d.activeScheda = 0; d.activeDay = 0 }); setView('list') } }}>
          Elimina scheda</button>
      )}
    </>
  )

  // --- Vista 3 · editor del giorno ---
  return (
    <>
      <div className="bc">
        <button className="back" onClick={() => setView('scheda')}>‹</button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crumb">{sc?.name}</div>
          <div className="bt1">{curDay(s)?.name}</div>
        </div>
        <button className="pen" onClick={renameDay}>✎</button>
      </div>

      {items.length > 0 && (
        <button style={{ marginTop: 4 }} onClick={onStart}>▶ Inizia questo allenamento</button>
      )}

      <h2>Esercizi</h2>
      <div className="card" style={{ padding: '4px 12px' }}>
        {items.length ? items.map((it, i) => {
          const tag = schemeTag(it)
          return (
            <div key={i}>
              <div className="set" onClick={() => setEdit(edit === i ? null : i)} style={{ cursor: 'pointer' }}>
                <span className="exbar" style={{ background: mcolor(it.muscle) }} />
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 13.5 }}>{it.ex}</b>{tag && <span className="stag">{tag}</span>}
                  <div className="meta num"><span style={{ color: mcolor(it.muscle) }}>{it.muscle}</span> · {schemeSummary(it)} · rec {mmss(it.rest)}</div>
                  {it.note && <div className="note">✎ {it.note}</div>}
                </div>
                <span className="del" style={{ marginLeft: 'auto' }}>{edit === i ? '▾' : '▸'}</span>
              </div>
              {edit === i && (
                <div className="editor">
                  <div className="efield"><label>Recupero (sec)</label><input type="number" step="15" value={it.rest} onChange={(e) => updItem(i, { rest: +e.target.value })} inputMode="numeric" /></div>
                  <div className="efield"><label>Ordine</label>
                    <div className="row" style={{ gap: 6 }}>
                      <button className="ghost mini" onClick={() => moveItem(i, -1)} disabled={i === 0}>↑</button>
                      <button className="ghost mini" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1}>↓</button>
                    </div>
                  </div>
                  <div className="efield full"><label>Nota</label><input type="text" value={it.note ?? ''} placeholder="es. presa stretta, tempo 3-1-1" onChange={(e) => updItem(i, { note: e.target.value })} style={{ fontFamily: 'var(--sans)' }} /></div>

                  {!it.scheme ? (
                    <>
                      <div className="efield"><label>Serie</label><input type="number" value={it.sets} onChange={(e) => updItem(i, { sets: +e.target.value })} inputMode="numeric" /></div>
                      <div className="efield"><label>Ripetizioni</label><input type="number" value={it.reps} onChange={(e) => updItem(i, { reps: +e.target.value })} inputMode="numeric" /></div>
                      <button className="ghost full" onClick={() => customize(i)}>Personalizza ogni serie →</button>
                    </>
                  ) : (
                    <div className="full">
                      <div className="presets">
                        {[['ramping', 'Ramping'], ['backoff', 'Back-off'], ['pyramid', 'Piramide'], ['drop', 'Drop set']].map(([k, l]) => (
                          <button key={k} className="preset" onClick={() => applyPreset(i, k)}>{l}</button>
                        ))}
                      </div>
                      <div className="setlist">
                        <div className="slh"><span>#</span><span>Tipo</span><span>Reps</span><span>Carico</span><span></span></div>
                        {it.scheme.map((sp, j) => (
                          <div className={'slr st-' + sp.type} key={j}>
                            <span className="sidx">{j + 1}</span>
                            <select value={sp.type} onChange={(e) => updSet(i, j, { type: e.target.value as SetType })}>
                              {SET_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                            </select>
                            <input value={sp.reps} onChange={(e) => updSet(i, j, { reps: e.target.value })} placeholder="8" />
                            <input value={sp.load ?? ''} onChange={(e) => updSet(i, j, { load: e.target.value })} placeholder="@80%" style={{ fontFamily: 'var(--sans)' }} />
                            <span className="del" onClick={() => removeSet(i, j)}>✕</span>
                          </div>
                        ))}
                      </div>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button className="ghost" onClick={() => addSet(i)}>+ Serie</button>
                        <button className="ghost" onClick={() => toUniform(i)}>Torna a uniforme</button>
                      </div>
                    </div>
                  )}

                  <button className="ghost full" style={{ color: 'var(--coral)' }} onClick={() => removeItem(i)}>Rimuovi esercizio</button>
                </div>
              )}
            </div>
          )
        }) : <p className="sm mut" style={{ margin: '10px 2px' }}>Giorno vuoto: aggiungi esercizi dall'archivio ↓</p>}
      </div>

      <button style={{ marginTop: 12 }} className="ghost" onClick={() => setPicker(true)}>＋ Aggiungi esercizio</button>
      {picker && (
        <ExPicker lib={lib} title={curDay(s)?.name ?? ''} onClose={() => setPicker(false)}
          onPick={addItemByName} onCreate={createAndAdd} />
      )}

      {sc && sc.days.length > 1 && (
        <button className="ghost" style={{ marginTop: 14, color: 'var(--coral)' }}
          onClick={async () => { if (await confirmDlg('Eliminare questo giorno?', curDay(s)?.name)) { removeDay(s.activeDay); setView('scheda') } }}>
          Elimina giorno</button>
      )}
    </>
  )
}

const mmss = (sec: number) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')

// Popup timer flottante: recupero + crono, visibile ovunque sopra la nav
// Popup flottante del recupero: appare solo mentre il timer va, visibile su ogni schermata
function TimerBar({ timer, total, onTimer, onTotal }: {
  timer: number | null; total: number
  onTimer: (v: number | null) => void; onTotal: (v: number) => void
}) {
  if (timer == null) return null
  return (
    <div className="timer timerbar">
      <div className="trow">
        <div style={{ flex: 'none' }}>
          <div className="tl">Recupero</div>
          <div className="tv num">{mmss(timer)}</div>
        </div>
        <div className="bt tbar"><i style={{ width: Math.min(100, (timer / Math.max(1, total)) * 100) + '%', background: 'var(--teal)' }} /></div>
        <button className="tbtn num" onClick={() => onTimer(Math.max(0, timer - 15))}>−15</button>
        <button className="tbtn num" onClick={() => { onTimer(timer + 30); onTotal(Math.max(total, timer + 30)) }}>+30</button>
        <button className="tbtn" onClick={() => onTimer(null)}>✕</button>
      </div>
    </div>
  )
}

// Rotella di scroll per il recupero: scorri e il valore si applica subito (stile picker iOS)
function RestPicker({ value, onChange, onClose }: { value: number; onChange: (v: number) => void; onClose: () => void }) {
  const ITEM = 46
  const steps = Array.from({ length: 41 }, (_, i) => i * 15) // 0:00 → 10:00
  const ref = useRef<HTMLDivElement>(null)
  const [val, setVal] = useState(value)
  useLayoutEffect(() => {
    const idx = Math.max(0, steps.indexOf(Math.round(value / 15) * 15))
    if (ref.current) ref.current.scrollTop = idx * ITEM
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const onScroll = () => {
    if (!ref.current) return
    const idx = Math.round(ref.current.scrollTop / ITEM)
    const v = steps[Math.max(0, Math.min(steps.length - 1, idx))]
    if (v !== val) { setVal(v); onChange(v) }
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet restsheet" onClick={(e) => e.stopPropagation()}>
        <div className="bc" style={{ margin: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb" style={{ color: 'var(--teal)' }}>Recupero · scorri</div>
            <div className="bt1 num">{mmss(val)}</div>
          </div>
          <button className="pen" onClick={onClose}>✕</button>
        </div>
        <div className="wheelbox">
          <div className="wheelband" />
          <div className="wheel" ref={ref} onScroll={onScroll}>
            <div className="wheelpad" />
            {steps.map((v) => <div key={v} className={'wheeli num' + (v === val ? ' on' : '')}>{mmss(v)}</div>)}
            <div className="wheelpad" />
          </div>
        </div>
        <button onClick={onClose}>Fatto</button>
      </div>
    </div>
  )
}

// Riordino a trascinamento: tieni ≡ e sposta su/giù, gli altri scorrono
function ReorderSheet({ plan, onDone }: { plan: PlanItem[]; onDone: (order: number[]) => void }) {
  const ROW = 60
  const [order, setOrder] = useState<number[]>(() => plan.map((_, i) => i))
  const [drag, setDrag] = useState<{ pos: number; rel: number; top: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const done = () => onDone(order)

  const down = (e: React.PointerEvent, pos: number) => {
    const top = box.current!.getBoundingClientRect().top
    try { box.current!.setPointerCapture(e.pointerId) } catch { /* puntatore non catturabile */ }
    setDrag({ pos, rel: e.clientY - top, top })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const rel = e.clientY - drag.top
    const target = Math.max(0, Math.min(order.length - 1, Math.floor(rel / ROW)))
    if (target !== drag.pos) {
      const n = [...order]; const [m] = n.splice(drag.pos, 1); n.splice(target, 0, m)
      setOrder(n)
    }
    setDrag({ ...drag, pos: target, rel })
  }

  return (
    <div className="overlay" onClick={done}>
      <div className="sheet menusheet" onClick={(e) => e.stopPropagation()}>
        <div className="bc" style={{ margin: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb">Tieni ≡ e trascina</div>
            <div className="bt1">Riordina esercizi</div>
          </div>
          <button className="pen" onClick={done}>✕</button>
        </div>
        <div className="reobox" ref={box} style={{ height: order.length * ROW }}
          onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
          {order.map((idx, pos) => {
            const it = plan[idx]
            const dragging = drag?.pos === pos
            const VIS = ROW - 10 // 10px di aria tra un box e l'altro
            const y = dragging ? drag!.rel - ROW / 2 : pos * ROW + 5
            return (
              <div key={idx} className={'reorow' + (dragging ? ' dragging' : '')}
                style={{ transform: `translateY(${y}px)`, height: VIS }}>
                <span className="exbar" style={{ background: mcolor(it.muscle) }} />
                <b style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{it.ex}</b>
                <span className="draghandle" onPointerDown={(e) => down(e, pos)}>≡</span>
              </div>
            )
          })}
        </div>
        <button onClick={done}>Fatto</button>
      </div>
    </div>
  )
}

type Draft = { kg: string; reps: string; rpe: string }

function Allena({ s, setS, startRest, workoutStart, setWorkoutStart }: {
  s: State; setS: (u: State) => void; startRest: (sec: number) => void
  workoutStart: number | null; setWorkoutStart: (v: number | null) => void
}) {
  const plan = curItems(s)
  const extras = s.extras.filter((e) => e.date === today()).map((e) => e.item)
  const items = [...plan, ...extras]
  const day = curDay(s)
  const lib = [...EXERCISES, ...s.customExercises]
  const [summary, setSummary] = useState<{ sets: number; tonnage: number; avgRpe: number; prs: string[] } | null>(null)
  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [picker, setPicker] = useState(false)
  const [statsEx, setStatsEx] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ it: PlanItem; isExtra: boolean; idx: number } | null>(null)
  const [swap, setSwap] = useState<{ ex: string; isExtra: boolean } | null>(null)
  const [reorder, setReorder] = useState(false)
  const [restPick, setRestPick] = useState<{ ex: string; isExtra: boolean } | null>(null)

  const addExtra = (name: string) => {
    const muscle = lib.find((e) => e.name === name)?.muscle ?? lookupMuscle(name)
    setS({ ...s, extras: [...s.extras, { date: today(), item: { ex: name, sets: 3, reps: 10, rest: 120, muscle } }] })
    setPicker(false)
  }
  const createAndAddExtra = async () => {
    const v = await promptDlg('Nuovo esercizio', [
      { label: 'Nome', placeholder: 'es. Panca presa stretta' },
      { label: 'Gruppo muscolare', options: [...MUSCLES, 'Altro'] },
    ])
    const name = v?.[0]?.trim(); if (!name) return
    const existing = lib.find((e) => e.name.toLowerCase() === name.toLowerCase())
    const muscle = existing?.muscle ?? (v![1] || 'Altro')
    setS({
      ...s,
      customExercises: existing ? s.customExercises : [...s.customExercises, { name, muscle }],
      extras: [...s.extras, { date: today(), item: { ex: existing?.name ?? name, sets: 3, reps: 10, rest: 120, muscle } }],
    })
    setPicker(false)
  }
  const removeExtra = (ex: string) =>
    setS({ ...s, extras: s.extras.filter((e) => !(e.date === today() && e.item.ex === ex)) })

  // Ingranaggio: opzioni runtime sull'esercizio in corso
  const patchItem = (ex: string, isExtra: boolean, fn: (t: PlanItem) => void) => {
    const d = structuredClone(s)
    const t = isExtra
      ? d.extras.find((e) => e.date === today() && e.item.ex === ex)?.item
      : d.schede[s.activeScheda].days[s.activeDay].items.find((x) => x.ex === ex)
    if (t) { fn(t); setS(d) }
  }
  const applyOrder = (order: number[]) => {
    const d = structuredClone(s)
    const day2 = d.schede[s.activeScheda].days[s.activeDay]
    day2.items = order.map((i) => day2.items[i])
    setS(d); setReorder(false)
  }
  const toggleSuperset = (it: PlanItem) => { patchItem(it.ex, false, (t) => { t.ss = !t.ss }); setMenu(null) }
  const doSwap = (name: string) => {
    if (!swap) return
    if (items.some((x) => x.ex === name)) return toast('Esercizio già in seduta')
    const muscle = lib.find((e) => e.name === name)?.muscle ?? lookupMuscle(name)
    patchItem(swap.ex, swap.isExtra, (t) => { t.ex = name; t.muscle = muscle })
    setSwap(null)
    toast('Esercizio sostituito')
  }
  const createAndSwap = async () => {
    const v = await promptDlg('Nuovo esercizio', [
      { label: 'Nome', placeholder: 'es. Panca presa stretta' },
      { label: 'Gruppo muscolare', options: [...MUSCLES, 'Altro'] },
    ])
    const name = v?.[0]?.trim(); if (!name || !swap) return
    const existing = lib.find((e) => e.name.toLowerCase() === name.toLowerCase())
    if (items.some((x) => x.ex === (existing?.name ?? name))) return toast('Esercizio già in seduta')
    const muscle = existing?.muscle ?? (v![1] || 'Altro')
    const d = structuredClone(s)
    if (!existing) d.customExercises.push({ name, muscle })
    const t = swap.isExtra
      ? d.extras.find((e) => e.date === today() && e.item.ex === swap.ex)?.item
      : d.schede[s.activeScheda].days[s.activeDay].items.find((x) => x.ex === swap.ex)
    if (t) { t.ex = existing?.name ?? name; t.muscle = muscle }
    setS(d); setSwap(null)
    toast('Esercizio sostituito')
  }
  const addSetRt = (it: PlanItem, isExtra: boolean) =>
    patchItem(it.ex, isExtra, (t) => {
      if (t.scheme) t.scheme.push({ type: 'normal', reps: String(itemReps(t)) })
      else t.sets += 1
    })
  const removeSetRt = (it: PlanItem, isExtra: boolean) => {
    const done = logOf(it.ex).length
    const n = specs(it).length
    if (n <= 1) return toast('È l\'ultima serie rimasta')
    if (n <= done) return toast('Serie già completate: togli prima la spunta ✕')
    patchItem(it.ex, isExtra, (t) => {
      if (t.scheme) t.scheme.pop()
      else t.sets -= 1
    })
  }

  const todayLog = s.log.filter((x) => x.date === today())
  const logOf = (ex: string) => todayLog.filter((x) => x.ex === ex)
  const anyToday = todayLog.length > 0
  const r = readiness(s.checkin)

  // serie pianificate: schema personalizzato o uniforme
  const specs = (it: PlanItem): SetSpec[] =>
    it.scheme ?? Array.from({ length: it.sets }, () => ({ type: 'normal' as SetType, reps: String(it.reps) }))

  const totalPlanned = items.reduce((a, it) => a + specs(it).length, 0)
  const totalDone = items.reduce((a, it) => a + Math.min(logOf(it.ex).length, specs(it).length), 0)
  const pct = totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : 0

  // peso proposto per la singola serie: proposta base +/- il modificatore % dello schema
  // ponytail: il carico "@80%" è interpretato come % della proposta, non del 1RM; basta per pre-compilare
  const propose = (it: PlanItem, sp: SetSpec): number | null => {
    const reps = parseInt(sp.reps, 10) || itemReps(it)
    const base = proposta(s, it.ex, reps)
    if (!base) return null
    let kg = base.kg
    const m = sp.load?.match(/(-?)\s*@?\s*(\d+)\s*%/)
    if (m) kg = m[1] === '-' ? kg * (1 - +m[2] / 100) : kg * (+m[2] / 100)
    else if (sp.type === 'warmup') kg = kg * 0.5
    return Math.round(kg / 2.5) * 2.5
  }

  const key = (ex: string, i: number) => ex + '#' + i
  const getDraft = (it: PlanItem, sp: SetSpec, i: number): Draft => {
    const d = draft[key(it.ex, i)]
    if (d) return d
    const p = propose(it, sp)
    return { kg: p != null ? String(p) : '', reps: String(parseInt(sp.reps, 10) || itemReps(it)), rpe: '' }
  }
  const setD = (it: PlanItem, sp: SetSpec, i: number, patch: Partial<Draft>) =>
    setDraft((prev) => ({ ...prev, [key(it.ex, i)]: { ...getDraft(it, sp, i), ...patch } }))

  const check = (it: PlanItem, sp: SetSpec, i: number) => {
    const d = getDraft(it, sp, i)
    const kg = parseFloat(d.kg.replace(',', '.'))
    if (!kg || !+d.reps) return toast('Servono peso e ripetizioni')
    if (workoutStart == null) setWorkoutStart(Date.now()) // il cronometro parte dalla prima serie segnata
    const rpe = d.rpe ? +d.rpe : null
    const id = serieLoggata(it.ex, kg, +d.reps, rpe) // specchio cloud: sessione + recupero reale
    setS({ ...s, log: [...s.log, { id, date: today(), ex: it.ex, kg, reps: +d.reps, rpe }] })
    startRest(it.rest)
    if (!cloudNudged) { // primo salvataggio: dico chiaramente dove sta finendo il dato
      cloudNudged = true
      const st = cloudState()
      toast(st === 'on' ? '☁ Serie sincronizzate nel cloud'
        : st === 'anon' ? 'Salvata in locale · accedi in Profilo → Cloud per sincronizzare'
        : 'Solo locale · riavvia il server dopo aver messo .env.local')
    }
  }
  const uncheck = (ex: string, nth: number) => {
    let seen = 0
    const idx = s.log.findIndex((x) => x.date === today() && x.ex === ex && seen++ === nth)
    if (idx < 0) return
    const rm = s.log[idx]
    if (rm.id) serieRimossa(rm.id) // il DB deve restare la verità: via anche dal cloud
    setS({ ...s, log: s.log.filter((_, j) => j !== idx) })
  }
  const finish = () => {
    if (!anyToday) return toast('Segna almeno una serie prima di chiudere')
    setSummary({ ...sessionSummary(s.log, today()), prs: prsForSession(s.log, today()) })
  }

  if (!items.length) return (
    <>
      <h2>Allenamento</h2>
      <p className="sm mut" style={{ lineHeight: 1.6 }}>Nessun giorno attivo. Vai in <b>Schede</b>, scegli un giorno e premi ▶ Inizia.</p>
    </>
  )

  const dur = workoutStart ? Math.floor((Date.now() - workoutStart) / 1000) : 0
  const todayVol = todayLog.reduce((a, x) => a + x.kg * x.reps, 0)
  // superset: un item plan con ss è legato al successivo; il seguente eredita il gruppo
  const inSS = (idx: number) => idx < plan.length && ((plan[idx]?.ss ?? false) || (idx > 0 && (plan[idx - 1]?.ss ?? false)))

  return (
    <>
      <div className="wbar">
        <div className="wbar-top">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="crumb">{curScheda(s)?.name} · allenamento</div>
            <div className="wbar-day">{day?.name}</div>
          </div>
          <button className="finito" onClick={finish}>Finito</button>
        </div>
        <div className="wstats">
          <div className="ws"><div className="l">Durata</div><div className="v num" style={{ color: workoutStart ? 'var(--teal)' : 'var(--mut2)' }}>{workoutStart ? mmss(dur) : '—'}</div></div>
          <div className="ws"><div className="l">Volume</div><div className="v num">{fmt(todayVol)} <span className="sm mut">kg</span></div></div>
          <div className="ws"><div className="l">Serie</div><div className="v num">{totalDone}</div></div>
        </div>
        <div className="bt" style={{ height: 5, marginTop: 10 }}><i style={{ width: pct + '%', background: 'var(--lime)' }} /></div>
      </div>
      <p className="hint num">✦ Pesi proposti dal coach · readiness <b>{r}</b> · ✓ conferma o correggi</p>

      {items.map((it, idx) => {
        const sps = specs(it)
        const done = Math.min(logOf(it.ex).length, sps.length)
        const exDone = done >= sps.length
        const tag = schemeTag(it)
        const isExtra = idx >= plan.length
        const ss = inSS(idx)
        return (
          <div className={'card excard' + (exDone ? ' completed' : '') + (ss ? ' ssgroup' : '')} key={it.ex}>
            <div className="exhead">
              <span className="exbar" style={{ background: ss ? 'var(--teal)' : mcolor(it.muscle) }} />
              <div style={{ minWidth: 0, flex: 1, cursor: 'pointer' }} onClick={() => setStatsEx(it.ex)}>
                <b style={{ fontSize: 15.5 }}>{it.ex} <span style={{ color: 'var(--mut2)', fontSize: 13 }}>›</span></b>{tag && <span className="stag">{tag}</span>}{ss && <span className="stag" style={{ color: 'var(--teal)', background: 'rgba(49,224,180,.12)' }}>Superset</span>}{isExtra && <span className="stag" style={{ color: 'var(--teal)', background: 'rgba(49,224,180,.12)' }}>Extra</span>}
                <div className="meta num"><span style={{ color: mcolor(it.muscle) }}>{it.muscle}</span></div>
                {it.note && <div className="note">✎ {it.note}</div>}
              </div>
              <span className={'exprog num' + (exDone ? ' ok' : '')}>{done}/{sps.length}</span>
              <span className="del gearbtn" onClick={() => setMenu({ it, isExtra, idx })} title="Opzioni esercizio"><Gear /></span>
              {isExtra && done === 0 && <span className="del" onClick={() => removeExtra(it.ex)}>✕</span>}
            </div>
            <button className="restchip" onClick={() => setRestPick({ ex: it.ex, isExtra })}>
              <Clock /> Riposo <b className="num">{mmss(it.rest)}</b>
            </button>
            {sps.map((sp, i) => {
              if (i < done) {
                const logged = logOf(it.ex)[i]
                return (
                  <div className="wrow done" key={i}>
                    <span className="sidx ok">✓</span>
                    <b className="num" style={{ fontSize: 14 }}>{fmt(logged.kg)} kg × {logged.reps}</b>
                    {logged.rpe != null && <span className={'r num ' + (logged.rpe >= 8.5 ? 'r-hi' : 'r-ok')}>RPE {fmt(logged.rpe)}</span>}
                    <span className="del" style={{ marginLeft: 'auto' }} onClick={() => uncheck(it.ex, i)}>✕</span>
                  </div>
                )
              }
              const active = i === done
              const d = getDraft(it, sp, i)
              return (
                <div className={'wrow st-' + sp.type + (active ? ' active' : ' pending')} key={i}>
                  <span className="sidx">{i + 1}</span>
                  <input value={d.kg} onChange={(e) => setD(it, sp, i, { kg: e.target.value })} inputMode="decimal" placeholder="kg" />
                  <span className="x">×</span>
                  <input value={d.reps} onChange={(e) => setD(it, sp, i, { reps: e.target.value })} inputMode="numeric" placeholder="reps" />
                  <select value={d.rpe} onChange={(e) => setD(it, sp, i, { rpe: e.target.value })}>
                    <option value="">RPE</option>{[6, 7, 7.5, 8, 8.5, 9, 9.5, 10].map((v) => <option key={v}>{v}</option>)}
                  </select>
                  <button className="chk" disabled={!active} onClick={() => check(it, sp, i)}>✓</button>
                  {(sp.type !== 'normal' || sp.load) && (
                    <div className="wsub">{setTypeLabel(sp.type)}{sp.load ? ` · ${sp.load}` : ''}</div>
                  )}
                </div>
              )
            })}
            <div className="setbtns" style={{ marginTop: 8 }}>
              <button className="addset" style={{ marginTop: 0 }} onClick={() => addSetRt(it, isExtra)}>＋ Aggiungi serie</button>
              <button className="addset rm" style={{ marginTop: 0 }} onClick={() => removeSetRt(it, isExtra)}>− Rimuovi</button>
            </div>
          </div>
        )
      })}

      {menu && (
        <div className="overlay" onClick={() => setMenu(null)}>
          <div className="sheet menusheet" onClick={(e) => e.stopPropagation()}>
            <div className="bc" style={{ margin: 0 }}>
              <span className="exbar" style={{ background: mcolor(menu.it.muscle), minHeight: 42 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="crumb" style={{ color: mcolor(menu.it.muscle) }}>{menu.it.muscle}</div>
                <div className="bt1">{menu.it.ex}</div>
              </div>
              <button className="pen" onClick={() => setMenu(null)}>✕</button>
            </div>
            <div className="menulist">
              <button className="menurow" onClick={() => { setSwap({ ex: menu.it.ex, isExtra: menu.isExtra }); setMenu(null) }}>
                <span className="mi"><MenuIcon t="swap" /></span>Sostituisci esercizio
              </button>
              {!menu.isExtra && plan.length > 1 && (
                <button className="menurow" onClick={() => { setReorder(true); setMenu(null) }}>
                  <span className="mi"><MenuIcon t="reorder" /></span>Riordina esercizi
                </button>
              )}
              {!menu.isExtra && menu.idx < plan.length - 1 && (
                <button className={'menurow' + (menu.it.ss ? ' on' : '')} onClick={() => toggleSuperset(menu.it)}>
                  <span className="mi"><MenuIcon t="link" /></span>{menu.it.ss ? 'Togli superset' : 'Superset col prossimo'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {swap && (
        <ExPicker lib={lib} title={'Sostituisci ' + swap.ex} onClose={() => setSwap(null)}
          onPick={doSwap} onCreate={createAndSwap} />
      )}
      {restPick && (() => {
        const it = items.find((x) => x.ex === restPick.ex)
        if (!it) return null
        return <RestPicker value={it.rest} onClose={() => setRestPick(null)}
          onChange={(v) => patchItem(restPick.ex, restPick.isExtra, (t) => { t.rest = v })} />
      })()}
      {reorder && <ReorderSheet plan={plan} onDone={applyOrder} />}

      <button className="ghost" style={{ marginTop: 12 }} onClick={() => setPicker(true)}>＋ Aggiungi esercizio alla seduta</button>
      {picker && (
        <ExPicker lib={lib} title="Alla seduta di oggi" onClose={() => setPicker(false)}
          onPick={addExtra} onCreate={createAndAddExtra} />
      )}
      {statsEx && <ExStats s={s} ex={statsEx} onClose={() => setStatsEx(null)} />}

      {summary && (
        <div className="card done">
          <div className="donecirc"><svg viewBox="0 0 24 24"><path d="M4 12l6 6L20 6" /></svg></div>
          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 17 }}>Sessione completata</div>
          <div className="tiles" style={{ marginTop: 12 }}>
            <div className="tile"><div className="l">Tonnellaggio</div><div className="v num">{fmt(summary.tonnage / 1000)} <span className="sm mut">t</span></div></div>
            <div className="tile"><div className="l">Serie</div><div className="v num">{summary.sets}</div></div>
            <div className="tile"><div className="l">RPE medio</div><div className="v num">{summary.avgRpe ? fmt(summary.avgRpe) : '—'}</div></div>
            <div className="tile"><div className="l">Record</div><div className="v num" style={{ color: summary.prs.length ? 'var(--amber)' : undefined }}>{summary.prs.length}</div></div>
          </div>
          {summary.prs.map((ex) => (
            <div className="prband" key={ex}>
              <span className="star">★</span><div><div className="pt2">Nuovo record</div><div className="pv2">{ex}</div></div>
            </div>
          ))}
          <button style={{ marginTop: 12 }} onClick={() => { setSummary(null); setWorkoutStart(null); sessioneChiusa() }}>Chiudi</button>
        </div>
      )}
    </>
  )
}

function Bar({ v, max, color, label, unit }: { v: number; max: number; color: string; label: string; unit: string }) {
  const pct = Math.min(100, max ? (v / max) * 100 : 0)
  return (
    <div className="bar">
      <span className="bn">{label}</span>
      <div className="bt"><i style={{ width: pct + '%', background: color }} /></div>
      <span className="bv num">{Math.round(v)}/{max} {unit}</span>
    </div>
  )
}

const FCOLOR: Record<string, string> = {
  Proteine: '#FB6F84', Carbo: '#F5B84A', 'Frutta/Verdura': '#8BD450', Latticini: '#63A6F5', Grassi: '#A78BFA',
}
const fcolor = (c: string) => FCOLOR[c] ?? '#7E8A9A'

// Anello macro compatto (proteine/carbo/grassi)
function MacroRing({ v, max, color, label }: { v: number; max: number; color: string; label: string }) {
  const R = 22, C = 2 * Math.PI * R
  const pct = max ? Math.min(1, v / max) : 0
  return (
    <div className="mring">
      <svg viewBox="0 0 56 56">
        <circle className="mr-bg" cx="28" cy="28" r={R} />
        <circle cx="28" cy="28" r={R} stroke={color} strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
          style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset .4s' }}
          fill="none" strokeWidth="5" strokeLinecap="round" />
        <text x="28" y="29" className="mr-v">{Math.round(v)}</text>
      </svg>
      <div className="mr-l" style={{ color }}>{label}</div>
      <div className="mr-t num">/{max}g</div>
    </div>
  )
}

const Barcode = () => (
  <svg viewBox="0 0 24 24" className="misvg" style={{ width: 18, height: 18 }}>
    <path d="M3 5v14M6.5 5v14M10 5v11M13 5v14M16.5 5v11M20 5v14" strokeWidth="1.6" />
  </svg>
)

// Scanner codice a barre: BarcodeDetector nativo se c'è, con inserimento manuale come fallback
function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [live, setLive] = useState(false)
  const [manual, setManual] = useState('')
  useEffect(() => {
    const BD = (window as unknown as { BarcodeDetector?: new (o?: object) => { detect: (v: unknown) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
    if (!BD || !navigator.mediaDevices?.getUserMedia) return
    let stream: MediaStream | null = null, stop = false
    const det = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (!videoRef.current) return
        videoRef.current.srcObject = stream; await videoRef.current.play(); setLive(true)
        const scan = async () => {
          if (stop || !videoRef.current) return
          try { const codes = await det.detect(videoRef.current); if (codes.length) { onCode(codes[0].rawValue); return } } catch { /* frame saltato */ }
          requestAnimationFrame(scan)
        }
        scan()
      } catch { setLive(false) }
    })()
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="overlay center" onClick={onClose}>
      <div className="dlg scanbox" onClick={(e) => e.stopPropagation()}>
        <b className="dt">Codice a barre</b>
        <div className="scanview">
          <video ref={videoRef} muted playsInline />
          {!live && <div className="scanhint sm mut">Inquadra il codice o inseriscilo a mano ↓</div>}
          {live && <div className="scanframe" />}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" placeholder="Codice (es. 8001505005707)" />
          <button style={{ width: 'auto', padding: '12px 16px' }} onClick={() => manual.trim() && onCode(manual.trim())}>Cerca</button>
        </div>
        <button className="ghost" style={{ marginTop: 8 }} onClick={onClose}>Chiudi</button>
      </div>
    </div>
  )
}

// Dettaglio alimento: quantità regolabile, anteprima macro, Salva (aggiunge solo qui)
function FoodDetail({ food, target, typeLabel, onSave, onClose }: {
  food: Food; target: State['target']; typeLabel: string; onSave: (grams: number) => void; onClose: () => void
}) {
  const [g, setG] = useState('100')
  const grams = parseFloat(g.replace(',', '.')) || 0
  const val = (x: number) => Math.round((x || 0) * grams / 100 * 10) / 10
  const kcal = Math.round((food.kcal || 0) * grams / 100)
  const kpct = target.kcal ? Math.round(kcal / target.kcal * 100) : 0
  const bump = (d: number) => setG((cur) => String(Math.max(0, Math.round((parseFloat(cur.replace(',', '.')) || 0) + d))))
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet fdetail" onClick={(e) => e.stopPropagation()}>
        <div className="bc" style={{ margin: 0 }}>
          <span className="exbar" style={{ background: fcolor(food.cat), minHeight: 42 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb" style={{ color: fcolor(food.cat) }}>{food.cat === 'Altro' ? 'Alimento' : food.cat}</div>
            <div className="bt1">{food.name}</div>
          </div>
          <button className="pen" onClick={onClose}>✕</button>
        </div>
        <div className="l" style={{ marginTop: 4 }}>Aggiungi a {typeLabel}</div>
        <div className="qrow">
          <button className="qbtn" onClick={() => bump(-10)}>−</button>
          <input value={g} onChange={(e) => setG(e.target.value)} inputMode="decimal" className="num" style={{ textAlign: 'center' }} />
          <button className="qbtn" onClick={() => bump(10)}>＋</button>
          <span className="qunit">grammi</span>
        </div>
        <button onClick={() => grams > 0 && onSave(grams)} style={{ marginTop: 12 }}>Salva nel diario</button>
        <div className="tiles" style={{ marginTop: 14 }}>
          <div className="tile"><div className="l">Calorie</div><div className="v num">{kcal} <span className="sm mut">({kpct}%)</span></div></div>
          <div className="tile"><div className="l">Grassi</div><div className="v num">{val(food.fat)} <span className="sm mut">g</span></div></div>
          <div className="tile"><div className="l">Carboidrati</div><div className="v num">{val(food.carbs)} <span className="sm mut">g</span></div></div>
          <div className="tile"><div className="l">Proteine</div><div className="v num">{val(food.protein)} <span className="sm mut">g</span></div></div>
        </div>
        <h2>Valori per 100 g</h2>
        <div className="card" style={{ padding: '4px 12px' }}>
          <div className="mrow"><span>Energia</span><b className="num">{food.kcal} kcal</b></div>
          <div className="mrow"><span>Grassi</span><b className="num">{food.fat} g</b></div>
          <div className="mrow"><span>Carboidrati</span><b className="num">{food.carbs} g</b></div>
          <div className="mrow"><span>Proteine</span><b className="num">{food.protein} g</b></div>
        </div>
      </div>
    </div>
  )
}

// Foglio archivio alimenti: recenti + cerca in locale + su OpenFoodFacts, filtra per categoria
function FoodPicker({ foods, recents, typeLabel, onPick, onClose, onCreate, onQuick, onBarcode, onAddExternal }: {
  foods: Food[]; recents: Food[]; typeLabel: string
  onPick: (f: Food) => void; onClose: () => void; onCreate: () => void; onQuick: () => void
  onBarcode: (code: string) => void; onAddExternal: (f: Food) => void
}) {
  const [scan, setScan] = useState(false)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [remote, setRemote] = useState<Food[]>([])
  const [searching, setSearching] = useState(false)
  const term = q.trim().toLowerCase()
  const words = term.split(/\s+/).filter(Boolean)
  const idle = !term && !cat // schermata iniziale: mostra i recenti
  const list = idle ? [] : foods
    .filter((f) => (!cat || f.cat === cat) && words.every((w) => f.name.toLowerCase().includes(w)))
    .sort((a, b) => (a.cat === b.cat ? a.name.localeCompare(b.name) : a.cat.localeCompare(b.cat)))
  // ricerca su OpenFoodFacts, con debounce; esclude i nomi già presenti in locale
  useEffect(() => {
    if (cat || term.length < 3) { setRemote([]); setSearching(false); return }
    setSearching(true)
    const id = setTimeout(async () => {
      try {
        const res = await searchFoods(term)
        const known = new Set(list.map((f) => f.name.toLowerCase()))
        setRemote(res.filter((f) => !known.has(f.name.toLowerCase())))
      } catch { setRemote([]) }
      setSearching(false)
    }, 350)
    return () => clearTimeout(id)
  }, [term, cat]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bc" style={{ margin: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb">Archivio alimenti</div>
            <div className="bt1">Aggiungi a {typeLabel}</div>
          </div>
          <button className="pen" onClick={onClose}>✕</button>
        </div>
        <div className="row">
          <input placeholder="Cerca alimento…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontFamily: 'var(--sans)' }} />
          <button className="scanbtn" onClick={() => setScan(true)} title="Codice a barre"><Barcode /></button>
        </div>
        <div className="chips scrollx">
          <button className={'chip' + (!cat ? ' on' : '')} onClick={() => setCat(null)}>Tutti</button>
          {FOOD_CATS.map((c) => (
            <button key={c} className={'chip' + (cat === c ? ' on' : '')} onClick={() => setCat(cat === c ? null : c)}>
              <span className="mdot" style={{ background: fcolor(c) }} />{c}
            </button>
          ))}
        </div>
        <div className="plist">
          {idle && recents.length > 0 && <div className="offhead" style={{ color: 'var(--mut)', borderTop: 0, paddingTop: 0 }}>Mangiati di recente</div>}
          {idle && recents.map((f) => (
            <div className="prow2" key={'r-' + f.name} onClick={() => onPick(f)}>
              <span className="exbar" style={{ background: fcolor(f.cat) }} />
              <div style={{ minWidth: 0 }}><b>{f.name}</b>
                <div className="meta num" style={{ color: fcolor(f.cat) }}>{f.kcal} kcal · {f.protein}P {f.carbs}C {f.fat}G <span className="mut">/100g</span></div></div>
              <span className="chev" style={{ color: 'var(--lime)' }}>＋</span>
            </div>
          ))}
          {idle && !recents.length && <p className="sm mut" style={{ margin: '14px 2px' }}>Cerca un alimento o scansiona un codice a barre.</p>}
          {list.map((f) => (
            <div className="prow2" key={f.name} onClick={() => onPick(f)}>
              <span className="exbar" style={{ background: fcolor(f.cat) }} />
              <div style={{ minWidth: 0 }}><b>{f.name}</b>
                <div className="meta num" style={{ color: fcolor(f.cat) }}>{f.kcal} kcal · {f.protein}P {f.carbs}C {f.fat}G <span className="mut">/100g</span></div></div>
              <span className="chev" style={{ color: 'var(--lime)' }}>＋</span>
            </div>
          ))}
          {(remote.length > 0 || searching) && (
            <div className="offhead">Da OpenFoodFacts {searching && <span className="mut">· cerco…</span>}</div>
          )}
          {remote.map((f) => (
            <div className="prow2" key={'off-' + f.name} onClick={() => onAddExternal(f)}>
              <span className="exbar" style={{ background: 'var(--blue)' }} />
              <div style={{ minWidth: 0 }}><b>{f.name}</b>
                <div className="meta num" style={{ color: 'var(--blue)' }}>{f.kcal} kcal · {f.protein}P {f.carbs}C {f.fat}G <span className="mut">/100g</span></div></div>
              <span className="chev" style={{ color: 'var(--lime)' }}>＋</span>
            </div>
          ))}
          {!idle && !list.length && !remote.length && !searching && (
            <p className="sm mut" style={{ margin: '14px 2px' }}>{term.length < 3 ? 'Niente in archivio: continua a scrivere per cercare online.' : 'Nessun prodotto trovato.'}</p>
          )}
        </div>
        <div className="row">
          <button className="ghost" onClick={onQuick}>Pasto veloce</button>
          <button className="ghost" onClick={onCreate}>+ Nuovo alimento</button>
        </div>
      </div>
      {scan && <BarcodeScanner onClose={() => setScan(false)} onCode={(code) => { setScan(false); onBarcode(code) }} />}
    </div>
  )
}

function Cibo({ s, setS }: { s: State; setS: (u: State) => void }) {
  const [view, setView] = useState<'diario' | 'cal' | 'piano'>('diario')
  return (
    <>
      <div className="seg" style={{ marginTop: 4 }}>
        {([['diario', 'Diario'], ['cal', 'Calendario'], ['piano', 'Piano']] as const).map(([k, l]) => (
          <button key={k} className={'sg' + (view === k ? ' on' : '')} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>
      {view === 'diario' && <CiboDiario s={s} setS={setS} />}
      {view === 'cal' && <CiboCalendario s={s} />}
      {view === 'piano' && <PianoView s={s} setS={setS} />}
    </>
  )
}

function CiboDiario({ s, setS }: { s: State; setS: (u: State) => void }) {
  const tot = nutritionToday(s.meals, today())
  const wt = waterToday(s.water, today()), wg = waterGoal(s)
  // un'unica voce acqua per oggi: così posso aggiungere, togliere o correggere il totale
  const setWater = (ml: number) => {
    const v = Math.max(0, Math.round(ml))
    setS({ ...s, water: [...s.water.filter((x) => x.date !== today()), ...(v > 0 ? [{ date: today(), ml: v }] : [])] })
    acquaSalvata(today(), v)
  }
  const setWaterExact = async () => {
    const v = await promptDlg('Acqua', [
      { label: 'Bevuta oggi (ml)', value: String(wt) },
      { label: 'Obiettivo giornaliero (ml)', value: String(s.target.water ?? 2500) },
    ])
    if (!v) return
    const goal = parseInt(v[1], 10) || (s.target.water ?? 2500)
    const drank = Math.max(0, parseInt(v[0], 10) || 0)
    setS({ ...s, target: { ...s.target, water: goal }, water: [...s.water.filter((x) => x.date !== today()), ...(drank > 0 ? [{ date: today(), ml: drank }] : [])] })
    acquaSalvata(today(), drank)
  }
  const [picker, setPicker] = useState<MealType | null>(null)
  const [detail, setDetail] = useState<{ food: Food; external: boolean } | null>(null)
  const foods = [...FOODS, ...s.customFoods]
  const typeLabel = MEAL_TYPES.find((t) => t.key === picker)?.label ?? ''

  // alimenti mangiati di recente, ricostruiti dai pasti (valori riportati a 100 g)
  const recents: Food[] = (() => {
    const out: Food[] = [], seen = new Set<string>()
    for (let i = s.meals.length - 1; i >= 0 && out.length < 10; i--) {
      const m = s.meals[i], key = m.name.toLowerCase(), g = m.grams || 100
      if (seen.has(key)) continue; seen.add(key)
      const r1 = (x: number) => Math.round((x || 0) / g * 1000) / 10
      out.push({ name: m.name, cat: foodLookup(m.name, s.customFoods)?.cat ?? 'Altro', kcal: Math.round((m.kcal || 0) / g * 100), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) })
    }
    return out
  })()

  const openDetail = (food: Food, external: boolean) => setDetail({ food, external })
  const pickFood = (f: Food) => openDetail(f, false)
  const addExternal = (f: Food) => openDetail(f, true)
  const saveDetail = (grams: number) => {
    if (!detail || !picker) return
    const { food, external } = detail
    const exists = [...FOODS, ...s.customFoods].some((x) => x.name.toLowerCase() === food.name.toLowerCase())
    const nm = [...s.meals, mealFromFood(food, grams, picker)]
    setS({ ...s, customFoods: external && !exists ? [...s.customFoods, food] : s.customFoods, meals: nm })
    pastiOggiAggiornati(nm, today())
    setDetail(null); setPicker(null)
  }
  const createFood = async () => {
    const v = await promptDlg('Nuovo alimento · valori per 100 g', [
      { label: 'Nome', placeholder: 'es. Fiocchi di latte' }, { label: 'Categoria', options: FOOD_CATS },
      { label: 'Kcal' }, { label: 'Proteine g' }, { label: 'Carboidrati g' }, { label: 'Grassi g' },
    ])
    const name = v?.[0]?.trim(); if (!name) return
    openDetail({ name, cat: v![1], kcal: +v![2] || 0, protein: +v![3] || 0, carbs: +v![4] || 0, fat: +v![5] || 0 }, true)
  }
  const quickMeal = async () => {
    const v = await promptDlg('Pasto veloce', [
      { label: 'Nome', placeholder: 'es. Cena fuori' }, { label: 'Kcal' },
      { label: 'Proteine g' }, { label: 'Carboidrati g' }, { label: 'Grassi g' },
    ])
    const name = v?.[0]?.trim(); if (!name) return
    const nm = [...s.meals, { date: today(), type: picker!, name, kcal: +v![1] || 0, protein: +v![2] || 0, carbs: +v![3] || 0, fat: +v![4] || 0 }]
    setS({ ...s, meals: nm })
    pastiOggiAggiornati(nm, today())
    setPicker(null)
  }
  const delMeal = (i: number) => {
    const d = s.meals[i]?.date ?? today()
    const nm = s.meals.filter((_, j) => j !== i)
    setS({ ...s, meals: nm })
    pastiOggiAggiornati(nm, d) // rimpiazza nel cloud i pasti di quel giorno
  }
  const addPlanItem = (type: MealType, item: { name: string; grams: number }) => {
    const nm = [...s.meals, planItemToMeal(item, type, s.customFoods)]
    setS({ ...s, meals: nm })
    pastiOggiAggiornati(nm, today())
  }
  const onBarcode = async (code: string) => {
    toast('Cerco il prodotto…')
    let f: Food | null = null
    try { f = await fetchFoodByBarcode(code) } catch { /* rete assente */ }
    if (!f) return toast('Prodotto non trovato. Prova un altro codice o inseriscilo a mano.')
    openDetail(f, true)
  }
  const editGoals = async () => {
    const v = await promptDlg('Obiettivi giornalieri', [
      { label: 'Calorie (kcal)', value: String(s.target.kcal) }, { label: 'Proteine g', value: String(s.target.protein) },
      { label: 'Carboidrati g', value: String(s.target.carbs) }, { label: 'Grassi g', value: String(s.target.fat) },
    ])
    if (!v) return
    setS({ ...s, target: { ...s.target, kcal: +v[0] || s.target.kcal, protein: +v[1] || s.target.protein, carbs: +v[2] || s.target.carbs, fat: +v[3] || s.target.fat } })
  }

  const kcalLeft = s.target.kcal - tot.kcal
  const kpct = Math.min(100, s.target.kcal ? (tot.kcal / s.target.kcal) * 100 : 0)
  const missing = Math.max(0, s.target.protein - tot.protein)

  return (
    <>
      <div className="card" style={{ marginTop: 12, position: 'relative' }}>
        <div className="kcalhead">
          <div>
            <div className="kcalbig num" style={{ color: kcalLeft < 0 ? 'var(--coral)' : 'var(--chalk)' }}>{Math.abs(Math.round(kcalLeft))}</div>
            <div className="l">{kcalLeft < 0 ? 'kcal oltre il target' : 'kcal rimaste'}</div>
          </div>
          <button className="pen goaledit" onClick={editGoals} title="Modifica obiettivi"><Gear size={17} /></button>
          <div className="kcalsub num">{Math.round(tot.kcal)} <span className="mut">/ {s.target.kcal}</span></div>
        </div>
        <div className="bt" style={{ height: 8, marginTop: 10 }}><i style={{ width: kpct + '%', background: kcalLeft < 0 ? 'var(--coral)' : 'var(--lime)' }} /></div>
        <div className="macros">
          <MacroRing v={tot.protein} max={s.target.protein} color="var(--teal)" label="Proteine" />
          <MacroRing v={tot.carbs} max={s.target.carbs} color="var(--amber)" label="Carbo" />
          <MacroRing v={tot.fat} max={s.target.fat} color="#A78BFA" label="Grassi" />
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="waterhead">
          <div className="num" style={{ fontSize: 26, fontWeight: 800 }}>{(wt / 1000).toFixed(1).replace('.', ',')} <span className="sm mut">/ {(wg / 1000).toFixed(1).replace('.', ',')} L</span></div>
          <button className="pen" style={{ width: 36, height: 36, fontSize: 15 }} onClick={setWaterExact} title="Imposta"><Gear size={16} /></button>
        </div>
        <div className="bt" style={{ height: 8, marginTop: 8 }}><i style={{ width: Math.min(100, wg ? wt / wg * 100 : 0) + '%', background: 'var(--blue)' }} /></div>
        <div className="waterbtns">
          <button className="wbtn minus" onClick={() => setWater(wt - 500)}>−500</button>
          <button className="wbtn minus" onClick={() => setWater(wt - 250)}>−250</button>
          <button className="wbtn" onClick={() => setWater(wt + 250)}>+250</button>
          <button className="wbtn" onClick={() => setWater(wt + 500)}>+500</button>
        </div>
        {wg > 2500 && <p className="sm mut" style={{ margin: '10px 2px 0' }}>Obiettivo <b style={{ color: 'var(--blue)' }}>+700 ml</b> oggi: ti alleni, servono più liquidi.</p>}
      </div>

      {MEAL_TYPES.map(({ key, label }) => {
        const ms = s.meals.map((m, i) => ({ m, i })).filter((x) => x.m.date === today() && (x.m.type ?? 'spuntino') === key)
        const kc = ms.reduce((a, x) => a + (x.m.kcal || 0), 0)
        const proposed = (s.mealPlan?.slots.find((sl) => sl.type === key)?.items ?? [])
          .filter((it) => {
            const resolved = (foodLookup(it.name, s.customFoods)?.name ?? it.name).toLowerCase()
            return !ms.some((x) => x.m.name.toLowerCase() === it.name.toLowerCase() || x.m.name.toLowerCase() === resolved)
          })
        return (
          <section className="mealsec" key={key}>
            <div className="mealhead">
              <span className="mh-t">{label}</span>
              {kc > 0 && <span className="num mut mh-k">{Math.round(kc)} kcal</span>}
              <button className="mh-add" onClick={() => setPicker(key)}>＋</button>
            </div>
            <div className="card mealcard">
              {ms.map(({ m, i }) => (
                <div className="set" key={'m' + i}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ex" style={{ fontSize: 14 }}>{m.name}{m.grams ? <span className="mut sm num"> · {m.grams}g</span> : null}</div>
                    <div className="meta num">{Math.round(m.protein || 0)}P · {Math.round(m.carbs || 0)}C · {Math.round(m.fat || 0)}G</div>
                  </div>
                  <span className="wb num" style={{ color: 'var(--chalk)', background: 'transparent', border: 0 }}>{Math.round(m.kcal)} kcal</span>
                  <span className="del" onClick={() => delMeal(i)}>✕</span>
                </div>
              ))}
              {proposed.map((it, j) => (
                <div className="set proposed" key={'p' + j} onClick={() => addPlanItem(key, it)}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ex" style={{ fontSize: 14 }}>{it.name}<span className="mut sm num"> · {it.grams}g</span></div>
                    <div className="meta">dal piano · tocca per aggiungere</div>
                  </div>
                  <span className="chev" style={{ color: 'var(--lime)', marginLeft: 'auto' }}>＋</span>
                </div>
              ))}
              {!ms.length && !proposed.length && (
                <p className="sm mut" onClick={() => setPicker(key)} style={{ margin: '9px 2px', cursor: 'pointer' }}>Vuoto — tocca ＋ per aggiungere</p>
              )}
            </div>
          </section>
        )
      })}

      <div className="msg" style={{ marginTop: 16 }}><div className="who">Carico Coach</div>
        {missing > 0
          ? <>Ti mancano <b>{Math.round(missing)} g di proteine</b> per il target: stasera pesce, uova o skyr.</>
          : <>Target proteico raggiunto: <b>ottimo</b>, il recupero muscolare ringrazia.</>}
      </div>

      {picker && (
        <FoodPicker foods={foods} recents={recents} typeLabel={typeLabel} onClose={() => setPicker(null)}
          onPick={pickFood} onCreate={createFood} onQuick={quickMeal} onBarcode={onBarcode} onAddExternal={addExternal} />
      )}
      {detail && (
        <FoodDetail food={detail.food} target={s.target} typeLabel={typeLabel}
          onClose={() => setDetail(null)} onSave={saveDetail} />
      )}
    </>
  )
}

// Calendario alimentazione + media 7 giorni
function CiboCalendario({ s }: { s: State }) {
  const [off, setOff] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + off)
  const y = base.getFullYear(), m = base.getMonth()
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7
  const nDays = new Date(y, m + 1, 0).getDate()
  const dstr = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const tracked = new Set(s.meals.map((x) => x.date))
  const monthName = base.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  const selTot = sel ? nutritionToday(s.meals, sel) : null
  const selMeals = sel ? s.meals.filter((x) => x.date === sel) : []

  // media ultimi 7 giorni con almeno un pasto
  const days: string[] = []
  for (let i = 0; i < 7; i++) { const t = new Date(); t.setDate(t.getDate() - i); days.push(t.toISOString().slice(0, 10)) }
  const logged = days.filter((d) => tracked.has(d))
  const avg = (sel: (n: ReturnType<typeof nutritionToday>) => number) =>
    logged.length ? Math.round(logged.reduce((a, d) => a + sel(nutritionToday(s.meals, d)), 0) / logged.length) : 0

  return (
    <>
      <h2>Media · ultimi 7 giorni</h2>
      <div className="tiles">
        <div className="tile"><div className="l">Kcal / giorno</div><div className="v num">{avg((n) => n.kcal)}</div></div>
        <div className="tile"><div className="l">Proteine / giorno</div><div className="v num">{avg((n) => n.protein)} <span className="sm mut">g</span></div></div>
        <div className="tile"><div className="l">Giorni tracciati</div><div className="v num">{logged.length}<span className="sm mut">/7</span></div></div>
        <div className="tile"><div className="l">Aderenza kcal</div><div className="v num">{s.target.kcal ? Math.round(avg((n) => n.kcal) / s.target.kcal * 100) : 0}<span className="sm mut">%</span></div></div>
      </div>

      <div className="bc" style={{ marginTop: 16 }}>
        <button className="back" onClick={() => { setOff(off - 1); setSel(null) }}>‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="bt1" style={{ fontSize: 18, textTransform: 'capitalize' }}>{monthName}</div>
        </div>
        <button className="back" onClick={() => { setOff(off + 1); setSel(null) }}>›</button>
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="cal">
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((w, i) => <div className="cw" key={i}>{w}</div>)}
          {Array.from({ length: firstDow }, (_, i) => <div className="cd off" key={'o' + i} />)}
          {Array.from({ length: nDays }, (_, i) => {
            const d = dstr(i + 1), isTr = tracked.has(d), isToday = d === today(), isSel = d === sel
            return (
              <div key={d} className={'cd' + (isTr ? ' tr' : '') + (isToday ? ' today' : '') + (isSel ? ' sel' : '')}
                onClick={() => isTr && setSel(isSel ? null : d)}>{i + 1}</div>
            )
          })}
        </div>
      </div>
      {sel && selTot && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <b style={{ fontSize: 16 }}>{new Date(sel + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}</b>
            <span className="meta num">{s.target.kcal ? Math.round(selTot.kcal / s.target.kcal * 100) : 0}% target</span>
          </div>
          <div className="tiles" style={{ marginTop: 10 }}>
            <div className="tile"><div className="l">Calorie</div><div className="v num">{Math.round(selTot.kcal)} <span className="sm mut">/ {s.target.kcal}</span></div></div>
            <div className="tile"><div className="l">Acqua</div><div className="v num">{(waterToday(s.water, sel) / 1000).toFixed(1).replace('.', ',')} <span className="sm mut">L</span></div></div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Bar v={selTot.protein} max={s.target.protein} color="var(--teal)" label="Proteine" unit="g" />
            <Bar v={selTot.carbs} max={s.target.carbs} color="var(--amber)" label="Carbo" unit="g" />
            <Bar v={selTot.fat} max={s.target.fat} color="#A78BFA" label="Grassi" unit="g" />
          </div>
          {MEAL_TYPES.map(({ key, label }) => {
            const ms = selMeals.filter((m) => (m.type ?? 'spuntino') === key)
            if (!ms.length) return null
            const kc = ms.reduce((a, m) => a + (m.kcal || 0), 0)
            return (
              <div key={key} style={{ marginTop: 12 }}>
                <div className="mealhead" style={{ margin: '0 2px 6px' }}><span className="mh-t">{label}</span><span className="num mut mh-k">{Math.round(kc)} kcal</span></div>
                {ms.map((m, i) => (
                  <div className="set" key={i}>
                    <div style={{ minWidth: 0 }}>
                      <div className="ex" style={{ fontSize: 13.5 }}>{m.name}{m.grams ? <span className="mut sm num"> · {m.grams}g</span> : null}</div>
                      <div className="meta num">{Math.round(m.protein || 0)}P · {Math.round(m.carbs || 0)}C · {Math.round(m.fat || 0)}G</div>
                    </div>
                    <span className="wb num" style={{ color: 'var(--chalk)', background: 'transparent', border: 0 }}>{Math.round(m.kcal)} kcal</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// Import piano alimentare + applicazione ai pasti di oggi (l'IA lo raffinerà con l'API)
function PianoView({ s, setS }: { s: State; setS: (u: State) => void }) {
  const [imp, setImp] = useState(false); const [text, setText] = useState('')
  const readFile = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) f.text().then(setText) }
  const doImport = () => {
    const p = parseMealPlan(text)
    if (!p) return toast('Formato non letto: usa righe come "Colazione: Avena 80g, Uova 100g"')
    setS({ ...s, mealPlan: p }); setImp(false); setText(''); toast('Piano importato')
  }
  const applyToday = () => {
    if (!s.mealPlan) return
    const already = new Set(s.meals.filter((m) => m.date === today()).map((m) => m.name.toLowerCase()))
    const add = s.mealPlan.slots.flatMap((sl) => sl.items.filter((it) => !already.has(it.name.toLowerCase()))
      .map((it) => planItemToMeal(it, sl.type, s.customFoods)))
    if (!add.length) return toast('Pasti del piano già presenti oggi')
    const nm = [...s.meals, ...add]
    setS({ ...s, meals: nm }); toast(`${add.length} pasti aggiunti a oggi`)
    pastiOggiAggiornati(nm, today())
  }
  const plan = s.mealPlan
  return (
    <>
      <div className="msg" style={{ marginTop: 12 }}><div className="who">Carico Coach</div>
        Incolla o carica il tuo piano alimentare: lo trasformo in pasti pronti da spuntare ogni giorno.
        <span className="sm mut" style={{ display: 'block', marginTop: 6 }}>Presto l'IA lo genererà e adatterà da sola.</span>
      </div>

      {plan ? (
        <>
          <div className="bc" style={{ marginTop: 14 }}>
            <div style={{ flex: 1, minWidth: 0 }}><div className="crumb">Piano attivo</div><div className="bt1">{plan.name}</div></div>
            <button className="pen" onClick={() => setS({ ...s, mealPlan: null })}>✕</button>
          </div>
          {plan.slots.map((sl, i) => (
            <section className="mealsec" key={i}>
              <div className="mealhead"><span className="mh-t">{MEAL_TYPES.find((t) => t.key === sl.type)?.label}</span></div>
              <div className="card mealcard">
                {sl.items.map((it, j) => {
                  const f = foodLookup(it.name, s.customFoods)
                  return (
                    <div className="set" key={j}>
                      <div style={{ minWidth: 0 }}><div className="ex" style={{ fontSize: 14 }}>{it.name}<span className="mut sm num"> · {it.grams}g</span></div>
                        <div className="meta num">{f ? `${Math.round(f.kcal * it.grams / 100)} kcal` : 'alimento non riconosciuto'}</div></div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
          <button style={{ marginTop: 14 }} onClick={applyToday}>Aggiungi i pasti di oggi</button>
          <button className="ghost" style={{ marginTop: 8 }} onClick={() => { setImp(true); setText('') }}>Importa un altro piano</button>
        </>
      ) : !imp ? (
        <button className="ghost" style={{ marginTop: 14 }} onClick={() => setImp(true)}>Importa piano da file o testo</button>
      ) : null}

      {imp && (
        <div className="card" style={{ marginTop: 12 }}>
          <input type="file" accept=".txt,.json" onChange={readFile} className="file" />
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7}
            placeholder={'Colazione: Avena 80g, Uova 100g, Banana 120g\nPranzo: Riso bianco 150g, Petto di pollo 200g\nSpuntino: Yogurt greco 170g\nCena: Salmone 150g, Insalata 100g'} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="ghost" onClick={() => { setImp(false); setText('') }}>Annulla</button>
            <button onClick={doImport}>Importa</button>
          </div>
        </div>
      )}
    </>
  )
}

function Sparkline({ values, color = '#C9F94E', h = 90 }: { values: number[]; color?: string; h?: number }) {
  const W = 300
  if (values.length < 2)
    return <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', height: h }}><text x="0" y={h / 2} fontSize="12" fill="#7E8A9A">Servono almeno 2 punti.</text></svg>
  const min = Math.min(...values) - 3, max = Math.max(...values) + 3
  const X = (i: number) => (i / (values.length - 1)) * W
  const Y = (v: number) => (h - 5) - ((v - min) / (max - min)) * (h - 15)
  const path = values.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', height: h, overflow: 'visible' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={X(values.length - 1)} cy={Y(values[values.length - 1])} r="3.5" fill={color} />
    </svg>
  )
}

// Scheda statistiche di un singolo esercizio (foglio a tutto schermo)
function ExStats({ s, ex, onClose }: { s: State; ex: string; onClose: () => void }) {
  const ds = historyDates(s.log, ex)
  const best = ds.length ? bestE1rm(s.log, ex) : 0
  const rec = record(s.log, ex)
  const volOf = (d: string) => s.log.filter((x) => x.ex === ex && x.date === d).reduce((a, x) => a + x.kg * x.reps, 0)
  const vols = ds.map(volOf)
  const bestVol = vols.length ? Math.max(...vols) : 0
  const last = ds.length ? ds[ds.length - 1] : null
  const daysAgo = last ? Math.floor((Date.now() - new Date(last + 'T12:00').getTime()) / 86400000) : null
  const mus = muscleOf(s, ex)
  const totVol = vols.reduce((a, v) => a + v, 0)
  const dRpe = rpeDelta(s.log, ex)
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bc" style={{ margin: 0 }}>
          <span className="exbar" style={{ background: mcolor(mus), minHeight: 42 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb" style={{ color: mcolor(mus) }}>{mus}</div>
            <div className="bt1">{ex}</div>
          </div>
          <button className="pen" onClick={onClose}>✕</button>
        </div>
        <div className="plist" style={{ borderTop: 0 }}>
          <div className="tiles">
            <div className="tile"><div className="l">1RM stimato</div><div className="v num">{best ? fmt(best) : '—'} <span className="sm mut">kg</span></div></div>
            <div className="tile"><div className="l">Record</div><div className="v num">{rec ? `${fmt(rec.kg)}×${rec.reps}` : '—'}</div></div>
            <div className="tile"><div className="l">Miglior volume</div><div className="v num">{bestVol ? fmt(bestVol / 1000) : '—'} <span className="sm mut">t</span></div></div>
            <div className="tile"><div className="l">Ultima volta</div><div className="v num" style={daysAgo != null && daysAgo > 10 ? { color: 'var(--amber)' } : undefined}>
              {daysAgo == null ? 'mai' : daysAgo === 0 ? 'oggi' : `${daysAgo} gg fa`}</div></div>
            <div className="tile"><div className="l">Trend RPE</div><div className="v num" style={{ color: dRpe >= 1 ? 'var(--amber)' : 'var(--teal)' }}>
              {ds.length < 2 ? '—' : (dRpe >= 0 ? '▲ +' : '▼ ') + fmt(Math.abs(dRpe))}</div></div>
            <div className="tile"><div className="l">Tonnellaggio tot</div><div className="v num">{fmt(totVol / 1000)} <span className="sm mut">t</span></div></div>
          </div>
          {ds.length > 1 && (<>
            <h2>1RM stimato</h2>
            <div className="card"><Sparkline values={ds.map((d) => sessionE1rm(s.log, ex, d))} h={72} /></div>
            <h2>Volume per seduta</h2>
            <div className="card"><Sparkline values={vols} color="#31E0B4" h={60} /></div>
          </>)}
          <h2>Storico · {ds.length} sedute</h2>
          <div className="card" style={{ padding: '4px 12px' }}>
            {ds.slice().reverse().map((d) => {
              const ss = s.log.filter((x) => x.ex === ex && x.date === d)
              const ar = avgRpeOf(s.log, ex, d)
              const rd = readinessOn(s, d)
              return (
                <div className="set" key={d}>
                  <span className="mono sm mut num" style={{ width: 56, flex: 'none' }}>{d.slice(5).split('-').reverse().join('/')}</span>
                  <b className="num sm">{fmt(ss[0].kg)} · {ss.map((x) => x.reps).join('/')}</b>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {rd != null && <span className="r num" style={{ color: rColor(rd), background: 'var(--surf2)' }} title="readiness del giorno">⚡{rd}</span>}
                    {ar > 0 && <span className={'r num ' + (ar >= 8.5 ? 'r-hi' : 'r-ok')}>RPE {fmt(ar)}</span>}
                  </span>
                </div>
              )
            })}
            {!ds.length && <p className="sm mut" style={{ margin: '10px 2px' }}>Mai allenato: parti oggi.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Statistiche({ s, onOpen }: { s: State; onOpen: (ex: string) => void }) {
  const exList = useMemo(() => [...new Set([...allItems(s).map((p) => p.ex), ...s.log.map((l) => l.ex)])], [s])
  const mv = muscleVolume(s)
  const mvEntries = Object.entries(mv).sort((a, b) => b[1] - a[1])
  return (
    <>
      <h2>Volume per gruppo · 7 giorni</h2>
      <div className="card">
        {mvEntries.length ? mvEntries.map(([m, n]) => (
          <div className="bar" key={m}>
            <span className="bn" style={{ color: mcolor(m) }}>{m}</span>
            <div className="bt"><i style={{ width: Math.min(100, (n / 16) * 100) + '%', background: n < 8 ? 'var(--amber)' : 'var(--lime)' }} /></div>
            <span className="bv num">{n} serie</span>
          </div>
        )) : <p className="sm mut" style={{ margin: '10px 2px' }}>Nessuna serie negli ultimi 7 giorni.</p>}
        <p className="hint">Target: 10-20 serie/gruppo · <span style={{ color: 'var(--amber)' }}>ambra</span> = poco allenato</p>
      </div>
      <h2>Esercizi</h2>
      {exList.map((ex) => {
        const ds = historyDates(s.log, ex)
        const best = ds.length ? bestE1rm(s.log, ex) : 0
        const last = ds.length ? ds[ds.length - 1] : null
        const daysAgo = last ? Math.floor((Date.now() - new Date(last + 'T12:00').getTime()) / 86400000) : null
        const mus = muscleOf(s, ex)
        return (
          <div className="navcard" key={ex} onClick={() => onOpen(ex)}>
            <span className="exbar" style={{ background: mcolor(mus) }} />
            <div style={{ minWidth: 0 }}>
              <b>{ex}</b>
              <div className="meta num">
                {best ? fmt(best) + ' kg 1RM' : 'mai fatto'}
                {daysAgo != null && <> · <span style={daysAgo > 10 ? { color: 'var(--amber)' } : undefined}>{daysAgo === 0 ? 'oggi' : daysAgo + ' gg fa'}</span></>}
              </div>
            </div>
            <span className="chev">›</span>
          </div>
        )
      })}
    </>
  )
}

function Calendario({ s, onRepeat }: { s: State; onRepeat: (date: string) => void }) {
  const [off, setOff] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + off)
  const y = base.getFullYear(), m = base.getMonth()
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7
  const nDays = new Date(y, m + 1, 0).getDate()
  const dstr = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const trained = new Set(s.log.map((l) => l.date))
  const monthName = base.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  const monthDates = [...trained].filter((d) => d.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`))
  const monthVol = s.log.filter((l) => monthDates.includes(l.date)).reduce((a, l) => a + l.kg * l.reps, 0)
  const selSum = sel ? sessionSummary(s.log, sel) : null
  const selExs = sel ? [...new Set(s.log.filter((l) => l.date === sel).map((x) => x.ex))] : []
  const rpes = s.log.filter((l) => l.rpe != null).map((l) => l.rpe as number)
  const avgRpe = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 0
  return (
    <>
      <h2>Panoramica</h2>
      <div className="tiles">
        <div className="tile"><div className="l">Sedute totali</div><div className="v num">{totalWorkouts(s.log)}</div></div>
        <div className="tile"><div className="l">Serie di fila</div><div className="v num">{streak(s.log)} <span className="sm mut">gg</span></div></div>
        <div className="tile"><div className="l">Sollevato in tutto</div><div className="v num">{fmt(totalTonnage(s.log) / 1000)} <span className="sm mut">t</span></div></div>
        <div className="tile"><div className="l">RPE medio</div><div className="v num">{avgRpe ? fmt(avgRpe) : '—'}</div></div>
      </div>
      <div className="bc" style={{ marginTop: 16 }}>
        <button className="back" onClick={() => { setOff(off - 1); setSel(null) }}>‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="bt1" style={{ fontSize: 18, textTransform: 'capitalize' }}>{monthName}</div>
          <div className="meta num">{monthDates.length} sedute · {fmt(monthVol / 1000)} t</div>
        </div>
        <button className="back" onClick={() => { setOff(off + 1); setSel(null) }}>›</button>
      </div>
      <div className="card" style={{ padding: 12 }}>
        <div className="cal">
          {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((w, i) => <div className="cw" key={i}>{w}</div>)}
          {Array.from({ length: firstDow }, (_, i) => <div className="cd off" key={'o' + i} />)}
          {Array.from({ length: nDays }, (_, i) => {
            const d = dstr(i + 1)
            const isTr = trained.has(d), isToday = d === today(), isSel = d === sel
            return (
              <div key={d} className={'cd' + (isTr ? ' tr' : '') + (isToday ? ' today' : '') + (isSel ? ' sel' : '')}
                onClick={() => isTr && setSel(isSel ? null : d)}>{i + 1}</div>
            )
          })}
        </div>
      </div>
      {sel && selSum && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b style={{ fontSize: 16 }}>{sel.split('-').reverse().join('/')}</b>
            <span style={{ display: 'flex', gap: 6 }}>
              {readinessOn(s, sel) != null && <span className="r num" style={{ color: rColor(readinessOn(s, sel)!), background: 'var(--surf2)' }}>⚡{readinessOn(s, sel)}</span>}
              {selSum.avgRpe > 0 && <span className={'r num ' + (selSum.avgRpe >= 8.5 ? 'r-hi' : 'r-ok')}>RPE {fmt(selSum.avgRpe)}</span>}
            </span>
          </div>
          <div className="tiles" style={{ marginTop: 10 }}>
            <div className="tile"><div className="l">Tonnellaggio</div><div className="v num">{fmt(selSum.tonnage / 1000)} <span className="sm mut">t</span></div></div>
            <div className="tile"><div className="l">Serie</div><div className="v num">{selSum.sets}</div></div>
          </div>
          <div style={{ marginTop: 6 }}>
            {selExs.map((ex) => {
              const ss = s.log.filter((x) => x.date === sel && x.ex === ex)
              return (
                <div className="set" key={ex}>
                  <span className="exbar" style={{ background: mcolor(muscleOf(s, ex)), minHeight: 26 }} />
                  <b className="sm">{ex}</b>
                  <span className="meta num" style={{ marginLeft: 'auto' }}>{fmt(ss[0].kg)} · {ss.map((x) => x.reps).join('/')}</span>
                </div>
              )
            })}
          </div>
          <button style={{ marginTop: 12 }} onClick={() => onRepeat(sel)}>↻ Ripeti questa seduta oggi</button>
        </div>
      )}
    </>
  )
}

function Coach({ s }: { s: State }) {
  const r = readiness(s.checkin)
  const rep = weeklyReport(s)
  const msgs: string[] = []
  if (s.checkin.date !== today())
    msgs.push('Non hai fatto il <b>check-in di oggi</b>: 30 secondi nella tab Oggi e i pesi diventano affidabili.')
  for (const f of rep.flags) {
    const ds = historyDates(s.log, f.ex)
    msgs.push(`<span class="warn">${f.ex}: fatica in accumulo.</span> A parità di carico l'RPE medio è passato da <b>${fmt(avgRpeOf(s.log, f.ex, ds[0]))}</b> a <b>${fmt(avgRpeOf(s.log, f.ex, ds[ds.length - 1]))}</b>. Ho già ridotto la proposta: ripetizioni pulite e tra una settimana risaliamo.`)
  }
  if (r < 65) msgs.push(`Readiness <span class="warn">${r}/100</span>: oggi conta presentarsi. Proposte ridotte del 10%.`)
  if (!msgs.length) msgs.push(`Tutto in linea: readiness <b>${r}/100</b> e nessun segnale di accumulo. Chiudi le serie a RPE 8.`)
  return (
    <>
      <h2>Report settimanale</h2>
      <div className={'verdict ' + (rep.scarico ? 'warn' : 'ok')}>
        <div className="vt">{rep.scarico ? 'ATTENZIONE' : 'IN LINEA'}</div>
        <div className="vh">{rep.scarico ? 'Fatica in accumulo' : 'Settimana solida'}</div>
        <div className="vd">
          {rep.scarico
            ? <>Consiglio una <b>settimana di scarico</b>: volume −30%, carichi −10%. Torni a spingere più forte di prima.</>
            : <>Nessun fondamentale in accumulo. Prosegui con la progressione: aggiungo carico quando l'RPE resta basso.</>}
        </div>
      </div>
      <h2>Coach</h2>
      {msgs.map((m, i) => (
        <div className="msg" key={i}><div className="who">Carico Coach</div><span dangerouslySetInnerHTML={{ __html: m }} /></div>
      ))}
      <p className="hint">Beta: coach a regole · la chat AI arriva con l'API</p>
    </>
  )
}

function Profilo({ s, setS }: { s: State; setS: (u: State) => void }) {
  const cur = s.body.length ? s.body[s.body.length - 1].kg : 0
  const first = s.body.length ? s.body[0].kg : cur
  const [w, setW] = useState('')
  const [sub, setSub] = useState<'profilo' | 'set'>('profilo')
  useTop(sub)
  const goalCur = bestE1rm(s.log, s.goal.ex)
  const gpct = Math.min(100, Math.round((goalCur / s.goal.targetKg) * 100))
  const lvl = level(s.log), st = streak(s.log), tw = totalWorkouts(s.log), ton = totalTonnage(s.log)
  const bg = badges(s)
  const addW = () => {
    if (!w) return
    setS({ ...s, body: [...s.body.filter((b) => b.date !== today()), { date: today(), kg: +w }] })
    pesoSalvato(today(), +w)
    setW('')
  }

  const r = readiness(s.checkin)
  const rLabel = r >= 80 ? 'PRONTO' : r >= 65 ? 'OK' : 'SCARICA'
  const rCol = r >= 80 ? 'var(--teal)' : r >= 65 ? 'var(--amber)' : 'var(--coral)'
  const ciDone = s.checkin.date === today()

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const since = weekAgo.toISOString().slice(0, 10)
  const weekSessions = new Set(s.log.filter((l) => l.date > since).map((l) => l.date)).size

  const fdays = Array.from({ length: 7 }, (_, i) => { const t = new Date(); t.setDate(t.getDate() - i); return t.toISOString().slice(0, 10) })
  const flogged = fdays.filter((d) => s.meals.some((m) => m.date === d))
  const favg = (pick: (n: ReturnType<typeof nutritionToday>) => number) =>
    flogged.length ? Math.round(flogged.reduce((a, d) => a + pick(nutritionToday(s.meals, d)), 0) / flogged.length) : 0
  const ftot = nutritionToday(s.meals, today())

  return (
    <>
      <div className="seg" style={{ marginTop: 4 }}>
        {([['profilo', 'Profilo'], ['set', '']] as const).map(([k, l]) => (
          <button key={k} className={'sg' + (sub === k ? ' on' : '')} onClick={() => setSub(k)}>
            {k === 'set' ? <Gear size={18} /> : l}
          </button>
        ))}
      </div>

      {sub === 'set' && <Impostazioni s={s} setS={setS} />}
      {sub !== 'profilo' ? null : (<>
      <h2>Stato di oggi</h2>
      <div className="card ready">
        <Ring v={r} color={rCol} />
        <div style={{ minWidth: 0 }}>
          <div className="rl" style={{ color: rCol }}>{rLabel} · READINESS</div>
          <div className="rh">{ciDone ? 'Check-in fatto oggi' : 'Check-in da fare'}</div>
          <div className="rd num">Sonno {s.checkin.sonno} · Energia {s.checkin.energia} · DOMS {s.checkin.doms} · Stress {s.checkin.stress}</div>
        </div>
      </div>

      <h2>Allenamento</h2>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div className="mono sm mut" style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase' }}>Livello</div>
            <div style={{ fontSize: 30, fontWeight: 800 }} className="num">{lvl.n}</div>
          </div>
          <div className="flame"><span>🔥</span><b className="num">{st}</b><span className="sm mut">giorni</span></div>
        </div>
        <div className="bt" style={{ marginTop: 10 }}><i style={{ width: (lvl.into / lvl.need * 100) + '%', background: 'var(--lime)' }} /></div>
        <div className="tiles" style={{ marginTop: 12 }}>
          <div className="tile"><div className="l">Sessioni</div><div className="v num">{tw}</div></div>
          <div className="tile"><div className="l">Questa settimana</div><div className="v num">{weekSessions}</div></div>
          <div className="tile"><div className="l">Sollevato</div><div className="v num">{fmt(ton / 1000)} <span className="sm mut">t</span></div></div>
          <div className="tile"><div className="l">{s.goal.ex}</div><div className="v num">{fmt(goalCur)}<span className="sm mut">/{s.goal.targetKg} · {gpct}%</span></div></div>
        </div>
      </div>

      <h2>Alimentazione</h2>
      <div className="card">
        <div className="tiles">
          <div className="tile"><div className="l">Kcal oggi</div><div className="v num">{Math.round(ftot.kcal)} <span className="sm mut">/ {s.target.kcal}</span></div></div>
          <div className="tile"><div className="l">Proteine oggi</div><div className="v num">{Math.round(ftot.protein)} <span className="sm mut">/ {s.target.protein}g</span></div></div>
          <div className="tile"><div className="l">Media kcal 7gg</div><div className="v num">{favg((n) => n.kcal)}</div></div>
          <div className="tile"><div className="l">Media prot. 7gg</div><div className="v num">{favg((n) => n.protein)} <span className="sm mut">g</span></div></div>
        </div>
      </div>

      <h2>Peso corporeo</h2>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 30, fontWeight: 800 }} className="num">{fmt(cur)}<span className="sm mut"> kg</span></div>
          <span className="delta num">{cur - first >= 0 ? '▲ +' : '▼ '}{fmt(cur - first)} kg</span>
        </div>
        <Sparkline values={s.body.map((b) => b.kg)} color="#31E0B4" h={54} />
        <div className="row" style={{ marginTop: 8 }}>
          <input type="number" placeholder="peso di oggi (kg)" step="0.1" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
          <button style={{ width: 'auto', padding: '10px 16px' }} onClick={addW}>Salva</button>
        </div>
      </div>

      <h2>Badge</h2>
      <div className="badges">
        {bg.map((b) => (
          <div className={'badge' + (b.got ? ' got' : '')} key={b.name}>
            <div className="bi">{b.icon}</div><div className="bl">{b.name}</div>
          </div>
        ))}
      </div>
      </>)}
    </>
  )
}

const Tog = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
  <button className={'tog' + (on ? ' on' : '')} onClick={() => set(!on)} aria-label={on ? 'Attivo' : 'Spento'}><i /></button>
)

// Traduce i messaggi d'errore di Supabase (inglesi) in italiano leggibile.
function traduciAuth(m: string): string {
  const l = m.toLowerCase()
  if (l.includes('invalid login')) return 'Email o password non corretti.'
  if (l.includes('already registered') || l.includes('already exists')) return 'Email già registrata: accedi.'
  if (l.includes('password should be') || l.includes('at least 6')) return 'La password deve avere almeno 6 caratteri.'
  if (l.includes('unable to validate email') || l.includes('invalid email')) return 'Email non valida.'
  if (l.includes('rate limit') || l.includes('too many')) return 'Troppi tentativi: riprova tra poco.'
  if (l.includes('email not confirmed')) return 'Devi prima confermare l\'email (controlla la posta).'
  return m
}

// Form di autenticazione riusabile: gate a schermo intero e card in Profilo.
// Messaggi inline (non toast che spariscono); il post-login (chiusura gate) avviene via onAuthStateChange.
function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  if (!supa) return null
  const sb = supa
  const go = async () => {
    setMsg(null)
    const em = email.trim()
    if (!em || pw.length < 6) return setMsg('Inserisci email e password (almeno 6 caratteri).')
    setBusy(true)
    try {
      if (mode === 'in') {
        const r = await sb.auth.signInWithPassword({ email: em, password: pw })
        if (r.error) setMsg(traduciAuth(r.error.message))
        // se ok, onAuthStateChange chiude il gate
      } else {
        const r = await sb.auth.signUp({ email: em, password: pw })
        if (r.error) {
          const t = traduciAuth(r.error.message)
          if (/già registrata/.test(t)) setMode('in') // email esistente: porta al login
          return setMsg(t)
        }
        // Su alcune config Supabase l'email esistente non dà errore ma user con identities vuote
        if (r.data.user && (r.data.user.identities?.length ?? 0) === 0) {
          setMode('in'); setMsg('Questa email è già registrata: accedi con la tua password.')
        } else if (!r.data.session) {
          setMsg('Ti ho inviato una mail: conferma l\'account, poi accedi.')
        }
        // se c'è la sessione, onAuthStateChange chiude il gate
      }
    } finally { setBusy(false) }
  }
  return (
    <>
      <input type="email" placeholder="email" autoComplete="email" inputMode="email"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="password (min 6)" style={{ marginTop: 8 }}
        autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
        value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
      <button disabled={busy} style={{ marginTop: 12 }} onClick={go}>
        {busy ? '…' : mode === 'in' ? 'Entra' : 'Crea account'}
      </button>
      <button className="linklike" disabled={busy} onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
        {mode === 'in' ? 'Non hai un account? Registrati' : 'Hai già un account? Accedi'}
      </button>
      {msg && <p className="authmsg">{msg}</p>}
    </>
  )
}

// Schermata di login a tutto schermo: prima cosa all'avvio, senza accesso non si procede.
function AuthGate() {
  return (
    <div className="authgate">
      <div className="authbox">
        <div className="authbrand"><span className="mark">CARICO</span><span className="dot" /></div>
        <p className="authtag">Accedi o crea un account per iniziare.</p>
        <AuthForm />
      </div>
    </div>
  )
}

// Card account in Profilo: stato + logout se loggato, altrimenti il form inline (per chi è in locale).
function Cloud() {
  const [user, setUser] = useState<string | null>(null)
  useEffect(() => {
    if (!supa) return
    supa.auth.getSession().then(({ data }) => setUser(data.session?.user.email ?? null))
    const { data: sub } = supa.auth.onAuthStateChange((_e, s2) => setUser(s2?.user.email ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])
  if (!supa) return (
    <div className="card"><p className="sm mut" style={{ margin: 0 }}>
      Cloud non configurato: metti le chiavi Supabase in <b>.env.local</b> e riavvia.
    </p></div>
  )
  const sb = supa
  if (user) return (
    <div className="card">
      <div className="mrow"><span>Connesso</span><b style={{ fontSize: 13 }}>{user}</b></div>
      {pending() > 0 && <div className="mrow"><span>Serie in coda</span><b className="num">{pending()}</b></div>}
      <button className="ghost" style={{ marginTop: 10 }} onClick={() => { void sb.auth.signOut(); toast('Disconnesso') }}>Esci</button>
    </div>
  )
  return <div className="card"><p className="sm mut" style={{ margin: 0 }}>Non connesso.</p></div>
}

function Impostazioni({ s, setS }: { s: State; setS: (u: State) => void }) {
  const lib = [...EXERCISES, ...s.customExercises]
  const setOpt = (k: 'sound' | 'vibrate', v: boolean) => setS({ ...s, settings: { ...s.settings, [k]: v } })
  const setTarget = (k: 'kcal' | 'protein', v: number) => setS({ ...s, target: { ...s.target, [k]: v } })
  const editGoal = async () => {
    const v = await promptDlg('Obiettivo', [
      { label: 'Esercizio', options: lib.map((e) => e.name), value: s.goal.ex },
      { label: 'Kg da raggiungere', value: String(s.goal.targetKg) },
    ])
    if (v) setS({ ...s, goal: { ex: v[0], targetKg: parseFloat(v[1].replace(',', '.')) || s.goal.targetKg } })
  }
  const doInstall = async () => {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null }
    else toast(isStandalone() ? 'App già installata ✓'
      : isIOS() ? 'Safari: Condividi ⇧ → "Aggiungi a Home"'
      : 'Menu del browser (⋮) → "Installa app"')
  }
  const exportData = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }))
    a.download = `carico-backup-${today()}.json`
    a.click(); URL.revokeObjectURL(a.href)
  }
  const importData = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return
    f.text().then((t) => {
      try {
        const p = JSON.parse(t)
        if (!p.schede) throw new Error('non valido')
        setS({ ...emptyState(), ...p }); toast('Backup ripristinato ✓')
      } catch { toast('File non valido: serve un backup di CARICO') }
    })
    e.target.value = ''
  }
  const reset = async () => {
    if (await confirmDlg('Azzerare tutti i dati?', 'Schede, storico e pasti spariscono. Fai prima un backup.')) setS(emptyState())
  }
  const restoreCloud = async () => {
    if (!supa) return toast('Cloud non configurato')
    const uid = (await supa.auth.getSession()).data.session?.user.id
    if (!uid) return toast('Accedi prima nel Cloud')
    if (!(await confirmDlg('Caricare i dati dal cloud?', 'Sostituisce i dati di questo dispositivo con quelli salvati nel cloud.'))) return
    const cloud = await pullAll(uid)
    if (!cloud) return toast('Niente da caricare')
    setS(statoDaCloud(cloud)); toast('Dati caricati dal cloud ✓')
  }
  return (
    <>
      <h2>Allenamento</h2>
      <div className="card">
        <div className="mrow"><span>Suono a fine recupero</span><Tog on={s.settings.sound} set={(v) => setOpt('sound', v)} /></div>
        <div className="mrow"><span>Vibrazione a fine recupero</span><Tog on={s.settings.vibrate} set={(v) => setOpt('vibrate', v)} /></div>
      </div>
      <h2>Obiettivo attivo</h2>
      <div className="card">
        <div className="mrow"><span>{s.goal.ex}</span><b className="num">{s.goal.targetKg} kg</b></div>
        <button className="ghost" style={{ marginTop: 10 }} onClick={editGoal}>Cambia obiettivo</button>
      </div>
      <h2>Target nutrizionale</h2>
      <div className="card">
        <div className="mrow"><span>Calorie (kcal)</span>
          <input className="numedit" type="number" inputMode="numeric" value={s.target.kcal} onChange={(e) => setTarget('kcal', +e.target.value)} /></div>
        <div className="mrow"><span>Proteine (g)</span>
          <input className="numedit" type="number" inputMode="numeric" value={s.target.protein} onChange={(e) => setTarget('protein', +e.target.value)} /></div>
      </div>
      <h2>App</h2>
      <div className="card">
        <button className="ghost" onClick={doInstall}>⤓ Installa sulla schermata home</button>
        <button className="ghost" style={{ marginTop: 8 }} onClick={exportData}>Esporta dati (backup)</button>
        <label className="ghost filebtn">Importa backup
          <input type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
        </label>
        <button className="ghost" style={{ marginTop: 8 }} onClick={restoreCloud}>Carica dati dal cloud</button>
        <button className="ghost" style={{ marginTop: 8, color: 'var(--coral)' }} onClick={reset}>Azzera tutti i dati</button>
      </div>
      <h2>Cloud</h2>
      <Cloud />
      <p className="hint">Schede e pasti vivono su questo dispositivo (esporta un backup ogni tanto); le serie vanno anche nel cloud quando sei connesso.</p>
    </>
  )
}

function Icon({ t }: { t: Tab }) {
  const paths: Record<Tab, string[]> = {
    oggi: ['M3 11l9-8 9 8', 'M5 10v10h14V10'],
    schede: ['M4 6h16', 'M4 12h16', 'M4 18h10'],
    allena: ['M6 8v8', 'M18 8v8', 'M3 10v4', 'M21 10v4', 'M6 12h12'],
    cibo: ['M6 3v8', 'M9 3v8', 'M7.5 11v10', 'M15 3c-1 2-1 6 1 7v11'],
    coach: ['M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
    profilo: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21c0-4 4-6 8-6s8 2 8 6'],
  }
  return <svg viewBox="0 0 24 24">{paths[t].map((d, i) => <path key={i} d={d} />)}</svg>
}

const isStandalone = () => matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && (navigator as { standalone?: boolean }).standalone === true)
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

// Banner "installa in home": usa l'evento catturato a livello modulo, istruzioni manuali su iOS.
function InstallPrompt() {
  const [evt, setEvt] = useState(installEvt)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const on = () => setEvt(installEvt)
    window.addEventListener('carico-installable', on)
    return () => window.removeEventListener('carico-installable', on)
  }, [])
  if (hidden || isStandalone() || localStorage.getItem('carico-noinstall') || (!evt && !isIOS())) return null
  const close = () => { setHidden(true); localStorage.setItem('carico-noinstall', '1') }
  const install = async () => {
    if (!evt) return
    evt.prompt()
    await evt.userChoice
    installEvt = null; setEvt(null)
  }
  return (
    <div className="installbar">
      <div className="ib-ico">⤓</div>
      <div className="ib-tx">
        <b>Installa CARICO</b>
        <span>{evt ? 'Aggiungila alla home: si apre a schermo intero.'
          : 'Tocca Condividi ⇧ poi "Aggiungi a Home".'}</span>
      </div>
      {evt && <button className="ib-btn" onClick={install}>Installa</button>}
      <button className="ib-x" onClick={close}>✕</button>
    </div>
  )
}
