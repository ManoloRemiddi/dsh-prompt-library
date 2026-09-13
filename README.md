<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->
# DSH Prompt Library

Save, search, preview, edit and delete reusable prompts in **DSH → Settings →
Prompt library**. Prompt text is rendered as text. Saving does not call a model
or send a chat message. This plugin can work on its own or use an already-running
Augmentor prompt service.

## Download and install

[Download 0.2.1](https://github.com/ManoloRemiddi/dsh-prompt-library/releases/tag/v0.2.1).
Use the ready-made `.tgz` asset:

```sh
dsh plugin --profile web add https://github.com/ManoloRemiddi/dsh-prompt-library/releases/download/v0.2.1/dsh-prompt-library-0.2.1.tgz
```

Requirements: Linux, Node.js 22.19+ and a working DSH web profile. The standalone
store needs **Python 3 with SQLite support** (included in standard Python builds).
Checked with DSH **0.1.5-rc.1**; other versions may change its web/UI interfaces.
No npm runtime dependencies or Python packages need to be downloaded for the
store; DSH supplies the web client/React environment.

Use your actual profile if different from `web`. Finish active tasks, restart
your existing DSH process and reload its page. Open Settings → Prompt library,
click **New prompt**, enter a shortcut and text, and click **Save prompt**.

This package adds the editor. Slash-menu insertion in a chat composer requires
a compatible Augmentor interface; it is not added to every DSH composer by this
plugin. `[clipboard]` is stored as a literal marker; expansion belongs to a
compatible consuming app, not the editor.

## Storage modes

**Standalone (default):** data lives in
`$XDG_DATA_HOME/dsh-prompt-library/prompts.sqlite3`, or
`~/.local/share/dsh-prompt-library/prompts.sqlite3` when XDG_DATA_HOME is unset.
Set `DSH_PROMPT_LIBRARY_DATA` in the environment used to start DSH to choose a
different directory. `AUGMENTOR_PYTHON` can select the Python executable.

A short-lived Python process handles each requested storage operation and exits.
There is no persistent companion, polling timer, model call or GPU keep-alive.
The editor refreshes when the window regains focus or you click **Refresh**.

**Existing Augmentor service:** set `DSH_PROMPT_LIBRARY_SOCKET` to its existing
Unix socket in the environment used to start DSH, for example:

```sh
export DSH_PROMPT_LIBRARY_SOCKET="$HOME/.local/state/augmentor/prompts.sock"
dsh web
```

Start DSH this way only if an existing instance is not already running; for a
managed service, set the variable in that service's environment instead.
Use the actual socket path if Augmentor uses custom state paths. The service must
already be running and support `augmentor-prompts/1`. The plugin connects to it
without spawning, replacing or upgrading it. If unavailable, it reports an error;
it does not silently create a second prompt store. Python is not required by the
plugin in this mode. Use this mode to share prompts with compatible Augmentor apps.

## Upgrading and data safety

Version 0.1.0 stored prompts in DSH settings. The app-embedded 0.2.0 adapter used
the shared Augmentor service. **0.2.1 does not automatically move either store.**
A new default standalone installation starts empty and leaves old data intact.
To retain an existing Augmentor library, select its socket as described above.
For a 0.1.0 library, keep its settings backup and copy entries deliberately; do not
interpret an empty new store as deleted data. Existing `link:` installations should
update their source or replace that installation deliberately, without duplicate
bundle rows.

Concurrent saves use each prompt's revision. A stale draft remains visible after
a conflict; copy it somewhere safe, refresh and reselect the current prompt before
applying your changes. The plugin never automatically retries an uncertain write.

The standalone store accepts shortcut names of 1–128 letters, digits, hyphens or
underscores, up to 32,000 characters per prompt, at most 1,000 prompts and 500,000
UTF-8 bytes of prompt content overall. Duplicate names are rejected. It creates
private local data files. Back up the SQLite file while no prompt operation is
running. The distributed package contains no saved prompts.

## Remove

```sh
dsh plugin --profile web remove dsh-prompt-library
```

Restart DSH and reload the page. Uninstalling leaves your database and any
external Augmentor service untouched. Remove your chosen standalone data directory
separately only if you intentionally want to delete the saved prompts.

## Tests and development

```sh
npm ci --ignore-scripts
npm test
npm pack
```

Tests use temporary databases and a synthetic local socket. They cover CRUD,
revision conflicts, concurrent writes, import deduplication, request-ID handling,
no replay after a lost response, HTTP origin/action checks, and the React editor
using the real packaged store. They do not read your prompt database or call a
model. A disposable DSH install/composition/removal and a packaged storage call
were also checked for this release; this is not a full native-browser end-to-end test.

This release packages the current Augmentor 0.2.0 editor, replacing its private
app imports with the included prompt-only store/client. No memory, computer
control, diagnostic or app-management service is included.

[Report a problem](https://github.com/ManoloRemiddi/dsh-prompt-library/issues) with
your DSH version, storage mode and synthetic reproduction. Do not attach prompt
databases or credentials. Browse the
[DeepSeek Harness Plugins collection](https://github.com/ManoloRemiddi/deepseek-harness-plugins).

MIT © 2026 Manolo Remiddi.
