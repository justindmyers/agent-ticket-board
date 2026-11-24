import { mdiAlertCircleOutline, mdiCheckCircleOutline } from '@mdi/js';
import { Icon } from '../../shared/components/Icon';
import type { Theme } from '../../shared/types/theme';
import { ink } from '../../shared/utils/surfaces';
import type { SettingsView } from '../../shared/types/settings';

type Props = { checks: SettingsView['checks']; theme: Theme };

export function SignInChecks({ checks, theme }: Props) {
  if (!checks.length) {
    return null;
  }

  return (
    <ul
      aria-label="Sign-in checks"
      className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 px-1"
    >
      {checks.map((c) => (
        <li key={c.name} className="flex items-center gap-1.5 text-[12px] text-soft">
          <Icon
            path={c.ok ? mdiCheckCircleOutline : mdiAlertCircleOutline}
            size={15}
            style={{ color: ink(c.ok ? 'green' : 'red', theme) }}
          />
          <span className="font-medium">{c.name}</span>
          <span className="text-muted">{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}
