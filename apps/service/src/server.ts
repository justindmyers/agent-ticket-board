import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

// The local API. It listens on 127.0.0.1 only, and every request must send the token as a bearer
// header. Routes get the path parameters and the JSON body.

export type Handler = (params: Record<string, string>, body: unknown) => Promise<unknown>;
export type Routes = Record<string, Handler>;

/** One open event stream for each client that listens for changes. */
export type Events = { send: (data: unknown) => void };

const KEY = '[A-Za-z][A-Za-z0-9_]*-[0-9]+';

/** "POST /tickets/:key/plan" → a regex with named groups. */
function compile(route: string) {
  const [method, path] = route.split(' ');
  const rx = new RegExp(`^${path!.replace(/:key/g, `(?<key>${KEY})`)}$`);
  return { method, rx };
}

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(c as Buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : undefined;
}

export function createApi(token: string, routes: Routes) {
  const table = Object.entries(routes).map(([r, h]) => ({ ...compile(r), h }));
  const streams = new Set<ServerResponse>();

  const server: Server = createServer((req, res) => {
    void (async () => {
      if (!same(req.headers.authorization ?? '', `Bearer ${token}`)) {
        send(res, 401, { error: 'Missing or wrong token.' });
        return;
      }
      const path = (req.url ?? '/').split('?')[0]!;
      if (req.method === 'GET' && path === '/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write(': open\n\n');
        streams.add(res);
        req.on('close', () => streams.delete(res));
        return;
      }
      for (const r of table) {
        const m = r.method === req.method ? r.rx.exec(path) : null;
        if (m) {
          try {
            send(res, 200, (await r.h({ ...m.groups }, await readBody(req))) ?? {});
          } catch (e) {
            send(res, 400, { error: e instanceof Error ? e.message : String(e) });
          }
          return;
        }
      }
      send(res, 404, { error: `No route for ${req.method} ${path}.` });
    })();
  });

  const events: Events = {
    send: (data) => streams.forEach((s) => s.write(`data: ${JSON.stringify(data)}\n\n`))
  };

  /** Starts listening on a free port. Returns the port. */
  const listen = () =>
    new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const a = server.address();
        resolve(typeof a === 'object' && a ? a.port : 0);
      });
    });

  const close = () =>
    new Promise<void>((resolve) => {
      streams.forEach((s) => s.end());
      server.close(() => resolve());
      server.closeAllConnections();
    });

  return { listen, close, events };
}
