import path from 'node:path';
import * as vscode from 'vscode';

export const PACKAGE_NAME = 'saveEditorLayout';
export const CMND_NAME = 'editorLayout';
export let config: any = {};

export function readConfig() {
    config = vscode.workspace.getConfiguration(PACKAGE_NAME);
}

export function getFileName(filePath) {
    return filePath ? path.parse(filePath).base : '';
}
