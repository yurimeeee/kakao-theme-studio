import { ColorField } from '@/components/ui/ColorField'
import { NEUTRAL_SWATCHES } from '@/components/ui/swatches'
import { FieldGroup, Notice } from '@/components/ui/Section'
import { Segmented } from '@/components/ui/Segmented'
import { Slider } from '@/components/ui/Slider'
import { BUBBLE_RADIUS_MAX, BUBBLE_RADIUS_MIN } from '@/domain/theme/defaults'
import { resolveTheme } from '@/domain/theme/resolve'
import type { BubbleSetting, BubbleShape, EdgeInsets } from '@/domain/theme/types'
import { imageBubbleGeometry } from '@/exporters/ktheme/bubbleGeometry'
import { ImageField } from '../ImageField'
import { useEditor } from '../store'
import { modeOptions } from './modes'
import { Advanced } from './shared'

const SHAPES: { value: BubbleShape; label: string }[] = [
  { value: 'square', label: '직각' },
  { value: 'rounded', label: '둥근' },
  { value: 'capsule', label: '캡슐' },
]

const INSET_LABELS: Record<keyof EdgeInsets, string> = { top: '위 여백', right: '오른쪽 여백', bottom: '아래 여백', left: '왼쪽 여백' }

export function BubblePanel({ kind }: { kind: 'send' | 'receive' }) {
  const config = useEditor((s) => s.project!.config)
  const update = useEditor((s) => s.updateConfig)
  const bubble = config.bubbles[kind]
  const resolved = resolveTheme(config).bubbles[kind]
  const record = useEditor((s) => (bubble.imageAssetId ? s.assets.get(bubble.imageAssetId) : undefined))
  const set = (patch: Partial<BubbleSetting>) => update((c) => Object.assign(c.bubbles[kind], patch))
  const setAdvanced = (patch: Partial<BubbleSetting['advanced']>) => update((c) => Object.assign(c.bubbles[kind].advanced, patch))
  const isImage = bubble.mode === 'image'
  const geo = record ? imageBubbleGeometry(record.width, record.height, bubble.advanced.stretch) : null

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup>
        <Segmented label="말풍선 방식" hideLabel value={bubble.mode} options={modeOptions(['default', 'color', 'image'] as const)} onChange={(mode) => set({ mode })} />
        {bubble.mode === 'default' && (
          <p className="text-[13px] text-sub">
            전체 색상의 {kind === 'send' ? '강조색' : '주요 배경'}({resolved.color.toUpperCase()})을 따라요.
          </p>
        )}
        {bubble.mode === 'color' && <ColorField label="색상" value={bubble.color} swatches={NEUTRAL_SWATCHES} onChange={(color) => set({ color })} />}
        {isImage && (
          <ImageField
            label="말풍선 이미지"
            assetId={bubble.imageAssetId}
            onChange={(imageAssetId) => set({ imageAssetId })}
            hint="3배(@3x) 크기 기준으로 사용해요. 늘림 기준점의 한 줄이 늘어나요."
          />
        )}
        <ColorField
          label="글자색"
          value={resolved.textColor}
          onChange={(textColor) => set({ textColor })}
          auto={{ active: bubble.textColor === null, onReset: () => set({ textColor: null }), label: '자동' }}
        />
      </FieldGroup>

      {!isImage && (
        <FieldGroup>
          <Slider
            label="모서리 둥글기"
            value={bubble.radius}
            min={BUBBLE_RADIUS_MIN}
            max={BUBBLE_RADIUS_MAX}
            disabled={bubble.shape !== 'rounded'}
            onChange={(radius) => set({ radius })}
          />
          <Segmented label="모양" value={bubble.shape} options={SHAPES} onChange={(shape) => set({ shape })} />
          <Notice>내보낼 때 모양에 맞는 말풍선 이미지를 자동으로 만들어요.</Notice>
        </FieldGroup>
      )}

      <Advanced>
        <p className="text-[13px] text-sub">텍스트 여백 (pt)</p>
        {(Object.keys(INSET_LABELS) as (keyof EdgeInsets)[]).map((side) => (
          <Slider
            key={side}
            label={INSET_LABELS[side]}
            value={bubble.advanced.insets[side]}
            min={0}
            max={40}
            unit="pt"
            onChange={(v) => setAdvanced({ insets: { ...bubble.advanced.insets, [side]: v } })}
          />
        ))}
        {isImage && geo && (
          <>
            <p className="pt-2 text-[13px] text-sub">늘림 기준점 (pt, 이미지 {Math.round(geo.widthPt)}×{Math.round(geo.heightPt)})</p>
            <Slider label="가로 기준" value={geo.stretch.x} min={0} max={Math.max(0, Math.floor(geo.widthPt) - 1)} unit="pt" onChange={(x) => setAdvanced({ stretch: { x, y: geo.stretch.y } })} />
            <Slider label="세로 기준" value={geo.stretch.y} min={0} max={Math.max(0, Math.floor(geo.heightPt) - 1)} unit="pt" onChange={(y) => setAdvanced({ stretch: { x: geo.stretch.x, y } })} />
            <ImageField
              label="연속 메시지 이미지 (선택)"
              assetId={bubble.advanced.groupImageAssetId}
              onChange={(groupImageAssetId) => setAdvanced({ groupImageAssetId })}
              hint="비워 두면 첫 메시지 이미지를 그대로 사용해요."
              compact
            />
          </>
        )}
        <Notice>눌렀을 때(선택 상태) 이미지는 10% 어둡게 자동 생성돼요.</Notice>
      </Advanced>
    </div>
  )
}
