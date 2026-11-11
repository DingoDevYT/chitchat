// Raw database/network errors reworded for toasts. Anything unrecognised passes through unchanged.
const RAW = [
  [/row-level security|permission denied|^not allowed\b/i, "You don't have permission to do that."],
  [/failed to fetch|networkerror|load failed|fetch failed/i, "Couldn't reach Chitchat. Check your connection."],
  [/jwt expired|invalid jwt|refresh token/i, 'You were signed out. Please sign in again.'],
  [/duplicate key value/i, 'That already exists.'],
  [/violates foreign key constraint|^(message|user) not found$/i, "That isn't there any more."],
]

export function friendly(text) {
  const s = String(text ?? '')
  const hit = RAW.find(([re]) => re.test(s.replace(/^[A-Z][^:]{0,30}: /, '')))
  if (!hit) return s
  const lead = s.match(/^[A-Z][^:]{0,30}: /) // keep a short lead-in like "Message failed: "
  return (lead ? lead[0] : '') + hit[1]
}
