# Save Editors Layout

## v3+

Save and restore the editor layout of your VS Code workspaces, and apply a layout template to any workspace -- with an automatic restart so the changes take effect.

this is a different solution from v2 which use the official vscode api which is inefficient/insufficient, so with this version we go to the source which is the `state.vscdb` that vscode save for each workspace.

now we can save a complete & accurate snapshot of the current editor state without worrying about any api changes & regardless of how complex the layout is.

## Features

- **Workspace snapshots** -- save a complate snapshot of the current editor layout.
- **Layout templates** (global & portable) -- save the current layout as a template so you can apply it to every/any workspace, you can also export/import it so you use it on different machines.
- **Snapshots view** -- a tree view listing all snapshots of the current workspace, with orphaned entries pruned automatically.
- **Auto apply** -- optionally apply the layout template automatically to new workspaces.
- **Accurate save** -- optionally restart VS Code when saving a snapshot so the database captures the exact current layout, including panels and auxiliary bar state.
- Access all the extension features through the view title bar or the command palette.

## Commands

| Command                   | Description                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Save Snapshot`           | capture the current workspace layout as a snapshot                                                                                                        |
| `Restore Snapshot`        | restore a snapshot                                                                                                                                        |
| `Delete Snapshot`         | delete a snapshot                                                                                                                                         |
| `Save Layout as Template` | capture the current workspace layout as a global layout template                                                                                          |
| `Update Layout Template`  | overwrite the global template with the current workspace layout                                                                                           |
| `Apply Layout Template`   | apply the global template                                                                                                                                 |
| `Export Layout Template`  | export the template (choose the destination)                                                                                                              |
| `Import Layout Template`  | pick a template file (`.vscdb`) and install it as the global template (validated before import; asks for confirmation before overwriting an existing one) |
| `Refresh`                 | refresh the snapshots view                                                                                                                                |

## SaveMode

Controls how snapshots are saved. Default: `"quick"`.

| Mode       | Behavior                                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quick`    | Copies the workspace database immediately without restarting. Fast, but panel and auxiliary bar positions may not be restored as expected.                       |
| `accurate` | Quits VS Code, copies the freshly-flushed database after shutdown, then relaunches. Always captures the exact current layout, but requires the editor to reload. |
| `ask`      | Shows a picker each time you save, letting you choose between quick/accurate modes.                                                                              |

## Why some operations require a restart

This extension reads and writes VS Code's workspace state database (`state.vscdb`) directly -- there is no API (and probably never will) to control the editor layout programmatically.

VS Code stores layout state (panel visibility, sidebar position, auxiliary bar state, etc.) in two tiers:

- **In-memory cache** -- updated immediately when you move or toggle panels.
- **On-disk database** -- only flushed to `state.vscdb` during shutdown, or periodically every ~x seconds.

This means the on-disk database is often **stale** during a session. If you open the panel or auxiliary bar and immediately save a snapshot, the database still says they're hidden as the in-memory changes haven't been written yet.

The **relaunch helper** (`resources/relaunch-helper.js`) solves this by running *after* VS Code exits. The sequence is:

1. VS Code begins shutdown -> flushes all in-memory layout state to `state.vscdb`.
2. VS Code exits -> the database is now closed and fully up-to-date.
3. The helper process (spawned before exit) waits for VS Code to terminate, then copies the freshly-flushed database.
4. The helper relaunches VS Code with the same window.

This guarantees the database on disk matches the actual layout at the moment of save, which is impossible to achieve while VS Code is still running.

Operations that use the relaunch helper:

- **Apply Template** -- merges template keys into the workspace database.
- **Restore Snapshot** -- copies the snapshot over the workspace database.
- **Accurate Save** -- copies the freshly-flushed workspace database to a snapshot file.

### PS

To easily access the workspace/global storage paths, you can use my [Clear Storage Extension](https://marketplace.visualstudio.com/items?itemName=ctf0.clear-storage)
