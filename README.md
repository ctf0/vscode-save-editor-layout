# Save Editors Layout v3

## Features

- save a full snapshot of the layout.
- a totally different work around from [v2](https://github.com/ctf0/vscode-save-editor-layout) as there is no api to achieve that atm.
- check the notes below for the drawbacks.

### Notes

- snapshots are saved per workspace, no global snapshots "at least not yet"
- the editor have to shut down after restoring a snapshot
    - restarting wont cut it unfortunately, because vscode save the current state on restart.
    - vscode saves the current editor state every few seconds `2~5` (a safety net for accidental close or similar), which will overwrite the state we just restored if we waited for a while.
- atm its not possible to auto-reload vscode (shuting down > re-opening), similar to when the new editor applies new update, however if you find a way plz open a PR.
