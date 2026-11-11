import { createClient } from '@supabase/supabase-js'

// Publishable key: safe in the browser, every table is protected by row-level security.
export const SUPABASE_URL = 'https://nilludyavkfqwastghmw.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_CAuniw35Mm_AqfpqtIPRww_Da-atvAC'
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce' } })
