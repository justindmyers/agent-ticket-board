import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// Atomic write: two clients can write at the same time, and a reader never sees half a file.
let writes = 0;

// The writes of one file go one after the other, in the order they were asked for. Without this, two
// saves that overlap can finish in the other order, and the older record replaces the newer one.
const queue = new Map<string, Promise<void>>();

export function writeJson(file: string, data: unknown): Promise<void> {
  // The data is taken now: a later change to the object is not part of this write.
  let json: string;
  try {
    json = JSON.stringify(data, null, 2);
  } catch (e) {
    return Promise.reject(e);
  }
  const run = async () => {
    await mkdir(dirname(file), { recursive: true });
    // A counter as well as the time: two writes in the same millisecond must not share a temporary file.
    const tmp = `${file}.${process.pid}.${Date.now()}.${++writes}.tmp`;
    await writeFile(tmp, json);
    await rename(tmp, file);
  };
  const done = (queue.get(file) ?? Promise.resolve()).then(run, run);
  // A failed write does not stop the next one. The caller of the failed write still sees its error.
  const settled = done.then(
    () => undefined,
    () => undefined
  );
  queue.set(file, settled);
  void settled.then(() => {
    if (queue.get(file) === settled) {
      queue.delete(file);
    }
  });
  return done;
}
