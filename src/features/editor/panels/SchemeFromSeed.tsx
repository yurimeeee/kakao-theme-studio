import { Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ColorField } from '@/components/ui/ColorField'
import { Segmented } from '@/components/ui/Segmented'
import { toast } from '@/components/ui/toast'
import { isDark, mix, readableOn } from '@/domain/theme/color'
import { applyScheme, schemeFromSeed, type SchemeTone } from '@/domain/theme/scheme'
import type { HexColor, PaletteSetting } from '@/domain/theme/types'
import { useEditor } from '../store'

/** Vivid starting points; any color works. */
const SEED_SWATCHES: HexColor[] = ['#fee500', '#ff8a65', '#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#64748b']

const TONES = [
  { value: 'light' as const, label: '밝게' },
  { value: 'dark' as const, label: '어둡게' },
]

const LABELS: [keyof PaletteSetting, string][] = [
  ['background', '주요 배경'],
  ['text', '주요 글자'],
  ['subText', '보조 글자'],
  ['accent', '강조색'],
]

/** 색 하나로 만들기: the whole palette from one color, previewed before it is applied. */
export function SchemeFromSeed() {
  const palette = useEditor((s) => s.project!.config.palette)
  const update = useEditor((s) => s.updateConfig)
  const [seed, setSeed] = useState<HexColor>(palette.accent)
  const [tone, setTone] = useState<SchemeTone>(isDark(palette.background) ? 'dark' : 'light')
  const next = schemeFromSeed(seed, tone)

  const apply = () => {
    update((c) => applyScheme(c, next), { newStep: true })
    toast('새 색 조합을 적용했어요. 실행 취소로 되돌릴 수 있어요.')
  }
  return (
    <div className="flex flex-col gap-4">
      <ColorField label="대표색" value={seed} swatches={SEED_SWATCHES} onChange={setSeed} />
      <Segmented label="밝기" size="sm" value={tone} options={TONES} onChange={setTone} />
      <div
        className="flex items-end justify-between gap-2 rounded-[var(--radius-field)] border border-black/5 p-3"
        style={{ background: mix(next.background, next.text, 0.08) }}
        data-testid="seed-scheme-preview"
        aria-label="만들어질 색 조합"
        role="img"
      >
        <div className="flex flex-col gap-1.5">
          <span className="w-fit rounded-[14px] px-3 py-1.5 text-[13px]" style={{ background: next.background, color: next.text }}>
            안녕하세요
          </span>
          <span className="text-[11px]" style={{ color: next.subText }}>
            오후 2:10
          </span>
        </div>
        <span className="rounded-[14px] px-3 py-1.5 text-[13px]" style={{ background: next.accent, color: readableOn(next.accent, next.text, 4.5) }}>
          반가워요!
        </span>
      </div>
      <ul className="grid grid-cols-4 gap-2">
        {LABELS.map(([key, label]) => (
          <li key={key} className="flex flex-col items-center gap-1">
            <span className="size-7 rounded-full border border-black/10" style={{ background: next[key] }} />
            <span className="text-[11px] text-sub">{label}</span>
          </li>
        ))}
      </ul>
      <Button variant="soft" className="min-h-10 self-start px-4 text-[13px] font-medium" onClick={apply}>
        <Wand2 className="size-4" aria-hidden />이 조합 적용
      </Button>
      <p className="text-[12px] text-sub">요소마다 따로 고른 색도 이 조합을 따르게 바뀌어요. 올린 이미지는 그대로예요.</p>
    </div>
  )
}
