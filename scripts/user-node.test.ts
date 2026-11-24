import { describe, expect, it } from 'vitest';
import { pickNode } from './user-node';

describe('pickNode', () => {
  it('takes the absolute node path from the shell output, after any start-up noise', () => {
    const out = 'Welcome!\ncompinit: some notice\n/Users/dev/.nvm/versions/node/v24.1.0/bin/node\n';
    expect(pickNode(out, '/fallback/node')).toBe('/Users/dev/.nvm/versions/node/v24.1.0/bin/node');
  });
  it('uses the fallback when the shell has no node', () => {
    expect(pickNode('', '/fallback/node')).toBe('/fallback/node');
    expect(pickNode('node not found', '/fallback/node')).toBe('/fallback/node');
  });
});
