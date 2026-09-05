// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateLibrary, importLegacy, NS} from '../lib/library.js';

const prompt = (id='1', name='summary') => ({id, name, content:'Summarise this.\nKeep details.'});
function settings(initial={prompts:[],legacyImported:false}) {
  let section={ns:NS,value:initial,revision:0};
  return {
    describe:()=>structuredClone([section]),
    async mutate(ns,ops,revision) {
      assert.equal(ns,NS);
      if (section.revision !== revision) throw new Error('Conflict');
      const next=structuredClone(section.value);
      for (const op of ops) next[op.path[0]]=op.value;
      validateLibrary(next);section={ns,value:next,revision:revision+1};
    }
  };
}
test('rejects duplicate names/IDs, invalid shortcuts, blank text and oversized libraries',()=>{
  validateLibrary({prompts:[prompt()]});
  for (const prompts of [[prompt(),prompt('2')],[prompt(),prompt('1','other')],[prompt('1','two words')],[{...prompt(),content:' '}],Array.from({length:201},(_,i)=>prompt(''+i,'p'+i)),[{...prompt(),content:'x'.repeat(32001)}]]) {
    assert.throws(()=>validateLibrary({prompts}));
  }
});
test('imports once, preserves IDs/content/original file and resolves name collisions',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'dsh-prompts-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,'augmentor'));
  const path=join(dir,'augmentor/prompts.json'),bytes=JSON.stringify({version:1,revision:2,prompts:[prompt()]});
  await writeFile(path,bytes);
  const host=settings({prompts:[prompt('2')],legacyImported:false});
  await importLegacy(host,{XDG_DATA_HOME:dir});
  const section=host.describe()[0];assert.equal(section.value.prompts.length,2);
  assert.equal(section.value.prompts[1].name,'summary-imported-1');assert.equal(section.value.prompts[1].content,prompt().content);
  assert.equal(await readFile(path,'utf8'),bytes);
  await importLegacy(host,{XDG_DATA_HOME:dir});assert.deepEqual(host.describe()[0],section);
});
test('corrupt legacy data never overwrites DSH and remains available for recovery',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'dsh-prompts-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,'augmentor'));const path=join(dir,'augmentor/prompts.json');await writeFile(path,'{broken');
  const host=settings();await assert.rejects(importLegacy(host,{XDG_DATA_HOME:dir}));
  assert.equal(host.describe()[0].value.legacyImported,false);assert.equal(await readFile(path,'utf8'),'{broken');
});
