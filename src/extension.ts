import fs_path from 'node:path';
import vscode from 'vscode';
import TreeProvider from './TreeProvider';
import * as utils from './util';

let ws: any = null;

export async function activate(context: vscode.ExtensionContext) {
    utils.readConfig();

    vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration(utils.PACKAGE_NAME)) {
            utils.readConfig();
        }
    });

    // normal
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.save', save));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.open', open));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.remove', remove));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.update', update));

    // tree
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.openFile', openFile));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.openGroup', openGroup));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.openSettingsFile', openSettingsFile));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.closeAll', (e) => closeAllEditors(true)));

    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.treeRemove', treeRemoveFileOrGroup));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnBelow', async (e) => await treeColumnPosition(e, 'Below')));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnRight', async (e) => await treeColumnPosition(e, 'Right')));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnInc', async (e) => await treeColumnNumber(e, +1)));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.columnSub', async (e) => await treeColumnNumber(e, -1)));

    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.groupVertical', async (e) => await treeGroupOrintation(e, 1)));
    context.subscriptions.push(vscode.commands.registerCommand('editorLayout.groupHorizontal', async (e) => await treeGroupOrintation(e, 0)));
    vscode.window.createTreeView(
        'layouts_list',
        {
            treeDataProvider : new TreeProvider(),
            showCollapseAll  : true,
        },
    );
}

/* ---------------------------------- ops --------------------------------- */
async function save() {
    const tabs: vscode.Tab[] = getOpenedTabsWithoutUntitled();
    let type = 'saved';

    if (!tabs.length) {
        return;
    }

    const name = await vscode.window.showInputBox({
        placeHolder: 'add name for the group',
        validateInput(v) {
            if (!v) {
                return 'you have to add a name';
            } else {
                return '';
            }
        },
    });

    if (name) {
        const list = getGroupsList();
        let found = list.find((item) => item.name == name);
        const sortedSaveList = sortList(tabs).map((tab: vscode.Tab) => ({
            // @ts-ignore
            fsPath : tab.input.uri.fsPath,
            column : tab.group.viewColumn,
        }));

        if (found) {
            const answer = await showMsg(`this will overwrite the '${name}' group`, true, ['Yes', 'No']);

            if (answer === 'No') {
                return;
            } else {
                found = Object.assign(found, {
                    orientation : utils.config.defaultOrientation,
                    documents   : sortedSaveList,
                });

                type = 'updated';
            }
        } else {
            list.push({
                name        : name,
                orientation : utils.config.defaultOrientation,
                documents   : sortedSaveList,
            });
        }

        await saveUserLists(list);
        await closeAllEditors();
        await showMsg(`"${name}" group ${type}`);
    }
}

async function open(groupName = null) {
    let selection: any = null;
    const list = getGroupsList();

    if (groupName) {
        selection = groupName;
    } else {
        const names = getNamesList(list);
        selection = await showQuickPick(names, 'open');
    }

    if (selection) {
        const group = list.find((e) => e.name == selection);
        const { documents, orientation } = group;

        if (utils.config.hideSideBarAfterOpen) {
            await runCommand('workbench.action.focusSideBar');
            await runCommand('workbench.action.toggleSidebarVisibility');
        }

        // setup layout
        const groups: any = [];

        for (let i = 0; i < documents.length; i++) {
            const item = documents[i];
            const current = groups[item.column - 1];

            if (current) {
                if (item.position || !current.groups.length) {
                    current.groups.push({});
                }
            } else {
                const data: any = {
                    groups : [],
                    size   : 0.5,
                };

                if (item.position || !data.groups.length) {
                    data.groups.push({});
                }

                groups.push(data);
            }
        }

        await runCommand('vscode.setEditorLayout', {
            orientation : orientation || 0,
            groups      : groups,
        });

        // open files
        for (let i = 0; i < documents.length; i++) {
            const item = documents[i];

            try {
                await showDocument(item);

                if (item.position) {
                    await runCommand(`workbench.action.moveEditorTo${item.position}Group`);
                }
            } catch ({ message }) {
                continue;
            }
        }
    }
}

async function openGroup({ group }) {
    return open(group);
}

async function remove(e) {
    const list = getGroupsList();
    const names = getNamesList(list);
    const group = await showQuickPick(names, 'remove');

    if (group) {
        await removeGroup(list, group);
    }
}

async function update() {
    const list = getGroupsList();
    const names = getNamesList(list);
    const selection = await showQuickPick(names, 'update');

    if (selection) {
        const index = list.findIndex((e) => e.name == selection);

        list[index].documents = getOpenedTabs();
        await saveUserLists(list);
        await showMsg(`"${selection}" group updated`);

        return closeAllEditors();
    }
}

function openFile(path, column) {
    return showDocument({
        fsPath : path,
        column : column,
    });
}

/* Tree --------------------------------------------------------------------- */
async function treeRemoveFileOrGroup(e) {
    const { group, path } = e;
    const list = getGroupsList();

    if (path) {
        const name = utils.getFileName(path);
        let changes = false;

        for (let i = 0; i < list.length; i++) {
            const el = list[i];

            if (el.name == group) {
                const index = el.documents.findIndex((e) => e.fsPath == path);

                if (index > -1) {
                    changes = true;
                    el.documents.splice(index, 1);
                    break;
                }
            }
        }

        if (changes) {
            await saveUserLists(list);

            return showMsg(`"${name}" removed , "${group}" group updated`);
        }
    } else {
        await removeGroup(list, group);
    }
}

async function removeGroup(list: any, group: string) {
    const answer = await showMsg(`remove group "${group}"`, true, ['Yes', 'No']);

    if (answer === 'Yes') {
        const index = list.findIndex((e) => e.name == group);
        list.splice(index, 1);

        await saveUserLists(list);

        return showMsg(`"${group}" group removed`);
    }
}

function treeColumnResolve(e) {
    const { group, path } = e;
    const list = getGroupsList();

    return {
        path  : path,
        name  : utils.getFileName(path),
        list  : list,
        index : list.findIndex((e) => e.name == group),
    };
}

async function treeColumnPosition(e, type) {
    const { path, name, list, index } = treeColumnResolve(e);

    list[index].documents = list[index].documents.map((item, i) => {
        if (item.fsPath == path) {
            item.position = item.position == type ? null : type;
        }

        return item;
    });

    await saveUserLists(list);

    return showMsg(`"${name}" position updated`);
}

async function treeColumnNumber(e, amount) {
    const { path, name, list, index } = treeColumnResolve(e);
    let err = false;

    let docs = list[index].documents;
    docs = docs.map(async (item, i) => {
        if (item.fsPath == path) {
            if (item.column == 1 && amount < 0) {
                err = true;
                await showMsg(`"${name}" column cant be '0'`, err);

                return item;
            } else {
                item.column = item.column + amount;
            }
        }

        return item;
    });

    if (!err) {
        await saveUserLists(list);

        return showMsg(`"${name}" column updated`);
    }
}

async function treeGroupOrintation(e, type) {
    const { group } = e;
    const list = getGroupsList();
    const index = list.findIndex((e) => e.name == group);
    list[index].orientation = type;

    await saveUserLists(list);

    return showMsg(`"${group}" orientation updated`);
}

async function openSettingsFile(e) {
    return utils.config.saveToGlobal
        ? runCommand('workbench.action.openSettingsJson')
        : runCommand('workbench.action.openWorkspaceSettingsFile');
}

/* ---------------------------------- utils --------------------------------- */
function getGroupsList() {
    return utils.config.list;
}

function getNamesList(arr = getGroupsList()) {
    return arr.map((item) => item.name);
}

async function saveUserLists(list) {
    return vscode.workspace.getConfiguration().update(`${utils.PACKAGE_NAME}.list`, list, utils.config.saveToGlobal);
}

function getOpenedTabs() {
    return vscode.window.tabGroups.all
        .flatMap((v) => v.tabs)
        .filter((tab: vscode.Tab) => tab.input !== undefined && tab.input instanceof vscode.TabInputText);
}

function getOpenedTabsWithoutUntitled() {
    // @ts-ignore
    return getOpenedTabs().filter((tab: vscode.Tab) => tab.input.uri.scheme !== 'untitled');
}

async function showQuickPick(list, type) {
    return vscode.window.showQuickPick(list, {
        placeHolder: `chose a group to ${type}`,
    });
}

function sortList(arr: vscode.Tab[]) {
    return arr.sort((a: vscode.Tab, b: vscode.Tab) => {
        if (a.group.viewColumn > b.group.viewColumn) return 1;
        if (b.group.viewColumn > a.group.viewColumn) return -1;

        return 0;
    });
}

async function showDocument({ fsPath, column }) {
    ws = ws || vscode.workspace.workspaceFolders;

    const file = fs_path.isAbsolute(fsPath)
        ? fsPath
        : ws.length ? ws[0].uri.path + `/${fsPath}` : fsPath;

    try {
        const document = await vscode.workspace.openTextDocument(file);

        return vscode.window.showTextDocument(document, {
            viewColumn    : column,
            preserveFocus : false,
            preview       : false,
        });
    } catch ({ message }) {
        return showMsg(`cant open file "${file}"`, true);
    }
}

async function closeAllEditors(force = false) {
    if (utils.config.closeEditorsAfterSave || force) {
        await Promise.all(
            getOpenedTabs()
                .filter((tab: vscode.Tab) => tab.isDirty === false)
                .map(async (tab: vscode.Tab) => await vscode.window.tabGroups.close(tab)),
        );

        await runCommand('workbench.action.editorLayoutSingle');
    }

    return false;
}

async function showMsg(msg, error = false, args: string[] = []) {
    return error
        ? vscode.window.showErrorMessage(`Save Editors Layout: ${msg}`, ...args)
        : vscode.window.showInformationMessage(`Save Editors Layout: ${msg}`, ...args);
}

async function runCommand(cmnd, args = {}) {
    return vscode.commands.executeCommand(cmnd, args);
}
/* -------------------------------------------------------------------------- */

export function deactivate() { }
