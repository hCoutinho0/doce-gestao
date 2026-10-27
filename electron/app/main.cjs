// Confeitto — aplicativo de desktop (Windows).
//
// Este arquivo é o "dono" do aplicativo instalado: ele liga o servidor
// Next.js local (que vem dentro do instalador, em resources\server), espera
// ele responder e abre a janela do Confeitto apontando para ele. Os dados
// ficam no Supabase (URL e chave pedidas na primeira abertura e guardadas em
// %APPDATA%\Confeitto\config.json); uma cópia de segurança vai para
// %APPDATA%\Confeitto\backups uma vez por dia.

const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  dialog,
  ipcMain,
  shell,
} = require('electron');
const { execFile, fork } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const APP_NAME = 'Confeitto';
// Porta fixa: o navegador da janela guarda sessão e preferências por
// endereço (http://127.0.0.1:PORTA), então mudar de porta a cada abertura
// "esqueceria" o login. Só troca se outro programa já estiver usando.
const PREFERRED_PORT = 41730;
const BACKUPS_TO_KEEP = 14;
const REMINDER_HOUR = 8;

app.setName(APP_NAME);
app.setAppUserModelId('br.com.confeitto.app');

// Preenchido por electron/bootstrap.cjs: qual versão está rodando e onde
// ficam o servidor, a conexão embutida e as atualizações baixadas.
const RUNTIME = global.CONFEITTO || {
  appDir: __dirname,
  serverDir: app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(__dirname, '..', '..', 'desktop-server'),
  version: app.getVersion(),
  source: 'instalador',
  bundleDir: path.join(__dirname, '..'),
  updatesDir: path.join(app.getPath('userData'), 'atualizacoes'),
  compareVersions: (a, b) => (a === b ? 0 : a > b ? 1 : -1),
  fallbackToInstaller() {},
};
const APP_VERSION = RUNTIME.version;

const userDir = app.getPath('userData'); // %APPDATA%\Confeitto
const backupDir = path.join(userDir, 'backups');
const logFile = path.join(userDir, 'servidor.log');
const configFile = path.join(userDir, 'config.json');

let mainWindow = null;
let serverProcess = null;
let serverUrl = null;
let quitting = false;
const internalSecret = crypto.randomBytes(32).toString('hex');

// ---------------------------------------------------------------------------
// Configuração persistente (segredo das sessões, último lembrete enviado)
// ---------------------------------------------------------------------------

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfig(config) {
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
}

// Conexão embutida no instalador (electron/conexao.json, gerado a partir do
// .env.local na hora do build). Quem instala não precisa configurar nada.
function bundledConnection() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(RUNTIME.bundleDir, 'conexao.json'), 'utf8'));
    if (data.supabaseUrl && data.supabaseKey) return data;
  } catch {
    // instalador sem conexão embutida
  }
  return null;
}

// Vale a conexão configurada à mão pelo menu; senão, a embutida no
// instalador (assim, ao trocar a chave e reinstalar, a nova já vale).
function getConnection() {
  const config = readConfig();
  if (config.manualConnection && config.supabaseUrl && config.supabaseKey) {
    return { url: config.supabaseUrl, key: config.supabaseKey };
  }
  const bundled = bundledConnection();
  if (bundled) return { url: bundled.supabaseUrl, key: bundled.supabaseKey };
  if (config.supabaseUrl && config.supabaseKey) {
    return { url: config.supabaseUrl, key: config.supabaseKey };
  }
  return null;
}

function getAuthSecret() {
  const config = readConfig();
  if (!config.authSecret) {
    config.authSecret = crypto.randomBytes(48).toString('base64');
    writeConfig(config);
  }
  return config.authSecret;
}

// ---------------------------------------------------------------------------
// Backup diário
// ---------------------------------------------------------------------------

function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function backupFileName(force) {
  if (!force) return `${today()}.json`;
  const time = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
  return `${today()}_${time}.json`;
}

// Baixa todos os dados do Supabase (pela rota interna /api/backup) e guarda
// um JSON por dia em %APPDATA%\Confeitto\backups — mantém os últimos 14.
async function runBackup({ force = false } = {}) {
  if (!serverUrl) throw new Error('O Confeitto ainda está abrindo.');
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, backupFileName(force));
  if (!force && fs.existsSync(target)) return target;
  const response = await fetch(`${serverUrl}/api/backup`, {
    headers: { 'X-Confeitto-Secret': internalSecret },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`o servidor respondeu ${response.status}`);
  fs.writeFileSync(target, await response.text());
  const all = fs
    .readdirSync(backupDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}.*\.json$/.test(name))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - BACKUPS_TO_KEEP))) {
    fs.rmSync(path.join(backupDir, old), { force: true });
  }
  return target;
}

// ---------------------------------------------------------------------------
// Conexão com o Supabase (tela de configuração)
// ---------------------------------------------------------------------------

function normalizeUrl(raw) {
  let url = String(raw || '').trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  // Aceita também o endereço colado com /rest/v1 no fim.
  return url.replace(/\/rest\/v1$/i, '');
}

function supabaseHeaders(key) {
  const headers = { apikey: key };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

// Confere URL, chave, tabela e bucket de fotos. Devolve uma mensagem de
// erro em português, ou null se estiver tudo certo.
async function testSupabase(url, key) {
  if (!/^https:\/\/[^/]+$/i.test(url)) {
    return 'A URL deve ser parecida com https://xxxxxxxx.supabase.co';
  }
  if (key.startsWith('sb_publishable_')) {
    return 'Essa é a chave pública (publishable). Use a chave secreta (secret / service_role).';
  }
  let response;
  try {
    response = await fetch(`${url}/rest/v1/app_state?select=id&limit=1`, {
      headers: supabaseHeaders(key),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return 'Não consegui falar com o Supabase. Confira a URL e a conexão com a internet.';
  }
  if (response.status === 401 || response.status === 403) {
    return 'A chave foi recusada. Confira se copiou a chave secreta inteira.';
  }
  if (response.status === 404 || response.status === 400) {
    const text = await response.text();
    if (/app_state|PGRST205|42P01/.test(text)) {
      return 'O banco ainda não foi preparado: rode o arquivo supabase\\setup.sql no SQL Editor do Supabase e tente de novo.';
    }
    return `O Supabase respondeu ${response.status}: ${text.slice(0, 200)}`;
  }
  if (!response.ok) {
    return `O Supabase respondeu ${response.status}. Se o projeto estiver pausado, entre em supabase.com e clique em "Restore".`;
  }
  try {
    const bucket = await fetch(`${url}/storage/v1/bucket/fotos`, {
      headers: supabaseHeaders(key),
      signal: AbortSignal.timeout(15000),
    });
    if (!bucket.ok) {
      return 'A tabela existe, mas o espaço de fotos não: rode o supabase\\setup.sql inteiro no SQL Editor.';
    }
  } catch {
    return 'Não consegui conferir o espaço de fotos. Tente de novo.';
  }
  return null;
}

let setupWindow = null;

// Abre a tela de configuração e só resolve quando a conexão for salva
// (true) ou cancelada (false).
function showSetup() {
  return new Promise((resolve) => {
    let saved = false;
    setupWindow = new BrowserWindow({
      width: 980,
      height: 640,
      resizable: false,
      title: `${APP_NAME} — Conectar ao banco de dados`,
      icon: path.join(__dirname, 'icon.ico'),
      parent: mainWindow ?? undefined,
      modal: Boolean(mainWindow),
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'setup-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    setupWindow.setMenu(null);

    const cleanup = () => {
      ipcMain.removeHandler('setup:current');
      ipcMain.removeHandler('setup:save');
      ipcMain.removeAllListeners('setup:cancel');
    };
    ipcMain.handle('setup:current', () => {
      const current = getConnection();
      return { url: current?.url || '', hasKey: Boolean(current?.key) };
    });
    ipcMain.handle('setup:save', async (_event, input) => {
      const config = readConfig();
      const url = normalizeUrl(input.url);
      const key = String(input.key || '').trim() || getConnection()?.key || '';
      if (!url || !key) return { ok: false, error: 'Preencha a URL e a chave secreta.' };
      const error = await testSupabase(url, key);
      if (error) return { ok: false, error };
      config.supabaseUrl = url;
      config.supabaseKey = key;
      config.manualConnection = true;
      writeConfig(config);
      saved = true;
      setTimeout(() => setupWindow && setupWindow.close(), 700);
      return { ok: true };
    });
    ipcMain.on('setup:cancel', () => setupWindow && setupWindow.close());

    setupWindow.on('closed', () => {
      setupWindow = null;
      cleanup();
      resolve(saved);
    });
    void setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  });
}

let configuring = false;

// Na primeira abertura (sem URL/chave salvas) mostra a tela de configuração
// antes de abrir a janela principal.
async function ensureSupabaseConfig() {
  if (getConnection()) return true;
  configuring = true;
  try {
    return await showSetup();
  } finally {
    configuring = false;
  }
}

// ---------------------------------------------------------------------------
// Servidor local
// ---------------------------------------------------------------------------

function serverDir() {
  return RUNTIME.serverDir;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

function randomFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function ping(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (serverProcess && serverProcess.exitCode !== null) return false;
    if (await ping(url)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

// O instalador leva as pastas node_modules do servidor com o nome
// node_modules_pacote (veja scripts/preparar-desktop.mjs). Aqui elas voltam
// ao nome original — depois de uma atualização, a versão nova substitui a
// antiga.
function restoreNodeModules(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules_pacote') {
      const target = path.join(dir, 'node_modules');
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(full, target);
      restoreNodeModules(target);
    } else {
      restoreNodeModules(full);
    }
  }
}

async function startServer() {
  const dir = serverDir();
  restoreNodeModules(dir);
  const entry = path.join(dir, 'server.js');
  if (!fs.existsSync(entry)) {
    throw new Error(
      `Servidor não encontrado em ${entry}. Rode "npm run desktop:preparar" antes.`,
    );
  }

  const port = (await isPortFree(PREFERRED_PORT))
    ? PREFERRED_PORT
    : await randomFreePort();
  const url = `http://127.0.0.1:${port}`;

  fs.mkdirSync(userDir, { recursive: true });
  const log = fs.openSync(logFile, 'w');
  const connection = getConnection() || { url: '', key: '' };

  serverProcess = fork(entry, [], {
    cwd: dir,
    stdio: ['ignore', log, log, 'ipc'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      SUPABASE_URL: connection.url,
      SUPABASE_SERVICE_KEY: connection.key,
      CONFEITTO_INTERNAL_SECRET: internalSecret,
      AUTH_SECRET: getAuthSecret(),
      NEXTAUTH_SECRET: getAuthSecret(),
      AUTH_URL: url,
      NEXTAUTH_URL: url,
      AUTH_TRUST_HOST: 'true',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  });

  serverProcess.on('exit', (code) => {
    serverProcess = null;
    // Antes de abrir, quem avisa do erro é startServer (via waitForServer).
    if (!quitting && serverUrl) {
      dialog.showErrorBox(
        APP_NAME,
        `O servidor interno do Confeitto parou (código ${code}).\n\n` +
          `Detalhes em:\n${logFile}\n\nO aplicativo será fechado.`,
      );
      app.quit();
    }
  });

  const ok = await waitForServer(`${url}/login`);
  if (!ok) throw new Error(`O servidor não respondeu. Veja ${logFile}`);
  return url;
}

function stopServer() {
  if (serverProcess) {
    serverProcess.removeAllListeners('exit');
    serverProcess.kill();
    serverProcess = null;
  }
}

// Depois de trocar a conexão, religa o servidor com a configuração nova.
async function restartServer() {
  stopServer();
  serverUrl = null;
  if (mainWindow) void mainWindow.loadURL(LOADING_HTML);
  try {
    serverUrl = await startServer();
  } catch (error) {
    dialog.showErrorBox(APP_NAME, `Não foi possível reiniciar o Confeitto.\n\n${error.message}`);
    app.quit();
    return;
  }
  if (mainWindow) await mainWindow.loadURL(`${serverUrl}/dashboard`);
}

// ---------------------------------------------------------------------------
// Lembrete diário de tarefas (notificação do Windows)
// ---------------------------------------------------------------------------

function fetchPendingTasks() {
  return new Promise((resolve) => {
    const req = http.get(
      `${serverUrl}/api/reminders/daily`,
      { headers: { 'X-Confeitto-Secret': internalSecret } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
  });
}

async function checkReminder() {
  if (!serverUrl || !Notification.isSupported()) return;
  const now = new Date();
  if (now.getHours() < REMINDER_HOUR) return;
  const config = readConfig();
  if (config.lastReminder === today()) return;

  const data = await fetchPendingTasks();
  if (!data) return;
  config.lastReminder = today();
  writeConfig(config);
  if (!data.pending) return;

  const notification = new Notification({
    title: 'Tarefas pendentes',
    body:
      data.pending === 1
        ? `Você tem 1 tarefa pendente: ${data.first}`
        : `Você tem ${data.pending} tarefas pendentes.`,
    icon: path.join(__dirname, 'icon.png'),
  });
  notification.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    void mainWindow.loadURL(`${serverUrl}/dashboard`);
  });
  notification.show();
}

// ---------------------------------------------------------------------------
// Atualização automática
// ---------------------------------------------------------------------------
//
// As versões novas ficam no Supabase Storage, no bucket privado
// "atualizacoes" (publicadas pelo publicar-atualizacao.bat): um manifest.json
// com a versão e um pacote .tgz com app/ e server/. O app confere ao abrir e
// a cada hora; se houver versão nova, baixa, confere o hash, extrai em
// %APPDATA%\Confeitto\atualizacoes\<versão> e pergunta se quer reiniciar.
// Se a pessoa disser "Depois", a versão nova entra na próxima abertura.

const UPDATE_BUCKET = 'atualizacoes';
let updateInProgress = false;
let updateReady = null;

function tarPath() {
  const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return fs.existsSync(systemTar) ? systemTar : 'tar';
}

function extractTgz(file, dest) {
  return new Promise((resolve, reject) => {
    execFile(tarPath(), ['-xzf', file, '-C', dest], { windowsHide: true }, (error) =>
      error ? reject(error) : resolve(),
    );
  });
}

// Apaga versões baixadas mais antigas que a que está rodando e restos de
// downloads interrompidos.
function cleanupOldUpdates() {
  let names = [];
  try {
    names = fs.readdirSync(RUNTIME.updatesDir);
  } catch {
    return;
  }
  for (const name of names) {
    const full = path.join(RUNTIME.updatesDir, name);
    const stale =
      name.endsWith('.tmp') ||
      name.endsWith('.tgz') ||
      (/^\d+\.\d+\.\d+$/.test(name) && RUNTIME.compareVersions(name, APP_VERSION) < 0);
    if (stale) fs.rmSync(full, { recursive: true, force: true });
  }
}

async function askToRestart(version) {
  if (!mainWindow) return;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: APP_NAME,
    message: `A versão ${version} do Confeitto está pronta.`,
    detail: 'Reinicie para usar a versão nova. Se escolher "Depois", ela entra na próxima vez que abrir o app.',
    buttons: ['Reiniciar agora', 'Depois'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) {
    app.relaunch();
    app.quit();
  }
}

// silent: verificação automática (sem avisos quando não há novidade).
async function checkForUpdates({ silent = true } = {}) {
  if (updateInProgress) return;
  if (updateReady) {
    if (!silent) await askToRestart(updateReady);
    return;
  }
  const connection = getConnection();
  if (!connection) return;
  updateInProgress = true;
  const tell = (message) =>
    !silent && dialog.showMessageBox(mainWindow, { type: 'info', title: APP_NAME, message });
  try {
    const base = `${connection.url}/storage/v1/object/${UPDATE_BUCKET}`;
    const headers = supabaseHeaders(connection.key);
    const response = await fetch(`${base}/manifest.json?t=${Date.now()}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      await tell(`Nenhuma atualização publicada ainda (você está na versão ${APP_VERSION}).`);
      return;
    }
    const manifest = await response.json();
    if (!manifest.version || RUNTIME.compareVersions(manifest.version, APP_VERSION) <= 0) {
      await tell(`O Confeitto já está na versão mais nova (${APP_VERSION}).`);
      return;
    }
    // Atualizações que trocam a versão do Electron precisam do instalador.
    if (manifest.electron && manifest.electron !== process.versions.electron) {
      await tell(
        `A versão ${manifest.version} precisa ser instalada pelo instalador novo (Confeitto-Setup.exe).`,
      );
      return;
    }

    fs.mkdirSync(RUNTIME.updatesDir, { recursive: true });
    const target = path.join(RUNTIME.updatesDir, manifest.version);
    if (!fs.existsSync(path.join(target, 'server', 'server.js'))) {
      const download = await fetch(`${base}/${manifest.file}`, {
        headers,
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if (!download.ok) throw new Error(`download ${download.status}`);
      const data = Buffer.from(await download.arrayBuffer());
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      if (manifest.sha256 && hash !== manifest.sha256) throw new Error('arquivo corrompido (hash)');

      const tgz = path.join(RUNTIME.updatesDir, `${manifest.version}.tgz`);
      const tmp = path.join(RUNTIME.updatesDir, `${manifest.version}.tmp`);
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      fs.writeFileSync(tgz, data);
      await extractTgz(tgz, tmp);
      fs.rmSync(tgz, { force: true });
      if (!fs.existsSync(path.join(tmp, 'server', 'server.js')) || !fs.existsSync(path.join(tmp, 'app', 'main.cjs'))) {
        throw new Error('pacote incompleto');
      }
      restoreNodeModules(path.join(tmp, 'server'));
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(tmp, target);
    }
    updateReady = manifest.version;
    await askToRestart(manifest.version);
  } catch (error) {
    console.error('Falha ao atualizar:', error);
    await tell(`Não foi possível baixar a atualização agora.\n\n${error.message}`);
  } finally {
    updateInProgress = false;
  }
}

// ---------------------------------------------------------------------------
// Janela e menu
// ---------------------------------------------------------------------------

const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%;font-family:'Segoe UI',sans-serif;background:#3d1a5c;color:#fff}
  .c{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
  .s{width:42px;height:42px;border:4px solid rgba(255,255,255,.25);border-top-color:#e6cdf2;border-radius:50%;animation:r 1s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
  h1{margin:0;font-size:28px} p{margin:0;opacity:.7}
</style></head><body><div class="c"><h1>Confeitto</h1><div class="s"></div><p>Abrindo…</p></div></body></html>`)}`;

function isInternal(url) {
  return Boolean(serverUrl) && url.startsWith(serverUrl);
}

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Abrir pasta de backups e configuração',
          click: () => void shell.openPath(userDir),
        },
        {
          label: 'Fazer backup agora',
          click: async () => {
            try {
              const target = await runBackup({ force: true });
              void dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: APP_NAME,
                message: `Backup salvo em:\n${target}`,
              });
            } catch (error) {
              dialog.showErrorBox(APP_NAME, `Falha no backup: ${error.message}`);
            }
          },
        },
        {
          label: 'Conexão com o banco de dados…',
          click: async () => {
            if (setupWindow) return setupWindow.focus();
            if (await showSetup()) await restartServer();
          },
        },
        { type: 'separator' },
        {
          label: 'Procurar atualizações',
          click: () => void checkForUpdates({ silent: false }),
        },
        {
          label: `Sobre o Confeitto (versão ${APP_VERSION})`,
          enabled: false,
        },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Recarregar', role: 'reload' },
        { type: 'separator' },
        { label: 'Aumentar zoom', role: 'zoomIn' },
        { label: 'Diminuir zoom', role: 'zoomOut' },
        { label: 'Zoom normal', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Tela cheia', role: 'togglefullscreen' },
        ...(app.isPackaged
          ? []
          : [{ label: 'Ferramentas do desenvolvedor', role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer', role: 'undo' },
        { label: 'Refazer', role: 'redo' },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Colar', role: 'paste' },
        { label: 'Selecionar tudo', role: 'selectAll' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    icon: path.join(__dirname, 'icon.ico'),
    backgroundColor: '#3d1a5c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  const ses = mainWindow.webContents.session;
  ses.setSpellCheckerLanguages(['pt-BR']);
  // O Confeitto não usa câmera, microfone, localização, notificações do site
  // etc. — nega tudo, menos copiar para a área de transferência (botão
  // "Copiar link") e tela cheia.
  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen']);
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  // Downloads só do próprio app (imagens/arquivos que ele gera); nunca de
  // páginas externas.
  ses.on('will-download', (event, item) => {
    const url = item.getURL();
    if (!isInternal(url) && !/^(data|blob):/.test(url)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Links externos (WhatsApp, Instagram, pagamento do Mercado Pago…) abrem
  // no navegador padrão, nunca dentro da janela do aplicativo.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' };
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isInternal(url) || url.startsWith('data:')) return;
    event.preventDefault();
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
  });

  void mainWindow.loadURL(LOADING_HTML);
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    buildMenu();
    if (!(await ensureSupabaseConfig())) {
      app.quit();
      return;
    }
    createWindow();
    try {
      serverUrl = await startServer();
    } catch (error) {
      if (RUNTIME.source === 'atualizacao') {
        // A versão baixada não abriu: marca como quebrada e volta para a
        // anterior automaticamente.
        RUNTIME.fallbackToInstaller();
        dialog.showErrorBox(
          APP_NAME,
          `A versão ${APP_VERSION} não abriu. O Confeitto vai voltar para a versão anterior.\n\n${error.message}`,
        );
        app.relaunch();
        app.quit();
        return;
      }
      dialog.showErrorBox(APP_NAME, `Não foi possível iniciar o Confeitto.\n\n${error.message}`);
      app.quit();
      return;
    }
    if (mainWindow) await mainWindow.loadURL(`${serverUrl}/dashboard`);
    runBackup().catch((error) => console.error('Backup automático falhou:', error));
    try {
      cleanupOldUpdates();
    } catch (error) {
      console.error('Limpeza de atualizações falhou:', error);
    }
    setTimeout(() => void checkForUpdates(), 15000);
    setInterval(() => void checkForUpdates(), 60 * 60 * 1000);
    void checkReminder();
    setInterval(() => void checkReminder(), 10 * 60 * 1000);
  });

  app.on('before-quit', () => {
    quitting = true;
    stopServer();
  });

  app.on('window-all-closed', () => {
    // Fechar só a tela de configuração (com a janela principal escondida)
    // não deve encerrar o app — quem decide é ensureSupabaseConfig.
    if (configuring) return;
    app.quit();
  });
}
