// Chat col coach IA: chiamata REST diretta a Gemini con la chiave DELL'UTENTE (BYOK).
// Niente SDK (bundle piccolo, zero dipendenze) e niente proxy: la chiave è dell'utente,
// i dati che leggerà passano da Supabase che è già protetto per-utente dall'RLS.
// Tool use: Gemini può chiamare gli strumenti (src/data/tools.ts) per leggere i dati REALI
// dal database — storico con recuperi misurati, seduta in corso, check-in, nutrizione.
import { TOOL_DECLS, eseguiTool } from '../data/tools'
import { MODEL } from './model'
import type { ChatMsg } from '../coach'

export type { ChatMsg } // il tipo vive nel dominio (lo stato lo salva), qui si ri-esporta
type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }
type Content = { role: string; parts: Part[] }

const SYSTEM = `Sei il coach di CARICO, un'app italiana di allenamento in palestra e nutrizione.
Sei un preparatore esperto: allenamento coi pesi (ipertrofia e forza), programmazione, recupero, alimentazione sportiva.
Parli italiano, tono diretto e concreto, da coach in palestra: frasi brevi, niente giri di parole, dai numeri quando servono.
Rispondi in testo semplice, NIENTE markdown (no asterischi, no elenchi con trattini: usa frasi o "1) 2) 3)").
Hai degli STRUMENTI che leggono i dati veri dal database dell'atleta: usali ogni volta che la domanda riguarda
carichi, progressi, recuperi, la seduta di oggi, sonno o alimentazione — non tirare a indovinare.
Il campo rec_sec è il recupero REALE misurato in secondi prima della serie: pesalo nelle proposte
(un recupero tagliato = meno carico; guarda anche come l'atleta ha risposto storicamente ai recuperi corti).
Considera l'ordine (n) e i muscoli già colpiti nella seduta di oggi quando consigli il carico.
Se ti mancano dati per rispondere bene, dillo chiaramente e spiega cosa registrare nell'app.
Non sei un medico: su infortuni e dolori rimanda a un professionista, senza fare diagnosi.`

// ===== Aggiustamento del peso proposto =====
// Il modello NON restituisce un peso: restituisce di QUANTO correggere quello che
// l'aritmetica ha già calcolato. Il peso lo fa il codice e lo clampa alla banda, quindi
// un'allucinazione può renderti la serie un po' leggera o pesante, mai metterti 300 kg
// sotto lo squat. Qui niente strumenti: Gemini non ammette tool use e output strutturato
// insieme, e il contesto che serve glielo passiamo già scritto.
export const BANDA_PESO = 10 // percentuale massima di correzione, in più o in meno

// La spiegazione è il valore per l'utente: NON una riga secca, ma un ragionamento che collega
// record, affaticamento, recupero e progressione, parlandogli in seconda persona.
const COME_SPIEGARE = `"perche" = la spiegazione, 2-4 frasi in italiano, che parlano all'atleta in seconda persona
("tu") e collegano i punti VERI del suo contesto: il suo record su questo esercizio, se il muscolo è già
stato colpito e a che punto è della seduta, il recupero IMPOSTATO (dillo com'è: "con i tuoi 2 minuti…"),
l'alimentazione solo se rilevante (es. è in deficit), e come progredire. Concreta, niente markdown,
niente frasi di circostanza. Sul recupero resta ONESTO: l'ipotesi "se recuperi di più" si nomina solo
quando il recupero impostato è corto sul serio, mai quando è già abbondante.
Esempio di TONO (non di contenuto): "So che il tuo record qui è 120x8, ma hai già fatto la lat e sei al
terzo esercizio, quindi oggi non lo reggi. Con soli 45s di recupero prova X kg: se le chiudi pulite, la
prossima volta saliamo."`

const SYSTEM_PESO = `Sei il preparatore di CARICO. Il tuo scopo è farlo PROGREDIRE, non tenerlo al sicuro:
il peso da battere è il suo record, e ogni seduta è un tentativo di spostarlo in avanti. Ti do il peso che
l'aritmetica ha calcolato dal massimale e il contesto COMPLETO della giornata. Devi fare due cose:
1) "delta" = di quanto correggere quel peso, numero da -${BANDA_PESO} a ${BANDA_PESO} (percento).
Di norma proponi la PROGRESSIONE: il carico che lo fa avanzare rispetto all'ultima volta, spingendo verso o
oltre il record, QUANDO le condizioni di oggi lo permettono (recupero, freschezza del muscolo, readiness buone).
Cali SOLO se il contesto lo impone davvero — muscolo già affaticato, recupero cortissimo, readiness scarsa —
e anche allora è un "oggi fai quel che puoi, la prossima spingiamo", non un passo indietro.
RECUPERO — il carico che proponi è quello che regge CON IL RECUPERO IMPOSTATO nell'app per questo esercizio,
non con un recupero ideale. Sii ONESTO sui minuti che ha davvero impostato, questo è il riferimento:
sotto 60s il recupero è molto corto e il calo di prestazione è forte; 60-90s è corto per il lavoro pesante;
90-120s è adeguato per l'ipertrofia; 120-180s è abbondante; oltre 180s è recupero pieno, non gli manca nulla.
Puoi suggerire di allungare il recupero SOLO se quello impostato è davvero corto (sotto ~90 secondi) ed è
quello a limitarlo. Se è già 2 minuti o più NON dire che riposando di più farebbe di più: sarebbe falso,
con recuperi lunghi il limite non è il recupero ma il carico stesso. Con 5 minuti non nominare nemmeno
l'ipotesi di riposare di più.
ADATTAMENTO: se oggi ha GIÀ fatto delle serie su questo esercizio e sono andate sotto le attese (poche reps,
RPE altissimo), cambia strada per la serie dopo: proponi un carico realistico o una via alternativa, ma senza
rinunciare a progredire. Se invece le ha chiuse facili, alza.
PROGRESSIONE COL CONTESTO: giudica dal contesto, non dal peso nudo. Lo stesso esercizio fatto per ultimo, col
muscolo già affaticato, rende meno di quando era il primo: battere il PR-di-posizione conta come progresso.
Se il muscolo è già stato colpito, NOMINA l'esercizio che l'ha affaticato (es. "hai già fatto il rematore")
e dai comunque il carico con cui OGGI ottiene un progresso in quella condizione: mai un "vai tranquillo"
generico. Di' sempre il numero da provare, e aggiungi che se non lo regge faccia quel che riesce.
2) ${COME_SPIEGARE}`

const SYSTEM_PRIMA = `Sei il preparatore di CARICO. L'atleta NON ha mai registrato questo esercizio,
quindi non c'è storico da cui calcolare: stimi tu il peso di partenza da quello che sai dei suoi altri
carichi e record, dai rapporti tipici fra esercizi, dal peso corporeo e dalla prescrizione. Parti PRUDENTE:
la prima serie serve a tarare, sbagliare per difetto costa una serie facile, per eccesso un infortunio.
"kg" = il peso consigliato in chilogrammi.
${COME_SPIEGARE}`

/**
 * Peso proposto dall'IA. Due modi, a seconda che ci sia una base da correggere:
 * - base > 0 → il modello dà un DELTA percentuale, il peso lo calcola il codice (banda ±10)
 * - base = 0 → nessuno storico: il modello stima il peso, e lo clampiamo sotto `tetto`
 * In entrambi i casi il limite vive QUI e non nel prompt.
 */
export async function proponiPeso(apiKey: string, contesto: string, base: number, tetto: number): Promise<{ kg: number; delta: number | null; perche: string }> {
  const primaVolta = base <= 0
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: primaVolta ? SYSTEM_PRIMA : SYSTEM_PESO }] },
      contents: [{ role: 'user', parts: [{ text: contesto }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: primaVolta
          ? { type: 'object', properties: { kg: { type: 'number' }, perche: { type: 'string' } }, required: ['kg', 'perche'] }
          : { type: 'object', properties: { delta: { type: 'number' }, perche: { type: 'string' } }, required: ['delta', 'perche'] },
      },
    }),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => null) as { error?: { message?: string } } | null
    const msg = err?.error?.message ?? r.statusText
    if (r.status === 400 && /api key/i.test(msg)) throw new Error('Chiave API non valida: controllala in Profilo → ⚙ → Coach IA.')
    if (r.status === 429) throw new Error('Limite di richieste raggiunto: aspetta un minuto e riprova.')
    throw new Error('Errore del coach: ' + msg)
  }
  const j = await r.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const testo = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  let out: { delta?: unknown; kg?: unknown; perche?: unknown }
  try { out = JSON.parse(testo) } catch { throw new Error('Risposta del coach non leggibile: riprova.') }
  const perche = String(out.perche ?? '').slice(0, 500) // una spiegazione di 2-4 frasi, non una riga
  // I limiti vivono QUI e non nel prompt: un'istruzione si può ignorare, un Math.min no.
  const round25 = (x: number) => Math.round(x / 2.5) * 2.5
  if (primaVolta) {
    const k = Number(out.kg)
    if (!Number.isFinite(k) || k <= 0) throw new Error('Il coach non è riuscito a stimare un peso.')
    return { kg: round25(Math.max(2.5, Math.min(tetto, k))), delta: null, perche }
  }
  const d = Number(out.delta)
  const delta = Number.isFinite(d) ? Math.max(-BANDA_PESO, Math.min(BANDA_PESO, d)) : 0
  return { kg: round25(base * (1 + delta / 100)), delta, perche }
}

// Una chiamata al coach: storia della chat + contesto del momento. Gira il loop tool-use:
// Gemini chiama gli strumenti → noi eseguiamo le query → gli ridiamo i risultati → risposta finale.
export async function chiamaCoach(history: ChatMsg[], apiKey: string, contesto: string): Promise<string> {
  const contents: Content[] = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  for (let giro = 0; giro < 6; giro++) { // ponytail: max 6 giri di tool, poi ci si arrende
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM + '\n\nCONTESTO ATTUALE DELL\'ATLETA:\n' + contesto }] },
        contents,
        tools: TOOL_DECLS,
      }),
    })
    if (!r.ok) {
      const err = await r.json().catch(() => null) as { error?: { message?: string } } | null
      const msg = err?.error?.message ?? r.statusText
      if (r.status === 400 && /api key/i.test(msg)) throw new Error('Chiave API non valida: controllala in Profilo → ⚙ → Coach IA.')
      if (r.status === 429) throw new Error('Limite di richieste raggiunto: aspetta un minuto e riprova.')
      throw new Error('Errore del coach: ' + msg)
    }
    const j = await r.json() as { candidates?: { content?: Content }[] }
    const cand = j.candidates?.[0]?.content
    const calls = cand?.parts?.filter((p) => p.functionCall) ?? []
    if (!calls.length) {
      const testo = cand?.parts?.map((p) => p.text ?? '').join('')
      if (!testo) throw new Error('Il coach non ha risposto: riprova.')
      return testo.trim()
    }
    // Il modello vuole dei dati: eseguo le query e gliele restituisco, poi si ricomincia il giro
    contents.push(cand!)
    const parts: Part[] = []
    for (const c of calls) {
      const fc = c.functionCall!
      parts.push({ functionResponse: { name: fc.name, response: { result: await eseguiTool(fc.name, fc.args ?? {}) } } })
    }
    contents.push({ role: 'user', parts })
  }
  throw new Error('Troppi passaggi: riprova con una domanda più semplice.')
}
