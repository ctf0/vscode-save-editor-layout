const vscode = require('vscode')
const { TreeProvider } = require('./TreeProvider')

let prevUntitledItem = null
let saveList = []
let config = {}

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    await readConfig()

    vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('editorLayout')) {
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
    vscode.window.createTreeView(
        'layouts_list',
        {
            treeDataProvider: new TreeProvider(),
            showCollapseAll: true
        }
    )
}

/* ---------------------------------- ops --------------------------------- */
async function save() {
    await loopOver()

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
        if (!saveList.length) {
            return showUntitledError()
        }

        if (prevUntitledItem) {
            vscode.window.showErrorMessage('"Untitled" tabs cant be saved because they are temporary')
        }

        let list = getGroupsList()
        list.push({
            "name": name,
            "documents": saveList
        })

        await saveUserLists(list)
        await vscode.window.showInformationMessage(`"${name}" group saved`)

        return closeAllEditors()
    }
}

async function open() {
    let list = getGroupsList()
    let names = getNamesList(list)
    let selection = await showQuickPick(names, 'open')

    if (selection) {
        let group = list.find((e) => e.name == selection)
        let docs = sortList(group.documents)

        for (const item of docs) {
            try {
                await showDocument(item)
            } catch ({ message }) {
                continue
            }
        }
    }
}

async function remove(e) {
    let list = getGroupsList()
    let names = getNamesList(list)
    let selection = await showQuickPick(names, 'remove')

    if (selection) {
        let index = list.findIndex((e) => e.name == selection)
        list.splice(index, 1)
    }

    await saveUserLists(list)

    return vscode.window.showInformationMessage(`"${selection}" group removed`)
}

async function update() {
    let list = getGroupsList()
    let names = getNamesList(list)
    let selection = await showQuickPick(names, 'update')

    if (selection) {
        let index = list.findIndex((e) => e.name == selection)
        await loopOver()

        list[index].documents = saveList
        await saveUserLists(list)
        await vscode.window.showInformationMessage(`"${selection}" group updated`)

        return closeAllEditors()
    }
}

function openFile(path, column) {
    return showDocument({
        fsPath: path,
        column: column
    })
}

async function treeRemove(e) {
    const { group, path } = e
    let list = getGroupsList()

    if (path) {
        let name = getFileName(path)
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

            return vscode.window.showInformationMessage(
                `"${name}" removed , "${group}" group updated`
            )
        }
    } else {
        let index = list.findIndex((e) => e.name == group)
        list.splice(index, 1)

        await saveUserLists(list)

        return vscode.window.showInformationMessage(`"${group}" group removed`)
    }
}

/* ---------------------------------- utils --------------------------------- */
async function loopOver() {
    let { document, viewColumn } = vscode.window.activeTextEditor
    let path = document.uri.fsPath
    let loop = false

    if (!document.isUntitled) {
        if (!inList(path)) {
            saveList.push({
                fsPath: path,
                column: viewColumn
            })
            await goNext()
            await loopOver()
            loop = true
        }
    } else if (prevUntitledItem != path) {
        prevUntitledItem = path
        await goNext()
        await loopOver()
        loop = true
    }

    if (!loop) {
        return new Promise((resolve, reject) => resolve())
    }
}

async function goNext() {
    return vscode.commands.executeCommand('workbench.action.nextEditor')
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
    await vscode.workspace.getConfiguration().update('editorLayout.list', list, config.saveToGlobal)

    saveList = []
    prevUntitledItem = null
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

async function showDocument({ fsPath, column }) {
    try {
        let document = await vscode.workspace.openTextDocument(fsPath)

        await vscode.window.showTextDocument(document, {
            viewColumn: column,
            preserveFocus: false,
            preview: false
        })
    } catch ({ message }) {
        vscode.window.showErrorMessage(message)
    }
}

async function readConfig() {
    return config = await vscode.workspace.getConfiguration('editorLayout')
}

async function closeAllEditors() {
    return config.closeEditorsAfterSave
        ? vscode.commands.executeCommand('workbench.action.closeAllEditors')
        : false
}

function getFileName(path) {
    return path.split('/').pop()
}

function showUntitledError() {
    return vscode.window.showErrorMessage('"Untitled" tabs cant be saved because they are temporary')
}
/* -------------------------------------------------------------------------- */

exports.activate = activate

function deactivate() { }

module.exports = {
    activate,
    deactivate
}
