import path from 'path'
import * as vscode from 'vscode'

export const PACKAGE_NAME = 'saveEditorLayout'
export const CMND_NAME = 'editorLayout'
export let config: any = {}

export function readConfig() {
    config = vscode.workspace.getConfiguration(PACKAGE_NAME)
}

export function getList() {
    return config.get('list', [])
}

export async function updateList(data) {
    await config.update('list', data, vscode.ConfigurationTarget.Workspace)
}

export function getSnapshotName(snapshotName) {
    const list = getList()
    const item = list.find((item) => item.file === snapshotName)

    return item ? item.name : undefined
}

export function getNewFileFullPath(dbPath, file) {
    return path.join(path.dirname(dbPath), file)
}

export function showMsg(msg, error = false, args: string[] = []) {
    return error
        ? vscode.window.showErrorMessage(`Save Editors Layout: ${msg}`, ...args)
        : vscode.window.showInformationMessage(`Save Editors Layout: ${msg}`, ...args)
}
