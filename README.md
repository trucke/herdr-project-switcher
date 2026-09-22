# Herdr Project Switcher

A small fzf project picker in a floating [Herdr](https://herdr.dev) popup. Every selection creates and focuses a **new workspace**, even when that project already has one.

- Lists the immediate, non-hidden directories under `~/Projects` (configurable), refreshed on every invocation.
- Enter opens the selected project in a new workspace.
- Enter with zero matches keeps the exact query and asks whether to create an empty project directory. **Create project** is preselected; press Enter again to confirm or Escape to cancel.
- Escape or Ctrl-C cancels without creating a directory or workspace.
- Deliberately out of scope: Git/jj initialization, templates, workspace reuse and any background service.

A personal project by Kevin (`sudokvn`).

## Requirements

Runtime: **Herdr 0.9.1 or newer and fzf** on Linux or macOS. Developed and used with Herdr CLI 0.9.1 and fzf 0.74.3 on Linux. Older fzf releases are untested; the confirmation and error screens rely on `--no-input`. The macOS platform entry in the manifest has not been exercised.

Build: **Bun** plus the dev dependencies in `package.json`. The compiled executable embeds Bun, so neither Bun nor Node is needed at runtime. Build on each target OS/architecture you want to run it on.

## Install

Have **Git and Bun** available on your `PATH` for installation, plus **Herdr and fzf** to use the plugin:

```sh
herdr plugin install trucke/herdr-project-switcher
```

Herdr clones the repository, installs its build dependencies with Bun and compiles the executable. Bun is only needed for installation or rebuilding, not for running the picker. Herdr does not install Git, Bun or fzf for you.

From a terminal inside Herdr, open the picker:

```sh
herdr plugin action invoke sudokvn.project-switcher.open
```

You can also add the keybinding below. Installation is global for your user, not limited to one session. If you already linked a local checkout, keep using that or unlink it before installing from GitHub.

To remove a GitHub-installed copy:

```sh
herdr plugin uninstall sudokvn.project-switcher
```

## Build locally

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run build
```

Output: `dist/herdr-project-switcher`. The source is three TypeScript files with no runtime npm dependencies. `bun run dev -- open` runs the action from source when Herdr's plugin environment variables are present.

## Local linking and keybinding

Build first: `herdr plugin link` registers the manifest but does not run its build commands. Linking is global for your user, not scoped to the current session.

```sh
herdr plugin link /path/to/herdr-project-switcher
herdr plugin action invoke sudokvn.project-switcher.open
```

Add a keybinding to your Herdr `config.toml` and reload. `prefix+p` is taken by Herdr's default "previous tab" binding, so this uses `prefix+alt+p`:

```toml
[[keys.command]]
key = "prefix+alt+p"
type = "plugin_action"
command = "sudokvn.project-switcher.open"
description = "switch project"
```

```sh
herdr server reload-config
```

To unregister without deleting the checkout:

```sh
herdr plugin unlink sudokvn.project-switcher
```

## Configuration

Optional. Find the managed config directory after installing or linking and create `config.json` there:

```sh
herdr plugin config-dir sudokvn.project-switcher
```

```json
{
  "projectRoot": "~/Projects",
  "placement": "popup"
}
```

The values above are the defaults. A missing file uses them; malformed JSON, unknown keys and invalid values are errors. Config is read on every invocation, so edits apply the next time you open the picker.

- `projectRoot`: absolute path, `~` or `~/...`. Relative paths and `~otheruser` are rejected. Environment variables and shell syntax are not expanded. The directory must exist; a symlinked root is resolved to its canonical directory.
- `placement`: `popup` (floating, 90 columns by 16 rows, from the manifest) or `overlay` (temporarily zoomed over the active pane). Only the **action** honors this; opening the pane entrypoint directly always uses the manifest popup.

## Safety and error handling

Discovery excludes files, symlinks, hidden directories and names containing terminal control characters. New project names must be a single non-blank path component without slashes, backslashes or control characters. Dot-prefixed names are rejected because they would vanish from the next listing. Spaces and shell punctuation are kept literally; nothing is passed through a shell.

Creation uses a non-recursive `mkdir`, so an existing directory, file or symlink is a collision rather than something to reuse. The canonical root is checked again before creation, and child symlinks are rejected. This is validation, not a sandbox: use a trusted root that hostile concurrent processes cannot write to.

fzf runs with explicit input and every `FZF_*` variable removed from its environment, so personal defaults cannot add auto-selection, shell previews or a different output format.

Errors are shown in the popup until dismissed. An invalid new name returns to the picker with the query kept; other errors close the picker. If the directory is created but the Herdr call fails, the empty directory is kept and the call is not retried, because Herdr may already have created the workspace. Check `herdr` before trying again.

## How it talks to Herdr

The plugin calls the CLI at `HERDR_BIN_PATH` and inherits Herdr's socket and session context; it does not speak the socket protocol itself. The action opens the `picker` pane; the picker runs `workspace create --cwd PATH --focus` and exits, and Herdr then tears down the popup or overlay while keeping the new workspace focused.

Herdr 0.9.1 accepts `placement = "popup"` in the manifest but not on the CLI `--placement` flag, so the action passes `--placement overlay` only when configured and otherwise relies on the manifest default. The plugin never closes a pane ID it inherited or the session's popup resource.

## Tests

`bun test` covers config parsing, discovery, name and path validation, collision and symlink handling, fzf output parsing and the placement arguments.

`python3 tests/terminal.py` (Unix, Python 3, run after `bun run build`) drives the compiled binary and a real fzf in a pseudo-terminal against a fake `herdr` that records its arguments. It exercises repeated selection of the same project, names with spaces, creation confirmation, both cancel paths and hostile `FZF_DEFAULT_OPTS`. No Herdr server is contacted.
