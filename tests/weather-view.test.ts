import { describe, expect, it } from 'vitest';
import { itemsAtTime, ageWeather } from '../src/shared/weather-view';
import type { WeatherItem, WeatherResponse } from '../src/shared/types';
const temperature: WeatherItem = { id:'t', name:'雪山', metric:'temperature', value:8, unit:'°C', startsAt:'2026-10-14T13:00:00+08:00', endsAt:'2026-10-14T13:00:00+08:00' };
const probability: WeatherItem = { ...temperature, id:'p', metric:'probability', value:40, unit:'%', startsAt:'2026-10-14T12:00:00+08:00', endsAt:'2026-10-14T15:00:00+08:00' };
function response(): WeatherResponse { return { mode:'live', region:'xueshan', fetchedAt:'2026-10-14T05:10:00Z', products:[{ id:'rain', title:'雨量', kind:'observation', status:'ready', source:{name:'官方',url:'https://example.test'}, issuedAt:null, validFrom:'2026-10-14T12:00:00+08:00', validTo:temperature.endsAt, fetchedAt:'2026-10-14T05:10:00Z', message:'', items:[{...temperature,id:'rain',metric:'rain',unit:'mm',value:0,startsAt:'2026-10-14T12:00:00+08:00'}] }] }; }
describe('weather display time semantics', () => {
  it('includes the original covering probability interval at an hourly temperature cursor', () => {
    const items = itemsAtTime([temperature,probability],temperature.startsAt);
    expect(items).toEqual([temperature,probability]); expect(items[1].startsAt).toBe(probability.startsAt);
    expect(itemsAtTime([temperature,probability],'2026-10-14T15:00:00+08:00')).toEqual([]);
  });
  it('ages an open rain view without changing actual zero, timestamps, or the cached response', () => {
    const original = response();
    expect(ageWeather(original,Date.parse('2026-10-14T13:20:00+08:00'))?.products[0].status).toBe('ready');
    const old = ageWeather(original,Date.parse('2026-10-14T13:31:00+08:00'))!;
    expect(old.products[0].status).toBe('stale'); expect(old.products[0].items[0].status).toBe('stale');
    expect(old.products[0].items[0].value).toBe(0); expect(old.fetchedAt).toBe(original.fetchedAt); expect(original.products[0].status).toBe('ready');
  });
  it('shows a refresh failure as stale, preserves missing values, and never ages demo into official data', () => {
    const original=response(); original.products[0].items[0].value=null;
    const missing=ageWeather(original,Date.parse('2026-10-14T13:20:00+08:00'),true)!;
    expect(missing.products[0].status).toBe('stale'); expect(missing.products[0].items[0].status).toBe('missing'); expect(missing.products[0].items[0].value).toBeNull();
    original.mode='demo'; expect(ageWeather(original,Infinity,true)).toBe(original);
  });
});
