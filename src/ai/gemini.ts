// Unico punto che parla via REST con Gemini. Con i ritentativi sugli errori TRANSITORI:
// "this model is currently experiencing high demand" è un 503 lato Google (modello sovraccarico),
// non un bug nostro — e quasi sempre passa ritentando fra un attimo. Prima lo sbattevamo grezzo
// in faccia all'utente al primo colpo.
import { MODEL } from './model'

const endpoint = (apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

const attesa = (ms: number) => new Promise((r) => setTimeout(r, ms))

type GeminiResp = { candidates?: { content?: { parts?: { text?: string; functionCall?: unknown }[]; role?: string } }[] }

/** POST a Gemini con backoff sugli errori transitori. Ritorna il JSON della risposta o lancia un errore in italiano. */
export async function postGemini(apiKey: string, body: unknown): Promise<GeminiResp> {
  for (let tent = 0; ; tent++) {
    const r = await fetch(endpoint(apiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (r.ok) return await r.json() as GeminiResp
    const err = await r.json().catch(() => null) as { error?: { message?: string } } | null
    const msg = err?.error?.message ?? r.statusText
    if (r.status === 400 && /api key/i.test(msg)) throw new Error('Chiave API non valida: controllala in Profilo → ⚙ → Coach IA.')
    if (r.status === 429) throw new Error('Hai finito la quota di richieste per ora. Riprova più tardi.')
    // 503/500 o messaggi di sovraccarico = transitorio: ritento con attesa crescente
    const transiente = r.status === 503 || r.status === 500 || /overload|high demand|try again|temporar|unavailable/i.test(msg)
    if (!transiente || tent >= 3) {
      if (transiente) throw new Error('Il modello è sovraccarico in questo momento. Riprova fra qualche secondo.')
      throw new Error('Errore del coach: ' + msg)
    }
    await attesa(500 * 2 ** tent) // 0.5s · 1s · 2s
  }
}
