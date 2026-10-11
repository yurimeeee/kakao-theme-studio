import type { AssetMeta, AssetRecord } from '@/assets/types'
import type { AssetId, LocalProjectId, ThemeProject } from '@/domain/theme/types'

/**
 * Storage interfaces. Phase 1 ships only the local (IndexedDB) implementation in
 * ./local. A phase-2 CloudProjectRepository implements the same contracts in a
 * separate module and is wired only on explicit 저장/내보내기 confirmation.
 */

export interface ProjectSummary {
  id: LocalProjectId
  name: string
  createdAt: number
  updatedAt: number
  savedAt: number | null
  thumbnail: Blob | null
  location: 'local'
}

export interface SaveOptions {
  /**
   * Time the immutable snapshot was taken. Assets created after this moment are
   * never garbage-collected by this save (they may belong to an edit that the
   * snapshot does not include yet).
   */
  snapshotAt: number
  thumbnail?: Blob | null
  /** true for 저장 button confirmation, false for autosave. */
  explicit?: boolean
}

export interface ProjectRepository {
  list(): Promise<ProjectSummary[]>
  get(id: LocalProjectId): Promise<ThemeProject | null>
  /**
   * Persists the project and its thumbnail atomically and deletes this project's
   * unreferenced assets. `project.revision` must equal the stored revision
   * (optimistic concurrency); returns the project with the new revision.
   */
  save(project: ThemeProject, options: SaveOptions): Promise<ThemeProject>
  /** Removes the project, its thumbnail and all of its assets. */
  delete(id: LocalProjectId): Promise<void>
}

export interface AssetRepository {
  put(record: AssetRecord): Promise<void>
  get(id: AssetId): Promise<AssetRecord | null>
  getMany(ids: Iterable<AssetId>): Promise<Map<AssetId, AssetRecord>>
  attach(projectId: LocalProjectId, hash: string, create: () => AssetRecord): Promise<AssetMeta>
  findByHash(projectId: LocalProjectId, hash: string): Promise<AssetMeta | null>
  listMeta(projectId: LocalProjectId): Promise<AssetMeta[]>
}

export interface SettingsRepository {
  getLastProjectId(): Promise<LocalProjectId | null>
  setLastProjectId(id: LocalProjectId | null): Promise<void>
}

export type StorageErrorKind = 'quota' | 'conflict' | 'unavailable' | 'corrupt' | 'unknown'

export class StorageError extends Error {
  readonly kind: StorageErrorKind

  constructor(kind: StorageErrorKind, message: string, cause?: unknown) {
    super(message, { cause })
    this.kind = kind
    this.name = 'StorageError'
  }
}

export function storageErrorMessage(error: unknown): string {
  if (error instanceof StorageError) {
    switch (error.kind) {
      case 'quota':
        return '저장 공간이 부족해요. 사용하지 않는 테마를 삭제한 뒤 다시 시도해 주세요.'
      case 'conflict':
        return '다른 창에서 이 테마가 수정됐어요. 새로고침한 뒤 다시 시도해 주세요.'
      case 'unavailable':
        return '이 브라우저에서는 작업을 보관할 수 없어요. 시크릿 모드라면 일반 창에서 열어 주세요.'
      case 'corrupt':
        return '보관된 테마를 읽지 못했어요.'
      default:
        break
    }
  }
  return '저장하지 못했어요. 다시 시도해 주세요.'
}
