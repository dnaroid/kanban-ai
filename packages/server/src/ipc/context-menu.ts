import { Menu, MenuItem, BrowserWindow } from 'electron'

export function registerContextMenu(window: BrowserWindow) {
  window.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu()

    if (params.isEditable) {
      menu.append(new MenuItem({ role: 'undo' }))
      menu.append(new MenuItem({ role: 'redo' }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ role: 'cut' }))
      menu.append(new MenuItem({ role: 'copy' }))
      menu.append(new MenuItem({ role: 'paste' }))
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(new MenuItem({ role: 'selectAll' }))
    } else if (params.selectionText.trim().length > 0) {
      menu.append(new MenuItem({ role: 'copy' }))
    } else {
      return
    }

    menu.popup({ window })
  })
}
