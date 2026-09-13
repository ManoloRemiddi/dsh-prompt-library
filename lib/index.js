// Copyright © 2026 Manolo Remiddi · SPDX-License-Identifier: MIT
// Public DSH webServer route; storage is standalone or an explicitly selected shared service.
import {promptCall} from './service-client.js';
export const name='dsh-prompt-library';
export const inject=['webServer'];
export function apply(ctx){
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/api/augmentor-prompts',handler:async(req,res)=>{
    const reply=(code,value)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
    const origin=req.headers.origin;
    if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`){reply(403,{ok:false,error:'Origin not allowed'});return;}
    if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json')){reply(405,{ok:false,error:'Use JSON POST'});return;}
    try{
      let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>1024*1024)throw new Error('Request too large');}
      const {action='list',...params}=JSON.parse(raw);
      if(!['list','save','delete'].includes(action))throw new Error('Unsupported prompt action');
      reply(200,{ok:true,library:await promptCall('prompts.'+action,params)});
    }catch(error){reply(400,{ok:false,error:error.message});}
  }}));
}
