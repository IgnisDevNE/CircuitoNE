import { useRef } from 'react'
import { cx } from '../../lib/utils'

/** Tiny, safe markdown renderer (headings, bold, italic, lists, links). */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--accent-text)] underline">$1</a>')

  const lines = source.split('\n')
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (/^#\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h3 class="font-display text-xl font-bold mt-4 mb-2">${inline(line.replace(/^#\s/, ''))}</h3>`)
    } else if (/^##\s/.test(line)) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h4 class="font-display text-lg font-bold mt-3 mb-1">${inline(line.replace(/^##\s/, ''))}</h4>`)
    } else if (/^[-*]\s/.test(line)) {
      if (!inList) { out.push('<ul class="list-disc pl-5 space-y-1">'); inList = true }
      out.push(`<li>${inline(line.replace(/^[-*]\s/, ''))}</li>`)
    } else if (line === '') {
      if (inList) { out.push('</ul>'); inList = false }
    } else {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<p class="mb-2 leading-relaxed">${inline(line)}</p>`)
    }
  }
  if (inList) out.push('</ul>')

  return <div className={cx('text-sm text-[var(--foreground)]', className)} dangerouslySetInnerHTML={{ __html: out.join('') }} />
}

/** Markdown editor with style buttons (WCAG: labelled toolbar buttons). */
export function MarkdownEditor({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const wrap = (before: string, after = before) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = value.slice(start, end) || 'texto'
    const next = value.slice(0, start) + before + sel + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, start + before.length + sel.length)
    })
  }
  const prefix = (p: string) => {
    const ta = ref.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    onChange(value.slice(0, lineStart) + p + value.slice(lineStart))
    requestAnimationFrame(() => ta.focus())
  }

  const btns: { label: string; title: string; action: () => void }[] = [
    { label: 'H1', title: 'Título', action: () => prefix('# ') },
    { label: 'H2', title: 'Subtítulo', action: () => prefix('## ') },
    { label: 'B', title: 'Negrito', action: () => wrap('**') },
    { label: 'I', title: 'Itálico', action: () => wrap('*') },
    { label: '•', title: 'Lista', action: () => prefix('- ') },
    { label: '🔗', title: 'Link', action: () => wrap('[', '](https://)') },
  ]

  return (
    <div className="border border-[var(--color-line)]">
      <div role="toolbar" aria-label="Formatação" className="flex flex-wrap gap-1 border-b border-[var(--color-line)] bg-[var(--color-bg-elev)] p-1">
        {btns.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            aria-label={b.title}
            onClick={b.action}
            className="min-w-8 border border-[var(--color-line)] px-2 py-1 font-mono text-xs hover:border-[var(--accent)] hover:text-[var(--accent-text)]"
          >
            {b.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-40 w-full resize-y bg-[var(--color-bg-elev)] p-3 font-mono text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
        placeholder="Descreva o evento… use os botões acima para formatar (markdown)"
      />
    </div>
  )
}
