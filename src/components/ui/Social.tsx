import type { SocialLinks } from '../../data/types'

const LABELS: Record<keyof SocialLinks, string> = {
  instagram: 'Instagram',
  soundcloud: 'SoundCloud',
  bandcamp: 'Bandcamp',
  facebook: 'Facebook',
  youtube: 'YouTube',
  site: 'Site',
}

function href(key: keyof SocialLinks, val: string) {
  if (val.startsWith('http')) return val
  const handle = val.replace(/^@/, '')
  switch (key) {
    case 'instagram': return `https://instagram.com/${handle}`
    case 'soundcloud': return `https://soundcloud.com/${handle}`
    case 'bandcamp': return `https://${handle}.bandcamp.com`
    case 'facebook': return `https://facebook.com/${handle}`
    case 'youtube': return `https://youtube.com/@${handle}`
    default: return `https://${handle}`
  }
}

export function Social({ links }: { links: SocialLinks }) {
  const entries = (Object.entries(links) as [keyof SocialLinks, string][]).filter(([, v]) => v)
  if (!entries.length) return null
  return (
    <ul className="flex flex-wrap gap-2">
      {entries.map(([k, v]) => (
        <li key={k}>
          <a
            href={href(k, v)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-[var(--color-line)] px-2.5 py-1 font-mono text-xs text-[var(--color-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
          >
            <span aria-hidden className="text-[var(--accent-text)]">↗</span>
            {LABELS[k]}
            <span className="sr-only"> (abre em nova aba)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
