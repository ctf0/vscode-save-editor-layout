import {existsSync} from 'fs'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'

export const PACKAGE_NAME = 'saveEditorLayout'
export const CMND_NAME = 'editorLayout'
// workspaceState key used by older versions to remember which snapshot was
// restored before the auto-relaunch; kept only to clear it on activation.
// The current flow uses a marker file (PENDING_APPLY_FILE) written by the
// relaunch helper after the shutdown.
export const PENDING_APPLY_KEY = 'pendingAppliedSnapshot'
// marker file written by the relaunch helper (next to state.vscdb) after it
// applied the snapshot/template, so the next activation can report it
const PENDING_APPLY_FILE = 'pending-apply.json'
// marker file written into a workspace storage folder once auto-apply has
// handled it, so a new activation never prompts for the same workspace again
// (filesystem-agnostic: works where birthtime is unavailable, and the marker
// is deleted together with the workspace)
export const AUTO_APPLY_MARKER = 'auto-apply-done'

let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(PACKAGE_NAME)

// Keys that define the workspace-scoped layout, verified against the installed
// VS Code's layout-state table (StorageScope.WORKSPACE keys only). Keys that
// are genuinely profile-scoped (panel.size / panel.alignment, ...) live in the
// global db, so they never appear in the workspace db in the first place; the
// whitelist below pins the workspace-scoped set that prefix matching alone
// would be too generous about.
const layoutKeyWhitelist = new Set([
    'workbench.panel.position',
    'workbench.sideBar.position',
    'workbench.panel.hidden',
    'workbench.sideBar.hidden',
    'workbench.auxiliaryBar.hidden',
    'workbench.activityBar.hidden',
    'workbench.statusBar.hidden',
    'workbench.editor.hidden',
    'workbench.editor.centered',
    'workbench.panel.wasLastMaximized',
    'workbench.auxiliaryBar.wasLastMaximized',
    'workbench.auxiliaryBar.lastNonMaximizedVisibility',
    'workbench.panelpart.activepanelid',
    'workbench.auxiliarybar.activepanelid',
    'workbench.activity.viewletsWorkspaceState',
    'workbench.auxiliarybar.viewContainersWorkspaceState',
    'workbench.panel.viewContainersWorkspaceState',
    'workbench.explorer.views.state',
])

// Mementos that contain layout preferences (which controls are visible,
// expanded, etc.), not workspace-specific content like search queries.
const mementoWhitelist = new Set([
    'memento/workbench.panel.markers',
    'memento/workbench.view.search',
])

export function isLayoutKey(key: string): boolean {
    if (mementoWhitelist.has(key)) {
        return true
    }

    // View content (search queries, tree expansion, mementos) is workspace-
    // specific data, not layout; applying it to another workspace would
    // restore stale data in the views.
    if (key.startsWith('memento/') || key.endsWith('.treeViewState')) {
        return false
    }

    if (layoutKeyWhitelist.has(key)) {
        return true
    }

    // The `.hidden` variants are profile-scoped (global), not workspace state
    if (key.endsWith('.hidden') || key.includes('.state.hidden')) {
        return false
    }

    // workbench.view.*      = viewlet (sidebar/panel container) states
    // workbench.views.service.* = per-container view states (nested views, keyed by container id)
    // workbench.panel.<id>  = panel container states (e.g. chat panel nested views)
    return key.startsWith('workbench.view.')
      || key.startsWith('workbench.views.service.')
      || key.startsWith('workbench.panel.')
}

export type SaveMode = 'quick' | 'accurate' | 'ask'

export function getSaveMode(): SaveMode {
    return config.get<SaveMode>('saveMode', 'quick')
}

export type PendingApplyMarker = {
    type?  : 'snapshot' | 'template' | 'template-saved'
    name?  : string
    file?  : string
    count? : number
    error? : string
}

export function getPendingApplyMarkerPath(context: vscode.ExtensionContext): string | undefined {
    if (!context.storageUri) {
        return undefined
    }

    // storageUri points at the extension's own workspace folder; the marker
    // lives at the workspaceStorage hash root, next to state.vscdb
    return path.join(path.dirname(context.storageUri.fsPath), PENDING_APPLY_FILE)
}

/**
 * Read (and remove) the pending-apply marker left by the relaunch helper.
 * Returns undefined when there is no marker or it cannot be parsed.
 */
export async function readPendingApplyMarker(filePath: string): Promise<PendingApplyMarker | undefined> {
    try {
        const marker = JSON.parse(await fs.readFile(filePath, 'utf8')) as PendingApplyMarker
        await fs.unlink(filePath).catch(() => undefined)

        return marker
    } catch (error) {
        // a missing marker is the normal "no pending apply" case, not an
        // error: only log real problems (corrupt json, io failures) so a
        // failed layout apply can still be traced
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.error('failed to read pending apply marker:', error)
        }

        await fs.unlink(filePath).catch(() => undefined)

        return undefined
    }
}

export function readConfig() {
    config = vscode.workspace.getConfiguration(PACKAGE_NAME)
}

export type SnapshotListEntry = {file: string, name: string}

export function getList(): SnapshotListEntry[] {
    // snapshots are per-workspace, so only the workspace-scoped value counts;
    // a user-level value would otherwise leak into every workspace
    return config.inspect<SnapshotListEntry[]>('list')?.workspaceValue ?? []
}

export function getAutoApplyTemplate(): boolean {
    return config.get('autoApplyLayoutTemplate', false)
}

export function getAutoApplyDelay(): number {
    return config.get('autoApplyDelay', 10) * 1000
}

export async function updateList(data: SnapshotListEntry[]) {
    await config.update('list', data, vscode.ConfigurationTarget.Workspace)
}

// Serializes concurrent read-modify-write cycles on the snapshot list so a
// rapid save/delete cannot clobber a concurrent change.
let listMutex: Promise<void> = Promise.resolve()

export async function mutateList(fn: (list: SnapshotListEntry[]) => SnapshotListEntry[] | Promise<SnapshotListEntry[]>): Promise<SnapshotListEntry[]> {
    const prev = listMutex
    const op = prev.then(async() => {
        const next = await fn(getList())
        await config.update('list', next, vscode.ConfigurationTarget.Workspace)

        return next
    })
    listMutex = op.then(() => undefined, () => undefined)

    return op
}

export function getNewFileFullPath(dbPath: string, file: string) {
    return path.join(path.dirname(dbPath), file)
}

export const TEMPLATE_FILE_NAME = 'layout_template.vscdb'

export function getTemplatePath(context: vscode.ExtensionContext) {
    return path.join(context.globalStorageUri.fsPath, TEMPLATE_FILE_NAME)
}

/**
 * Keep the `editorLayout.hasTemplate` context key in sync with the template
 * file's existence; the command palette `when` clauses depend on it.
 */
export async function updateTemplateContext(context: vscode.ExtensionContext) {
    await vscode.commands.executeCommand('setContext', 'editorLayout.hasTemplate', existsSync(getTemplatePath(context)))
}

/**
 * Resolve the template path when the template file exists, otherwise inform
 * the user and return undefined.
 */
export async function requireTemplate(context: vscode.ExtensionContext): Promise<string | undefined> {
    const templatePath = getTemplatePath(context)

    if (existsSync(templatePath)) {
        return templatePath
    }

    await showError('No layout template found, save one first')

    return undefined
}

/**
 * Run an operation and report failures through `showMsg` instead of letting
 * them escape as unhandled rejections.
 */
export async function withError(action: string, fn: () => Promise<void>): Promise<void> {
    try {
        await fn()
    } catch (error) {
        await showError(`Error ${action}: ${error}`)
    }
}

export function showMsg(msg: string) {
    return vscode.window.showInformationMessage(msg)
}

export function showError(msg: string) {
    return vscode.window.showErrorMessage(msg)
}
