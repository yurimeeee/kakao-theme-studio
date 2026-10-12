/** Copies text; falls back to selecting `fallbackInput` and execCommand when the Clipboard API is unavailable. */
export async function copyText(text: string, fallbackInput?: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    if (!fallbackInput) return false
    fallbackInput.select()
    return document.execCommand('copy')
  }
}
