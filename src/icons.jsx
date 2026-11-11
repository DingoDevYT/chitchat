// Small line icons (24px grid, currentColor) for messaging tools. No emoji as UI icons.
const icon = (paths, filled) => function Icon({ size = 18, fill = filled, ...p }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p}>{paths}</svg>
  )
}

export const StarIcon = icon(<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />)
export const MicIcon = icon(<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>)
export const TrashIcon = icon(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5h6V7" />)
export const SendIcon = icon(<path d="M4.5 12h13M12.5 6l6 6-6 6" />)
export const PlayIcon = icon(<path d="M8 5.5v13l10.5-6.5z" />, true)
export const PauseIcon = icon(<><rect x="6.5" y="5" width="3.5" height="14" rx="1" /><rect x="14" y="5" width="3.5" height="14" rx="1" /></>, true)
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />)
export const PollIcon = icon(<path d="M5 20V11M12 20V5M19 20v-6" />)
export const ClockIcon = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>)
export const ClipIcon = icon(<path d="M20 11.5l-7.8 7.8a5 5 0 0 1-7-7l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5" />)
export const ForwardIcon = icon(<path d="M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v1" />)
export const EyeOffIcon = icon(<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.6 3.8M6.2 6.6A13 13 0 0 0 2.5 12c1 2.5 4.5 7 9.5 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" />)
export const CloseIcon = icon(<path d="M6 6l12 12M18 6L6 18" />)
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />)
