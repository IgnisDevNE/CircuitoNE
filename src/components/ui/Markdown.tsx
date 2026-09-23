import { useRef } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import { cx } from '../../lib/utils'

const components: Components = {
  h1: ({ children }) => <h3 className="font-display text-xl font-bold mt-4 mb-2">{children}</h3>,
  h2: ({ children }) => <h4 className="font-display text-lg font-bold mt-3 mb-1">{children}</h4>,
  p: ({ children }) => <p className="mb-2 leading-relaxed whitespace-pre-line">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
  a: ({ href, children }) => {
    if (!href || !URL.canParse(href) || !['http:', 'https:'].includes(new URL(href).protocol)) return <>{children}</>
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-text)] underline">{children}</a>
  },
}

/** Only text and the formats offered by the editor reach the DOM. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cx('text-sm text-[var(--foreground)]', className)}>
      <ReactMarkdown skipHtml allowedElements={['h1', 'h2', 'p', 'ul', 'li', 'strong', 'em', 'a', 'br']} unwrapDisallowed components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
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
