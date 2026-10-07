import { useEffect, useRef } from 'react'
import { useLocation, useNavigation } from 'react-router'

/** Move o foco para um elemento que normalmente não é focável (título ou conteúdo) sem rolar a página. */
function focusProgrammatically(element: HTMLElement | null) {
  if (!element) return false
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1')
  element.focus({ preventScroll: true })
  return true
}

/**
 * Acessibilidade da navegação no cliente (a página inteira não recarrega, então o foco não volta sozinho):
 * 1. ao mudar de página, o foco vai para o título (`h1`) da nova página, que o leitor de tela anuncia;
 * 2. depois de enviar um formulário, o foco vai para o primeiro campo inválido (`aria-invalid`), se houver;
 * 3. enquanto uma página carrega, uma barra fina no topo e um aviso para leitor de tela ("Carregando…") mostram que
 *    a navegação está em andamento (os formulários já mostram "Aguarde…" no próprio botão, sem o aviso falado).
 * Mudar só a busca ou o hash da URL, e a primeira exibição, não mexem no foco.
 */
export function RouteA11y() {
  const { pathname } = useLocation()
  const navigation = useNavigation()
  const first = useRef(true)
  const submitted = useRef(false)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (window.location.hash) return
    focusProgrammatically(document.querySelector<HTMLElement>('h1') ?? document.querySelector<HTMLElement>('main'))
  }, [pathname])

  useEffect(() => {
    if (navigation.state !== 'idle') {
      if (navigation.formMethod) submitted.current = true
      return
    }
    if (!submitted.current) return
    submitted.current = false
    document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [navigation.state, navigation.formMethod])

  const busy = navigation.state !== 'idle'
  return (
    <>
      <div aria-live="polite" className="sr-only" data-testid="route-status">
        {navigation.state === 'loading' && !navigation.formMethod ? 'Carregando…' : ''}
      </div>
      {busy && <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-0.5 animate-pulse bg-[var(--accent)]" />}
    </>
  )
}
