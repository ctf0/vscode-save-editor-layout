import {existsSync} from 'fs'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import {DatabaseSync} from 'node:sqlite'
import * as vscode from 'vscode'
import * as utils from './util'
import {WorkspaceStorageReader} from './workspaceStorageReader'
import {SnapshotTreeProvider} from '../providers/snapshotTreeProvider'

export function registerCommands(
    context: vscode.ExtensionContext,
    reader: WorkspaceStorageReader,
    snapshotTreeProvider: SnapshotTreeProvider,
): vscode.Disposable[] {
    return [
        vscode.commands.registerCommand(`${utils.CMND_NAME}.saveSnapshot`, async() => await reader.saveStateSnapshot()),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.restoreSnapshot`, async(snapshotPath: string) => await reader.restoreStateSnapshot(snapshotPath)),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.deleteSnapshot`, async(e: {label: string, filePath: string}) => await reader.deleteStateSnapshot(e)),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.saveTemplate`, async() => await reader.saveLayoutTemplate()),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.updateTemplate`, async() => await reader.saveLayoutTemplate()),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.applyTemplate`, async() => await reader.applyLayoutTemplate()),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.refresh`, async() => snapshotTreeProvider.refresh()),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.shareTemplate`, () => shareTemplate(context)),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.importTemplate`, () => importTemplate(context)),
    ]
}

async function shareTemplate(context: vscode.ExtensionContext) {
    await utils.withError('sharing layout template', async() => {
        const templatePath = await utils.requireTemplate(context)

        if (!templatePath) {
            return
        }

        // let the user pick the destination instead of assuming ~/Desktop,
        // which is localized (or missing) on some systems
        const defaultUri = vscode.Uri.file(path.join(os.homedir(), 'Desktop', utils.TEMPLATE_FILE_NAME))
        const target = await vscode.window.showSaveDialog({
            defaultUri,
            saveLabel : 'Export',
            title     : 'Export Layout Template',
        })

        if (!target) {
            return
        }

        await fs.copyFile(templatePath, target.fsPath)

        vscode.commands.executeCommand('revealFileInOS', target)
        utils.showMsg(`Layout template exported to ${target.fsPath}`)
    })
}

async function importTemplate(context: vscode.ExtensionContext) {
    await utils.withError('importing layout template', async() => {
        const selected = await vscode.window.showOpenDialog({
            canSelectMany : false,
            openLabel     : 'Import',
            title         : 'Import Layout Template',
            filters       : {
                'VS Code Databases' : ['vscdb'],
                'All Files'         : ['*'],
            },
        })

        if (!selected || !selected.length) {
            return
        }

        const sourcePath = selected[0].fsPath

        // verify the db actually opens and passes an integrity check, so a
        // corrupt template is never installed; opening garbage as sqlite
        // throws, so this single check covers both "not sqlite" and "corrupt"
        try {
            const db = new DatabaseSync(sourcePath)
            const rows = db.prepare('PRAGMA quick_check').all() as {quick_check: string}[]

            if (!rows.length || rows[0].quick_check !== 'ok') {
                db.close()
                await utils.showError('Selected file failed its integrity check and cannot be imported')

                return
            }

            db.close()
        } catch {
            await utils.showError('Selected file is not a valid vscdb template')

            return
        }

        const templatePath = utils.getTemplatePath(context)

        if (existsSync(templatePath)) {
            const answer = await vscode.window.showWarningMessage(
                'A layout template already exists. Importing will overwrite it. Continue?',
                {modal: true},
                'Overwrite',
            )

            if (answer !== 'Overwrite') {
                return
            }
        }

        await fs.copyFile(sourcePath, templatePath)
        await utils.updateTemplateContext(context)
        utils.showMsg(`Layout template imported to ${templatePath}`)
    })
}
