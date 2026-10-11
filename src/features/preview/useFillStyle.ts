import type { CSSProperties } from 'react'
import { useAssetUrl } from '@/assets/useAssetUrl'
import type { ResolvedFill } from '@/domain/theme/resolve'

export function useFillStyle(fill: ResolvedFill): CSSProperties {
  const url = useAssetUrl(fill.imageAssetId)
  return {
    backgroundColor: fill.color,
    backgroundImage: url ? `url("${url}")` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center top',
  }
}
