import * as vscode from 'vscode'
import * as util from './util'

export class SnapshotTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath?: string,
        public readonly command?: vscode.Command,
    ) {
        super(label, collapsibleState)

        if (filePath) {
            this.tooltip = filePath
            this.description = filePath
            this.contextValue = 'snapshot'
        }
    }
}

export class SnapshotTreeProvider implements vscode.TreeDataProvider<SnapshotTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<SnapshotTreeItem | undefined | void> = new vscode.EventEmitter<SnapshotTreeItem | undefined | void>()
    readonly onDidChangeTreeData: vscode.Event<SnapshotTreeItem | undefined | void> = this._onDidChangeTreeData.event

    constructor() {
        vscode.workspace.onDidChangeConfiguration((e: any) => {
            if (e.affectsConfiguration(util.PACKAGE_NAME)) {
                setTimeout(() => {
                    this._onDidChangeTreeData.fire(undefined)
                }, 300)
            }
        })
    }

    getTreeItem(element: SnapshotTreeItem): vscode.TreeItem {
        return element
    }

    async getChildren(element?: SnapshotTreeItem): Promise<SnapshotTreeItem[]> {
        if (element) {
            return []
        }

        return util.getList().map((item: {file: string, name: string}) => {
            return new SnapshotTreeItem(
                item.name,
                vscode.TreeItemCollapsibleState.None,
                item.file,
                {
                    command: 'editorLayout.restoreSnapshot',
                    title: 'Restore Snapshot',
                    arguments: [item.file],
                },
            )
        })
    }
}
