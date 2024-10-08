import vscode from 'vscode';
import TreeProvider from './TreeProvider';
import * as utils from './util';

export async function activate(context: vscode.ExtensionContext) {
    utils.readConfig();

    context.subscriptions.push(
        // config
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            if (e.affectsConfiguration(utils.PACKAGE_NAME)) {
                utils.readConfig();
            }
        }),
        // normal
        vscode.commands.registerCommand(`${utils.CMND_NAME}.save`, save),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.open`, open),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.remove`, remove),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.update`, update),
        // tree
        vscode.commands.registerCommand(`${utils.CMND_NAME}.openFile`, openFile),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.openGroup`, openGroup),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.openSettingsFile`, openSettingsFile),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.closeAll`, (e) => closeAllEditors(true)),
        vscode.commands.registerCommand(`${utils.CMND_NAME}.treeRemove`, treeRemoveFileOrGroup),
    );

    vscode.window.createTreeView(
        'layouts_list',
        {
            treeDataProvider: new TreeProvider(),
            showCollapseAll: true,
        },
    );
}

/* ---------------------------------- ops --------------------------------- */
async function save() {
    const tabs: vscode.Tab[] = getOpenedTabsWithoutUntitled();
    let type = 'saved';

    if (!tabs.length) {
        await showMsg('untitled tabs cant be saved');

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
        const sortedSaveList = getSortedSaveList(tabs);

        const editorGroupLayout: any = await runCommand('vscode.getEditorLayout');

        if (found) {
            const answer = await showMsg(`this will overwrite the '${name}' group`, true, ['Yes', 'No']);

            if (answer === 'No') {
                return;
            } else {
                found = Object.assign(found, {
                    documents: sortedSaveList,
                    layout: editorGroupLayout,
                });

                type = 'updated';
            }
        } else {
            list.push({
                name: name,
                documents: sortedSaveList,
                layout: editorGroupLayout,
            });
        }

        try {
            await saveUserLists(list);
        } catch (error) {
            await saveUserLists(list, utils.config.saveToGlobalWhenPossible);
        }

        await closeAllEditors();
        await showMsg(`"${name}" group ${type}`);
    }
}

function getSortedSaveList(tabs = null) {
    return sortList(tabs || getOpenedTabsWithoutUntitled()).map((tab: vscode.Tab) => ({
        // @ts-ignore
        fsPath: tab.input.uri.fsPath,
        column: tab.group.viewColumn,
        pinned: tab.isPinned,
    }));
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
        const { documents, layout } = group;

        if (utils.config.hideSideBarAfterOpen) {
            await runCommand('workbench.action.focusSideBar');
            await runCommand('workbench.action.toggleSidebarVisibility');
        }

        // setup layout
        await runCommand('vscode.setEditorLayout', layout);

        // open files
        if (utils.config.restoreLayoutOnly == false) {
            for (const document of documents) {
                try {
                    await showDocument(document);
                } catch ({ message }) {
                    // console.error(message);

                    continue;
                }
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

        list[index] = Object.assign(list[index], {
            documents: getSortedSaveList(),
            layout: await runCommand('vscode.getEditorLayout'),
        });

        await saveUserLists(list);
        await showMsg(`"${selection}" group updated`);

        return closeAllEditors();
    }
}

function openFile(doc) {
    return showDocument({
        fsPath: doc.fsPath,
        column: doc.column,
        pinned: doc.pinned || false,
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

async function saveUserLists(list, forceGlobal = false) {
    return vscode.workspace.getConfiguration().update(`${utils.PACKAGE_NAME}.list`, list, utils.config.saveToGlobal || forceGlobal);
}

function getOpenedTabs() {
    return vscode.window.tabGroups.all
        .flatMap((v: vscode.TabGroup[]) => v.tabs)
        .filter((tab: vscode.Tab) => tab.input !== undefined && tab.input instanceof vscode.TabInputText);
}

function getOpenedTabsWithoutUntitled() {
    // @ts-ignore
    return getOpenedTabs().filter((tab: vscode.Tab) => tab.input.uri.scheme !== 'untitled');
}

async function showQuickPick(list, type) {
    return vscode.window.showQuickPick(list, {
        placeHolder: `choose a group to ${type}`,
    });
}

function sortList(arr: vscode.Tab[]) {
    return arr.sort((a: vscode.Tab, b: vscode.Tab) => {
        if (a.group.viewColumn > b.group.viewColumn) return 1;

        if (b.group.viewColumn > a.group.viewColumn) return -1;

        return 0;
    });
}

async function showDocument(doc) {
    try {
        const document = await vscode.workspace.openTextDocument(doc.fsPath);

        await vscode.window.showTextDocument(document, {
            viewColumn: doc.column,
            preserveFocus: false,
            preview: false,
        });

        if (doc.pinned) {
            await runCommand('workbench.action.pinEditor');
        }
    } catch ({ message }) {
        return showMsg(`cant open file "${doc.fsPath}"`, true);
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
