import Dexie, { type EntityTable } from 'dexie'
import type { AssetRecord } from '@/assets/types'

/** Stored row. `config` is kept as unknown so it always passes through migrateConfig on read. */
export interface ProjectRow {
  id: string
  cloudThemeId: string | null
  exportThemeId: string
  name: string
  config: unknown
  createdAt: number
  updatedAt: number
  savedAt: number | null
  revision: number
}

export interface ThumbnailRow {
  projectId: string
  blob: Blob
}

export interface MetaRow {
  key: string
  value: unknown
}

export const DEFAULT_DB_NAME = 'kakao-theme-studio'

export class LocalDatabase extends Dexie {
  projects!: EntityTable<ProjectRow, 'id'>
  assets!: EntityTable<AssetRecord, 'id'>
  thumbnails!: EntityTable<ThumbnailRow, 'projectId'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = DEFAULT_DB_NAME) {
    super(name)
    // Bump the version and add an .upgrade() here when the stored shape changes.
    this.version(1).stores({
      projects: 'id, updatedAt',
      assets: 'id, projectId, [projectId+hash]',
      thumbnails: 'projectId',
      meta: 'key',
    })
  }
}
