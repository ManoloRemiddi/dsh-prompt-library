<!-- Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT -->
# Changes

## 0.2.1 — 2026-09-13

- Package the current 0.2.0 editor and its HTTP route as a standalone DSH plugin.
- Bundle transactional SQLite prompt storage using Python's standard library.
- Optionally connect to an existing Augmentor prompt service without starting or
  replacing that service. Remove imports into the private Augmentor app tree.
- Refresh on focus or the Refresh button instead of polling every 1.5 seconds.
- Preserve stale drafts on revision conflicts; never replay a write after an
  uncertain response. Keep prompt data out of the distributed package.
- No automatic migration from 0.1.0 DSH settings. Old data stays untouched.

## 0.1.0

Original DSH settings-backed implementation. Superseded by the shared-service
0.2.0 adapter used inside Augmentor and this standalone 0.2.1 package.
