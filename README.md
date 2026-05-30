# Task States

Toggle and customize Markdown task states by clicking the checkbox, with per-state colors, an optional date tag, and a drag-to-reorder click cycle.

## Features

- Cycle task states with a single checkbox click, in Reading view, Live Preview, and Source mode.
- Six cyclic states plus a non-cyclic `[:]` NOTE state, each with its own Markdown marker, name, and color.
- Per-state customization: name, checkbox color, text color, and strikethrough.
- Drag-and-drop reordering of the intermediate states, which also changes the click cycle.
- Optional date on any task: pick it from a calendar button or a command, shown formatted in Reading view.
- Configurable date format, language, and tag colors.
- Everything is stored as plain Markdown in the note, and no other plugin is required.
- Works with `-`, `*`, and `+` task bullets, nested tasks, and blockquote task lines.
- Works on desktop and mobile.

## State cycle

Clicking a task checkbox advances it to the next state:

| Marker | State | Default color |
| --- | --- | --- |
| `[ ]` | TODO | grey |
| `[!]` | PRIORITY | green |
| `[>]` | PROGRESS | amber |
| `[*]` | STANDBY | purple |
| `[-]` | CANCELLED | red |
| `[x]` | DONE | grey |

The cycle runs TODO → PRIORITY → PROGRESS → STANDBY → CANCELLED → DONE → back to TODO.

TODO is always first and DONE is always last. The four intermediate states (PRIORITY, PROGRESS, STANDBY, CANCELLED) can be reordered by drag-and-drop in the settings, which changes the click cycle accordingly.

## NOTE state (non-cyclic)

- `[:]` NOTE stays outside the click cycle.
- Apply it by typing the `[:]` marker on a task line. Clicking its checkbox leaves the state unchanged.
- Customize its name and color in the settings, under "Non-cyclic State".

## Task dates

Each task can carry a date, written on the task line as the inline field `[data:: YYYY-MM-DD]`.

- In Reading view, a small calendar button appears next to each task checkbox. Click it to open a date picker with Clear, Today, Cancel, and Apply.
- In the editor, run the command "Add or update task date" to set the date on the task at the cursor. You can assign it a hotkey (there is a shortcut button in the settings).
- In Reading view the date is displayed formatted and styled as a tag, while the raw `[data:: ...]` text stays in the note.

## Customization

Open Settings, go to Community plugins, and select Task States.

### Task State Names and Colors
- Rename any state. The Markdown markers themselves are fixed.
- Set each state's checkbox color (the circle in front of its marker).
- Set the task text color for STANDBY, CANCELLED, and DONE.
- Toggle strikethrough on the task text for CANCELLED and DONE (shown as a wavy line in the state color).
- Drag the intermediate states by the handle to set the click cycle order.

### Non-cyclic State
- Name and color for the `[:]` NOTE state.

### Displayed Date Format
- Format: the date pattern, for example `DD MMMM, YYYY`, `DD/MM/YYYY`, or `MMMM D, YYYY`.
- Locale: the language code, for example `pt-br`, `en`, `es`, or `fr`.

### Date Tag Colors
- Background color and opacity of the date tag.
- Color and opacity of the formatted date text.

### Date Hotkey
- A button that opens the hotkey settings already filtered to the date command.

### Restore Defaults
- Resets names, colors, text colors, strikethrough, cycle order, and all date settings.

## Usage

1. Open a Markdown note with task items, for example `- [ ] Task`.
2. Click directly on the checkbox to advance the state.
3. Type `[:]` for a NOTE, or use the calendar button or command to add a date.

## How it works

- In Reading view, the plugin intercepts checkbox clicks, finds the matching task line in the note, and rewrites that line's marker.
- In Source mode and Live Preview, it resolves the clicked line in the editor and updates that task marker directly.
- Names, colors, text colors, strikethrough, and tag colors are applied through CSS variables set on the document, so changes take effect immediately.
- An unknown marker is normalized to `[ ]` (TODO) on the next click, except the non-cyclic `[:]` NOTE marker, which is preserved.

## Compatibility

The date is stored as the inline field `[data:: YYYY-MM-DD]`, which the Dataview plugin can read. The formatted display in Reading view works on its own and does not require any other plugin.

## Installation

### From Obsidian
1. Open Settings, go to Community plugins, and turn off Restricted mode.
2. Browse the community plugins, search for "Task States", install it, and enable it.

### Manual
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release.
2. Copy them into `<vault>/.obsidian/plugins/task-states/`.
3. Reload Obsidian and enable the plugin in Settings, under Community plugins.

## License

Released under the MIT License. See [LICENSE](LICENSE).
