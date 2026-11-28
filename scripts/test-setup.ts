// The tests make real commits and merges. A machine without a git identity, such as a CI runner,
// would refuse them, so the tests bring their own.
process.env.GIT_AUTHOR_NAME = 'Test';
process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
process.env.GIT_COMMITTER_NAME = 'Test';
process.env.GIT_COMMITTER_EMAIL = 'test@example.com';
