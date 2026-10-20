import { cn } from '@/components/ui/cn'
import { toast } from '@/components/ui/toast'
import { THEME_PRESETS, type ThemePreset } from '@/domain/theme/presets'
import { applyScheme } from '@/domain/theme/scheme'
import type { PaletteSetting } from '@/domain/theme/types'
import { PresetSample } from '../../projects/NewThemeDialog'
import { useEditor } from '../store'

const samePalette = (a: PaletteSetting, b: PaletteSetting) => a.background === b.background && a.text === b.text && a.subText === b.subText && a.accent === b.accent

/** 추천 조합: the 시작 템플릿 colors, applied like 색 하나로 만들기 (images and bubble shapes stay). */
export function SchemePresets() {
  const palette = useEditor((s) => s.project!.config.palette)
  const update = useEditor((s) => s.updateConfig)
  const apply = (preset: ThemePreset) => {
    update((c) => applyScheme(c, preset.palette), { newStep: true })
    toast(`'${preset.name}' 조합을 적용했어요. 실행 취소로 되돌릴 수 있어요.`)
  }
  return (
    <ul className="grid grid-cols-3 gap-1.5" aria-label="추천 조합">
      {THEME_PRESETS.map((preset) => {
        const current = samePalette(palette, preset.palette)
        return (
          <li key={preset.id}>
            <button
              type="button"
              aria-pressed={current}
              className={cn('flex w-full flex-col gap-1 rounded-[var(--radius-field)] p-1 text-left transition-colors hover:bg-canvas', current && 'bg-canvas ring-2 ring-ink')}
              onClick={() => apply(preset)}
            >
              <PresetSample preset={preset} compact />
              <span className="truncate px-0.5 text-[12px] font-medium">{preset.name}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
