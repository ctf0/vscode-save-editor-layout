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
- add support to save files as relative paths, check `saveAbsolutePath.saveAbsolutePath`
- fix open settings files when using workspace instead of global
- fix pkg name in notification msg
