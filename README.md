# Task States

Toggle task states by clicking the task checkbox.

## Features

- Cycles task states with a single checkbox click.
- Works in Reading view, Live Preview, and Source mode.
- Preserves Markdown task syntax directly in the note file.
- Supports task list bullets `-`, `*`, and `+`.
- Supports nested tasks and blockquote task lines.

## State Cycle

- `[ ]` TODO
- `[*]` STANDBY
- `[x]` DONE
- `[-]` CANCELLED
- `[!]` PRIORITY
- `[>]` PROGRESS
- Back to `[ ]` TODO

## Usage

- Open a Markdown note with task items, for example `- [ ] Task`.
- Click directly on the checkbox.
- Each click advances the state to the next value in the cycle.

## How It Works

- In Reading view, the system intercepts checkbox clicks and updates the note content using internal file APIs.
- In Source and Live Preview, it resolves the clicked line in the editor and updates that specific task marker.
- If a task has an unknown marker, the next click normalizes it to `[*]` (STANDBY).

## Roadmap

- Add settings panel for custom colors and state labels.
- Allow custom task cycle order.
- Add commands and hotkeys for state changes.
- Improve compatibility with other extensions and themes.
