export type CloudErrorKind =
  | 'unavailable' // not configured
  | 'unauthenticated'
  | 'other-account' // local copy belongs to a different signed-in account
  | 'conflict' // cloud revision moved since this copy was based on it
  | 'gone' // cloud theme was deleted
  | 'missing-asset'
  | 'permission'
  | 'network'
  | 'quota'
  | 'not-found'
  | 'recent-login' // 회원 탈퇴 needs a fresh sign-in
  | 'unknown'

export class CloudError extends Error {
  readonly kind: CloudErrorKind

  constructor(kind: CloudErrorKind, message: string, cause?: unknown) {
    super(message, { cause })
    this.kind = kind
    this.name = 'CloudError'
  }
}

/** Maps Firebase SDK errors (FirestoreError / StorageError / FunctionsError) to CloudError. */
export function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error
  const code = String((error as { code?: unknown })?.code ?? '')
  const kind: CloudErrorKind = (() => {
    if (/unauthenticated|unauthorized-domain|user-token-expired/.test(code)) return 'unauthenticated'
    if (/permission-denied|unauthorized/.test(code)) return 'permission'
    if (/failed-precondition/.test(code) && /recent-login-required/.test(String((error as { message?: unknown })?.message ?? ''))) {
      return 'recent-login'
    }
    if (/not-found|object-not-found/.test(code)) return 'not-found'
    if (/quota-exceeded|resource-exhausted/.test(code)) return 'quota'
    if (/unavailable|network-request-failed|retry-limit-exceeded|deadline-exceeded|canceled/.test(code)) return 'network'
    return 'unknown'
  })()
  return new CloudError(kind, code || 'Cloud operation failed', error)
}

export function cloudErrorMessage(error: unknown): string {
  const kind = error instanceof CloudError ? error.kind : toCloudError(error).kind
  switch (kind) {
    case 'unavailable':
      return '클라우드 기능을 준비하고 있어요.'
    case 'unauthenticated':
      return '로그인이 필요해요. 다시 로그인해 주세요.'
    case 'other-account':
      return '다른 계정의 테마예요. 해당 계정으로 로그인해 주세요.'
    case 'conflict':
      return '다른 곳에서 이 테마가 먼저 저장됐어요. 클라우드 버전을 불러오거나 새 테마로 저장해 주세요.'
    case 'gone':
      return '클라우드에서 삭제된 테마예요. 새 테마로 저장할 수 있어요.'
    case 'missing-asset':
      return '테마에 사용한 이미지를 찾을 수 없어요. 이미지를 다시 선택해 주세요.'
    case 'permission':
      return '이 테마에 접근할 권한이 없어요.'
    case 'network':
      return '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'
    case 'quota':
      return '클라우드 저장 한도를 넘었어요. 잠시 뒤 다시 시도해 주세요.'
    case 'not-found':
      return '이 테마를 볼 수 없어요.'
    case 'recent-login':
      return '보안을 위해 로그아웃한 뒤 다시 로그인하고 탈퇴해 주세요.'
    default:
      return '클라우드에 저장하지 못했어요. 다시 시도해 주세요.'
  }
}
