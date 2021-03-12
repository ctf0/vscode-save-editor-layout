const vscode         = require('vscode')
const {TreeProvider} = require('./TreeProvider')
const fs             = require('fs')
const {PACKAGE_NAME} = require('./util')

let untitledItems = []
let saveList      = []
let config        = {}

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
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.treeRemove', treeRemove))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.openSettingsFile', openSettingsFile))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.closeAll', (e) => closeAllEditors(true)))

    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnBelow', async (e) => await treeColumnPosition(e, 'Below')))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnRight', async (e) => await treeColumnPosition(e, 'Right')))

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
            orientation : config.defaultOrientation,
            documents   : sortList(saveList)
        })

        await saveUserLists(list)
        showMsg(`"${name}" group saved`)

        return closeAllEditors()
    }
}

async function open() {
    let list      = getGroupsList()
    let names     = getNamesList(list)
    let selection = await showQuickPick(names, 'open')

    if (selection) {
        let group                    = list.find((e) => e.name == selection)
        let {documents, orientation} = group

        if (config.hideSideBarAfterOpen) {
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
                // if (item.position) {
                //     await runCommand(`workbench.action.newGroup${item.position}`)
                // }

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
async function treeRemove(e) {
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

/**
 * the tabs group/box
 */
async function treeColumnPosition(e, type) {
    const {group, path}   = e
    let name              = getFileName(path)
    let list              = getGroupsList()
    let index             = list.findIndex((e) => e.name == group)
    list[index].documents = list[index].documents.map((item, i) => {
        if (item.fsPath == path) {
            let currentPos = item.position

            item.position = item.position == type ? null : type

            // had a position but now is = null
            if (currentPos && !item.position) {
                item.column++
            }

            // didn't have a position but now is = something
            if (!currentPos && item.position) {
                item.column--
            }

            if (item.column == 0) {
                item.column = 1
            }
        }

        return item
    })

    await saveUserLists(list)

    return showMsg(`"${name}" position updated`)
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
    if (config.saveToGlobal) {
        return runCommand('workbench.action.openSettingsJson')
    }

    let root = await vscode.workspace.workspaceFolders

    if (root.length) {
        let path = root[0].uri.path + '/.vscode/settings.json'

        if (fs.existsSync(path)) {
            showDocument({
                fsPath : path,
                column : 1
            })
        } else {
            showMsg(`file not found "${path}"`, true)
            runCommand('workbench.action.openSettingsJson')
        }
    }
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
    await vscode.workspace.getConfiguration().update(`${PACKAGE_NAME}.list`, list, config.saveToGlobal)

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
    try {
        let document = await vscode.workspace.openTextDocument(fsPath)

        await vscode.window.showTextDocument(document, {
            viewColumn    : column,
            preserveFocus : false,
            preview       : false
        })
    } catch ({message}) {
        showMsg(`cant open file "${fsPath}"`, true)
    }
}

async function readConfig() {
    return config = await vscode.workspace.getConfiguration(PACKAGE_NAME)
}

async function closeAllEditors(force = false) {
    if (config.closeEditorsAfterSave || force) {
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
        ? vscode.window.showErrorMessage(`FSC: ${msg}`)
        : vscode.window.showInformationMessage(`FSC: ${msg}`)
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
