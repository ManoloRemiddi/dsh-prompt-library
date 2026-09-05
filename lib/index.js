// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import z from 'schemastery';
import {NS, validateLibrary, importLegacy} from './library.js';

export const name = 'dsh-prompt-library';
export const inject = ['settings'];
export async function apply(ctx) {
  ctx.settings.register(NS, z.object({
    prompts: z.array(z.object({
      id: z.string().required(), name: z.string().required(),
      content: z.string().required(), updatedAt: z.string(),
    })).default([]),
    legacyImported: z.boolean().default(false),
  }), {applies: 'live', validate: validateLibrary});
  try { await importLegacy(ctx.settings); }
  catch (error) { console.warn('[prompt-library] Previous library was kept unchanged; import failed:', error.message); }
}
