import { afterEach, describe, expect, it } from 'vitest';
import { createApi } from './server';

const TOKEN = 'test-token';
let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
});

async function start() {
  const calls: unknown[] = [];
  const api = createApi(TOKEN, {
    'GET /health': async () => ({ ok: true }),
    'POST /tickets/:key/plan': async (p, body) => {
      calls.push([p.key, body]);
      return { state: 'queued' };
    },
    'POST /tickets/:key/stop': async () => {
      throw new Error('Nothing runs.');
    }
  });
  close = api.close;
  const port = await api.listen();
  const call = (path: string, init: RequestInit = {}, token = TOKEN) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, ...init.headers }
    });
  return { call, calls, events: api.events };
}

describe('createApi', () => {
  it('refuses a request without the right token', async () => {
    const { call } = await start();
    expect((await call('/health', {}, 'wrong')).status).toBe(401);
  });

  it('routes by method and path, with the ticket key and the JSON body', async () => {
    const { call, calls } = await start();
    const res = await call('/tickets/PROJ-12/plan', {
      method: 'POST',
      body: JSON.stringify({ x: 1 })
    });
    expect(await res.json()).toEqual({ state: 'queued' });
    expect(calls).toEqual([['PROJ-12', { x: 1 }]]);
    expect((await call('/tickets/PROJ-12/plan')).status).toBe(404);
    expect((await call('/tickets/not-a-key/plan', { method: 'POST' })).status).toBe(404);
  });

  it('answers 400 with the message when a handler throws', async () => {
    const { call } = await start();
    const res = await call('/tickets/PROJ-1/stop', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Nothing runs.' });
  });

  it('streams change events to listening clients', async () => {
    const { call, events } = await start();
    const res = await call('/events');
    const reader = res.body!.getReader();
    await reader.read();
    events.send({ key: 'PROJ-1' });
    const { value } = await reader.read();
    expect(new TextDecoder().decode(value)).toBe('data: {"key":"PROJ-1"}\n\n');
    await reader.cancel();
  });
});
