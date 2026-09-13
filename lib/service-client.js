// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import {connect} from 'node:net';
import {execFile} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const LIMIT = 1024 * 1024;
const SERVICE = fileURLToPath(new URL('../services/store.py', import.meta.url));
export const PROMPT_PROTOCOL = 'augmentor-prompts/1';

export function promptCall(method, params = {}, id = randomUUID()) {
  if (!['prompts.list', 'prompts.save', 'prompts.delete', 'prompts.import'].includes(method)) {
    return Promise.reject(new Error('Unsupported prompt operation'));
  }
  const payload = JSON.stringify({protocol: PROMPT_PROTOCOL, id, method, params});
  if (Buffer.byteLength(payload) > LIMIT) return Promise.reject(new Error('Prompt request too large'));
  const endpoint = process.env.DSH_PROMPT_LIBRARY_SOCKET;
  if (endpoint) return sharedCall(endpoint, payload, id);
  const data = process.env.DSH_PROMPT_LIBRARY_DATA ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local/share'), 'dsh-prompt-library');
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.AUGMENTOR_PYTHON ?? 'python3', [SERVICE, join(data, 'prompts.sqlite3')],
      {timeout: 20000, maxBuffer: LIMIT, encoding: 'utf8'}, (error, stdout) => {
        if (error) {
          reject(new Error(error.code === 'ENOENT' ? 'Python 3 is required for standalone prompt storage.' : 'Prompt storage failed; reload before retrying a save.'));
          return;
        }
        try {
          const result = JSON.parse(stdout);
          if (result.error) throw new Error(result.error.message);
          resolve(result.result);
        } catch (failure) { reject(failure); }
      });
    child.stdin.on('error', () => {}); // execFile's completion reports process failures.
    child.stdin.end(payload);
  });
}

function sharedCall(endpoint, payload, id) {
  return new Promise((resolve, reject) => {
    const socket = connect(endpoint);
    let buffer = Buffer.alloc(0), settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(result);
    };
    socket.setTimeout(20000, () => finish(new Error('Prompt service timed out; reload before retrying a save.')));
    socket.once('connect', () => socket.write(payload + '\n'));
    socket.on('error', () => finish(new Error('Cannot reach the configured prompt service. Start Augmentor or check DSH_PROMPT_LIBRARY_SOCKET.')));
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > LIMIT) return finish(new Error('Prompt response too large'));
      const end = buffer.indexOf(10);
      if (end < 0) return;
      try {
        const response = JSON.parse(buffer.subarray(0, end).toString());
        if (response.id !== id) throw new Error('Prompt response ID mismatch');
        if (response.error) throw new Error(response.error.message);
        finish(null, response.result);
      } catch (error) { finish(error); }
    });
    socket.on('close', () => finish(new Error('Prompt service disconnected; reload before retrying a save.')));
  });
}
