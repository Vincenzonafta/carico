// Video su Supabase Storage (bucket privato "video", vedi db/storage.sql).
// Salviamo il PERCORSO del file, non un URL: i bucket privati non hanno link stabili,
// se ne chiede uno firmato al momento di guardare il video.
import { supa } from './client'
import { uuid } from './sync'

const BUCKET = 'video'
export const MAX_MB = 50 // uguale al file_size_limit del bucket: meglio dirlo prima di caricare

/** Carica il file e ritorna il percorso da salvare nello stato. */
export async function uploadVideo(file: File): Promise<string> {
  if (!supa) throw new Error('Per caricare i video serve l\'accesso al cloud.')
  const mb = file.size / 1048576
  if (mb > MAX_MB) throw new Error(`Video troppo pesante (${Math.round(mb)} MB), il limite è ${MAX_MB} MB. Taglia la clip e riprova.`)
  const { data: u } = await supa.auth.getUser()
  const uid = u.user?.id
  if (!uid) throw new Error('Devi essere connesso per caricare i video.')
  // la prima cartella DEVE essere l'id utente: è la condizione su cui si reggono le policy
  const ext = (file.name.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
  const path = `${uid}/${uuid()}.${ext}`
  const { error } = await supa.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'video/mp4' })
  if (error) throw new Error('Caricamento non riuscito: ' + error.message)
  return path
}

/** Percorso → link guardabile. I video incollati a mano come URL passano di qui intatti. */
export async function videoUrl(pathOrUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  if (!supa) throw new Error('Cloud non disponibile')
  const { data, error } = await supa.storage.from(BUCKET).createSignedUrl(pathOrUrl, 3600)
  if (error || !data) throw new Error('Video non disponibile')
  return data.signedUrl
}

/** Cancella il file. Best-effort: se fallisce resta un orfano, ma non blocchiamo l'utente. */
export async function deleteVideo(pathOrUrl: string) {
  if (!supa || /^https?:\/\//i.test(pathOrUrl)) return
  try { await supa.storage.from(BUCKET).remove([pathOrUrl]) } catch { /* orfano, pazienza */ }
}
