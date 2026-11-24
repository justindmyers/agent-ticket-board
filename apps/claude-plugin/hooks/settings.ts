type Confidence = 'high' | 'medium' | 'low';
type Field = {
  key: string;
  label: string;
  help: string;
  text: string;
  source: 'config' | 'default';
  proposal?: { text: string; source: string; confidence: Confidence; same: boolean };
};
type Section = { id: string; title: string; fields: Field[] };
type View = {
  file: string;
  sections: Section[];
  gaps: { key: string; files: string[] }[];
  checks: { name: string; ok: boolean; detail: string }[];
};
type SaveResult = { saved: string[]; errors: Record<string, string> };
type Run = <T>(args: string[]) => Promise<T>;
type Make = (props: Record<string, unknown>) => unknown;
type Ui = { Box: Make; Text: Make; Button: Make; Input: Make };

const DETECTABLE = ['tracker', 'repo'];
const GREEN = '#1EC46E';
const RED = '#FA4045';
const AMBER = '#FFBE0C';

export const settings = {
  open: false,
  view: null as View | null,
  drafts: {} as Record<string, string>,
  errors: {} as Record<string, string>,
  detecting: null as string | null,
  error: ''
};

const fieldsOf = (v: View | null) => v?.sections.flatMap((s) => s.fields) ?? [];

const changed = () =>
  Object.fromEntries(
    Object.entries(settings.drafts).filter(
      ([k, t]) => fieldsOf(settings.view).find((f) => f.key === k)?.text !== t
    )
  );

// Keeps the detected values of the sections that did not run again.
function merge(before: View | null, next: View, only?: string): View {
  if (!before || only === 'all') {
    return next;
  }
  const old = new Map(fieldsOf(before).map((f) => [f.key, f.proposal]));
  return {
    ...next,
    sections: next.sections.map((s) =>
      s.id === only
        ? s
        : {
            ...s,
            fields: s.fields.map((f) => {
              const p = f.proposal ?? old.get(f.key);
              return p ? { ...f, proposal: { ...p, same: p.text === f.text } } : f;
            })
          }
    ),
    gaps: only === 'repo' ? next.gaps : before.gaps,
    checks: before.checks
  };
}

export async function loadSettings(run: Run, redraw: () => void, only?: string) {
  settings.detecting = only ?? null;
  settings.error = '';
  redraw();
  const args = !only
    ? ['settings']
    : only === 'all'
      ? ['settings', '--detect']
      : ['settings', '--detect', `--only=${only}`];
  try {
    settings.view = merge(settings.view, await run<View>(args), only);
  } catch (e) {
    settings.error = e instanceof Error ? e.message : String(e);
  }
  settings.detecting = null;
  redraw();
}

async function save(run: Run, redraw: () => void) {
  const texts = changed();
  const r = await run<SaveResult>(['settings', 'save', JSON.stringify(texts)]);
  for (const k of r.saved) {
    delete settings.drafts[k];
  }
  settings.errors = r.errors;
  await loadSettings(run, redraw);
}

function fieldRows(ui: Ui, f: Field, view: View, redraw: () => void, run: Run) {
  const { Box, Text, Button, Input } = ui;
  const value = settings.drafts[f.key] ?? f.text;
  const dirty = value !== f.text;
  const p = f.proposal;
  const gap = view.gaps.find((g) => g.key === f.key);
  const rows: unknown[] = [
    Box({
      key: `head-${f.key}`,
      flexDirection: 'row',
      columnGap: 1,
      children: [
        Text({ key: 'l', weight: 'semibold', children: [f.label] }),
        Text({
          key: 's',
          dimColor: true,
          children: [dirty ? 'Not saved' : f.source === 'config' ? 'Your config' : 'Default']
        })
      ]
    }),
    Input({
      key: `field-${f.key}`,
      label: f.label,
      placeholder: 'Empty',
      value,
      submitLabel: 'save',
      onInput: (v: string) => {
        settings.drafts[f.key] = v;
        redraw();
      },
      onSubmit: (v: string) => {
        settings.drafts[f.key] = v;
        void save(run, redraw);
      }
    }),
    Text({ key: `help-${f.key}`, dimColor: true, wrap: 'wrap', children: [f.help] })
  ];
  if (settings.errors[f.key]) {
    rows.push(
      Text({ key: `err-${f.key}`, color: RED, wrap: 'wrap', children: [settings.errors[f.key]] })
    );
  }
  if (p && (p.same || p.text === value)) {
    rows.push(
      Text({ key: `same-${f.key}`, dimColor: true, children: ['✓ Same as the detected value'] })
    );
  } else if (p) {
    rows.push(
      Box({
        key: `prop-${f.key}`,
        flexDirection: 'row',
        columnGap: 1,
        flexWrap: 'wrap',
        children: [
          Text({
            key: 't',
            dimColor: true,
            wrap: 'wrap',
            children: [`Detected: ${p.text || '(empty)'}`]
          }),
          Text({
            key: 'c',
            color: p.confidence === 'high' ? GREEN : p.confidence === 'medium' ? AMBER : undefined,
            dimColor: p.confidence === 'low',
            children: [`${p.confidence} confidence`]
          }),
          Text({ key: 's', dimColor: true, children: [`from ${p.source}`] }),
          Button({
            key: `use-${f.key}`,
            label: 'Use',
            onPress: () => {
              settings.drafts[f.key] = p.text;
              redraw();
            }
          })
        ]
      })
    );
  }
  if (gap) {
    rows.push(
      Text({
        key: `gap-${f.key}`,
        dimColor: true,
        wrap: 'wrap',
        children: [`Type /atb-setup and Claude fills this from ${gap.files.join(', ')}.`]
      })
    );
  }
  return rows;
}

export function renderSettings(
  ui: Ui,
  run: Run,
  redraw: () => void,
  back: () => void,
  toast: (text: string) => void
) {
  const { Box, Text, Button } = ui;
  const view = settings.view;
  const busy = (id: string) => settings.detecting === 'all' || settings.detecting === id;
  const n = Object.keys(changed()).length;
  const top = [
    Button({ key: 'settings-back', label: '← My sprint', plain: true, onPress: back }),
    Text({ key: 'title', weight: 'semibold', children: ['Settings'] }),
    Text({
      key: 'file',
      dimColor: true,
      wrap: 'wrap',
      children: [view ? `Saved in ${view.file}. Nothing changes until you save.` : 'Loading…']
    }),
    Box({
      key: 'actions',
      flexDirection: 'row',
      columnGap: 1,
      flexWrap: 'wrap',
      children: [
        Button({
          key: 'detect-all',
          label: settings.detecting === 'all' ? 'Detecting…' : 'Detect values',
          variant: 'primary',
          onPress: () => void loadSettings(run, redraw, 'all')
        }),
        Text({
          key: 'claude',
          dimColor: true,
          children: ['Or type /atb-setup to set up with Claude.']
        }),
        Button({
          key: 'settings-save',
          label: n ? `Save ${n}` : 'Save',
          variant: n ? 'primary' : 'secondary',
          onPress: () => (n ? void save(run, redraw) : toast('No changes to save.'))
        })
      ]
    }),
    ...(settings.error
      ? [Text({ key: 'error', color: RED, wrap: 'wrap', children: [settings.error] })]
      : []),
    ...(view?.checks ?? []).map((c) =>
      Text({
        key: `check-${c.name}`,
        color: c.ok ? GREEN : RED,
        wrap: 'wrap',
        children: [`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`]
      })
    )
  ];
  const sections = (view?.sections ?? []).flatMap((s) => [
    Text({ key: `rule-${s.id}`, dimColor: true, wrap: 'clip', children: ['─'.repeat(40)] }),
    Box({
      key: `sec-${s.id}`,
      flexDirection: 'row',
      justifyContent: 'space-between',
      children: [
        Text({ key: 't', weight: 'semibold', children: [s.title] }),
        ...(DETECTABLE.includes(s.id)
          ? [
              Button({
                key: `detect-${s.id}`,
                label: busy(s.id) ? 'Detecting…' : 'Detect again',
                plain: true,
                onPress: () => void loadSettings(run, redraw, s.id)
              })
            ]
          : [])
      ]
    }),
    ...s.fields.flatMap((f) => fieldRows(ui, f, view!, redraw, run))
  ]);
  const bar = n
    ? [
        Box({
          key: 'save-bar',
          flexDirection: 'row',
          columnGap: 1,
          children: [
            Text({ key: 'n', children: [n === 1 ? '1 unsaved change' : `${n} unsaved changes`] }),
            Button({
              key: 'settings-discard',
              label: 'Discard',
              onPress: () => {
                settings.drafts = {};
                settings.errors = {};
                redraw();
              }
            })
          ]
        })
      ]
    : [];
  return Box({ flexDirection: 'column', rowGap: 'sm', children: [...top, ...bar, ...sections] });
}
