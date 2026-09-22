# Herdr Project Switcher

An fzf project picker in a floating [Herdr](https://herdr.dev) popup. Every selection opens the chosen project in a **new workspace**, even if that project already has one.

## Requirements

- Herdr 0.9.1 or newer and fzf. Tested on Linux; macOS is untested.
- Git and Bun on your `PATH` for installation. Herdr builds a standalone executable, so Bun is not needed at runtime.

## Install

```sh
herdr plugin install trucke/herdr-project-switcher
```

Open the picker from a terminal inside Herdr:

```sh
herdr plugin action invoke sudokvn.project-switcher.open
```

Optional keybinding for `config.toml` (`prefix+p` is Herdr's default "previous tab"):

```toml
[[keys.command]]
key = "prefix+alt+p"
type = "plugin_action"
command = "sudokvn.project-switcher.open"
description = "switch project"
```

Then run `herdr server reload-config`.

## Controls

- Enter opens the selected project in a new workspace.
- Enter with no match asks whether to create an empty project directory with that name. Enter confirms, Escape cancels.
- Escape or Ctrl-C closes the picker.

## Configuration

Optional. Create `config.json` in the directory printed by `herdr plugin config-dir sudokvn.project-switcher`:

```json
{
  "projectRoot": "~/Projects",
  "placement": "popup"
}
```

These are the defaults. `projectRoot` must be an existing directory. `placement` is `popup` (floating) or `overlay` (zoomed over the active pane).

## Development

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
```

[MIT](LICENSE)
