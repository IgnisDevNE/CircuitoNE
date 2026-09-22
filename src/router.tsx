import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type MouseEvent,
} from 'react'

// Minimal dependency-free client router (history API based).

type RouterState = {
  path: string
  navigate: (to: string, opts?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterState | null>(null)
const ParamsContext = createContext<Record<string, string>>({})

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => window.location.pathname || '/')

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    if (to === window.location.pathname + window.location.search + window.location.hash) return
    if (opts?.replace) window.history.replaceState({}, '', to)
    else window.history.pushState({}, '', to)
    setPath(window.location.pathname)
    window.scrollTo(0, 0)
  }, [])

  const value = useMemo(() => ({ path, navigate }), [path, navigate])
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter() {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRouter must be used within RouterProvider')
  return ctx
}

export function useNavigate() {
  return useRouter().navigate
}

export function useLocation() {
  return { pathname: useRouter().path }
}

export function useParams() {
  return useContext(ParamsContext)
}

// Match a pattern like /artistas/:id against a concrete path.
function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean)
  const cp = path.split('/').filter(Boolean)
  const wildcard = pattern.endsWith('/*')
  if (!wildcard && pp.length !== cp.length) return null
  if (wildcard && cp.length < pp.length - 1) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < pp.length; i++) {
    const seg = pp[i]
    if (seg === '*') break
    if (seg.startsWith(':')) {
      try {
        params[seg.slice(1)] = decodeURIComponent(cp[i] ?? '')
      } catch {
        return null
      }
    }
    else if (seg !== cp[i]) return null
  }
  return params
}

export type RouteDef = { path: string; element: ReactNode }

export function Routes({ routes, notFound }: { routes: RouteDef[]; notFound?: ReactNode }) {
  const { path } = useRouter()
  for (const r of routes) {
    const params = matchPath(r.path, path)
    if (params) {
      return <ParamsContext.Provider value={params}>{r.element}</ParamsContext.Provider>
    }
  }
  return <>{notFound ?? null}</>
}

type LinkProps = {
  to: string
  children: ReactNode
  className?: string
  replace?: boolean
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>

export function Link({ to, children, className, replace, onClick, ...rest }: LinkProps) {
  const navigate = useNavigate()
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const anchor = e.currentTarget
    if ((anchor.target && anchor.target !== '_self') || anchor.hasAttribute('download')) return
    const url = new URL(anchor.href)
    if (url.origin !== window.location.origin || url.hash) return
    e.preventDefault()
    navigate(url.pathname + url.search, { replace })
  }
  return (
    <a href={to} className={className} onClick={handle} {...rest}>
      {children}
    </a>
  )
}

export function NavLink({
  to,
  children,
  className,
  activeClassName,
  end,
  ...rest
}: LinkProps & { activeClassName?: string; end?: boolean }) {
  const { path } = useRouter()
  const target = new URL(to, window.location.href)
  const active = target.origin === window.location.origin &&
    (end ? path === target.pathname : path === target.pathname || path.startsWith(target.pathname + '/'))
  return (
    <Link
      to={to}
      className={[className, active ? activeClassName : ''].filter(Boolean).join(' ')}
      aria-current={active ? 'page' : undefined}
      {...rest}
    >
      {children}
    </Link>
  )
}
