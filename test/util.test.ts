import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

// vscode is aliased to test/helpers/vscode-stub.mjs via test/helpers/loader.mjs
const util = await import('../src/libs/util.ts')

function tmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'sel-test-'))
}

test('getList returns the workspace-scoped snapshot list', () => {
    assert.deepEqual(util.getList(), [
        {file: 'state_snapshot_1.vscdb', name: 'First'},
        {file: 'state_snapshot_2.vscdb', name: 'Second'},
    ])
})

test('updateList persists the list through the workspace config', async() => {
    await util.updateList([{file: 'x.vscdb', name: 'X'}])
    assert.deepEqual(util.getList(), [{file: 'x.vscdb', name: 'X'}])

    // restore the fixture for the other tests
    await util.updateList([
        {file: 'state_snapshot_1.vscdb', name: 'First'},
        {file: 'state_snapshot_2.vscdb', name: 'Second'},
    ])
})

test('mutateList serializes concurrent read-modify-write cycles', async() => {
    await util.updateList([])

    await Promise.all([
        util.mutateList((list) => [...list, {file: 'a.vscdb', name: 'A'}]),
        util.mutateList((list) => [...list, {file: 'b.vscdb', name: 'B'}]),
        util.mutateList((list) => [...list, {file: 'c.vscdb', name: 'C'}]),
    ])

    const list = util.getList()
    assert.equal(list.length, 3)
    assert.ok(list.some((item) => item.name === 'A'))
    assert.ok(list.some((item) => item.name === 'B'))
    assert.ok(list.some((item) => item.name === 'C'))

    // restore the fixture
    await util.updateList([
        {file: 'state_snapshot_1.vscdb', name: 'First'},
        {file: 'state_snapshot_2.vscdb', name: 'Second'},
    ])
})

test('readPendingApplyMarker returns the marker and removes the file', async() => {
    const dir = tmpDir()
    const file = path.join(dir, 'pending-apply.json')

    fs.writeFileSync(file, JSON.stringify({type: 'snapshot', name: 'My Layout'}))

    const marker = await util.readPendingApplyMarker(file)

    assert.deepEqual(marker, {type: 'snapshot', name: 'My Layout'})
    assert.equal(fs.existsSync(file), false)
    fs.rmSync(dir, {recursive: true, force: true})
})

test('readPendingApplyMarker returns undefined for corrupt json and removes the file', async() => {
    const dir = tmpDir()
    const file = path.join(dir, 'pending-apply.json')

    fs.writeFileSync(file, '{not json')

    const marker = await util.readPendingApplyMarker(file)

    assert.equal(marker, undefined)
    assert.equal(fs.existsSync(file), false)
    fs.rmSync(dir, {recursive: true, force: true})
})

test('readPendingApplyMarker returns undefined for a missing file', async() => {
    const dir = tmpDir()

    const marker = await util.readPendingApplyMarker(path.join(dir, 'nope.json'))

    assert.equal(marker, undefined)
    fs.rmSync(dir, {recursive: true, force: true})
})

test('isLayoutKey keeps layout keys and drops data/global keys', () => {
    const keep = [
        'workbench.panel.position',
        'workbench.sideBar.hidden',
        'workbench.explorer.views.state',
        'workbench.panelpart.activepanelid',
        'workbench.view.explorer',
        'workbench.views.service.editor',
        'workbench.panel.chat',
        // profile-scoped keys never appear in the workspace db, but the
        // workbench.panel. prefix rule still covers them if they do
        'workbench.panel.size',
    ]
    const drop = [
        'memento/workbench.editors.files',
        'workbench.view.xxx.treeViewState',
        'workbench.sideBar.visible',
        'workbench.activityBar.visible.state.hidden.x',
    ]

    for (const key of keep) {
        assert.equal(util.isLayoutKey(key), true, key)
    }

    for (const key of drop) {
        assert.equal(util.isLayoutKey(key), false, key)
    }
})
