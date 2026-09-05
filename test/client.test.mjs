// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {validateLibrary} from '../lib/library.js';

test('DSH Settings edits the shared library, preserves conflicting drafts and renders text safely',async t=>{
  const dom=new JSDOM('<div id="root"></div>',{url:'http://127.0.0.1:3080',pretendToBeVisual:true,runScripts:'outside-only'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  const React=await import('react'),{createRoot}=await import('react-dom/client');
  const {act}=React;const root=createRoot(document.querySelector('#root'));
  t.after(async()=>{await act(async()=>root.unmount());dom.window.close()});
  let Page, listener, revision=0, prompts=[];
  const api={settings:{
    describe:async()=>({result:{ok:true,value:{namespaces:[{ns:'prompt-library',revision,value:{prompts:structuredClone(prompts)}}]}}}),
    mutate:async({expectedRevision,ops})=>{
      if(expectedRevision!==revision)return {result:{ok:false,error:{message:'Settings changed in another window. Refresh before saving.'}}};
      const next=ops[0].value;
      try{validateLibrary({prompts:next})}catch(error){return {result:{ok:false,error:{message:error.message}}}};
      prompts=next;revision++;return {result:{ok:true,value:{}}};
    }
  }};
  dom.window.confirm=()=>true;
  dom.window.__ModuleLoader__={load({factory}){
    factory(()=>React).apply({connection:{api},remote:{$on:(_,fn)=>{listener=fn;return()=>{}}},slots:{inject:(_,fn)=>fn(),register:(options,component)=>{assert.equal(options.id,'prompt-library');Page=component;return()=>{}}}});
  }};
  dom.window.eval(readFileSync(new URL('../lib/client.js',import.meta.url),'utf8'));
  await act(async()=>root.render(React.createElement(Page)));
  const field=name=>document.querySelector('[aria-label="'+name+'"]');
  const click=async text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text || b.getAttribute('aria-label')===text);assert.ok(button,text);await act(async()=>button.click())};
  const fill=async(name,value)=>{
    const node=field(name),prototype=node.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
    await act(async()=>{Object.getOwnPropertyDescriptor(prototype,'value').set.call(node,value);node.dispatchEvent(new window.Event('input',{bubbles:true}))});
  };
  assert.equal(field('Saved prompt text'),null);
  await click('New prompt');
  await fill('Prompt shortcut name','/review');await fill('Saved prompt text','<script>plain text</script>\nReview this.');await click('Save prompt');
  assert.equal(prompts[0].name,'review');assert.match(prompts[0].content,/<script>/);assert.equal(document.querySelector('script'),null);
  assert.equal(field('Saved prompt text'),null);
  assert.equal(document.querySelector('[aria-label="Prompt preview"]').textContent,prompts[0].content);
  await click('/review');assert.equal(field('Saved prompt text'),null);
  await click('Edit');
  await fill('Prompt shortcut name','review-code');await click('Save prompt');assert.equal(prompts.length,1);assert.equal(prompts[0].name,'review-code');
  await click('Edit');
  await fill('Saved prompt text','Discard this draft');await click('Cancel');
  assert.equal(field('Saved prompt text'),null);assert.notEqual(prompts[0].content,'Discard this draft');
  await click('Edit');
  await fill('Saved prompt text','My unsaved edit');prompts[0].content='Changed elsewhere';revision++;
  await act(async()=>listener({ns:'prompt-library'}));await click('Save prompt');
  assert.match(document.querySelector('[role=status]').textContent,/changed in another window/);
  assert.equal(field('Saved prompt text').value,'My unsaved edit');assert.equal(prompts[0].content,'Changed elsewhere');
  await click('Refresh');await click('Save prompt');assert.equal(prompts[0].content,'My unsaved edit');
  prompts[0].content='Live update';revision++;await act(async()=>listener({ns:'prompt-library'}));assert.equal(document.querySelector('[aria-label="Prompt preview"]').textContent,'Live update');
  await click('Delete prompt');assert.equal(prompts.length,0);assert.equal(field('Prompt shortcut name'),null);
  await click('New prompt');await fill('Saved prompt text','Unsaved new prompt');await click('Cancel');assert.equal(prompts.length,0);
  assert.equal(field('Saved prompt text'),null);
});
