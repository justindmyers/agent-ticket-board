import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENERATED, pluginLook } from './gen-plugin';

describe('pluginLook', () => {
  it('copies the shared look verbatim, under a generated header', () => {
    const source = readFileSync('packages/core/src/look.ts', 'utf8');
    expect(pluginLook(source)).toBe(GENERATED + source);
  });

  it('refuses a source with an import, because the plugin cannot resolve it', () => {
    expect(() => pluginLook("import { x } from './types';\nexport const y = x;\n")).toThrow(
      /must not import/
    );
  });
});
