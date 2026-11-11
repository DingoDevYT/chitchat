import { createClient } from '@supabase/supabase-js'

// Publishable key: safe in the browser, every table is protected by row-level security.
export const supabase = createClient(
  'https://nilludyavkfqwastghmw.supabase.co',
  'sb_publishable_CAuniw35Mm_AqfpqtIPRww_Da-atvAC',
  { auth: { flowType: 'pkce' } },
)
