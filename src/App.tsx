import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  type State, type Scheda, type PlanItem, today, fmt, proposta, readiness, readinessOn, e1rm,
  e1rmRpe, caricoPerRpe, round25, sessionExOf, setSessionEx, parseTarget, massimale, progressione, contestoEsercizio,
  historyDates, bestE1rm, avgRpeOf, record, prSerie,
  prsForSession, sessionSummary, weeklyReport, nutritionToday, emptyState, stimaCalorie,
  muscleVolume, waterToday, waterGoal, adaptSession,
  streak, level, badges, totalWorkouts, totalTonnage, volume, isTimed,
  curScheda, curDay, curItems, allItems, MUSCLES, EXERCISES, lookupMuscle, parseScheda, libreriaEsercizi, PUNTI_MISURA,
  type SetType, type SetSpec, SET_TYPES, setTypeLabel, itemReps, itemSetCount, schemeSummary, schemeTag, makePreset,
  type MealType, type Food, MEAL_TYPES, FOOD_CATS, FOODS, mealFromFood,
  foodLookup, planItemToMeal, parseMealPlan, fetchFoodByBarcode, searchFoods,
} from './coach'
import { DialogHost, confirmDlg, promptDlg, toast } from './dialog'
import { supa } from './data/client'
import { serieLoggata, serieRimossa, serieModificata, sessioneChiusa, sessioneAnnullata, pending, cloudState, checkinSalvato, pesoSalvato, acquaSalvata, pastiOggiAggiornati, configSalvata, ricaricaNelCloud, pullAll, flush } from './data/sync'
import { uploadVideo, videoUrl, deleteVideo } from './data/storage'
import { chiamaCoach, type ChatMsg } from './ai/coach'
import { parseSchedaFile } from './ai/parser'

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
const Dumb = () => (
  <svg viewBox="0 0 24 24" className="misvg" style={{ width: 14, height: 14 }}>
    <path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" />
  </svg>
)

const LS = 'carico-v1'
// A CHI appartengono i dati locali. Senza, entrando con un altro account l'app trovava dati
// "non freschi" e li spingeva nel cloud del nuovo utente, sovrascrivendo i suoi.
const UIDK = 'carico-uid'
let cloudNudged = false // un solo avviso di stato cloud per caricamento pagina
const SALUTE_SHORTCUT = 'Carico' // nome ESATTO della Shortcut Apple che registra l'allenamento in Salute
// data = giorno dell'allenamento (ISO). Senza, la Shortcut usa la data CORRENTE e registra
// un allenamento di ieri sotto oggi: va passata esplicitamente.
type HealthPayload = { durata: number; calorie: number; distanza: number; data?: string }
// JSON passato alla Shortcut (solo iOS). Chiavi da leggere lato Shortcut:
//   inizio  = data/ora di inizio ISO (es. "2026-07-22T12:00:00") → la data dell'allenamento
//   durata  = minuti (Salute calcola la fine da inizio + durata)
//   calorie = kcal stimate ·  distanza = metri (0 per la palestra)
const inviaSalute = (p: HealthPayload) => {
  // Senza durata la Shortcut calcola fine = inizio e Salute rifiuta con "endDate must be
  // after startDate". Capita sugli allenamenti vecchi, salvati prima che tenessimo la durata.
  if (!(p.durata >= 1)) return toast('Manca la durata: scrivila nel Calendario, apri il giorno e compila "Durata (min)"')
  // inizio a mezzogiorno del giorno: il fuso non fa scivolare l'allenamento al giorno prima/dopo
  const payload = { inizio: `${p.data ?? today()}T12:00:00`, durata: p.durata, calorie: p.calorie, distanza: p.distanza }
  window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SALUTE_SHORTCUT)}&input=text&text=${encodeURIComponent(JSON.stringify(payload))}`
}
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

const rColor = (r: number) => (r >= 80 ? 'var(--lime)' : r >= 65 ? 'var(--amber)' : 'var(--coral)')

// Ogni cambio di schermata (tab o vista interna) riparte dall'inizio, senza flash
const useTop = (dep: unknown) => { useLayoutEffect(() => { window.scrollTo(0, 0) }, [dep]) }

// id di blocco per il riordino: gli esercizi legati da `ss` (superset, anche a catena) stanno
// nello stesso blocco e si spostano insieme. Le righe libere tornano undefined = blocco a sé.
const ssBlockOf = (arr: PlanItem[]) => (it: PlanItem, i: number): string | undefined => {
  const legato = (it.ss && i + 1 < arr.length) || (i > 0 && (arr[i - 1]?.ss ?? false))
  if (!legato) return undefined
  let start = i
  while (start > 0 && arr[start - 1]?.ss) start-- // risalgo all'inizio della catena
  return 'ss' + start
}

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
        const prima = localStorage.getItem(UIDK)
        if (prima && prima !== uid) {
          // I dati locali sono di UN ALTRO account: non vanno spinti qui, sovrascriverebbero
          // i suoi. Ne tengo una copia di sicurezza e riparto dai dati di questo utente.
          try { localStorage.setItem(`carico-bk-${prima}`, JSON.stringify(sRef.current)) } catch { /* spazio finito: pazienza */ }
          setS(hasCloud ? statoDaCloud(cloud) : emptyState())
        } else if (wasFresh && hasCloud) setS(statoDaCloud(cloud))
        else configSalvata(sRef.current)
        localStorage.setItem(UIDK, uid) // da qui in poi il locale appartiene a lui
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
  // La navbar fixed "salta" quando si apre la tastiera: la nascondo mentre un campo di testo è a fuoco.
  // Solo su touch (focus su input/textarea = tastiera su): più affidabile della matematica sul viewport.
  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) return // su desktop non c'è tastiera che copre
    const isField = (el: EventTarget | null) => {
      const n = el as HTMLElement | null
      if (!n) return false
      if (n.tagName === 'TEXTAREA') return true
      if (n.tagName !== 'INPUT') return false
      return !['button', 'submit', 'checkbox', 'radio', 'range', 'color', 'file'].includes((n as HTMLInputElement).type)
    }
    let t: ReturnType<typeof setTimeout>
    const onIn = (e: FocusEvent) => { clearTimeout(t); if (isField(e.target)) setKbOpen(true) }
    const onOut = () => { t = setTimeout(() => setKbOpen(false), 120) } // ritardo: evita flicker passando tra campi
    document.addEventListener('focusin', onIn)
    document.addEventListener('focusout', onOut)
    return () => { clearTimeout(t); document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut) }
  }, [])

  // Timer globali: vivono qui, così sopravvivono al cambio di tab
  const [timer, setTimer] = useState<number | null>(null)
  const [total, setTotal] = useState(120)
  const [workoutStart, setWorkoutStart] = useState<number | null>(null)
  const [, tick] = useState(0) // ridisegna ogni secondo per far scorrere la durata
  const restEnd = useRef<number | null>(null) // ISTANTE di fine recupero: tiene il timer accurato dopo il blocco schermo
  // Recupero come istante di fine (non un contatore che decrementa): se iOS sospende il JS a schermo
  // bloccato, al rientro il tempo rimasto è comunque quello giusto. Ci passano anche le regolazioni manuali.
  const setRest = (sec: number | null) => {
    if (sec == null) { restEnd.current = null; setTimer(null); return }
    restEnd.current = Date.now() + sec * 1000
    setTimer(sec)
  }
  useEffect(() => {
    if (timer == null) return
    const step = () => {
      const rem = restEnd.current ? Math.max(0, Math.round((restEnd.current - Date.now()) / 1000)) : 0
      if (rem <= 0) {
        restEnd.current = null; setTimer(null)
        if (sRef.current.settings.vibrate) navigator.vibrate?.(300)
        if (sRef.current.settings.sound) beep()
      } else setTimer(rem)
    }
    const id = setInterval(step, 500) // frequente: si riallinea subito al rientro dallo schermo bloccato
    const onVis = () => { if (document.visibilityState === 'visible') step() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [timer == null]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (workoutStart == null) return
    const id = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [workoutStart])
  const startRest = (sec: number) => { ensureAudio(); setTotal(sec); setRest(sec) }

  // Crono momentaneo, INDIPENDENTE dal recupero: convive con esso (seconda riga della barra).
  // sec = null → cronometro che conta in su; sec > 0 → timer alla rovescia.
  const [crono, setCrono] = useState<number | null>(null)
  const cronoRef = useRef<{ at: number; dir: 1 | -1 } | null>(null) // istante di avvio (su) o di fine (giù)
  const [cronoOpen, setCronoOpen] = useState(false)
  const [cronoPick, setCronoPick] = useState(60)
  const stopCrono = () => { cronoRef.current = null; setCrono(null) }
  const startCrono = (sec: number | null) => {
    ensureAudio()
    cronoRef.current = sec == null ? { at: Date.now(), dir: 1 } : { at: Date.now() + sec * 1000, dir: -1 }
    setCrono(sec ?? 0)
  }
  useEffect(() => {
    if (crono == null) return
    const step = () => {
      const c = cronoRef.current
      if (!c) return
      if (c.dir === 1) setCrono(Math.floor((Date.now() - c.at) / 1000))
      else {
        const rem = Math.max(0, Math.round((c.at - Date.now()) / 1000))
        if (rem <= 0) {
          stopCrono()
          if (sRef.current.settings.vibrate) navigator.vibrate?.(300)
          if (sRef.current.settings.sound) beep()
        } else setCrono(rem)
      }
    }
    const id = setInterval(step, 500)
    const onVis = () => { if (document.visibilityState === 'visible') step() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [crono == null]) // eslint-disable-line react-hooks/exhaustive-deps

  const r = readiness(s.checkin)
  const rLabel = r >= 80 ? 'PRONTO' : r >= 65 ? 'OK' : 'SCARICA'
  const rColor = r >= 80 ? 'var(--lime)' : r >= 65 ? 'var(--amber)' : 'var(--coral)'

  if (supa && authed === null)
    return <div className="authgate"><div className="authbrand"><span className="mark">CARICO</span><span className="dot" /></div></div>
  if (supa && !authed) // login obbligatorio: senza accesso non si procede
    return <AuthGate />
  if (supa && authed === true && wasFresh && !synced) // device nuovo: aspetto il caricamento dal cloud
    return <div className="authgate"><div className="authbrand"><span className="mark">CARICO</span><span className="dot" /></div></div>

  return (
    <div id="app" className={timer != null || crono != null ? 'pad-timer' : ''}>
      <header>
        <span className="mark">CARICO</span><span className="dot" />
        <span className="rpill num" style={{ color: rColor, background: `color-mix(in srgb, ${rColor} 14%, transparent)` }}>
          {r} · {rLabel}
        </span>
        <button className="pen hpen" title="Cronometro / timer" onClick={() => setCronoOpen(true)}>
          {/* cronometro disegnato: corona, corpo, lancette, pulsante laterale */}
          <svg viewBox="0 0 24 24" className="misvg" style={{ width: 19, height: 19 }}>
            <path d="M9.5 2.5h5" /><circle cx="12" cy="13.5" r="7.6" /><path d="M12 9.6v4l2.7 1.7" /><path d="M18.6 6.3l1.3-1.3" />
          </svg>
        </button>
      </header>

      <InstallPrompt />

      {tab === 'oggi' && <Oggi s={s} setS={setS} go={setTab} />}
      {/* "Inizia questo allenamento" è una scelta ESPLICITA: azzera l'ancora, altrimenti la
          seduta resterebbe agganciata al giorno di prima e il tasto non farebbe niente.
          Senza ancora Allena segue la scheda/giorno che hai appena aperto. */}
      {tab === 'schede' && <Schede s={s} setS={setS} workoutActive={workoutStart != null}
        onStart={() => { setS((p) => ({ ...p, allenamento: undefined })); setTab('allena') }} />}
      {tab === 'allena' && <Allena s={s} setS={setS} startRest={startRest} stopRest={() => setRest(null)}
        workoutStart={workoutStart} setWorkoutStart={setWorkoutStart} timerActive={timer != null} />}
      {tab === 'cibo' && <Cibo s={s} setS={setS} />}
      {tab === 'coach' && <Coach s={s} onChat={(c) => setS({ ...sRef.current, chat: c })} />}
      {tab === 'profilo' && <Profilo s={s} setS={setS} />}

      {cronoOpen && <RestPicker value={cronoPick} onChange={setCronoPick}
        title="Timer · scorri" done="Avvia timer"
        extra={<button className="ghost" onClick={() => { setCronoOpen(false); startCrono(null) }}>Cronometro</button>}
        onDone={() => { setCronoOpen(false); if (cronoPick > 0) startCrono(cronoPick) }}
        onClose={() => setCronoOpen(false)} />}
      <TimerBar timer={timer} total={total} onTimer={setRest} onTotal={setTotal}
        crono={crono} cronoUp={cronoRef.current?.dir === 1} onCronoStop={stopCrono} />
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

function Oggi({ s, setS, go }: { s: State; setS: (u: State) => void; go: (t: Tab) => void }) {
  const [minutes, setMinutes] = useState(60)
  const [openEs, setOpenEs] = useState(false) // anteprima esercizi: chiusa, si apre a richiesta
  const [ciOpen, setCiOpen] = useState(false) // check-in aperto per modifica (se già fatto oggi)
  const goAllena = () => go('allena')
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
  const rCol = r >= 80 ? 'var(--lime)' : r >= 65 ? 'var(--amber)' : 'var(--coral)'
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
  const weekTon = volume(wl)
  const st = streak(s.log), lvl = level(s.log)

  const tot = nutritionToday(s.meals, today())
  const wt = waterToday(s.water, today()), wg = waterGoal(s)
  const kcalLeft = s.target.kcal - tot.kcal

  const mv = muscleVolume(s)
  const mvEntries = Object.entries(mv).sort((a, b) => b[1] - a[1])
  const under = mvEntries.filter(([, n]) => n < 8).map(([m]) => m)

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

      {/* READINESS: l'unica cosa che merita di stare in cima a schermo pieno — dice se oggi
          spingere o no. Il consiglio del coach è QUI dentro: prima la stessa identica frase
          era ripetuta anche in fondo alla pagina in una card sua. */}
      <div className="card ready">
        <Ring v={r} color={rCol} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rl" style={{ color: rCol }}>{rLabel} · READINESS</div>
          <div className="rh">{rHead}</div>
          <div className="rd">{nudge}</div>
        </div>
      </div>
      {under.length > 0 && (
        <div className="msg" style={{ marginTop: 10 }}><div className="who">Carico Coach</div>
          Questa settimana <b>{under.join(', ')}</b> {under.length === 1 ? 'è' : 'sono'} sotto quota: aggiungi 1–2 esercizi per recuperare volume.
        </div>
      )}

      {/* ALLENAMENTO: la card d'azione. L'elenco esercizi non è più sempre aperto — occupava
          mezza pagina prima ancora di sapere se ti interessa. */}
      <h2>Oggi ti alleni</h2>
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
          <button className="ghost" style={{ marginTop: 8 }} onClick={() => setOpenEs((v) => !v)}>
            {openEs ? 'Nascondi gli esercizi' : `Vedi i ${items.length} esercizi e i pesi`}
          </button>
          {openEs && (<>
            <p className="sm mut" style={{ margin: '12px 2px 6px' }}>Quanto tempo hai? La seduta si accorcia tenendo i fondamentali.</p>
            <div className="seg">
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
          </>)}
        </div>
      ) : (
        <div className="card">
          <p className="sm mut" style={{ margin: 0, lineHeight: 1.6 }}>Giorno di riposo.</p>
          <button className="ghost" style={{ marginTop: 10 }} onClick={() => go('schede')}>Scegli un giorno da allenare</button>
        </div>
      )}

      {/* CHECK-IN: azione quotidiana. Fatto = riepilogo compatto; da fare = aperto e sollecitato. */}
      <h2>Come stai oggi</h2>
      <div className="card">
        {ciToday && !ciOpen ? (
          <div className="row" style={{ gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="num" style={{ fontWeight: 700, fontSize: 15 }}>{fmt(ore)} h di sonno</div>
              <div className="meta num" style={{ marginTop: 3 }}>energia {s.checkin.energia} · doms {s.checkin.doms} · stress {s.checkin.stress}</div>
            </div>
            <button className="ghost" style={{ width: 'auto', padding: '9px 14px', fontSize: 13 }} onClick={() => setCiOpen(true)}>Modifica</button>
          </div>
        ) : (<>
          {!ciToday && <p className="sm mut" style={{ margin: '0 0 10px' }}>Venti secondi: i pesi proposti diventano affidabili.</p>}
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
          {ciToday && <button className="ghost" style={{ marginTop: 12 }} onClick={() => setCiOpen(false)}>Fatto</button>}
        </>)}
      </div>

      {/* NUTRIZIONE: anteprima + porta al suo tab, come nel riferimento */}
      <h2>Nutrizione di oggi</h2>
      <div className="card" style={{ cursor: 'pointer' }} onClick={() => go('cibo')}>
        <div className="kcalhead">
          <div>
            <div className="kcalbig num" style={{ color: kcalLeft < 0 ? 'var(--coral)' : 'var(--chalk)' }}>{Math.abs(Math.round(kcalLeft))}</div>
            <div className="l">{kcalLeft < 0 ? 'kcal oltre il target' : 'kcal rimaste'}</div>
          </div>
          <div className="kcalsub num">{Math.round(tot.kcal)} <span className="mut">/ {s.target.kcal}</span><span className="chev" style={{ marginLeft: 8 }}>›</span></div>
        </div>
        <div className="macros">
          <MacroRing v={tot.protein} max={s.target.protein} color="var(--teal)" label="Proteine" />
          <MacroRing v={tot.carbs} max={s.target.carbs} color="var(--amber)" label="Carbo" />
          <MacroRing v={tot.fat} max={s.target.fat} color="#A78BFA" label="Grassi" />
        </div>
        <div style={{ marginTop: 12 }}><Bar v={wt} max={wg} color="var(--lime)" label="Acqua" unit="ml" /></div>
      </div>

      {/* SETTIMANA: i numeri di contorno, in fondo. Volume-per-gruppo e andamento peso NON
          stanno più qui: erano copie esatte di Schede→Stats e di Profilo. */}
      <h2>La tua settimana</h2>
      <div className="card" style={{ paddingBottom: rHist.length >= 2 ? 8 : 14 }}>
        <div className="tiles">
          <div className="tile"><div className="l">Streak</div><div className="v num">{st} <span className="sm mut">gg</span></div></div>
          <div className="tile"><div className="l">Sedute</div><div className="v num">{weekSessions}</div></div>
          <div className="tile"><div className="l">Volume 7gg</div><div className="v num">{fmt(weekTon / 1000)} <span className="sm mut">t</span></div></div>
          <div className="tile"><div className="l">Livello</div><div className="v num">{lvl.n}</div></div>
        </div>
        {rHist.length >= 2 && (<>
          <div className="mono sm mut" style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', marginTop: 14 }}>Andamento readiness</div>
          <Sparkline values={rHist} color={rCol} h={48} />
        </>)}
      </div>
    </>
  )
}

// Tab Schede: gestione schede + calendario allenamenti (coerente con lo stile del Cibo)
function Schede({ s, setS, onStart, workoutActive }: { s: State; setS: (u: State) => void; onStart: () => void; workoutActive: boolean }) {
  const [tab, setTab] = useState<'schede' | 'cal' | 'esercizi' | 'stats'>('schede')
  const [statsEx, setStatsEx] = useState<string | null>(null) // dettaglio esercizio aperto da Stats
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
  // Elimina una seduta già terminata: via le sue serie dallo storico locale e dal cloud.
  // ponytail: resta sul cloud una riga "sessione" vuota (il suo id non è tracciato in locale
  // per i giorni passati); è invisibile perché tutte le statistiche derivano dalle serie.
  const deleteDay = async (date: string) => {
    const gg = new Date(date + 'T12:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
    if (!(await confirmDlg('Eliminare questo allenamento?', `${gg} — le serie di quel giorno spariscono, non si può annullare.`))) return
    for (const l of s.log) if (l.date === date && l.id) serieRimossa(l.id)
    setS({ ...s, log: s.log.filter((l) => l.date !== date) })
    toast('Allenamento eliminato')
  }
  return (
    <>
      <div className="seg" style={{ marginTop: 4, marginBottom: 20 }}>
        {([['schede', 'Schede'], ['cal', 'Calendario'], ['esercizi', 'Esercizi'], ['stats', 'Stats']] as const).map(([k, l]) => (
          <button key={k} className={'sg' + (tab === k ? ' on' : '')} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'schede' && <SchedeManager s={s} setS={setS} onStart={onStart} workoutActive={workoutActive} />}
      {tab === 'cal' && <Calendario s={s} setS={setS} onRepeat={repeatDay} onDelete={deleteDay} />}
      {tab === 'esercizi' && <Esercizi s={s} setS={setS} />}
      {tab === 'stats' && <Statistiche s={s} onOpen={setStatsEx} />}
      {statsEx && <ExStats s={s} setS={setS} ex={statsEx} onClose={() => setStatsEx(null)} />}
    </>
  )
}

function SchedeManager({ s, setS, onStart, workoutActive }: { s: State; setS: (u: State) => void; onStart: () => void; workoutActive: boolean }) {
  const sc = curScheda(s)
  const items = curItems(s)
  const lib = libreriaEsercizi(s)
  const [edit, setEdit] = useState<number | null>(null)
  const [imp, setImp] = useState(false); const [text, setText] = useState('')
  const [aiImp, setAiImp] = useState<{ state: 'busy' } | { state: 'preview'; schede: Scheda[] } | null>(null)
  // spiegazione PERMANENTE (la notazione del suo coach) vs correzione USA-E-GETTA di questo documento
  const [aiNota, setAiNota] = useState(s.settings.schedaNota ?? '')
  const [aiFix, setAiFix] = useState('')
  const aiFile = useRef<File | null>(null) // tenuto da parte per poter ripassare lo stesso file
  // dimostrazione dell'esercizio caricabile anche da qui, non solo durante l'allenamento
  const { pick: pickVideo, input: videoInput, attesa: videoAttesa } = useVideoUpload<string>((path, ex) => {
    const prima = (s.exVideo ?? {})[ex]
    mutate((d) => { d.exVideo = { ...(d.exVideo ?? {}), [ex]: path } })
    if (prima) void deleteVideo(prima)
  })
  const [view, setView] = useState<'list' | 'scheda' | 'day'>('list')
  const [picker, setPicker] = useState(false)
  useTop(view)

  // Le schede si modificano SEMPRE liberamente: la seduta in corso è una copia ancorata al
  // suo giorno. Rete di sicurezza: se l'allenamento è partito ma l'ancora manca, la fisso
  // qui col piano pre-modifica, così l'edit non può entrare nella seduta.
  const mutate = (fn: (d: State) => void) => {
    const d = structuredClone(s)
    if (workoutActive && d.allenamento?.date !== today()) {
      d.allenamento = { date: today(), scheda: s.activeScheda, day: s.activeDay, items: structuredClone(curItems(s)) }
    }
    fn(d); setS(d)
  }
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
  // massimale di riferimento per NOME esercizio (non per PlanItem: vale ovunque compaia)
  const setRefMax = (ex: string, v: { kg: number; reps: number } | null) => mutate((d) => {
    d.refMax = { ...(d.refMax ?? {}) }
    if (v) d.refMax[ex] = v; else delete d.refMax[ex]
  })
  const removeItem = (i: number) => {
    mutate((d) => {
      const a = dayItems(d)
      // il precedente era in superset con questo: sciolgo la coppia, altrimenti il flag
      // resterebbe appeso e legherebbe due esercizi che non c'entrano niente
      if (i > 0 && a[i - 1]?.ss) delete a[i - 1].ss
      a.splice(i, 1)
    })
    setEdit(null)
  }
  // l'ordine si cambia SOLO col drag nella lista del giorno: niente frecce nella schermata esercizio
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
  // Import IA: PDF/foto → Gemini (structured output) → anteprima → conferma
  const onAiFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    aiFile.current = f
    setAiFix('')
    void runAi(f, aiNota)
  }
  // Ripassa lo STESSO documento aggiungendo la correzione: è dopo l'anteprima che si insegna
  // davvero, perché l'errore ce l'hai davanti e sai dire cosa non torna.
  const ripassaAi = () => {
    if (!aiFile.current) return
    void runAi(aiFile.current, [aiNota.trim(), aiFix.trim()].filter(Boolean).join('\n'))
  }
  const runAi = async (f: File, nota: string) => {
    const key = s.settings.geminiKey?.trim()
    if (!key) return toast('Serve la chiave IA: Profilo → ⚙ → Coach IA')
    setAiImp({ state: 'busy' })
    try {
      // la libreria va passata: senza, "Panca 60" invece di "Panca 60°" crea un doppione vuoto
      const schede = await parseSchedaFile(f, key, nota, lib.map((e) => e.name))
      setAiImp({ state: 'preview', schede })
    } catch (err) {
      toast((err as Error).message || 'Errore durante la lettura')
      setAiImp(null)
    }
  }
  const confirmAi = () => {
    if (aiImp?.state !== 'preview') return
    const n = aiImp.schede.length
    // la spiegazione si salva, la correzione no: la prima è una regola del suo coach che varrà
    // sempre, la seconda riguardava questo documento e accumularla sporcherebbe le prossime letture
    mutate((d) => {
      d.schede.push(...aiImp.schede); d.activeScheda = d.schede.length - n; d.activeDay = 0
      d.settings.schedaNota = aiNota.trim() || undefined
    })
    setAiImp(null)
    toast(n === 1 ? 'Scheda importata ✓' : n + ' schede importate ✓')
  }
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
        return (
          <div className="bigcard" key={i} onClick={() => {
            // niente blocchi con l'allenamento in corso: la seduta è ancorata al suo giorno,
            // qui si naviga e si modifica liberamente senza toccarla
            setS({ ...s, activeScheda: i, activeDay: 0 }); setView('scheda')
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {i === s.activeScheda && <span className="stag" style={{ margin: '0 0 7px', display: 'inline-block' }}>Attiva</span>}
              <b className="bc-title">{x.name}</b>
              <div className="meta num" style={{ marginTop: 5 }}><Dumb /> {x.days.length} {x.days.length === 1 ? 'giorno' : 'giorni'} · {nEx} esercizi</div>
            </div>
            <span className="bc-go">›</span>
          </div>
        )
      })}
      <button className="ghost addafter" onClick={addScheda}>+ Nuova scheda</button>

      <h2 style={{ marginTop: 30 }}>Importa scheda</h2>
      <div className="card" style={{ marginBottom: 8 }}>
        <div className="crumb" style={{ marginBottom: 7 }}>Spiega com'è fatta la tua scheda</div>
        <textarea className="notebox" rows={3} value={aiNota} onChange={(e) => setAiNota(e.target.value)}
          placeholder={'es. "10*3s vuol dire 10 ripetizioni per 3 serie" · "le colonne sono le settimane" · "@ è sempre un RPE"'} />
        <p className="sm mut" style={{ margin: '7px 0 0' }}>
          Resta salvata. Il tuo preparatore usa sempre la stessa notazione: la spieghi una volta e vale per ogni import.
        </p>
      </div>
      <label className="ghost filebtn" style={{ borderColor: 'rgba(201,249,78,.5)', color: 'var(--lime)' }}>
        ✨ Importa da PDF o foto con l'IA
        <input type="file" accept=".pdf,image/*" onChange={onAiFile} style={{ display: 'none' }} />
      </label>
      {!imp ? (
        <button className="ghost" style={{ marginTop: 8 }} onClick={() => setImp(true)}>Importa da testo</button>
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

      {aiImp && (
        <div className="overlay" onClick={() => { if (aiImp.state === 'preview') setAiImp(null) }}>
          <div className="sheet menusheet" onClick={(e) => e.stopPropagation()}>
            {aiImp.state === 'busy' ? (
              <div style={{ padding: '46px 20px', textAlign: 'center' }}>
                <div className="prstar" style={{ fontSize: 34, color: 'var(--lime)' }}>✨</div>
                <div style={{ fontWeight: 800, marginTop: 10 }}>L'IA sta leggendo il documento…</div>
                <p className="sm mut" style={{ marginTop: 8 }}>Tabelle, superset, percentuali e settimane vengono tradotti nel formato dell'app.</p>
              </div>
            ) : (
              <>
                <div className="bc" style={{ margin: 0 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="crumb">Controlla prima di importare</div>
                    <div className="bt1">{aiImp.schede.length === 1 ? '1 scheda trovata' : aiImp.schede.length + ' schede trovate'}</div>
                  </div>
                  <button className="pen" onClick={() => setAiImp(null)}>✕</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                  {/* dettaglio per esercizio: reps, RPE/carico anche PER SERIE, così si vede
                      subito se il parser ha preso gli RPE giusti prima di importare */}
                  {aiImp.schede.map((sc2, i) => (
                    <div className="card" key={i} style={{ marginTop: 10 }}>
                      <b style={{ fontSize: 15.5 }}>{sc2.name}</b>
                      {sc2.days.map((dd, j) => (
                        <div key={j} style={{ marginTop: 11 }}>
                          <div className="sm" style={{ fontWeight: 700 }}>{dd.name} <span className="mut">· {dd.items.length} esercizi</span></div>
                          {dd.items.map((x, k) => {
                            const det = x.scheme
                              ? x.scheme.map((sp) => `${sp.reps}${sp.load ? ' ' + sp.load : ''}${sp.target ? ' ' + sp.target : ''}`).join(' · ')
                              : `${x.sets}×${x.reps}${x.target ? ' ' + x.target : ''}`
                            return (
                              <div key={k} className="meta" style={{ lineHeight: 1.5, marginTop: 4 }}>
                                <span style={{ color: 'var(--chalk)', fontWeight: 600 }}>{x.ex}{x.ss ? ' ⁺' : ''}</span>
                                {' — '}<span className="num">{det}</span>
                                {x.tempo ? ` · ${x.tempo}` : ''}{x.timed ? ' · a tempo' : ''}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="card" style={{ marginTop: 10 }}>
                  <div className="crumb" style={{ marginBottom: 7 }}>Non torna qualcosa?</div>
                  <textarea className="notebox" rows={2} value={aiFix} onChange={(e) => setAiFix(e.target.value)}
                    placeholder={'es. "la terza colonna è la Week 7" · "il primo numero sono le serie, non le ripetizioni"'} />
                  <button className="ghost" style={{ marginTop: 8 }} disabled={!aiFix.trim()} onClick={ripassaAi}>
                    ↻ Rileggi il documento con questa correzione
                  </button>
                </div>
                <button style={{ marginTop: 10 }} onClick={confirmAi}>Importa {aiImp.schede.length === 1 ? 'la scheda' : 'tutte e ' + aiImp.schede.length}</button>
              </>
            )}
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
          <div className="bigcard" key={i} onClick={() => {
            setS({ ...s, activeDay: i }); setEdit(null); setView('day')
          }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="stag" style={{ margin: 0, display: 'inline-block' }}>Giorno {i + 1}</span>
              <b className="bc-title" style={{ display: 'block', marginTop: 7 }}>{dd.name}</b>
              <div className="meta num" style={{ marginTop: 5 }}><Dumb /> {dd.items.length} esercizi{min > 0 && <> · <Clock /> ~{min} min</>}</div>
              {mus.length > 0 && <div className="meta" style={{ marginTop: 5 }}>{mus.map((m) => <span key={m} className="muspill"><i style={{ background: mcolor(m) }} />{m}</span>)}</div>}
            </div>
            <span className="bc-go">›</span>
          </div>
        )
      })}
      <button className="ghost addafter" onClick={addDay}>+ Nuovo giorno</button>
      {sc && (
        <button className="ghost" style={{ marginTop: 20, color: 'var(--coral)' }}
          onClick={async () => { if (await confirmDlg('Eliminare questa scheda?', sc?.name)) { mutate((d) => { d.schede.splice(s.activeScheda, 1); d.activeScheda = 0; d.activeDay = 0 }); setView('list') } }}>
          Elimina scheda</button>
      )}
    </>
  )

  // --- Vista 3 · editor del giorno, e Vista 4 · il singolo esercizio ---
  // Sono ALTERNATIVE, non annidate: con un esercizio aperto la schermata del giorno sparisce
  // del tutto, altrimenti resterebbero attorno intestazione, "Inizia allenamento" ed "Elimina
  // giorno" e sembrerebbe una tendina invece di una schermata sua.
  return (
    <>
      {edit == null && (<>
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
      {items.length === 0 && (
        <div className="card"><p className="sm mut" style={{ margin: '10px 2px' }}>Giorno vuoto: aggiungi esercizi dall'archivio ↓</p></div>
      )}
      {items.length > 0 && (
        <>
          <p className="hint">Tocca per modificare · tieni premuto e trascina per riordinare</p>
          {/* rowClass 'pair' = contorno verde su tutta la coppia, come in allenamento */}
          <DragList items={items} rowH={78} keyOf={(it) => it.ex}
            rowClass={(it) => { const pi = items.indexOf(it); return it.ss || (pi > 0 && items[pi - 1]?.ss) ? 'pair' : '' }}
            render={(it) => (<>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b style={{ fontSize: 16.5 }}>{it.ex}</b>{it.ss && <span className="stag">SS</span>}
                <div className="meta num" style={{ marginTop: 3 }}><i className="mdotx" style={{ background: mcolor(it.muscle) }} />{it.muscle} · {schemeSummary(it)} · rec {mmss(it.rest)}{it.note ? ' · ✎' : ''}</div>
              </div>
              <span className="chev">›</span>
            </>)}
            onTap={(i) => setEdit(i)}
            onReorder={(order) => mutate((d) => { const dd = d.schede[s.activeScheda].days[s.activeDay]; dd.items = order.map((i2) => dd.items[i2]) })}
            blockOf={ssBlockOf(items)} />
        </>
      )}
      <button className="ghost" style={{ marginTop: 12 }} onClick={() => setPicker(true)}>＋ Aggiungi esercizio</button>
      {sc && sc.days.length > 1 && (
        <button className="ghost" style={{ marginTop: 14, color: 'var(--coral)' }}
          onClick={async () => { if (await confirmDlg('Eliminare questo giorno?', curDay(s)?.name)) { removeDay(s.activeDay); setView('scheda') } }}>
          Elimina giorno</button>
      )}
      </>)}

      {/* Schermata dedicata all'esercizio: stesse card della vista allenamento (video
          dimostrativo, titolo grande, statistiche) e sotto i campi da modificare.
          Prima era una fisarmonica dentro l'elenco: si perdeva il contesto e non c'era
          posto per il video. */}
      {items.length > 0 && edit != null && items[edit] && (() => {
        const i = edit
        const it = items[i]
        const tag = schemeTag(it)
        const demo = (s.exVideo ?? {})[it.ex]
        return (
            <>
              {/* il ‹ torna alla LISTA esercizi (setEdit null), non di due schermate.
                  Niente ordine/inizio-allenamento qui: quelli vivono nella lista del giorno. */}
              <div className="bc" style={{ marginTop: 18 }}>
                <button className="back" onClick={() => setEdit(null)}>‹</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="crumb">{curDay(s)?.name} · esercizio {i + 1} di {items.length}</div>
                  <div className="bt1">Modifica esercizio</div>
                </div>
              </div>

              {demo
                ? (
                  <div className="fvwrap">
                    <Video className="fhero fvideo" src={demo} />
                    <button className="fvedit" onClick={() => pickVideo(it.ex)} title="Sostituisci la dimostrazione">✎</button>
                  </div>
                )
                : (
                  <div className="fhero" onClick={() => pickVideo(it.ex)}>
                    <svg viewBox="0 0 24 24"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg>
                    <span className="sm">Come si esegue · tocca per caricare la dimostrazione</span>
                  </div>
                )}
              <div className="ftitle">{it.ex}</div>
              <div className="crumb" style={{ margin: '4px 2px 0' }}>
                <i className="mdotx" style={{ background: mcolor(it.muscle) }} />{it.muscle}
                {tag ? ' · ' + tag : ''}{it.ss && items[i + 1] ? ' · superset con ' + items[i + 1].ex : ''}
              </div>

              {/* Niente card statistiche qui: ripeterebbe i numeri che stai già editando sotto.
                  Sezioni distinte in card separate, come la vista allenamento: le serie da una
                  parte, i dettagli dall'altra, l'azione distruttiva staccata in fondo. */}
              {/* Una card per DOMANDA, invece di "Serie e ripetizioni" + un "Dettagli" tuttofare:
                  quanto fare · come farlo · con cosa è legato · il tuo riferimento. */}
              <div className="card" style={{ marginTop: 12 }}>
                <div className="cardh"><b>Quanto fare</b></div>
                <div className="cardh-div" />
                {!it.scheme ? (<>
                  <div className="egrid">
                    <div className="efield"><label>Serie</label><input type="number" value={it.sets} onChange={(e) => updItem(i, { sets: +e.target.value })} inputMode="numeric" /></div>
                    <div className="efield"><label>{isTimed(it) ? 'Secondi' : 'Ripetizioni'}</label><input type="number" value={it.reps} onChange={(e) => updItem(i, { reps: +e.target.value })} inputMode="numeric" /></div>
                    <div className="efield"><label>Recupero</label>
                      <input type="number" step="15" value={it.rest} onChange={(e) => updItem(i, { rest: +e.target.value })} inputMode="numeric" />
                      <span className="fhint">{mmss(it.rest)} minuti</span></div>
                    <div className="efield"><label>Sforzo previsto</label>
                      <input type="text" value={it.target ?? ''} placeholder="@8 · RIR2" onChange={(e) => updItem(i, { target: e.target.value || undefined })} />
                      <span className="fhint">vale per tutte le serie</span></div>
                  </div>
                  <button className="ghost full" style={{ marginTop: 12 }} onClick={() => customize(i)}>Le serie sono diverse tra loro →</button>
                </>) : (<>
                  <p className="sm mut" style={{ margin: '0 0 10px' }}>Una riga per serie: ripetizioni, carico (es. <b>@80%</b>) e sforzo (es. <b>@8</b>). Parti da uno schema pronto:</p>
                  <div className="presets">
                    {[['ramping', 'Ramping'], ['backoff', 'Back-off'], ['pyramid', 'Piramide'], ['drop', 'Drop set']].map(([k, l]) => (
                      <button key={k} className="preset" onClick={() => applyPreset(i, k)}>{l}</button>
                    ))}
                  </div>
                  <div className="setlist">
                    <div className="slh"><span>#</span><span>Tipo</span><span>{isTimed(it) ? 'Sec' : 'Reps'}</span><span>Carico</span><span>Sforzo</span><span></span></div>
                    {it.scheme.map((sp, j) => (
                      <div className={'slr st-' + sp.type} key={j}>
                        <span className="sidx">{j + 1}</span>
                        <select value={sp.type} onChange={(e) => updSet(i, j, { type: e.target.value as SetType })}>
                          {SET_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <input value={sp.reps} onChange={(e) => updSet(i, j, { reps: e.target.value })} placeholder="8" />
                        <input value={sp.load ?? ''} onChange={(e) => updSet(i, j, { load: e.target.value })} placeholder="@80%" style={{ fontFamily: 'var(--sans)' }} />
                        <input value={sp.target ?? ''} onChange={(e) => updSet(i, j, { target: e.target.value || undefined })} placeholder="@8" style={{ fontFamily: 'var(--sans)' }} />
                        <span className="del" onClick={() => removeSet(i, j)}>✕</span>
                      </div>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="ghost" onClick={() => addSet(i)}>＋ Serie</button>
                    <button className="ghost" onClick={() => toUniform(i)}>Rendile tutte uguali</button>
                  </div>
                  <div className="egrid" style={{ marginTop: 12 }}>
                    <div className="efield"><label>Recupero</label>
                      <input type="number" step="15" value={it.rest} onChange={(e) => updItem(i, { rest: +e.target.value })} inputMode="numeric" />
                      <span className="fhint">{mmss(it.rest)} minuti</span></div>
                    {/* sforzo dell'ESERCIZIO: lo ereditano le serie che non ne hanno uno proprio */}
                    <div className="efield"><label>Sforzo previsto</label>
                      <input type="text" value={it.target ?? ''} placeholder="@8 · RIR2" onChange={(e) => updItem(i, { target: e.target.value || undefined })} />
                      <span className="fhint">per le serie senza sforzo</span></div>
                  </div>
                </>)}
              </div>

              <div className="card" style={{ marginTop: 12 }}>
                <div className="cardh"><b>Come farlo</b></div>
                <div className="cardh-div" />
                <div className="egrid">
                  <div className="efield full"><label>Tempi e fermi</label>
                    <input type="text" value={it.tempo ?? ''} placeholder="es. discesa 3s · fermo 2s al petto" onChange={(e) => updItem(i, { tempo: e.target.value || undefined })} style={{ fontFamily: 'var(--sans)' }} /></div>
                  <div className="efield full"><label>Nota</label>
                    <input type="text" value={it.note ?? ''} placeholder="es. presa stretta, gomiti chiusi" onChange={(e) => updItem(i, { note: e.target.value })} style={{ fontFamily: 'var(--sans)' }} />
                    <span className="fhint">la leggi in allenamento, sopra le serie</span></div>
                </div>
              </div>

              {/* il flag lega SEMPRE al successivo: senza un successivo non ha senso mostrarlo */}
              {i < items.length - 1 && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="cardh"><b>Superset</b></div>
                  <div className="cardh-div" />
                  <label className="tswitch full" style={{ marginTop: 0 }}>
                    <input type="checkbox" checked={!!it.ss} onChange={(e) => updItem(i, { ss: e.target.checked || undefined })} />
                    <span>Legalo a <b>{items[i + 1].ex}</b> — si alterna una serie per esercizio</span>
                  </label>
                </div>
              )}

              {!isTimed(it) && (() => {
                const rm = (s.refMax ?? {})[it.ex]
                const m = massimale(s, it.ex)
                return (
                  <div className="card" style={{ marginTop: 12 }}>
                    <div className="cardh"><b>Il tuo record</b></div>
                    <div className="cardh-div" />
                    <p className="sm mut" style={{ margin: '0 0 10px' }}>
                      Peso × ripetizioni: metti <b>1</b> ripetizione se è un massimale vero, oppure il tuo
                      record di reps (es. 100 × 5). Serve a calcolare i pesi consigliati su un numero tuo.
                    </p>
                    <div className="egrid">
                      <div className="efield"><label>Peso (kg)</label>
                        <input type="number" inputMode="decimal" value={rm?.kg ?? ''} placeholder="—"
                          onChange={(e) => { const kg = +e.target.value; setRefMax(it.ex, kg > 0 ? { kg, reps: rm?.reps || 1 } : null) }} /></div>
                      <div className="efield"><label>Ripetizioni</label>
                        <input type="number" inputMode="numeric" value={rm?.reps ?? ''} placeholder="1"
                          onChange={(e) => { const reps = +e.target.value; if (rm?.kg) setRefMax(it.ex, { kg: rm.kg, reps: Math.max(1, reps) }) }} /></div>
                    </div>
                    <p className="sm" style={{ margin: '9px 0 0', color: m.fonte === 'ref' ? 'var(--lime)' : 'var(--mut2)' }}>
                      {m.fonte === 'ref' ? `Massimale stimato: ${fmt(round25(m.kg))} kg` : m.fonte === 'stima' ? `Ora si usa la stima dello storico: ${fmt(round25(m.kg))} kg` : 'Nessun record: i pesi consigliati partiranno dallo storico quando ci sarà'}
                    </p>
                  </div>
                )
              })()}

              {/* si torna all'elenco: restando qui la schermata punterebbe a un esercizio che non c'è più */}
              <button className="ghost full" style={{ marginTop: 14, color: 'var(--coral)' }} onClick={() => { removeItem(i); setEdit(null) }}>Rimuovi esercizio</button>
            </>
        )
      })()}

      {/* input nascosto e overlay attesa: fuori dal wrapper, servono a entrambe le viste */}
      {videoInput}{videoAttesa}
      {picker && (
        <ExPicker lib={lib} title={curDay(s)?.name ?? ''} onClose={() => setPicker(false)}
          onPick={addItemByName} onCreate={createAndAdd} />
      )}
    </>
  )
}

const mmss = (sec: number) => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0')
const RPE_VALS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10] // RIR = 10 − RPE, quindi 4 … 0
// Durata: sotto l'ora "45:30", oltre "1:05:30" — i secondi restano SEMPRE visibili
const durataFmt = (sec: number) => sec < 3600 ? mmss(sec)
  : `${Math.floor(sec / 3600)}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`

// Popup timer flottante: recupero + crono, visibile ovunque sopra la nav
// Popup flottante del recupero: appare solo mentre il timer va, visibile su ogni schermata
function TimerBar({ timer, total, onTimer, onTotal, crono, cronoUp, onCronoStop }: {
  timer: number | null; total: number
  onTimer: (v: number | null) => void; onTotal: (v: number) => void
  crono: number | null; cronoUp: boolean; onCronoStop: () => void
}) {
  if (timer == null && crono == null) return null
  return (
    <div className="timer timerbar">
      {timer != null && (
        <div className="trow">
          <div style={{ flex: 'none' }}>
            <div className="tl">Recupero</div>
            <div className="tv num">{mmss(timer)}</div>
          </div>
          <div className="bt tbar"><i style={{ width: Math.min(100, (timer / Math.max(1, total)) * 100) + '%', background: 'var(--lime)' }} /></div>
          <button className="tbtn num" onClick={() => onTimer(Math.max(0, timer - 15))}>−15</button>
          <button className="tbtn num" onClick={() => { onTimer(timer + 30); onTotal(Math.max(total, timer + 30)) }}>+30</button>
          <button className="tbtn" onClick={() => onTimer(null)}>✕</button>
        </div>
      )}
      {crono != null && (
        <div className={'trow small' + (timer != null ? ' bordered' : '')}>
          <div style={{ flex: 'none' }}>
            <div className="tl">{cronoUp ? 'Cronometro' : 'Timer'}</div>
            <div className="tv num">{durataFmt(crono)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <button className="tbtn" onClick={onCronoStop}>✕</button>
        </div>
      )}
    </div>
  )
}

// Rotella di scroll per il recupero: scorri e il valore si applica subito (stile picker iOS)
// title/done/extra/onDone servono al crono momentaneo, che riusa questa stessa rotella.
// onDone separato da onClose: uscire dal foglio (✕ o sfondo) NON deve far partire nulla.
function RestPicker({ value, onChange, onClose, title, done, extra, onDone }: {
  value: number; onChange: (v: number) => void; onClose: () => void
  title?: string; done?: string; extra?: React.ReactNode; onDone?: () => void
}) {
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
            <div className="crumb" style={{ color: 'var(--lime)' }}>{title ?? 'Recupero · scorri'}</div>
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
        {extra}
        <button onClick={onDone ?? onClose} style={extra ? { marginTop: 8 } : undefined}>{done ?? 'Fatto'}</button>
      </div>
    </div>
  )
}

// Lista riordinabile: TAP = apri, TIENI PREMUTO = trascina (auto-scroll ai bordi, rilascio = conferma).
// Unica implementazione del drag, usata dall'overview allenamento e dall'editor del giorno.
// Riordino per BLOCCHI: normalmente ogni riga è un blocco a sé, ma `blockOf` può legare righe
// adiacenti (i superset) così si spostano INSIEME e niente può finire in mezzo alla coppia.
// Il drag lavora sull'ordine dei blocchi; onReorder riceve comunque indici di ITEM appiattiti.
function DragList<T>({ items, rowH, keyOf, rowClass, render, onTap, onReorder, blockOf }: {
  items: T[]; rowH: number
  keyOf: (item: T) => string
  rowClass?: (item: T) => string
  render: (item: T) => React.ReactNode
  onTap: (index: number) => void
  onReorder: (order: number[]) => void
  blockOf?: (item: T, index: number) => string | undefined
}) {
  const [order2, setOrder2] = useState<number[] | null>(null)
  const [dragPos, setDragPos] = useState<{ pos: number; rel: number } | null>(null)
  const obox = useRef<HTMLDivElement>(null)
  // blocchi = gruppi di indici item adiacenti con lo stesso id (undefined = riga singola)
  const blocks = useMemo(() => {
    const out: number[][] = []
    let lastId: string | undefined
    items.forEach((it, i) => {
      const id = blockOf?.(it, i)
      if (id !== undefined && id === lastId) out[out.length - 1].push(i)
      else out.push([i])
      lastId = id
    })
    return out
  }, [items, blockOf])
  const blocksRef = useRef(blocks); blocksRef.current = blocks
  const rowsBefore = (order: number[], pos: number) => order.slice(0, pos).reduce((a, bi) => a + blocksRef.current[bi].length, 0)
  const dr = useRef({ y: 0, startY: 0, pos: 0, order: [] as number[], raf: 0, active: false, moved: false, timer: null as ReturnType<typeof setTimeout> | null })
  useEffect(() => { // iOS: blocca lo scroll pagina SOLO a drag attivo (listener non-passive)
    const stop = (e: TouchEvent) => { if (dr.current.active) e.preventDefault() }
    document.addEventListener('touchmove', stop, { passive: false })
    return () => document.removeEventListener('touchmove', stop)
  }, [])
  const upd = () => {
    if (!obox.current) return
    const rel = dr.current.y - obox.current.getBoundingClientRect().top // rect fresco: vale anche dopo lo scroll
    // riga sotto il dito → posizione del BLOCCO che la contiene (i blocchi hanno altezze diverse)
    const row = Math.floor(rel / rowH)
    let acc = 0, target = dr.current.order.length - 1
    for (let p = 0; p < dr.current.order.length; p++) {
      acc += blocksRef.current[dr.current.order[p]].length
      if (row < acc) { target = p; break }
    }
    target = Math.max(0, target)
    if (target !== dr.current.pos) {
      const n = [...dr.current.order]; const [m] = n.splice(dr.current.pos, 1); n.splice(target, 0, m)
      dr.current.order = n; dr.current.pos = target
      setOrder2(n)
    }
    setDragPos({ pos: target, rel })
  }
  const loop = () => { // auto-scroll continuo della pagina ai bordi
    const dy = dr.current.y < 150 ? -9 : dr.current.y > window.innerHeight - 170 ? 9 : 0
    if (dy) { window.scrollBy(0, dy); upd() }
    dr.current.raf = requestAnimationFrame(loop)
  }
  const stopTimer = () => { if (dr.current.timer) { clearTimeout(dr.current.timer); dr.current.timer = null } }
  const down = (e: React.PointerEvent, pos: number) => {
    const el = e.currentTarget as HTMLElement, pid = e.pointerId
    dr.current = { ...dr.current, y: e.clientY, startY: e.clientY, pos, order: blocks.map((_, i) => i), active: false, moved: false }
    stopTimer()
    dr.current.timer = setTimeout(() => { // tenuto fermo: parte il drag
      dr.current.active = true; dr.current.moved = true // moved: il click dopo non deve aprire
      el.setPointerCapture?.(pid)
      navigator.vibrate?.(30)
      setOrder2([...dr.current.order])
      dr.current.raf = requestAnimationFrame(loop)
      upd()
    }, 260)
  }
  const move = (e: React.PointerEvent) => {
    dr.current.y = e.clientY
    if (!dr.current.active) { // si muove prima del long-press: è uno scroll, annulla l'attesa
      if (Math.abs(e.clientY - dr.current.startY) > 10) stopTimer()
      return
    }
    upd()
  }
  const up = () => {
    stopTimer()
    if (!dr.current.active) return
    dr.current.active = false
    cancelAnimationFrame(dr.current.raf)
    // appiattisco i blocchi: il chiamante ragiona in indici di item, non sa dei blocchi
    onReorder(dr.current.order.flatMap((bi) => blocksRef.current[bi])) // rilascio = conferma
    setOrder2(null); setDragPos(null)
  }
  const cancel = () => { // gesto reclamato dal browser: annulla senza applicare
    stopTimer()
    if (!dr.current.active) return
    dr.current.active = false
    cancelAnimationFrame(dr.current.raf)
    setOrder2(null); setDragPos(null)
  }
  const tap = (idx: number) => {
    if (dr.current.moved) { dr.current.moved = false; return } // era un drag, non un tap
    onTap(idx)
  }
  const ord = order2 ?? blocks.map((_, i) => i) // ordine dei BLOCCHI a schermo
  return (
    <div className="reobox" ref={obox} style={{ height: items.length * rowH }}>
      {ord.map((bi, pos) => {
        const righe = blocks[bi]
        const dragging = order2 != null && dragPos?.pos === pos
        const hB = righe.length * rowH
        const y = dragging ? dragPos!.rel - hB / 2 : rowsBefore(ord, pos) * rowH
        return (
          <div key={keyOf(items[righe[0]])} className={'reoblock' + (dragging ? ' dragging' : '')}
            style={{ transform: `translateY(${y}px)`, height: hB }}
            onPointerDown={(e) => down(e, pos)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
            {righe.map((oi, k) => (
              <div key={keyOf(items[oi])} className={'ocard inblock' + (dragging ? ' dragging' : '') + (rowClass ? ' ' + rowClass(items[oi]) : '')}
                style={{ top: k * rowH + 4, height: rowH - 8 }}
                onClick={() => tap(oi)}>
                {render(items[oi])}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

type Draft = { kg: string; reps: string; rpe: string }

// Calcolatore bilanciere: bilanciere + dischi per lato -> peso totale (2 lati).
// target = il peso della serie (proposta del coach): mostra quanto caricare per lato.
function BarCalc({ target, onUse, onClose }: { target?: number; onUse: (kg: number) => void; onClose: () => void }) {
  const [bar, setBar] = useState(20)
  const [plates, setPlates] = useState<number[]>([])
  const PLATES = [1.25, 2.5, 5, 10, 15, 20, 25]
  const perSide = plates.reduce((a, p) => a + p, 0)
  const total = bar + perSide * 2
  return (
    <div className="overlay center" onClick={onClose}>
      <div className="dlg" onClick={(e) => e.stopPropagation()}>
        <b className="dt">Calcolatore bilanciere</b>
        <div className="mrow" style={{ marginTop: 12 }}><span>Bilanciere</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[20, 15, 10, 0].map((b) => <button key={b} className={'chip' + (bar === b ? ' on' : '')} onClick={() => setBar(b)}>{b}</button>)}
          </div>
        </div>
        {target != null && target > bar && (
          <div className="mrow" style={{ marginTop: 10 }}>
            <span className="sm mut">Consigliato: {fmt(target)} kg</span>
            <b className="num" style={{ color: 'var(--lime)' }}>{fmt((target - bar) / 2)} kg per lato</b>
          </div>
        )}
        <p className="sm mut" style={{ margin: '14px 0 6px' }}>Dischi per lato — tocca per aggiungere</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PLATES.map((p) => <button key={p} className="chip" onClick={() => setPlates([...plates, p])}>{fmt(p)}</button>)}
        </div>
        {plates.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {plates.map((p, i) => <button key={i} className="chip on" onClick={() => setPlates(plates.filter((_, j) => j !== i))}>{fmt(p)} ✕</button>)}
          </div>
        )}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <span className="sm mut">per lato {fmt(perSide)} kg →</span> <b className="num" style={{ fontSize: 24, color: 'var(--lime)' }}>{fmt(total)} kg</b>
        </div>
        <button style={{ marginTop: 14 }} onClick={() => onUse(total)}>Usa {fmt(total)} kg</button>
        <button className="ghost" style={{ marginTop: 8 }} onClick={onClose}>Annulla</button>
      </div>
    </div>
  )
}

// Dove finisce il video scelto: la dimostrazione dell'esercizio o una singola serie.
type VidTarget = { kind: 'demo'; ex: string } | { kind: 'serie'; ex: string; i: number }

// Caricamento video condiviso fra la vista allenamento e l'editor della scheda: un solo
// <input file> nascosto (galleria e fotocamera le offre il telefono) e il bersaglio tenuto
// in un ref finché l'utente sceglie, così il chiamante non deve ricostruire ogni volta il giro.
function useVideoUpload<T>(salva: (path: string, target: T) => void) {
  const fileRef = useRef<HTMLInputElement>(null)
  const target = useRef<T | null>(null)
  const [busy, setBusy] = useState(false)
  const pick = (t: T) => { target.current = t; fileRef.current?.click() }
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // senza il reset, riscegliere lo stesso file non farebbe scattare onChange
    const t = target.current; target.current = null
    if (!file || t == null) return
    setBusy(true)
    try { salva(await uploadVideo(file), t); toast('Video caricato') }
    catch (err) { toast(err instanceof Error ? err.message : 'Caricamento non riuscito') }
    finally { setBusy(false) }
  }
  const input = <input ref={fileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={onFile} />
  const attesa = busy ? (
    <div className="overlay center">
      <div className="dlg" style={{ textAlign: 'center' }}>
        <b className="dt">Carico il video…</b>
        <p className="sm mut" style={{ margin: '8px 0 0' }}>Con la rete del telefono può volerci un po'. Non chiudere l'app.</p>
      </div>
    </div>
  ) : null
  return { pick, busy, input, attesa }
}

// I file nel bucket privato non hanno un link fisso: se ne chiede uno firmato quando
// si guarda il video. Perciò il <video> vive qui dentro, con i suoi stati di attesa.
function Video({ src, className }: { src: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [ko, setKo] = useState(false)
  useEffect(() => {
    let vivo = true // la focus cambia esercizio in fretta: scarto le risposte tardive
    setUrl(null); setKo(false)
    videoUrl(src).then((u) => { if (vivo) setUrl(u) }).catch(() => { if (vivo) setKo(true) })
    return () => { vivo = false }
  }, [src])
  if (ko) return <div className={(className ?? '') + ' vidmsg'}>Video non disponibile</div>
  if (!url) return <div className={(className ?? '') + ' vidmsg'}>Carico il video…</div>
  return <video className={className} src={url} controls playsInline />
}

// Calcolatore RPE, nei due versi che servono in palestra:
// sopra da una serie al massimale stimato, sotto dal massimale al carico per ogni reps@RPE.
function RpeCalc({ ex, kg0, reps0, max0, onUse, onClose }: {
  ex: string; kg0: number; reps0: number; max0: number
  onUse: (kg: number) => void; onClose: () => void
}) {
  const [kg, setKg] = useState(kg0 ? fmt(kg0) : '')
  const [reps, setReps] = useState(String(reps0 || 3))
  const [rpe, setRpe] = useState('8')
  const nKg = parseFloat(kg.replace(',', '.')) || 0
  const nReps = parseInt(reps, 10) || 0
  const daSerie = nKg && nReps ? e1rmRpe(nKg, nReps, +rpe) : 0
  const max = daSerie || max0 // la serie compilata vince sullo storico
  const COLS = [6, 7, 8, 9, 10]
  const ROWS = [1, 2, 3, 5, 8, 10]
  return (
    <div className="overlay center" onClick={onClose}>
      <div className="dlg" onClick={(e) => e.stopPropagation()}>
        <b className="dt">Calcolatore RPE</b>
        <p className="sm mut" style={{ margin: '3px 0 12px' }}>{ex}</p>
        <div className="rpein">
          <div><label>Peso (kg)</label>
            <input value={kg} onChange={(e) => setKg(e.target.value)} onFocus={(e) => e.target.select()} inputMode="decimal" placeholder="kg" /></div>
          <div><label>Reps</label>
            <input value={reps} onChange={(e) => setReps(e.target.value)} onFocus={(e) => e.target.select()} inputMode="numeric" /></div>
          <div><label>RPE</label>
            <select value={rpe} onChange={(e) => setRpe(e.target.value)}>
              {RPE_VALS.map((v) => <option key={v} value={v}>{fmt(v)}</option>)}
            </select></div>
        </div>
        <div style={{ textAlign: 'center', margin: '14px 0 2px' }}>
          <span className="sm mut">massimale stimato </span>
          <b className="num" style={{ fontSize: 24, color: 'var(--lime)' }}>{max ? fmt(round25(max)) + ' kg' : '—'}</b>
        </div>
        <p className="sm mut" style={{ textAlign: 'center', margin: 0, fontSize: 12 }}>
          {daSerie ? 'da questa serie' : max0 ? 'dal tuo storico — compila la serie per ricalcolarlo' : 'compila la serie qui sopra'}
        </p>
        {max > 0 && <>
          <div className="rpecap">
            <b>Che carico usare</b>
            <span>righe = ripetizioni · colonne = RPE · tocca per usarlo</span>
          </div>
          <div className="rpegrid">
            <span className="rh corner">rip.</span>
            {COLS.map((c) => <span key={c} className={'rh' + (+rpe === c ? ' on' : '')}>@{c}</span>)}
            {ROWS.flatMap((r) => [
              <span key={'h' + r} className="rh side">{r}</span>,
              ...COLS.map((c) => (
                <button key={r + '-' + c} className={'rc num' + (+rpe === c ? ' on' : '')} onClick={() => onUse(caricoPerRpe(max, r, c))}>
                  {fmt(caricoPerRpe(max, r, c))}
                </button>
              )),
            ])}
          </div>
        </>}
        <button className="ghost" style={{ marginTop: 15 }} onClick={onClose}>Chiudi</button>
      </div>
    </div>
  )
}

function Allena({ s, setS, startRest, stopRest, workoutStart, setWorkoutStart, timerActive }: {
  s: State; setS: (u: State) => void; startRest: (sec: number) => void; stopRest: () => void
  workoutStart: number | null; setWorkoutStart: (v: number | null) => void; timerActive: boolean
}) {
  // Esercizi tolti SOLO da questa seduta: la scheda resta intatta.
  const skipped = new Set((s.sessionEx ?? []).filter((x) => x.date === today() && x.skip).map((x) => x.ex))
  // L'allenamento è una COPIA della scheda: se esiste una copia per OGGI (stesso scheda/giorno)
  // il piano viene da lì, altrimenti dalla scheda viva. La copia nasce alla prima modifica in corsa.
  // ANCORA: appena l'allenamento parte, la copia del giorno diventa la sorgente e ci resta.
  // Da lì in poi in Schede puoi girare e modificare quello che vuoi: la seduta non si muove.
  // Senza copia (allenamento non ancora iniziato) si segue la scheda attiva, come prima.
  const anc = s.allenamento?.date === today() ? s.allenamento : null
  const baseItems = anc ? anc.items : curItems(s)
  // Garantisce la copia del giorno su una bozza di stato e ne torna gli items da mutare.
  const ensureCopia = (d: State): PlanItem[] => {
    if (d.allenamento?.date !== today()) {
      d.allenamento = { date: today(), scheda: s.activeScheda, day: s.activeDay, items: structuredClone(curItems(s)) }
    }
    return d.allenamento.items
  }
  // Modifica il giorno in allenamento SENZA toccare la scheda: crea la copia se manca, poi muta lei.
  const mutaGiorno = (fn: (items: PlanItem[]) => void) => { const d = structuredClone(s); fn(ensureCopia(d)); setS(d) }
  const plan = baseItems.flatMap((it, i, arr) => {
    if (skipped.has(it.ex)) return []
    // se il compagno di superset è saltato oggi sciolgo la coppia: senza, il lock
    // resterebbe in attesa di una serie di un esercizio che oggi non c'è
    const next = arr[i + 1]
    return [it.ss && next && skipped.has(next.ex) ? { ...it, ss: undefined } : it]
  })
  const extras = s.extras.filter((e) => e.date === today()).map((e) => e.item)
  const items = [...plan, ...extras]
  // anche i nomi in intestazione seguono l'ancora, sennò diresti "Push A" mentre alleni Pull B
  const schedaAll = anc ? s.schede[anc.scheda] : curScheda(s)
  const day = anc ? schedaAll?.days[anc.day] : curDay(s)
  const lib = libreriaEsercizi(s)
  const [summary, setSummary] = useState<{ sets: number; tonnage: number; avgRpe: number; prs: string[]; kcal: number; health: HealthPayload; startMs: number | null; endMs: number } | null>(null)
  const [barCalc, setBarCalc] = useState<{ it: PlanItem; sp: SetSpec; i: number; target?: number } | null>(null)
  const [rpeCalc, setRpeCalc] = useState<{ it: PlanItem; sp: SetSpec; i: number } | null>(null)
  const [playVid, setPlayVid] = useState<{ url: string; ex: string; i: number; title: string } | null>(null)
  const maxOf = (ex: string) => massimale(s, ex).kg
  const [draft, setDraft] = useState<Record<string, Draft>>({})
  const [picker, setPicker] = useState(false)
  const [statsEx, setStatsEx] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ it: PlanItem; isExtra: boolean; idx: number } | null>(null)
  const [swap, setSwap] = useState<{ ex: string; isExtra: boolean } | null>(null)
  const [restPick, setRestPick] = useState<{ ex: string; isExtra: boolean } | null>(null)
  const [focus, setFocus] = useState<number | null>(null)     // vista focus: indice esercizio (null = overview)
  const [pr, setPr] = useState<{ ex: string; kg: number; reps: number } | null>(null) // festa nuovo record
  useEffect(() => {
    if (!pr) return
    const id = setTimeout(() => setPr(null), 3200) // la festa si chiude da sola
    return () => clearTimeout(id)
  }, [pr])

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
  // Rimuove un esercizio durante l'allenamento. Gli extra spariscono e basta; per un esercizio della
  // scheda chiedo conferma (lo toglie da quel giorno della scheda). Le serie già segnate restano nello storico.
  const removeEsercizio = async (ex: string, isExtra: boolean) => {
    setMenu(null); setFocus(null)
    if (isExtra) return removeExtra(ex)
    // Toglie l'esercizio SOLO da oggi: quello che è legato alla scheda resta nella scheda.
    if (!(await confirmDlg('Togliere l\'esercizio da oggi?', ex + ' — resta nella scheda, sparisce solo da questo allenamento.'))) return
    setS({ ...s, sessionEx: setSessionEx(s, ex, today(), { skip: true }) })
  }

  // Video: la meccanica sta nell'hook, qui resta solo dove salvare il percorso.
  const { pick: pickVideo, input: videoInput, attesa: videoAttesa } = useVideoUpload<VidTarget>((path, t) => {
    if (t.kind === 'demo') {
      const prima = (s.exVideo ?? {})[t.ex]
      setS({ ...s, exVideo: { ...(s.exVideo ?? {}), [t.ex]: path } })
      if (prima) void deleteVideo(prima) // sostituito: il vecchio file non serve più
    } else {
      const cur = sessionExOf(s, t.ex, today())?.setVideos ?? {}
      const prima = cur[t.i]
      setS({ ...s, sessionEx: setSessionEx(s, t.ex, today(), { setVideos: { ...cur, [t.i]: path } }) })
      if (prima) void deleteVideo(prima)
    }
  })

  const removeDemoVideo = async (ex: string) => {
    if (!(await confirmDlg('Togliere la dimostrazione?', ex))) return
    const cur = (s.exVideo ?? {})[ex]
    const next = { ...(s.exVideo ?? {}) }; delete next[ex]
    setS({ ...s, exVideo: next })
    if (cur) void deleteVideo(cur)
  }

  const removeSerieVideo = async (ex: string, i: number) => {
    const cur = sessionExOf(s, ex, today())?.setVideos ?? {}
    const url = cur[i]
    const next = { ...cur }; delete next[i]
    setS({ ...s, sessionEx: setSessionEx(s, ex, today(), { setVideos: Object.keys(next).length ? next : undefined }) })
    if (url) void deleteVideo(url)
  }

  // Ingranaggio: opzioni runtime sull'esercizio in corso
  // Extra → la sua lista per-data; esercizio di scheda → la COPIA del giorno, mai la scheda.
  const patchItem = (ex: string, isExtra: boolean, fn: (t: PlanItem) => void) => {
    if (isExtra) {
      const d = structuredClone(s)
      const t = d.extras.find((e) => e.date === today() && e.item.ex === ex)?.item
      if (t) { fn(t); setS(d) }
      return
    }
    mutaGiorno((items) => { const t = items.find((x) => x.ex === ex); if (t) fn(t) })
  }
  // il riordino agisce sulla copia del giorno, non riordina la scheda
  const applyOrder = (order: number[]) => mutaGiorno((items) => {
    const orig = items.slice(); items.length = 0; items.push(...order.map((i) => orig[i]))
  })

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
    if (!existing) d.customExercises.push({ name, muscle }) // libreria: aggiunta legittima
    // esercizio di scheda → la COPIA del giorno, mai la scheda
    const t = swap.isExtra
      ? d.extras.find((e) => e.date === today() && e.item.ex === swap.ex)?.item
      : ensureCopia(d).find((x) => x.ex === swap.ex)
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
  // il target dell'esercizio ("@8") vale per ogni serie, salvo quelle che ne hanno uno proprio
  const specs = (it: PlanItem): SetSpec[] =>
    it.scheme?.map((sp) => (sp.target || !it.target ? sp : { ...sp, target: it.target }))
    ?? Array.from({ length: it.sets }, () => ({ type: 'normal' as SetType, reps: String(it.reps), target: it.target }))

  const totalPlanned = items.reduce((a, it) => a + specs(it).length, 0)
  const totalDone = items.reduce((a, it) => a + Math.min(logOf(it.ex).length, specs(it).length), 0)
  const pct = totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : 0

  // Peso proposto per la singola serie, in ordine di autorevolezza:
  //  1) "87%" = percentuale ASSOLUTA del massimale. È una prescrizione del programma:
  //     si rispetta e NON la si corregge con la readiness.
  //  2) l'RPE prescritto ("@8"): l'autoregolazione è già lui, quindi niente correzione sopra.
  //  3) niente di tutto ciò → la stima storica, che la readiness la applica.
  // "-5%" è un'altra cosa da "87%": è uno scarico RELATIVO al peso di lavoro, non del massimale.
  const propose = (it: PlanItem, sp: SetSpec): number | null => {
    const reps = parseInt(sp.reps, 10) || itemReps(it)
    const max = massimale(s, it.ex).kg // riferimento dell'utente se c'è, altrimenti stima
    const load = sp.load?.match(/(-?)\s*@?\s*(\d+)\s*%/)
    if (max > 0 && load && load[1] !== '-') return round25(max * (+load[2] / 100))
    const rpe = parseTarget(sp.target)
    // senza prescrizione il bersaglio è il peso COERENTE COL PR per quelle reps (inverso di Epley):
    // è il numero da provare a battere, non una stima scontata dalla readiness
    let kg = max > 0 && rpe ? caricoPerRpe(max, reps, rpe)
      : max > 0 ? max / (1 + reps / 30)
      : proposta(s, it.ex, reps)?.kg ?? 0
    if (!kg) return null
    if (load && load[1] === '-') kg *= 1 - +load[2] / 100
    if (sp.type === 'warmup') kg *= 0.5
    return round25(kg)
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
    const timed = isTimed(it) // serie a tempo: i "reps" sono secondi
    const kg = parseFloat(d.kg.replace(',', '.'))
    // a corpo libero il peso è 0 e va benissimo: quello che non può mancare è la durata
    if (!+d.reps || (!timed && !kg)) return toast(timed ? 'Servono i secondi' : 'Servono peso e ripetizioni')
    if (workoutStart == null) setWorkoutStart(Date.now()) // il cronometro parte dalla prima serie segnata
    const rpe = d.rpe ? +d.rpe : null
    // Festa record: la serie appena fatta batte il miglior e1rm di sempre su questo esercizio.
    // Sulle serie a tempo non ha senso: record() le esclude e prev resta null.
    const prev = record(s.log, it.ex)
    const isPr = !timed && !!prev && e1rm(kg, +d.reps) > e1rm(prev.kg, prev.reps) + 0.01
    let id: string | undefined
    let rec: number | null = null
    try { const r = serieLoggata(it.ex, kg || 0, +d.reps, rpe); id = r.id; rec = r.rec } // specchio cloud + recupero reale
    catch (e) { console.warn('[serie cloud]', e) } // un errore di sync NON deve bloccare il salvataggio locale
    const dopo: State = { ...s, log: [...s.log, { id, date: today(), ex: it.ex, kg: kg || 0, reps: +d.reps, rpe, timed: timed || undefined, rec }] }
    // Prima serie della giornata: fisso l'ANCORA. Da qui la seduta è legata a questo giorno
    // e in Schede puoi navigare ovunque senza spostartela sotto i piedi.
    if (dopo.allenamento?.date !== today()) {
      dopo.allenamento = { date: today(), scheda: s.activeScheda, day: s.activeDay, items: structuredClone(baseItems) }
    }
    setS(dopo)
    if (isPr) { setPr({ ex: it.ex, kg, reps: +d.reps }); navigator.vibrate?.([90, 60, 90]) }
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
  // Invio a Salute derivato dalla durata SALVATA per quella data: così correggere i minuti
  // aggiorna anche ciò che mandi, e la data corretta impedisce che finisca sotto oggi.
  const inviaSaluteData = (date: string) => {
    const durSec = s.durate?.[date] ?? 0
    const peso = s.body.length ? s.body[s.body.length - 1].kg : 75
    inviaSalute({ durata: Math.round(durSec / 60), calorie: stimaCalorie(durSec, peso), distanza: 0, data: date })
  }
  const finish = () => {
    if (!anyToday) return toast('Segna almeno una serie prima di chiudere')
    const endMs = Date.now()
    const durataSec = workoutStart ? Math.round((endMs - workoutStart) / 1000) : 0
    const pesoCorporeo = s.body.length ? s.body[s.body.length - 1].kg : 75
    const kcal = stimaCalorie(durataSec, pesoCorporeo) // stima da mandare ad Apple Health
    const health: HealthPayload = { durata: Math.round(durataSec / 60), calorie: kcal, distanza: 0, data: today() }
    setSummary({ ...sessionSummary(s.log, today()), prs: prsForSession(s.log, today()), kcal, health, startMs: workoutStart, endMs })
    setWorkoutStart(null) // finito è finito: fermo il cronometro dell'allenamento
    stopRest()            // e il timer di recupero
    sessioneChiusa()      // chiudo la sessione nel cloud
    // durata salvata per data: sopravvive al ricarico dell'app e resta correggibile dal calendario
    setS({ ...s, finishedDate: today(), finishedKcal: kcal, finishedHealth: health, durate: { ...(s.durate ?? {}), [today()]: durataSec } })
  }
  const chiudiSummary = () => setSummary(null) // chiudo il riepilogo: resta la schermata "completato"
  const abort = async () => {
    if (!(await confirmDlg('Abbandonare l\'allenamento?', 'Le serie segnate in questa sessione verranno cancellate. Non conta come completato.'))) return
    const ids = sessioneAnnullata() // via dal cloud, torna gli id da togliere in locale
    setS({ ...s, log: s.log.filter((l) => !(l.id && ids.includes(l.id))) })
    setWorkoutStart(null); stopRest()
  }

  if (!items.length) return (
    <>
      <h2>Allenamento</h2>
      <p className="sm mut" style={{ lineHeight: 1.6 }}>Nessun giorno attivo. Vai in <b>Schede</b>, scegli un giorno e premi ▶ Inizia.</p>
    </>
  )

  // Allenamento di oggi concluso con "Finito": schermata bloccata di sola lettura (niente lista modificabile).
  if (s.finishedDate === today() && anyToday && !summary) {
    const sum = sessionSummary(s.log, today())
    const prs = prsForSession(s.log, today())
    return (
      <>
        <div className="card done" style={{ marginTop: 8 }}>
          <div className="donecirc"><svg viewBox="0 0 24 24"><path d="M4 12l6 6L20 6" /></svg></div>
          <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 17 }}>Allenamento di oggi completato</div>
          {s.finishedKcal != null && <div style={{ textAlign: 'center', marginTop: 6 }}><b className="num" style={{ color: 'var(--coral)', fontSize: 15 }}>🔥 {s.finishedKcal} kcal</b> <span className="sm mut">stimate</span></div>}
          <div className="tiles" style={{ marginTop: 12 }}>
            <div className="tile"><div className="l">Tonnellaggio</div><div className="v num">{fmt(sum.tonnage / 1000)} <span className="sm mut">t</span></div></div>
            <div className="tile"><div className="l">Serie</div><div className="v num">{sum.sets}</div></div>
            <div className="tile"><div className="l">RPE medio</div><div className="v num">{sum.avgRpe ? fmt(sum.avgRpe) : '—'}</div></div>
            <div className="tile"><div className="l">Record</div><div className="v num" style={{ color: prs.length ? 'var(--amber)' : undefined }}>{prs.length}</div></div>
          </div>
          {prs.map((ex) => (
            <div className="prband" key={ex}><span className="star">★</span><div><div className="pt2">Nuovo record</div><div className="pv2">{ex}</div></div></div>
          ))}
        </div>
        {isIOS() && <button style={{ marginTop: 14 }} onClick={() => inviaSaluteData(today())}>🍎 Invia a Salute</button>}
        <p className="sm mut" style={{ textAlign: 'center', margin: '14px 0 0' }}>Torna domani, oppure scegli un altro giorno in <b>Schede</b>.</p>
        <button className="ghost" style={{ marginTop: 14 }} onClick={() => setS({ ...s, finishedDate: undefined })}>Riapri e modifica l'allenamento</button>
      </>
    )
  }

  const dur = workoutStart ? Math.floor((Date.now() - workoutStart) / 1000) : 0
  const todayVol = volume(todayLog)
  // superset: un item plan con ss è legato al successivo; il seguente eredita il gruppo
  const inSS = (idx: number) => idx < plan.length && ((plan[idx]?.ss ?? false) || (idx > 0 && (plan[idx - 1]?.ss ?? false)))

  return (
    <>
      {focus != null && items[focus] ? (() => {
        // ---- VISTA FOCUS: un esercizio = una schermata (serie, storico, note, tool) ----
        const idx = focus
        const it = items[idx]
        const sps = specs(it)
        const done = Math.min(logOf(it.ex).length, sps.length)
        const exDone = done >= sps.length
        const tag = schemeTag(it)
        const isExtra = idx >= plan.length
        const sessNote = sessionExOf(s, it.ex, today()) // nota e video-serie di OGGI su questo esercizio
        const prSet = prSerie(s.log, it.ex, today()) // quale serie di oggi ha battuto il record
        const demoVideo = (s.exVideo ?? {})[it.ex] // dimostrazione, vale sempre
        const ss = inSS(idx)
        // Superset A→B→A→B stretto: A max una serie avanti su B, B mai pari/oltre A.
        // Il pairing vale SOLO tra esercizi di scheda: mai scavalcare verso gli extra.
        const ssNext = idx + 1 < plan.length && it.ss ? items[idx + 1] : null
        const ssPrev = idx > 0 && idx < plan.length && items[idx - 1]?.ss ? items[idx - 1] : null
        const ssWait = ssNext && logOf(it.ex).length > logOf(ssNext.ex).length ? ssNext.ex
          : ssPrev && logOf(it.ex).length >= logOf(ssPrev.ex).length ? ssPrev.ex : null
        // Storico: l'ultima seduta passata con questo esercizio, visibile mentre carichi
        const prevDates = historyDates(s.log, it.ex).filter((d2) => d2 !== today())
        const lastDate = prevDates[prevDates.length - 1]
        const lastSets = lastDate ? s.log.filter((l) => l.date === lastDate && l.ex === it.ex) : []
        return (
          <>
            <div className="bc">
              <button className="back" onClick={() => setFocus(null)}>‹</button>
              <div style={{ flex: 1 }} />
              <span className={'exprog num' + (exDone ? ' ok' : '')}>{exDone ? '✓' : `${done}/${sps.length}`}</span>
              <button className="pen" onClick={() => setMenu({ it, isExtra, idx })} title="Opzioni esercizio"><Gear size={17} /></button>
            </div>

            {/* ponytail: <video> con l'URL basta per i file diretti e per il futuro Supabase
                Storage; l'upload dal telefono e i link YouTube verranno dopo. */}
            {/* Video DIMOSTRATIVO: come va eseguito l'esercizio. È dell'esercizio, non della
                seduta — lo registri una volta e lo ritrovi in ogni scheda e ogni giorno.
                I video delle tue serie stanno invece sulle righe delle serie, sotto. */}
            {demoVideo
              ? (
                // col video il tocco se lo prendono i controlli del player: i comandi
                // devono stare sopra, altrimenti resti senza via per cambiarlo o toglierlo
                <div className="fvwrap">
                  <Video className="fhero fvideo" src={demoVideo} />
                  <button className="fvedit" onClick={() => pickVideo({ kind: 'demo', ex: it.ex })} title="Sostituisci la dimostrazione">✎</button>
                  <button className="fvedit fvdel" onClick={() => removeDemoVideo(it.ex)} title="Togli la dimostrazione">✕</button>
                </div>
              )
              : (
                <div className="fhero" onClick={() => pickVideo({ kind: 'demo', ex: it.ex })}>
                  <svg viewBox="0 0 24 24"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg>
                  <span className="sm">Come si esegue · tocca per caricare la dimostrazione</span>
                </div>
              )}
            <div className="ftitle">{it.ex}</div>
            <div className="crumb" style={{ margin: '4px 2px 0' }}><i className="mdotx" style={{ background: mcolor(it.muscle) }} />{it.muscle}{isExtra ? ' · extra' : ''}{tag ? ' · ' + tag : ''}{it.tempo ? ' · ' + it.tempo : ''}{it.target ? ' · ' + it.target : ''}</div>

            {/* Superset dichiarato SUBITO, prima ancora di caricare: prima si leggeva solo
                come "· superset" nel crumb e lo scoprivi quando il lock ti fermava. */}
            {ss && (ssNext || ssPrev) && (
              <div className="ssbar">
                <div>
                  <b>Superset con {(ssNext ?? ssPrev)!.ex}</b>
                  <span>Alterna una serie per esercizio</span>
                </div>
              </div>
            )}

            <div className="card fstats">
              <div><span className="fsico"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 3.5V8h-4.5" /></svg></span><b className="num">{sps.length}</b><span className="l">Serie</span></div>
              <div><span className="fsico"><svg viewBox="0 0 24 24"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg></span><b className="num">{itemReps(it)}{isTimed(it) ? 's' : ''}</b><span className="l">{isTimed(it) ? 'Durata' : 'Ripetizioni'}</span></div>
              <div><span className="fsico"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 1.9" /></svg></span><b className="num">{mmss(it.rest)}</b><span className="l">Recupero</span></div>
            </div>

            <div className="card" style={{ marginTop: 12, cursor: 'pointer' }} onClick={() => setStatsEx(it.ex)}>
              <div className="cardh"><svg viewBox="0 0 24 24"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg><b>Storico pesi</b><span className="chev" style={{ marginLeft: 'auto' }}>›</span></div>
              <div className="cardh-div" />
              {lastSets.length
                ? <>
                    <div className="sm mut">Ultima volta · {lastDate!.split('-').reverse().join('/')}</div>
                    <div className="num" style={{ marginTop: 5, fontWeight: 700, fontSize: 14.5, lineHeight: 1.7 }}>{lastSets.map((l) => `${l.timed ? `${l.reps}s${l.kg > 0 ? ' +' + fmt(l.kg) : ''}` : `${fmt(l.kg)}×${l.reps}`}${l.rpe != null ? '@' + fmt(l.rpe) : ''}`).join('  ·  ')}</div>
                    {/* contesto = confronto onesto: stesso peso letto in posizioni diverse non è la stessa cosa */}
                    {(() => {
                      const prima = contestoEsercizio(s, it.ex, lastDate!)
                      const oggiPos = items.findIndex((x) => x.ex === it.ex) + 1
                      const oggiPre = items.slice(0, oggiPos - 1).filter((x) => x.muscle === it.muscle).reduce((a, x) => a + logOf(x.ex).length, 0)
                      return (
                        <div className="sm mut" style={{ marginTop: 7, lineHeight: 1.5 }}>
                          Allora: {prima.pos}° esercizio, {prima.preSerieMuscolo} serie di {it.muscle} prima.<br />
                          Oggi: {oggiPos}° esercizio, {oggiPre} finora.
                          {oggiPos > prima.pos && <b style={{ color: 'var(--amber)' }}> Più affaticato: normale calare un po'.</b>}
                        </div>
                      )
                    })()}
                  </>
                : <p className="sm mut" style={{ margin: 0 }}>Nessun carico inserito: parti prudente e segna tutto.</p>}
            </div>

            {/* SOPRA le serie la DESCRIZIONE: è ciò che leggi prima di caricare (nota della
                scheda + descrizione dell'esercizio). Sola lettura, si modifica nell'editor.
                Il diario di oggi sta in fondo, dopo le serie: lo scrivi quando hai finito. */}
            {(it.note || (s.exDesc ?? {})[it.ex]) && (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="cardh"><b>Descrizione</b></div>
                <div className="cardh-div" />
                {it.note && <div className="schednote"><span className="l">Dalla scheda</span>{it.note}</div>}
                {(s.exDesc ?? {})[it.ex] && <div className="schednote" style={{ marginBottom: 0 }}><span className="l">Sull'esercizio</span>{s.exDesc[it.ex]}</div>}
              </div>
            )}

            <div className={'card excard' + (exDone ? ' completed' : '')} style={{ marginTop: 12 }}>
              <div className="cardh"><b>Serie</b></div>
              <div className="serhead"><span /><span>Peso (kg)</span><span>{isTimed(it) ? 'Secondi' : 'Reps'}</span><span>RPE</span><span>RIR</span><span /></div>
              {sps.map((sp, i) => {
                if (i < done) {
                  const logged = logOf(it.ex)[i]
                  return (
                    <div className={'wrow done' + (prSet[i] ? ' isPr' : '')} key={i}>
                      <span className="sidx ok">✓</span>
                      <b className="num" style={{ fontSize: 14 }}>
                        {logged.timed
                          ? <>{logged.reps}s{logged.kg > 0 && <> · {fmt(logged.kg)} kg</>}</>
                          : <>{fmt(logged.kg)} kg × {logged.reps}</>}
                      </b>
                      {/* ★ sulla serie che HA fatto il record: la festa passa, questo resta */}
                      {prSet[i] && <span className="prtag" title="Record su questa serie">★ record</span>}
                      {logged.rpe != null && <span className={'r num ' + (logged.rpe >= 8.5 ? 'r-hi' : 'r-ok')}>RPE {fmt(logged.rpe)} · RIR {fmt(10 - logged.rpe)}</span>}
                      {/* video di QUESTA serie: sta sulla riga già fatta, che è la sola con
                          spazio e l'unico momento in cui il video può esistere davvero */}
                      {(() => {
                        const url = (sessNote?.setVideos ?? {})[i]
                        return (
                          <span className={'svid' + (url ? ' on' : '')} style={{ marginLeft: 'auto' }}
                            title={url ? 'Guarda il video della serie' : 'Allega il video di questa serie'}
                            onClick={() => url
                              ? setPlayVid({ url, ex: it.ex, i, title: `Serie ${i + 1} · ${it.ex}` })
                              : pickVideo({ kind: 'serie', ex: it.ex, i })}>▶</span>
                        )
                      })()}
                      <span className="del" onClick={() => uncheck(it.ex, i)}>✕</span>
                    </div>
                  )
                }
                const active = i === done
                const d = getDraft(it, sp, i)
                return (
                  <div className={'wrow st-' + sp.type + (active ? ' active' : ' pending')} key={i}>
                    <span className="sidx">{i + 1}</span>
                    <input value={d.kg} onChange={(e) => setD(it, sp, i, { kg: e.target.value })} onFocus={(e) => e.target.select()} inputMode="decimal" placeholder="kg" />
                    <input value={d.reps} onChange={(e) => setD(it, sp, i, { reps: e.target.value })} onFocus={(e) => e.target.select()} inputMode="numeric" placeholder={isTimed(it) ? 'sec' : 'reps'} />
                    {/* RPE e RIR sono due facce della stessa cosa (RIR = 10 − RPE): entrambi i campi
                        restano compilabili, ma il valore vero è UNO SOLO, così non possono discordare. */}
                    <select value={d.rpe} onChange={(e) => setD(it, sp, i, { rpe: e.target.value })} title="RPE">
                      <option value="">RPE</option>
                      {RPE_VALS.map((v) => <option key={v} value={v}>{fmt(v)}</option>)}
                    </select>
                    <select value={d.rpe === '' ? '' : String(10 - +d.rpe)} title="RIR"
                      onChange={(e) => setD(it, sp, i, { rpe: e.target.value === '' ? '' : String(10 - +e.target.value) })}>
                      <option value="">RIR</option>
                      {[...RPE_VALS].reverse().map((v) => <option key={v} value={10 - v}>{fmt(10 - v)}</option>)}
                    </select>
                    <button className="chk" disabled={!active || !!ssWait} onClick={() => check(it, sp, i)}>✓</button>
                    {(() => {
                      const sub = [sp.type !== 'normal' ? setTypeLabel(sp.type) : null, sp.load, sp.target].filter(Boolean).join(' · ')
                      return sub ? <div className="wsub">{sub}</div> : null
                    })()}
                    {active && ssWait && <div className="wsub" style={{ color: 'var(--amber)' }}>Superset: fai prima la serie di {ssWait}</div>}
                  </div>
                )
              })}
              <div className="setbtns" style={{ marginTop: 12 }}>
                <button className="restchip" style={{ margin: 0, justifyContent: 'center' }} onClick={() => setRestPick({ ex: it.ex, isExtra })}>
                  <Clock /> Riposo <b className="num">{mmss(it.rest)}</b>
                </button>
                {done < sps.length && <button className="addset" style={{ marginTop: 0, flex: 'none', width: 'auto', padding: '0 14px' }} onClick={() => setBarCalc({ it, sp: sps[done], i: done, target: parseFloat(getDraft(it, sps[done], done).kg.replace(',', '.')) || undefined })} title="Calcolatore bilanciere"><svg viewBox="0 0 24 24" className="misvg" style={{ width: 20, height: 20 }}><path d="M4 9v6M6.5 7v10M6.5 12h11M17.5 7v10M20 9v6" /></svg></button>}
                {done < sps.length && <button className="addset num" style={{ marginTop: 0, flex: 'none', width: 'auto', padding: '0 12px', fontSize: 13, letterSpacing: '.06em' }} onClick={() => setRpeCalc({ it, sp: sps[done], i: done })} title="Calcolatore RPE">RPE</button>}
                {/* a esercizio finito questo è IL tasto che serve (continuare con un'altra serie):
                    diventa pieno e a riga intera, invece di restare un tratteggio tra gli altri */}
                <button className={'addset' + (exDone ? ' vai' : '')} style={{ marginTop: 0, flex: exDone ? '1 0 100%' : 'none', width: 'auto', padding: exDone ? '12px' : '0 14px' }}
                  onClick={() => addSetRt(it, isExtra)}>＋ {exDone ? 'Aggiungi un\'altra serie' : 'Serie'}</button>
                <button className="addset rm" style={{ marginTop: 0, padding: '9px 13px' }} onClick={() => removeSetRt(it, isExtra)}>−</button>
              </div>
            </div>

            {/* Diario di OGGI in fondo: si scrive a serie finite, non prima. */}
            <div className="card" style={{ marginTop: 12 }}>
              <div className="cardh"><b>Come è andata oggi</b></div>
              <div className="cardh-div" />
              <textarea key={it.ex} className="notebox" rows={2} defaultValue={sessNote?.note ?? ''}
                placeholder="es. fastidio spalla, presa più larga, ultima serie tirata…"
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v !== (sessNote?.note ?? '')) setS({ ...s, sessionEx: setSessionEx(s, it.ex, today(), { note: v || undefined }) })
                }} />
            </div>

            <div style={{ height: 78 }} />{/* aria per la barra sticky */}
            <div className={'focusbar' + (timerActive ? ' up' : '')}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="mono sm mut" style={{ fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase' }}>Durata</div>
                <b className="num" style={{ color: workoutStart ? 'var(--lime)' : 'var(--mut2)' }}>{workoutStart ? durataFmt(dur) : '—'}</b>
              </div>
              {workoutStart != null && <button className="fbtn" style={{ color: 'var(--coral)', fontSize: 15 }} title="Annulla allenamento"
                onClick={async () => { await abort(); setFocus(null) }}>✕</button>}
              <button className="fbtn" disabled={idx === 0} onClick={() => setFocus(idx - 1)}>‹</button>
              <span className="num" style={{ fontWeight: 800, fontSize: 13 }}>{idx + 1}/{items.length}</span>
              {idx >= items.length - 1
                ? <button className="fbtn fine" title="Allenamento finito" onClick={() => { setFocus(null); finish() }}>✓</button>
                : <button className="fbtn" onClick={() => setFocus(idx + 1)}>›</button>}
            </div>
          </>
        )
      })() : (
        <>
          <div className="wbar">
            <div className="wbar-top">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="crumb">{schedaAll?.name} · allenamento</div>
                <div className="wbar-day">{day?.name}</div>
              </div>
              {workoutStart != null && <button onClick={abort} style={{ width: 'auto', padding: '8px 12px', marginRight: 8, background: 'transparent', color: 'var(--coral)', fontSize: 13 }}>Annulla</button>}
              <button className="finito" onClick={finish}>Finito</button>
            </div>
            <div className="wstats">
              <div className="ws"><div className="l">Durata</div><div className="v num" style={{ color: workoutStart ? 'var(--lime)' : 'var(--mut2)' }}>{workoutStart ? durataFmt(dur) : '—'}</div></div>
              <div className="ws"><div className="l">Volume</div><div className="v num">{fmt(todayVol)} <span className="sm mut">kg</span></div></div>
              <div className="ws"><div className="l">Serie</div><div className="v num">{totalDone}</div></div>
            </div>
            <div className="bt" style={{ height: 5, marginTop: 10 }}><i style={{ width: pct + '%', background: 'var(--lime)' }} /></div>
          </div>
          <p className="hint">Tocca un esercizio per allenarti · tieni premuto e trascina per riordinare · readiness <b className="num">{r}</b></p>

          <DragList items={plan} rowH={92} keyOf={(it) => it.ex}
            rowClass={(it) => {
              const pi = plan.indexOf(it)
              const exDone = Math.min(logOf(it.ex).length, specs(it).length) >= specs(it).length
              return (exDone ? 'done2 ' : '') + (it.ss || (pi > 0 && plan[pi - 1]?.ss) ? 'pair' : '')
            }}
            render={(it) => {
              const sps = specs(it)
              const done = Math.min(logOf(it.ex).length, sps.length)
              const exDone = done >= sps.length
              return (<>
                <span className="othumb"><svg viewBox="0 0 24 24"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b className="otitle">{it.ex}</b>
                  <div className="meta num" style={{ marginTop: 3 }}><i className="mdotx" style={{ background: mcolor(it.muscle) }} />{it.muscle} · {schemeSummary(it)}{it.ss ? ' · SS' : ''}{it.note ? ' · ✎' : ''}</div>
                </div>
                <span className={'exprog num' + (exDone ? ' ok' : '')}>{exDone ? '✓' : `${done}/${sps.length}`}</span>
                <span className="chev">›</span>
              </>)
            }}
            onTap={(i) => setFocus(i)} onReorder={applyOrder} blockOf={ssBlockOf(plan)} />
          {extras.map((it, j) => {
            const idx = plan.length + j
            const sps = specs(it)
            const done = Math.min(logOf(it.ex).length, sps.length)
            const exDone = done >= sps.length
            return (
              <div key={it.ex} className={'ocard flow' + (exDone ? ' done2' : '')} onClick={() => setFocus(idx)}>
                <span className="othumb"><svg viewBox="0 0 24 24"><path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12" /></svg></span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b className="otitle">{it.ex}</b>
                  <div className="meta num" style={{ marginTop: 3 }}><i className="mdotx" style={{ background: mcolor(it.muscle) }} />{it.muscle} · {schemeSummary(it)} · extra</div>
                </div>
                <span className={'exprog num' + (exDone ? ' ok' : '')}>{exDone ? '✓' : `${done}/${sps.length}`}</span>
                {done === 0 && <span className="del" onClick={(e) => { e.stopPropagation(); removeExtra(it.ex) }}>✕</span>}
                <span className="chev">›</span>
              </div>
            )
          })}
          <button className="ghost" style={{ marginTop: 12 }} onClick={() => setPicker(true)}>＋ Aggiungi esercizio alla seduta</button>
          {/* senza questo un esercizio tolto per sbaglio sarebbe irrecuperabile: sparisce
              dalla lista e con essa il suo menu. Azzero solo skip: note e video restano. */}
          {skipped.size > 0 && (
            <button className="ghost" style={{ marginTop: 10 }}
              onClick={() => setS({ ...s, sessionEx: (s.sessionEx ?? []).map((x) => (x.date === today() && x.skip ? { ...x, skip: undefined } : x)) })}>
              Rimetti {skipped.size === 1 ? 'l\'esercizio tolto' : `i ${skipped.size} esercizi tolti`}
            </button>
          )}
        </>
      )}

      {barCalc && <BarCalc target={barCalc.target} onUse={(kg) => { setD(barCalc.it, barCalc.sp, barCalc.i, { kg: String(kg) }); setBarCalc(null) }} onClose={() => setBarCalc(null)} />}
      {rpeCalc && <RpeCalc ex={rpeCalc.it.ex} max0={maxOf(rpeCalc.it.ex)}
        kg0={parseFloat(getDraft(rpeCalc.it, rpeCalc.sp, rpeCalc.i).kg.replace(',', '.')) || 0}
        reps0={parseInt(getDraft(rpeCalc.it, rpeCalc.sp, rpeCalc.i).reps, 10) || 0}
        onUse={(kg) => { setD(rpeCalc.it, rpeCalc.sp, rpeCalc.i, { kg: String(kg) }); setRpeCalc(null) }}
        onClose={() => setRpeCalc(null)} />}
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
              {!menu.isExtra && menu.idx < plan.length - 1 && (
                <button className={'menurow' + (menu.it.ss ? ' on' : '')} onClick={() => toggleSuperset(menu.it)}>
                  <span className="mi"><MenuIcon t="link" /></span>{menu.it.ss ? 'Togli superset' : 'Superset col prossimo'}
                </button>
              )}
              <button className="menurow" style={{ color: 'var(--coral)' }} onClick={() => removeEsercizio(menu.it.ex, menu.isExtra)}>
                <span className="mi">✕</span>Togli da questo allenamento
              </button>
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
      {picker && (
        <ExPicker lib={lib} title="Alla seduta di oggi" onClose={() => setPicker(false)}
          onPick={addExtra} onCreate={createAndAddExtra} />
      )}
      {videoInput}{videoAttesa}
      {statsEx && <ExStats s={s} setS={setS} ex={statsEx} onClose={() => setStatsEx(null)} />}
      {playVid && (
        <div className="overlay center" onClick={() => setPlayVid(null)}>
          <div className="dlg" onClick={(e) => e.stopPropagation()}>
            <b className="dt">{playVid.title}</b>
            <Video className="vidfull" src={playVid.url} />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="ghost mini" onClick={() => { const p = playVid; setPlayVid(null); pickVideo({ kind: 'serie', ex: p.ex, i: p.i }) }}>Sostituisci</button>
              <button className="ghost mini" style={{ color: 'var(--coral)' }}
                onClick={() => { const p = playVid; setPlayVid(null); void removeSerieVideo(p.ex, p.i) }}>Togli</button>
            </div>
            <button className="ghost" style={{ marginTop: 8 }} onClick={() => setPlayVid(null)}>Chiudi</button>
          </div>
        </div>
      )}

      {pr && (
        <div className="prfx" onClick={() => setPr(null)}>
          {Array.from({ length: 26 }, (_, i) => (
            <span key={i} className="pcf" style={{ left: (i * 3.9 + 1.5) + '%', animationDelay: (i % 7) * 0.14 + 's', background: ['var(--lime)', '#fff', 'var(--amber)'][i % 3] }} />
          ))}
          <div className="prcard">
            <div className="prstar">★</div>
            <div className="prt">Nuovo record</div>
            <div className="prv">{pr.ex}</div>
            <div className="prw num">{fmt(pr.kg)} kg × {pr.reps}</div>
          </div>
        </div>
      )}

      {summary && (
        <div className="overlay center" onClick={chiudiSummary}>
          <div className="card done" style={{ maxWidth: 394, width: '100%', margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <div className="donecirc"><svg viewBox="0 0 24 24"><path d="M4 12l6 6L20 6" /></svg></div>
            <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 17 }}>Sessione completata</div>
            <div style={{ textAlign: 'center', marginTop: 6 }}><b className="num" style={{ color: 'var(--coral)', fontSize: 15 }}>🔥 {summary.kcal} kcal</b> <span className="sm mut">stimate</span></div>
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
            {/* conferma durata: se conosco l'inizio mostro gli orari, sennò solo i minuti da confermare */}
            <div className="card" style={{ marginTop: 12, background: 'var(--surf2)', boxShadow: 'none' }}>
              <div className="cardh"><b style={{ fontSize: 15 }}>Conferma la durata</b></div>
              {summary.startMs && (
                <div className="sm mut" style={{ marginTop: 6 }}>
                  Iniziato {new Date(summary.startMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · Finito {new Date(summary.endMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              <div className="row" style={{ marginTop: 8, gap: 8 }}>
                <span className="l" style={{ flex: 1 }}>Minuti {summary.startMs ? '(correggi se serve)' : "(il cronometro s'è azzerato: inseriscili)"}</span>
                <input type="number" inputMode="numeric" value={Math.round((s.durate?.[today()] ?? 0) / 60) || ''} placeholder="—"
                  onChange={(e) => setS({ ...s, durate: { ...(s.durate ?? {}), [today()]: Math.max(0, +e.target.value) * 60 } })}
                  style={{ width: 90, textAlign: 'center' }} />
              </div>
            </div>
            {isIOS() && <button className="ghost" style={{ marginTop: 12 }} onClick={() => inviaSaluteData(today())}>🍎 Invia a Salute</button>}
            <button style={{ marginTop: 8 }} onClick={chiudiSummary}>Chiudi</button>
          </div>
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

// Scanner codice a barre: BarcodeDetector nativo (Android) se c'è, altrimenti ZXing caricato al volo
// (iPhone Safari non ha l'API nativa). Inserimento manuale come fallback finale.
function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const [live, setLive] = useState(false)
  const [manual, setManual] = useState('')
  const [zoom, setZoom] = useState<{ min: number; max: number; step: number; val: number } | null>(null)
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) return
    let stop = false
    let stream: MediaStream | null = null
    let zxing: { stop: () => void } | null = null
    // Alta risoluzione: il barcode ha più pixel -> leggibile anche da lontano (il fix vero su iPhone).
    const VID: MediaTrackConstraints = { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    // Zoom ottico/digitale se la fotocamera lo espone (parte a 2x, poi lo slider lo regola).
    const setupZoom = (track?: MediaStreamTrack) => {
      if (!track) return
      trackRef.current = track
      const caps = track.getCapabilities?.() as { zoom?: { min: number; max: number; step: number } } | undefined
      if (caps?.zoom && caps.zoom.max > caps.zoom.min) {
        const val = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 2))
        setZoom({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1, val })
        void track.applyConstraints({ advanced: [{ zoom: val }] } as unknown as MediaTrackConstraints)
      }
    }
    const BD = (window as unknown as { BarcodeDetector?: new (o?: object) => { detect: (v: unknown) => Promise<{ rawValue: string }[]> } }).BarcodeDetector
    ;(async () => {
      try {
        if (BD) { // Android/Chrome: rilevatore nativo, leggero
          stream = await navigator.mediaDevices.getUserMedia({ video: VID })
          if (stop || !videoRef.current) return
          videoRef.current.srcObject = stream; await videoRef.current.play(); setLive(true)
          setupZoom(stream.getVideoTracks()[0])
          const det = new BD({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
          const scan = async () => {
            if (stop || !videoRef.current) return
            try { const codes = await det.detect(videoRef.current); if (codes.length) { onCode(codes[0].rawValue); return } } catch { /* frame saltato */ }
            requestAnimationFrame(scan)
          }
          scan()
        } else { // iPhone: niente API nativa -> carico ZXing solo adesso
          const { BrowserMultiFormatReader } = await import('@zxing/browser')
          if (stop || !videoRef.current) return
          const reader = new BrowserMultiFormatReader()
          zxing = await reader.decodeFromConstraints({ video: VID }, videoRef.current, (res) => {
            if (res && !stop) { stop = true; onCode(res.getText()) }
          })
          setLive(true)
          setupZoom((videoRef.current.srcObject as MediaStream | null)?.getVideoTracks()[0])
        }
      } catch { setLive(false) }
    })()
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); zxing?.stop() }
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
        {zoom && (
          <div className="row" style={{ marginTop: 10, alignItems: 'center', gap: 10 }}>
            <span className="sm mut">Zoom</span>
            <input type="range" min={zoom.min} max={zoom.max} step={zoom.step} value={zoom.val} style={{ flex: 1 }}
              onChange={(e) => { const v = +e.target.value; setZoom({ ...zoom, val: v }); void trackRef.current?.applyConstraints({ advanced: [{ zoom: v }] } as unknown as MediaTrackConstraints) }} />
          </div>
        )}
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
              <span className="exbar" style={{ background: 'var(--mut2)' }} />
              <div style={{ minWidth: 0 }}><b>{f.name}</b>
                <div className="meta num">{f.kcal} kcal · {f.protein}P {f.carbs}C {f.fat}G <span className="mut">/100g</span></div></div>
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
        <div className="bt" style={{ height: 8, marginTop: 8 }}><i style={{ width: Math.min(100, wg ? wt / wg * 100 : 0) + '%', background: 'var(--lime)' }} /></div>
        <div className="waterbtns">
          <button className="wbtn minus" onClick={() => setWater(wt - 500)}>−500</button>
          <button className="wbtn minus" onClick={() => setWater(wt - 250)}>−250</button>
          <button className="wbtn" onClick={() => setWater(wt + 250)}>+250</button>
          <button className="wbtn" onClick={() => setWater(wt + 500)}>+500</button>
        </div>
        {wg > 2500 && <p className="sm mut" style={{ margin: '10px 2px 0' }}>Obiettivo <b style={{ color: 'var(--lime)' }}>+700 ml</b> oggi: ti alleni, servono più liquidi.</p>}
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

// Grafico più curato: linea + area sfumata + punti, ultimo evidenziato. Solo SVG, niente librerie.
let grafId = 0
function Grafico({ values, color = '#C9F94E', h = 128 }: { values: number[]; color?: string; h?: number }) {
  const gid = useMemo(() => 'grad' + grafId++, [])
  const W = 320
  if (values.length < 2) return <p className="sm mut" style={{ margin: '16px 4px' }}>Servono almeno 2 sedute per vedere l'andamento.</p>
  const min = Math.min(...values), max = Math.max(...values)
  const pad = (max - min) * 0.18 || Math.max(1, max * 0.05)
  const lo = min - pad, hi = max + pad
  const px = 8, top = 12, bot = h - 14
  const X = (i: number) => px + (i / (values.length - 1)) * (W - 2 * px)
  const Y = (v: number) => bot - ((v - lo) / (hi - lo)) * (bot - top)
  const line = values.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ')
  const area = `M${X(0).toFixed(1)} ${bot} ` + values.map((v, i) => 'L' + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ') + ` L${X(values.length - 1).toFixed(1)} ${bot} Z`
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', height: h, display: 'block' }} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.30" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {values.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r={i === values.length - 1 ? 4.5 : 2.2} fill={color} />)}
    </svg>
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
// Contenuto del dettaglio esercizio, senza wrapper: lo usano sia l'overlay in allenamento
// (ExStats) sia la PAGINA del tab Esercizi. onDeleted = cosa fare dopo l'eliminazione.
function ExDettaglio({ s, setS, ex, onDeleted }: { s: State; setS: (u: State) => void; ex: string; onDeleted: () => void }) {
  const ds = historyDates(s.log, ex)
  const sets = s.log.filter((l) => l.ex === ex && !l.timed && l.kg > 0) // per rep-max e recuperi
  const rec = record(s.log, ex)
  const last = ds.length ? ds[ds.length - 1] : null
  const daysAgo = last ? Math.floor((Date.now() - new Date(last + 'T12:00').getTime()) / 86400000) : null
  const lastSets = last ? s.log.filter((x) => x.ex === ex && x.date === last) : []
  const mx = massimale(s, ex)
  // rep-max: peso più alto sollevato per ALMENO n ripetizioni
  const repMax = (n: number) => { const c = sets.filter((l) => l.reps >= n); return c.length ? Math.max(...c.map((l) => l.kg)) : 0 }
  const repMaxes = [1, 3, 5, 8, 10, 12].map((n) => ({ n, kg: repMax(n) })).filter((x) => x.kg > 0)
  const recs = sets.map((l) => l.rec).filter((r): r is number => r != null)
  const recMedio = recs.length ? Math.round(recs.reduce((a, b) => a + b, 0) / recs.length) : 0
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const sedute30 = ds.filter((d) => d >= d30).length
  const prog = progressione(s, ex)
  // video delle sedute passate: erano salvati nello Storage ma visibili solo il giorno stesso
  const [vidDate, setVidDate] = useState<string | null>(null)
  const nVid = (d: string) => Object.keys(sessionExOf(s, ex, d)?.setVideos ?? {}).length

  // FORZA per seduta = 1RM stimato AGGIUSTATO PER RPE (più onesto di Epley quando l'RPE c'è):
  // 100x5@7 e 100x5@9 sono lo stesso peso ma forza diversa, e questo lo cattura.
  const forza = ds.map((d) => {
    const ss = sets.filter((l) => l.date === d)
    return ss.length ? Math.max(...ss.map((l) => (l.rpe != null ? e1rmRpe(l.kg, l.reps, l.rpe) : e1rm(l.kg, l.reps)))) : 0
  }).filter((v) => v > 0)
  const forzaOra = forza.length ? forza[forza.length - 1] : 0
  // riferimento ~4 settimane fa: la seduta più vecchia dentro la finestra, così il confronto è onesto
  const iRef = ds.findIndex((d) => d >= new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10))
  const forzaRef = forza.length > 1 ? forza[Math.max(0, Math.min(iRef, forza.length - 2))] : 0
  const deltaForza = forzaRef ? Math.round(((forzaOra - forzaRef) / forzaRef) * 100) : 0
  // SFORZO: RPE medio per seduta, solo dove c'è (0 = non segnato, lo saltiamo)
  const sforzo = ds.map((d) => avgRpeOf(s.log, ex, d)).filter((v) => v > 0)

  const elimina = async () => {
    const inScheda = allItems(s).some((it) => it.ex === ex)
    const nSet = s.log.filter((l) => l.ex === ex).length
    const corpo = `${nSet ? `${nSet} serie registrate verranno cancellate. ` : ''}${inScheda ? 'Resta nelle tue schede (senza storico): per farlo sparire del tutto toglilo prima dalle schede.' : 'Sparirà dalla libreria.'} Non si può annullare.`
    if (!(await confirmDlg(`Eliminare «${ex}»?`, corpo))) return
    for (const l of s.log) if (l.ex === ex && l.id) serieRimossa(l.id) // via anche dal cloud
    if ((s.exVideo ?? {})[ex]) void deleteVideo(s.exVideo[ex])
    const d = structuredClone(s)
    d.log = d.log.filter((l) => l.ex !== ex)
    d.customExercises = d.customExercises.filter((e) => e.name.toLowerCase() !== ex.toLowerCase())
    const senza = (o?: Record<string, unknown>) => { const c = { ...(o ?? {}) }; delete c[ex]; return c }
    d.refMax = senza(d.refMax) as State['refMax']
    d.exVideo = senza(d.exVideo) as State['exVideo']
    d.exDesc = senza(d.exDesc) as State['exDesc']
    d.sessionEx = (d.sessionEx ?? []).filter((x) => x.ex !== ex)
    setS(d)
    onDeleted()
  }

  return (
    <>
      <div className="plist" style={{ borderTop: 0 }}>
      {/* ULTIMA VOLTA in cima: è il numero che usi per decidere il carico oggi. */}
      {lastSets.length > 0 && (
        <div className="card lastcard">
          <div className="crumb" style={{ color: 'var(--lime)' }}>Ultima volta · {daysAgo === 0 ? 'oggi' : daysAgo === 1 ? 'ieri' : `${daysAgo} giorni fa`}</div>
          <div className="num" style={{ fontSize: 21, fontWeight: 800, marginTop: 6, lineHeight: 1.5 }}>
            {lastSets.map((l, i) => <span key={i}>{l.timed ? `${l.reps}s` : `${fmt(l.kg)}×${l.reps}`}{l.rpe != null ? <span className="mut" style={{ fontWeight: 600 }}>@{fmt(l.rpe)}</span> : ''}{i < lastSets.length - 1 ? '   ' : ''}</span>)}
          </div>
          <div className="sm mut" style={{ marginTop: 4 }}>Questo è il tuo riferimento da battere.</div>
        </div>
      )}

      {/* essenziali, senza i totali di vanità */}
      <div className="tiles" style={{ marginTop: 12 }}>
        <div className="tile"><div className="l">Massimale {mx.fonte === 'ref' ? 'tuo' : 'stimato'}</div><div className="v num" style={{ color: mx.fonte === 'ref' ? 'var(--lime)' : undefined }}>{mx.kg ? fmt(round25(mx.kg)) : '—'} <span className="sm mut">kg</span></div></div>
        <div className="tile"><div className="l">Record serie</div><div className="v num">{rec ? `${fmt(rec.kg)}×${rec.reps}` : '—'}</div></div>
        <div className="tile"><div className="l">Recupero medio</div><div className="v num">{recMedio ? mmss(recMedio) : '—'}</div></div>
        <div className="tile"><div className="l">Sedute · 30gg</div><div className="v num">{sedute30}</div></div>
      </div>

      {repMaxes.length > 0 && (<>
        <h2>Massimali per ripetizioni</h2>
        <div className="card"><div className="rmrow">
          {repMaxes.map((r) => <div className="rmcell" key={r.n}><b className="num">{fmt(r.kg)}</b><span>{r.n} rip.</span></div>)}
        </div></div>
      </>)}

      {/* FORZA: il numero-chiave. 1RM aggiustato per RPE, con la variazione sull'ultimo mese. */}
      {forza.length > 1 && (<>
        <h2>Forza nel tempo</h2>
        <div className="card">
          <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
            <b className="num" style={{ fontSize: 28, fontWeight: 800 }}>{fmt(round25(forzaOra))} <span className="sm mut" style={{ fontSize: 14 }}>kg</span></b>
            {deltaForza !== 0 && <span className="num" style={{ fontWeight: 700, color: deltaForza > 0 ? 'var(--lime)' : 'var(--coral)' }}>{deltaForza > 0 ? '▲ +' : '▼ '}{Math.abs(deltaForza)}% <span className="sm mut">/ mese</span></span>}
          </div>
          <div className="sm mut" style={{ margin: '2px 0 8px' }}>1RM stimato, aggiustato per lo sforzo (RPE)</div>
          <Grafico values={forza} />
        </div>
      </>)}

      {/* SFORZO: RPE medio per seduta. Se sale a parità di carico, sei in fatica. */}
      {sforzo.length > 1 && (<>
        <h2>Sforzo percepito</h2>
        <div className="card">
          <div className="sm mut" style={{ marginBottom: 8 }}>RPE medio per seduta — se sale a parità di carico, stai accumulando fatica</div>
          <Grafico values={sforzo} color="#F5B84A" h={92} />
        </div>
      </>)}

      {prog.length > 1 && (<>
        <h2>Progressione · col contesto</h2>
        <div className="card" style={{ padding: '4px 12px' }}>
          {prog.slice().reverse().map((p) => (
            <div className="set" key={p.date}>
              <span className="mono sm mut num" style={{ width: 56, flex: 'none' }}>{p.date.slice(5).split('-').reverse().join('/')}</span>
              <b className="num sm">{fmt(round25(p.e1rm))} kg</b>
              <span className="meta num" style={{ marginLeft: 'auto' }}>{p.pos}° eserc. · {p.preSerie} serie prima</span>
            </div>
          ))}
        </div>
      </>)}

      {(s.exVideo ?? {})[ex] && <><h2>Dimostrazione</h2><Video className="fhero fvideo" src={s.exVideo[ex]} /></>}

      <div className="card" style={{ marginTop: 12 }}>
        <div className="cardh"><b>Descrizione</b></div>
        <div className="cardh-div" />
        <textarea className="notebox" key={ex} rows={3} defaultValue={(s.exDesc ?? {})[ex] ?? ''}
          placeholder="Come si esegue, cue, errori da evitare… (facoltativo)"
          onBlur={(e) => { const v = e.target.value.trim(); if (v !== ((s.exDesc ?? {})[ex] ?? '')) { const d = { ...(s.exDesc ?? {}) }; if (v) d[ex] = v; else delete d[ex]; setS({ ...s, exDesc: d }) } }} />
      </div>

      <h2>Storico · {ds.length} sedute</h2>
      <div className="card" style={{ padding: '4px 12px' }}>
        {/* la migliore di sempre in cima: è il metro con cui leggi tutte le righe sotto */}
        {rec && (
          <div className="set">
            <span className="prtag">★ migliore</span>
            <b className="num sm">{fmt(rec.kg)} × {rec.reps}{rec.rpe != null ? ` @${fmt(rec.rpe)}` : ''}</b>
            <span className="meta num" style={{ marginLeft: 'auto' }}>{rec.date.slice(5).split('-').reverse().join('/')}</span>
          </div>
        )}
        {ds.slice().reverse().map((d) => {
          const ss = s.log.filter((x) => x.ex === ex && x.date === d)
          const ar = avgRpeOf(s.log, ex, d)
          const rd = readinessOn(s, d)
          return (
            <div className="set" key={d} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <span className="mono sm mut num" style={{ width: 56, flex: 'none', paddingTop: 2 }}>{d.slice(5).split('-').reverse().join('/')}</span>
              <div className="num sm" style={{ minWidth: 0, lineHeight: 1.6 }}>{ss.map((x, i) => <span key={i}>{fmt(x.kg)}×{x.reps}{x.rpe != null ? '@' + fmt(x.rpe) : ''}{i < ss.length - 1 ? '  ·  ' : ''}</span>)}</div>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flex: 'none', paddingTop: 2 }}>
                {/* video di QUELLA seduta: erano salvati ma raggiungibili solo il giorno stesso */}
                {nVid(d) > 0 && <span className="svid on" title={`Guarda i video di questa seduta (${nVid(d)})`} onClick={() => setVidDate(d)}>▶{nVid(d) > 1 ? ' ' + nVid(d) : ''}</span>}
                {rd != null && <span className="r num" style={{ color: rColor(rd), background: 'var(--surf2)' }} title="readiness del giorno">⚡{rd}</span>}
                {ar > 0 && <span className={'r num ' + (ar >= 8.5 ? 'r-hi' : 'r-ok')}>RPE {fmt(ar)}</span>}
              </span>
              {/* la nota che hai scritto quel giorno: è il "com'è andata", va letta accanto ai numeri */}
              {sessionExOf(s, ex, d)?.note && <div className="schednote" style={{ flex: '1 0 100%', margin: '6px 0 2px' }}>{sessionExOf(s, ex, d)!.note}</div>}
            </div>
          )
        })}
        {!ds.length && <p className="sm mut" style={{ margin: '10px 2px' }}>Mai allenato: parti oggi.</p>}
      </div>
      <button className="ghost" style={{ marginTop: 14, color: 'var(--coral)' }} onClick={elimina}>Elimina esercizio</button>
      </div>

      {/* Player dei video di UNA seduta: una voce per serie ripresa. Foglio con la ✕ FISSA in
          testa e i video che scorrono sotto: con più clip il tasto chiudi resta sempre a portata.
          Sta FUORI dal contenitore che scorre: annidato dentro, i due fogli si incastravano. */}
      {vidDate && (() => {
        const vs = Object.entries(sessionExOf(s, ex, vidDate)?.setVideos ?? {}).sort((a, b) => +a[0] - +b[0])
        return (
          <div className="overlay" onClick={() => setVidDate(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="bc" style={{ margin: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="crumb">Video · {vidDate.split('-').reverse().join('/')}</div>
                  <div className="bt1">{ex}</div>
                </div>
                <button className="pen" onClick={() => setVidDate(null)}>✕</button>
              </div>
              <div className="plist" style={{ borderTop: 0 }}>
                {vs.map(([i, url]) => (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <div className="crumb" style={{ marginBottom: 5 }}>Serie {+i + 1}</div>
                    <Video className="vidfull" src={url} />
                  </div>
                ))}
                {!vs.length && <p className="sm mut">Nessun video per questa seduta.</p>}
                <div style={{ height: 24 }} />{/* respiro: senza, l'ultima clip resta tagliata a metà */}
              </div>
            </div>
          </div>
        )
      })()}
    </>
  )
}

// Overlay del dettaglio, usato durante l'allenamento (tap dallo storico pesi in focus).
function ExStats({ s, setS, ex, onClose }: { s: State; setS: (u: State) => void; ex: string; onClose: () => void }) {
  const mus = muscleOf(s, ex)
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
        <ExDettaglio s={s} setS={setS} ex={ex} onDeleted={onClose} />
      </div>
    </div>
  )
}

// Tab Esercizi: libreria completa (lista) → PAGINA di dettaglio (non overlay).
function Esercizi({ s, setS }: { s: State; setS: (u: State) => void }) {
  const [sel, setSel] = useState<string | null>(null)
  const exList = useMemo(() => libreriaEsercizi(s).map((e) => e.name), [s])
  const [q, setQ] = useState('')
  const [mus, setMus] = useState<string | null>(null)
  useTop(sel)
  const groups = useMemo(() => [...new Set(exList.map((e) => muscleOf(s, e)))], [exList, s])
  const filtered = exList.filter((e) => (!mus || muscleOf(s, e) === mus) && e.toLowerCase().includes(q.toLowerCase().trim()))

  if (sel) return (
    <>
      <div className="bc" style={{ marginTop: 18 }}>
        <button className="back" onClick={() => setSel(null)}>‹</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crumb" style={{ color: mcolor(muscleOf(s, sel)) }}>{muscleOf(s, sel)}</div>
          <div className="bt1">{sel}</div>
        </div>
      </div>
      <ExDettaglio s={s} setS={setS} ex={sel} onDeleted={() => setSel(null)} />
    </>
  )

  return (
    <>
      <input placeholder="Cerca esercizio…" value={q} onChange={(e) => setQ(e.target.value)} style={{ fontFamily: 'var(--sans)', marginTop: 4 }} />
      <div className="chips scrollx" style={{ marginTop: 8 }}>
        <button className={'chip' + (mus === null ? ' on' : '')} onClick={() => setMus(null)}>Tutti</button>
        {groups.map((g) => <button key={g} className={'chip' + (mus === g ? ' on' : '')} onClick={() => setMus(g)}>{g}</button>)}
      </div>
      <h2>{filtered.length} esercizi</h2>
      <div>
        {filtered.map((ex) => {
          const ds = historyDates(s.log, ex)
          const best = ds.length ? bestE1rm(s.log, ex) : 0
          const last = ds.length ? ds[ds.length - 1] : null
          const daysAgo = last ? Math.floor((Date.now() - new Date(last + 'T12:00').getTime()) / 86400000) : null
          const mm = muscleOf(s, ex)
          const custom = s.customExercises.some((e) => e.name === ex)
          return (
            <div className="navcard" key={ex} onClick={() => setSel(ex)}>
              <span className="exbar" style={{ background: mcolor(mm) }} />
              <div style={{ minWidth: 0 }}>
                <b>{ex}{custom && <span className="stag" style={{ marginLeft: 8 }}>tuo</span>}</b>
                <div className="meta num">
                  <span style={{ color: mcolor(mm) }}>{mm}</span>
                  {' · '}{best ? fmt(best) + ' kg 1RM' : 'mai fatto'}
                  {daysAgo != null && <> · <span style={daysAgo > 10 ? { color: 'var(--amber)' } : undefined}>{daysAgo === 0 ? 'oggi' : daysAgo + ' gg fa'}</span></>}
                </div>
              </div>
              <span className="chev">›</span>
            </div>
          )
        })}
        {!filtered.length && <p className="sm mut" style={{ margin: '10px 2px' }}>Nessun esercizio trovato.</p>}
      </div>
    </>
  )
}

function Statistiche({ s, onOpen }: { s: State; onOpen: (ex: string) => void }) {
  const [gg, setGg] = useState(30) // finestra: cambia tutto quello che c'è sotto
  const [openDay, setOpenDay] = useState<string | null>(null)
  const since = new Date(Date.now() - gg * 86400000).toISOString().slice(0, 10)
  const log = s.log.filter((l) => l.date >= since)
  const giorni = [...new Set(log.map((l) => l.date))].sort().reverse()

  // riepilogo del periodo
  const nSed = giorni.length
  const vol = volume(log)
  const minTot = giorni.reduce((a, d) => a + Math.round((s.durate?.[d] ?? 0) / 60), 0)
  const nPr = giorni.reduce((a, d) => a + prsForSession(s.log, d).length, 0)

  // peso corporeo nel periodo: "sto aumentando o calando?"
  const bodyP = s.body.filter((b) => b.date >= since)
  const bodyAll = s.body.length ? s.body[s.body.length - 1].kg : 0
  const dBody = bodyP.length >= 2 ? bodyP[bodyP.length - 1].kg - bodyP[0].kg : 0

  // forza per esercizio: 1RM aggiustato-RPE a inizio vs fine periodo → "sto salendo su cosa?"
  const forzaEx = [...new Set(log.filter((l) => !l.timed && l.kg > 0).map((l) => l.ex))].map((ex) => {
    const ds = [...new Set(s.log.filter((l) => l.ex === ex && !l.timed && l.kg > 0 && l.date >= since).map((l) => l.date))].sort()
    const e1 = (d: string) => Math.max(...s.log.filter((l) => l.ex === ex && l.date === d && !l.timed && l.kg > 0)
      .map((l) => (l.rpe != null ? e1rmRpe(l.kg, l.reps, l.rpe) : e1rm(l.kg, l.reps))))
    if (ds.length < 2) return { ex, ora: ds.length ? e1(ds[0]) : 0, delta: 0, sedute: ds.length }
    const a = e1(ds[0]), b = e1(ds[ds.length - 1])
    return { ex, ora: b, delta: a > 0 ? Math.round(((b - a) / a) * 100) : 0, sedute: ds.length }
  }).filter((x) => x.ora > 0).sort((a, b) => b.delta - a.delta)

  // alimentazione: la domanda vera è "mangio diverso quando mi alleno?"
  const kcalDi = (d: string) => Math.round(nutritionToday(s.meals, d).kcal)
  const giorniConCibo = [...new Set(s.meals.filter((m) => m.date >= since).map((m) => m.date))]
  const kcalAll = giorniConCibo.filter((d) => giorni.includes(d)).map(kcalDi)
  const kcalRip = giorniConCibo.filter((d) => !giorni.includes(d)).map(kcalDi)
  const media = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0)

  const mv = muscleVolume(s, gg)
  const mvEntries = Object.entries(mv).sort((a, b) => b[1] - a[1])
  const volMedio = nSed ? vol / nSed : 0

  return (
    <>
      <div className="seg" style={{ marginTop: 4 }}>
        {[7, 30, 90].map((n) => (
          <button key={n} className={'sg' + (gg === n ? ' on' : '')} onClick={() => setGg(n)}>{n} giorni</button>
        ))}
      </div>

      <h2>Riepilogo</h2>
      <div className="card">
        <div className="tiles">
          <div className="tile"><div className="l">Sedute</div><div className="v num">{nSed}</div></div>
          <div className="tile"><div className="l">Volume</div><div className="v num">{fmt(vol / 1000)} <span className="sm mut">t</span></div></div>
          <div className="tile"><div className="l">Tempo</div><div className="v num">{minTot >= 60 ? `${Math.floor(minTot / 60)}h ${minTot % 60}` : minTot} <span className="sm mut">min</span></div></div>
          <div className="tile"><div className="l">Record</div><div className="v num" style={{ color: nPr ? 'var(--amber)' : undefined }}>{nPr}</div></div>
        </div>
      </div>

      {s.body.length >= 2 && (<>
        <h2>Peso corporeo</h2>
        <div className="card">
          <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
            <b className="num" style={{ fontSize: 28, fontWeight: 800 }}>{fmt(bodyAll)} <span className="sm mut" style={{ fontSize: 14 }}>kg</span></b>
            {bodyP.length >= 2 && (
              <span className="num" style={{ fontWeight: 700, color: dBody > 0 ? 'var(--amber)' : dBody < 0 ? 'var(--teal)' : 'var(--mut)' }}>
                {dBody > 0 ? '▲ +' : dBody < 0 ? '▼ ' : ''}{fmt(Math.abs(dBody))} kg <span className="sm mut">in {gg} giorni</span>
              </span>
            )}
          </div>
          <Grafico values={s.body.map((b) => b.kg)} color="#31E0B4" h={100} />
        </div>
      </>)}

      {forzaEx.length > 0 && (<>
        <h2>Forza per esercizio</h2>
        <div className="card" style={{ padding: '4px 12px' }}>
          {forzaEx.map((f) => (
            <div className="set" key={f.ex} style={{ cursor: 'pointer' }} onClick={() => onOpen(f.ex)}>
              <span className="exbar" style={{ background: mcolor(muscleOf(s, f.ex)), minHeight: 26 }} />
              <div style={{ minWidth: 0 }}>
                <b className="sm">{f.ex}</b>
                <div className="meta num">{fmt(round25(f.ora))} kg · {f.sedute} {f.sedute === 1 ? 'seduta' : 'sedute'}</div>
              </div>
              <span className="num" style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 13, color: f.delta > 0 ? 'var(--lime)' : f.delta < 0 ? 'var(--coral)' : 'var(--mut2)' }}>
                {f.sedute < 2 ? '—' : `${f.delta > 0 ? '+' : ''}${f.delta}%`}
              </span>
              <span className="chev">›</span>
            </div>
          ))}
          <p className="hint">1RM stimato, aggiustato per lo sforzo · variazione nel periodo</p>
        </div>
      </>)}

      {(kcalAll.length > 0 || kcalRip.length > 0) && (<>
        <h2>Alimentazione</h2>
        <div className="card">
          <div className="tiles">
            <div className="tile"><div className="l">Giorni di allenamento</div><div className="v num">{media(kcalAll) || '—'} <span className="sm mut">kcal</span></div></div>
            <div className="tile"><div className="l">Giorni di riposo</div><div className="v num">{media(kcalRip) || '—'} <span className="sm mut">kcal</span></div></div>
          </div>
          <p className="hint">Media giornaliera · target {s.target.kcal} kcal</p>
        </div>
      </>)}

      <h2>Volume per gruppo</h2>
      <div className="card">
        {mvEntries.length ? mvEntries.map(([m, n]) => (
          <div className="bar" key={m}>
            <span className="bn" style={{ color: mcolor(m) }}>{m}</span>
            <div className="bt"><i style={{ width: Math.min(100, (n / (gg / 7 * 16)) * 100) + '%', background: n < gg / 7 * 8 ? 'var(--amber)' : 'var(--lime)' }} /></div>
            <span className="bv num">{n} serie</span>
          </div>
        )) : <p className="sm mut" style={{ margin: '10px 2px' }}>Nessuna serie nel periodo.</p>}
        <p className="hint">Target 10-20 serie/gruppo a settimana · <span style={{ color: 'var(--amber)' }}>ambra</span> = poco allenato</p>
      </div>

      {/* IL CUORE: una riga per giorno di allenamento, con tutto quello che serve a capire
          com'è andata quel giorno — carico, sforzo, come stavi, cosa avevi mangiato. */}
      <h2>Sedute · {nSed}</h2>
      {giorni.map((d) => {
        const sum = sessionSummary(s.log, d)
        const rd = readinessOn(s, d)
        const prs = prsForSession(s.log, d)
        const dur = Math.round((s.durate?.[d] ?? 0) / 60)
        const kc = kcalDi(d)
        const exs = [...new Set(s.log.filter((l) => l.date === d).map((l) => l.ex))]
        const mus = [...new Set(exs.map((e) => muscleOf(s, e)))]
        const sopra = volMedio > 0 && sum.tonnage > volMedio * 1.1
        const aperto = openDay === d
        return (
          <div className="card sedcard" key={d} onClick={() => setOpenDay(aperto ? null : d)}>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <b style={{ fontSize: 15.5 }}>{new Date(d + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flex: 'none' }}>
                {prs.length > 0 && <span className="prtag">★ {prs.length}</span>}
                {rd != null && <span className="r num" style={{ color: rColor(rd), background: 'var(--surf2)' }} title="come stavi quel giorno">⚡{rd}</span>}
                {sum.avgRpe > 0 && <span className={'r num ' + (sum.avgRpe >= 8.5 ? 'r-hi' : 'r-ok')}>RPE {fmt(sum.avgRpe)}</span>}
              </span>
            </div>
            <div className="meta" style={{ marginTop: 5 }}>{mus.map((m) => <span key={m} className="muspill"><i style={{ background: mcolor(m) }} />{m}</span>)}</div>
            <div className="sedstat num">
              <span><b>{fmt(sum.tonnage / 1000)}</b> t{sopra && <i className="su" title="sopra la tua media"> ▲</i>}</span>
              <span><b>{sum.sets}</b> serie</span>
              {dur > 0 && <span><b>{dur}</b> min</span>}
              {kc > 0 && <span><b>{kc}</b> kcal</span>}
            </div>
            {aperto && (
              <div style={{ marginTop: 10 }}>
                {exs.map((ex) => {
                  const ss = s.log.filter((l) => l.date === d && l.ex === ex)
                  return (
                    // stopPropagation: il tap apre l'esercizio, non richiude la card della seduta
                    <div className="set" key={ex} style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); onOpen(ex) }}>
                      <span className="exbar" style={{ background: mcolor(muscleOf(s, ex)), minHeight: 24 }} />
                      <b className="sm">{ex}{prs.includes(ex) && <span className="prtag" style={{ marginLeft: 8 }}>★</span>}</b>
                      <span className="meta num" style={{ marginLeft: 'auto' }}>{ss.map((x) => `${fmt(x.kg)}×${x.reps}`).join(' · ')}</span>
                      <span className="chev">›</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {!giorni.length && <div className="card"><p className="sm mut" style={{ margin: 0 }}>Nessun allenamento negli ultimi {gg} giorni.</p></div>}
    </>
  )
}

function Calendario({ s, setS, onRepeat, onDelete }: { s: State; setS: (u: State) => void; onRepeat: (date: string) => void; onDelete: (date: string) => void }) {
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
  const monthVol = volume(s.log.filter((l) => monthDates.includes(l.date)))
  const selSum = sel ? sessionSummary(s.log, sel) : null
  const selExs = sel ? [...new Set(s.log.filter((l) => l.date === sel).map((x) => x.ex))] : []
  const [editSets, setEditSets] = useState(false) // il dettaglio-giorno parte in lettura, si apre in modifica

  // Correzione a posteriori di una serie: aggiorna l'indice GLOBALE nel log + specchia sul cloud.
  const patchSet = (gi: number, patch: { kg?: number; reps?: number; rpe?: number | null }) => {
    const l = s.log[gi]; if (!l) return
    const next = [...s.log]; next[gi] = { ...l, ...patch }
    setS({ ...s, log: next })
    if (l.id) serieModificata(l.id, {
      ...(patch.kg != null ? { peso: patch.kg } : {}), ...(patch.reps != null ? { reps: patch.reps } : {}),
      ...('rpe' in patch ? { rpe: patch.rpe } : {}),
    })
  }
  const delSet = (gi: number) => {
    const l = s.log[gi]; if (!l) return
    if (l.id) serieRimossa(l.id)
    setS({ ...s, log: s.log.filter((_, j) => j !== gi) })
  }
  // durata del giorno selezionato, in minuti interi (correggibile: il cronometro usciva sbagliato)
  const durataMin = sel ? Math.round((s.durate?.[sel] ?? 0) / 60) : 0
  const setDurataMin = (min: number) => sel && setS({ ...s, durate: { ...(s.durate ?? {}), [sel]: Math.max(0, min) * 60 } })
  const inviaSaluteGiorno = () => {
    if (!sel) return
    const durSec = s.durate?.[sel] ?? 0
    const peso = s.body.length ? s.body[s.body.length - 1].kg : 75
    inviaSalute({ durata: Math.round(durSec / 60), calorie: stimaCalorie(durSec, peso), distanza: 0, data: sel })
  }
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
          {/* durata correggibile: il cronometro si azzera al ricarico dell'app e usciva sbagliato */}
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <span className="l" style={{ flex: 1 }}>Durata (min)</span>
            <input type="number" inputMode="numeric" value={durataMin || ''} placeholder="—"
              onChange={(e) => setDurataMin(+e.target.value)} style={{ width: 90, textAlign: 'center' }} />
          </div>

          <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Serie</h2>
            <button className="ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }} onClick={() => setEditSets((v) => !v)}>{editSets ? 'Fatto' : '✎ Correggi'}</button>
          </div>
          <div style={{ marginTop: 6 }}>
            {selExs.map((ex) => {
              // indici GLOBALI nel log: servono a modificare la riga giusta
              const idxs = s.log.map((l, gi) => ({ l, gi })).filter((x) => x.l.date === sel && x.l.ex === ex)
              return (
                <div key={ex} style={{ marginTop: 8 }}>
                  <div className="set" style={{ paddingBottom: 2 }}>
                    <span className="exbar" style={{ background: mcolor(muscleOf(s, ex)), minHeight: 26 }} />
                    <b className="sm">{ex}</b>
                    {!editSets && <span className="meta num" style={{ marginLeft: 'auto' }}>{fmt(idxs[0].l.kg)} · {idxs.map((x) => x.l.reps).join('/')}</span>}
                  </div>
                  {editSets && idxs.map(({ l, gi }, k) => (
                    <div className="calrow" key={gi}>
                      <span className="sidx">{k + 1}</span>
                      <input type="number" inputMode="decimal" value={l.kg} onFocus={(e) => e.target.select()} onChange={(e) => patchSet(gi, { kg: +e.target.value })} />
                      <span className="x">×</span>
                      <input type="number" inputMode="numeric" value={l.reps} onFocus={(e) => e.target.select()} onChange={(e) => patchSet(gi, { reps: +e.target.value })} />
                      <select value={l.rpe ?? ''} onChange={(e) => patchSet(gi, { rpe: e.target.value === '' ? null : +e.target.value })}>
                        <option value="">RPE</option>
                        {RPE_VALS.map((v) => <option key={v} value={v}>{fmt(v)}</option>)}
                      </select>
                      <span className="del" onClick={() => delSet(gi)}>✕</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {isIOS() && <button className="ghost" style={{ marginTop: 14 }} onClick={inviaSaluteGiorno}>🍎 Invia a Salute</button>}
          <button style={{ marginTop: 8 }} onClick={() => onRepeat(sel)}>↻ Ripeti questa seduta oggi</button>
          <button className="ghost" style={{ marginTop: 8, color: 'var(--coral)' }} onClick={() => onDelete(sel)}>Elimina questo allenamento</button>
        </div>
      )}
    </>
  )
}

// Contesto per il coach IA: un riassunto compatto dello stato dell'atleta, letto dai dati locali.
// ponytail: v1 senza tool — il contesto viene iniettato nel prompt; i tool su Supabase arrivano alla tappa 2.
function contestoCoach(s: State): string {
  const r = readiness(s.checkin)
  const righe: string[] = []
  righe.push(`Data: ${today()}`)
  righe.push(s.checkin.date === today()
    ? `Check-in di oggi: readiness ${r}/100 (sonno ${s.checkin.sonno}/10${s.checkin.ore ? ` = ${s.checkin.ore}h` : ''}, energia ${s.checkin.energia}/10, DOMS ${s.checkin.doms}/10, stress ${s.checkin.stress}/10)`
    : 'Check-in di oggi: NON fatto')
  const sc = curScheda(s)
  if (sc) righe.push(`Scheda attiva: "${sc.name}" (${sc.days.map((d) => d.name).join(' / ')})`)
  righe.push(`Obiettivo: ${s.goal.ex} a ${s.goal.targetKg} kg (attuale 1RM stimato ${fmt(bestE1rm(s.log, s.goal.ex))} kg)`)
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const since = weekAgo.toISOString().slice(0, 10)
  const wk = s.log.filter((l) => l.date > since)
  righe.push(`Ultimi 7 giorni: ${new Set(wk.map((l) => l.date)).size} sedute, ${wk.length} serie, ${fmt(volume(wk) / 1000)} t di volume`)
  const rep = weeklyReport(s)
  if (rep.scarico) righe.push(`Segnali di fatica (RPE in salita a parità di carico): ${rep.flags.map((f) => f.ex).join(', ')} → valuta scarico`)
  const oggi = nutritionToday(s.meals, today())
  righe.push(`Alimentazione oggi: ${Math.round(oggi.kcal)}/${s.target.kcal} kcal, proteine ${Math.round(oggi.protein)}/${s.target.protein} g`)
  if (s.body.length) righe.push(`Peso corporeo: ${fmt(s.body[s.body.length - 1].kg)} kg`)
  righe.push(`Ultime serie registrate: ${s.log.slice(-8).map((l) => `${l.date} ${l.ex} ${fmt(l.kg)}x${l.reps}${l.rpe ? `@${fmt(l.rpe)}` : ''}`).join(' · ') || 'nessuna'}`)
  // Feedback scritti di suo pugno durante gli allenamenti: è la voce che i numeri non hanno.
  const note = (s.sessionEx ?? []).filter((x) => x.note).slice(-8)
  if (note.length) righe.push(`Sue note dagli allenamenti: ${note.map((x) => `${x.date} ${x.ex}: "${x.note}"`).join(' · ')}`)
  const vid = (s.sessionEx ?? []).filter((x) => x.setVideos && Object.keys(x.setVideos).length).slice(-6)
  if (vid.length) righe.push(`Ha registrato le sue serie (puoi chiedergli di descriverti l'esecuzione): ${vid.map((x) => `${x.date} ${x.ex} serie ${Object.keys(x.setVideos!).map((n) => +n + 1).join(',')}`).join(' · ')}`)
  // RECORD dichiarati: sono il bersaglio da battere, la chat deve poterli citare
  const rec = Object.entries(s.refMax ?? {})
  if (rec.length) righe.push(`Record che ha DICHIARATO lui: ${rec.map(([e, r]) => `${e} ${fmt(r.kg)}x${r.reps} (max stimato ${fmt(round25(massimale(s, e).kg))} kg)`).join(' · ')}`)
  // PROGRESSIONE COL CONTESTO sugli esercizi allenati di recente: stessa lettura del tasto Peso
  const exRecenti = [...new Set(s.log.filter((l) => !l.timed).slice(-40).map((l) => l.ex))].slice(0, 6)
  if (exRecenti.length) {
    righe.push('Progressione col CONTESTO (1RM stimato · posizione nella seduta · serie sullo stesso muscolo prima). Giudica il progresso da qui, non dal peso nudo:')
    for (const e of exRecenti) {
      const p = progressione(s, e, 4)
      if (p.length) righe.push(`  ${e}: ${p.map((x) => `${x.date} ${fmt(round25(x.e1rm))}kg al ${x.pos}° con ${x.preSerie} prima`).join(' · ')}`)
    }
  }
  return righe.join('\n')
}

function Coach({ s, onChat }: { s: State; onChat: (c: ChatMsg[]) => void }) {
  const key = s.settings.geminiKey?.trim()
  // la conversazione vive nello STATO (salvata e sincronizzata): prima era locale al
  // componente e spariva appena cambiavi scheda. onChat scrive sullo stato PIÙ RECENTE:
  // la risposta arriva async e con uno snapshot vecchio cancelleremmo le serie nel frattempo.
  const chat = s.chat ?? []
  const setChat = onChat
  const [inp, setInp] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  // sulla LUNGHEZZA, non sull'array: `s.chat ?? []` è un oggetto nuovo a ogni render e
  // farebbe scattare lo scroll di continuo
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [chat.length, busy])
  const send = async () => {
    const t = inp.trim()
    if (!t || busy || !key) return
    const nuova: ChatMsg[] = [...chat, { role: 'user', text: t }]
    setChat(nuova); setInp(''); setBusy(true)
    try {
      const risposta = await chiamaCoach(nuova, key, contestoCoach(s))
      setChat([...nuova, { role: 'model', text: risposta }])
    } catch (e) {
      setChat([...nuova, { role: 'model', text: '⚠ ' + ((e as Error).message || 'Errore sconosciuto') }])
    } finally { setBusy(false) }
  }
  const svuota = async () => {
    if (chat.length && await confirmDlg('Svuotare la conversazione?', 'I messaggi vengono cancellati.')) setChat([])
  }

  if (!key) return (
    <>
      <h2>Coach IA</h2>
      <div className="card">
        <p className="sm" style={{ marginTop: 0, lineHeight: 1.6 }}>
          Il coach legge i tuoi dati (allenamenti, recupero, sonno, alimentazione) e ti consiglia come un preparatore.
          Per attivarlo serve la <b>tua</b> chiave API di Google Gemini — gratuita.
        </p>
        <p className="sm mut" style={{ lineHeight: 1.6 }}>
          1) Vai su <b>aistudio.google.com</b> ed entra col tuo account Google<br />
          2) Tocca <b>Get API key</b> → crea la chiave e copiala<br />
          3) Incollala in <b>Profilo → ⚙ → Coach IA</b>
        </p>
      </div>
    </>
  )

  return (
    <>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <h2 style={{ flex: 1 }}>Coach IA</h2>
        {chat.length > 0 && <button className="ghost" style={{ width: 'auto', padding: '6px 12px', fontSize: 12.5 }} onClick={svuota}>Svuota</button>}
      </div>
      <div className="chatlog">
        {chat.length === 0 && (
          <div className="bubble ai">Ciao! Sono il tuo coach. Chiedimi dei tuoi allenamenti, del peso da caricare, di recupero o alimentazione. Conosco i tuoi dati.</div>
        )}
        {chat.map((m, i) => <div key={i} className={'bubble ' + (m.role === 'user' ? 'me' : 'ai')}>{m.text}</div>)}
        {busy && <div className="bubble ai mut">sta scrivendo…</div>}
        <div ref={endRef} />
      </div>
      <div className="row chatrow">
        <input value={inp} onChange={(e) => setInp(e.target.value)} placeholder="Scrivi al coach…" enterKeyHint="send"
          onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
        <button style={{ width: 'auto', padding: '12px 18px' }} disabled={busy || !inp.trim()} onClick={send}>➤</button>
      </div>
    </>
  )
}

// Voce di menu grande: titolo su pastiglia in rilievo e icona sfumata a destra.
function MenuCard({ titolo, sotto, paths, onClick }: { titolo: string; sotto: string; paths: string[]; onClick: () => void }) {
  return (
    <div className="mcard" onClick={onClick}>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <b>{titolo}</b>
        <div className="msub">{sotto}</div>
      </div>
      <svg className="mbig" viewBox="0 0 24 24" aria-hidden="true">{paths.map((d, i) => <path key={i} d={d} />)}</svg>
      <span className="chev" style={{ marginLeft: 'auto', zIndex: 1 }}>›</span>
    </div>
  )
}

type SezImp = 'allenamento' | 'nutrizione' | 'ia' | 'account' | 'dati' | 'misure'

// Misurazioni corporee: base funzionante da ampliare (foto, pieghe, grafici per punto).
function Misurazioni({ s, setS }: { s: State; setS: (u: State) => void }) {
  const misure = s.misure ?? []
  // ultima e penultima misura per punto: servono al valore e alla variazione
  const perPunto = (p: string) => misure.filter((m) => m.punto === p).sort((a, b) => a.date.localeCompare(b.date))
  const punti = [...new Set([...PUNTI_MISURA, ...misure.map((m) => m.punto)])]
  const aggiungi = async (p: string) => {
    const ultimi = perPunto(p)
    const v = await promptDlg(p, [{ label: 'Centimetri', value: ultimi.length ? String(ultimi[ultimi.length - 1].cm) : '' }])
    const cm = parseFloat((v?.[0] ?? '').replace(',', '.'))
    if (!cm || cm <= 0) return
    // una sola misura per punto al giorno: riscrivo quella di oggi invece di accumularne due
    setS({ ...s, misure: [...misure.filter((m) => !(m.date === today() && m.punto === p)), { date: today(), punto: p, cm }] })
    toast(`${p}: ${fmt(cm)} cm`)
  }
  return (
    <>
      <p className="hint" style={{ marginTop: 0 }}>Tocca un punto per segnare la misura di oggi. Misura sempre nelle stesse condizioni: a freddo, senza contrarre.</p>
      <div className="card" style={{ padding: '4px 12px' }}>
        {punti.map((p) => {
          const st2 = perPunto(p)
          const ultimo = st2[st2.length - 1]
          const prec = st2[st2.length - 2]
          const d = ultimo && prec ? ultimo.cm - prec.cm : 0
          return (
            <div className="set" key={p} style={{ cursor: 'pointer' }} onClick={() => aggiungi(p)}>
              <b className="sm">{p}</b>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 8, flex: 'none' }}>
                {d !== 0 && <span className="num sm" style={{ color: d > 0 ? 'var(--lime)' : 'var(--coral)' }}>{d > 0 ? '+' : ''}{fmt(d)}</span>}
                <b className="num">{ultimo ? `${fmt(ultimo.cm)} cm` : '—'}</b>
              </span>
              <span className="chev">›</span>
            </div>
          )
        })}
      </div>
      {misure.length > 0 && (<>
        <h2>Storico</h2>
        <div className="card" style={{ padding: '4px 12px' }}>
          {[...new Set(misure.map((m) => m.date))].sort().reverse().slice(0, 12).map((d) => (
            <div className="set" key={d}>
              <span className="mono sm mut num" style={{ width: 56, flex: 'none' }}>{d.slice(5).split('-').reverse().join('/')}</span>
              <span className="meta num" style={{ marginLeft: 'auto' }}>{misure.filter((m) => m.date === d).map((m) => `${m.punto} ${fmt(m.cm)}`).join(' · ')}</span>
            </div>
          ))}
        </div>
      </>)}
      <p className="hint">In arrivo: foto di confronto, grafico per ogni punto e collegamento col peso.</p>
    </>
  )
}

function Profilo({ s, setS }: { s: State; setS: (u: State) => void }) {
  const cur = s.body.length ? s.body[s.body.length - 1].kg : 0
  const first = s.body.length ? s.body[0].kg : cur
  const [w, setW] = useState('')
  const [sub, setSub] = useState<SezImp | null>(null)
  const [mail, setMail] = useState<string | null>(null)
  useEffect(() => {
    if (!supa) return
    supa.auth.getSession().then(({ data }) => setMail(data.session?.user.email ?? null))
  }, [])
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

  // readiness e medie alimentari NON stanno più qui: erano copie di Home e Cibo
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const since = weekAgo.toISOString().slice(0, 10)
  const weekSessions = new Set(s.log.filter((l) => l.date > since).map((l) => l.date)).size

  // Sotto-schermata delle impostazioni: header col ‹ e solo quella sezione
  if (sub) {
    const titoli: Record<SezImp, string> = {
      allenamento: 'Allenamento', nutrizione: 'Nutrizione', ia: 'Coach IA',
      account: 'Account e cloud', dati: 'Dati e app', misure: 'Misurazioni',
    }
    return (
      <>
        <div className="bc" style={{ marginTop: 18 }}>
          <button className="back" onClick={() => setSub(null)}>‹</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb">{sub === 'misure' ? 'Il tuo corpo' : 'Impostazioni'}</div>
            <div className="bt1">{titoli[sub]}</div>
          </div>
        </div>
        {sub === 'misure' ? <Misurazioni s={s} setS={setS} /> : <Impostazioni s={s} setS={setS} sez={sub} />}
      </>
    )
  }

  const nome = s.settings.nome?.trim()
  const iniziali = (nome || mail || 'C').slice(0, 2).toUpperCase()

  return (
    <>
      {/* IDENTITÀ: prima non c'era niente di personale qui, era una seconda pagina di statistiche */}
      <div className="card idcard">
        <div className="avat">{iniziali}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <input className="nomein" placeholder="Il tuo nome" value={s.settings.nome ?? ''}
            onChange={(e) => setS({ ...s, settings: { ...s.settings, nome: e.target.value || undefined } })} />
          <div className="meta" style={{ marginTop: 3 }}>{mail ?? 'solo su questo dispositivo'}</div>
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

      <h2>Il tuo corpo</h2>
      <MenuCard titolo="Misurazioni" sotto={(s.misure ?? []).length ? `${new Set((s.misure ?? []).map((m) => m.punto)).size} punti seguiti` : 'Circonferenze: braccio, vita, petto…'}
        onClick={() => setSub('misure')}
        paths={['M12 3v18', 'M8 6h8', 'M8 12h8', 'M8 18h8']} />

      {/* Impostazioni: un menu, non sei blocchi tutti aperti insieme */}
      <h2>Impostazioni</h2>
      <MenuCard titolo="Allenamento" sotto="Suono, vibrazione, obiettivo" onClick={() => setSub('allenamento')}
        paths={['M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12']} />
      <MenuCard titolo="Nutrizione" sotto="Calorie e proteine da raggiungere" onClick={() => setSub('nutrizione')}
        paths={['M6 3v8', 'M9 3v8', 'M7.5 11v10', 'M15 3c-1 2-1 6 1 7v11']} />
      <MenuCard titolo="Coach IA" sotto="La tua chiave per la chat e i consigli" onClick={() => setSub('ia')}
        paths={['M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']} />
      <MenuCard titolo="Account e cloud" sotto={mail ?? 'non connesso'} onClick={() => setSub('account')}
        paths={['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M4 21c0-4 4-6 8-6s8 2 8 6']} />
      <MenuCard titolo="Dati e app" sotto="Backup, ripristino, installazione" onClick={() => setSub('dati')}
        paths={['M12 3v12', 'M8 11l4 4 4-4', 'M4 21h16']} />
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
  if (l.includes('email not confirmed')) return 'Devi prima confermare l\'email: ti ho inviato un codice.'
  if (l.includes('token has expired') || l.includes('expired')) return 'Codice scaduto: chiedine uno nuovo.'
  if (l.includes('invalid token') || l.includes('token not found') || l.includes('otp')) return 'Codice non valido: ricontrollalo.'
  if (l.includes('same password')) return 'La nuova password è uguale alla vecchia.'
  return m
}

// Form di autenticazione riusabile: gate a schermo intero e card in Profilo.
// Messaggi inline (non toast che spariscono); il post-login (chiusura gate) avviene via onAuthStateChange.
// 'in' accedi · 'up' registrati · 'otp' verifica il codice ricevuto via email
// · 'forgot' chiedi il codice di recupero · 'newpw' scegli la nuova password
type AuthMode = 'in' | 'up' | 'otp' | 'forgot' | 'newpw'

function AuthForm() {
  const [mode, setMode] = useState<AuthMode>('in')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('') // conferma, solo dove la password la scegli
  const [showPw, setShowPw] = useState(false)
  const [code, setCode] = useState('')
  // che tipo di codice sto verificando: conferma registrazione o recupero password
  const [otpKind, setOtpKind] = useState<'signup' | 'recovery'>('signup')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null) // messaggio positivo, distinto dall'errore
  if (!supa) return null
  const sb = supa
  const em = email.trim()
  const pulisci = () => { setMsg(null); setOk(null) }
  const vai = (m: AuthMode) => { pulisci(); setCode(''); setPw2(''); setMode(m) }

  const registra = async () => {
    // emailRedirectTo esplicito: senza, il link di conferma viene costruito con il "Site URL"
    // di Supabase, che resta indietro a ogni cambio di dominio. Così punta sempre a dove sei.
    const r = await sb.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: window.location.origin } })
    if (r.error) {
      const t = traduciAuth(r.error.message)
      if (/già registrata/.test(t)) setMode('in') // email esistente: porta al login
      return setMsg(t)
    }
    // Su alcune config l'email già registrata non dà errore: torna un utente senza identità
    if (r.data.user && (r.data.user.identities?.length ?? 0) === 0) {
      setMode('in'); return setMsg('Questa email è già registrata: accedi con la tua password.')
    }
    if (r.data.session) return // confermata subito: onAuthStateChange chiude il gate
    setOtpKind('signup'); setMode('otp')
    setOk(`Ti ho mandato un codice a ${em}. Scrivilo qui sotto per confermare l'account.`)
  }

  const accedi = async () => {
    const r = await sb.auth.signInWithPassword({ email: em, password: pw })
    if (!r.error) return // onAuthStateChange chiude il gate
    // non confermata: invece di lasciarlo bloccato, gli rimando il codice e lo porto a verificarlo
    if (/not confirmed/i.test(r.error.message)) {
      await sb.auth.resend({ type: 'signup', email: em, options: { emailRedirectTo: window.location.origin } })
      setOtpKind('signup'); setMode('otp')
      return setOk(`Questo account non è ancora confermato: ti ho rimandato un codice a ${em}.`)
    }
    setMsg(traduciAuth(r.error.message))
  }

  const verifica = async () => {
    const token = code.replace(/\D/g, '')
    if (token.length < 6) return setMsg('Il codice è di 6 cifre.')
    const r = await sb.auth.verifyOtp({ email: em, token, type: otpKind })
    if (r.error) return setMsg(traduciAuth(r.error.message))
    // recupero: ora ho una sessione valida e posso cambiare la password
    if (otpKind === 'recovery') { vai('newpw'); setOk('Codice giusto. Scegli la nuova password.') }
    // registrazione: la sessione c'è, onAuthStateChange chiude il gate
  }

  const rinvia = async () => {
    const r = otpKind === 'signup'
      ? await sb.auth.resend({ type: 'signup', email: em, options: { emailRedirectTo: window.location.origin } })
      : await sb.auth.resetPasswordForEmail(em, { redirectTo: window.location.origin })
    if (r.error) return setMsg(traduciAuth(r.error.message))
    setOk('Codice rinviato: controlla la posta (anche lo spam).')
  }

  const recupera = async () => {
    const r = await sb.auth.resetPasswordForEmail(em, { redirectTo: window.location.origin })
    if (r.error) return setMsg(traduciAuth(r.error.message))
    setOtpKind('recovery'); setMode('otp')
    setOk(`Ti ho mandato un codice a ${em} per reimpostare la password.`)
  }

  const cambiaPw = async () => {
    const r = await sb.auth.updateUser({ password: pw })
    if (r.error) return setMsg(traduciAuth(r.error.message))
    setOk('Password aggiornata.') // la sessione è già attiva: si entra
  }

  const go = async () => {
    pulisci()
    // ogni schermata ha i suoi campi obbligatori
    if (mode !== 'otp' && !em) return setMsg('Scrivi la tua email.')
    if ((mode === 'in' || mode === 'up' || mode === 'newpw') && pw.length < 6) return setMsg('La password deve avere almeno 6 caratteri.')
    if ((mode === 'up' || mode === 'newpw') && pw !== pw2) return setMsg('Le due password non coincidono.')
    setBusy(true)
    try {
      if (mode === 'in') await accedi()
      else if (mode === 'up') await registra()
      else if (mode === 'otp') await verifica()
      else if (mode === 'forgot') await recupera()
      else if (mode === 'newpw') await cambiaPw()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Qualcosa è andato storto: riprova.')
    } finally { setBusy(false) }
  }

  // Accesso col provider: il browser se ne va sul sito di Google/Apple e torna con la
  // sessione già pronta, quindi niente setBusy(false) sul ramo buono.
  const oauth = async (provider: 'google' | 'apple') => {
    pulisci(); setBusy(true)
    const r = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } })
    if (r.error) { setMsg(traduciAuth(r.error.message)); setBusy(false) }
  }

  const etichetta = mode === 'in' ? 'Entra' : mode === 'up' ? 'Crea account'
    : mode === 'otp' ? 'Conferma' : mode === 'forgot' ? 'Mandami il codice' : 'Salva la password'

  // Ogni schermata dice dove sei e cosa succede dopo, invece di un titolo generico per tutte
  const testi: Record<AuthMode, [string, string]> = {
    in: ['Bentornato', 'Accedi per ritrovare schede, carichi e progressi.'],
    up: ['Crea il tuo account', 'Bastano un\'email e una password: i dati restano tuoi.'],
    otp: ['Controlla la posta', `Abbiamo mandato un codice a ${em || 'la tua email'}. Scrivilo qui sotto.`],
    forgot: ['Password dimenticata', 'Scrivi la tua email: ti mando un codice per reimpostarla.'],
    newpw: ['Nuova password', 'Scegline una che ricordi: almeno 6 caratteri.'],
  }
  const [titolo, sotto] = testi[mode]
  const pwUguali = pw2.length > 0 && pw === pw2

  // campo password con l'occhio per mostrarla: si sbaglia molto meno a digitarla
  const campoPw = (val: string, set: (v: string) => void, ph: string, auto: string) => (
    <div className="pwfield">
      <input type={showPw ? 'text' : 'password'} placeholder={ph} autoComplete={auto}
        value={val} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
      <button className="pweye" type="button" tabIndex={-1} title={showPw ? 'Nascondi' : 'Mostra'}
        onClick={() => setShowPw(!showPw)}>
        <svg viewBox="0 0 24 24" className="misvg"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          {!showPw && <path d="M4 20L20 4" />}</svg>
      </button>
    </div>
  )

  return (
    <>
      <div className="authhead">
        <h1>{titolo}</h1>
        <p>{sotto}</p>
      </div>

      {/* l'email si mostra solo dove serve scriverla: nella verifica è già decisa */}
      {mode !== 'otp' && mode !== 'newpw' && (
        <input type="email" placeholder="Email" autoComplete="email" inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
      )}
      {(mode === 'in' || mode === 'up' || mode === 'newpw') && (
        <div style={{ marginTop: mode === 'newpw' ? 0 : 8 }}>
          {campoPw(pw, setPw, mode === 'newpw' ? 'Nuova password' : 'Password', mode === 'in' ? 'current-password' : 'new-password')}
        </div>
      )}
      {/* conferma solo dove la password la stai SCEGLIENDO: all'accesso sarebbe un fastidio */}
      {(mode === 'up' || mode === 'newpw') && (<>
        <div style={{ marginTop: 8 }}>{campoPw(pw2, setPw2, 'Ripeti la password', 'new-password')}</div>
        <div className="pwcheck">
          <span className={pw.length >= 6 ? 'ok' : ''}>{pw.length >= 6 ? '✓' : '·'} almeno 6 caratteri</span>
          <span className={pwUguali ? 'ok' : ''}>{pwUguali ? '✓' : '·'} le due coincidono</span>
        </div>
      </>)}
      {mode === 'otp' && (
        // Supabase permette codici da 6 a 10 cifre (impostazione del progetto): accettiamoli
        // tutti invece di tagliare a 6, e stringiamo il testo quando il codice è lungo.
        <input className="otpin num" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
          placeholder="000000" value={code}
          style={code.length > 7 ? { fontSize: 24, letterSpacing: '.2em', paddingLeft: 12 } : undefined}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onKeyDown={(e) => { if (e.key === 'Enter') go() }} />
      )}

      <button disabled={busy} style={{ marginTop: 12 }} onClick={go}>{busy ? '…' : etichetta}</button>

      {/* Provider esterni: solo dove ha senso, cioè quando stai entrando o creando l'account */}
      {(mode === 'in' || mode === 'up') && (<>
        <div className="oppure"><span>oppure</span></div>
        <button className="oauthbtn" disabled={busy} onClick={() => oauth('google')}>
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
            <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
            <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z" />
            <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
          </svg>
          Continua con Google
        </button>
        {/* Apple richiede l'abbonamento sviluppatore: meglio dirlo che dare un pulsante che
            fallisce. Resta visibile perché è una funzione prevista, non abbandonata. */}
        <button className="oauthbtn soon" onClick={() => setMsg('Accesso con Apple non ancora disponibile: usa Google, oppure email e password.')}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
            <path d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84s2.01.84 3.38.81c1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.75-4.12zM14.6 4.7c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.26.68-3 1.54-.66.77-1.24 2-1.08 3.18 1.14.09 2.3-.58 3.02-1.45z" />
          </svg>
          Continua con Apple
          <span className="soontag">presto</span>
        </button>
      </>)}

      {mode === 'otp' && (<>
        <button className="linklike" disabled={busy} onClick={rinvia}>Non è arrivato? Rimandamelo</button>
        <button className="linklike" disabled={busy} onClick={() => vai('in')}>Torna all'accesso</button>
      </>)}
      {mode === 'in' && (<>
        <button className="linklike" disabled={busy} onClick={() => vai('up')}>Non hai un account? Registrati</button>
        <button className="linklike" disabled={busy} onClick={() => vai('forgot')}>Password dimenticata?</button>
      </>)}
      {mode === 'up' && <button className="linklike" disabled={busy} onClick={() => vai('in')}>Hai già un account? Accedi</button>}
      {mode === 'forgot' && <button className="linklike" disabled={busy} onClick={() => vai('in')}>Torna all'accesso</button>}

      {ok && <p className="authmsg okmsg">{ok}</p>}
      {msg && <p className="authmsg">{msg}</p>}
      {mode === 'otp' && <p className="authmsg hint2">Se al posto del codice ricevi un link, aprilo: va bene lo stesso.</p>}
    </>
  )
}

// Schermata di login a tutto schermo: prima cosa all'avvio, senza accesso non si procede.
function AuthGate() {
  return (
    <div className="authgate">
      <div className="authbox">
        <div className="authbrand"><span className="mark">CARICO</span><span className="dot" /></div>
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

// `sez` = quale gruppo mostrare: dal Profilo si entra in una sezione per volta, invece di
// avere sei blocchi aperti tutti insieme.
function Impostazioni({ s, setS, sez }: { s: State; setS: (u: State) => void; sez: SezImp }) {
  const lib = libreriaEsercizi(s)
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
  // Copie che l'app salva da sola quando trova dati locali di un ALTRO account (vedi UIDK).
  // Le elenco qui: senza, resterebbero sepolte nella memoria del browser.
  const backupLocali = useMemo(() => {
    const out: { k: string; uid: string; n: number; schede: number; ultimo: string }[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith('carico-bk-')) continue
      try {
        const st = JSON.parse(localStorage.getItem(k) ?? '{}') as Partial<State>
        const log = st.log ?? []
        out.push({
          k, uid: k.slice('carico-bk-'.length), n: log.length,
          schede: (st.schede ?? []).length,
          ultimo: log.length ? log[log.length - 1].date : '—',
        })
      } catch { /* copia illeggibile: la salto invece di far saltare la schermata */ }
    }
    return out
  }, [])
  const ripristinaBackup = async (k: string) => {
    const raw = localStorage.getItem(k)
    if (!raw) return toast('Copia non più disponibile')
    if (!(await confirmDlg('Ripristinare questa copia?', 'Sostituisce i dati di questo telefono. Quelli attuali finiscono a loro volta in una copia, quindi non si perde niente.'))) return
    try {
      const st = JSON.parse(raw) as Partial<State>
      localStorage.setItem(`carico-bk-attuali-${Date.now()}`, JSON.stringify(s)) // rete di sicurezza al contrario
      setS({ ...emptyState(), ...st })
      toast('Copia ripristinata: controlla i dati, poi usa "Rimanda tutto nel cloud"')
    } catch { toast('Copia illeggibile') }
  }

  // Verso opposto del "carica dal cloud": prende quello che c'è QUI e lo rimanda su.
  const ripristinaCloud = async () => {
    if (!supa) return toast('Cloud non configurato')
    if (!(await supa.auth.getSession()).data.session?.user.id) return toast('Accedi prima nel tuo account')
    const n = s.log.length
    if (!(await confirmDlg('Rimandare tutto nel cloud?', `${n} serie più schede, check-in, pasti e peso di questo telefono vengono ricaricati nel tuo account. Non cancella niente di quello che c'è già.`))) return
    const { log } = ricaricaNelCloud(s)
    const agg = { ...s, log } // gli id assegnati vanno tenuti: senza, un secondo invio duplicherebbe
    setS(agg); configSalvata(agg)
    toast(`${n} serie in coda: la sincronizzazione prosegue da sola`)
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
  if (sez === 'allenamento') return (
    <>
      <div className="card">
        <div className="mrow"><span>Suono a fine recupero</span><Tog on={s.settings.sound} set={(v) => setOpt('sound', v)} /></div>
        <div className="mrow"><span>Vibrazione a fine recupero</span><Tog on={s.settings.vibrate} set={(v) => setOpt('vibrate', v)} /></div>
      </div>
      <p className="hint">Su iPhone la vibrazione via web non è disponibile: arriverà con l'app installabile.</p>
      <h2>Obiettivo attivo</h2>
      <div className="card">
        <div className="mrow"><span>{s.goal.ex}</span><b className="num">{s.goal.targetKg} kg</b></div>
        <button className="ghost" style={{ marginTop: 10 }} onClick={editGoal}>Cambia obiettivo</button>
      </div>
    </>
  )

  if (sez === 'nutrizione') return (
    <>
      <div className="card">
        <div className="mrow"><span>Calorie (kcal)</span>
          <input className="numedit" type="number" inputMode="numeric" value={s.target.kcal} onChange={(e) => setTarget('kcal', +e.target.value)} /></div>
        <div className="mrow"><span>Proteine (g)</span>
          <input className="numedit" type="number" inputMode="numeric" value={s.target.protein} onChange={(e) => setTarget('protein', +e.target.value)} /></div>
      </div>
      <p className="hint">Sono i target giornalieri: li vedi nella home e nella tab Cibo.</p>
    </>
  )

  if (sez === 'ia') return (
    <>
      <div className="card">
        <p className="sm mut" style={{ marginTop: 0, lineHeight: 1.55 }}>La tua chiave API Gemini, gratuita: <b>aistudio.google.com</b> → <i>Get API key</i>. Serve alla chat col coach, ai consigli sul peso e all'import delle schede da PDF.</p>
        <input type="password" placeholder="Incolla qui la chiave API" autoComplete="off"
          value={s.settings.geminiKey ?? ''}
          onChange={(e) => setS({ ...s, settings: { ...s.settings, geminiKey: e.target.value.trim() || undefined } })} />
        {s.settings.geminiKey && <p className="sm" style={{ marginBottom: 0, color: 'var(--lime)' }}>Chiave salvata — sincronizzata col tuo account</p>}
      </div>
    </>
  )

  if (sez === 'account') return (
    <>
      <Cloud />
      <h2>Ripristino</h2>
      <div className="card">
        <button className="ghost" onClick={restoreCloud}>Carica i dati dal cloud</button>
        <p className="hint">Sostituisce i dati di questo dispositivo con quelli salvati nel tuo account. Serve su un telefono nuovo.</p>
      </div>
    </>
  )

  return (
    <>
      <div className="card">
        <button className="ghost" onClick={doInstall}>⤓ Installa sulla schermata home</button>
        <button className="ghost" style={{ marginTop: 8 }} onClick={exportData}>Esporta dati (backup)</button>
        <label className="ghost filebtn">Importa backup
          <input type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
        </label>
      </div>
      <h2>Ripristino</h2>
      <div className="card">
        <button className="ghost" onClick={ripristinaCloud}>↥ Rimanda tutto nel cloud</button>
        <p className="hint">Ricarica nel tuo account quello che hai su questo telefono: serie, schede, check-in, pasti, peso. Serve se nel cloud manca qualcosa. Non cancella niente e si può ripetere senza creare doppioni.</p>
      </div>

      {/* Copie salvate dall'app quando i dati locali appartenevano a un altro account:
          è l'ultima rete quando qualcosa sparisce sia dal telefono sia dal cloud. */}
      <h2>Copie di sicurezza sul telefono</h2>
      {backupLocali.length ? backupLocali.map((b) => (
        <div className="card" key={b.k} style={{ marginTop: 10 }}>
          <div className="row" style={{ alignItems: 'baseline' }}>
            <b style={{ fontSize: 15 }}>{b.n} serie</b>
            <span className="meta num" style={{ marginLeft: 'auto' }}>{b.schede} schede · fino al {b.ultimo}</span>
          </div>
          <div className="meta mono" style={{ marginTop: 4, fontSize: 10.5, opacity: .7 }}>{b.uid}</div>
          <button className="ghost" style={{ marginTop: 10 }} onClick={() => ripristinaBackup(b.k)}>Ripristina questa copia</button>
        </div>
      )) : (
        <div className="card"><p className="sm mut" style={{ margin: 0 }}>Nessuna copia trovata su questo dispositivo.</p></div>
      )}
      <p className="hint">Schede e pasti vivono su questo dispositivo: un backup ogni tanto non fa male. Le serie vanno anche nel cloud quando sei connesso.</p>
      <h2>Zona pericolosa</h2>
      <div className="card">
        <button className="ghost" style={{ color: 'var(--coral)' }} onClick={reset}>Azzera tutti i dati</button>
      </div>
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
