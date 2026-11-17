import request from 'supertest';
import {describe, expect, it} from 'vitest';
import {createApp} from '../server/app';
import {getTrailLocation} from '../server/trailGeometry';

describe('計畫路線固定官方幾何', () => {
  it('serves the verified Daba geometry and its original provenance without an upstream call', async () => {
    const result = await request(createApp()).get('/api/plan-route/027').expect(200);
    expect(result.body).toEqual({trailId:'027', name:'大霸尖山登山步道', location:getTrailLocation('027', '大霸尖山登山步道')});
    expect(result.body.location.source.url).toBe('https://data.gov.tw/dataset/27000');
    expect(result.body.location.checkedAt).toBeTruthy();
    expect(result.body.location.geometryDate).toBeNull();
    expect(result.headers['cache-control']).toBe('public, max-age=3600');
  });
  it('serves only the reviewed Beidawu old-entrance/summit/hut geometry and preserves its limits', async () => {
    const result = await request(createApp()).get('/api/plan-route/119').expect(200);
    expect(result.body).toEqual({trailId:'119', name:'北大武山步道', location:getTrailLocation('119', '北大武山步道')});
    expect(result.body.location.geometry.type).toBe('MultiLineString');
    expect(result.body.location.geometry.coordinates).toHaveLength(3);
    expect(result.body.location.source.url).toBe('https://data.gov.tw/dataset/31123');
    expect(result.body.location.source.license).toContain('第 1 版');
    expect(result.body.location.geometryDate).toBeNull();
    expect(result.body.location.note).toContain('不含新登山口至舊登山口接近路段');
    expect(result.body.location.note).toContain('2020-07-24');
    expect(result.headers['cache-control']).toBe('public, max-age=3600');
  });
  it('does not accept a proxy URL, alternate names or arbitrary IDs', async () => {
    const app = createApp();
    for (const path of ['/api/plan-route/027?name=其他步道', '/api/plan-route/027?url=https://example.test', '/api/plan-route/119?name=其他步道', '/api/plan-route/119?url=https://example.test']) await request(app).get(path).expect(400);
    for (const id of ['27', '002', '123', 'https%3A%2F%2Fexample.test']) await request(app).get(`/api/plan-route/${id}`).expect(404);
  });
});
