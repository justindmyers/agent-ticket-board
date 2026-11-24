import { execFile } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HOME } from '@agent-ticket-board/core';

// The ticket's test browser: one headed playwright-cli session for each ticket, run from the
// worktree with the target repository's own `pnpm exec playwright-cli`. It waits for the developer's
// login and takes the screenshot set. The window and its profile stay between test runs of the same
// ticket, so the developer logs in once; Approve closes the window and deletes the profile.

export const sessionOf = (key: string) => `atb-${key}`;

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
 * The routes of the test browser, as one playwright-cli run-code snippet. It replaces earlier routes.
 * Documents on any localhost port except `keep` get `Referrer-Policy: no-referrer`: dev logins often
 * refuse a Referer from a port other than the developer's own.
 * A route handler always resolves: an uncaught error leaves the request open and hangs the session.
 */
export function routesCode(keep: number[]) {
  const ports = keep.map((p) => `${p}\\/`).join('|');
  return `async (page) => {
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
        'pnpm',
        ['exec', 'playwright-cli', `-s=${this.session}`, ...args],
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
   * Opens the ticket's browser, installs its routes, and goes to the app. The profile of an earlier
   * browser stays: the login survives a closed window.
   */
  async open(url: string, keepPorts: number[]) {
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
    await this.routes(keepPorts);
    await this.pw(['goto', url]);
  }

  /** Installs the routes of the test browser: the Referer fix. */
  async routes(keepPorts: number[]) {
    const file = join(profileDir(this.key), '..', `${this.key}.routes.js`);
    writeFileSync(file, routesCode(keepPorts));
    await this.pw(['run-code', '--filename', file]);
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
