import { Component, type ReactNode } from 'react'

interface State {
  failed: boolean
}

/** Last-resort fallback so a render error never leaves a blank page. Local data is untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-[18px] font-bold">화면을 표시하지 못했어요.</p>
        <p className="text-[14px] text-sub">이 브라우저에 보관된 작업은 그대로 있어요. 새로고침해 주세요.</p>
        <button type="button" onClick={() => location.reload()} className="mt-2 min-h-11 rounded-full bg-ink px-5 text-[14px] font-semibold text-white">
          새로고침
        </button>
      </div>
    )
  }
}
