// UI harness: invented fixture data, drawn in dark, light and high-contrast themes, checked with
// axe-core and a keyboard-only walkthrough. Uses the local Chrome (CHROME to override). Run: pnpm test:ui
const { chromium } = require('playwright-core');
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// Module scripts do not load from file://, so serve the extension folder over HTTP.
const http = require('http');
const PORT = 47311;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http
  .createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
    fs.readFile(f, (e, b) => {
      if (e) {
        r.writeHead(404);
        return r.end();
      }
      r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
      r.end(b);
    });
  })
  .listen(PORT)
  .unref();
// Invented fixture data: the harness never reads the developer's real ~/.agent-ticket-board.
const FIXTURE = path.join(__dirname, 'fixture-home');
const CLI = path.join(ROOT, '..', 'cli', 'dist', 'atb.cjs');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const atb = (...a) =>
  JSON.parse(
    execFileSync('node', [CLI, ...a], { env: { ...process.env, ATB_HOME: FIXTURE } }).toString()
  );

const THEMES = {
  dark: {
    cls: 'vscode-dark',
    vars: '--vscode-font-family:-apple-system,system-ui;--vscode-editor-font-family:Menlo,monospace;--vscode-foreground:#cccccc;--vscode-editor-background:#1f1f1f;--vscode-focusBorder:#0078d4;--vscode-textLink-foreground:#4daafc;--vscode-button-foreground:#fff;--vscode-errorForeground:#f85149;--vscode-editorWarning-foreground:#cca700'
  },
  light: {
    cls: 'vscode-light',
    vars: '--vscode-font-family:-apple-system,system-ui;--vscode-editor-font-family:Menlo,monospace;--vscode-foreground:#3b3b3b;--vscode-editor-background:#ffffff;--vscode-focusBorder:#005fb8;--vscode-textLink-foreground:#005fb8;--vscode-button-foreground:#fff;--vscode-errorForeground:#f85149;--vscode-editorWarning-foreground:#bf8803'
  },
  hc: {
    cls: 'vscode-high-contrast',
    vars: '--vscode-font-family:-apple-system,system-ui;--vscode-editor-font-family:Menlo,monospace;--vscode-foreground:#ffffff;--vscode-editor-background:#000000;--vscode-focusBorder:#f38518;--vscode-contrastBorder:#6fc3df;--vscode-contrastActiveBorder:#f38518;--vscode-textLink-foreground:#21a6ff;--vscode-button-foreground:#fff;--vscode-errorForeground:#f48771;--vscode-editorWarning-foreground:#ffd370'
  }
};

function page(theme, mode) {
  const t = THEMES[theme];
  const file = path.join(OUT, `inbox-${theme}-${mode}.html`);
  fs.writeFileSync(
    file,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Agent Ticket Board</title><style>:root{${t.vars}}</style>
<link rel="stylesheet" href="../../media/webview/inbox.css"></head><body class="${t.cls}" data-mode="${mode}"><div id="root"></div>
<script>window.__sent=[];window.__hooks=[];window.acquireVsCodeApi=()=>({postMessage:m=>{window.__sent.push(m);window.__hooks.forEach(h=>h(m))},getState:()=>null,setState:()=>{}});</script><script type="module" src="../../media/webview/inbox.js"></script></body></html>`
  );
  return 'http://127.0.0.1:' + PORT + '/test-harness/out/' + path.basename(file);
}

(async () => {
  const sprint = atb('sprint', '--cached');
  // The fixture home has no repo, so add invented local work to one not-started ticket.
  const groups = sprint.groups.map((g) => ({
    ...g,
    tickets: g.tickets.map((t) =>
      t.key === 'PROJ-107'
        ? {
            ...t,
            state: 'active',
            local: {
              branch: 'feat/PROJ-107-example',
              worktree: '/code/example-app-wt/proj-107-example',
              changed: 6,
              label: 'Worktree proj-107-example, 6 changed files'
            }
          }
        : t
    )
  }));
  const tickets = Object.fromEntries(groups.flatMap((g) => g.tickets).map((t) => [t.key, t]));
  const detail = (k) => {
    const d = atb('ticket', k, '--cached');
    return {
      type: 'ticket',
      fresh: true,
      ticket: d.ticket,
      flow: d.flow,
      tracker:
        k === 'PROJ-107' ? { ...d.tracker, state: 'active', label: 'Started locally' } : d.tracker,
      adopt:
        k === 'PROJ-107'
          ? {
              stage: 'development',
              stageLabel: 'Development',
              text: 'Worktree proj-107-example, 6 changed files, on branch feat/PROJ-107-example.'
            }
          : d.adopt,
      comments: d.comments,
      jira: d.jira
    };
  };
  const b = await chromium.launch({
    executablePath:
      process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  });
  const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const report = { axe: {}, keyboard: {}, errors: [] };

  async function open(theme, mode, width, height) {
    const p = await b.newPage({ viewport: { width, height } });
    p.on('pageerror', (e) => report.errors.push(`${theme}/${mode}: ${e.message}`));
    await p.goto(page(theme, mode));
    // Stand-in for the extension host: answer 'select' with the ticket detail.
    await p.exposeFunction('__detail', (k) => detail(k));
    await p.evaluate(() =>
      window.__hooks.push((m) => {
        if (m.type === 'select') window.__detail(m.key).then((d) => window.postMessage(d, '*'));
      })
    );
    await p.waitForFunction(() => window.__sent.some((m) => m.type === 'ready'));
    await p.evaluate((m) => window.postMessage(m, '*'), {
      type: 'data',
      at: sprint.at,
      groups,
      updating: false,
      pending: 0
    });
    await p.waitForSelector(mode === 'board' ? 'article[draggable]' : '[role=option]');
    if (mode === 'split') await p.waitForSelector('#ttl', { state: 'attached' });
    return p;
  }
  async function axe(p, label) {
    await p.addScriptTag({ content: axeSrc });
    const r = await p.evaluate(() =>
      window.axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice']
      })
    );
    report.axe[label] = r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      n: v.nodes.length,
      help: v.help,
      first: v.nodes[0]?.target.join(' '),
      why: v.nodes[0]?.failureSummary?.split('\n').slice(0, 3).join(' ')
    }));
  }

  for (const theme of Object.keys(THEMES)) {
    const p = await open(theme, 'split', 1400, 900);
    // Select each stage example and audit every tab of the first one.
    for (const key of ['PROJ-102', 'PROJ-101', 'PROJ-103', 'PROJ-104', 'PROJ-108', 'PROJ-107']) {
      if (!tickets[key]) continue;
      await p.click(`[role=option][data-key="${key}"]`);
      await p.waitForFunction((k) => document.getElementById('ttl-key')?.textContent === k, key);
      await p.waitForTimeout(100);
      await axe(p, `${theme}/split/${key}`);
      if (theme === 'dark' || key === 'PROJ-102')
        await p.screenshot({ path: path.join(OUT, `inbox-${theme}-${key}.png`) });
    }
    await p.close();
    const s = await open(theme, 'sidebar', 320, 800);
    await axe(s, `${theme}/sidebar`);
    await s.screenshot({ path: path.join(OUT, `inbox-${theme}-sidebar.png`) });
    await s.close();
  }
  for (const theme of Object.keys(THEMES)) {
    const bp = await open(theme, 'board', 1500, 900);
    await axe(bp, `${theme}/board`);
    await bp.screenshot({ path: path.join(OUT, `board-${theme}.png`) });
    if (theme === 'dark') {
      await bp.evaluate(() => (window.__sent.length = 0));
      await bp.locator('[aria-label="Move PROJ-102"]').focus();
      await bp.keyboard.press('Enter');
      await bp.waitForSelector('[role=menu]');
      await bp.keyboard.press('ArrowDown');
      await bp.keyboard.press('Enter');
      await bp.waitForTimeout(100);
      report.keyboard.boardMove = await bp.evaluate(() =>
        window.__sent.find((m) => m.type === 'move')
      );
      await bp.click('article:has-text("PROJ-101") button:has-text("Show and sort")');
      report.keyboard.boardOpen = await bp.evaluate(() =>
        window.__sent.find((m) => m.type === 'openTicket')
      );
    }
    await bp.close();
  }
  const n = await open('dark', 'split', 560, 820);
  await n.click('[role=option][data-key="PROJ-102"]');
  await n.waitForFunction(() => document.getElementById('ttl-key')?.textContent === 'PROJ-102');
  await n.screenshot({ path: path.join(OUT, 'inbox-dark-narrow.png') });
  await axe(n, 'dark/narrow');
  await n.close();

  // Keyboard-only walkthrough.
  const k = await open('dark', 'split', 1400, 900);
  const kb = report.keyboard;
  const focus = () =>
    k.evaluate(() => {
      const a = document.activeElement;
      return (
        a.id ||
        a.dataset.key ||
        a.getAttribute('aria-label') ||
        a.getAttribute('role') ||
        a.textContent.trim().slice(0, 30)
      );
    });
  const sel = () =>
    k.evaluate(() => document.querySelector('[role=option][aria-selected=true]')?.dataset.key);
  const head = () => k.evaluate(() => document.getElementById('ttl-key')?.textContent);
  await k.keyboard.press('Tab');
  kb.tab1 = await focus();
  await k.keyboard.press('Tab');
  kb.tab2 = await focus();
  await k.keyboard.press('Tab');
  kb.tab3 = await focus();
  await k.focus('[role=option][aria-selected=true]');
  const s0 = await sel();
  await k.keyboard.press('ArrowDown');
  const s1 = await sel();
  await k.keyboard.press('j');
  const s2 = await sel();
  await k.keyboard.press('k');
  const s3 = await sel();
  kb.moves = { s0, arrowDown: s1, j: s2, k: s3, ok: s0 !== s1 && s1 !== s2 && s3 === s1 };
  await k.waitForTimeout(300);
  kb.paneFollows = (await head()) === s3;
  await k.focus('[role=option][data-key="PROJ-102"]');
  await k.keyboard.press('Enter');
  await k.waitForTimeout(300);
  kb.enterOpens = { head: await head(), focus: await focus() };
  await k.keyboard.press('2');
  await k.waitForTimeout(50);
  kb.key2 = await k.evaluate(
    () => document.querySelector('[role=tab][aria-selected=true]').textContent
  );
  await k.focus('[role=tab][aria-selected=true]');
  await k.keyboard.press('ArrowRight');
  kb.arrowTab = await k.evaluate(
    () => document.querySelector('[role=tab][aria-selected=true]').textContent
  );
  await k.evaluate(() => (window.__sent.length = 0));
  await k.keyboard.press('a');
  kb.aSent = await k.evaluate(() => window.__sent.find((m) => m.type === 'action'));
  await k.keyboard.press('c');
  await k.waitForTimeout(60);
  kb.cFocus = await focus();
  await k.keyboard.type('Forward jumps to the wrong zoom.');
  await k.keyboard.press('Meta+Enter');
  kb.commentSent = await k.evaluate(() => window.__sent.find((m) => m.type === 'comment'));
  await k.focus('[aria-label="More actions"]');
  await k.keyboard.press('Enter');
  await k.waitForSelector('[role=menu]');
  await k.waitForTimeout(80);
  kb.menuFirst = await focus();
  await k.keyboard.press('ArrowDown');
  kb.menuDown = await focus();
  await k.keyboard.press('Escape');
  await k.waitForTimeout(150);
  kb.menuClosed = {
    gone: await k.evaluate(() => !document.querySelector('[role=menu]')),
    focus: await focus()
  };
  await k.focus('[role=separator]');
  const w0 = await k.evaluate(
    () => +document.querySelector('[role=separator]').getAttribute('aria-valuenow')
  );
  await k.keyboard.press('ArrowRight');
  await k.keyboard.press('ArrowRight');
  const w1 = await k.evaluate(
    () => +document.querySelector('[role=separator]').getAttribute('aria-valuenow')
  );
  const box = await k.locator('[role=separator]').boundingBox();
  await k.mouse.move(box.x + 4, 400);
  await k.mouse.down();
  await k.mouse.move(520, 400, { steps: 5 });
  await k.mouse.up();
  const w2 = await k.evaluate(
    () => +document.querySelector('[role=separator]').getAttribute('aria-valuenow')
  );
  kb.resize = { start: w0, afterKeys: w1, afterDrag: w2 };
  await k.screenshot({ path: path.join(OUT, 'inbox-dark-resized.png') });
  // The per-ticket Jira permission checkbox sends the setting.
  await k.evaluate(() => (window.__sent.length = 0));
  await k.getByText('Let the agent update the Jira status').click();
  kb.agentMoveToggle = await k.evaluate(() => window.__sent.find((m) => m.type === 'setAgentMove'));
  // The after-merge select sends the choice for this ticket.
  await k.evaluate(() => (window.__sent.length = 0));
  await k.getByRole('button', { name: /After the merge/ }).click();
  await k.waitForSelector('[role=listbox]');
  await axe(k, 'dark/after-merge-open');
  await k.getByRole('option', { name: 'Done', exact: true }).click();
  await k.waitForTimeout(80);
  kb.afterMerge = await k.evaluate(() => window.__sent.find((m) => m.type === 'setAfterMerge'));
  // Disabled buttons get no hover.
  const chat = k.locator('button:has-text("Chat")');
  await chat.hover();
  kb.disabledHover = await chat.evaluate((b) => ({
    disabled: b.disabled,
    hovered: b.hasAttribute('data-hovered')
  }));
  // Groups collapse and expand; Done starts collapsed.
  kb.doneCollapsed = await k.evaluate(() =>
    [...document.querySelectorAll('[data-queue] [slot=trigger], [data-queue] h3 button')].map(
      (b) => b.textContent + ':' + b.getAttribute('aria-expanded')
    )
  );
  await k.locator('[data-queue] button[aria-expanded]', { hasText: 'Verifying' }).click();
  kb.verifyingAfterClick = await k
    .locator('[data-queue] button[aria-expanded]', { hasText: 'Verifying' })
    .getAttribute('aria-expanded');
  await k.locator('[data-queue] button[aria-expanded]', { hasText: 'Verifying' }).click();
  // Sidebar on screen: the editor tab shows the ticket only.
  await k.evaluate(() => window.postMessage({ type: 'layout', queue: false }, '*'));
  await k.waitForTimeout(150);
  kb.soloQueueGone = await k.evaluate(() => !document.querySelector('[data-queue]'));
  await axe(k, 'dark/solo');
  await k.screenshot({ path: path.join(OUT, 'inbox-dark-solo.png') });
  await k.close();

  const rh = await open('dark', 'split', 1400, 900);
  await rh.click('[role=option][data-key="PROJ-102"]');
  await rh.waitForTimeout(300);
  kb.rowHeights = await rh.evaluate(() =>
    [...document.querySelectorAll('[data-queue] [role=option]')].map((o) => ({
      key: o.dataset.key,
      open: /, open/.test(o.textContent),
      h: Math.round(o.getBoundingClientRect().height)
    }))
  );
  const heightOf = (k) =>
    rh.evaluate(
      (key) =>
        Math.round(
          document.querySelector(`[role=option][data-key="${key}"]`).getBoundingClientRect().height
        ),
      k
    );
  const before = await heightOf('PROJ-105');
  await rh.click('[role=option][data-key="PROJ-105"]');
  await rh.waitForTimeout(300);
  kb.rowHeightOnSelect = { before, after: await heightOf('PROJ-105') };
  await rh.click('[role=option][data-key="PROJ-107"]');
  await rh
    .waitForFunction(() => document.getElementById('ttl-key')?.textContent === 'PROJ-107', null, {
      timeout: 3000
    })
    .catch(() => {});
  kb.adoptNotice = await rh.evaluate(
    () => document.querySelector('[aria-label="Work found on this machine"]')?.textContent ?? null
  );
  await rh.getByRole('button', { name: 'Adopt as Development' }).click();
  kb.adoptSent = await rh.evaluate(
    () => window.__sent.filter((m) => m.type === 'adopt').at(-1) ?? null
  );
  await rh.close();
  // Motion: count the animations that are running in the page right after each change.
  kb.motion = {};
  for (const reduced of [false, true]) {
    const mp = await open('dark', 'split', 1400, 900);
    await mp.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const running = () =>
      mp.evaluate(
        () =>
          document
            .getAnimations()
            .filter((a) => a.playState === 'running')
            .map((a) => a.animationName || a.transitionProperty || 'js').length
      );
    const m = {};
    await mp.click('[role=option][data-key="PROJ-101"]');
    await mp.waitForTimeout(30);
    m.ticketEnter = await running();
    await mp.waitForTimeout(600);
    await mp.getByRole('tab', { name: /Testing/ }).click();
    await mp.waitForTimeout(30);
    m.tabSwitch = await running();
    await mp.waitForTimeout(600);
    const group = mp.locator('[data-queue] h3 button, [data-queue] [slot=trigger]').first();
    const panel = mp.locator('[data-queue] [role=group], [data-queue] .overflow-clip').first();
    const h0 = await panel.evaluate((el) => el.getBoundingClientRect().height);
    await group.click();
    await mp.waitForTimeout(60);
    m.groupMidHeight = Math.round(await panel.evaluate((el) => el.getBoundingClientRect().height));
    m.groupStartHeight = Math.round(h0);
    await mp.waitForTimeout(600);
    m.groupEndHidden = await panel.evaluate((el) => el.hasAttribute('hidden'));
    await group.click();
    await mp.waitForTimeout(600);
    await mp
      .getByRole('button', { name: /More/ })
      .first()
      .click()
      .catch(() => {});
    await mp.waitForTimeout(20);
    m.popoverEntering = await mp.evaluate(
      () =>
        !!document.querySelector('[data-entering]') ||
        document.getAnimations().some((a) => a.animationName === 'popIn')
    );
    await mp.keyboard.press('Escape');
    kb.motion[reduced ? 'reduced' : 'normal'] = m;
    await mp.close();
  }
  kb.trackerLabels = {};
  for (const key of ['PROJ-105', 'PROJ-106', 'PROJ-107']) {
    const rh2 = await open('dark', 'split', 1400, 900);
    await rh2.click(`[role=option][data-key="${key}"]`).catch(() => {});
    await rh2
      .waitForFunction((k) => document.getElementById('ttl-key')?.textContent === k, key, {
        timeout: 3000
      })
      .catch(() => {});
    kb.trackerLabels[key] = await rh2.evaluate(() =>
      document
        .querySelector('nav[aria-label="Where it is"]')
        ?.textContent?.replace(/Jira|Chat/g, '')
        .trim()
    );
    await rh2.close();
  }
  const sb = await open('dark', 'sidebar', 320, 800);
  await sb.evaluate(() => window.postMessage({ type: 'current', key: 'PROJ-102' }, '*'));
  await sb.waitForTimeout(100);
  const marked = () =>
    sb.evaluate(
      () =>
        [...document.querySelectorAll('[role=option]')].filter((o) => /, open/.test(o.textContent))
          .length
    );
  kb.sidebarCurrentWithTab = await marked();
  await sb.evaluate(() => window.postMessage({ type: 'current', key: null }, '*'));
  await sb.waitForTimeout(100);
  kb.sidebarCurrentNoTab = await marked();
  await sb.close();
  // Settings page: invented values from the fixture home, plus invented detected values.
  const settings = atb('settings');
  const propose = (key, text, confidence, same = false) => {
    const f = settings.sections.flatMap((x) => x.fields).find((x) => x.key === key);
    f.proposal = { key, value: text, text, source: 'acli jira workitem search', confidence, same };
  };
  propose('tracker.columns', 'To Do, In Progress, Code Review, Verifying, Done', 'medium');
  propose('tracker.site', settings.sections[0].fields[0].text, 'high', true);
  propose('repo.branch', '{type}/{key}-{slug}', 'medium');
  settings.checks = [
    { name: 'Jira (acli)', ok: true, detail: 'Signed in' },
    { name: 'GitHub (gh)', ok: false, detail: 'Not signed in. Run: gh auth login' }
  ];
  settings.gaps = [{ key: 'repo.prTitle', files: ['.github/pull_request_template.md'] }];
  async function openSettings(theme, width) {
    const p = await b.newPage({ viewport: { width, height: 1000 } });
    p.on('pageerror', (e) => report.errors.push(`${theme}/settings: ${e.message}`));
    await p.goto(page(theme, 'settings'));
    await p.waitForFunction(() => window.__sent.some((m) => m.type === 'ready'));
    await p.evaluate((view) => window.postMessage({ type: 'settings', view }, '*'), settings);
    await p.waitForSelector('input');
    return p;
  }
  for (const theme of Object.keys(THEMES)) {
    const sp = await openSettings(theme, 1100);
    await axe(sp, `${theme}/settings`);
    await sp.screenshot({ path: path.join(OUT, `settings-${theme}.png`), fullPage: true });
    await sp.close();
  }
  const sk = await openSettings('dark', 1100);
  const sent = (type) => sk.evaluate((t) => window.__sent.filter((m) => m.type === t), type);
  const inView = (loc) =>
    loc.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.width > 0;
    });
  const headerSave = sk.getByRole('button', { name: /^Save( \d+)?$/ }).first();
  kb.settingsSaveBefore = {
    inView: await inView(headerSave),
    disabled: await headerSave.isDisabled()
  };
  await sk.getByRole('textbox', { name: 'Project key' }).focus();
  await sk.keyboard.press('Meta+A');
  await sk.keyboard.type('DEMO');
  await sk.getByRole('button', { name: 'Use the detected Board columns' }).focus();
  await sk.keyboard.press('Enter');
  kb.settingsSaveBar = await sk.getByRole('region', { name: 'Unsaved changes' }).innerText();
  kb.settingsSaveAfter = {
    label: await headerSave.innerText(),
    disabled: await headerSave.isDisabled()
  };
  await sk.getByRole('textbox', { name: 'Ports for builds' }).focus();
  await sk.keyboard.type('0');
  kb.settingsBarInViewAtBottom = await inView(sk.getByRole('region', { name: 'Unsaved changes' }));
  await sk.getByRole('button', { name: 'Save', exact: true }).focus();
  await sk.keyboard.press('Enter');
  kb.settingsSave = (await sent('saveSettings'))[0];
  await sk.evaluate(() =>
    window.postMessage(
      {
        type: 'settingsSaved',
        saved: ['tracker.columns'],
        errors: { 'tracker.project': 'Project key must be text' }
      },
      '*'
    )
  );
  await sk.waitForTimeout(100);
  kb.settingsError = await sk
    .getByRole('textbox', { name: 'Project key' })
    .getAttribute('aria-invalid');
  await sk.getByRole('button', { name: 'Detect the repository values again' }).click();
  kb.settingsDetect = (await sent('detect'))[0];
  await sk.evaluate(() => window.postMessage({ type: 'detecting', only: 'repo' }, '*'));
  await sk.waitForTimeout(50);
  kb.settingsDetecting = await sk
    .getByRole('button', { name: 'Detect the repository values again' })
    .innerText();
  await axe(sk, 'dark/settings-edited');
  await sk.screenshot({ path: path.join(OUT, 'settings-dark-edited.png'), fullPage: true });
  await sk.close();
  const sn = await openSettings('dark', 520);
  await axe(sn, 'dark/settings-narrow');
  await sn.screenshot({ path: path.join(OUT, 'settings-dark-narrow.png'), fullPage: true });
  await sn.close();

  fs.writeFileSync(path.join(OUT, 'inbox-report.json'), JSON.stringify(report, null, 1));
  const summary = Object.entries(report.axe).map(
    ([k, v]) =>
      `${k}: ${v.length ? v.map((x) => `${x.id}(${x.impact},${x.n})`).join(' ') : 'clean'}`
  );
  console.log(summary.join('\n'));
  console.log(JSON.stringify(report.keyboard, null, 1));
  console.log('errors', report.errors);
  await b.close();
})();
