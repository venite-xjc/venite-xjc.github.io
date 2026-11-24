import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker, loadStats, normalizeCountries } from './worker.mjs';

const env = {
  GOATCOUNTER_SITE: 'test-site', GOATCOUNTER_TOKEN: 'test-only-not-a-real-secret',
  ALLOWED_ORIGINS: 'https://venite-xjc.github.io',
};
const now = Date.parse('2026-11-24T12:00:00Z');
const site = { code: 'test-site', received_data: true, first_hit_at: '2024-01-02T08:00:00Z', setttings: { data_retention: 0 } };
const json = (body, status=200) => new Response(JSON.stringify(body),{status});

function provider(overrides = {}) {
  const calls=[];
  const fetcher=async (input,options) => {
    const url=new URL(input); calls.push(url);
    assert.equal(url.origin,'https://test-site.goatcounter.com');
    assert.equal(options.headers.Authorization,`Bearer ${env.GOATCOUNTER_TOKEN}`);
    assert.equal(options.redirect,'manual');
    if(url.pathname.endsWith('/sites')) return json({sites:[{code:'different-site'},overrides.site || site]});
    assert.ok(Date.parse(url.searchParams.get('start')) < Date.parse(site.first_hit_at));
    assert.ok(Date.parse(url.searchParams.get('end')) >= now);
    if(url.pathname.endsWith('/total')) return json({total_utc:20,total:19,total_events:0});
    assert.equal(url.searchParams.get('limit'),'100');
    if(url.searchParams.get('offset')==='0') return json({more:true,stats:[{id:'CN',count:10},{id:'US',count:5}]});
    assert.equal(url.searchParams.get('offset'),'2');
    return json({more:false,stats:[{id:'GB',count:3},{id:'',count:2}]});
  };
  return {fetcher,calls};
}

test('all-time range comes from first recorded hit and retrieves every country page',async()=>{
  const {fetcher,calls}=provider();
  const result=await loadStats(env,fetcher,now);
  assert.equal(result.since,site.first_hit_at.replace('Z','.000Z'));
  assert.equal(result.period,'all-time');
  assert.equal(result.totalVisits,20);
  assert.equal(result.countryCount,3);
  assert.equal(result.unknownVisits,2);
  assert.deepEqual(result.countries.map(c=>c.code),['CN','US','GB']);
  assert.equal(calls.length,4);
});

test('new accounts return a genuine zero without inventing an initial count',async()=>{
  const {fetcher,calls}=provider({site:{...site,received_data:false,first_hit_at:null}});
  const data=await loadStats(env,fetcher,now);
  assert.equal(data.totalVisits,0); assert.equal(data.since,null); assert.equal(calls.length,1);
});

test('a finite retention window cannot be mislabeled All time',async()=>{
  const {fetcher}=provider({site:{...site,setttings:{data_retention:180}}});
  await assert.rejects(loadStats(env,fetcher,now),/retention/);
});

test('unknown locations are separate and malformed counts are rejected',()=>{
  assert.deepEqual(normalizeCountries([{id:'US',count:2},{id:'us',count:1},{id:'ZZ',count:4}]),{
    countries:[{code:'US',visits:3}],unknown:4,
  });
  assert.throws(()=>normalizeCountries([{id:'CN',count:-1}]),/count/);
});

test('incomplete pagination fails rather than silently publishing a partial country list',async()=>{
  const fetcher=async input => {
    const path=new URL(input).pathname;
    if(path.endsWith('/sites'))return json({sites:[site]});
    if(path.endsWith('/total'))return json({total_utc:1});
    return json({stats:[],more:true});
  };
  await assert.rejects(loadStats(env,fetcher,now),/pagination/);
});

test('concurrent reads share the provider refresh, and secrets never reach the public result',async()=>{
  const {fetcher,calls}=provider();
  const worker=createWorker({fetcher,now:()=>now});
  const request=()=>new Request('https://example.workers.dev/stats',{headers:{Origin:'https://venite-xjc.github.io'}});
  const responses=await Promise.all([worker.fetch(request(),env),worker.fetch(request(),env)]);
  for(const response of responses){
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://venite-xjc.github.io');
    assert.equal((await response.text()).includes(env.GOATCOUNTER_TOKEN),false);
  }
  await worker.fetch(request(),env);
  assert.equal(calls.length,4);
});

test('CORS restrictions, unsupported requests and absent config do not contact the provider',async()=>{
  let calls=0;
  const worker=createWorker({fetcher:()=>{calls++;throw new Error('Unexpected call');}});
  assert.equal((await worker.fetch(new Request('https://example.workers.dev/stats',{headers:{Origin:'https://other.test'}}),env)).status,403);
  assert.equal((await worker.fetch(new Request('https://example.workers.dev/stats?site=other'),env)).status,404);
  assert.equal((await worker.fetch(new Request('https://example.workers.dev/stats',{method:'POST'}),env)).status,405);
  assert.equal((await worker.fetch(new Request('https://example.workers.dev/stats'),{})).status,503);
  assert.equal(calls,0);
});

test('provider failures are reported as unavailable, not zero, with no reflected upstream body',async()=>{
  const logs=[];
  const worker=createWorker({fetcher:async()=>json({error:env.GOATCOUNTER_TOKEN},401),logError:message=>logs.push(message)});
  const response=await worker.fetch(new Request('https://example.workers.dev/stats'),env);
  assert.equal(response.status,502);
  const body=await response.text();
  assert.equal(body.includes(env.GOATCOUNTER_TOKEN),false);
  assert.equal(body.includes('totalVisits'),false);
  assert.deepEqual(logs,['Provider sites returned HTTP 401: [redacted]']);
});

test('unexpected failures redact credentials from server diagnostics',async()=>{
  const logs=[];
  const worker=createWorker({fetcher:async()=>{throw new TypeError(`Transport failed ${env.GOATCOUNTER_TOKEN}`);},logError:message=>logs.push(message)});
  const response=await worker.fetch(new Request('https://example.workers.dev/stats'),env);
  assert.equal(response.status,502);
  assert.deepEqual(logs,['TypeError: Transport failed [redacted]']);
  assert.equal((await response.text()).includes('Transport failed'),false);
});

test('total and country reads overlap after site metadata is available',{timeout:2000},async()=>{
  let releaseTotal;
  const countryStarted=new Promise(resolve=>{releaseTotal=resolve;});
  const fetcher=async input=>{
    const path=new URL(input).pathname;
    if(path.endsWith('/sites')) return json({sites:[site]});
    if(path.endsWith('/total')) {await countryStarted;return json({total_utc:2});}
    releaseTotal();
    return json({stats:[{id:'US',count:2}],more:false});
  };
  assert.equal((await loadStats(env,fetcher,now)).totalVisits,2);
});

test('stale edge data returns immediately while one background refresh updates it',async()=>{
  const oldData={version:1,updatedAt:new Date(now-601000).toISOString(),totalVisits:7,countries:[]};
  let cached=json(oldData), release;
  const gate=new Promise(resolve=>{release=resolve;});
  const {fetcher,calls}=provider();
  const waiting=[];
  const ctx={waitUntil:promise=>waiting.push(promise)};
  const worker=createWorker({now:()=>now,fetcher:async(...args)=>{await gate;return fetcher(...args);},cache:{
    match:async()=>cached.clone(),
    put:async(key,response)=>{cached=response;},
  }});
  const request=()=>new Request('https://example.workers.dev/stats');
  const first=await worker.fetch(request(),env,ctx);
  assert.equal((await first.json()).totalVisits,7);
  assert.equal((await (await worker.fetch(request(),env,ctx)).json()).totalVisits,7);
  assert.equal(calls.length,0,'Neither response waits for the blocked upstream request');
  release();
  await Promise.all(waiting);
  assert.equal((await (await worker.fetch(request(),env,ctx)).json()).totalVisits,20);
  assert.equal(calls.length,4);
  assert.equal(cached.headers.get('Cache-Control'),'public, max-age=86400');
});

test('a failed background refresh keeps saved totals and backs off retries',async()=>{
  let clock=now,calls=0;
  const logs=[],waiting=[];
  const cached={version:1,updatedAt:new Date(now-601000).toISOString(),totalVisits:7,countries:[]};
  const worker=createWorker({now:()=>clock,fetcher:async()=>{calls++;throw new Error('offline');},
    logError:message=>logs.push(message),cache:{match:async()=>json(cached)}});
  const request=()=>new Request('https://example.workers.dev/stats');
  const ctx={waitUntil:promise=>waiting.push(promise)};
  assert.equal((await (await worker.fetch(request(),env,ctx)).json()).totalVisits,7);
  await Promise.all(waiting);
  clock+=10000;
  assert.equal((await (await worker.fetch(request(),env,ctx)).json()).totalVisits,7);
  assert.equal(calls,1);
  assert.equal(logs.length,1);
});

test('broken caches and snapshots older than a day fall back to live statistics',async()=>{
  for(const cache of [
    {match:async()=>{throw new Error('cache unavailable');},put:async()=>{}},
    {match:async()=>json({version:1,updatedAt:new Date(now-86401000).toISOString(),totalVisits:99}),put:async()=>{}},
  ]) {
    const {fetcher}=provider();
    const worker=createWorker({now:()=>now,fetcher,cache});
    const response=await worker.fetch(new Request('https://example.workers.dev/stats'),env);
    assert.equal((await response.json()).totalVisits,20);
  }
});
