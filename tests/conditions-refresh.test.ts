import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app';
import { CONDITIONS_URLS, createConditionsService } from '../server/conditions';

function fixture() {
  let content='第一版', clock=new Date('2026-11-17T06:00:00Z'), failing=false;
  const fetcher=vi.fn(async (input:string|URL|Request) => {
    if(failing)return new Response('busy',{status:429,headers:{'Retry-After':'120'}});
    if(String(input)===CONDITIONS_URLS.trails)return Response.json([{TRAILID:'027',TR_CNAME:'大霸尖山登山步道'}]);
    if(String(input)===CONDITIONS_URLS.trailStatus)return Response.json([{TRAILID:'027',TR_CNAME:'大霸尖山登山步道',TR_TYP:'注意',TITLE:content,CONTENT:content,ANN_DATE:'20261117'}]);
    return new Response('<feed xmlns="http://www.w3.org/2005/Atom"><id>test</id><title>受控空清單</title></feed>');
  });
  const service=createConditionsService({fetcher,now:()=>clock,cacheDir:false,ncdrMinIntervalMs:0});
  return {service,fetcher,change(){content='第二版';clock=new Date(clock.getTime()+60_000)},fail(){failing=true;clock=new Date(clock.getTime()+60_000)},advance(){clock=new Date(clock.getTime()+121_000)}};
}
describe('explicit conditions revalidation',() => {
  it('GET retains the shared snapshot; POST actually revalidates upstream and returns changed content and source time',async()=>{
    const f=fixture(),app=createApp({conditionsService:f.service});
    const before=await request(app).get('/api/conditions').expect(200);expect(before.body.trails.items[0].headline).toBe('第一版');
    f.change();const count=f.fetcher.mock.calls.length;
    expect((await request(app).get('/api/conditions')).body.trails.checkedAt).toBe(before.body.trails.checkedAt);expect(f.fetcher).toHaveBeenCalledTimes(count);
    const updated=await request(app).post('/api/conditions/refresh').send({}).expect(200);expect(updated.body.trails.items[0].headline).toBe('第二版');expect(updated.body.trails.checkedAt).not.toBe(before.body.trails.checkedAt);
    const calls=f.fetcher.mock.calls.length;const limited=await request(app).post('/api/conditions/refresh').send({}).expect(429);expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);expect(f.fetcher).toHaveBeenCalledTimes(calls);
  });
  it('rejects arbitrary source queries and non-JSON cross-site form requests without fetching',async()=>{
    const f=fixture(),app=createApp({conditionsService:f.service});
    await request(app).post('/api/conditions/refresh?url=https://example.com').send({}).expect(400);
    await request(app).post('/api/conditions/refresh').type('form').send({}).expect(400);expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('manual force preserves upstream backoff and original success times after failure',async()=>{
    const f=fixture();const before=await f.service.refresh();f.fail();const failed=await f.service.refresh({force:true});expect(failed.trails.status).toBe('stale');expect(failed.trails.checkedAt).toBe(before.trails.checkedAt);
    const calls=f.fetcher.mock.calls.length;await f.service.refresh({force:true});expect(f.fetcher).toHaveBeenCalledTimes(calls);f.advance();await f.service.refresh({force:true});expect(f.fetcher.mock.calls.length).toBeGreaterThan(calls);
  });
  it('coalesces concurrent manual requests rather than creating a second upstream update',async()=>{
    const f=fixture();await f.service.refresh();let release!:()=>void;
    const pending=new Promise<void>(resolve=>{release=resolve});const refresh=vi.spyOn(f.service,'refresh').mockImplementation(async()=>{await pending;return f.service.get()});
    const app=createApp({conditionsService:f.service});const first=request(app).post('/api/conditions/refresh').send({}).then(value=>value);
    const second=request(app).post('/api/conditions/refresh').send({}).then(value=>value);
    await vi.waitFor(()=>expect(refresh).toHaveBeenCalledTimes(1));release();const results=await Promise.all([first,second]);expect(results.map(value=>value.status)).toEqual([200,200]);expect(refresh).toHaveBeenCalledTimes(1);
  });
});
