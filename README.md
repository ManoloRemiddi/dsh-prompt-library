<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->
# DSH Prompt library

A local DSH plugin that owns reusable prompts for Augmentor's Linux app and browser extension. Open **DSH → Settings → Prompt library** to add a shortcut name and prompt text, search, rename or delete entries. Click a saved prompt to preview its full text, then choose **Edit**. **Save prompt** updates that entry and returns to its preview; **Cancel** discards the draft. In either Augmentor composer, type `/` followed by the name; select with arrows and Enter/Tab to insert into the draft. Insertion does not send a message.

Source repository: [github.com/ManoloRemiddi/dsh-prompt-library](https://github.com/ManoloRemiddi/dsh-prompt-library)

The library starts empty. Names use lowercase letters, numbers, hyphens and underscores, begin with a letter and have at most 40 characters. There are limits of 200 prompts, 32,000 characters per prompt and 256 KiB overall. Duplicate names and IDs are rejected by the host. Concurrent edits use DSH's namespace revision checks; a conflict keeps the draft for review and refresh.

## Install

```sh
npm ci --omit=dev --ignore-scripts
dsh plugin --profile web add 'link:/absolute/path/to/prompt-library-plugin'
```

Reload DSH when its sessions are idle, then refresh its browser page. This package declares a DSH bundle and a client module; it does not edit DSH's shipped code. Tested against DSH `0.1.1-rc.2`; retest the public contracts before upgrading. The native app and extension changes in their development checkouts must also be loaded.

## Shared contract

- The host registers `prompt-library` using `ctx.settings.register` with live validation.
- The editor registers the public `settings.section` slot and uses `settings.describe` / `settings.mutate` with `expectedRevision`.
- Consumers read the matching namespace from `settings.describe`. Its `value.prompts` is an array of `{id, name, content, updatedAt}`. Consumers do not write a separate database.
- DSH persists the namespace in its local settings document (normally `~/.dsh/settings.yaml`), alongside its other plugin settings. Neither the plugin nor selecting a saved prompt calls a model.
- The first activation imports the old `$XDG_DATA_HOME/augmentor/prompts.json` file when present. IDs and contents are preserved; name collisions get an `-imported-N` suffix. Import is marked in DSH only after a successful commit. The old file is left intact for recovery; it is no longer the live source.

The plugin has no MX Linux or desktop-shell dependency. ResonantOS or another DSH surface can consume the same namespace without embedding the Augmentor UI or duplicating storage.

## Tests

```sh
npm ci --ignore-scripts
npm test
```

Tests cover validation, one-time migration, corrupt legacy-file preservation, settings CRUD, cross-window conflicts, live updates and rendering prompt bodies as text.
