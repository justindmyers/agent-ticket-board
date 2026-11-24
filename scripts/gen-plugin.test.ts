import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generated, pluginCopy, SHARED } from './gen-plugin';

describe('pluginCopy', () => {
  it.each(SHARED)('copies %s.ts verbatim, under a generated header', (name) => {
    const source = readFileSync(`packages/core/src/${name}.ts`, 'utf8');
    expect(pluginCopy(name, source)).toBe(generated(name) + source);
  });

  it('refuses a source with an import or a re-export, because the plugin cannot resolve it', () => {
    expect(() => pluginCopy('x', "import { x } from './types';\n")).toThrow(/must not import/);
    expect(() => pluginCopy('x', "export { x } from './types';\n")).toThrow(/must not import/);
  });
});
