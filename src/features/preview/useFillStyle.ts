import type { CSSProperties } from 'react'
import { useAssetSize, useAssetUrl } from '@/assets/useAssetUrl'
import type { ResolvedFill } from '@/domain/theme/resolve'
import { focusedBackground } from './focus'

/** `frame`: size of the element being filled, for zoomed crops. */
export function useFillStyle(fill: ResolvedFill, frame: { w: number; h: number }): CSSProperties {
  const url = useAssetUrl(fill.imageAssetId)
  const size = useAssetSize(fill.imageAssetId)
  return {
    backgroundColor: fill.color,
    backgroundImage: url ? `url("${url}")` : undefined,
    ...focusedBackground(fill.focus, size, frame),
  }
}
