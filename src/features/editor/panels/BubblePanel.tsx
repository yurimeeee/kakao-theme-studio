import { useEffect, useState } from 'react'
import { useAssetUrl } from '@/assets/useAssetUrl'
import { Button } from '@/components/ui/Button'
import { ColorField } from '@/components/ui/ColorField'
import { NEUTRAL_SWATCHES } from '@/components/ui/swatches'
import { FieldGroup, Notice } from '@/components/ui/Section'
import { Segmented } from '@/components/ui/Segmented'
import { Slider } from '@/components/ui/Slider'
import { BUBBLE_IMAGE_SIZE_MAX, BUBBLE_IMAGE_SIZE_MIN, BUBBLE_RADIUS_MAX, BUBBLE_RADIUS_MIN } from '@/domain/theme/defaults'
import { resolveThemeCached } from '@/domain/theme/resolve'
import type { AssetId, BubbleImageLayout, BubbleSetting, BubbleShape, EdgeInsets } from '@/domain/theme/types'
import { imageBubbleGeometry, rescaleLayout } from '@/exporters/ktheme/bubbleGeometry'
import { Bubble } from '@/features/preview/parts'
import { analyzeBubbleImage, analyzeBubbleLines } from '../bubbleFit'
import { ImageField } from '../ImageField'
import { useEditor } from '../store'
import { modeOptions } from './modes'
import { BubbleLayoutEditor } from './BubbleLayoutEditor'
import { Advanced } from './shared'

const SHAPES: { value: BubbleShape; label: string }[] = [
  { value: 'square', label: '직각' },
  { value: 'rounded', label: '둥근' },
  { value: 'capsule', label: '캡슐' },
]

const INSET_LABELS: Record<keyof EdgeInsets, string> = { top: '위 여백', right: '오른쪽 여백', bottom: '아래 여백', left: '왼쪽 여백' }
const INSET_MAX_GENERATED = 40

/** 첫 메시지 or 연속 메시지 image of an image bubble. */
type Target = 'main' | 'group'
const TARGETS: { value: Target; label: string }[] = [
  { value: 'main', label: '첫 메시지' },
  { value: 'group', label: '연속 메시지' },
]

const copyLayout = (l: BubbleImageLayout): BubbleImageLayout => ({
  insets: { ...l.insets },
  stretch: l.stretch ? { ...l.stretch } : null,
  imageSize: l.imageSize,
})

/** Stored layout of a target; 연속 메시지 without its own layout follows the first message. */
const layoutOf = (b: BubbleSetting, t: Target) => copyLayout(t === 'group' && b.advanced.group ? b.advanced.group : b.advanced)

function writeLayout(b: BubbleSetting, t: Target, patch: Partial<BubbleImageLayout>) {
  const next = { ...layoutOf(b, t), ...patch }
  if (t === 'main') Object.assign(b.advanced, next)
  else b.advanced.group = next
}

/** Flat image lines of an asset, for the layout editor's warnings and rulers. */
function useBubbleLines(assetId: AssetId | null) {
  const blob = useEditor((s) => (assetId ? s.assets.get(assetId)?.blob : undefined))
  const [lines, setLines] = useState<{ blob: Blob; value: Awaited<ReturnType<typeof analyzeBubbleLines>> } | null>(null)
  useEffect(() => {
    if (!blob) return
    let alive = true
    void analyzeBubbleLines(blob).then((value) => alive && setLines({ blob, value }))
    return () => {
      alive = false
    }
  }, [blob])
  return lines && lines.blob === blob ? lines.value : null
}

export function BubblePanel({ kind }: { kind: 'send' | 'receive' }) {
  const config = useEditor((s) => s.project!.config)
  const update = useEditor((s) => s.updateConfig)
  const bubble = config.bubbles[kind]
  const theme = resolveThemeCached(config)
  const resolved = theme.bubbles[kind]
  const set = (patch: Partial<BubbleSetting>) => update((c) => Object.assign(c.bubbles[kind], patch))
  const setAdvanced = (patch: Partial<BubbleSetting['advanced']>) => update((c) => Object.assign(c.bubbles[kind].advanced, patch))
  const isImage = bubble.mode === 'image'

  const [chosen, setTarget] = useState<Target>('main')
  const target: Target = bubble.advanced.groupImageAssetId ? chosen : 'main'
  const targetImageId = target === 'group' ? bubble.advanced.groupImageAssetId : bubble.imageAssetId
  const record = useEditor((s) => (targetImageId ? s.assets.get(targetImageId) : undefined))
  const targetUrl = useAssetUrl(targetImageId)
  const lines = useBubbleLines(isImage ? targetImageId : null)
  const layout = layoutOf(bubble, target)
  const geo = record ? imageBubbleGeometry(record.width, record.height, layout.stretch, layout.imageSize) : null
  const setLayout = (patch: Partial<BubbleImageLayout>) => update((c) => writeLayout(c.bubbles[kind], target, patch))
  /** Resizing keeps the stretch point and text box on the same spot of the image. */
  const setSize = (imageSize: number) =>
    update((c) => {
      const b = c.bubbles[kind]
      const cur = layoutOf(b, target)
      writeLayout(b, target, { ...rescaleLayout(cur, cur.imageSize, imageSize), imageSize })
    })
  const [fit, setFit] = useState<{ target: Target; status: 'busy' | 'fitted' | 'failed' } | null>(null)
  const fitStatus = fit?.target === target ? fit.status : 'idle'

  /** Analyze an image (locally) and set its stretch point + text insets in one edit. */
  const applyFit = async (t: Target, imageAssetId: AssetId, patch: Partial<BubbleSetting['advanced']> & { imageAssetId?: AssetId } = {}) => {
    setFit({ target: t, status: 'busy' })
    const blob = useEditor.getState().assets.get(imageAssetId)?.blob
    const result = blob ? await analyzeBubbleImage(blob) : null
    update((c) => {
      const b = c.bubbles[kind]
      const { imageAssetId: main, ...adv } = patch
      if (main) b.imageAssetId = main
      Object.assign(b.advanced, adv)
      if ((t === 'main' ? b.imageAssetId : b.advanced.groupImageAssetId) !== imageAssetId) return
      // A new 연속 메시지 image starts at the first message's size.
      const size = layoutOf(b, t === 'group' && !b.advanced.group ? 'main' : t).imageSize
      const fitted = result ? rescaleLayout({ insets: result.insets, stretch: result.stretch }, 100, size) : null
      writeLayout(b, t, { stretch: fitted?.stretch ?? null, ...(fitted ? { insets: fitted.insets } : {}), imageSize: size })
    })
    setFit({ target: t, status: result ? 'fitted' : 'failed' })
  }

  const insetMax = (side: keyof EdgeInsets) =>
    isImage && geo ? Math.max(INSET_MAX_GENERATED, Math.ceil(side === 'top' || side === 'bottom' ? geo.heightPt : geo.widthPt)) : INSET_MAX_GENERATED
  const insets = isImage ? layout.insets : bubble.advanced.insets

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
          <>
            <ImageField
              label="말풍선 이미지"
              assetId={bubble.imageAssetId}
              onChange={(imageAssetId) => {
                setTarget('main')
                if (imageAssetId) void applyFit('main', imageAssetId, { imageAssetId })
                else set({ imageAssetId })
              }}
              hint="원본의 1/3 크기(@3x)로 시작해요. 올리면 장식을 피해 텍스트 여백과 늘림 기준점을 자동으로 맞춰요."
            />
            {bubble.imageAssetId && (
              <ImageField
                label="연속 메시지 이미지 (선택)"
                assetId={bubble.advanced.groupImageAssetId}
                onChange={(groupImageAssetId) => {
                  setTarget(groupImageAssetId ? 'group' : 'main')
                  if (groupImageAssetId) void applyFit('group', groupImageAssetId, { groupImageAssetId })
                  else setAdvanced({ groupImageAssetId })
                }}
                hint="비워 두면 첫 메시지 이미지를 그대로 사용해요."
                compact
              />
            )}
          </>
        )}
        <ColorField
          label="글자색"
          value={resolved.textColor}
          onChange={(textColor) => set({ textColor })}
          auto={{ active: bubble.textColor === null, onReset: () => set({ textColor: null }), label: '자동' }}
          // An image bubble's color under the text is unknown.
          contrast={resolved.kind === 'generated' ? { against: resolved.color, min: 4.5 } : undefined}
        />
      </FieldGroup>

      {isImage && record && targetUrl && geo && (
        <FieldGroup title="늘림 기준점 · 텍스트 여백" description="이미지 위에서 직접 끌어서 조절해요.">
          {bubble.advanced.groupImageAssetId && (
            <Segmented label="조절할 이미지" hideLabel value={target} options={TARGETS} onChange={setTarget} />
          )}
          {target === 'group' &&
            (bubble.advanced.group ? (
              <Button variant="surface" className="min-h-10 self-start px-4 text-[13px]" onClick={() => setAdvanced({ group: null })}>
                첫 메시지와 같게
              </Button>
            ) : (
              <p className="text-[13px] text-sub">첫 메시지 설정을 따르고 있어요. 조절하면 연속 메시지만 따로 바뀌어요.</p>
            ))}
          <div>
            <Slider label="표시 크기" value={layout.imageSize} min={BUBBLE_IMAGE_SIZE_MIN} max={BUBBLE_IMAGE_SIZE_MAX} step={5} unit="%" onChange={setSize} />
            <p className="text-[12px] tabular-nums text-sub">
              {record.width}×{record.height}px → {Math.round(geo.widthPt)}×{Math.round(geo.heightPt)}pt
              {layout.imageSize > 100 && ' · 100%보다 크면 흐릿해질 수 있어요'}
            </p>
          </div>
          <BubbleLayoutEditor imageUrl={targetUrl} widthPx={record.width} heightPx={record.height} layout={layout} lines={lines} onChange={setLayout} />
          <div className="flex flex-col gap-2">
            <Button variant="soft" busy={fitStatus === 'busy'} onClick={() => void applyFit(target, targetImageId!)}>
              이미지에 맞추기
            </Button>
            <p className="text-[13px] text-sub" role="status">
              {fitStatus === 'fitted' && '이미지에 맞춰 텍스트 여백과 늘림 기준점을 정했어요. 위에서 직접 조절할 수 있어요.'}
              {fitStatus === 'failed' && '자동으로 맞추지 못했어요. 위에서 여백과 늘림 기준점을 직접 조절해 주세요.'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 rounded-[var(--radius-field)] p-4" style={{ background: theme.chatroom.background.color }} aria-label="말풍선 미리보기">
            <Bubble bubble={resolved} group={target === 'group'}>
              응
            </Bubble>
            <Bubble bubble={resolved} group={target === 'group'}>
              말풍선이 길어지면 이렇게 늘어나요. 장식이 어떻게 보이는지 확인해 보세요.
            </Bubble>
          </div>
        </FieldGroup>
      )}

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
        <p className="text-[13px] text-sub">텍스트 여백 (pt{isImage && target === 'group' ? ', 연속 메시지' : ''})</p>
        {(Object.keys(INSET_LABELS) as (keyof EdgeInsets)[]).map((side) => (
          <Slider
            key={side}
            label={INSET_LABELS[side]}
            value={insets[side]}
            min={0}
            max={insetMax(side)}
            step={isImage ? 0.5 : 1}
            unit="pt"
            onChange={(v) => (isImage ? setLayout({ insets: { ...insets, [side]: v } }) : setAdvanced({ insets: { ...insets, [side]: v } }))}
          />
        ))}
        {isImage && geo && (
          <>
            <p className="pt-2 text-[13px] text-sub">늘림 기준점 (pt, 이미지 {Math.round(geo.widthPt)}×{Math.round(geo.heightPt)})</p>
            <Slider label="가로 기준" value={geo.stretch.x} min={0} max={Math.max(0, Math.floor(geo.widthPt) - 1)} step={0.5} unit="pt" onChange={(x) => setLayout({ stretch: { x, y: geo.stretch.y } })} />
            <Slider label="세로 기준" value={geo.stretch.y} min={0} max={Math.max(0, Math.floor(geo.heightPt) - 1)} step={0.5} unit="pt" onChange={(y) => setLayout({ stretch: { x: geo.stretch.x, y } })} />
          </>
        )}
        <Notice>눌렀을 때(선택 상태) 이미지는 10% 어둡게 자동 생성돼요.</Notice>
      </Advanced>
    </div>
  )
}
