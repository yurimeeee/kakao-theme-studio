import { useSyncExternalStore } from 'react'

export type Route = { name: 'editor'; projectId: string | null } | { name: 'projects' }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  if (path === '/projects') return { name: 'projects' }
  const m = /^\/editor\/([A-Za-z0-9_]+)$/.exec(path)
  if (m) return { name: 'editor', projectId: m[1] }
  return { name: 'editor', projectId: null }
}

export const editorHref = (id: string | null) => (id ? `#/editor/${id}` : '#/editor')
export const projectsHref = '#/projects'

export function navigate(href: string, replace = false): void {
  if (replace) {
    history.replaceState(null, '', href)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = href.replace(/^#/, '')
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  return parseHash(hash)
}
