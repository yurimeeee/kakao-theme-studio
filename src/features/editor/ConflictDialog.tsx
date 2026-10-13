import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import type { CloudConflict } from './useSaveFlow'

/** The cloud copy moved on (another device saved) or was deleted; nothing was overwritten. */
export function ConflictDialog({
  conflict,
  busy,
  onResolve,
  onDismiss,
}: {
  conflict: CloudConflict | null
  busy: 'cloud' | 'new' | null
  onResolve: (choice: 'cloud' | 'new') => void
  onDismiss: () => void
}) {
  return (
    <Dialog
      open={conflict !== null}
      onOpenChange={(o) => !o && onDismiss()}
      title={conflict === 'gone' ? '클라우드에서 삭제된 테마예요' : '다른 곳에서 먼저 저장됐어요'}
      description={
        conflict === 'gone'
          ? '이 기기의 작업은 그대로 있어요. 새 테마로 클라우드에 저장할 수 있어요.'
          : '다른 기기나 창에서 이 테마를 먼저 저장했어요. 덮어쓰지 않았어요.'
      }
      locked={busy !== null}
      footer={
        <>
          {conflict === 'conflict' && (
            <Button variant="soft" onClick={() => onResolve('cloud')} busy={busy === 'cloud'} disabled={busy !== null}>
              클라우드 버전 불러오기
            </Button>
          )}
          <Button onClick={() => onResolve('new')} busy={busy === 'new'} disabled={busy !== null}>
            새 테마로 저장
          </Button>
        </>
      }
    >
      {conflict === 'conflict' && (
        <p className="text-[13px] leading-relaxed text-sub">클라우드 버전을 불러오면 이 기기에서 바꾼 내용은 사라져요. 새 테마로 저장하면 둘 다 남아요.</p>
      )}
    </Dialog>
  )
}
