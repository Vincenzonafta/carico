// Chat col coach IA: chiamata REST diretta a Gemini con la chiave DELL'UTENTE (BYOK).
// Niente SDK (bundle piccolo, zero dipendenze) e niente proxy: la chiave è dell'utente,
// i dati che leggerà passano da Supabase che è già protetto per-utente dall'RLS.
// Tool use: Gemini può chiamare gli strumenti (src/data/tools.ts) per leggere i dati REALI
// dal database — storico con recuperi misurati, seduta in corso, check-in, nutrizione.
import { TOOL_DECLS, eseguiTool } from '../data/tools'

export type ChatMsg = { role: 'user' | 'model'; text: string }
type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: unknown } }
type Content = { role: string; parts: Part[] }

const MODEL = 'gemini-3.5-flash'

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
