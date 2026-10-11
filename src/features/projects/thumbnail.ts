import { resolveTheme } from '@/domain/theme/resolve'
import type { AssetId, ThemeConfig } from '@/domain/theme/types'
import { drawThemeIcon } from '@/exporters/ktheme/draw'
import { BrowserRasterizer } from '@/exporters/ktheme/raster'

const SIZE = 128

/** Small list thumbnail rendered from the same resolved model as the preview/export. */
export async function renderThumbnail(config: ThemeConfig, blobs: ReadonlyMap<AssetId, { blob: Blob }>): Promise<Blob> {
  const theme = resolveTheme(config)
  const raster = new BrowserRasterizer()
  const bgId = theme.chatroom.background.imageAssetId
  const bgBlob = bgId ? blobs.get(bgId)?.blob : undefined
  const bg = bgBlob ? await raster.decode(bgBlob).catch(() => null) : null
  try {
    const surface = raster.surface(SIZE, SIZE)
    drawThemeIcon(surface.ctx, SIZE, { background: theme.chatroom.background.color, receive: theme.bubbles.receive.color, send: theme.bubbles.send.color }, bg)
    return await surface.toPng()
  } finally {
    bg?.close()
  }
}
