import { mdiOpenInNew } from '@mdi/js';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';

type Props = { label: string; onPress: () => void };

/** A small button that opens an address outside the editor. */
export function OpenLinkButton({ label, onPress }: Props) {
  return (
    <Button variant="ghost" className="h-7 px-2" onPress={onPress}>
      {label}
      <Icon path={mdiOpenInNew} size={13} />
    </Button>
  );
}
