import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boardCli, boardCommand } from './service-client';

describe('boardCli', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atb-env-'));
  it('uses the node and the CLI that the installer recorded', () => {
    const file = join(dir, 'env.json');
    writeFileSync(file, JSON.stringify({ node: '/opt/dev/node', atb: '/h/bin/atb.cjs' }));
    expect(boardCli(file)).toEqual({ node: '/opt/dev/node', atb: '/h/bin/atb.cjs' });
    expect(boardCommand(file)).toBe('/opt/dev/node /h/bin/atb.cjs');
  });
  it('uses this process when nothing is installed', () => {
    expect(boardCli(join(dir, 'missing.json')).node).toBe(process.execPath);
  });
});
