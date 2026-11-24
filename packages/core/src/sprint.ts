import { isEqual } from 'lodash-es';
import { CACHE_FILE } from './paths';
import { readJson, writeJson } from './files';
import { details, listSprint } from './jira';
import type { Ticket } from './types';

export type Snapshot = { at: string | null; tickets: Ticket[] };

export const readCache = () => readJson<Snapshot>(CACHE_FILE, { at: null, tickets: [] });

/**
 * Stale-while-revalidate. The caller shows the cache at once. This gets the list (fast), keeps the
 * cached details so points and descriptions stay visible, then refreshes the details one by one.
 */
export async function refreshSprint(
  emit: (s: Snapshot & { pending: number }) => void
): Promise<Snapshot> {
  const old = await readCache();
  const byKey = new Map(old.tickets.map((t) => [t.key, t]));
  const list = await listSprint();
  let tickets: Ticket[] = list.map((t) => ({
    ...byKey.get(t.key),
    ...t,
    points: byKey.get(t.key)?.points ?? null
  }));
  let pending = tickets.length;
  emit({ at: old.at, tickets, pending });
  let timer: NodeJS.Timeout | undefined;
  const flush = () => {
    timer = undefined;
    emit({ at: old.at, tickets, pending });
  };
  await details(
    tickets.map((t) => t.key),
    (d) => {
      tickets = tickets.map((t) => (t.key === d.key ? d : t));
      pending--;
      if (!timer) {
        timer = setTimeout(flush, 250);
      }
    }
  );
  if (timer) {
    clearTimeout(timer);
  }
  const snap = { at: new Date().toISOString(), tickets };
  await writeJson(CACHE_FILE, snap);
  emit({ ...snap, pending: 0 });
  return snap;
}

/**
 * Writes one freshly fetched ticket into the sprint cache, so the list agrees with the detail view.
 * Returns true when the cache changed. A ticket that is not in the sprint is left out.
 */
export async function rememberTicket(fresh: Ticket): Promise<boolean> {
  const snap = await readCache();
  const old = snap.tickets.find((t) => t.key === fresh.key);
  if (!old || isEqual(old, fresh)) {
    return false;
  }
  const tickets = snap.tickets.map((t) => (t.key === fresh.key ? fresh : t));
  await writeJson(CACHE_FILE, { ...snap, tickets });
  return true;
}
