// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir} from 'node:os';

export const NS = 'prompt-library';
export function validateLibrary(value) {
  const prompts = value.prompts;
  if (!Array.isArray(prompts) || prompts.length > 200) throw new Error('Save at most 200 prompts.');
  if (Buffer.byteLength(JSON.stringify(value)) > 256 * 1024) throw new Error('The prompt library exceeds 256 KiB.');
  const names = new Set(), ids = new Set();
  for (const p of prompts) {
    if (typeof p.id !== 'string' || !p.id || p.id.length > 100 || ids.has(p.id)) throw new Error('Prompt IDs must be unique.');
    if (typeof p.name !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(p.name)) throw new Error('Use a shortcut of 1–40 letters, numbers, hyphens or underscores, starting with a letter.');
    if (names.has(p.name)) throw new Error('A prompt with that shortcut already exists.');
    if (typeof p.content !== 'string' || !p.content.trim() || p.content.length > 32000) throw new Error('Prompt text must contain 1–32,000 characters.');
    names.add(p.name); ids.add(p.id);
  }
}

// One-time import keeps the original file intact. DSH's revision check prevents
// importing over a concurrent Settings edit; a later startup can retry safely.
export async function importLegacy(settings, env = process.env) {
  const current = settings.describe().find(row => row.ns === NS);
  if (!current || current.value.legacyImported) return;
  const path = join(env.XDG_DATA_HOME || join(homedir(), '.local/share'), 'augmentor/prompts.json');
  let legacy = [];
  try {
    const bytes = await readFile(path);
    if (bytes.length > 256 * 1024) throw new Error('The previous prompt library exceeds 256 KiB.');
    const stored = JSON.parse(bytes.toString('utf8'));
    if (stored.version !== 1) throw new Error('Unsupported previous prompt library version.');
    validateLibrary(stored); legacy = stored.prompts;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const prompts = current.value.prompts.slice();
  for (const item of legacy) {
    if (prompts.some(p => p.id === item.id)) continue;
    let name = item.name, suffix = 0;
    while (prompts.some(p => p.name === name)) name = item.name.slice(0, 26) + '-imported-' + (++suffix);
    prompts.push({...item, name});
  }
  validateLibrary({prompts});
  await settings.mutate(NS, [
    {op: 'set', path: ['prompts'], value: prompts},
    {op: 'set', path: ['legacyImported'], value: true},
  ], current.revision);
}
