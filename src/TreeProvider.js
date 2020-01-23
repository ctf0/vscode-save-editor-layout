const vscode = require('vscode')
class TreeProvider {

    data

    _onDidChangeTreeData = new vscode.EventEmitter()
    onDidChangeTreeData = this._onDidChangeTreeData.event

    constructor() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('saveEditorLayout.list')) {
                this._onDidChangeTreeData.fire()
                this.getList()
            }
        })

        this.getList()
    }

    async getList() {
        let list = await vscode.workspace.getConfiguration('saveEditorLayout').list

        this.data = list.map((item) => {
            let group = item.name
            let docs = item.documents

            return new TreeGroup(
                group,
                `${group} (${docs.length} items)`,
                docs.map((doc) => {
                    let path = doc.fsPath
                    let label = doc.position
                        ? `${this.getFileName(path)} (${doc.position})`
                        : this.getFileName(path)

                    return new TreeGroupItem(
                        group,
                        path,
                        label,
                        {
                            command: 'editorLayout.openFile',
                            title: 'Execute',
                            arguments: [path, doc.column]
                        }
                    )
                })
            )
        })
    }

    getFileName(path) {
        return path.split('/').pop()
    }

    async getChildren(element) {
        if (element === undefined) {
            return this.data
        }

        return element.children
    }

    getTreeItem(file) {
        return file
    }
}

class TreeGroup extends vscode.TreeItem {
    children

    constructor(
        group,
        label,
        children
    ) {
        super(
            label,
            children === undefined
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Expanded
        )

        this.group = group
        this.children = children
    }
}

class TreeGroupItem extends vscode.TreeItem {
    constructor(
        group,
        path,
        label,
        command
    ) {
        super(label)

        this.group = group
        this.path = path
        this.command = command
        this.tooltip = `open file "${path}"`
        this.iconPath = vscode.ThemeIcon.File
        this.contextValue = 'child'
    }
}

module.exports = {
    TreeProvider
}
