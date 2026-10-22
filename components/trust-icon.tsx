import { Banknote, Check, MessageCircle, RotateCcw, ShieldCheck, Truck } from 'lucide-react'
import { trustIconKind } from '@/lib/trust-icon'

const ICONS = { truck: Truck, cash: Banknote, return: RotateCcw, chat: MessageCircle, shield: ShieldCheck, check: Check }

// Decorative: the words next to it say the same thing, so it is hidden from screen readers.
export default function TrustIcon({ title, text }: { title?: string | null; text?: string | null }) {
  const Icon = ICONS[trustIconKind(title, text)]
  return <span className="aliTrustIcon" aria-hidden="true"><Icon size={20} strokeWidth={2} /></span>
}
