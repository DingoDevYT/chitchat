import { createClient } from '@supabase/supabase-js'

// Publishable key: safe in the browser, every table is protected by row-level security.
export const SUPABASE_URL = 'https://nilludyavkfqwastghmw.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_CAuniw35Mm_AqfpqtIPRww_Da-atvAC'
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce' } })

// A fresh topic per subscription: channel(name) hands back a same-named channel that is still closing (hot reload, quick
// remounts), and adding postgres_changes to an already-subscribed channel throws. postgres_changes-only channels: the
// private broadcast/presence topics (chat, calls, voice, online) are checked by name in their policies, so keep those fixed.
export const freshChannel = name => supabase.channel(`${name}:${crypto.randomUUID()}`)
