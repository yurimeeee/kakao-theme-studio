import { ChevronLeft, CopyPlus, Download, Share2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { editorHref, galleryHref, navigate, shareHref } from '@/app/router'
import { AssetProvider, type PreviewAsset } from '@/assets/useAssetUrl'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { LoadingState } from '@/components/ui/States'
import { toast } from '@/components/ui/toast'
import { copyText } from '@/lib/clipboard'
import { isCloudConfigured } from '@/cloud/config'
import { VISIBILITY_LABELS } from '@/cloud/model'
import type { AssetId, PreviewScreen } from '@/domain/theme/types'
import type { SharedTheme } from '@/repositories/cloud/shares'
import { loadCloud } from '../auth/session'
import { cloneSharedTheme, exportSharedTheme, shareUrl } from '../cloud/cloudSync'
import { SCREEN_OPTIONS } from '../editor/elements'
import { exportErrorMessage } from '../export/exportProject'
import { ThemePreview } from '../preview/ThemePreview'

type State =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error' }
  | { kind: 'ready'; share: SharedTheme; blobs: ReadonlyMap<AssetId, Blob>; preview: ReadonlyMap<AssetId, PreviewAsset> }

export function NotViewable() {
  return (
    <div className="mx-auto flex min-h-[50dvh] max-w-sm flex-col items-center justify-center gap-3 text-center">
      <p className="text-[18px] font-bold">이 테마를 볼 수 없어요.</p>
      <p className="text-[14px] text-sub">삭제되었거나 공개가 종료된 테마예요.</p>
      <a href={galleryHref} className="mt-2 inline-flex min-h-11 items-center rounded-full bg-canvas px-5 text-[14px] font-semibold">
        둘러보기
      </a>
    </div>
  )
}

/** 공개 / 링크 공개 theme, viewable and downloadable without signing in. */
export function ThemeDetailPage({ shareId }: { shareId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [screen, setScreen] = useState<PreviewScreen>('chatroom')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [cloning, setCloning] = useState(false)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const rt = await loadCloud()
      const share = await rt.shares.get(shareId)
      if (!share) return setState({ kind: 'not-found' })
      const blobs = await rt.shares.downloadAssets(share)
      const preview = new Map<AssetId, PreviewAsset>()
      for (const [id, blob] of blobs) {
        const entry = share.assetManifest[id]
        if (entry) preview.set(id, { blob, width: entry.width, height: entry.height })
      }
      setState({ kind: 'ready', share, blobs, preview })
    } catch {
      setState({ kind: 'error' })
    }
  }, [shareId])

  useEffect(() => {
    if (!isCloudConfigured) return
    // eslint-disable-next-line react/set-state-in-effect -- network read, then state
    void load()
  }, [load])

  if (!isCloudConfigured || state.kind === 'not-found') return <NotViewable />
  if (state.kind === 'loading') {
    return (
      <LoadingState size="page">테마를 불러오고 있어요.</LoadingState>
    )
  }
  if (state.kind === 'error') {
    return (
      <div className="mx-auto flex min-h-[50dvh] max-w-sm flex-col items-center justify-center gap-3 text-center" role="alert">
        <p className="text-[18px] font-bold">테마를 불러오지 못했어요.</p>
        <p className="text-[14px] text-sub">네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <Button variant="soft" onClick={() => void load()}>
          다시 시도
        </Button>
      </div>
    )
  }

  const { share, blobs, preview } = state
  const download = async () => {
    if (downloading) return
    setDownloading(true)
    setDownloadError(null)
    try {
      await exportSharedTheme(share, blobs)
      toast('테마 파일을 내려받았어요.')
    } catch (e) {
      setDownloadError(exportErrorMessage(e))
    } finally {
      setDownloading(false)
    }
  }
  const clone = async () => {
    if (cloning) return
    setCloning(true)
    setDownloadError(null)
    try {
      const id = await cloneSharedTheme(share, blobs)
      toast('내 작업에 복제했어요. 이 기기에 보관돼요.')
      navigate(editorHref(id))
    } catch {
      setDownloadError('복제하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.')
      setCloning(false)
    }
  }
  const share_ = async () => {
    const url = shareUrl(share.id)
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: share.name, url }).catch(() => undefined)
      return
    }
    toast((await copyText(url)) ? '링크를 복사했어요.' : '링크를 복사하지 못했어요.')
  }

  return (
    <div className="flex flex-col gap-6">
      {share.visibility === 'public' && (
        <a href={galleryHref} className="inline-flex min-h-11 items-center gap-1 self-start rounded-full pr-3 text-[14px] font-medium text-sub hover:text-ink">
          <ChevronLeft className="size-4" aria-hidden />
          둘러보기
        </a>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12">
        <section aria-label="미리보기" className="flex min-w-0 flex-col items-center gap-4 rounded-[var(--radius-card)] bg-canvas px-2 py-5 sm:px-6 lg:py-6">
          <Segmented label="미리보기 화면" hideLabel size="sm" value={screen} options={SCREEN_OPTIONS} onChange={setScreen} className="w-full max-w-[360px]" />
          <AssetProvider assets={preview}>
            <ThemePreview config={share.config} screen={screen} />
          </AssetProvider>
          <p className="text-[12px] text-sub">iOS 미리보기 · 실제 앱과 조금 다를 수 있어요</p>
        </section>
        <div className="flex flex-col gap-4 lg:pt-6">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-faint">iOS 테마 · {VISIBILITY_LABELS[share.visibility]}</p>
          <h1 className="break-words text-[28px] font-bold leading-tight tracking-[-0.01em] lg:text-[32px]" data-testid="share-name">
            {share.name}
          </h1>
          <p className="text-[14px] text-sub">
            by {share.ownerName} · 다운로드 {share.downloadCount.toLocaleString('ko-KR')}회
          </p>
          {share.origin && (
            <p className="text-[13px] text-sub" data-testid="share-origin">
              원본{' '}
              <a href={shareHref(share.origin.shareId)} className="font-medium text-ink underline underline-offset-2">
                {share.origin.name}
              </a>{' '}
              · by {share.origin.ownerName}
            </p>
          )}
          <div className="my-2 h-px bg-hair" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void download()} busy={downloading}>
              {!downloading && <Download className="size-4" aria-hidden />}
              {downloading ? '테마를 준비하고 있어요.' : '.ktheme 다운로드'}
            </Button>
            {share.allowRemix && (
              <Button variant="soft" onClick={() => void clone()} busy={cloning} disabled={downloading}>
                {!cloning && <CopyPlus className="size-4" aria-hidden />}
                내 작업으로 복제
              </Button>
            )}
            <Button variant="soft" onClick={() => void share_()}>
              <Share2 className="size-4" aria-hidden />
              공유
            </Button>
          </div>
          {downloadError && (
            <p role="alert" className="text-[13px] text-danger">
              {downloadError}
            </p>
          )}
          <p className="text-[13px] text-sub">
            로그인 없이 다운로드할 수 있어요.
            {share.allowRemix ? ' 제작자가 복제를 허용해서, 내 작업으로 가져와 고칠 수도 있어요.' : ''}
          </p>
          <p className="rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[13px] leading-relaxed text-sub">
            카카오톡 앱에서의 실제 적용은 아직 기기 검증 중이에요. 파일은 이 브라우저에서 만들어져요.
          </p>
        </div>
      </div>
    </div>
  )
}
