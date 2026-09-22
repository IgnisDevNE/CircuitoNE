import { useEffect } from 'react'

/** WCAG 2.4.2 — unique, descriptive page title per route. */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · CIRCUITO NE`
  }, [title])
}
