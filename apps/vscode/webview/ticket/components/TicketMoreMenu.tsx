import { mdiDotsVertical } from '@mdi/js';
import { Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { Button } from '../../shared/components/Button';
import { Icon } from '../../shared/components/Icon';
import { MENU_ITEM_CLASS, POPOVER_CLASS } from '../../shared/utils/classes';
import { cx } from '../../shared/utils/cx';
import { send } from '../../shared/utils/vscodeApi';
import type { Act } from '../types/ticket';
import { TICKET_MENU } from '../utils/menu';

type Props = { act: Act };

export function TicketMoreMenu({ act }: Props) {
  return (
    <MenuTrigger>
      <Button variant="ghost" className="size-7 justify-center px-0" aria-label="More actions">
        <Icon path={mdiDotsVertical} size={16} />
      </Button>

      <Popover placement="bottom end" offset={6} className={cx(POPOVER_CLASS, 'min-w-[200px]')}>
        <Menu
          className="outline-none"
          onAction={(k) => (k === 'openBoard' ? send({ type: 'openBoard' }) : act(String(k)))}
        >
          {TICKET_MENU.map(([id, label]) => (
            <MenuItem key={id} id={id} className={MENU_ITEM_CLASS}>
              {label}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
