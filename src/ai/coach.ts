// Chat col coach IA: chiamata REST diretta a Gemini con la chiave DELL'UTENTE (BYOK).
// Niente SDK (bundle piccolo, zero dipendenze) e niente proxy: la chiave è dell'utente,
// i dati che leggerà passano da Supabase che è già protetto per-utente dall'RLS.
// Tool use: Gemini può chiamare gli strumenti (src/data/tools.ts) per leggere i dati REALI
// dal database — storico con recuperi misurati, seduta in corso, check-in, nutrizione.
import { TOOL_DECLS, eseguiTool } from '../data/tools'
import { postGemini } from './gemini'
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
Oltre agli strumenti pronti hai "interroga_db", con cui leggi QUALSIASI tabella qui sotto: incrocia, conta e
confronta quanto ti serve, anche con più query di seguito. Non rispondere mai "non ho questo dato" senza
averlo cercato. Le righe che vedi sono già solo quelle di questo atleta.

SCHEMA DEL DATABASE:
- serie(id, sessione_id, esercizio, ordine, peso, reps, rpe, recupero_sec, ts) — ogni serie eseguita.
  ordine = numero progressivo della serie nella seduta; recupero_sec = riposo REALE prima di quella serie.
- sessione(id, inizio, fine, nota) — un allenamento. La durata è fine meno inizio.
- checkin(data, sonno, energia, doms, stress, ore) — voti 1-10 più le ore dormite.
- pasto(data, tipo, nome, kcal, prot, carbo, grassi, grammi) — un alimento per riga.
- peso_corporeo(data, kg) · acqua(data, ml, totale del giorno)
- fase(tipo, data_inizio, data_fine, kcal_target) — carica, scarico o mantenimento; data_fine nulla = in corso.
- nota_coach(ts, testo, tag) — osservazioni che TU hai salvato su di lui.
- config(dati) — blob unico con schede, giorni, esercizi, obiettivi, record dichiarati e impostazioni.
Il campo rec_sec è il recupero REALE misurato in secondi prima della serie: pesalo nelle proposte
(un recupero tagliato = meno carico; guarda anche come l'atleta ha risposto storicamente ai recuperi corti).
Considera l'ordine (n) e i muscoli già colpiti nella seduta di oggi quando consigli il carico.
Se ti mancano dati per rispondere bene, dillo chiaramente e spiega cosa registrare nell'app.
Non sei un medico: su infortuni e dolori rimanda a un professionista, senza fare diagnosi.`

// ===== Calorie bruciate =====
// La formula in coach.ts usa un MET fisso: un'ora di squat pesanti e un'ora di curl leggeri
// danno lo stesso numero. Qui il modello guarda cosa hai fatto davvero. UNA chiamata a fine
// seduta, in sottofondo: l'app intanto mostra già il valore della formula.
const SYSTEM_KCAL = `Sei un fisiologo dello sport. Ti do i dati di UNA seduta di pesi appena finita.
Stima le calorie totali bruciate durante la seduta (solo l'attività, NON il metabolismo basale).
Pesa: durata e peso corporeo, quanto carico è stato spostato, quante serie, quali gruppi muscolari
(le gambe costano molto più delle braccia), lo sforzo percepito e i recuperi (recuperi lunghi =
meno dispendio a parità di tempo).
Rispondi SOLO con il numero: "kcal", intero, senza spiegazioni.`

export async function calorieBruciate(apiKey: string, contesto: string): Promise<number> {
  const j = await postGemini(apiKey, {
    systemInstruction: { parts: [{ text: SYSTEM_KCAL }] },
    contents: [{ role: 'user', parts: [{ text: contesto }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'object', properties: { kcal: { type: 'number' } }, required: ['kcal'] },
    },
  })
  const testo = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  const n = Number((JSON.parse(testo) as { kcal?: unknown }).kcal)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

// Una chiamata al coach: storia della chat + contesto del momento. Gira il loop tool-use:
// Gemini chiama gli strumenti → noi eseguiamo le query → gli ridiamo i risultati → risposta finale.
export async function chiamaCoach(history: ChatMsg[], apiKey: string, contesto: string): Promise<string> {
  const contents: Content[] = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }))
  // 6 giri erano pochi: con una domanda vera il coach incrocia più tabelle e si arrendeva
  // a metà ragionamento. Il tetto resta solo per non girare all'infinito su un modello confuso.
  for (let giro = 0; giro < 16; giro++) {
    const j = await postGemini(apiKey, {
      systemInstruction: { parts: [{ text: SYSTEM + '\n\nCONTESTO ATTUALE DELL\'ATLETA:\n' + contesto }] },
      contents,
      tools: TOOL_DECLS,
    }) as { candidates?: { content?: Content }[] }
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
  throw new Error('Il coach si è perso fra troppe query. Riprova: di solito al secondo tentativo ci arriva.')
}
