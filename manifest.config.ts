import { defineManifest } from '@crxjs/vite-plugin';

const googleClientId = process.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? '';

export default defineManifest({
  manifest_version: 3,
  name: 'Smart Work Tracker',
  description: 'Task tracking with hourly nudges, logs, and analytics.',
  version: '0.0.1',
  permissions: ['storage', 'alarms', 'notifications', 'windows', 'tabs', 'identity'],
  host_permissions: ['https://www.googleapis.com/*', 'https://sheets.googleapis.com/*'],
  ...(googleClientId
    ? {
        oauth2: {
          client_id: googleClientId,
          scopes: [
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/userinfo.email',
          ],
        },
      }
    : {}),
  action: {
    default_popup: 'popup.html',
    default_title: 'Smart Work Tracker',
    default_icon: {
      '16': 'icons/icon-16.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
  },
  options_page: 'options.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  icons: {
    '16': 'icons/icon-16.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  commands: {
    'open-logging-popup': {
      suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Command+Shift+Y' },
      description: 'Open Smart Work Tracker popup',
    },
  },
});
