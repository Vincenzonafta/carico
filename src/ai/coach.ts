// Chat col coach IA: chiamata REST diretta a Gemini con la chiave DELL'UTENTE (BYOK).
// Niente SDK (bundle piccolo, zero dipendenze) e niente proxy: la chiave è dell'utente,
// i dati che leggerà passano da Supabase che è già protetto per-utente dall'RLS.
export type ChatMsg = { role: 'user' | 'model'; text: string }

const MODEL = 'gemini-2.5-flash'

const SYSTEM = `Sei il coach di CARICO, un'app italiana di allenamento in palestra e nutrizione.
Sei un preparatore esperto: allenamento coi pesi (ipertrofia e forza), programmazione, recupero, alimentazione sportiva.
Parli italiano, tono diretto e concreto, da coach in palestra: frasi brevi, niente giri di parole, dai numeri quando servono.
Rispondi in testo semplice, NIENTE markdown (no asterischi, no elenchi con trattini: usa frasi o "1) 2) 3)").
Se ti mancano dati per rispondere bene, dillo chiaramente e spiega cosa registrare nell'app.
Non sei un medico: su infortuni e dolori rimanda a un professionista, senza fare diagnosi.`

// Una chiamata al coach: storia della chat + contesto del momento (letto dall'app dallo stato locale).
export async function chiamaCoach(history: ChatMsg[], apiKey: string, contesto: string): Promise<string> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM + '\n\nCONTESTO ATTUALE DELL\'ATLETA:\n' + contesto }] },
      contents: history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
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
  const testo = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!testo) throw new Error('Il coach non ha risposto: riprova.')
  return testo.trim()
}
