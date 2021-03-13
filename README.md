# Save Editors Layout

![demos-1577823741794](https://user-images.githubusercontent.com/7388088/71633544-65b11800-2c1d-11ea-849d-2007b974fe6b.gif)

## Features

- save editor tabs & layout.
- save either locally `workspace` or globally `user settings`.
- save/update/delete groups.
- edit file column & position after save with ease.
- most of the commands can be either done through the command palette or the activitybar view.

### TODO

- [ ] show confirm on group remove
- [ ] allow to overwrite already saved groups

### Notes

- "Untitled" tabs are not saved because they are temporary by nature
- make sure to set `workbench.editor.closeEmptyGroups: false`
- vote on https://github.com/microsoft/vscode/issues/88612 for better api

---

### Limitations

- vscode doesn't give info about the column `right,left` or row `top,bottom` positions nor nested grid groups, so on reopening the editors might open next to eachother,
for example https://code.visualstudio.com/assets/updates/1_25/grid-numbering.png, in theory we should get
    >
    >- 2 normal columns
    >- 1 column
    >     - 2 rows
    >         - 1 column
    >         - 2 columns
    >
    instead we will get 5 columns, therefor its impossible to restore the layout as expected.

- because of the previous point, in order to get as close as possible to the expected behavior you will need to
    1. save the opened editors like usual
    2. update each item position from the list view

        ![Screen Shot 2021-03-12 at 7 49 47 AM](https://user-images.githubusercontent.com/7388088/110898275-99023300-8307-11eb-87e9-e48fc0f720a0.png)
