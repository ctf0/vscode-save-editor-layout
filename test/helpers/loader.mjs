// Aliases the bare `vscode` specifier (which does not exist in node_modules)
// to the local stub, so unit tests can import src/libs/util.ts outside the
// extension host. Run with: node --test --import ./test/helpers/loader.mjs

import {registerHooks} from 'node:module'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const stubUrl = pathToFileURL(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'vscode-stub.mjs'),
).href

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'vscode') {
            return nextResolve(stubUrl, context)
        }

        return nextResolve(specifier, context)
    },
})
