const vscode         = require('vscode')
const {PACKAGE_NAME} = require('./util')

class TreeProvider {
    data
    _onDidChangeTreeData = new vscode.EventEmitter()
    onDidChangeTreeData = this._onDidChangeTreeData.event

    constructor() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${PACKAGE_NAME}.list`)) {
                this._onDidChangeTreeData.fire()
                this.getList()
            }
        })

        this.getList()
    }

    async getList() {
        let list = await vscode.workspace.getConfiguration(PACKAGE_NAME).list

        this.data = list.map((item) => {
            let {name, documents, orientation} = item

            return new TreeGroup(
                name,
                this.groupText(item),
                documents.map((doc) => {
                    let path  = doc.fsPath
                    let label = this.itemText(this.getFileName(path), doc)

                    return new TreeGroupItem(
                        name,
                        path,
                        label,
                        {
                            command   : 'editorLayout.openFile',
                            title     : 'Execute',
                            arguments : [path, doc.column]
                        }
                    )
                })
            )
        })
    }

    groupText(item) {
        return `${item.name} "${item.documents.length} / ${item.orientation == 0 ? 'horizontal' : 'vertical'}"`
    }

    itemText(path, doc) {
        let pos = doc.position ? `pos: ${doc.position}` : null
        let col = doc.column ? `col: ${doc.column}` : null

        if (pos && !col) {
            return `${path} "${pos}"`
        }

        if (!pos && col) {
            return `${path} "${col}"`
        }

        if (pos && col) {
            return `${path} "${col} / ${pos}"`
        }

        return path
    }

    /* -------------------------------------------------------------------------- */

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

        this.group    = group
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

        this.group        = group
        this.path         = path
        this.command      = command
        this.tooltip      = `open file "${path}"`
        this.iconPath     = vscode.ThemeIcon.File
        this.contextValue = 'child'
    }
}

module.exports = {
    TreeProvider
}
