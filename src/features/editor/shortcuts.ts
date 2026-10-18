import { useEffect } from 'react'

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export const KEYS = {
  undo: isMac ? ['⌘', 'Z'] : ['Ctrl', 'Z'],
  redo: isMac ? ['⇧', '⌘', 'Z'] : ['Ctrl', 'Y'],
}
const keyLabel = (keys: string[]) => (isMac ? keys.join('') : keys.join('+'))
export const UNDO_LABEL = `실행 취소 (${keyLabel(KEYS.undo)})`
export const REDO_LABEL = `다시 실행 (${keyLabel(KEYS.redo)})`
export const HELP_LABEL = '단축키와 조작법 (?)'

/** Text fields keep the browser's own keys (undo, typing "?"). */
export function editsText(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true
  return target instanceof HTMLInputElement && !['range', 'color', 'radio', 'checkbox', 'button', 'file'].includes(target.type)
}

/** `?` opens the help, unless the user is typing or another dialog is open. */
export function useHelpShortcut(enabled: boolean, onOpen: () => void) {
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented || editsText(e.target)) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      onOpen()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, onOpen])
}
