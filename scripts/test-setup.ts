import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The tests make real commits and merges. A machine without a git identity, such as a CI runner,
// would refuse them, so the tests bring their own.
process.env.GIT_AUTHOR_NAME = 'Test';
process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
process.env.GIT_COMMITTER_NAME = 'Test';
process.env.GIT_COMMITTER_EMAIL = 'test@example.com';

// A test must never write to the developer's own board. Each test file gets a folder of its own,
// unless the file sets one itself before it loads the board.
if (!process.env.ATB_HOME) {
  process.env.ATB_HOME = mkdtempSync(join(tmpdir(), 'atb-test-home-'));
}
