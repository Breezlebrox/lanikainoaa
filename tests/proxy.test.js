import { afterEach, expect, it, vi } from 'vitest';
import worker from '../proxy/worker.js';
const env={ALLOWED_ORIGINS:'https://breezlebrox.github.io'};
const request=(path,origin='https://breezlebrox.github.io')=>new Request('https://proxy.example'+path,{headers:{Origin:origin}});
afterEach(()=>vi.unstubAllGlobals());
it('rejects unknown origins',async()=>{expect((await worker.fetch(request('/activestations.xml','https://other.example'),env)).status).toBe(403)});
it('rejects arbitrary upstream URLs and paths',async()=>{for(const path of ['/https://example.com','/data/realtime2/../../secret','/data/realtime2/toolong.txt'])expect((await worker.fetch(request(path),env)).status).toBe(404)});
it('relays only public NDBC data without shared cache',async()=>{const fetch=vi.fn(async()=>new Response('real data',{headers:{'Content-Type':'text/plain'}}));vi.stubGlobal('fetch',fetch);const r=await worker.fetch(request('/data/realtime2/51202.txt'),env);expect(r.status).toBe(200);expect(fetch.mock.calls[0][0]).toBe('https://www.ndbc.noaa.gov/data/realtime2/51202.txt');expect(r.headers.get('Cache-Control')).toBe('no-store');expect(r.headers.get('Access-Control-Allow-Origin')).toBe('https://breezlebrox.github.io')});
it('reports upstream failures without fabricated data',async()=>{vi.stubGlobal('fetch',async()=>{throw Error('offline')});expect((await worker.fetch(request('/activestations.xml'),env)).status).toBe(502)});
