import vscode from 'vscode'
import * as utils from './util'

export default class TreeProvider {
    data
    _onDidChangeTreeData = new vscode.EventEmitter()
    onDidChangeTreeData = this._onDidChangeTreeData.event

    constructor() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${utils.PACKAGE_NAME}.list`)) {
                this._onDidChangeTreeData.fire(undefined)
                this.getList()
            }
        })

        this.getList()
    }

    async getList() {
        const list = utils.config.list

        this.data = list.map((item) => {
            const {name, documents} = item

            return new TreeGroup(
                name,
                this.groupText(item),
                documents.map((doc) => {
                    const path = doc.fsPath

                    return new TreeGroupItem(
                        name,
                        path,
                        utils.getFileName(path),
                        {
                            command: 'editorLayout.openFile',
                            title: 'Execute',
                            arguments: [doc],
                        },
                    )
                }),
            )
        })
    }

    groupText(item) {
        return `${item.name} (${item.documents.length})`
    }

    /* -------------------------------------------------------------------------- */

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
    group

    constructor(
        group,
        label,
        children,
    ) {
        super(
            label,
            children === undefined
                ? vscode.TreeItemCollapsibleState.None
                : vscode.TreeItemCollapsibleState.Expanded,
        )

        this.group = group
        this.children = children
    }
}

class TreeGroupItem extends vscode.TreeItem {
    group
    path

    constructor(
        group,
        path,
        label,
        command,
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
