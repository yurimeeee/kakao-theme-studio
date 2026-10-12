import { useEffect, useRef, useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'

/**
 * Rendered instead of the app at /auth/kakao/callback. Verifies `state`, exchanges the
 * code through the kakaoSignIn function, then returns to the in-app route.
 */
export function KakaoCallback() {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const search = window.location.search
    void import('./session')
      .then(({ loadCloud }) => loadCloud())
      .then(async (rt) => {
        try {
          const returnTo = await rt.authApi.completeKakaoLogin(rt.services.auth, rt.exchangeKakaoCode, search)
          window.location.replace(`/${returnTo}`)
        } catch (e) {
          setError(rt.authApi.authErrorMessage(e) ?? '로그인하지 못했어요. 다시 시도해 주세요.')
        }
      })
      .catch(() => setError('카카오 로그인을 준비하고 있어요.'))
  }, [])

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <p role="alert" className="text-[17px] font-bold">
            {error}
          </p>
          <a href="/#/editor" className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-[14px] font-semibold text-white">
            돌아가기
          </a>
        </>
      ) : (
        <p role="status" className="flex items-center gap-3 text-sub">
          <Spinner className="size-5" />
          카카오 계정을 확인하고 있어요.
        </p>
      )}
    </div>
  )
}
