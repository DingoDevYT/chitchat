// Messaging tool icons, drawn by the shared Chitchat doodle set (src/icons). No emoji as UI icons.
// The set is outline-only, so `fill` is ignored: toggled state shows through colour instead (e.g. .fav-star.on).
import Icon from './icons/Icon'

const icon = name => function DoodleIcon({ size = 18 }) { return <Icon name={name} size={size} /> }

export const StarIcon = icon('star')
export const MicIcon = icon('mic')
export const TrashIcon = icon('trash')
export const SendIcon = icon('send')
export const PlayIcon = icon('play')
export const PauseIcon = icon('pause')
export const PlusIcon = icon('plus')
export const PollIcon = icon('poll')
export const ClockIcon = icon('clock')
export const ClipIcon = icon('paperclip')
export const ForwardIcon = icon('forward')
export const EyeOffIcon = icon('eye-off')
export const CloseIcon = icon('close')
export const CheckIcon = icon('check')
