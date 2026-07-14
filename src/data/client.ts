// Unico punto dell'app che conosce Supabase.
// Senza chiavi in .env.local supa è null e l'app resta identica a prima: solo locale.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supa = url && key ? createClient(url, key) : null
