// Chat col coach IA: chiamata REST diretta a Gemini con la chiave DELL'UTENTE (BYOK).
// Niente SDK (bundle piccolo, zero dipendenze) e niente proxy: la chiave è dell'utente,
// i dati che leggerà passano da Supabase che è già protetto per-utente dall'RLS.
// Tool use: Gemini può chiamare gli strumenti (src/data/tools.ts) per leggere i dati REALI
// dal database — storico con recuperi misurati, seduta in corso, check-in, nutrizione.
import { TOOL_DECLS, eseguiTool } from '../data/tools'

export type ChatMsg = { role: 'user' | 'model'; text: string }
type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }
type Content = { role: string; parts: Part[] }

const MODEL = 'gemini-2.5-flash'

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

const SYSTEM_PESO = `Sei il preparatore di CARICO. Ti do il peso che l'aritmetica ha già calcolato
(massimale stimato per la percentuale corrispondente all'RPE prescritto) e il contesto della giornata.
Il tuo compito è UNO SOLO: dire di quanto va corretto, in percentuale, e perché.
"delta" = numero da -${BANDA_PESO} a ${BANDA_PESO}. Zero significa che va bene così, ed è la risposta giusta
tutte le volte che non hai motivi solidi per cambiare: non inventare aggiustamenti per sembrare utile.
Pesa: readiness (sonno, energia, DOMS, stress), muscoli già allenati oggi e posizione nella seduta,
recupero reale fra le serie, andamento recente dell'RPE sullo stesso esercizio.
"perche" = UNA riga in italiano, concreta, massimo 90 caratteri, senza markdown.`

const SYSTEM_PRIMA = `Sei il preparatore di CARICO. L'atleta NON ha mai registrato questo esercizio,
quindi non c'è uno storico da cui calcolare: devi stimare tu il peso di partenza.
Usa quello che sai dei suoi altri carichi, dei rapporti tipici fra esercizi, del suo peso corporeo
e della prescrizione (ripetizioni e RPE). Meglio partire PRUDENTI: la prima serie serve a tarare,
e sbagliare per difetto costa una serie facile, per eccesso costa un infortunio.
"kg" = il peso consigliato, numero in chilogrammi.
"perche" = UNA riga in italiano, concreta, massimo 90 caratteri, che dica da cosa l'hai dedotto. Niente markdown.`

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
  const perche = String(out.perche ?? '').slice(0, 140)
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
