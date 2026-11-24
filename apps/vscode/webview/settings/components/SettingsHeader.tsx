import {
  mdiAutoFix,
  mdiContentSaveOutline,
  mdiFileDocumentEditOutline,
  mdiRobotOutline
} from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { PALETTE } from '@agent-ticket-board/core/look';
import { send } from '../../shared/utils/vscodeApi';
import type { Detecting } from '../../shared/types/settings';

type Props = {
  file?: string;
  detecting: Detecting;
  onDetect: () => void;
  count: number;
  onSave: () => void;
};

export function SettingsHeader({ file, detecting, onDetect, count, onSave }: Props) {
  return (
    <header className="flex flex-wrap items-start gap-3 px-1">
      <div className="flex min-w-0 grow basis-[320px] flex-col gap-0.5">
        <h2 className="m-0 text-[20px] leading-tight font-semibold tracking-tight text-ink">
          Settings
        </h2>
        <span className="text-[12px] [overflow-wrap:anywhere] text-muted">
          {file ? `Saved in ${file}. Nothing changes until you press Save.` : 'Loading…'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button isDisabled={!!detecting} onPress={onDetect}>
          <Icon path={mdiAutoFix} size={15} />
          {detecting === 'all' ? 'Detecting…' : 'Detect values'}
        </Button>
        <Button onPress={() => send({ type: 'setupWithClaude' })}>
          <Icon path={mdiRobotOutline} size={15} />
          Set up with Claude
        </Button>
        <Button variant="ghost" onPress={() => send({ type: 'openConfigFile' })}>
          <Icon path={mdiFileDocumentEditOutline} size={15} />
          Open file
        </Button>
        <Button variant="primary" tone={PALETTE.blue.hex} isDisabled={!count} onPress={onSave}>
          <Icon path={mdiContentSaveOutline} size={15} />
          {count ? `Save ${count}` : 'Save'}
        </Button>
      </div>
    </header>
  );
}
