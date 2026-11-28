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
<script>window.__sent=[];window.__hooks=[];window.__state=null;window.acquireVsCodeApi=()=>({postMessage:m=>{window.__sent.push(m);window.__hooks.forEach(h=>h(m))},getState:()=>window.__state,setState:s=>{window.__state=s}});</script><script type="module" src="../../media/webview/inbox.js"></script></body></html>`
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
      // Work done outside the board, on one ticket.
      outside:
        k === 'PROJ-108'
          ? {
              files: [
                { path: 'apps/web/src/Edges/EdgesList.tsx', kind: 'changed' },
                { path: 'apps/web/src/Edges/EdgeDetails.tsx', kind: 'changed' },
                { path: 'apps/web/src/Edges/EdgeSort.tsx', kind: 'new' },
                { path: 'apps/web/src/Edges/components/EdgeCard.tsx', kind: 'changed' },
                { path: 'apps/web/src/Edges/utils/old-helper.ts', kind: 'deleted' }
              ],
              commits: [
                {
                  sha: 'c0ffee1234567890c0ffee1234567890c0ffee12',
                  short: 'c0ffee123',
                  title: 'fix(edges): keep the sort when the list reloads (PROJ-108)'
                }
              ]
            }
          : null,
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
    // Contrast is checked on the settled page: a fade still running blends text into its background.
    await p.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => {}))
      )
    );
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
  // Testing: the evidence of each requirement, and a screenshot button that asks the host to open it.
  kb.evidence = await rh.evaluate(() => ({
    rows: document.querySelectorAll('[aria-label="Evidence"] li').length,
    passes: [...document.querySelectorAll('[aria-label="Evidence"] li')].filter((li) =>
      li.textContent.includes('Passes')
    ).length,
    spent: document.body.textContent.includes('$6.67 so far')
  }));
  await axe(rh, 'dark/ticket-testing');
  await rh.screenshot({ path: path.join(OUT, 'ticket-testing.png') });
  await rh.locator('[aria-label="Writes to the backend"]').screenshot({
    path: path.join(OUT, 'ticket-testing-writes.png')
  });
  kb.dataLabels = await rh.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Evidence"] li')].map((li) =>
      ['Real data', 'Fake data', 'Test only'].filter((t) => li.textContent.includes(t))
    )
  );
  kb.failureBlock = await rh.evaluate(() => {
    const dl = document.querySelector('[aria-label="Evidence"] dl');
    return dl ? [...dl.querySelectorAll('dt')].map((t) => t.textContent) : null;
  });
  const failing = rh.locator('[aria-label="Evidence"] li', { hasText: 'Does not pass' });
  await failing.scrollIntoViewIfNeeded();
  await failing.screenshot({ path: path.join(OUT, 'ticket-testing-failure.png') });
  await rh.evaluate(() => (window.__sent.length = 0));
  await rh
    .getByRole('button', { name: 'Open the R2-forward dark 1400×900 screenshot of R2' })
    .click();
  kb.shotSent = await rh.evaluate(() => window.__sent.find((m) => m.type === 'action'));
  await rh.click('[role=option][data-key="PROJ-108"]');
  await rh.waitForTimeout(300);
  // A finished ticket opens on Ship: the commits, the checks before the push, and the pull request.
  kb.ship = await rh.evaluate(() => ({
    tab: document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim(),
    commitRows: document.querySelectorAll('[aria-label="Commits"] li').length,
    gateRows: document.querySelectorAll('[aria-label="Checks before a push"] li').length,
    reviewRows: document.querySelectorAll('[aria-label="Review"] li').length
  }));
  kb.pushed = await rh.evaluate(() => {
    const s = document.querySelector('[aria-label="Push"]');
    return s
      ? {
          text: s.textContent.replace(/\s+/g, ' ').trim().slice(0, 400),
          rows: s.querySelectorAll('li').length,
          openButtons: [...s.querySelectorAll('button')].map((b) => b.textContent.trim())
        }
      : null;
  });
  await rh
    .locator('[aria-label="Push"]')
    .screenshot({ path: path.join(OUT, 'ticket-push-pushed.png') });
  kb.gateText = await rh.evaluate(() =>
    document
      .querySelector('[aria-label="Checks before a push"]')
      ?.textContent.replace(/\s+/g, ' ')
      .slice(0, 330)
  );
  await rh
    .locator('[aria-label="Checks before a push"]')
    .screenshot({ path: path.join(OUT, 'ticket-gate.png') });
  // A section collapses to its title and expands again, by mouse and by keyboard.
  const gate = '[aria-label="Checks before a push"]';
  const toggle = rh.locator(`${gate} button[aria-expanded]`);
  kb.collapse = {
    before: await toggle.getAttribute('aria-expanded'),
    rowsBefore: await rh.locator(`${gate} li`).count()
  };
  await toggle.click();
  kb.collapse.after = await toggle.getAttribute('aria-expanded');
  kb.collapse.rowsAfter = await rh.locator(`${gate} li`).count();
  kb.collapse.titleStillThere = await rh.locator(`${gate} h3`).isVisible();
  kb.collapse.asideStillThere = (await rh.locator(`${gate}`).textContent()).includes('9 of 9');
  await axe(rh, 'dark/ticket-collapsed');
  await rh.screenshot({ path: path.join(OUT, 'ticket-collapsed.png') });
  // It stays collapsed when another ticket is opened and this one again.
  await rh.click('[role=option][data-key="PROJ-103"]');
  await rh.waitForTimeout(200);
  await rh.click('[role=option][data-key="PROJ-108"]');
  await rh.waitForTimeout(300);
  kb.collapse.afterReopen = await toggle.getAttribute('aria-expanded');
  await toggle.focus();
  await rh.keyboard.press('Enter');
  kb.collapse.keyboard = {
    expanded: await toggle.getAttribute('aria-expanded'),
    rows: await rh.locator(`${gate} li`).count()
  };
  const out = '[aria-label="Changes outside the board"]';
  kb.outside = {
    shown: await rh.locator(out).count(),
    rows: await rh.locator(`${out} li`).count(),
    aside: (await rh.locator(out).textContent()).includes('5 files changed and 1 commit'),
    lines: await rh.locator(`${out} li`).allTextContents(),
    height: Math.round((await rh.locator(`${out} ul`).boundingBox()).height)
  };
  await axe(rh, 'dark/ticket-ship');
  await rh.screenshot({ path: path.join(OUT, 'ticket-ship.png') });
  // A push that is only a dry run: no links, because GitHub has nothing to show yet.
  await rh.click('[role=option][data-key="PROJ-103"]');
  await rh.waitForTimeout(300);
  kb.dryRun = await rh.evaluate(() => {
    const s = document.querySelector('[aria-label="Push"]');
    return s
      ? {
          text: s.textContent.replace(/\s+/g, ' ').trim().slice(0, 400),
          rows: s.querySelectorAll('li').length,
          openButtons: [...s.querySelectorAll('button')].map((b) => b.textContent.trim())
        }
      : null;
  });
  await rh
    .locator('[aria-label="Push"]')
    .screenshot({ path: path.join(OUT, 'ticket-push-dryrun.png') });
  // The same preview after the branch moved: out of date, and a banner with the live count.
  await rh.evaluate(async () => {
    const d = await window.__detail('PROJ-103');
    d.flow = {
      ...d.flow,
      push: { ...d.flow.push, stale: true },
      need: {
        kind: 'decision',
        ask: 'The branch changed after the preview: it has 5 commits beyond origin/main now, and the preview showed 3.',
        detail:
          '2 commits were made outside the board. Prepare the push again so the checks cover the branch as it is now.',
        actions: [
          { id: 'startGate', label: 'Prepare the push again' },
          { id: 'openWorktree', label: 'Open worktree' }
        ]
      }
    };
    window.postMessage(d, '*');
  });
  await rh.waitForTimeout(300);
  kb.stalePush = await rh.evaluate(() => {
    const s = document.querySelector('[aria-label="Push"]');
    const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
    return {
      pill: s ? /Out of date/.test(s.textContent) : null,
      caption: s ? /changed after this preview/.test(s.textContent) : null,
      banner: /it has 5 commits beyond origin\/main now, and the preview showed 3/.test(
        document.body.textContent
      ),
      approve: buttons.some((t) => /Approve the push/.test(t)),
      prepare: buttons.some((t) => /Prepare the push again/.test(t))
    };
  });
  // The draft pull request: first what GitHub will get, then the open draft with its address.
  const draft = (made, live = false) =>
    rh.evaluate(
      async ([made, live]) => {
        const d = await window.__detail('PROJ-103');
        const prPlan = {
          title: 'feat(nav): add the mobile drawer (PROJ-103)',
          body: '## Description\n\nA drawer for small screens.\n\n- feat(nav): add the mobile drawer\n- feat(nav): add the drawer toggle hook\n\n## What type of change is this?\n\n- [x] Feature\n- [ ] Bug Fix\n\n## Jira Ticket(s)\n\n[PROJ-103](https://example.atlassian.net/browse/PROJ-103)\n\n## Validation Steps\n\n- [x] The drawer opens on a phone\n  ![The drawer opens](./1-drawer.png)\n- [ ] The toggle saves (tested with mocked data)\n',
          base: 'main',
          head: 'feature/PROJ-103-mobile-nav',
          attach: [
            {
              path: '/Users/someone/shots/drawer.png',
              name: '1-drawer.png',
              alt: 'The drawer opens'
            }
          ],
          commits: 3,
          at: 'n',
          ...(made
            ? {
                createdAt: 'm',
                url: 'https://github.com/acme/web/pull/7',
                warning: 'The draft is open, but a screenshot did not upload. Add it on GitHub.'
              }
            : {})
        };
        d.flow = {
          ...d.flow,
          push: { ...d.flow.push, pushedAt: 'p' },
          // GitHub has no pull request until the board makes it.
          pr: live
            ? {
                number: 7,
                url: 'https://github.com/acme/web/pull/7',
                state: 'Draft',
                checks: '17 passing',
                reviews: 'Waiting for review',
                comments: 0,
                failing: false
              }
            : undefined,
          prPlan,
          need: made
            ? {
                kind: 'decision',
                ask: 'The draft pull request is open: https://github.com/acme/web/pull/7',
                actions: [{ id: 'openWorktree', label: 'Open worktree' }]
              }
            : {
                kind: 'decision',
                ask: 'Ready to create a draft pull request from feature/PROJ-103-mobile-nav into main.',
                actions: [
                  { id: 'createPr', label: 'Create the draft pull request' },
                  { id: 'showPr', label: 'Show the pull request again' }
                ]
              }
        };
        window.postMessage(d, '*');
      },
      [made, live]
    );
  const readDraft = () =>
    rh.evaluate(() => {
      const s = document.querySelector(
        '[aria-label="Draft pull request"], [aria-label^="Pull request #"]'
      );
      const buttons = [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
      return {
        shown: !!s,
        pill: s
          ? s.textContent.includes('Preview')
            ? 'Preview'
            : s.textContent.includes('Draft open')
              ? 'Draft open'
              : null
          : null,
        title: s ? s.textContent.includes('feat(nav): add the mobile drawer (PROJ-103)') : null,
        includes: s ? s.textContent.includes('3 commits, 1 screenshot') : null,
        body: s ? s.textContent.includes('A drawer for small screens.') : null,
        noLocalPath: s ? !s.textContent.includes('/Users/') : null,
        warning: s ? s.textContent.includes('screenshot did not upload') : null,
        create: buttons.some((t) => /Create the draft pull request/.test(t)),
        show: buttons.some((t) => /Show the pull request again/.test(t)),
        openLink: buttons.some((t) => /View the pull request/.test(t)),
        update: buttons.some((t) => /^Update the pull request/.test(t)),
        updatePill: s ? s.textContent.includes('Update preview') : null,
        replaces: s ? s.textContent.includes('replaces the title and the body') : null,
        // The newest step is on top: what the banner asks you to approve is the first thing you see.
        order: [...document.querySelectorAll('section[aria-label]')]
          .map((x) => x.getAttribute('aria-label'))
          .filter(
            (n) =>
              ['Draft pull request', 'Push', 'Commits'].includes(n) || /^Pull request #/.test(n)
          )
      };
    });
  await draft(false);
  await rh.waitForTimeout(300);
  kb.draftPreview = await readDraft();
  await axe(rh, 'dark/ticket-pr-preview');
  await rh
    .locator('[aria-label="Draft pull request"], [aria-label^="Pull request #"]')
    .screenshot({ path: path.join(OUT, 'ticket-pr-preview.png') });
  await draft(true);
  await rh.waitForTimeout(300);
  kb.draftOpen = await readDraft();
  await axe(rh, 'dark/ticket-pr-open');
  // GitHub has the pull request: there is one card, with GitHub's state, and the body folds.
  const readMerged = () =>
    rh.evaluate(() => {
      const cards = [...document.querySelectorAll('section[aria-label]')]
        .map((x) => x.getAttribute('aria-label'))
        .filter((n) => /pull request/i.test(n));
      const s = document.querySelector('section[aria-label="Pull request #7"]');
      const d = s?.querySelector('details');
      return {
        cards,
        facts: s
          ? ['State', 'Checks', 'Reviews', 'Comments'].every((k) => s.textContent.includes(k))
          : null,
        folded: d ? !d.open : null,
        buttons: [...(s?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim())
      };
    });
  await draft(true, true);
  await rh.waitForTimeout(300);
  kb.merged = await readMerged();
  await axe(rh, 'dark/ticket-pr-merged');
  await rh
    .locator('section[aria-label="Pull request #7"]')
    .screenshot({ path: path.join(OUT, 'ticket-pr-merged.png') });
  await rh.locator('section[aria-label="Pull request #7"] summary').click();
  kb.merged.unfolded = await rh.evaluate(
    () => document.querySelector('section[aria-label="Pull request #7"] details').open
  );
  // An update of the open pull request: shown first, and applied only on approval.
  await rh.evaluate(async () => {
    const d = await window.__detail('PROJ-103');
    d.flow = {
      ...d.flow,
      push: { ...d.flow.push, pushedAt: 'p' },
      prPlan: {
        title: 'feat(nav): add the mobile drawer (PROJ-103)',
        body: '## Description\n\nA new body.\n',
        base: 'main',
        head: 'feature/PROJ-103-mobile-nav',
        attach: [],
        commits: 3,
        at: 'n',
        createdAt: 'm',
        update: true,
        url: 'https://github.com/acme/web/pull/7',
        warning:
          'The screenshots are older than the code: EdgeCard.tsx changed after them. None are attached. Run Testing again to take new ones.'
      },
      need: {
        kind: 'decision',
        ask: 'Ready to update the draft pull request https://github.com/acme/web/pull/7.',
        actions: [
          { id: 'createPr', label: 'Update the pull request' },
          { id: 'showPr', label: 'Build the preview again' }
        ]
      }
    };
    window.postMessage(d, '*');
  });
  await rh.waitForTimeout(300);
  kb.draftUpdate = await readDraft();
  kb.draftUpdate.staleNote = await rh.evaluate(() =>
    document
      .querySelector('[aria-label="Draft pull request"], [aria-label^="Pull request #"]')
      .textContent.includes('older than the code')
  );
  // The banner button says what it runs. It shows on hover and on keyboard focus.
  await rh
    .getByRole('button', { name: /^Update the pull request/ })
    .first()
    .hover();
  await rh.waitForSelector('[role="tooltip"]', { timeout: 3000 }).catch(() => null);
  kb.draftUpdate.tooltip = await rh.evaluate(
    () => document.querySelector('[role="tooltip"]')?.textContent ?? null
  );
  await rh.mouse.move(0, 0);
  await rh.waitForTimeout(200);
  await axe(rh, 'dark/ticket-pr-update');
  await rh
    .locator('[aria-label="Draft pull request"], [aria-label^="Pull request #"]')
    .screenshot({ path: path.join(OUT, 'ticket-pr-update.png') });
  await axe(rh, 'dark/ticket-push-stale');
  await rh.screenshot({ path: path.join(OUT, 'ticket-push-stale.png') });
  await axe(rh, 'dark/ticket-push-dryrun');
  await rh.click('[role=option][data-key="PROJ-108"]');
  await rh.waitForTimeout(300);
  // Code review: each finding with what became of it. The commits and the push are not here.
  await rh.getByRole('tab', { name: /Code review/ }).click();
  await rh.waitForTimeout(200);
  kb.codeReview = await rh.evaluate(() => ({
    rows: document.querySelectorAll('[aria-label="Review"] li').length,
    fixed: document.body.textContent.includes('Fixed'),
    dropped: document.body.textContent.includes('Dropped'),
    commitRows: document.querySelectorAll('[aria-label="Commits"] li').length,
    gateRows: document.querySelectorAll('[aria-label="Checks before a push"] li').length
  }));
  kb.findingButtons = await rh.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Review"] button')].map((b) => b.textContent.trim())
  );
  await axe(rh, 'dark/ticket-code-review');
  await rh.screenshot({ path: path.join(OUT, 'ticket-code-review.png') });
  await rh.click('[role=option][data-key="PROJ-112"]');
  await rh.waitForTimeout(300);
  kb.loginRun = await rh.evaluate(() => {
    const s = document.querySelector('[aria-label="Log in to test"]');
    return s ? { text: s.textContent, running: s.classList.contains('run-border') } : null;
  });
  await axe(rh, 'dark/ticket-login');
  await rh.screenshot({ path: path.join(OUT, 'ticket-login.png') });
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
  // Plan questions: first on the Planning tab, answered by picking an option or typing one.
  await rh.click('[role=option][data-key="PROJ-101"]');
  await rh
    .waitForFunction(() => document.getElementById('ttl-key')?.textContent === 'PROJ-101', null, {
      timeout: 3000
    })
    .catch(() => {});
  kb.questionsFirst = await rh.evaluate(() => {
    const titles = [...document.querySelectorAll('section[aria-label]')].map((s) =>
      s.getAttribute('aria-label')
    );
    return titles.indexOf('Questions') < titles.indexOf('Requirements');
  });
  kb.assumptions = await rh.evaluate(
    () => document.querySelectorAll('[aria-label="Assumptions"] li').length
  );
  kb.answerSaveDisabled = await rh
    .getByRole('button', { name: 'Save the answer to question 2' })
    .isDisabled();
  await rh
    .getByRole('radiogroup', { name: 'Answers to question 2' })
    .locator('label')
    .filter({ hasText: /^Both/ })
    .click();
  await axe(rh, 'dark/ticket-questions');
  await rh.screenshot({ path: path.join(OUT, 'ticket-questions.png'), fullPage: true });
  await rh.getByRole('button', { name: 'Save the answer to question 2' }).click();
  await rh.getByRole('button', { name: 'Change the answer to question 1' }).click();
  await rh
    .getByRole('radiogroup', { name: 'Answers to question 1' })
    .locator('label')
    .filter({ hasText: 'Other answer' })
    .click();
  await rh
    .getByRole('textbox', { name: 'Your answer to question 1' })
    .fill('Only when the filter shows them');
  await rh.getByRole('button', { name: 'Save the answer to question 1' }).click();
  await rh.getByRole('button', { name: 'Show 1 earlier answers' }).click();
  await rh.getByRole('button', { name: 'Change earlier answer 1' }).click();
  await rh.getByRole('textbox', { name: 'Earlier answer 1' }).fill('Yes, all projects');
  await axe(rh, 'dark/ticket-earlier-answers');
  await rh.getByRole('button', { name: 'Save earlier answer 1' }).click();
  kb.answersSent = await rh.evaluate(() => window.__sent.filter((m) => m.type === 'answer'));
  // The audit log actions are in the ticket's More menu.
  for (const name of ['Show audit log', 'Copy debug bundle']) {
    await rh.getByRole('button', { name: 'More actions' }).click();
    await rh.getByRole('menuitem', { name }).click();
  }
  kb.auditSent = await rh.evaluate(() =>
    window.__sent
      .filter((m) => m.type === 'action' && /^(auditLog|debugBundle)$/.test(m.id))
      .map((m) => m.id)
  );
  // A problem with a long reason: the list shows the short line, and the reason as a tooltip.
  kb.problemRow = await rh.evaluate(() => {
    const row = document.querySelector('[role=option][data-key="PROJ-111"]');
    const ask = row?.querySelector('[title]');
    return ask
      ? { title: ask.getAttribute('title'), height: Math.round(ask.getBoundingClientRect().height) }
      : null;
  });
  await rh.click('[role=option][data-key="PROJ-111"]');
  await rh.waitForTimeout(300);
  await rh.screenshot({ path: path.join(OUT, 'ticket-problem.png') });
  // A build run in progress: the Development tab shows it with Stop, and the running border.
  await rh.click('[role=option][data-key="PROJ-110"]');
  await rh
    .waitForFunction(() => document.getElementById('ttl-key')?.textContent === 'PROJ-110', null, {
      timeout: 3000
    })
    .catch(() => {});
  kb.buildSection = await rh.evaluate(() => {
    const s = document.querySelector('[aria-label="Building now"]');
    return s
      ? {
          text: s.textContent,
          running: s.classList.contains('run-border'),
          now: s.querySelector('[aria-live]')?.textContent
        }
      : null;
  });
  await axe(rh, 'dark/ticket-building');
  await rh.screenshot({ path: path.join(OUT, 'ticket-building.png') });
  // A planning run in progress: the Planning tab says so and offers Stop, not Start.
  await rh.click('[role=option][data-key="PROJ-109"]');
  await rh
    .waitForFunction(() => document.getElementById('ttl-key')?.textContent === 'PROJ-109', null, {
      timeout: 3000
    })
    .catch(() => {});
  kb.runSection = await rh.evaluate(
    () => document.querySelector('[aria-label="Planning now"]')?.textContent ?? null
  );
  kb.runStartHidden = (await rh.getByRole('button', { name: 'Start planning' }).count()) === 0;
  await axe(rh, 'dark/ticket-running');
  await rh.screenshot({ path: path.join(OUT, 'ticket-running.png') });
  await rh.getByRole('button', { name: 'Stop', exact: true }).click();
  kb.runStopSent = await rh.evaluate(
    () => window.__sent.filter((m) => m.type === 'action').at(-1) ?? null
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
    // A running agent: its list row and its "Planning now" section show the travelling border.
    await mp.click('[role=option][data-key="PROJ-109"]');
    await mp.waitForTimeout(400);
    m.runBorders = await mp.evaluate(
      () =>
        document
          .getAnimations()
          .filter((a) => a.animationName === 'runBorder' && a.playState === 'running').length
    );
    m.runBorderVisible = await mp.evaluate(() =>
      [...document.querySelectorAll('.run-border')].map((el) => {
        const bg = getComputedStyle(el, '::before').backgroundImage;
        const color = getComputedStyle(el, '::before').backgroundColor;
        return bg !== 'none' || color !== 'rgba(0, 0, 0, 0)';
      })
    );
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
  // List and rule editors: each edit becomes the field text that Save sends.
  const se = await openSettings('dark', 1100);
  const sentOn = (p, type) => p.evaluate((t) => window.__sent.filter((m) => m.type === t), type);
  await se.getByRole('button', { name: 'Move Verifying up in Finished statuses' }).click();
  const addTo = (name, text) =>
    se
      .getByRole('textbox', { name })
      .fill(text)
      .then(() => se.getByRole('textbox', { name }).press('Enter'));
  await addTo('Add to Blocked statuses', 'Waiting');
  await addTo('Add to Finished statuses', 'Done');
  kb.listDuplicate = await se.getByText('It is in the list already.').count();
  await addTo('Add a branch rule', '^(x');
  kb.ruleInvalid = await se.getByText('This is not a valid regular expression.').count();
  await se.getByRole('textbox', { name: 'Add a branch rule' }).fill('');
  await addTo('Add a branch rule', '^release/');
  await se.getByRole('button', { name: /Status after the merge for \^release\// }).click();
  await se.getByRole('option', { name: 'Done' }).click();
  await se.getByRole('button', { name: 'Remove the rule ^(hotfix|infra)/' }).click();
  await axe(se, 'dark/settings-editors');
  await se.screenshot({ path: path.join(OUT, 'settings-dark-editors.png'), fullPage: true });
  await se.getByRole('button', { name: 'Save', exact: true }).click();
  kb.editorSave = (await sentOn(se, 'saveSettings'))[0]?.texts ?? null;
  await se.close();
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
