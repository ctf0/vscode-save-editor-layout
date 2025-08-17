import vscode from 'vscode'
import {SnapshotTreeProvider} from './snapshotTreeProvider'
import * as utils from './util'
import {WorkspaceStorageReader} from './workspaceStorageReader'

export async function activate(context: vscode.ExtensionContext) {
    utils.readConfig()

    // Initialize workspace storage reader
    const reader = new WorkspaceStorageReader(context)

    // Initialize tree view provider
    const snapshotTreeProvider = new SnapshotTreeProvider()
    vscode.window.createTreeView('layouts_list', {treeDataProvider: snapshotTreeProvider})

    context.subscriptions.push(
        // config
        vscode.workspace.onDidChangeConfiguration(async(e) => {
            if (e.affectsConfiguration(utils.PACKAGE_NAME)) {
                utils.readConfig()
            }
        }),

        // commands
        vscode.commands.registerCommand(`${utils.CMND_NAME}.saveSnapshot`, async() => {
            await reader.saveStateSnapshot()
        }),

        vscode.commands.registerCommand(`${utils.CMND_NAME}.restoreSnapshot`, async(snapshotPath: string) => {
            await reader.restoreStateSnapshot(snapshotPath)
        }),

        vscode.commands.registerCommand(`${utils.CMND_NAME}.deleteSnapshot`, async(e) => {
            await reader.deleteStateSnapshot(e)
        }),
    )
}

export function deactivate() { }
