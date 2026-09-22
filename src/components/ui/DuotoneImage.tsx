import { cx } from '../../lib/utils'

/** Image with an accent-tinted tonal overlay + optional scanlines to fit the CRT aesthetic. */
export function DuotoneImage({
  src,
  alt,
  className,
  scan = true,
}: {
  src: string
  alt: string
  className?: string
  scan?: boolean
}) {
  return (
    <span className={cx('relative block overflow-hidden bg-[var(--color-bg-elev)]', scan && 'scanlines', className)}>
      <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover opacity-90 mix-blend-luminosity" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--accent) 40%, transparent), transparent 55%), linear-gradient(0deg, rgba(5,5,6,0.85), rgba(5,5,6,0.1))',
        }}
      />
    </span>
  )
}
