import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeJson } from './files';

describe('writeJson', () => {
  it('keeps the last write, also when many are started without waiting for each other', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'atb-files-')), 'flow.json');
    for (let round = 0; round < 20; round++) {
      const writes = Array.from({ length: 40 }, (_, n) => writeJson(file, { round, n }));
      await Promise.all(writes);
      expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ round, n: 39 });
    }
  });

  it('writes what the data was when the write was asked for, not when it ran', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'atb-files-')), 'flow.json');
    const data = { n: 1 };
    const first = writeJson(file, data);
    data.n = 2;
    await first;
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ n: 1 });
  });

  it('goes on after a write fails', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atb-files-'));
    const file = join(dir, 'flow.json');
    // A circular value cannot be written. The next write must not be blocked by it.
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    await expect(writeJson(file, loop)).rejects.toThrow();
    await writeJson(file, { ok: true });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ ok: true });
  });
});
