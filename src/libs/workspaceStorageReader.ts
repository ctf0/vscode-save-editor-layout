import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'
import * as util from './util'
import {relaunchApp} from './relaunch'

const dbName = 'state.vscdb'

async function pathExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true).catch(() => false)
}

async function askYesNo(message: string): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(message, {modal: true}, 'Yes')

    return choice === 'Yes'
}

// a snapshot file name comes from the config list; refuse anything that is
// not a bare file name so it can never escape the workspace storage dir
function assertBareFileName(file: string): void {
    if (!file || path.basename(file) !== file) {
        throw new Error(`invalid snapshot file name: ${file}`)
    }
}

// two snapshots saved in the same millisecond would collide; append a
// counter until the name is free (pathExists races are serialized by the
// callers, so the window is tiny)
async function uniqueSnapshotFileName(dbPath: string, prefix: string, timestamp: number): Promise<string> {
    let fileName = `${prefix}_${timestamp}.vscdb`
    let i = 1

    while (await pathExists(util.getNewFileFullPath(dbPath, fileName))) {
        fileName = `${prefix}_${timestamp}_${i++}.vscdb`
    }

    return fileName
}

async function backupStateDb(dbPath: string, prefix: string, snapshotName: (timestamp: number) => string): Promise<string> {
    const timestamp = Date.now()
    const fileName = await uniqueSnapshotFileName(dbPath, prefix, timestamp)

    await fs.copyFile(dbPath, util.getNewFileFullPath(dbPath, fileName))

    // read-modify-write is serialized so a concurrent save/delete cannot
    // clobber this entry
    await util.mutateList((list) => {
        const entry = {file: fileName, name: snapshotName(timestamp)}

        return [...list.filter((item) => item.file !== fileName), entry]
    })

    return fileName
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export class WorkspaceStorageReader {
    private context              : vscode.ExtensionContext
    private workspaceStoragePath : string | undefined
    dbFilePath                   : string | undefined

    constructor(context: vscode.ExtensionContext) {
        this.context = context
        this.workspaceStoragePath = this.getWorkspaceStoragePath()
    }

    /**
     * Get the workspace storage path
     * @returns The path to the workspace storage directory or undefined if not available
     */
    getWorkspaceStoragePath(): string | undefined {
        if (this.context.storageUri) {
            // storageUri points at the extension's own workspace folder:
            // '<user-data>/User/workspaceStorage/<hash>/<extension-id>'
            // the workspace db (state.vscdb) lives one level up at the hash root,
            // in every install type (local, portable, remote)
            return path.dirname(this.context.storageUri.fsPath)
        }

        return undefined
    }

    async setStateDbPath(): Promise<string> {
        if (this.dbFilePath) {
            return this.dbFilePath
        }

        const ws = this.workspaceStoragePath

        if (!ws) {
            throw new Error('No Initial state saved yet, try restarting and try again')
        }

        // state.vscdb always lives at the workspaceStorage hash dir root,
        // no need to search the parent dirs
        this.dbFilePath = path.join(ws, dbName)

        return this.dbFilePath
    }

    async saveStateSnapshot() {
        await util.withError('saving layout snapshot', async() => {
            const dbPath = await this.setStateDbPath()

            const name = await vscode.window.showInputBox({
                prompt        : 'Enter a name for this layout snapshot',
                placeHolder   : 'My Layout',
                validateInput : (value) => this.validateSnapshotName(value),
            })

            if (!name) {
                return
            }

            const saveMode = await this.resolveSaveMode()

            if (!saveMode) {
                return
            }

            if (saveMode === 'quick') {
                util.showMsg(`Creating snapshot at: ${path.dirname(dbPath)}`)

                await backupStateDb(dbPath, 'state_snapshot', () => name)

                util.showMsg(`Layout snapshot saved: ${name}`)
            } else {
                // accurate: quit → helper copies the freshly-flushed db →
                // relaunch. The snapshot file name is computed now so the
                // helper knows where to write, and the marker carries the
                // name so the next activation can register it in the list.
                const fileName = await uniqueSnapshotFileName(dbPath, 'state_snapshot', Date.now())
                const fullPath = util.getNewFileFullPath(dbPath, fileName)

                await relaunchApp(
                    {type: 'snapshot', source: dbPath, dest: fullPath},
                    {type: 'snapshot', name, file: fileName},
                )
            }
        })
    }

    private async resolveSaveMode(): Promise<'quick' | 'accurate' | undefined> {
        const mode = util.getSaveMode()

        if (mode !== 'ask') {
            return mode
        }

        // ask: show a quick pick so the user decides each time
        const choice = await vscode.window.showQuickPick(
            [
                {
                    label       : '$(zap) Quick Save',
                    description : 'Save immediately without restarting',
                    mode        : 'quick' as const,
                },
                {
                    label       : '$(sync) Accurate Save',
                    description : 'Restart VS Code to capture the exact layout',
                    mode        : 'accurate' as const,
                },
            ],
            {placeHolder: 'Choose how to save this snapshot'},
        )

        // cancelled: skip the save instead of surfacing an error
        return choice?.mode
    }

    private validateSnapshotName(value: string): string | null {
        if (!value) {
            return 'Name cannot be empty'
        }

        // keep the config list JSON-safe and the name shell-safe;
        // it lands in settings.json and the tree view label
        if (!/^[\w\s\-().,]+$/.test(value)) {
            return 'Name may only contain letters, numbers, spaces and -().,_'
        }

        if (util.getList().some((item) => item.name === value)) {
            return 'A snapshot with this name already exists'
        }

        return null
    }

    async restoreStateSnapshot(snapshotFileName: string) {
        await util.withError('restoring layout snapshot', async() => {
            assertBareFileName(snapshotFileName)

            if (await askYesNo('Layout snapshot restored, VS Code needs to be shutdown then reopened to apply changes. shutdown now?')) {
                const dbPath = await this.setStateDbPath()
                const fullPath = util.getNewFileFullPath(dbPath, snapshotFileName)

                if (!await pathExists(fullPath)) {
                    throw new Error(`snapshot file not found: ${fullPath}`)
                }

                // the copy itself runs in the helper AFTER the shutdown, so VS
                // Code's state-save cannot overwrite the restored layout
                const name = util.getList().find((item) => item.file === snapshotFileName)?.name ?? snapshotFileName

                await relaunchApp({type: 'copy', source: fullPath, dest: dbPath}, {type: 'snapshot', name})
            }
        })
    }

    async deleteStateSnapshot(snapshotItem: {label: string, filePath: string}) {
        await util.withError('deleting layout snapshot', async() => {
            assertBareFileName(snapshotItem.filePath)

            if (!await askYesNo(`Are you sure you want to delete the snapshot "${snapshotItem.label}"?`)) {
                return
            }

            const fullPath = util.getNewFileFullPath(await this.setStateDbPath(), snapshotItem.filePath)

            await fs.unlink(fullPath)

            // remove by file name, not label: the label is user-editable in
            // the settings json and two entries could share it
            await util.mutateList((list) => list.filter((item) => item.file !== snapshotItem.filePath))

            util.showMsg('Layout snapshot deleted')
        })
    }

    /**
     * Extract the workspace-scoped layout keys from the current workspace db
     * and store them in a template db inside the extension global storage.
     * An existing template is simply overwritten.
     */
    async saveLayoutTemplate() {
        await util.withError('saving layout template', async() => {
            if (!await askYesNo('VS Code needs to be restarted to capture the current layout accurately. Restart now?')) {
                return
            }

            const dbPath = await this.setStateDbPath()
            const templatePath = util.getTemplatePath(this.context)

            await relaunchApp(
                {type: 'save-template', source: dbPath, dest: templatePath},
                {type: 'template-saved'},
            )
        })
    }

    /**
     * Apply the layout template to the current workspace db:
     * 1. backup the current db as a timestamped snapshot (registered in the list)
     * 2. merge the template keys into the workspace db
     * 3. shut down so VS Code re-reads the db on the next launch
     */
    async applyLayoutTemplate() {
        await util.withError('applying layout template', async() => {
            const templatePath = await util.requireTemplate(this.context)

            if (!templatePath) {
                return
            }

            if (!await askYesNo('Apply template layout? A backup snapshot will be created, then VS Code needs to be shut down and reopened to apply changes. Shutdown now?')) {
                return
            }

            const dbPath = await this.setStateDbPath()

            const backupFile = await backupStateDb(dbPath, 'state_backup', (timestamp) => `Backup ${new Date(timestamp).toLocaleString()}`)

            try {
                // the merge runs in the helper AFTER the shutdown, so VS Code's
                // state-save cannot overwrite the merged rows
                await relaunchApp({type: 'merge', source: templatePath, dest: dbPath}, {type: 'template'})
            } catch (error) {
                // relaunch failed: undo the backup we just created so we don't
                // leave a snapshot the user never asked for
                await fs.unlink(util.getNewFileFullPath(dbPath, backupFile)).catch(() => undefined)
                await util.mutateList((list) => list.filter((item) => item.file !== backupFile))

                throw error
            }
        })
    }

    /**
     * Apply the layout template to workspaces that were never auto-applied
     * before, when the saveEditorLayout.autoApplyLayoutTemplate setting is
     * enabled:
     * 1. skip workspaces that already carry an auto-apply marker (file-based,
     *    so it works on every filesystem, unlike birthtime)
     * 2. merge the template keys into the workspace db
     * 3. shut down so VS Code re-reads the db on the next launch
     */
    async autoApplyLayoutTemplateIfNew() {
        await util.withError('auto-applying layout template', async() => {
            if (!vscode.workspace.workspaceFolders?.length) {
                return
            }

            const templatePath = util.getTemplatePath(this.context)

            if (!await pathExists(templatePath)) {
                return
            }

            const ws = this.workspaceStoragePath

            if (!ws) {
                return
            }

            // marker lives in the workspace storage folder and is deleted
            // together with it, so it never grows stale
            const markerPath = path.join(ws, util.AUTO_APPLY_MARKER)

            if (await pathExists(markerPath)) {
                return
            }

            const dbPath = path.join(ws, dbName)

            // VS Code creates the workspace db empty and only writes the final
            // layout once the editor finished restoring; backing up before
            // that would capture an unfinished copy, so wait out the
            // configurable startup delay before checking the db
            await sleep(util.getAutoApplyDelay())

            if (!await pathExists(dbPath)) {
                return
            }

            const dbStat = await fs.stat(dbPath)

            if (dbStat.size === 0) {
                return
            }

            // don't relaunch without warning: VS Code closing seconds after
            // opening would confuse the user otherwise
            if (!await askYesNo('Apply the layout template to this workspace? VS Code needs to restart to apply changes.')) {
                // remember the decline so we never nag on the next activation;
                // failures are ignored (a read-only storage dir just re-prompts)
                await fs.writeFile(markerPath, '').catch(() => undefined)

                return
            }

            // write the marker before the relaunch: the quit command kills the
            // host shortly after, so any write after it may never land
            await fs.writeFile(markerPath, '').catch(() => undefined)

            // no backup needed here: the helper snapshots the db to
            // state.vscdb.backup before merging and restores it if the result
            // fails the integrity check
            await relaunchApp({type: 'merge', source: templatePath, dest: dbPath}, {type: 'template'})
        })
    }
}
