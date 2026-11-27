import { describe, expect, it, vi } from 'vitest';
import { writePattern } from '@agent-ticket-board/core';

vi.hoisted(() => {
  // A temporary home, set before core computes its paths: the test never touches real profiles.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdtempSync: mk } = require('node:fs') as typeof import('node:fs');
  process.env.ATB_HOME = mk(`${process.env.TMPDIR ?? '/tmp'}/atb-browser-`);
});

import {
  browserConfig,
  evalResult,
  focusScript,
  loginState,
  nativeCommand,
  parseSizes,
  profileConfig,
  restoreSize,
  routesCode,
  tooBlank,
  writeDecision
} from './browser';

describe('loginState', () => {
  const app = 'http://localhost:3002';
  it('is in when the page is on the app and not a login page', () => {
    expect(loginState('http://localhost:3002/94/settings', app, 3000)).toBe('in');
    expect(loginState('http://localhost:3002/login?x=1', app, 3000)).toBe('out');
    expect(loginState('https://idp.example.com/authorize', app, 3000)).toBe('out');
  });
  it('is moved when the login sent the browser to the owner port: go to the app', () => {
    expect(loginState('http://localhost:3000/?userState=Authenticated', app, 3000)).toBe('moved');
    expect(loginState('http://localhost:3000/signin', app, 3000)).toBe('out');
  });
});

describe('the Referer fix', () => {
  it('drops the Referer on documents of every localhost port except the owner and the login service', () => {
    const code = routesCode('http://localhost:3002', [3000, 8080], []);
    expect(code).toContain('localhost:(?!3000\\/|8080\\/)\\d+\\/');
    expect(code).toContain("'referrer-policy': 'no-referrer'");
    expect(code.trim().startsWith('async (page) =>')).toBe(true);
  });
});

describe('profileConfig', () => {
  it('labels every page title with the ticket key', () => {
    const c = profileConfig('PROJ-7');
    expect(c).toContain("const P = '[PROJ-7] '");
    expect(c).toContain('DOMContentLoaded');
  });
});

describe('parseSizes and tooBlank', () => {
  it('reads sizes like 1400x900', () => {
    expect(parseSizes(['1400x900', '390x844', 'nonsense'])).toEqual([
      [1400, 900],
      [390, 844]
    ]);
  });
  it('treats a shot under 0.15 bytes per pixel as blank', () => {
    expect(tooBlank(100_000, 1400, 900)).toBe(true);
    expect(tooBlank(400_000, 1400, 900)).toBe(false);
  });
});

describe('TestBrowser.open', () => {
  it('keeps the profile of an earlier browser, so the login survives a closed window', async () => {
    const { mkdirSync, writeFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { HOME } = await import('@agent-ticket-board/core');
    const { TestBrowser } = await import('./browser');
    const dir = join(HOME, 'browser-profiles', 'PROJ-50');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'Cookies'), 'login');
    const b = new TestBrowser('PROJ-50', { cwd: '/nonexistent', env: process.env });
    // playwright-cli cannot run from a missing folder: open fails, but must not delete the profile first.
    await b.open('http://localhost:1/', []).catch(() => undefined);
    expect(existsSync(join(dir, 'Cookies'))).toBe(true);
  });
});

describe('browserConfig', () => {
  it('turns off the local-network check: a page served through the Referer fix may still call localhost', () => {
    const c = JSON.parse(browserConfig('/p/PROJ-7.init.js'));
    expect(c.browser.initScript).toEqual(['/p/PROJ-7.init.js']);
    expect(c.browser.launchOptions.args).toContain('--disable-features=LocalNetworkAccessChecks');
  });
});

describe('focusScript', () => {
  it('scrolls to a CSS selector, or else to the smallest element with that text', () => {
    const s = focusScript('Updates');
    expect(s).toContain('"Updates"');
    expect(s).toContain('document.querySelector(q)');
    expect(s).toContain('scrollIntoView');
    expect(s.startsWith('(() =>')).toBe(true);
  });
  it('escapes quotes in the target', () => {
    expect(focusScript('Say "hi"')).toContain(JSON.stringify('Say "hi"'));
  });
  it('runs in a page: finds the heading by text and reports what it found', () => {
    const calls: string[] = [];
    const el = (text: string, h: number) => ({
      textContent: text,
      getBoundingClientRect: () => ({ height: h }),
      scrollIntoView: (o: { block: string }) => calls.push(`${text}:${o.block}`)
    });
    const doc = {
      querySelector: () => {
        throw new Error('not a selector');
      },
      querySelectorAll: () => [el('Details Updates Running', 900), el('Updates', 30)]
    };
    const run = new Function('document', 'innerHeight', `return ${focusScript('Updates')}`);
    expect(run(doc, 844)).toBe('focused: Updates');
    expect(calls).toEqual(['Updates:start']);
  });
});

describe('evalResult', () => {
  it('reads the result of a playwright-cli eval, not the code that it echoes', () => {
    const out =
      '### Result\n"focused: Updates"\n### Ran Playwright code\n```js\nreturn \'not found: \' + q\n```';
    expect(evalResult(out)).toBe('focused: Updates');
    expect(evalResult('### Result\n"not found: X"\n')).toBe('not found: X');
    expect(evalResult('something else')).toBe('');
  });
});

describe('the write guard of the test browser', () => {
  const rules = [{ method: 'PUT', re: writePattern('/api/edges/:id/update-settings') }];
  it('lets reads through, and only the approved writes', () => {
    expect(writeDecision('GET', 'http://localhost:3002/api/edges', rules)).toBe('read');
    expect(
      writeDecision('PUT', 'http://localhost:3002/proxy/api/edges/e1/update-settings', rules)
    ).toBe('allow');
    expect(writeDecision('POST', 'http://localhost:3002/api/edges/e1/update-settings', rules)).toBe(
      'block'
    );
    expect(writeDecision('DELETE', 'http://localhost:3002/api/edges/e1', rules)).toBe('block');
  });

  describe('GraphQL, which is a POST', () => {
    const url = 'http://localhost:3002/api/graphql';
    const q = (query: string) => JSON.stringify({ query });

    it('lets a query through as a read, also a batch of queries', () => {
      expect(writeDecision('POST', url, rules, q('query Total { events { total } }'))).toBe('read');
      expect(writeDecision('POST', url, rules, q('{ activityChronicleSummary { total } }'))).toBe(
        'read'
      );
      expect(
        writeDecision('POST', url, rules, JSON.stringify([{ query: '{ a }' }, { query: '{ b }' }]))
      ).toBe('read');
    });

    it('blocks a mutation, a subscription, a batch with one mutation, and a body that is not a query', () => {
      expect(
        writeDecision('POST', url, rules, q('mutation Del { deleteEdge(id: 1) { ok } }'))
      ).toBe('block');
      expect(writeDecision('POST', url, rules, q('subscription S { events { id } }'))).toBe(
        'block'
      );
      expect(
        writeDecision(
          'POST',
          url,
          rules,
          JSON.stringify([{ query: '{ a }' }, { query: 'mutation M { x }' }])
        )
      ).toBe('block');
      expect(writeDecision('POST', url, rules, 'not json')).toBe('block');
      expect(
        writeDecision('POST', url, rules, JSON.stringify({ extensions: { persistedQuery: {} } }))
      ).toBe('block');
      expect(writeDecision('POST', url, rules, null)).toBe('block');
      expect(writeDecision('POST', url, rules, '[]')).toBe('block');
    });

    it('does not let another path pass as GraphQL', () => {
      expect(
        writeDecision('POST', 'http://localhost:3002/api/graphql-export', rules, q('{ a }'))
      ).toBe('block');
      expect(
        writeDecision(
          'POST',
          'http://localhost:3002/api/edges/e1/x?next=/graphql',
          rules,
          q('{ a }')
        )
      ).toBe('block');
    });

    it('runs from its source text inside the sandbox: no imports, the same answer', () => {
      const inBrowser = new Function(
        `return (${writeDecision.toString()})`
      )() as typeof writeDecision;
      expect(inBrowser('POST', url, rules, q('{ a }'))).toBe('read');
      expect(inBrowser('POST', url, rules, q('mutation M { x }'))).toBe('block');
    });
  });
  it('is installed for the app origin only, after the Referer fix, with the same decision code', () => {
    const code = routesCode(
      'http://localhost:3002',
      [3000, 8080],
      [{ method: 'PUT', path: '/api/edges/:id/update-settings', why: 'R1' }]
    );
    expect(code).toContain('unrouteAll');
    expect(code).toContain('^http:\\/\\/localhost:3002\\/');
    expect(() => new Function(`return ${code}`)).not.toThrow();
    expect(code).toContain(writeDecision.toString());
    expect(code).toContain('status: 403');
    expect(code.indexOf('referrer-policy')).toBeLessThan(code.indexOf('status: 403'));
  });
});

describe('restoreSize', () => {
  it("restores the window's own size, not a fixed size: the viewport is the outer height minus the browser bar", () => {
    expect(restoreSize('### Result\n"1512,945"\n### Ran Playwright code')).toEqual([
      'resize',
      '1512',
      '858'
    ]);
    expect(restoreSize('no result')).toBeNull();
  });
});

describe('nativeCommand', () => {
  it('runs the browser natively on Apple silicon: a translated Chrome loads the CPU', () => {
    expect(nativeCommand('pnpm', ['exec', 'x'], true)).toEqual([
      'arch',
      ['-arm64', 'pnpm', 'exec', 'x']
    ]);
    expect(nativeCommand('pnpm', ['exec', 'x'], false)).toEqual(['pnpm', ['exec', 'x']]);
  });
});
