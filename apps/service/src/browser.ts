import { execFile, execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, writePattern, type Write } from '@agent-ticket-board/core';

// The ticket's test browser: one headed playwright-cli session for each ticket, run from the
// worktree with the target repository's own `pnpm exec playwright-cli`. It waits for the developer's
// login and takes the screenshot set. The window and its profile stay between test runs of the same
// ticket, so the developer logs in once; Approve closes the window and deletes the profile.

export const sessionOf = (key: string) => `atb-${key}`;

/** The developer's login, saved from a test browser and loaded into the next ticket's browser. */
const LOGIN_STATE = join(HOME, 'browser-login.json');

const profileDir = (key: string) => join(HOME, 'browser-profiles', key);
export const shotsDir = (key: string) => join(HOME, 'tickets', key, 'shots');

/** Where the page is in the login: on the app (in), on a login page (out), or logged in on the owner port (moved). */
export function loginState(
  href: string,
  appOrigin: string,
  ownerPort: number
): 'in' | 'out' | 'moved' {
  const login = /login|signin|authorize/i.test(href.replace(/^https?:\/\/[^/]+/, ''));
  if (href.startsWith(appOrigin)) {
    return login ? 'out' : 'in';
  }
  // A dev login can send the browser back to the developer's own port: the app is then logged in.
  if (href.startsWith(`http://localhost:${ownerPort}`) && !login) {
    return 'moved';
  }
  return 'out';
}

/**
 * Whether the test browser lets a request through: reads always; writes only when the developer
 * approved them in the plan. A GraphQL query is a POST but reads data: it counts as a read. Any
 * body that is not plainly a query counts as a write. It runs inside the browser sandbox as well,
 * so it uses no imports.
 */
export function writeDecision(
  method: string,
  url: string,
  rules: { method: string; re: string }[],
  body?: string | null
) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return 'read';
  }
  const path = url.replace(/^[a-z]+:\/\/[^/]+/i, '');
  if (method === 'POST' && /\/graphql\/?$/.test(path.split(/[?#]/)[0]!)) {
    let queries: boolean;
    try {
      const parsed = JSON.parse(body || 'null');
      const list = Array.isArray(parsed) ? parsed : [parsed];
      queries =
        list.length > 0 &&
        list.every(
          (x) => x && typeof x.query === 'string' && !/\b(mutation|subscription)\b/i.test(x.query)
        );
    } catch {
      queries = false;
    }
    if (queries) {
      return 'read';
    }
  }
  return rules.some((r) => r.method === method && new RegExp(r.re).test(path)) ? 'allow' : 'block';
}

/**
 * The routes of the test browser, as one playwright-cli run-code snippet. It replaces earlier routes,
 * so a later test run gets the writes approved now.
 * - Documents on any localhost port except `keep` get `Referrer-Policy: no-referrer`: dev logins often
 *   refuse a Referer from a port other than the developer's own.
 * - Writes from the app: only the approved ones reach the backend. Others get 403.
 * A route handler always resolves: an uncaught error leaves the request open and hangs the session.
 */
export function routesCode(appOrigin: string, keep: number[], writes: Write[]) {
  const ports = keep.map((p) => `${p}\\/`).join('|');
  const origin = appOrigin.replace(/\/$/, '').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const rules = JSON.stringify(writes.map((w) => ({ method: w.method, re: writePattern(w.path) })));
  return `async (page) => {
  const writeDecision = ${writeDecision.toString()};
  const rules = ${rules};
  const ctx = page.context();
  await ctx.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.route(/^http:\\/\\/localhost:(?!${ports})\\d+\\//, async (route) => {
    try {
      if (route.request().resourceType() !== 'document') {
        await route.continue();
        return;
      }
      const resp = await route.fetch();
      await route.fulfill({ response: resp, headers: { ...resp.headers(), 'referrer-policy': 'no-referrer' } });
    } catch (e) {
      try { await route.continue(); } catch (e2) {}
    }
  });
  await ctx.route(/^${origin}\\//, async (route) => {
    try {
      const d = writeDecision(route.request().method(), route.request().url(), rules, route.request().postData());
      if (d === 'read') {
        await route.fallback();
      } else if (d === 'allow') {
        await route.continue();
      } else {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'not approved: this write is not in the plan of the ticket' })
        });
      }
    } catch (e) {
      try { await route.fallback(); } catch (e2) {}
    }
  });
  return 'routes installed';
}
`;
}

/** An init script that prefixes every page title with the ticket key, so the window is easy to find. */
export function profileConfig(key: string) {
  return `(() => {
  const P = '[${key}] ';
  const fix = () => { try { if (document.title && !document.title.startsWith(P)) document.title = P + document.title; } catch (e) {} };
  setInterval(fix, 250);
  document.addEventListener('DOMContentLoaded', fix);
})();
`;
}

/**
 * The playwright-cli config of the test browser. The Referer fix serves each page through Playwright,
 * so Chrome does not know that the page came from localhost and treats it as a public site: its calls
 * to the local login service are blocked. This browser only opens the developer's local app, so the
 * local-network check is off.
 */
export function browserConfig(initScript: string) {
  return JSON.stringify({
    browser: {
      initScript: [initScript],
      launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] }
    }
  });
}

/**
 * A page script that scrolls the part of the page that a shot is about to the top of the viewport.
 * The target is a CSS selector, or else text: the smallest element whose text is or starts with it,
 * usually a heading. A margin keeps it clear of a sticky app header. Returns what it did.
 */
export function focusScript(target: string) {
  return `(() => {
  const q = ${JSON.stringify(target)};
  let el = null;
  try { el = document.querySelector(q); } catch (e) {}
  if (!el) {
    const all = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,legend,[role=heading],label,th,button,a,p,span,div')];
    const text = (e) => (e.textContent || '').trim();
    const hits = all.filter((e) => text(e) === q);
    const near = hits.length ? hits : all.filter((e) => text(e).startsWith(q));
    el = near.sort((a, b) => text(a).length - text(b).length)[0] || null;
  }
  if (!el) return 'not found: ' + q;
  if (el.style) el.style.scrollMarginTop = '80px';
  el.scrollIntoView({ block: 'start' });
  return 'focused: ' + q;
})()`;
}

/** The value of a playwright-cli eval: its output also echoes the code that ran. */
export function evalResult(out: string) {
  const m = /### Result\s*\n("(?:[^"\\]|\\.)*")/.exec(out);
  try {
    return m ? String(JSON.parse(m[1]!)) : '';
  } catch {
    return '';
  }
}

/** The resize that restores the window from `[outerWidth, outerHeight]`, or null. */
export function restoreSize(evalOut: string) {
  const m = /^(\d+),(\d+)$/.exec(evalResult(evalOut));
  return m ? ['resize', m[1]!, String(Number(m[2]) - 87)] : null;
}

/** Apple silicon: the hardware, also when this process runs translated. */
const APPLE_SILICON = (() => {
  if (process.platform !== 'darwin') {
    return false;
  }
  try {
    return execFileSync('sysctl', ['-n', 'hw.optional.arm64'], { encoding: 'utf8' }).trim() === '1';
  } catch {
    return false;
  }
})();

/** A command that runs natively on Apple silicon: a Chrome under Rosetta loads the CPU. */
export function nativeCommand(
  cmd: string,
  args: string[],
  arm64 = APPLE_SILICON
): [string, string[]] {
  return arm64 ? ['arch', ['-arm64', cmd, ...args]] : [cmd, args];
}

export function parseSizes(list: string[]): [number, number][] {
  return list
    .map((s) => /^(\d+)\s*x\s*(\d+)$/i.exec(s.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [Number(m[1]), Number(m[2])]);
}

/** A loading or empty page compresses to almost nothing; a real page is 0.25 to 0.4 bytes per pixel. */
export const tooBlank = (bytes: number, w: number, h: number) => bytes / (w * h) < 0.15;

function fileSize(file: string) {
  try {
    return statSync(file).size;
  } catch {
    return 0;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type BrowserOptions = {
  /** The worktree: playwright-cli runs from it, and its sessions belong to it. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** Headed for the developer's login; tests run headless. */
  headed?: boolean;
};

export class TestBrowser {
  constructor(
    private key: string,
    private o: BrowserOptions
  ) {}

  private get session() {
    return sessionOf(this.key);
  }

  /** One playwright-cli command in the ticket's session. Resolves with its output, never rejects. */
  pw(args: string[], timeoutMs = 60_000) {
    return new Promise<{ code: number; out: string }>((resolve) =>
      execFile(
        ...nativeCommand('pnpm', ['exec', 'playwright-cli', `-s=${this.session}`, ...args]),
        { cwd: this.o.cwd, env: this.o.env, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
        (e, out, err) =>
          resolve({
            code: e ? ((e as { code?: number }).code ?? 1) : 0,
            out: `${String(out)}${String(err)}`
          })
      )
    );
  }

  async isOpen() {
    const r = await new Promise<string>((resolve) =>
      execFile(
        'pnpm',
        ['exec', 'playwright-cli', 'list'],
        { cwd: this.o.cwd, env: this.o.env },
        (_e, out) => resolve(String(out))
      )
    );
    const lines = r.split('\n');
    const at = lines.findIndex((l) => l.trim() === `- ${this.session}:`);
    return at >= 0 && /status: open/.test(lines[at + 1] ?? '');
  }

  /**
   * Opens the ticket's browser, installs its routes, loads the login of an earlier ticket, and goes to
   * the app. The profile of an earlier browser stays: the login survives a closed window.
   */
  async open(url: string, keepPorts: number[], writes: Write[] = []) {
    const dir = profileDir(this.key);
    mkdirSync(dir, { recursive: true });
    const init = join(dir, '..', `${this.key}.init.js`);
    const config = join(dir, '..', `${this.key}.config.json`);
    writeFileSync(init, profileConfig(this.key));
    writeFileSync(config, browserConfig(init));
    const opened = await this.pw([
      'open',
      'about:blank',
      ...(this.o.headed === false ? [] : ['--headed']),
      '--profile',
      dir,
      '--config',
      config,
      '--idle-timeout',
      '7200000'
    ]);
    if (opened.code !== 0) {
      throw new Error(
        `The test browser did not open: ${opened.out.trim().split('\n').at(-1) ?? ''}`
      );
    }
    await this.routes(url, keepPorts, writes);
    if (existsSync(LOGIN_STATE)) {
      // Cookies on localhost are shared by every port: the login of another ticket's browser works here.
      await this.pw(['state-load', LOGIN_STATE]);
    }
    await this.pw(['goto', url]);
  }

  /** Installs the routes of the test browser: the Referer fix and the guard for approved writes. */
  async routes(url: string, keepPorts: number[], writes: Write[]) {
    const file = join(profileDir(this.key), '..', `${this.key}.routes.js`);
    writeFileSync(file, routesCode(new URL(url).origin, keepPorts, writes));
    await this.pw(['run-code', '--filename', file]);
  }

  /** Saves the login of this browser for the next ticket's browser. Only the developer can read it. */
  async saveLogin() {
    await this.pw(['state-save', LOGIN_STATE]);
    if (existsSync(LOGIN_STATE)) {
      chmodSync(LOGIN_STATE, 0o600);
    }
  }

  /** Runs a playwright-cli script file in the page, like the fake API of the ticket. */
  runCode(file: string) {
    return this.pw(['run-code', '--filename', file]).then(() => undefined);
  }

  goto(url: string) {
    return this.pw(['goto', url]).then(() => undefined);
  }

  /** Waits until the page is on the app and not on a login page. False after `seconds`. */
  async waitLogin(url: string, ownerPort: number, seconds: number) {
    const origin = url.replace(/\/$/, '');
    const end = Date.now() + seconds * 1000;
    do {
      const r = await this.pw(['eval', 'location.href'], 15_000);
      const href = /"?(https?:\/\/[^"\s]+)/.exec(r.out)?.[1] ?? '';
      const state = loginState(href, origin, ownerPort);
      if (state === 'in') {
        return true;
      }
      if (state === 'moved') {
        await this.goto(url);
        return true;
      }
      if (Date.now() < end) {
        await sleep(3000);
      }
    } while (Date.now() < end);
    return false;
  }

  /**
   * The screenshot set of the current page: each colour scheme at each size. With `themeKey`, the
   * app reads its scheme from that localStorage key at load, so each scheme sets it and reloads.
   * A shot that looks blank is taken again. Returns the file paths.
   */
  async shots(
    name: string,
    sizes: [number, number][],
    themeKey: string | null,
    focus: string | null = null
  ) {
    const misses: string[] = [];
    const before = restoreSize((await this.pw(['eval', '[outerWidth, outerHeight].join()'])).out);
    const out = shotsDir(this.key);
    mkdirSync(out, { recursive: true });
    const files: string[] = [];
    const safe = name.replace(/[^\w.-]+/g, '-');
    for (const scheme of ['light', 'dark']) {
      await this.pw(['set-color-scheme', scheme]);
      const setClass = `(() => { const r = document.documentElement; r.classList.remove('light', 'dark'); r.classList.add('${scheme}'); return r.className; })()`;
      if (themeKey) {
        await this.pw([
          'eval',
          `(() => { localStorage.setItem(${JSON.stringify(themeKey)}, JSON.stringify('${scheme}')); return 1; })()`
        ]);
        await this.reloadAndSettle();
      }
      await this.pw(['eval', setClass]);
      await sleep(1000);
      for (const [w, h] of sizes) {
        await this.pw(['resize', String(w), String(h)]);
        await sleep(1000);
        if (focus) {
          // The layout changes with the size: scroll to the part of the page again for each one.
          const r = await this.pw(['eval', focusScript(focus)]);
          if (evalResult(r.out).startsWith('not found')) {
            misses.push(`${w}x${h}`);
          }
          await sleep(500);
        }
        const file = join(out, `${safe}-${scheme}-${w}x${h}.png`);
        for (let attempt = 0; attempt < 4; attempt++) {
          await this.pw(['screenshot', `--filename=${file}`]);
          if (!tooBlank(fileSize(file), w, h)) {
            break;
          }
          await sleep(5000);
        }
        files.push(file);
      }
    }
    await this.pw(['set-color-scheme', 'no-preference']);
    // Back to the window's own size: a fixed size crops the page when the window is smaller.
    if (before) {
      await this.pw(before);
    }
    return { files, misses };
  }

  /** Reloads and waits for a new page with real content: a shot during a reload is blank. */
  private async reloadAndSettle() {
    const origin = async () =>
      (await this.pw(['eval', 'performance.timeOrigin'])).out.match(/\d{10,}(\.\d+)?/)?.[0];
    const before = await origin();
    await this.pw(['reload']);
    for (let i = 0; i < 15 && (await origin()) === before; i++) {
      await sleep(1000);
    }
    let steady = 0;
    for (let i = 0; i < 25 && steady < 2; i++) {
      const n = Number(
        (await this.pw(['eval', 'document.body.innerText.length'])).out.match(/\d+/)?.[0] ?? 0
      );
      steady = n > 200 ? steady + 1 : 0;
      await sleep(1000);
    }
    await sleep(3000);
  }

  /** Closes the browser and deletes its profile. */
  async close() {
    await this.pw(['close']);
    await this.pw(['delete-data']);
    rmSync(profileDir(this.key), { recursive: true, force: true });
    for (const f of ['init.js', 'config.json', 'routes.js']) {
      rmSync(join(profileDir(this.key), '..', `${this.key}.${f}`), { force: true });
    }
  }
}
