import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRotatingGroqProvider,KEY_ROTATION_MS} from '../src/providers/rotatingGroq.ts';
import {createGroqProvider,ProviderHttpError,rateLimitCooldownMs,retryAfterMs,type CompletionRequest} from '../src/providers/groq.ts';
import {PrepError} from '../src/errors.ts';
import {loadConfig} from '../src/config.ts';
import {buildServer} from '../src/server.ts';
const request=():CompletionRequest=>({messages:[{role:'user',content:'test'}],schemaName:'test',schema:{},maxCompletionTokens:10,signal:new AbortController().signal});
const result=(key:string)=>({content:key,finishReason:'stop',model:'fixture',usage:{promptTokens:0,completionTokens:0,reasoningTokens:0,totalTokens:0}});
const limited=(ms:number|null)=>new ProviderHttpError(new PrepError('PROVIDER_RATE_LIMIT'),ms,ms);

test('rotates A -> B -> C -> A at exact five-minute boundaries',async()=>{
 let time=0;const seen:string[]=[];
 const provider=createRotatingGroqProvider({apiKeys:['A','B','C'],model:'fixture',now:()=>time,createProvider:key=>async()=>{seen.push(key);return result(key);}});
 await provider(request());time=KEY_ROTATION_MS-1;await provider(request());
 time=KEY_ROTATION_MS;await provider(request());time=KEY_ROTATION_MS*2;await provider(request());time=KEY_ROTATION_MS*3;await provider(request());
 assert.deepEqual(seen,['A','A','B','C','A']);
});
test('advances correctly after multiple idle rotation intervals',async()=>{
 let time=0;const provider=createRotatingGroqProvider({apiKeys:['A','B','C'],model:'fixture',now:()=>time,createProvider:key=>async()=>result(key)});
 time=KEY_ROTATION_MS*4;assert.equal((await provider(request())).content,'B');
});
test('a rate-limited key fails over immediately and is not revived by the rotation timer',async()=>{
 let time=0;const seen:string[]=[];
 const provider=createRotatingGroqProvider({apiKeys:['A','B'],model:'fixture',now:()=>time,createProvider:key=>async()=>{seen.push(key);if(key==='A'&&time<900000)throw limited(900000);return result(key);}});
 assert.equal((await provider(request())).content,'B');
 time=300000;assert.equal((await provider(request())).content,'B');
 assert.deepEqual(seen,['A','B','B']);
 time=600000;assert.equal((await provider(request())).content,'B');
 time=900000;assert.equal((await provider(request())).content,'A');
});
test('all limited keys are tried once, and subsequent calls make no requests until reset',async()=>{
 let time=0;const seen:string[]=[];
 const provider=createRotatingGroqProvider({apiKeys:['A','B'],model:'fixture',now:()=>time,createProvider:key=>async()=>{seen.push(key);throw limited(600000);}});
 for(let i=0;i<2;i++)await assert.rejects(provider(request()),(e:unknown)=>e instanceof ProviderHttpError && e.code==='PROVIDER_RATE_LIMIT' && e.retryAfterMs===600000);
 assert.deepEqual(seen,['A','B']);
 time=600000;await assert.rejects(provider(request()),/cooling down/);assert.equal(seen.length,4);
});
test('missing reset metadata uses a five-minute cooldown',async()=>{
 let time=0;let calls=0;
 const provider=createRotatingGroqProvider({apiKeys:['A'],model:'fixture',now:()=>time,createProvider:()=>async()=>{calls++;throw limited(null);}});
 await assert.rejects(provider(request()),(e:unknown)=>e instanceof ProviderHttpError&&e.cooldownMs===300000);
 time=299999;await assert.rejects(provider(request()));assert.equal(calls,1);
 time=300000;await assert.rejects(provider(request()));assert.equal(calls,2);
});
test('invalid credentials are skipped until API restart',async()=>{
 let time=0;const seen:string[]=[];
 const provider=createRotatingGroqProvider({apiKeys:['A','B'],model:'fixture',now:()=>time,createProvider:key=>async()=>{seen.push(key);if(key==='A')throw new PrepError('PROVIDER_AUTH');return result(key);}});
 await provider(request());time=300000;await provider(request());assert.deepEqual(seen,['A','B','B']);
});
test('schema errors do not cycle credentials or consume more provider calls',async()=>{
 const seen:string[]=[];const provider=createRotatingGroqProvider({apiKeys:['A','B'],model:'fixture',createProvider:key=>async()=>{seen.push(key);throw new PrepError('INVALID_PLAN');}});
 await assert.rejects(provider(request()),(e:unknown)=>e instanceof PrepError&&e.code==='INVALID_PLAN');assert.deepEqual(seen,['A']);
});
test('cancellation does not fail over to another key',async()=>{
 const controller=new AbortController();const seen:string[]=[];
 const provider=createRotatingGroqProvider({apiKeys:['A','B'],model:'fixture',createProvider:key=>async()=>{seen.push(key);controller.abort(new PrepError('CANCELLED'));throw limited(10);}});
 await assert.rejects(provider({...request(),signal:controller.signal}),(e:unknown)=>e instanceof PrepError&&e.code==='CANCELLED');assert.deepEqual(seen,['A']);
});
test('an in-flight request retains its key across a rotation boundary',async()=>{
 let time=0;let finish!:(v:ReturnType<typeof result>)=>void;
 const provider=createRotatingGroqProvider({apiKeys:['A','B'],model:'fixture',now:()=>time,createProvider:key=>key==='A'?()=>new Promise(resolve=>{finish=resolve;}):async()=>result(key)});
 const first=provider(request());time=300000;assert.equal((await provider(request())).content,'B');finish(result('A'));assert.equal((await first).content,'A');
});
test('a single key remains usable and duplicate credentials are deduplicated',async()=>{
 let time=0;let factories=0;
 const provider=createRotatingGroqProvider({apiKeys:[' A ','A',''],model:'fixture',now:()=>time,createProvider:key=>{factories++;return async()=>result(key);}});
 await provider(request());time=300000;assert.equal((await provider(request())).content,'A');assert.equal(factories,1);
});
test('reset metadata respects daily cooldowns and ignores non-depleted counters',()=>{
 assert.equal(retryAfterMs(new Headers()),null);
 assert.equal(retryAfterMs(new Headers({'retry-after':'3600'})),3600000);
 assert.equal(rateLimitCooldownMs(new Headers({'retry-after':'2','x-ratelimit-remaining-requests':'0','x-ratelimit-reset-requests':'23h59m1.5s','x-ratelimit-remaining-tokens':'100','x-ratelimit-reset-tokens':'2d'})),86341500);
 assert.equal(rateLimitCooldownMs(new Headers({'x-ratelimit-remaining-tokens':'0','x-ratelimit-reset-tokens':'7.66s'})),7660);
});
test('configuration supports numbered key slots, deduplicates, and health never exposes them',async()=>{
 const config=loadConfig({GROQ_API_KEY_2:' second-key ',GROQ_API_KEY_3:'second-key',GROQ_API_KEY_4:'fourth-key'},'/nonexistent');
 assert.deepEqual(config.groqApiKeys,['second-key','fourth-key']);
 const app=buildServer({config,logger:false});const response=await app.inject({url:'/api/health'});
 assert.equal(response.json().configured,true);assert.ok(!response.body.includes('second-key'));assert.ok(!response.body.includes('fourth-key'));await app.close();
});

test('the real HTTP adapter and pool preserve schema, switch headers, and honour reset metadata',async()=>{
 let time=0;const headers:string[]=[];
 const fetchImpl:typeof fetch=async(_url,init)=>{
  const key=new Headers(init?.headers).get('authorization')!;headers.push(key);
  const body=JSON.parse(String(init?.body));assert.equal(body.response_format.type,'json_schema');assert.equal(body.response_format.json_schema.strict,true);
  if(key==='Bearer A')return new Response(JSON.stringify({error:{message:'Rate limit'}}),{status:429,headers:{'retry-after':'900','x-ratelimit-remaining-requests':'0','x-ratelimit-reset-requests':'1h'}});
  return new Response(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'stop'}],model:'fixture',usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}}),{status:200});
 };
 const provider=createRotatingGroqProvider({apiKeys:['A','B'],model:'fixture',now:()=>time,createProvider:apiKey=>createGroqProvider({apiKey,model:'fixture',fetchImpl})});
 assert.equal((await provider(request())).usage.totalTokens,2);
 time=300000;await provider(request());assert.deepEqual(headers,['Bearer A','Bearer B','Bearer B']);
});
