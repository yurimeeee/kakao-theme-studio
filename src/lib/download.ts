/** Download file name: keeps Unicode (NFC), strips path/control characters. */
export function toSafeFileName(name: string, extension: string, fallback: string): string {
  const cleaned = name
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 60)
  return `${cleaned || fallback}${extension}`
}

/** Triggers a browser download. The object URL is revoked after a delay (iOS Safari needs time). */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

