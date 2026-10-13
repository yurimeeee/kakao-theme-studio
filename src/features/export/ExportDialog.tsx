import { NameDialog } from '../projects/NameDialog'

/** Default note: nothing is uploaded and device support is still being verified. */
export const LOCAL_EXPORT_NOTE = '카카오톡 앱에서의 실제 적용은 아직 기기 검증 중이에요. 파일은 서버에 올리지 않아요.'

/** 내보내기 confirmation (name + note), shared by the editor and 내 작업. */
export function ExportDialog({
  open,
  onOpenChange,
  initialName,
  onConfirm,
  note = LOCAL_EXPORT_NOTE,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName: string
  onConfirm: (name: string) => Promise<void>
  note?: string
}) {
  return (
    <NameDialog
      open={open}
      onOpenChange={onOpenChange}
      title="테마 내보내기"
      description="아이폰 카카오톡용 .ktheme 파일을 이 브라우저에서 만들어 내려받아요."
      initialName={initialName}
      confirmLabel="내보내기"
      busyLabel="테마를 준비하고 있어요."
      onConfirm={onConfirm}
    >
      <p className="rounded-[var(--radius-field)] bg-canvas px-4 py-3 text-[13px] leading-relaxed text-sub">{note}</p>
    </NameDialog>
  )
}
