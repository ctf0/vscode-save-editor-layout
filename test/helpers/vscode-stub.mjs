// Minimal in-memory stub of the vscode API surface used by src/libs/util.ts.
// Wired in via registerHooks (see loader.mjs) so tests run without the
// real `vscode` module, which only exists inside the extension host.

const fixture = {
    list : [
        {file: 'state_snapshot_1.vscdb', name: 'First'},
        {file: 'state_snapshot_2.vscdb', name: 'Second'},
    ],
}

const settings = {...fixture}

function getConfiguration() {
    return {
        get(key, fallback) {
            return key in settings ? settings[key] : fallback
        },
        async update(key, value) {
            settings[key] = value
        },
        inspect(key) {
            return {
                key,
                defaultValue         : undefined,
                globalValue          : undefined,
                workspaceValue       : settings[key],
                workspaceFolderValue : undefined,
            }
        },
    }
}

export const workspace = {getConfiguration}
export const ConfigurationTarget = {Global: 1, Workspace: 2, WorkspaceFolder: 3}
export const commands = {
    async executeCommand() {
        return undefined
    },
}
export const window = {
    async showErrorMessage(message) {
        return message
    },
    async showInformationMessage(message) {
        return message
    },
}

export const __test = {
    get settings() {
        return settings
    },
    reset() {
        for (const key of Object.keys(settings)) {
            delete settings[key]
        }

        Object.assign(settings, fixture)
    },
}
