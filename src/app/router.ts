import { useSyncExternalStore } from 'react'

export type Route =
  | { name: 'editor'; projectId: string | null }
  | { name: 'projects'; tab: 'local' | 'cloud' }
  | { name: 'gallery' }
  | { name: 'share'; shareId: string }

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '')
  if (path === '/projects') return { name: 'projects', tab: 'local' }
  if (path === '/projects/cloud') return { name: 'projects', tab: 'cloud' }
  if (path === '/gallery') return { name: 'gallery' }
  const share = /^\/t\/([A-Za-z0-9]{1,64})$/.exec(path)
  if (share) return { name: 'share', shareId: share[1] }
  const m = /^\/editor\/([A-Za-z0-9_]+)$/.exec(path)
  if (m) return { name: 'editor', projectId: m[1] }
  return { name: 'editor', projectId: null }
}

export const editorHref = (id: string | null) => (id ? `#/editor/${id}` : '#/editor')
export const projectsHref = '#/projects'
export const cloudProjectsHref = '#/projects/cloud'
export const galleryHref = '#/gallery'
export const shareHref = (shareId: string) => `#/t/${shareId}`

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
