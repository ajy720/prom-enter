import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import process from 'node:process';

const backend = path.resolve(import.meta.dirname, '../backend');
const python = process.env.PROM_TEST_PYTHON ?? path.join(backend, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(import.meta.dirname, 'node_modules/.cache/ms-playwright');
export default defineConfig({
  testDir: './e2e', timeout: 120000, expect: {timeout:10000}, workers: 1, retries: 0,
  use: {actionTimeout:10000,baseURL:'http://127.0.0.1:5179', channel:process.env.PROM_TEST_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chromium'), trace:'retain-on-failure', screenshot:'only-on-failure', reducedMotion:'reduce'},
  projects: [
    {name:'desktop', use:{...devices['Desktop Chrome'], viewport:{width:1440,height:1000}}},
    {name:'mobile', use:{...devices['Pixel 7']}},
  ],
  webServer: [
    {command:`"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 18000`, cwd:backend, url:'http://127.0.0.1:18000/api/health',
      env:{PYTHONUTF8:'1',AI_PROVIDER:'demo',DATABASE_PATH:path.join(backend,'data','playthrough-e2e.sqlite3')}, reuseExistingServer:false, timeout:30000},
    {command:'npm run build && npm run preview -- --port 5179', url:'http://127.0.0.1:5179',
      env:{PROM_API_TARGET:'http://127.0.0.1:18000'}, reuseExistingServer:false, timeout:60000},
  ],
});
