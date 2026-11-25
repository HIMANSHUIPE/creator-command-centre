// Simple outline glyphs for the two platforms (lucide-react no longer ships brand icons).
type P = { size?: number; className?: string; strokeWidth?: number }
export function Instagram({ size = 24, className, strokeWidth = 2 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
    </svg>
  )
}
export function Youtube({ size = 24, className, strokeWidth = 2 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="4" /><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" />
    </svg>
  )
}
