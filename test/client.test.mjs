// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {JSDOM} from 'jsdom';
import {promptCall} from '../lib/service-client.js';

test('editor uses packaged storage, previews plain text, preserves conflicting drafts and refreshes on focus',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'dsh-prompt-ui-'));process.env.DSH_PROMPT_LIBRARY_DATA=dir;delete process.env.DSH_PROMPT_LIBRARY_SOCKET;
  const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1:3080',pretendToBeVisual:true,runScripts:'outside-only'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react'),{createRoot}=await import('react-dom/client');const {act}=React;const root=createRoot(document.querySelector('#root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close();await rm(dir,{recursive:true,force:true});});
  let Page;const pending=[];
  dom.window.fetch=async(_url,options)=>{
    const {action,...params}=JSON.parse(options.body);
    const work=promptCall('prompts.'+action,params).then(library=>({ok:true,library}),error=>({ok:false,error:error.message}));pending.push(work);
    return {json:()=>work};
  };
  const flush=async()=>{await act(async()=>{do { await Promise.all(pending.splice(0)); await new Promise(setImmediate); } while(pending.length);});};
  dom.window.confirm=()=>true;dom.window.setInterval=()=>{throw Error('No background polling');};
  dom.window.__ModuleLoader__={load({factory}){factory(()=>React).apply({slots:{inject:(_,fn)=>fn(),register:(_,component)=>{Page=component;return()=>{};}}});}};
  dom.window.eval(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'));
  await act(async()=>root.render(React.createElement(Page)));await flush();
  const field=name=>document.querySelector('[aria-label="'+name+'"]');
  const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text||b.getAttribute('aria-label')===text);assert.ok(button,text);await act(async()=>button.click());await flush();};
  const fill=async(name,value)=>{const node=field(name),prototype=node.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}));});};
  await click('New prompt');await fill('Prompt shortcut name','/review');await fill('Saved prompt text','<script>plain text</script>');await click('Save prompt');
  assert.equal(document.querySelector('script'),null);assert.equal(field('Prompt preview').textContent,'<script>plain text</script>');
  await click('Edit');await fill('Prompt shortcut name','review-code');await click('Save prompt');
  let row=(await promptCall('prompts.list')).prompts[0];assert.equal(row.name,'review-code');
  await click('Edit');await fill('Saved prompt text','My draft');
  await promptCall('prompts.save',{...row,content:'Changed elsewhere',expectedRevision:row.revision});
  await click('Save prompt');assert.match(document.querySelector('[role=status]').textContent,/changed elsewhere/);assert.equal(field('Saved prompt text').value,'My draft');
  await click('Refresh');assert.equal(field('Saved prompt text').value,'My draft');await click('Cancel');
  row=(await promptCall('prompts.list')).prompts[0];await promptCall('prompts.save',{...row,content:'Focus refresh',expectedRevision:row.revision});
  await act(async()=>window.dispatchEvent(new window.Event('focus')));await flush();assert.equal(field('Prompt preview').textContent,'Focus refresh');
  await click('Delete prompt');assert.equal((await promptCall('prompts.list')).prompts.length,0);
});
