import { describe, expect, it } from 'vitest';
import { FLOWS, loadFlow, saveFlow } from './agents';
import type { Flow } from './types';

describe('loadFlow and saveFlow, started together', () => {
  it('keeps the newer record when a save lands while the file is being read', async () => {
    const key = 'RACE-1';
    const older: Flow = { stage: 'ship', run: { id: 'r', state: 'running' } as Flow['run'] };
    const newer: Flow = { stage: 'ship', run: { id: 'r', state: 'done' } as Flow['run'] };
    await saveFlow(key, older);
    for (let i = 0; i < 25; i++) {
      await saveFlow(key, older);
      // A poll reads the file at the moment that the job saves its end.
      const read = loadFlow(key);
      const save = saveFlow(key, newer);
      const got = await read;
      await save;
      expect(FLOWS[key]?.run?.state, `round ${i}`).toBe('done');
      expect(got?.run?.state, `round ${i}`).toBe('done');
    }
  });

  it('keeps the newer record when a save is queued but not on disk yet', async () => {
    const key = 'RACE-3';
    const older: Flow = { stage: 'ship', run: { id: 'r', state: 'running' } as Flow['run'] };
    const newer: Flow = { stage: 'ship', run: { id: 'r', state: 'done' } as Flow['run'] };
    await saveFlow(key, older);
    for (let i = 0; i < 25; i++) {
      // Two saves in a row: the second waits for the first, so the file is behind for a moment.
      const a = saveFlow(key, older);
      const b = saveFlow(key, newer);
      const got = await loadFlow(key);
      await Promise.all([a, b]);
      expect(got?.run?.state, `round ${i}`).toBe('done');
      expect(FLOWS[key]?.run?.state, `round ${i}`).toBe('done');
    }
  });

  it('still reads what another process wrote', async () => {
    const key = 'RACE-2';
    await saveFlow(key, { stage: 'ship', need: { kind: 'decision', ask: 'first', actions: [] } });
    // Another process changes the file. This process has the older one in memory.
    const { writeJson } = await import('./files');
    const { join } = await import('node:path');
    const { AGENTS_DIR } = await import('./paths');
    await writeJson(join(AGENTS_DIR, `${key}.json`), {
      stage: 'ship',
      need: { kind: 'decision', ask: 'second', actions: [] }
    });
    expect((await loadFlow(key))?.need?.ask).toBe('second');
    expect(FLOWS[key]?.need?.ask).toBe('second');
  });
});
