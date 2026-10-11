import type { FillMode } from '@/domain/theme/types'

export const MODE_LABELS: Record<FillMode, string> = { default: '기본', color: '색상', image: '이미지' }

export function modeOptions<T extends FillMode>(modes: readonly T[]) {
  return modes.map((m) => ({ value: m, label: MODE_LABELS[m] }))
}
