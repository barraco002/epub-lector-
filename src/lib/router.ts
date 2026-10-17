import { signal } from '@preact/signals'

export type Route = { name: 'library' } | { name: 'reader'; bookId: string } | { name: 'stats' } | { name: 'settings' }

export const route = signal<Route>({ name: 'library' })

export function go(r: Route) {
  route.value = r
}

/**
 * Pila de "cosas que se cierran con Atrás" (paneles, menús, diálogos). El botón Atrás de Android
 * y la tecla Escape cierran primero lo último abierto; solo después cambian de pantalla.
 */
const closers: (() => void)[] = []

export function pushCloser(fn: () => void) {
  closers.push(fn)
  return () => {
    const i = closers.lastIndexOf(fn)
    if (i >= 0) closers.splice(i, 1)
  }
}

/** Devuelve true si gestionó el "atrás". */
export function back(): boolean {
  const fn = closers.pop()
  if (fn) {
    fn()
    return true
  }
  if (route.value.name !== 'library') {
    go({ name: 'library' })
    return true
  }
  return false
}
