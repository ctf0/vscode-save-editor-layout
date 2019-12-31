const vscode = require('vscode')
let saveList = []

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.save', save))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.open', open))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.delete', remove))
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.update', update))
}

async function save() {
    await loopOver()

    let name = await vscode.window.showInputBox({
        placeHolder: 'add name for the group',
        async validateInput(v) {
            if (!v) {
                return 'you have to add a name'
            } else if (await nameIsTaken(v)) {
                return `"${v}" is already taken, try something else`
            } else {
                return ''
            }
        }
    })

    let settings = await getGroupsList()
    settings.push({
        "name": name,
        "documents": saveList
    })
    saveUserLists(settings)

    return vscode.window.showInformationMessage(`"${name}" group saved`)
}

async function loopOver() {
    let { document, viewColumn } = vscode.window.activeTextEditor
    let path = document.uri.fsPath

    if (!inList(path)) {
        saveList.push({
            fsPath: path,
            column: viewColumn
        })
        await vscode.commands.executeCommand('workbench.action.nextEditor')
        await loopOver()
    } else {
        return new Promise((resolve, reject) => resolve())
    }
}

function inList(path) {
    return saveList.some((e) => e.fsPath == path)
}

async function nameIsTaken(name) {
    let list = await getGroupsList()

    return list.some((e) => e.name == name)
}

async function open() {
    let list = await getGroupsList()
    let names = list.map((item) => item.name)
    let selection = await showQuickPick(names, 'open')

    if (selection) {
        let group = list.find((e) => e.name == selection)

        for (const item of group.documents) {
            await showDocument(item)
        }
    }
}

async function showDocument({ fsPath, column }) {
    let document = await vscode.workspace.openTextDocument(fsPath)

    await vscode.window.showTextDocument(document, {
        viewColumn: column,
        preserveFocus: false,
        preview: false
    })
}

async function remove() {
    let list = await getGroupsList()
    let names = list.map((item) => item.name)
    let selection = await showQuickPick(names, 'remove')

    if (selection) {
        let index = list.findIndex((e) => e.name == selection)
        list.splice(index, 1)
    }

    await saveUserLists(list)

    return vscode.window.showInformationMessage(`"${selection}" group removed`)
}

async function getGroupsList() {
    return vscode.workspace.getConfiguration('editorLayout').list
}

async function saveUserLists(list) {
    await vscode.workspace.getConfiguration().update('editorLayout.list', list)

    return saveList = []
}

async function showQuickPick(list, type) {
    return vscode.window.showQuickPick(list, {
        placeHolder: `chose a group to ${type}`
    })
}

async function update() {
    let list = await getGroupsList()
    let names = list.map((item) => item.name)
    let selection = await showQuickPick(names, 'update')

    if (selection) {
        let index = list.findIndex((e) => e.name == selection)
        await loopOver()

        list[index].documents = saveList
        saveUserLists(list)

        return vscode.window.showInformationMessage(`"${selection}" group updated`)
    }
}

exports.activate = activate

function deactivate() { }

module.exports = {
    activate,
    deactivate
}
