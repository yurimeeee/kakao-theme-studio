const time = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' })
const date = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' })

export function formatSavedTime(ms: number): string {
  return time.format(ms)
}

/** "오늘 수정 · 오후 2:14" / "10월 9일 수정" */
export function formatModified(ms: number, now = Date.now()): string {
  const d = new Date(ms)
  const n = new Date(now)
  const sameDay = d.toDateString() === n.toDateString()
  return sameDay ? `오늘 ${time.format(ms)} 수정` : `${date.format(ms)} 수정`
}
