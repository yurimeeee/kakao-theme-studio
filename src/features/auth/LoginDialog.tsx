import { useId, useState, type FormEvent, type InputHTMLAttributes } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { toast } from '@/components/ui/toast'
import { cloudConfig } from '@/cloud/config'
import { closeLogin, useAuthDialog } from './authDialog'
import { loadAuth, refreshSessionUser } from './session'

type Mode = 'signin' | 'signup' | 'reset'

const TITLES: Record<Mode, string> = {
  signin: '로그인',
  signup: '이메일 회원가입',
  reset: '비밀번호 재설정',
}

function Field({ label, error, ...input }: { label: string; error?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] text-sub">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error || undefined}
        className="min-h-12 rounded-[var(--radius-field)] bg-canvas px-4 text-[15px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-60"
        {...input}
      />
    </div>
  )
}

/** 이메일·Google·카카오 로그인, 이메일 회원가입, 비밀번호 재설정. Signing in never uploads local work. */
export function LoginDialog() {
  const open = useAuthDialog((s) => s.open)
  const reason = useAuthDialog((s) => s.reason)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && closeLogin()}
      title="로그인"
      description={reason ?? '로그인하고 테마를 클라우드에 저장·공유하세요.'}
    >
      {open && <LoginForm />}
    </Dialog>
  )
}

function LoginForm() {
  const [mode, setMode] = useState<Mode>('signin')
  const [busy, setBusy] = useState<null | 'google' | 'kakao' | 'email'>(null)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const kakaoReady = Boolean(cloudConfig?.kakaoClientId)

  const run = async (kind: 'google' | 'kakao' | 'email', action: () => Promise<boolean | void>) => {
    if (busy) return
    setBusy(kind)
    setError(null)
    try {
      const done = await action()
      if (done !== false) {
        closeLogin()
        toast('로그인했어요.')
      }
    } catch (e) {
      const { authApi } = await loadAuth().catch(() => ({ authApi: null }))
      const message = authApi ? authApi.authErrorMessage(e) : '로그인 기능을 준비하고 있어요.'
      if (message) setError(message)
    } finally {
      setBusy(null)
    }
  }

  const google = () =>
    run('google', async () => {
      const rt = await loadAuth()
      await rt.authApi.signInWithGoogle(rt.auth)
    })

  const kakao = () =>
    run('kakao', async () => {
      const rt = await loadAuth()
      rt.authApi.startKakaoLogin(cloudConfig!.kakaoClientId!, window.location.hash || '#/editor')
      return false // navigating away
    })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'reset') {
      if (!email.trim()) return setError('이메일을 입력해 주세요.')
      void run('email', async () => {
        const rt = await loadAuth()
        await rt.authApi.resetPassword(rt.auth, email)
        setResetSent(true)
        return false
      })
      return
    }
    if (mode === 'signup' && !name.trim()) return setError('이름을 입력해 주세요.')
    if (!email.trim()) return setError('이메일을 입력해 주세요.')
    if (!password) return setError('비밀번호를 입력해 주세요.')
    void run('email', async () => {
      const rt = await loadAuth()
      if (mode === 'signup') {
        await rt.authApi.signUpWithEmail(rt.auth, name, email, password)
        const user = rt.auth.currentUser
        if (user) refreshSessionUser(rt.authApi.toSessionUser(user))
      } else {
        await rt.authApi.signInWithEmail(rt.auth, email, password)
      }
    })
  }

  const switchMode = (m: Mode) => {
    setMode(m)
    setError(null)
    setResetSent(false)
  }

  return (
    <div className="flex flex-col gap-5">
      {mode === 'signin' && (
        <>
          <div className="flex flex-col gap-2">
            <Button variant="soft" onClick={google} busy={busy === 'google'} disabled={busy !== null}>
              Google로 계속하기
            </Button>
            <Button variant="soft" onClick={kakao} busy={busy === 'kakao'} disabled={busy !== null || !kakaoReady} aria-describedby={kakaoReady ? undefined : 'kakao-pending'}>
              카카오로 계속하기
            </Button>
            {!kakaoReady && (
              <p id="kakao-pending" className="text-center text-[12px] text-faint">
                카카오 로그인은 준비 중이에요.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 text-[12px] text-faint" aria-hidden>
            <span className="h-px flex-1 bg-hair" />
            또는 이메일
            <span className="h-px flex-1 bg-hair" />
          </div>
        </>
      )}

      {mode !== 'signin' && <p className="text-[15px] font-semibold">{TITLES[mode]}</p>}

      {resetSent ? (
        <p role="status" className="rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[14px] leading-relaxed">
          입력한 이메일로 가입된 계정이 있다면 재설정 링크를 보냈어요. 메일함을 확인해 주세요.
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          {mode === 'signup' && (
            <Field label="이름" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} autoComplete="nickname" disabled={busy !== null} />
          )}
          <Field label="이메일" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" disabled={busy !== null} />
          {mode !== 'reset' && (
            <Field
              label={mode === 'signup' ? '비밀번호 (6자 이상)' : '비밀번호'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={busy !== null}
            />
          )}
          {error && (
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
          )}
          <Button type="submit" busy={busy === 'email'} disabled={busy !== null} className="mt-1">
            {mode === 'signin' ? '로그인' : mode === 'signup' ? '회원가입' : '재설정 메일 보내기'}
          </Button>
        </form>
      )}

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[13px]">
        {mode !== 'signin' && (
          <button type="button" className="min-h-10 text-sub underline-offset-2 hover:underline" onClick={() => switchMode('signin')}>
            로그인으로 돌아가기
          </button>
        )}
        {mode === 'signin' && (
          <>
            <button type="button" className="min-h-10 text-sub underline-offset-2 hover:underline" onClick={() => switchMode('signup')}>
              이메일로 회원가입
            </button>
            <button type="button" className="min-h-10 text-sub underline-offset-2 hover:underline" onClick={() => switchMode('reset')}>
              비밀번호를 잊었어요
            </button>
          </>
        )}
      </div>
      <p className="text-center text-[12px] leading-relaxed text-faint">로그인해도 이 기기의 작업이 자동으로 올라가지 않아요. 저장할 때만 클라우드에 보관돼요.</p>
    </div>
  )
}
