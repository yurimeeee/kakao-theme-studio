import type { ImageDecoder } from '@/assets/validation'
import type { LocalProjectId } from '@/domain/theme/types'
import type { ImageInspector } from '@/importers/ktheme/probe'
import { importErrorMessage, IMPORT_LIMITS, KthemeImportError, openZip } from '@/importers/ktheme/readArchive'
import { storageErrorMessage, StorageError } from '@/repositories/types'
import { BACKUP_EXTENSION, BACKUP_LIMITS, BackupError, backupErrorMessage, isProjectBackup, restoreProjectBackup } from './backup'
import { importKthemeFile } from './importKtheme'

export interface ImportResult {
  kind: 'ktheme' | 'backup'
  projectId: LocalProjectId
  name: string
  notes: string[]
}

/** 가져오기 takes either file kind; both are ZIPs, told apart by the backup manifest. */
export async function importThemeFile(file: Blob, deps: { inspect?: ImageInspector; decode?: ImageDecoder } = {}): Promise<ImportResult> {
  if (file.size > BACKUP_LIMITS.maxArchiveBytes) throw new KthemeImportError('too-large', 'File too large')
  const zip = await openZip(file)
  if (isProjectBackup(zip)) return { kind: 'backup', ...(await restoreProjectBackup(zip, deps.decode)) }
  if (file.size > IMPORT_LIMITS.maxArchiveBytes) throw new KthemeImportError('too-large', 'Archive too large')
  return { kind: 'ktheme', ...(await importKthemeFile(zip, deps.inspect)) }
}

export function importFailureMessage(e: unknown): string {
  if (e instanceof StorageError) return storageErrorMessage(e)
  if (e instanceof BackupError) return backupErrorMessage(e)
  if (e instanceof KthemeImportError && e.code === 'not-archive') return `테마 파일(.ktheme)이나 백업 파일(${BACKUP_EXTENSION})이 아니에요.`
  return importErrorMessage(e)
}
