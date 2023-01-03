import vscode from 'vscode';
import * as utils from './util';

export default class TreeProvider {
    data;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor() {
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${utils.PACKAGE_NAME}.list`)) {
                this._onDidChangeTreeData.fire(undefined);
                this.getList();
            }
        });

        this.getList();
    }

    async getList() {
        const list = await vscode.workspace.getConfiguration(utils.PACKAGE_NAME).list;

        this.data = list.map((item) => {
            const { name, documents } = item;

            return new TreeGroup(
                name,
                this.groupText(item),
                documents.map((doc) => {
                    const path = doc.fsPath;
                    const label = this.itemText(utils.getFileName(path), doc);

                    return new TreeGroupItem(
                        name,
                        path,
                        label,
                        {
                            command   : 'editorLayout.openFile',
                            title     : 'Execute',
                            arguments : [path, doc.column],
                        },
                    );
                }),
            );
        });
    }

    groupText(item) {
        return `${item.name} (${item.documents.length}) - ${item.orientation == 0 ? 'horizontal' : 'vertical'}`;
    }

    itemText(path, doc) {
        const pos = doc.position ? `pos : ${doc.position}` : null;
        const col = doc.column ? `col : ${doc.column}` : null;

        if (pos && !col) {
            return `${path} ⓘ ${pos}`;
        }

        if (!pos && col) {
            return `${path} ⓘ ${col}`;
        }

        if (pos && col) {
            return `${path} ⓘ ${col} - ${pos}`;
        }

        return path;
    }

    /* -------------------------------------------------------------------------- */

    async getChildren(element) {
        if (element === undefined) {
            return this.data;
        }

        return element.children;
    }

    getTreeItem(file) {
        return file;
    }
}

class TreeGroup extends vscode.TreeItem {
    children;
    group;

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
        );

        this.group = group;
        this.children = children;
    }
}

class TreeGroupItem extends vscode.TreeItem {
    path;
    group;

    constructor(
        group,
        path,
        label,
        command,
    ) {
        super(label);

        this.group = group;
        this.path = path;
        this.command = command;
        this.tooltip = `open file "${path}"`;
        this.iconPath = vscode.ThemeIcon.File;
        this.contextValue = 'child';
    }
}
