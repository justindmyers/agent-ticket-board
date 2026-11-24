import { spawn } from 'node:child_process';
import { readJson } from './files';
import { SERVICE_FILE } from './paths';

// How a client (CLI, VS Code, the pane through the CLI) finds and calls the service. The service
// listens on 127.0.0.1 only, and every request must send the token from the service file.

export type ServiceInfo = { port: number; token: string; pid: number };

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** The running service, or null when the service file is missing or its process is gone. */
export async function serviceInfo(file = SERVICE_FILE): Promise<ServiceInfo | null> {
  const info = await readJson<ServiceInfo | null>(file, null);
  return info && alive(info.pid) ? info : null;
}

export class ServiceError extends Error {}

/** Calls the service. A body makes it a POST. */
export async function callService<T>(info: ServiceInfo, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${info.token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new ServiceError(data.error ?? `The service answered ${res.status}.`);
  }
  return data;
}

/**
 * The running service. If none runs, starts `node <atb> serve` as a detached process and waits
 * for it. Clients call this only for an explicit developer action, for example Start planning.
 */
export async function ensureService(
  atb: string,
  node = process.execPath,
  waitMs = 10_000
): Promise<ServiceInfo> {
  const running = await serviceInfo();
  if (running) {
    return running;
  }
  spawn(node, [atb, 'serve'], { detached: true, stdio: 'ignore' }).unref();
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 200));
    const info = await serviceInfo();
    if (info) {
      try {
        await callService(info, '/health');
        return info;
      } catch {
        // Not listening yet.
      }
    }
  }
  throw new ServiceError('The board service did not start. See ~/.agent-ticket-board/service.log.');
}
