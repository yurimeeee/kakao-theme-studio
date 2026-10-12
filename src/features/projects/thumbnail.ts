import { resolveThemeCached } from '@/domain/theme/resolve'
import type { AssetId, ThemeConfig } from '@/domain/theme/types'
import { drawThemeIcon } from '@/exporters/ktheme/draw'
import { BrowserRasterizer } from '@/exporters/ktheme/raster'

const SIZE = 128

export interface ThumbnailSource {
  blob: Blob
  width: number
  height: number
}

/** Everything the thumbnail depends on; equal keys draw identical thumbnails. */
export function thumbnailKey(config: ThemeConfig): string {
  const theme = resolveThemeCached(config)
  return [theme.chatroom.background.color, theme.chatroom.background.imageAssetId, theme.bubbles.receive.color, theme.bubbles.send.color].join('|')
}

/** Small list thumbnail rendered from the same resolved model as the preview/export. */
export async function renderThumbnail(config: ThemeConfig, assets: ReadonlyMap<AssetId, ThumbnailSource>): Promise<Blob> {
  const theme = resolveThemeCached(config)
  const raster = new BrowserRasterizer()
  const bgId = theme.chatroom.background.imageAssetId
  const source = bgId ? assets.get(bgId) : undefined
  // Decode the background already shrunk to cover the thumbnail (never upscaled), not at full size.
  const scale = source ? Math.min(1, Math.max(SIZE / source.width, SIZE / source.height)) : 1
  const bg = source
    ? await raster.decode(source.blob, { resize: { width: source.width * scale, height: source.height * scale } }).catch(() => null)
    : null
  try {
    const surface = raster.surface(SIZE, SIZE)
    drawThemeIcon(surface.ctx, SIZE, { background: theme.chatroom.background.color, receive: theme.bubbles.receive.color, send: theme.bubbles.send.color }, bg)
    return await surface.toPng()
  } finally {
    bg?.close()
  }
}
