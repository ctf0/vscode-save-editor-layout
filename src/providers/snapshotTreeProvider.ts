import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import * as util from '../libs/util'
import {WorkspaceStorageReader} from '../libs/workspaceStorageReader'

class SnapshotTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly filePath?: string,
        public readonly command?: vscode.Command,
    ) {
        super(label, collapsibleState)

        this.iconPath = new vscode.ThemeIcon('screen-cut')

        if (filePath) {
            this.contextValue = 'snapshot'
        }
    }
}

export class SnapshotTreeProvider implements vscode.TreeDataProvider<SnapshotTreeItem> {
    private _onDidChangeTreeData : vscode.EventEmitter<SnapshotTreeItem | undefined | void> = new vscode.EventEmitter<SnapshotTreeItem | undefined | void>()
    // fallow-ignore-next-line unused-class-member
    readonly onDidChangeTreeData : vscode.Event<SnapshotTreeItem | undefined | void> = this._onDidChangeTreeData.event

    constructor(private reader: WorkspaceStorageReader) {
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined)
    }

    getTreeItem(element: SnapshotTreeItem): vscode.TreeItem {
        return element
    }

    async getChildren(element?: SnapshotTreeItem): Promise<SnapshotTreeItem[]> {
        if (element) {
            return []
        }

        const storagePath = this.reader.getWorkspaceStoragePath()

        if (!storagePath) {
            return util.getList().map((item) => this.toTreeItem(item))
        }

        // read-check-remove all inside the list mutex so a concurrent
        // save/delete cannot slip a change between the read and the prune
        const items = await util.mutateList(async(list) => {
            // non-blocking orphan check; sync fs calls in an async tree
            // provider would stall the extension host
            const existFlags = await Promise.all(list.map(async(item) => {
                try {
                    await fs.promises.access(path.join(storagePath, item.file))

                    return true
                } catch {
                    return false
                }
            }))
            const orphans = list.filter((_, index) => !existFlags[index])

            if (!orphans.length) {
                return list
            }

            // pruned here; the mutex keeps this write in lockstep with other
            // list mutations
            return list.filter((item) => !orphans.includes(item))
        })

        return items.map((item) => this.toTreeItem(item))
    }

    private toTreeItem(item: util.SnapshotListEntry): SnapshotTreeItem {
        return new SnapshotTreeItem(
            item.name,
            vscode.TreeItemCollapsibleState.None,
            item.file,
            {
                command   : `${util.CMND_NAME}.restoreSnapshot`,
                title     : 'Restore Snapshot',
                arguments : [item.file],
            },
        )
    }
}
