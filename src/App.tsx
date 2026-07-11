import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  type State, type Scheda, type PlanItem, today, fmt, proposta, readiness, readinessOn, rpeDelta,
  historyDates, sessionE1rm, bestE1rm, avgRpeOf, record,
  prsForSession, sessionSummary, weeklyReport, nutritionToday, seed,
  muscleVolume, waterToday, waterGoal, adaptSession,
  streak, level, badges, totalWorkouts, totalTonnage,
  curScheda, curDay, curItems, allItems, MUSCLES, EXERCISES, lookupMuscle, parseScheda,
  type SetType, type SetSpec, SET_TYPES, setTypeLabel, itemReps, itemSetCount, schemeSummary, schemeTag, makePreset,
} from './coach'
import { DialogHost, confirmDlg, promptDlg, toast } from './dialog'

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

const LS = 'carico-v1'
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
      return { ...seed(), ...p } // i campi nuovi ereditano i default
    }
  } catch { /* storage non disponibile */ }
  return seed()
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
  useEffect(() => {
    try { localStorage.setItem(LS, JSON.stringify(s)) } catch { /* ignora */ }
  }, [s])
  useTop(tab)

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
      {tab === 'profilo' && <Profilo s={s} setS={setS} goAllena={() => setTab('allena')} />}

      <TimerBar timer={timer} total={total} onTimer={setTimer} onTotal={setTotal} />
      <nav>
        {TABS.map((t) => (
          <a key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            <span className="ico"><Icon t={t} /></span>{t}
          </a>
        ))}
      </nav>
      <DialogHost />
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
  const set = (k: keyof State['checkin'], v: number) => {
    const c = { ...s.checkin, [k]: v, date: today() }
    setS({ ...s, checkin: c, checkins: [...s.checkins.filter((x) => x.date !== today()), c] })
  }
  const sliders: [keyof State['checkin'], string][] = [
    ['sonno', 'Sonno'], ['energia', 'Energia'], ['doms', 'Indolenzimento (DOMS)'], ['stress', 'Stress'],
  ]

  const r = readiness(s.checkin)
  const rLabel = r >= 80 ? 'PRONTO' : r >= 65 ? 'OK' : 'SCARICA'
  const rCol = r >= 80 ? 'var(--teal)' : r >= 65 ? 'var(--amber)' : 'var(--coral)'
  const rHead = r >= 80 ? 'Giornata da spingere' : r >= 65 ? 'Giornata nella norma' : 'Meglio andarci piano'

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

  const h = new Date().getHours()
  const hi = h < 12 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'
  const nudge = s.checkin.date !== today()
    ? 'Fai il check-in di oggi: 20 secondi e i pesi proposti diventano affidabili.'
    : r < 65 ? `Readiness ${r}/100: ho ridotto i carichi del 10%, punta a serie pulite.`
    : weeklyReport(s).scarico ? 'Fatica in accumulo su un fondamentale: valuta una settimana di scarico.'
    : 'Tutto in linea. Chiudi le serie a RPE 8 e la progressione va da sé.'

  return (
    <>
      <p className="hello">{hi} · <b>{day?.name ?? 'riposo'}</b> in programma oggi</p>

      <div className="card ready">
        <Ring v={r} color={rCol} />
        <div style={{ minWidth: 0 }}>
          <div className="rl" style={{ color: rCol }}>{rLabel} · READINESS</div>
          <div className="rh">{rHead}</div>
          <div className="rd">{nudge}</div>
        </div>
      </div>

      <div className="tiles" style={{ marginTop: 10 }}>
        <div className="tile"><div className="l">Streak</div><div className="v num">{st} <span className="sm mut">gg</span></div></div>
        <div className="tile"><div className="l">Settimana</div><div className="v num">{weekSessions} <span className="sm mut">sedute</span></div></div>
        <div className="tile"><div className="l">Volume 7gg</div><div className="v num">{fmt(weekTon / 1000)} <span className="sm mut">t</span></div></div>
        <div className="tile"><div className="l">Livello</div><div className="v num">{lvl.n}</div></div>
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
        <Bar v={tot.kcal} max={s.target.kcal} color="var(--lime)" label="Kcal" unit="" />
        <Bar v={tot.protein} max={s.target.protein} color="var(--teal)" label="Proteine" unit="g" />
        <Bar v={wt} max={wg} color="var(--blue)" label="Acqua" unit="ml" />
      </div>

      <h2>Check-in di oggi</h2>
      <div className="card">
        {sliders.map(([k, lab]) => (
          <div className="sl" key={k}>
            <div className="top"><b>{lab}</b><span className="val num">{s.checkin[k]}/10</span></div>
            <input type="range" min={0} max={10} step={1} value={s.checkin[k]}
              onChange={(e) => set(k, +e.target.value)} />
          </div>
        ))}
      </div>
    </>
  )
}

function Schede({ s, setS, onStart }: { s: State; setS: (u: State) => void; onStart: () => void }) {
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
      {s.schede.length > 1 && (
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
  const movePlan = (i: number, dir: number) => {
    const j = i + dir
    if (j < 0 || j >= plan.length) return
    const d = structuredClone(s)
    const a = d.schede[s.activeScheda].days[s.activeDay].items
    ;[a[i], a[j]] = [a[j], a[i]]
    setS(d)
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
    setS({ ...s, log: [...s.log, { date: today(), ex: it.ex, kg, reps: +d.reps, rpe: d.rpe ? +d.rpe : null }] })
    startRest(it.rest)
  }
  const uncheck = (ex: string, nth: number) => {
    let seen = 0
    const idx = s.log.findIndex((x) => x.date === today() && x.ex === ex && seen++ === nth)
    if (idx >= 0) setS({ ...s, log: s.log.filter((_, j) => j !== idx) })
  }
  const finish = () => {
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
      <div className="bc" style={{ marginBottom: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crumb">{curScheda(s)?.name} · allenamento</div>
          <div className="bt1">{day?.name}</div>
        </div>
        <span className={'exprog num' + (totalDone >= totalPlanned ? ' ok' : '')}>{totalDone}/{totalPlanned}</span>
      </div>

      <div className="wstats card">
        <div className="ws"><div className="l">Durata</div><div className="v num" style={{ color: workoutStart ? 'var(--teal)' : 'var(--mut2)' }}>{workoutStart ? mmss(dur) : '—'}</div></div>
        <div className="ws"><div className="l">Volume</div><div className="v num">{fmt(todayVol)} <span className="sm mut">kg</span></div></div>
        <div className="ws"><div className="l">Serie</div><div className="v num">{totalDone}</div></div>
      </div>
      <div className="bt" style={{ height: 7, marginTop: 10 }}><i style={{ width: pct + '%', background: 'var(--lime)' }} /></div>
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
              <span className="ic">⏱</span> Riposo <b className="num">{mmss(it.rest)}</b>
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
        <div className="overlay center" onClick={() => setMenu(null)}>
          <div className="dlg" onClick={(e) => e.stopPropagation()}>
            <b className="dt">{menu.it.ex}</b>
            <button className="ghost" style={{ marginTop: 14 }}
              onClick={() => { setSwap({ ex: menu.it.ex, isExtra: menu.isExtra }); setMenu(null) }}>⇄ Sostituisci esercizio</button>
            {!menu.isExtra && plan.length > 1 && (
              <button className="ghost" style={{ marginTop: 8 }}
                onClick={() => { setReorder(true); setMenu(null) }}>↕ Riordina esercizi</button>
            )}
            {!menu.isExtra && menu.idx < plan.length - 1 && (
              <button className="ghost" style={{ marginTop: 8, color: menu.it.ss ? 'var(--teal)' : undefined }}
                onClick={() => toggleSuperset(menu.it)}>⛓ {menu.it.ss ? 'Togli superset' : 'Superset col prossimo'}</button>
            )}
            <button style={{ marginTop: 14 }} onClick={() => setMenu(null)}>Chiudi</button>
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
      {reorder && (
        <div className="overlay" onClick={() => setReorder(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bc" style={{ margin: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="crumb">Ordine del giorno</div>
                <div className="bt1">Riordina esercizi</div>
              </div>
              <button className="pen" onClick={() => setReorder(false)}>✕</button>
            </div>
            <div className="plist">
              {plan.map((it, i) => (
                <div className="reorow" key={it.ex}>
                  <span className="exbar" style={{ background: mcolor(it.muscle) }} />
                  <b style={{ flex: 1, minWidth: 0, fontSize: 15 }}>{it.ex}</b>
                  <button className="ghost mini" disabled={i === 0} onClick={() => movePlan(i, -1)}>↑</button>
                  <button className="ghost mini" disabled={i === plan.length - 1} onClick={() => movePlan(i, 1)}>↓</button>
                </div>
              ))}
            </div>
            <button onClick={() => setReorder(false)}>Fatto</button>
          </div>
        </div>
      )}

      <button className="ghost" style={{ marginTop: 12 }} onClick={() => setPicker(true)}>＋ Aggiungi esercizio alla seduta</button>
      {picker && (
        <ExPicker lib={lib} title="Alla seduta di oggi" onClose={() => setPicker(false)}
          onPick={addExtra} onCreate={createAndAddExtra} />
      )}
      {statsEx && <ExStats s={s} ex={statsEx} onClose={() => setStatsEx(null)} />}

      {anyToday && !summary && (
        <button className="ghost" style={{ marginTop: 10 }} onClick={finish}>Termina sessione</button>
      )}
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
          <button style={{ marginTop: 12 }} onClick={() => { setSummary(null); setWorkoutStart(null) }}>Chiudi</button>
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

function Cibo({ s, setS }: { s: State; setS: (u: State) => void }) {
  const tot = nutritionToday(s.meals, today())
  const wt = waterToday(s.water, today()), wg = waterGoal(s)
  const addWater = (ml: number) => setS({ ...s, water: [...s.water, { date: today(), ml }] })
  const [name, setName] = useState(''); const [kcal, setKcal] = useState(''); const [prot, setProt] = useState('')
  const todays = s.meals.map((m, i) => ({ m, i })).filter((x) => x.m.date === today())
  const add = () => {
    if (!name || !kcal) return toast('Servono nome e kcal')
    setS({ ...s, meals: [...s.meals, { date: today(), name, kcal: +kcal, protein: +(prot || 0) }] })
    setName(''); setKcal(''); setProt('')
  }
  const missing = Math.max(0, s.target.protein - tot.protein)
  return (
    <>
      <h2>Idratazione</h2>
      <div className="card">
        <Bar v={wt} max={wg} color="var(--blue)" label="Acqua" unit="ml" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="ghost" onClick={() => addWater(250)}>+250 ml</button>
          <button className="ghost" onClick={() => addWater(500)}>+500 ml</button>
        </div>
        {wg > 2500 && <p className="sm mut" style={{ margin: '8px 2px 0' }}>Obiettivo <b style={{ color: 'var(--blue)' }}>+700 ml</b> oggi: ti alleni, servono più liquidi.</p>}
      </div>
      <h2>Oggi hai mangiato</h2>
      <div className="card">
        <Bar v={tot.kcal} max={s.target.kcal} color="var(--lime)" label="Kcal" unit="" />
        <Bar v={tot.protein} max={s.target.protein} color="var(--teal)" label="Proteine" unit="g" />
      </div>
      <h2>Aggiungi pasto</h2>
      <div className="card">
        <input placeholder="Nome (es. Cena — salmone)" value={name} onChange={(e) => setName(e.target.value)} style={{ fontFamily: 'var(--sans)' }} />
        <div className="row" style={{ marginTop: 8 }}>
          <input type="number" placeholder="kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          <input type="number" placeholder="proteine g" inputMode="numeric" value={prot} onChange={(e) => setProt(e.target.value)} />
        </div>
        <button style={{ marginTop: 10 }} onClick={add}>Aggiungi</button>
      </div>
      <h2>Pasti di oggi</h2>
      <div className="card" style={{ padding: '4px 12px' }}>
        {todays.length ? todays.map(({ m, i }) => (
          <div className="set" key={i}>
            <div style={{ minWidth: 0 }}><div className="ex" style={{ fontSize: 13 }}>{m.name}</div>
              <div className="meta num">{m.protein} g proteine</div></div>
            <span className="wb num" style={{ color: 'var(--chalk)', background: 'transparent', border: 0 }}>{m.kcal} kcal</span>
            <span className="del" onClick={() => setS({ ...s, meals: s.meals.filter((_, j) => j !== i) })}>✕</span>
          </div>
        )) : <p className="sm mut" style={{ margin: '10px 2px' }}>Nessun pasto: aggiungine uno sopra.</p>}
      </div>
      <div className="msg" style={{ marginTop: 12 }}><div className="who">Carico Coach</div>
        {missing > 0
          ? <>Ti mancano <b>{Math.round(missing)} g di proteine</b> per il target: stasera pesce, uova o skyr.</>
          : <>Target proteico raggiunto: <b>ottimo</b>, il recupero muscolare ringrazia.</>}
      </div>
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
  return (
    <>
      <div className="bc" style={{ marginTop: 14 }}>
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

function Profilo({ s, setS, goAllena }: { s: State; setS: (u: State) => void; goAllena: () => void }) {
  const cur = s.body.length ? s.body[s.body.length - 1].kg : 0
  const first = s.body.length ? s.body[0].kg : cur
  const [w, setW] = useState('')
  const [sub, setSub] = useState<'profilo' | 'stats' | 'cal' | 'set'>('profilo')
  const [statsEx, setStatsEx] = useState<string | null>(null)
  useTop(sub)
  const goalCur = bestE1rm(s.log, s.goal.ex)
  const pct = Math.min(100, Math.round((goalCur / s.goal.targetKg) * 100))
  const lvl = level(s.log), st = streak(s.log), tw = totalWorkouts(s.log), ton = totalTonnage(s.log)
  const bg = badges(s)
  const addW = () => {
    if (!w) return
    setS({ ...s, body: [...s.body.filter((b) => b.date !== today()), { date: today(), kg: +w }] })
    setW('')
  }
  const repeatDay = (date: string) => {
    const sets = s.log.filter((l) => l.date === date)
    const already = new Set([...curItems(s).map((i) => i.ex), ...s.extras.filter((e) => e.date === today()).map((e) => e.item.ex)])
    const items = [...new Set(sets.map((x) => x.ex))].filter((ex) => !already.has(ex)).map((ex) => {
      const v = sets.filter((x) => x.ex === ex)
      return { ex, sets: v.length, reps: Math.round(v.reduce((a, x) => a + x.reps, 0) / v.length), rest: 120, muscle: muscleOf(s, ex) }
    })
    setS({ ...s, extras: [...s.extras, ...items.map((item) => ({ date: today(), item }))] })
    toast('Seduta copiata in oggi')
    goAllena()
  }

  return (
    <>
      <div className="seg" style={{ marginTop: 4 }}>
        {([['profilo', 'Profilo'], ['stats', 'Stats'], ['cal', 'Calend.'], ['set', '']] as const).map(([k, l]) => (
          <button key={k} className={'sg' + (sub === k ? ' on' : '')} onClick={() => setSub(k)}>
            {k === 'set' ? <Gear size={18} /> : l}
          </button>
        ))}
      </div>

      {sub === 'stats' && <Statistiche s={s} onOpen={setStatsEx} />}
      {sub === 'cal' && <Calendario s={s} onRepeat={repeatDay} />}
      {sub === 'set' && <Impostazioni s={s} setS={setS} />}
      {statsEx && <ExStats s={s} ex={statsEx} onClose={() => setStatsEx(null)} />}
      {sub !== 'profilo' ? null : (<>
      <h2>Progressi</h2>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div className="mono sm mut" style={{ fontSize: 9, letterSpacing: '.16em', textTransform: 'uppercase' }}>Livello</div>
            <div style={{ fontSize: 30, fontWeight: 800 }} className="num">{lvl.n}</div>
          </div>
          <div className="flame"><span>🔥</span><b className="num">{st}</b><span className="sm mut">giorni</span></div>
        </div>
        <div className="bt" style={{ marginTop: 10 }}><i style={{ width: (lvl.into / lvl.need * 100) + '%', background: 'var(--lime)' }} /></div>
        <div className="meta num" style={{ marginTop: 8 }}>{lvl.into}/{lvl.need} al livello {lvl.n + 1} · {tw} sessioni · {fmt(ton / 1000)} t sollevate</div>
      </div>
      <h2>Badge</h2>
      <div className="badges">
        {bg.map((b) => (
          <div className={'badge' + (b.got ? ' got' : '')} key={b.name}>
            <div className="bi">{b.icon}</div><div className="bl">{b.name}</div>
          </div>
        ))}
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
      <h2>Obiettivo attivo</h2>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <b style={{ fontSize: 15 }}>{s.goal.ex} {s.goal.targetKg} kg</b>
          <span className="mono" style={{ color: 'var(--lime)' }}>{pct}%</span>
        </div>
        <div className="bt" style={{ marginTop: 9 }}><i style={{ width: pct + '%', background: 'var(--lime)' }} /></div>
        <div className="meta num" style={{ marginTop: 8 }}>{fmt(goalCur)} di {s.goal.targetKg} kg · 1RM stimato attuale</div>
      </div>
      </>)}
    </>
  )
}

const Tog = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
  <button className={'tog' + (on ? ' on' : '')} onClick={() => set(!on)} aria-label={on ? 'Attivo' : 'Spento'}><i /></button>
)

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
        setS({ ...seed(), ...p }); toast('Backup ripristinato ✓')
      } catch { toast('File non valido: serve un backup di CARICO') }
    })
    e.target.value = ''
  }
  const reset = async () => {
    if (await confirmDlg('Azzerare tutti i dati?', 'Schede, storico e pasti spariscono. Fai prima un backup.')) setS(seed())
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
        <button className="ghost" style={{ marginTop: 8, color: 'var(--coral)' }} onClick={reset}>Azzera tutti i dati</button>
      </div>
      <p className="hint">I dati vivono solo su questo dispositivo: esporta un backup ogni tanto.</p>
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
