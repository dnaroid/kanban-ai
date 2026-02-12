import { ipcHandlers } from '../validation'
import {
  BackupExportInputSchema,
  BackupExportResponseSchema,
  BackupImportInputSchema,
  BackupImportResponseSchema,
} from "@shared/types/ipc"
import { backupService } from '../../backup/backup-service'

export function registerBackupHandlers(): void {
  ipcHandlers.register('backup:exportProject', BackupExportInputSchema, async (_, input) => {
    const result = backupService.exportProject({
      projectId: input.projectId,
      toPath: input.toPath,
    })
    return BackupExportResponseSchema.parse(result)
  })

  ipcHandlers.register('backup:importProject', BackupImportInputSchema, async (_, input) => {
    const result = backupService.importProject({
      zipPath: input.zipPath,
      mode: input.mode,
      projectPath: input.projectPath,
    })
    return BackupImportResponseSchema.parse(result)
  })
}
