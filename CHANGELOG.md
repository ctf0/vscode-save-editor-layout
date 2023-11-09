# Change Log

## 0.0.1

- Initial release

## 0.0.5

- new tree view btns to
    + open settings file
    + close all opened editors and reset layout
    + setup file group position, set "`workbench.editor.closeEmptyGroups: false`"
- new configs
    + hideSideBarAfterOpen
    + layingOutType

### 0.0.7

- remove the position btns from the view group parent

### 0.0.9

- change config display name to `Save Editor Layout` to avoid confusion with vscode nameing, also the config is now `saveEditorLayout.list` instead of `editorLayout.list`

### 0.1.0

- better api to check for untitled files

### 0.2.0

- better api
- add new config `defaultOrientation` & remove `layingOutType` which was confusing
- add option to change layout orientation vie tree list view
- when updating the item position, item column will also be updated so we can have a correct layout

### 0.2.1

- remove auto update column on position change, instead u will have 2 buttons `+ & -` to change the column number as needed same as position
- add btn to open a group directly instead of choosing from the picker.
- add support to save files as relative paths, check `saveEditorLayout.saveAbsolutePath`
- fix open settings files when using workspace instead of global
- fix pkg name in notification msg

### 0.3.0

- use better api to collect opened tabs paths instead of looping over
- show confirm dialog for group overwrite & removal
- convert to TS
- closing files will be more intelligent now, only saved tabs will be closed (unsaved & untitled will be kept open)

### 1.0.0

- use the new api to correctly save the layout, require vscode v1.77.0
- cleanup

### 2.0.0

- support pinned tabs [#8](https://github.com/ctf0/vscode-save-editor-layout/issues/8)
- fix updating a group not counting for the layout changes

### 2.0.1

- add new configs `restoreLayoutOnly` [#9](https://github.com/ctf0/vscode-save-editor-layout/issues/9) & `saveToGlobalWhenPossible`
