import { mdiRefresh } from '@mdi/js';
import { send } from '../utils/vscodeApi';
import { Button } from './Button';
import { Icon } from './Icon';

type Props = { updating?: boolean; label: string };

export function RefreshButton({ updating, label }: Props) {
  return (
    <Button
      variant="ghost"
      className="size-7 justify-center px-0"
      aria-label={label}
      onPress={() => send({ type: 'refresh' })}
    >
      <Icon
        path={mdiRefresh}
        size={15}
        className={
          updating ? 'animate-spin [animation-duration:1.6s] motion-reduce:animate-none' : undefined
        }
      />
    </Button>
  );
}
