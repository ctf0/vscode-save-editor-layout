# Save Editors Layout

![demos-1577823741794](https://user-images.githubusercontent.com/7388088/71633544-65b11800-2c1d-11ea-849d-2007b974fe6b.gif)

- save editor tabs & layout.
- save either locally `workspace` or globally `user settings`.
- save/update/delete groups.
- most of the commands can be either done through the command palette or the activitybar view.

### Notes

- "Untitled" tabs are not saved because they are temporary by nature
- vote on https://github.com/microsoft/vscode/issues/88612 for better api

### Limitations

- >https://code.visualstudio.com/api/references/vscode-api#TextEditor.viewColumn<br>
    > The column in which this editor shows. Will be undefined in case this isn't one of the main editors,<br>
    > e.g. an embedded editor, or when the editor column is larger than three.

- vscode doesn't give info about the column position ex.`right,left,top,bottom` nor for nested grid groups, so on reopening the editors, they will open next to eachother
