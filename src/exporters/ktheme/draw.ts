import type { HexColor } from '@/domain/theme/types'
import type { Ctx, Decoded } from './raster'

export function fillSolid(ctx: Ctx, w: number, h: number, color: HexColor): void {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
}

export function roundedRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

export function drawRoundedRect(ctx: Ctx, w: number, h: number, r: number, color: HexColor): void {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = color
  roundedRectPath(ctx, 0, 0, w, h, r)
  ctx.fill()
}

/** Darkens already-drawn opaque pixels only (keeps transparency). Used for *Selected images. */
export function darkenDrawn(ctx: Ctx, w: number, h: number, amount: number): void {
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = `rgba(0,0,0,${amount})`
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

export function drawCover(ctx: Ctx, img: Decoded, w: number, h: number): void {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img.source, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

export function drawContain(ctx: Ctx, img: Decoded, w: number, h: number): void {
  const scale = Math.min(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img.source, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

export function drawScaled(ctx: Ctx, img: Decoded, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img.source, 0, 0, w, h)
}

export function drawCircle(ctx: Ctx, size: number, diameter: number, color: HexColor): void {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, diameter / 2, 0, Math.PI * 2)
  ctx.fill()
}

/** Built-in default profile: neutral tile with a simple person glyph (our own artwork). */
export function drawDefaultProfile(ctx: Ctx, size: number, bg: HexColor, fg: HexColor): void {
  fillSolid(ctx, size, size, bg)
  ctx.fillStyle = fg
  const cx = size / 2
  ctx.beginPath()
  ctx.arc(cx, size * 0.4, size * 0.17, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(cx, size * 0.92, size * 0.32, size * 0.26, 0, Math.PI, 0)
  ctx.fill()
}

/** Theme list icon / project thumbnail: background + one received and one sent pill. */
export function drawThemeIcon(
  ctx: Ctx,
  size: number,
  colors: { background: HexColor; receive: HexColor; send: HexColor },
  backgroundImage?: Decoded | null,
): void {
  fillSolid(ctx, size, size, colors.background)
  if (backgroundImage) drawCover(ctx, backgroundImage, size, size)
  const pillH = size * 0.17
  ctx.fillStyle = colors.receive
  roundedRectPath(ctx, size * 0.16, size * 0.3, size * 0.46, pillH, pillH / 2)
  ctx.fill()
  ctx.fillStyle = colors.send
  roundedRectPath(ctx, size * 0.38, size * 0.53, size * 0.46, pillH, pillH / 2)
  ctx.fill()
}
