const vscode         = require('vscode')
const {TreeProvider} = require('./TreeProvider')
const fs_path        = require('path')
const {PACKAGE_NAME} = require('./util')

let config                = {}
let saveAbsolutePath      = true
let saveToGlobal          = true
let closeEditorsAfterSave = true
let hideSideBarAfterOpen  = true
let defaultOrientation    = 0

let untitledItems = []
let saveList      = []
let ws            = null

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    await readConfig()

    vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(PACKAGE_NAME)) {
            await readConfig()
        }
    })

    // normal
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.save', save))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.open', open))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.remove', remove))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.update', update))

    // tree
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.openFile', openFile))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.openGroup', openGroup))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.openSettingsFile', openSettingsFile))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.closeAll', (e) => closeAllEditors(true)))

    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.treeRemove', treeRemoveFileOrGroup))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnBelow', async (e) => await treeColumnPosition(e, 'Below')))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnRight', async (e) => await treeColumnPosition(e, 'Right')))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnInc', async (e) => await treeColumnNumber(e, +1)))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnSub', async (e) => await treeColumnNumber(e, -1)))

    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.groupVertical', async (e) => await treeGroupOrintation(e, 1)))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.groupHorizontal', async (e) => await treeGroupOrintation(e, 0)))
    vscode.window.createTreeView(
        'layouts_list',
        {
            treeDataProvider : new TreeProvider(),
            showCollapseAll  : true
        }
    )
}

/* ---------------------------------- ops --------------------------------- */
async function save() {
    await loopOver()

    if (!checkForSaveList()) {
        return
    }

    let name = await vscode.window.showInputBox({
        placeHolder: 'add name for the group',
        validateInput(v) {
            if (!v) {
                return 'you have to add a name'
            } else if (v && nameIsTaken(v)) {
                return `"${v}" is already taken, try something else`
            } else {
                return ''
            }
        }
    })

    if (name) {
        if (untitledItems.length) {
            showUntitledError()
        }

        let list = getGroupsList()
        list.push({
            name        : name,
            orientation : defaultOrientation,
            documents   : sortList(saveList)
        })

        await saveUserLists(list)
        showMsg(`"${name}" group saved`)

        return closeAllEditors()
    }
}

async function open(groupName = null) {

    let selection = null
    let list      = getGroupsList()

    if (groupName) {
        selection = groupName
    } else {
        let names = getNamesList(list)
        selection = await showQuickPick(names, 'open')
    }

    if (selection) {
        let group                    = list.find((e) => e.name == selection)
        let {documents, orientation} = group

        if (hideSideBarAfterOpen) {
            await runCommand('workbench.action.focusSideBar')
            await runCommand('workbench.action.toggleSidebarVisibility')
        }

        // setup layout
        let groups = []

        for (let i = 0; i < documents.length; i++) {
            const item  = documents[i]
            let current = groups[item.column - 1]

            if (current) {
                if (item.position || !current.groups.length) {
                    current.groups.push({})
                }
            } else {
                let data = {
                    groups : [],
                    size   : 0.5
                }

                if (item.position || !data.groups.length) {
                    data.groups.push({})
                }

                groups.push(data)
            }
        }

        await runCommand('vscode.setEditorLayout', {
            orientation : orientation || 0,
            groups      : groups
        })

        // open files
        for (let i = 0; i < documents.length; i++) {
            const item = documents[i]

            try {
                await showDocument(item)

                if (item.position) {
                    await runCommand(`workbench.action.moveEditorTo${item.position}Group`)
                }
            } catch ({message}) {
                continue
            }
        }
    }
}

async function openGroup({group}) {
    return open(group)
}

async function remove(e) {
    let list      = getGroupsList()
    let names     = getNamesList(list)
    let selection = await showQuickPick(names, 'remove')

    if (selection) {
        let index = list.findIndex((e) => e.name == selection)
        list.splice(index, 1)
    }

    await saveUserLists(list)

    return showMsg(`"${selection}" group removed`)
}

async function update() {
    let list      = getGroupsList()
    let names     = getNamesList(list)
    let selection = await showQuickPick(names, 'update')

    if (selection) {
        let index = list.findIndex((e) => e.name == selection)
        await loopOver()

        if (!checkForSaveList()) {
            return
        }

        if (untitledItems.length) {
            showUntitledError()
        }

        list[index].documents = saveList
        await saveUserLists(list)
        showMsg(`"${selection}" group updated`)

        return closeAllEditors()
    }
}

function openFile(path, column) {
    return showDocument({
        fsPath : path,
        column : column
    })
}

/* Tree --------------------------------------------------------------------- */
async function treeRemoveFileOrGroup(e) {
    const {group, path} = e
    let list            = getGroupsList()

    if (path) {
        let name    = getFileName(path)
        let changes = false

        for (let i = 0; i < list.length; i++) {
            const el = list[i]

            if (el.name == group) {
                let index = el.documents.findIndex((e) => e.fsPath == path)

                if (index > -1) {
                    changes = true
                    el.documents.splice(index, 1)
                    break
                }
            }
        }

        if (changes) {
            await saveUserLists(list)

            return showMsg(`"${name}" removed , "${group}" group updated`)
        }
    } else {
        let index = list.findIndex((e) => e.name == group)
        list.splice(index, 1)

        await saveUserLists(list)

        return showMsg(`"${group}" group removed`)
    }
}

function treeColumnResolve(e) {
    const {group, path} = e
    let list            = getGroupsList()

    return {
        path  : path,
        name  : getFileName(path),
        list  : list,
        index : list.findIndex((e) => e.name == group)
    }
}

async function treeColumnPosition(e, type) {
    let {path, name, list, index} = treeColumnResolve(e)

    list[index].documents = list[index].documents.map((item, i) => {
        if (item.fsPath == path) {
            item.position = item.position == type ? null : type
        }

        return item
    })

    await saveUserLists(list)

    return showMsg(`"${name}" position updated`)
}

async function treeColumnNumber(e, amount) {
    let {path, name, list, index} = treeColumnResolve(e)
    let err                       = false

    list[index].documents = list[index].documents.map((item, i) => {
        if (item.fsPath == path) {
            if (item.column == 1 && amount < 0) {
                err = true
                showMsg(`"${name}" column cant be '0'`, err)

                return item
            } else {
                item.column = item.column + amount
            }
        }

        return item
    })

    if (!err) {
        await saveUserLists(list)

        return showMsg(`"${name}" column updated`)
    }
}

async function treeGroupOrintation(e, type) {
    const {group}           = e
    let list                = getGroupsList()
    let index               = list.findIndex((e) => e.name == group)
    list[index].orientation = type

    await saveUserLists(list)

    return showMsg(`"${group}" orientation updated`)
}

async function openSettingsFile(e) {
    return saveToGlobal
        ? runCommand('workbench.action.openSettingsJson')
        : runCommand('workbench.action.openWorkspaceSettingsFile')
}

/* ---------------------------------- utils --------------------------------- */
async function loopOver() {
    let loop = false

    async function rerun() {
        await goNext()
        await loopOver()
        loop = true
    }

    try {
        let {document, viewColumn} = vscode.window.activeTextEditor
        let path                   = document.uri.fsPath

        if (!document.isUntitled) {
            path = saveAbsolutePath
                ? path
                : vscode.workspace.asRelativePath(path)

            if (!inList(path)) {
                saveList.push({
                    fsPath : path,
                    column : viewColumn
                })
                await rerun()
            }
        } else if (!untitledItems.includes(path)) {
            untitledItems.push(path)
            await rerun()
        }

        if (!loop) {
            return new Promise((resolve) => resolve())
        }
    } catch ({message}) {
        showMsg(message, true)
        await rerun()
    }
}

async function goNext() {
    return runCommand('workbench.action.nextEditor')
}

function inList(path) {
    return saveList.some((e) => e.fsPath == path)
}

function nameIsTaken(name) {
    return getGroupsList().some((e) => e.name == name)
}

function getGroupsList() {
    return config.list
}

function getNamesList(arr = getGroupsList()) {
    return arr.map((item) => item.name)
}

async function saveUserLists(list) {
    await vscode.workspace.getConfiguration().update(`${PACKAGE_NAME}.list`, list, saveToGlobal)

    return resetData()
}

async function showQuickPick(list, type) {
    return vscode.window.showQuickPick(list, {
        placeHolder: `chose a group to ${type}`
    })
}

function sortList(arr) {
    return arr.sort((a, b) => {
        if (a.column > b.column) return 1
        if (b.column > a.column) return -1

        return 0
    })
}

async function showDocument({fsPath, column}) {
    ws = ws || vscode.workspace.workspaceFolders

    let file = fs_path.isAbsolute(fsPath)
        ? fsPath
        : ws.length ? ws[0].uri.path + `/${fsPath}` : fsPath

    try {
        let document = await vscode.workspace.openTextDocument(file)

        await vscode.window.showTextDocument(document, {
            viewColumn    : column,
            preserveFocus : false,
            preview       : false
        })
    } catch ({message}) {
        showMsg(`cant open file "${file}"`, true)
    }
}

async function readConfig() {
    config = await vscode.workspace.getConfiguration(PACKAGE_NAME)

    saveAbsolutePath      = config.saveAbsolutePath
    saveToGlobal          = config.saveToGlobal
    closeEditorsAfterSave = config.closeEditorsAfterSave
    hideSideBarAfterOpen  = config.hideSideBarAfterOpen
    defaultOrientation    = config.defaultOrientation
}

async function closeAllEditors(force = false) {
    if (closeEditorsAfterSave || force) {
        await runCommand('workbench.action.closeAllEditors')

        return runCommand('workbench.action.editorLayoutSingle')
    }

    return false
}

function getFileName(path) {
    return path.split('/').pop()
}

function showUntitledError() {
    if (untitledItems.length) {
        return showMsg(`"${untitledItems.length} Untitled" tabs cant be saved because they are temporary`, true)
    }
}

function resetData() {
    saveList      = []
    untitledItems = []
}

function checkForSaveList() {
    if (!saveList.length) {
        showUntitledError()
        resetData()

        return false
    }

    return true
}

function showMsg(msg, error = false) {
    return error
        ? vscode.window.showErrorMessage(`Save Editors Layout: ${msg}`)
        : vscode.window.showInformationMessage(`Save Editors Layout: ${msg}`)
}

async function runCommand(cmnd, args = {}) {
    return vscode.commands.executeCommand(cmnd, args)
}
/* -------------------------------------------------------------------------- */

exports.activate = activate

function deactivate() { }

module.exports = {
    activate,
    deactivate
}
