import { Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/toast'
import { applyScheme, schemeFromSeed, type ImageColors } from '@/domain/theme/scheme'
import type { AssetId, HexColor } from '@/domain/theme/types'
import { readImageColors } from '../imageColors'
import { useEditor } from '../store'

/**
 * Colors read from a background image: one button builds the whole palette from the most
 * fitting color, or a swatch builds it from that color instead. One 실행 취소 step.
 */
export function SchemeFromImage({ assetId }: { assetId: AssetId }) {
  const blob = useEditor((s) => s.assets.get(assetId)?.blob)
  const update = useEditor((s) => s.updateConfig)
  const [found, setFound] = useState<{ blob: Blob; colors: ImageColors | null } | null>(null)
  useEffect(() => {
    if (!blob) return
    let alive = true
    void readImageColors(blob).then((colors) => alive && setFound({ blob, colors }))
    return () => {
      alive = false
    }
  }, [blob])
  const colors = found && found.blob === blob ? found.colors : null
  if (!colors) return null

  const apply = (seed: HexColor) => {
    update((c) => applyScheme(c, schemeFromSeed(seed, colors.tone, colors.base)), { newStep: true })
    toast('이미지에 어울리는 색으로 바꿨어요. 실행 취소로 되돌릴 수 있어요.')
  }
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-field)] bg-canvas p-4" data-testid="image-scheme">
      <div>
        <p className="text-[14px] font-medium text-ink">이미지에서 뽑은 색</p>
        <p className="mt-0.5 text-[12px] text-sub">색을 고르면 말풍선·글자·입력창 색을 이 색에 맞춰요. 글자는 읽기 쉬운 대비로 정해요.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="이미지에서 뽑은 색">
        {colors.colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => apply(c)}
            aria-label={`${c.toUpperCase()}으로 색 맞추기`}
            className="size-9 rounded-full border border-black/10"
            style={{ background: c }}
          />
        ))}
      </div>
      <Button variant="surface" className="min-h-10 self-start px-4 text-[13px] font-medium" onClick={() => apply(colors.seed)}>
        <Wand2 className="size-4" aria-hidden />
        이미지에 어울리게 맞추기
      </Button>
    </div>
  )
}
