import {findUp} from 'find-up'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'
import * as util from './util'

const dbName = 'state.vscdb'

export class WorkspaceStorageReader {
    private context: vscode.ExtensionContext
    private workspaceStoragePath: string | undefined
    dbFilePath: string | undefined

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
            return this.context.storageUri.fsPath
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

        const stopAt = ws.split(path.sep).slice(0, -1).join(path.sep)

        const dbFile = await findUp(dbName, {
            cwd: ws,
            stopAt: stopAt,
        })

        if (!dbFile) {
            throw new Error('No db found')
        }

        this.dbFilePath = dbFile

        return dbFile
    }

    async saveStateSnapshot() {
        try {
            const dbPath = await this.setStateDbPath()

            util.showMsg(`Creating snapshot at: ${path.dirname(dbPath)}`)

            // If no name provided, show quick input
            const name = await vscode.window.showInputBox({
                prompt: 'Enter a name for this layout snapshot',
                placeHolder: 'My Layout',
                validateInput(value) {
                    if (!value) {
                        return 'Name cannot be empty'
                    }

                    if (util.getList().some((item) => item.name == value)) {
                        return 'A snapshot with this name already exists'
                    }

                    return null
                },
            })

            // If user cancelled, exit
            if (!name) {
                return
            }

            // Create snapshot filename with name
            const timestamp = Date.now()
            const snapshotFileName = `state_snapshot_${timestamp}.vscdb`
            const snapshotPath = util.getNewFileFullPath(dbPath, snapshotFileName)

            await fs.copyFile(dbPath, snapshotPath)

            // Save the snapshot name to the configuration as an array of objects
            const existingList = util.getList()
            existingList.push({
                file: snapshotFileName,
                name: name,
            })

            await util.updateList(existingList)

            util.showMsg(`Layout snapshot saved: ${name}`)
        } catch (error) {
            // console.error('Error saving state snapshot:', error)
            await util.showMsg(`Error saving layout snapshot: ${error}`, true)
        }
    }

    async restoreStateSnapshot(snapshotFileName: string) {
        try {
            const dbPath = await this.setStateDbPath()
            const fullPath = util.getNewFileFullPath(dbPath, snapshotFileName)

            await fs.copyFile(fullPath, dbPath)

            const confirm = await vscode.window.showWarningMessage(
                'Layout snapshot restored, VS Code needs to be shutdown then reopened to apply changes. shutdown now?',
                {modal: true},
                'Yes', 'No',
            )

            if (confirm === 'Yes') {
                await vscode.commands.executeCommand('workbench.action.quit')
            }
        } catch (error) {
            // console.error('Error restoring state snapshot:', error)
            await util.showMsg(`Error restoring layout snapshot: ${error}`, true)
        }
    }

    async deleteStateSnapshot(snapshotItem) {
        try {
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to delete the snapshot "${snapshotItem.label}"?`,
                {modal: true},
                'Yes', 'No',
            )

            if (confirm !== 'Yes') {
                return
            }

            const fullPath = util.getNewFileFullPath(await this.setStateDbPath(), snapshotItem.filePath)

            await fs.unlink(fullPath)

            const existingList = util.getList()
            const newList = existingList.filter((item) => item.name !== snapshotItem.label)

            await util.updateList(newList)

            util.showMsg('Layout snapshot deleted')
        } catch (error) {
            // console.error('Error deleting state snapshot:', error)
            await util.showMsg(`Error deleting layout snapshot: ${error}`, true)
        }
    }
}
