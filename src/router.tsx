import { useEffect, type ReactNode } from 'react'
import {
  BrowserRouter,
  Link as ReactRouterLink,
  NavLink as ReactRouterNavLink,
  Route,
  Routes as ReactRouterRoutes,
  useInRouterContext,
  useLocation as useReactRouterLocation,
  useNavigate,
  useParams as useReactRouterParams,
  type LinkProps as ReactRouterLinkProps,
  type NavLinkProps,
} from 'react-router'

export { useReactRouterLocation as useLocation, useNavigate }

export function useParams() {
  return useReactRouterParams() as Record<string, string>
}

function ScrollReset() {
  const { pathname, search } = useReactRouterLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname, search])
  return null
}

export function RouterProvider({ children }: { children: ReactNode }) {
  return useInRouterContext()
    ? <><ScrollReset />{children}</>
    : <BrowserRouter><ScrollReset />{children}</BrowserRouter>
}

export type RouteDef = { path: string; element: ReactNode }

export function Routes({ routes, notFound }: { routes: RouteDef[]; notFound?: ReactNode }) {
  const { pathname } = useReactRouterLocation()
  try {
    decodeURI(typeof window === 'undefined' ? pathname : window.location.pathname)
  } catch {
    return <>{notFound ?? null}</>
  }
  return (
    <ReactRouterRoutes>
      {routes.map(({ path, element }) => <Route key={path} path={path} element={element} />)}
      {notFound && <Route path="*" element={notFound} />}
    </ReactRouterRoutes>
  )
}

export function Link({ to, download, replace, ...props }: Omit<ReactRouterLinkProps, 'to'> & { to: string }) {
  if (download !== undefined || to.includes('#')) return <a href={to} download={download} {...props} />
  return <ReactRouterLink to={to} replace={replace} {...props} />
}

export function NavLink({
  className,
  activeClassName,
  ...props
}: Omit<NavLinkProps, 'className'> & { className?: string; activeClassName?: string }) {
  const target = typeof props.to === 'string' && typeof window !== 'undefined'
    ? new URL(props.to, window.location.href)
    : null
  const to = target && target.origin === window.location.origin
    ? `${target.pathname}${target.search}${target.hash}`
    : props.to
  return (
    <ReactRouterNavLink
      {...props}
      to={to}
      className={({ isActive }) => [className, isActive ? activeClassName : ''].filter(Boolean).join(' ')}
    />
  )
}
