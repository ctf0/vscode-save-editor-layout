import * as fs from 'fs'
import * as path from 'path'
import {spawn} from 'child_process'
import * as vscode from 'vscode'
import type {PendingApplyMarker} from './util'

// db operation the helper applies AFTER the main process has exited, so VS
// Code's shutdown state-save can no longer overwrite the restored data
export type RelaunchOp
    = | {type: 'copy', source: string, dest: string}
      | {type: 'merge', source: string, dest: string}
      | {type: 'snapshot', source: string, dest: string}
      | {type: 'save-template', source: string, dest: string}

// the helper ships as a plain file next to the bundled out/ dir, and runs as
// a plain Node process after VS Code exits (see resources/relaunch-helper.js)
const HELPER_PATH = path.join(__dirname, '..', 'resources', 'relaunch-helper.js')

// The child must not inherit VS Code's IPC/pid env vars or it gets killed
// together with the app (https://github.com/microsoft/vscode/issues/111332).
// ELECTRON_RUN_AS_NODE is kept so the helper runs as plain Node.
function strippedEnv(): NodeJS.ProcessEnv {
    const env = {...process.env}

    for (const key of [
        'VSCODE_IPC_HOOK',
        'VSCODE_IPC_HOOK_EXTHOST',
        'VSCODE_IPC_HOOK_CLI',
        'VSCODE_NLS_CONFIG',
        'VSCODE_PID',
        'VSCODE_HANDLES_UNCAUGHT_ERRORS',
        'VSCODE_LOG_STACK',
    ]) {
        delete env[key]
    }

    return env
}

// The extension host runs as a nested helper app on macOS ("Code Helper
// (Plugin).app"), so process.execPath is NOT the main VS Code binary there.
// Relaunching that helper as a standalone app crashes on startup, so resolve
// the main app bundle and use its real executable (Electron on older builds,
// "Code" on newer ones).
function resolveMainBinary(): string {
    if (process.platform !== 'darwin') {
        return process.execPath
    }

    const appRoot = findAppRoot()

    if (!appRoot) {
        return process.execPath
    }

    const macosDir = path.join(appRoot, 'Contents', 'MacOS')

    if (fs.existsSync(macosDir)) {
        // prefer the known main-binary names first ("Code" on modern builds,
        // "Electron" on older ones); taking the first non-hidden file is a
        // last resort because helper binaries can live here too
        return findMainBinary(macosDir)
    }

    return process.execPath
}

// the first path segment ending in .app is the app bundle root
function findAppRoot(): string | undefined {
    const parts = process.execPath.split(path.sep)

    for (let i = 1; i < parts.length; i++) {
        if (parts[i].endsWith('.app')) {
            return parts.slice(0, i + 1).join(path.sep)
        }
    }

    return undefined
}

function findMainBinary(macosDir: string): string {
    for (const name of ['Code', 'Electron', 'code']) {
        const candidate = path.join(macosDir, name)

        if (fs.existsSync(candidate)) {
            return candidate
        }
    }

    for (const entry of fs.readdirSync(macosDir)) {
        if (entry.startsWith('.')) {
            continue
        }

        if (fs.statSync(path.join(macosDir, entry)).isFile()) {
            return path.join(macosDir, entry)
        }
    }

    return path.join(macosDir, 'Electron')
}

/**
 * Close VS Code and reopen it automatically, like an update restart.
 * Required after the state db was replaced, so the new layout is read on boot.
 * An optional db op is applied by the helper AFTER the main process has
 * exited (the workspace db is closed by then), so the shutdown state-save
 * cannot overwrite the restored data.
 */
export async function relaunchApp(op?: RelaunchOp, marker?: PendingApplyMarker): Promise<void> {
    const args = ['--reuse-window']

    const workspaceFile = vscode.workspace.workspaceFile?.fsPath
    const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []

    if (workspaceFile) {
        args.push(workspaceFile)
    } else {
        args.push(...folders)
    }

    if (!fs.existsSync(HELPER_PATH)) {
        throw new Error(`relaunch helper not found at ${HELPER_PATH}`)
    }

    const helper = spawn(resolveMainBinary(), [
        HELPER_PATH,
        process.env.VSCODE_PID ?? '',
        JSON.stringify(op ?? null),
        JSON.stringify(marker ?? null),
        ...args,
    ], {
        detached    : true,
        stdio       : 'ignore',
        windowsHide : true,
        env         : strippedEnv(),
    })
    helper.unref()

    await vscode.commands.executeCommand('workbench.action.quit')
}
