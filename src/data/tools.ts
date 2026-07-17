// Strumenti del coach IA: query sui dati REALI (Supabase, già limitato all'utente dall'RLS).
// Ogni tool torna JSON compatto (token-friendly). Gemini decide da solo quando chiamarli.
import { supa } from './client'

export const TOOL_DECLS = [{
  functionDeclarations: [
    {
      name: 'storico_esercizio',
      description: "Storico delle serie passate di un esercizio: data, ordine nella seduta, kg, reps, RPE e recupero REALE in secondi (rec_sec) misurato prima della serie. Fondamentale per proporre carichi e capire come l'atleta risponde ai recuperi corti.",
      parameters: { type: 'object', properties: {
        esercizio: { type: 'string', description: "nome anche parziale dell'esercizio, es. 'rematore'" },
        settimane: { type: 'number', description: 'quante settimane indietro, default 8' },
      }, required: ['esercizio'] },
    },
    {
      name: 'sessione_di_oggi',
      description: "Le serie fatte OGGI in ordine cronologico con orario e recuperi reali: per sapere cosa l'atleta ha già fatto ora (muscoli già affaticati, recuperi tagliati) prima di consigliare.",
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'checkin_recenti',
      description: 'Check-in giornalieri recenti: sonno (voto 1-10 e ore dormite), energia, DOMS (indolenzimento), stress.',
      parameters: { type: 'object', properties: { giorni: { type: 'number', description: 'default 7' } } },
    },
    {
      name: 'nutrizione_recente',
      description: 'Totali giornalieri recenti di kcal, proteine, carboidrati e grassi consumati.',
      parameters: { type: 'object', properties: { giorni: { type: 'number', description: 'default 3' } } },
    },
  ],
}]

export async function eseguiTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (!supa) return { errore: 'cloud non configurato' }
  const uid = (await supa.auth.getSession()).data.session?.user.id
  if (!uid) return { errore: 'utente non autenticato' }
  try {
    switch (name) {
      case 'storico_esercizio': {
        const sett = Math.min(26, Number(args.settimane) || 8)
        const since = new Date(Date.now() - sett * 7 * 86400_000).toISOString()
        const q = await supa.from('serie').select('esercizio,ordine,peso,reps,rpe,recupero_sec,ts')
          .eq('utente_id', uid).ilike('esercizio', `%${String(args.esercizio ?? '').trim()}%`)
          .gte('ts', since).order('ts', { ascending: true }).limit(400)
        if (q.error) return { errore: q.error.message }
        return (q.data ?? []).map((r) => ({
          data: String(r.ts).slice(0, 10), ex: r.esercizio, n: r.ordine,
          kg: Number(r.peso), reps: r.reps, rpe: r.rpe, rec_sec: r.recupero_sec,
        }))
      }
      case 'sessione_di_oggi': {
        const inizio = new Date(); inizio.setHours(0, 0, 0, 0)
        const q = await supa.from('serie').select('esercizio,ordine,peso,reps,rpe,recupero_sec,ts')
          .eq('utente_id', uid).gte('ts', inizio.toISOString()).order('ts', { ascending: true })
        if (q.error) return { errore: q.error.message }
        return (q.data ?? []).map((r) => ({
          ora: String(r.ts).slice(11, 16), n: r.ordine, ex: r.esercizio,
          kg: Number(r.peso), reps: r.reps, rpe: r.rpe, rec_sec: r.recupero_sec,
        }))
      }
      case 'checkin_recenti': {
        const gg = Math.min(60, Number(args.giorni) || 7)
        const since = new Date(Date.now() - gg * 86400_000).toISOString().slice(0, 10)
        const q = await supa.from('checkin').select('data,sonno,ore,energia,doms,stress')
          .eq('utente_id', uid).gte('data', since).order('data', { ascending: true })
        return q.error ? { errore: q.error.message } : q.data
      }
      case 'nutrizione_recente': {
        const gg = Math.min(30, Number(args.giorni) || 3)
        const since = new Date(Date.now() - gg * 86400_000).toISOString().slice(0, 10)
        const q = await supa.from('pasto').select('data,kcal,prot,carbo,grassi').eq('utente_id', uid).gte('data', since)
        if (q.error) return { errore: q.error.message }
        const per: Record<string, { kcal: number; prot: number; carbo: number; grassi: number }> = {}
        for (const p of q.data ?? []) {
          const t = (per[p.data] ??= { kcal: 0, prot: 0, carbo: 0, grassi: 0 })
          t.kcal += p.kcal ?? 0; t.prot += Number(p.prot ?? 0); t.carbo += Number(p.carbo ?? 0); t.grassi += Number(p.grassi ?? 0)
        }
        return Object.entries(per).sort().map(([data, t]) => ({ data, kcal: Math.round(t.kcal), prot: Math.round(t.prot), carbo: Math.round(t.carbo), grassi: Math.round(t.grassi) }))
      }
    }
    return { errore: 'tool sconosciuto: ' + name }
  } catch (e) {
    return { errore: (e as Error).message }
  }
}
