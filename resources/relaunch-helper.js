// Relaunch helper for the Save Editors Layout extension.
//
// Runs as a plain Node process after VS Code exits (the extension host sets
// ELECTRON_RUN_AS_NODE=1, so spawning the main binary with this file runs it
// as node). It waits for the main process to die, applies the pending db
// operation, then relaunches VS Code with the same window.
//
// Kept as a standalone file (not an inline template string) so it can be
// linted and tested. The constants below must stay in sync with
// src/libs/util.ts.
'use strict'

const {spawn} = require('child_process')
const fs = require('fs')
const path = require('path')

// must stay in sync with util.ts PENDING_APPLY_FILE
const PENDING_APPLY_FILE = 'pending-apply.json'
// grace after the main process exits: its helper processes and the
// single-instance socket linger briefly, and relaunching sooner fails silently
const RELAUNCH_GRACE_MS = 2000

const pid = parseInt(process.argv[2], 10) || 0
let op = null
let marker = null

try {
    op = JSON.parse(process.argv[3])
} catch (e) {
    op = null
}

try {
    marker = JSON.parse(process.argv[4])
} catch (e) {
    marker = null
}

const appArgs = process.argv.slice(5)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// node:sqlite only exists in newer Node builds; VS Code bundles a recent
// Node, but fail loudly instead of crashing when it is missing
function loadSqlite() {
    try {
        return require('node:sqlite')
    } catch (e) {
        return null
    }
}

// returns true when the db opens clean and passes an integrity check
function dbIsOk(file) {
    const sqlite = loadSqlite()

    if (!sqlite) {
        return false
    }

    try {
        const db = new sqlite.DatabaseSync(file)
        const rows = db.prepare('PRAGMA quick_check').all()
        db.close()

        return rows.length === 1 && rows[0].quick_check === 'ok'
    } catch (e) {
        return false
    }
}

// the apply failed: restore the db VS Code wrote at shutdown, so the next
// launch boots with a known-good state instead of a corrupt one
function rollback() {
    const backup = op.dest + '.backup'

    try {
        if (fs.existsSync(backup)) {
            for (const suffix of ['-wal', '-shm']) {
                try {
                    fs.unlinkSync(op.dest + suffix)
                } catch (e) { /* missing is fine */ }
            }

            fs.copyFileSync(backup, op.dest)

            return 'recovered ' + path.basename(backup)
        }

        return 'no backup available to recover from'
    } catch (error) {
        return 'backup recovery failed: ' + String((error && error.message) || error)
    }
}

async function waitForExit() {
    if (pid > 0) {
        const deadline = Date.now() + 30000

        while (Date.now() < deadline) {
            try {
                process.kill(pid, 0)
            } catch {
                await sleep(RELAUNCH_GRACE_MS)

                return
            }

            await sleep(500)
        }

        // The main process did not exit in time: applying the db op now could
        // be overwritten by VS Code's shutdown state-save, so abort instead of
        // silently producing a wrong layout.
        if (op && typeof op.dest === 'string') {
            try {
                fs.writeFileSync(path.join(path.dirname(op.dest), PENDING_APPLY_FILE), JSON.stringify({error: 'VS Code did not exit in time; layout was not applied'}))
            } catch (e) { /* nothing left to report with */ }
        }

        process.exit(1)
    } else {
        await sleep(3000)
    }
}

// merge the template keys into the destination db; returns the number of
// merged rows, throwing on any failure so the caller can roll back
function mergeDb(source, dest) {
    const sqlite = loadSqlite()

    if (!sqlite) {
        throw new Error('node:sqlite is unavailable in this VS Code build; please update VS Code to apply the layout')
    }

    const src = new sqlite.DatabaseSync(source)
    const rows = src.prepare('SELECT key, value FROM ItemTable').all()
    src.close()

    const dst = new sqlite.DatabaseSync(dest)
    dst.exec('PRAGMA busy_timeout = 5000')
    dst.exec('CREATE TABLE IF NOT EXISTS ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
    const insert = dst.prepare('INSERT OR REPLACE INTO ItemTable(key, value) VALUES (?, ?)')

    for (const row of rows) {
        insert.run(row.key, row.value)
    }

    dst.close()

    return rows.length
}

// Runs after the main process is gone: the workspace db is closed by then, so
// the copy/merge cannot be overwritten by VS Code's shutdown state-save.
async function applyOp() {
    if (!op || typeof op !== 'object' || typeof op.dest !== 'string') {
        return
    }

    const destDir = path.dirname(op.dest)

    // stale journal files would replay pre-restore frames over the new db
    for (const suffix of ['-wal', '-shm']) {
        try {
            fs.unlinkSync(op.dest + suffix)
        } catch (e) { /* missing is fine */ }
    }

    // snapshot the destination before mutating it, so rollback() can restore
    // a known-good state if the copy/merge produces a corrupt db.
    // Skip for snapshot: the dest is a new file that doesn't exist yet, and
    // the source is the live db VS Code just wrote at shutdown.
    const backupPath = op.dest + '.backup'

    if (op.type !== 'snapshot') {
        try {
            fs.copyFileSync(op.dest, backupPath)
        } catch (error) {
            const message = String((error && error.message) || error)

            try {
                fs.writeFileSync(path.join(destDir, PENDING_APPLY_FILE), JSON.stringify({error: 'failed to back up destination db: ' + message}))
            } catch (e) { /* nothing left to report with */ }

            return
        }
    }

    try {
        if (op.type === 'copy' && typeof op.source === 'string') {
            fs.copyFileSync(op.source, op.dest)
        } else if (op.type === 'snapshot' && typeof op.source === 'string') {
            fs.copyFileSync(op.source, op.dest)
        } else if (op.type === 'merge' && typeof op.source === 'string') {
            if (marker && typeof marker === 'object') {
                marker = {...marker, count: mergeDb(op.source, op.dest)}
            } else {
                mergeDb(op.source, op.dest)
            }
        } else {
            return
        }

        // never leave a db the next launch would choke on: a corrupt source
        // (e.g. snapshot) still copies fine, so verify the result opens clean
        if (!dbIsOk(op.dest)) {
            throw new Error('resulting db failed integrity check')
        }

        // the apply succeeded: drop the backup so a later rollback cannot
        // restore stale state over a good db
        try {
            fs.unlinkSync(backupPath)
        } catch (e) { /* missing is fine */ }
    } catch (error) {
        const message = String((error && error.message) || error)

        try {
            fs.writeFileSync(path.join(destDir, PENDING_APPLY_FILE), JSON.stringify({error: message + ' - ' + rollback()}))
        } catch (e) { /* nothing left to report with */ }

        return
    }

    if (marker && typeof marker === 'object') {
        fs.writeFileSync(path.join(destDir, PENDING_APPLY_FILE), JSON.stringify(marker))
    }
}

function relaunch() {
    const env = {...process.env}

    for (const key of Object.keys(env)) {
        if (key.startsWith('VSCODE_')) {
            delete env[key]
        }
    }

    // the helper runs as plain Node (ELECTRON_RUN_AS_NODE=1 from the ext
    // host); both flags must be dropped before spawning the real app, or the
    // new process would launch as node instead of VS Code
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_NO_ASAR

    const child = spawn(process.execPath, appArgs, {
        detached    : true,
        stdio       : 'ignore',
        windowsHide : true,
        env,
    })
    child.unref()
    process.exit(0)
}

waitForExit()
    .then(applyOp)
    .then(relaunch)
    .catch(() => process.exit(1))
