import { ArrowUpRight, Search, Share2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate, shareHref } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Segmented } from '@/components/ui/Segmented'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/components/ui/toast'
import { copyText } from '@/lib/clipboard'
import { isCloudConfigured } from '@/cloud/config'
import { THEME_NAME_MAX_LENGTH } from '@/domain/theme/defaults'
import type { GalleryPage as Page, GallerySort, SharedThemeCard } from '@/repositories/cloud/shares'
import { loadCloud } from '../auth/session'
import { CloudThumb } from '../cloud/CloudThumb'
import { shareUrl } from '../cloud/cloudSync'

const SORTS: { value: GallerySort; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'popular', label: '인기순' },
]

const loadThumb = (path: string) => loadCloud().then((rt) => rt.shares.downloadThumbnail(path))

/** 공개 themes only (the query and the rules both require visibility == public). */
export function GalleryPage() {
  const [sort, setSort] = useState<GallerySort>('latest')
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<SharedThemeCard[] | null>(null)
  const [next, setNext] = useState<Page['next']>(null)
  const [error, setError] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const query = useRef(0)

  // Debounce typing; Firestore matches the whole normalized term, so no partial requests are useful.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(input), 300)
    return () => window.clearTimeout(t)
  }, [input])

  const fetchPage = useCallback(
    async (after: Page['next']) => {
      const token = ++query.current
      const rt = await loadCloud()
      const page = await rt.shares.gallery({ sort, search, after })
      return token === query.current ? page : null
    },
    [sort, search],
  )

  const reload = useCallback(async () => {
    setItems(null)
    setError(false)
    try {
      const page = await fetchPage(null)
      if (!page) return
      setItems(page.items)
      setNext(page.next)
    } catch {
      setError(true)
      setItems([])
    }
  }, [fetchPage])

  useEffect(() => {
    if (!isCloudConfigured) return
    // eslint-disable-next-line react/set-state-in-effect -- network read, then state
    void reload()
  }, [reload])

  const more = async () => {
    if (!next || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await fetchPage(next)
      if (!page) return
      setItems((prev) => [...(prev ?? []), ...page.items])
      setNext(page.next)
    } catch {
      toast('테마를 더 불러오지 못했어요. 다시 시도해 주세요.')
    } finally {
      setLoadingMore(false)
    }
  }

  if (!isCloudConfigured) {
    return (
      <div className="flex min-h-[40dvh] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] bg-canvas px-6 text-center">
        <p className="text-[17px] font-bold">갤러리를 준비하고 있어요.</p>
        <p className="text-[14px] text-sub">공개 테마 둘러보기는 곧 열려요.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.08em] text-faint">테마 갤러리</p>
          <h1 className="mt-1 text-[28px] font-bold tracking-[-0.01em] lg:text-[32px]">당신의 다음 테마.</h1>
          <p className="mt-1 text-[14px] text-sub">좋아하는 화면을 발견하고, 매일의 대화에 입혀보세요.</p>
        </div>
        <label className="relative flex w-full items-center sm:w-72">
          <span className="sr-only">테마 검색</span>
          <Search className="pointer-events-none absolute left-4 size-4 text-faint" aria-hidden />
          <input
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={THEME_NAME_MAX_LENGTH}
            placeholder="테마 이름 검색"
            enterKeyHint="search"
            className="min-h-12 w-full rounded-full bg-canvas pl-11 pr-4 text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink"
          />
        </label>
      </div>

      <Segmented label="정렬" hideLabel value={sort} options={SORTS} onChange={setSort} className="w-full max-w-[260px]" />

      {items === null ? (
        <div className="flex min-h-40 items-center justify-center gap-3 text-sub" role="status">
          <Spinner className="size-5" />
          테마를 불러오고 있어요.
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] bg-canvas px-6 py-12 text-center" role="alert">
          <p className="font-semibold">테마를 불러오지 못했어요.</p>
          <p className="text-[14px] text-sub">네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
          <Button variant="surface" onClick={() => void reload()}>
            다시 시도
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] bg-canvas px-6 py-14 text-center">
          <p className="text-[17px] font-bold">{search.trim() ? '검색 결과가 없어요.' : '아직 공개된 테마가 없어요.'}</p>
          <p className="text-[14px] text-sub">{search.trim() ? '테마 이름의 일부로 다시 검색해 보세요.' : '테마를 만들고 공개하면 여기에 보여요.'}</p>
        </div>
      ) : (
        <>
          <ul className="mx-auto flex w-full max-w-[780px] flex-col gap-3" aria-label="공개 테마 목록">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-4 rounded-[var(--radius-card)] bg-canvas p-4 sm:p-5" data-testid="gallery-item">
                <a href={shareHref(t.id)} className="flex min-w-0 flex-1 items-center gap-4 rounded-[18px]">
                  <CloudThumb path={t.thumbnailPath} load={loadThumb} />
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-semibold">{t.name}</span>
                    <span className="block truncate text-[13px] text-sub">
                      by {t.ownerName} · 다운로드 {t.downloadCount.toLocaleString('ko-KR')}회
                    </span>
                  </span>
                </a>
                <div className="flex shrink-0 gap-2">
                  <IconButton label={`${t.name} 보기`} icon={<ArrowUpRight className="size-[18px]" />} variant="surface" onClick={() => navigate(shareHref(t.id))} />
                  <IconButton
                    label={`${t.name} 링크 복사`}
                    icon={<Share2 className="size-[18px]" />}
                    variant="surface"
                    className="hidden sm:inline-flex"
                    onClick={() => void copyText(shareUrl(t.id)).then((ok) => toast(ok ? '링크를 복사했어요.' : '링크를 복사하지 못했어요.'))}
                  />
                </div>
              </li>
            ))}
          </ul>
          {next && (
            <div className="flex justify-center">
              <Button variant="soft" onClick={() => void more()} busy={loadingMore}>
                더 보기
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
