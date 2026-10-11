import type { AssetMeta, AssetRecord } from '@/assets/types'
import { collectAssetIds, migrateConfig } from '@/domain/theme/normalize'
import type { AssetId, LocalProjectId, ThemeProject } from '@/domain/theme/types'
import {
  StorageError,
  type AssetRepository,
  type ProjectRepository,
  type ProjectSummary,
  type SaveOptions,
  type SettingsRepository,
} from '../types'
import { LocalDatabase, type ProjectRow } from './db'

function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageError) return error
  const names = [error, (error as { inner?: unknown })?.inner].map((e) => (e as { name?: string })?.name)
  if (names.includes('QuotaExceededError')) return new StorageError('quota', 'Storage quota exceeded', error)
  if (names.some((n) => n === 'MissingAPIError' || n === 'InvalidStateError' || n === 'OpenFailedError')) {
    return new StorageError('unavailable', 'IndexedDB unavailable', error)
  }
  return new StorageError('unknown', 'Storage operation failed', error)
}

async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op()
  } catch (error) {
    throw toStorageError(error)
  }
}

function rowToProject(row: ProjectRow): ThemeProject {
  try {
    return { ...row, config: migrateConfig(row.config) }
  } catch (error) {
    throw new StorageError('corrupt', `Project ${row.id} could not be read`, error)
  }
}

function projectToRow(project: ThemeProject): ProjectRow {
  // structuredClone strips any accidental non-serializable values and detaches from live state.
  return structuredClone({ ...project })
}

export class LocalProjectRepository implements ProjectRepository {
  private readonly db: LocalDatabase

  constructor(db: LocalDatabase) {
    this.db = db
  }

  list(): Promise<ProjectSummary[]> {
    return guard(async () => {
      const [rows, thumbs] = await Promise.all([
        this.db.projects.orderBy('updatedAt').reverse().toArray(),
        this.db.thumbnails.toArray(),
      ])
      const byId = new Map(thumbs.map((t) => [t.projectId, t.blob]))
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        savedAt: r.savedAt,
        thumbnail: byId.get(r.id) ?? null,
        location: 'local' as const,
      }))
    })
  }

  get(id: LocalProjectId): Promise<ThemeProject | null> {
    return guard(async () => {
      const row = await this.db.projects.get(id)
      return row ? rowToProject(row) : null
    })
  }

  save(project: ThemeProject, options: SaveOptions): Promise<ThemeProject> {
    return guard(() =>
      this.db.transaction('rw', [this.db.projects, this.db.assets, this.db.thumbnails], async () => {
        const existing = await this.db.projects.get(project.id)
        const storedRevision = existing?.revision ?? 0
        if (storedRevision !== project.revision) {
          throw new StorageError('conflict', `Revision mismatch for ${project.id}`)
        }
        const now = Date.now()
        const next: ThemeProject = {
          ...project,
          createdAt: existing?.createdAt ?? project.createdAt,
          updatedAt: now,
          savedAt: options.explicit ? now : (existing?.savedAt ?? project.savedAt),
          revision: storedRevision + 1,
        }
        await this.db.projects.put(projectToRow(next))
        if (options.thumbnail) {
          await this.db.thumbnails.put({ projectId: project.id, blob: options.thumbnail })
        }
        // Clean up assets no longer referenced by this snapshot. Assets newer than the
        // snapshot are kept: they may belong to an edit that is not in this snapshot yet.
        const referenced = collectAssetIds(project.config)
        const stale = await this.db.assets
          .where('projectId')
          .equals(project.id)
          .filter((a) => !referenced.has(a.id) && a.lastAttachedAt < options.snapshotAt)
          .primaryKeys()
        if (stale.length) await this.db.assets.bulkDelete(stale)
        return next
      }),
    )
  }

  delete(id: LocalProjectId): Promise<void> {
    return guard(() =>
      this.db.transaction('rw', [this.db.projects, this.db.assets, this.db.thumbnails, this.db.meta], async () => {
        await this.db.assets.where('projectId').equals(id).delete()
        await this.db.thumbnails.delete(id)
        await this.db.projects.delete(id)
        const last = await this.db.meta.get('lastProjectId')
        if (last?.value === id) await this.db.meta.delete('lastProjectId')
      }),
    )
  }
}

const stripBlob = ({ blob: _blob, ...meta }: AssetRecord): AssetMeta => meta

export class LocalAssetRepository implements AssetRepository {
  private readonly db: LocalDatabase

  constructor(db: LocalDatabase) {
    this.db = db
  }

  put(record: AssetRecord): Promise<void> {
    return guard(async () => {
      await this.db.assets.put(record)
    })
  }

  get(id: AssetId): Promise<AssetRecord | null> {
    return guard(async () => (await this.db.assets.get(id)) ?? null)
  }

  getMany(ids: Iterable<AssetId>): Promise<Map<AssetId, AssetRecord>> {
    return guard(async () => {
      const list = [...new Set(ids)]
      const rows = await this.db.assets.bulkGet(list)
      const map = new Map<AssetId, AssetRecord>()
      rows.forEach((r) => {
        if (r) map.set(r.id, r)
      })
      return map
    })
  }

  /**
   * Reuses an identical image already stored for this project (refreshing its
   * lastAttachedAt), or stores `create()` as a new record. Atomic.
   */
  attach(projectId: LocalProjectId, hash: string, create: () => AssetRecord): Promise<AssetMeta> {
    return guard(() =>
      this.db.transaction('rw', this.db.assets, async () => {
        const existing = await this.db.assets.where('[projectId+hash]').equals([projectId, hash]).first()
        const now = Date.now()
        if (existing) {
          await this.db.assets.update(existing.id, { lastAttachedAt: now })
          return stripBlob({ ...existing, lastAttachedAt: now })
        }
        const record = create()
        await this.db.assets.put(record)
        return stripBlob(record)
      }),
    )
  }

  findByHash(projectId: LocalProjectId, hash: string): Promise<AssetMeta | null> {
    return guard(async () => {
      const row = await this.db.assets.where('[projectId+hash]').equals([projectId, hash]).first()
      return row ? stripBlob(row) : null
    })
  }

  listMeta(projectId: LocalProjectId): Promise<AssetMeta[]> {
    return guard(async () => (await this.db.assets.where('projectId').equals(projectId).toArray()).map(stripBlob))
  }
}

export class LocalSettingsRepository implements SettingsRepository {
  private readonly db: LocalDatabase

  constructor(db: LocalDatabase) {
    this.db = db
  }

  getLastProjectId(): Promise<LocalProjectId | null> {
    return guard(async () => {
      const row = await this.db.meta.get('lastProjectId')
      return typeof row?.value === 'string' ? row.value : null
    })
  }

  setLastProjectId(id: LocalProjectId | null): Promise<void> {
    return guard(async () => {
      if (id) await this.db.meta.put({ key: 'lastProjectId', value: id })
      else await this.db.meta.delete('lastProjectId')
    })
  }
}

export interface LocalRepositories {
  db: LocalDatabase
  projects: LocalProjectRepository
  assets: LocalAssetRepository
  settings: LocalSettingsRepository
}

export function createLocalRepositories(dbName?: string): LocalRepositories {
  const db = new LocalDatabase(dbName)
  return {
    db,
    projects: new LocalProjectRepository(db),
    assets: new LocalAssetRepository(db),
    settings: new LocalSettingsRepository(db),
  }
}
