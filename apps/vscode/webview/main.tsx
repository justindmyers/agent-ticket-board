import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './app/components/App';
import { SETTINGS } from './app/utils/mode';
import { SettingsPage } from './settings/components/SettingsPage';
import { send } from './shared/utils/vscodeApi';

createRoot(document.getElementById('root')!).render(
  <StrictMode>{SETTINGS ? <SettingsPage /> : <App />}</StrictMode>
);
send({ type: 'ready' });
