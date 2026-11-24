import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// One heavy command (type check, lint, tests, build) at a time on this computer, across every agent
// session: several at once make the developer's laptop slow. A lock folder: mkdir is atomic.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Options = { waitMs?: number; pollMs?: number; staleMs?: number };

/** Waits for the lock, up to `waitMs`. False when another owner still has it. */
export async function acquireHeavy(lock: string, owner: string, o: Options = {}) {
  const { waitMs = 30 * 60_000, pollMs = 2000, staleMs = 20 * 60_000 } = o;
  const end = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(lock);
      writeFileSync(join(lock, 'owner'), owner);
      return true;
    } catch {
      // Held: take it over when its owner left it behind, for example after a crash.
      try {
        if (Math.max(0, Date.now() - statSync(lock).mtimeMs) >= staleMs) {
          rmSync(lock, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
    }
    if (Date.now() >= end) {
      return false;
    }
    await sleep(pollMs);
  }
}

/** Releases the lock when `owner` has it. */
export function releaseHeavy(lock: string, owner: string) {
  try {
    if (readFileSync(join(lock, 'owner'), 'utf8') === owner) {
      rmSync(lock, { recursive: true, force: true });
    }
  } catch {
    // Not held, or held by another owner.
  }
}
