// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {Readable} from 'node:stream';
import {promptCall, PROMPT_PROTOCOL} from '../lib/service-client.js';
import {apply} from '../lib/index.js';

async function isolate(t) {
  const dir=await mkdtemp(join(tmpdir(),'dsh-library-test-'));
  const saved={data:process.env.DSH_PROMPT_LIBRARY_DATA,socket:process.env.DSH_PROMPT_LIBRARY_SOCKET};
  process.env.DSH_PROMPT_LIBRARY_DATA=dir;delete process.env.DSH_PROMPT_LIBRARY_SOCKET;
  t.after(async()=>{for(const [key,value] of Object.entries({DSH_PROMPT_LIBRARY_DATA:saved.data,DSH_PROMPT_LIBRARY_SOCKET:saved.socket}))value===undefined?delete process.env[key]:process.env[key]=value;await rm(dir,{recursive:true,force:true});});
  return dir;
}
test('standalone store survives invocations, protects revisions, and deletes only the selected prompt',async t=>{
  const dir=await isolate(t);
  assert.deepEqual((await promptCall('prompts.list')).prompts,[]);
  const a=await promptCall('prompts.save',{name:'review',content:'Review this.'});const row=a.prompts[0];
  assert.equal((await promptCall('prompts.list')).prompts[0].id,row.id);
  const b=await promptCall('prompts.save',{...row,content:'Changed',expectedRevision:row.revision});
  await assert.rejects(promptCall('prompts.save',{...row,content:'Stale',expectedRevision:row.revision}),/changed elsewhere/);
  await assert.rejects(promptCall('prompts.delete',{id:row.id,expectedRevision:row.revision}),/changed/);
  assert.equal((await promptCall('prompts.delete',{id:row.id,expectedRevision:b.prompts[0].revision})).prompts.length,0);
  assert.equal((await stat(join(dir,'prompts.sqlite3'))).mode&0o777,0o600);
});
test('validation, concurrent revisions, request IDs and repeat imports preserve data',async t=>{
  await isolate(t);
  for(const row of [{name:'bad name',content:'text'},{name:'ok',content:' '},{name:'ok',content:'x'.repeat(32001)}])await assert.rejects(promptCall('prompts.save',row));
  const first=await promptCall('prompts.save',{name:'one',content:'Text'},'same-request');
  assert.deepEqual(await promptCall('prompts.save',{name:'one',content:'Text'},'same-request'),first);
  await assert.rejects(promptCall('prompts.save',{name:'two',content:'Text'},'same-request'),/reused/);
  await assert.rejects(promptCall('prompts.save',{name:'one',content:'Duplicate'}),/already exists/);
  const row=first.prompts[0];
  const results=await Promise.allSettled(['A','B'].map(content=>promptCall('prompts.save',{...row,content,expectedRevision:row.revision})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const imported={source:'synthetic-test',prompts:[{id:'old-id',name:'imported',content:'Keep this'}]};
  const a=await promptCall('prompts.import',imported),b=await promptCall('prompts.import',imported);
  assert.deepEqual(a,b);
});
test('explicit shared socket uses the existing protocol and never retries an uncertain write',async t=>{
  const dir=await isolate(t),endpoint=join(dir,'test.sock');let calls=0;
  const server=createServer(socket=>socket.once('data',bytes=>{calls++;const req=JSON.parse(bytes.toString());assert.equal(req.protocol,PROMPT_PROTOCOL);if(req.method==='prompts.list')socket.end(JSON.stringify({id:req.id,result:{revision:0,prompts:[]}})+'\n');else socket.destroy();}));
  await new Promise(resolve=>server.listen(endpoint,resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  process.env.DSH_PROMPT_LIBRARY_SOCKET=endpoint;
  assert.deepEqual(await promptCall('prompts.list'),{revision:0,prompts:[]});
  await assert.rejects(promptCall('prompts.save',{name:'one',content:'Text'}),/disconnected/);assert.equal(calls,2);
});
test('host route rejects foreign origins and unsupported actions, and serves real standalone storage',async t=>{
  await isolate(t);let route;
  apply({effect:fn=>fn(),webServer:{register:value=>{route=value;return()=>{};}}});
  async function call(body,headers={},method='POST'){
    const req=Readable.from([JSON.stringify(body)]);Object.assign(req,{method,headers:{host:'127.0.0.1:3080','content-type':'application/json',...headers}});
    let status,reply;await route.handler(req,{writeHead:code=>status=code,end:value=>reply=JSON.parse(value)});return {status,...reply};
  }
  assert.equal((await call({action:'list'},{origin:'https://foreign.example'})).status,403);
  assert.equal((await call({action:'list'},{},'GET')).status,405);
  assert.equal((await call({action:'execute'})).status,400);
  assert.equal((await call({action:'save',name:'route',content:'Saved through HTTP'})).ok,true);
  assert.equal((await call({action:'list'})).library.prompts[0].name,'route');
});
