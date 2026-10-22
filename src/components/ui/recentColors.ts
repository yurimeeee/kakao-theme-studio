import { create } from 'zustand'
import { isHexColor } from '@/domain/theme/color'
import type { HexColor } from '@/domain/theme/types'

/**
 * 최근 색: colors picked in any color field, newest first, shared by every field and project.
 * A per-browser convenience kept in localStorage; when storage is unavailable the list simply
 * starts empty each visit.
 */
export const RECENT_COLORS_MAX = 8
const STORAGE_KEY = 'kts.recentColors'

/** Moves `color` to the front without duplicates, keeping at most `max`. */
export function pushRecent(list: readonly HexColor[], color: HexColor, max = RECENT_COLORS_MAX): HexColor[] {
  return [color, ...list.filter((c) => c !== color)].slice(0, max)
}

function load(): HexColor[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter(isHexColor).slice(0, RECENT_COLORS_MAX) : []
  } catch {
    return []
  }
}

interface RecentColorsState {
  colors: HexColor[]
  remember: (color: HexColor) => void
}

export const useRecentColors = create<RecentColorsState>((set, get) => ({
  colors: typeof window === 'undefined' ? [] : load(),
  remember: (color) => {
    const colors = pushRecent(get().colors, color)
    set({ colors })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
    } catch {
      // Kept for this visit only.
    }
  },
}))
