import { describe, expect, it } from 'vitest';
import type { FieldKind } from './config-fields';
import { checkValue, CONFIG_FIELDS } from './config-fields';
import { formatValue, itemProblem, parseValue } from './field-text';

const RULES = [
  { branch: '^hotfix/', to: null },
  { branch: '^infra/', to: 'Done' }
];

describe('formatValue and parseValue', () => {
  it.each<[FieldKind, unknown, string]>([
    ['text', 'PROJ', 'PROJ'],
    ['optionalText', null, ''],
    ['list', ['To Do', 'In Progress'], 'To Do, In Progress'],
    ['port', 3000, '3000'],
    ['portRange', [3001, 3005], '3001-3005'],
    ['rules', RULES, '^hotfix/ => ask me; ^infra/ => Done']
  ])('turns a %s value into text and back', (kind, value, text) => {
    expect(formatValue(kind, value)).toBe(text);
    expect(parseValue(kind, text)).toEqual(value);
  });

  it('reads loose text the way a person types it', () => {
    expect(parseValue('list', ' To Do ,, Done ')).toEqual(['To Do', 'Done']);
    expect(parseValue('portRange', '3001 - 3005')).toEqual([3001, 3005]);
    expect(parseValue('rules', '^hotfix/ → ; ^infra/ -> Done;')).toEqual(RULES);
    expect(parseValue('optionalText', '  ')).toBeNull();
  });

  it('keeps text that it cannot read, so that the type check reports it', () => {
    expect(parseValue('port', 'abc')).toBe('abc');
    expect(parseValue('portRange', '3001')).toBe('3001');
  });
});

describe('itemProblem', () => {
  it.each([
    ['list', 'In Progress', null],
    ['list', 'Done, really', 'An item cannot contain a comma.'],
    ['list', '  ', 'Type a value first.'],
    ['rules', '^release/', null],
    ['rules', '^a;b', 'A branch pattern cannot contain ; or =>.'],
    ['rules', '^a => b', 'A branch pattern cannot contain ; or =>.'],
    ['rules', '^(release', 'This is not a valid regular expression.']
  ] as const)('checks a %s item %j before it goes into the text', (kind, item, problem) => {
    expect(itemProblem(kind, item)).toBe(problem);
  });
});

describe('the rules check', () => {
  const rules = CONFIG_FIELDS.find((f) => f.kind === 'rules')!;

  it('refuses a branch pattern that is not a regular expression', () => {
    expect(checkValue(rules, [{ branch: '^(release', to: null }])).toMatch(/regular expression/);
    expect(checkValue(rules, [{ branch: '^release/', to: 'Done' }])).toBeNull();
  });
});
