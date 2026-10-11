import { createLocalRepositories, type LocalRepositories } from '@/repositories/local/localRepositories'

/**
 * Composition root. Phase 1 wires only local repositories; phase 2 adds a cloud
 * repository here behind explicit save/export confirmation — never in this file's
 * autosave path.
 */
let repos: LocalRepositories | null = null

export function getRepositories(): LocalRepositories {
  repos ??= createLocalRepositories()
  return repos
}
