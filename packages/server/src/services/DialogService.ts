import { exec as nodeExec } from 'child_process'
import { promisify } from 'util'

const exec = promisify(nodeExec)

export class DialogService {
  async selectFolder(): Promise<string | null> {
    const platform = process.platform
    let command: string | null = null

    if (platform === 'darwin') {
      command = `osascript -e 'tell application "System Events" to set theFolder to choose folder with prompt "Select folder"' -e 'POSIX path of theFolder'`
    } else if (platform === 'win32') {
      command = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $dlg=New-Object System.Windows.Forms.FolderBrowserDialog; if ($dlg.ShowDialog() -eq 'OK') { Write-Output $dlg.SelectedPath }"`
    } else if (platform === 'linux') {
      command = `zenity --file-selection --directory --title="Select folder"`
    } else {
      return null
    }

    try {
      const { stdout } = await exec(command, { windowsHide: true })
      const trimmed = stdout.trim()
      return trimmed || null
    } catch (error) {
      const err = error as NodeJS.ErrnoException
      if (platform === 'linux' && err?.code === 'ENOENT') {
        return null
      }
      return null
    }
  }
}
