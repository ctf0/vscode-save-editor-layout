import * as vscode from 'vscode'
import * as utils from './libs/util'
import {registerCommands} from './libs/commands'
import {SnapshotTreeProvider} from './providers/snapshotTreeProvider'
import {WorkspaceStorageReader} from './libs/workspaceStorageReader'

let statusItem : vscode.StatusBarItem | undefined
let statusTimer : NodeJS.Timeout | undefined

export async function activate(context: vscode.ExtensionContext) {
    utils.readConfig()
    await utils.updateTemplateContext(context)

    await handlePendingApplyMarker(context)

    // clear the legacy workspaceState marker written by older versions
    await context.workspaceState.update(utils.PENDING_APPLY_KEY, undefined)

    const autoApplyLayoutTemplate = utils.getAutoApplyTemplate()

    if (autoApplyLayoutTemplate) {
        statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000)
        statusItem.text = 'Auto Apply Layout Template is enabled'
        statusItem.show()
        statusTimer = setTimeout(() => {
            statusItem?.dispose()
            statusItem = undefined
            statusTimer = undefined
        }, 3000)
    }

    // Initialize workspace storage reader
    const reader = new WorkspaceStorageReader(context)

    if (autoApplyLayoutTemplate) {
        void reader.autoApplyLayoutTemplateIfNew()
    }

    // Initialize tree view provider
    const snapshotTreeProvider = new SnapshotTreeProvider(reader)
    vscode.window.createTreeView('layouts_list', {treeDataProvider: snapshotTreeProvider})

    context.subscriptions.push(
        ...registerCommands(context, reader, snapshotTreeProvider),
        vscode.workspace.onDidChangeConfiguration(async(e) => {
            if (e.affectsConfiguration(utils.PACKAGE_NAME)) {
                utils.readConfig()
                // let the config write settle before re-reading the snapshot list
                setTimeout(() => snapshotTreeProvider.refresh(), 300)
            }
        }),
        // the workspace db path is cached on the reader; drop it when the
        // workspace layout changes so it cannot point at a stale storage dir
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            reader.dbFilePath = undefined
        }),
    )
}

// a restore relaunched VS Code; the helper wrote the marker file next to
// state.vscdb after applying the snapshot/template post-shutdown
async function handlePendingApplyMarker(context: vscode.ExtensionContext) {
    const markerPath = utils.getPendingApplyMarkerPath(context)

    if (!markerPath) {
        return
    }

    const marker = await utils.readPendingApplyMarker(markerPath)

    if (marker?.error) {
        utils.showError(`Layout apply failed:\n\n${marker.error}`)
    } else if (marker?.type === 'snapshot' && marker.file) {
        // accurate save: the helper wrote the snapshot file after shutdown;
        // register it in the list so it appears in the tree view
        await utils.mutateList((list) => {
            const entry = {file: marker.file!, name: marker.name ?? marker.file!}

            return [...list.filter((item) => item.file !== marker.file), entry]
        })

        utils.showMsg(`Layout snapshot saved: "${marker.name}"`)
    } else if (marker?.type === 'snapshot') {
        utils.showMsg(`Layout snapshot applied: "${marker.name}"`)
    } else if (marker?.type === 'template') {
        utils.showMsg(`Layout Template applied`)
    }
}

export function deactivate() {
    if (statusTimer) {
        clearTimeout(statusTimer)
        statusTimer = undefined
    }

    statusItem?.dispose()
    statusItem = undefined
}
