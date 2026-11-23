import { mdiDotsHorizontal } from '@mdi/js';
import { Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Dot } from '../../shared/components/Dot';
import { Icon } from '../../shared/components/Icon';
import { MENU_ITEM_CLASS, POPOVER_CLASS } from '../../shared/utils/classes';
import { cx } from '../../shared/utils/cx';
import { send } from '../../shared/utils/vscodeApi';
import type { BoardTicket } from '../types/board';
import { statusDot } from '../utils/columns';

type Props = { t: BoardTicket; statuses: string[] };

export function CardMoveMenu({ t, statuses }: Props) {
  return (
    <MenuTrigger>
      <Button
        variant="ghost"
        className="-mr-1.5 size-6 justify-center px-0 opacity-0 group-hover:opacity-100 data-focus-visible:opacity-100 data-pressed:opacity-100"
        aria-label={`Move ${t.key}`}
      >
        <Icon path={mdiDotsHorizontal} size={15} />
      </Button>

      <Popover placement="bottom end" offset={4} className={cx(POPOVER_CLASS, 'min-w-[180px]')}>
        <Menu
          aria-label={`Move ${t.key} to`}
          className="outline-none"
          onAction={(to) => send({ type: 'move', key: t.key, from: t.status, to: String(to) })}
        >
          {statuses
            .filter((s) => s !== t.status)
            .map((s) => (
              <MenuItem key={s} id={s} className={cx(MENU_ITEM_CLASS, 'flex items-center gap-2')}>
                <Dot color={statusDot(s)} />
                Move to {s}
              </MenuItem>
            ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
