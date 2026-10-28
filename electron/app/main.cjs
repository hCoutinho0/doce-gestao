// Confeitto — aplicativo de desktop (Windows).
//
// É só uma janela para o Confeitto que roda na internet (APP_URL): não leva
// servidor, banco nem chave dentro — quem acessa o banco é o site, que guarda
// as chaves no servidor. Por isso o painel se atualiza sozinho (a cada
// publicação no site) e o instalador quase nunca muda.
//
// O que o aplicativo faz além de mostrar o site: backup diário da confeitaria
// em %APPDATA%\Confeitto\backups (e uma cópia no OneDrive), lembrete diário
// de tarefas pendentes (notificação do Windows) e atualização da própria
// janela (esta casca), quando um dia for preciso.

const {
  app,
  BrowserWindow,
  Menu,
  Notification,
  dialog,
  ipcMain,
  shell,
} = require('electron');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const APP_NAME = 'Confeitto';
const DEFAULT_APP_URL = 'https://www.confeitto.com.br';
// Onde ficam as versões novas desta casca (bucket público do Supabase; não
// tem segredo nenhum — o conteúdo é só o código da janela).
const DEFAULT_UPDATE_BASE =
  'https://ievasjzblldpciokznel.supabase.co/storage/v1/object/public/atualizacoes';
const BACKUPS_TO_KEEP = 14;
const REMINDER_HOUR = 8;

app.setName(APP_NAME);
app.setAppUserModelId('br.com.confeitto.app');

// Preenchido por electron/bootstrap.cjs: qual versão está rodando e onde
// ficam as atualizações baixadas.
const RUNTIME = global.CONFEITTO || {
  appDir: __dirname,
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
const configFile = path.join(userDir, 'config.json');

let mainWindow = null;
let appUrl = DEFAULT_APP_URL;
let quitting = false;

// ---------------------------------------------------------------------------
// Configuração (endereço do site, último lembrete, pasta extra de backup)
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

// Versões antigas (até 2.x) guardavam a chave do banco neste computador e
// dentro do instalador. Esta casca não usa nada disso: apaga o que sobrou.
function removeLegacySecrets() {
  const config = readConfig();
  const legacy = ['supabaseUrl', 'supabaseKey', 'manualConnection', 'authSecret'];
  if (legacy.some((key) => key in config)) {
    for (const key of legacy) delete config[key];
    writeConfig(config);
  }
  for (const file of [
    path.join(RUNTIME.bundleDir, 'conexao.json'),
    path.join(userDir, 'servidor.log'),
  ]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // arquivo em uso: fica para a próxima abertura
    }
  }
}

function loadAppUrl() {
  // Em desenvolvimento (npm run desktop:abrir) dá para apontar para o servidor
  // local com CONFEITTO_APP_URL=http://localhost:3000.
  const configured = String(
    (!app.isPackaged && process.env.CONFEITTO_APP_URL) || readConfig().appUrl || '',
  )
    .trim()
    .replace(/\/+$/, '');
  // Só endereço https (o painel guarda senhas e dados da confeitaria); http
  // apenas para localhost, fora do aplicativo instalado.
  const ok =
    /^https:\/\/[^/\s]+$/i.test(configured) ||
    (!app.isPackaged && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured));
  if (ok) appUrl = configured;
}

function isInternal(url) {
  try {
    return new URL(url).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Backup diário
// ---------------------------------------------------------------------------

function pad(n) {
  return String(n).padStart(2, '0');
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function backupFileName(force) {
  if (!force) return `${today()}.json`;
  const now = new Date();
  return `${today()}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.json`;
}

// Pasta do OneDrive para uma segunda cópia do backup: a do computador pode
// morrer junto com o PC. Usa "Confeitto\backups" dentro do OneDrive
// (detectado pelas variáveis do Windows) ou a que estiver em
// `pastaBackupExtra` no config.json. Sem OneDrive, fica só a cópia local.
function extraBackupDir() {
  const config = readConfig();
  if (config.pastaBackupExtra) return String(config.pastaBackupExtra);
  const root = process.env.OneDrive || process.env.OneDriveConsumer || process.env.OneDriveCommercial;
  return root && fs.existsSync(root) ? path.join(root, 'Confeitto', 'backups') : null;
}

// Mantém só os últimos BACKUPS_TO_KEEP arquivos de uma pasta de backups.
function pruneBackups(dir) {
  const all = fs
    .readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}.*\.json$/.test(name))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - BACKUPS_TO_KEEP))) {
    fs.rmSync(path.join(dir, old), { force: true });
  }
}

function copyToExtra(target, extraDir, extraTarget) {
  try {
    fs.mkdirSync(extraDir, { recursive: true });
    fs.copyFileSync(target, extraTarget);
    pruneBackups(extraDir);
    return extraTarget;
  } catch (error) {
    console.error('Cópia do backup para o OneDrive falhou:', error);
    return null;
  }
}

// Pede ao site a cópia de todos os dados da confeitaria (com a sessão de
// quem está logado na janela), guarda um JSON por dia e uma segunda cópia no
// OneDrive. `extra` é null se não há OneDrive ou se a cópia falhou. Devolve
// null quando ninguém está logado.
async function runBackup({ force = false } = {}) {
  if (!mainWindow) throw new Error('A janela do Confeitto não está aberta.');
  fs.mkdirSync(backupDir, { recursive: true });
  const name = backupFileName(force);
  const target = path.join(backupDir, name);
  const extraDir = extraBackupDir();
  const extraTarget = extraDir ? path.join(extraDir, name) : null;
  if (!force && fs.existsSync(target)) {
    // Já tem o de hoje; se o OneDrive ainda não tem a cópia, completa.
    const extra =
      extraTarget && !fs.existsSync(extraTarget)
        ? copyToExtra(target, extraDir, extraTarget)
        : extraTarget && fs.existsSync(extraTarget)
          ? extraTarget
          : null;
    return { target, extra };
  }
  const response = await mainWindow.webContents.session.fetch(`${appUrl}/api/backup`, {
    credentials: 'include',
    signal: AbortSignal.timeout(120000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`o servidor respondeu ${response.status}`);
  fs.writeFileSync(target, await response.text());
  pruneBackups(backupDir);
  return { target, extra: extraTarget ? copyToExtra(target, extraDir, extraTarget) : null };
}

async function backupComAviso() {
  try {
    const result = await runBackup({ force: true });
    if (!result) {
      await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: APP_NAME,
        message: 'Entre na sua conta (administrador) para fazer o backup.',
      });
      return;
    }
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: APP_NAME,
      message: `Backup salvo em:\n${result.target}`,
      detail: result.extra
        ? `Cópia no OneDrive:\n${result.extra}`
        : 'Sem cópia no OneDrive (a pasta do OneDrive não foi encontrada).',
    });
  } catch (error) {
    dialog.showErrorBox(APP_NAME, `Falha no backup: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Lembrete diário de tarefas (notificação do Windows)
// ---------------------------------------------------------------------------

async function checkReminder() {
  if (!mainWindow || !Notification.isSupported()) return;
  if (new Date().getHours() < REMINDER_HOUR) return;
  const config = readConfig();
  if (config.lastReminder === today()) return;

  let data = null;
  try {
    const response = await mainWindow.webContents.session.fetch(`${appUrl}/api/reminders/daily`, {
      credentials: 'include',
      signal: AbortSignal.timeout(20000),
    });
    if (response.ok) data = await response.json();
  } catch {
    // sem internet agora: tenta de novo daqui a pouco
  }
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
    void mainWindow.loadURL(`${appUrl}/dashboard`);
  });
  notification.show();
}

// ---------------------------------------------------------------------------
// Atualização da casca (a janela). O painel em si se atualiza sozinho pelo site.
// ---------------------------------------------------------------------------
//
// Cada versão é um manifest.json (versão, arquivo e hash) e um pacote .tgz com
// a pasta app/. O app confere ao abrir e a cada hora; se houver versão nova,
// baixa, confere o hash, extrai em %APPDATA%\Confeitto\atualizacoes\<versão> e
// pergunta se quer reiniciar. Com "Depois", a versão nova entra na próxima
// abertura.

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
    message: `A versão ${version} do aplicativo Confeitto está pronta.`,
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
  updateInProgress = true;
  const tell = (message) =>
    !silent && mainWindow && dialog.showMessageBox(mainWindow, { type: 'info', title: APP_NAME, message });
  try {
    const base = String(readConfig().updateBase || DEFAULT_UPDATE_BASE).replace(/\/+$/, '');
    const response = await fetch(`${base}/manifest.json?t=${Date.now()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      await tell(`Nenhuma atualização do aplicativo publicada (versão ${APP_VERSION}).`);
      return;
    }
    const manifest = await response.json();
    // Versão e nome do arquivo viram caminho de pasta e endereço de download:
    // só formatos conhecidos, e o hash é obrigatório (sem ele não há como
    // saber se o pacote veio como foi publicado).
    if (
      !/^\d+\.\d+\.\d+$/.test(String(manifest.version)) ||
      !/^[\w.-]+\.tgz$/.test(String(manifest.file)) ||
      !/^[0-9a-f]{64}$/.test(String(manifest.sha256))
    ) {
      throw new Error('manifesto de atualização inválido');
    }
    if (RUNTIME.compareVersions(manifest.version, APP_VERSION) <= 0) {
      await tell(`O aplicativo Confeitto já está na versão mais nova (${APP_VERSION}).`);
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
    if (!fs.existsSync(path.join(target, 'app', 'main.cjs'))) {
      const download = await fetch(`${base}/${manifest.file}`, {
        signal: AbortSignal.timeout(10 * 60 * 1000),
      });
      if (!download.ok) throw new Error(`download ${download.status}`);
      const data = Buffer.from(await download.arrayBuffer());
      const hash = crypto.createHash('sha256').update(data).digest('hex');
      if (hash !== manifest.sha256) throw new Error('arquivo corrompido (hash)');

      const tgz = path.join(RUNTIME.updatesDir, `${manifest.version}.tgz`);
      const tmp = path.join(RUNTIME.updatesDir, `${manifest.version}.tmp`);
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(tmp, { recursive: true });
      fs.writeFileSync(tgz, data);
      await extractTgz(tgz, tmp);
      fs.rmSync(tgz, { force: true });
      if (!fs.existsSync(path.join(tmp, 'app', 'main.cjs'))) throw new Error('pacote incompleto');
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
  html,body{margin:0;height:100%;font-family:'Segoe UI',sans-serif;background:#6A3F7D;color:#fff}
  .c{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
  .s{width:42px;height:42px;border:4px solid rgba(255,255,255,.25);border-top-color:#e6cdf2;border-radius:50%;animation:r 1s linear infinite}
  @keyframes r{to{transform:rotate(360deg)}}
  h1{margin:0;font-size:28px} p{margin:0;opacity:.7}
</style></head><body><div class="c"><h1>Confeitto</h1><div class="s"></div><p>Abrindo…</p></div></body></html>`)}`;

function openApp() {
  if (mainWindow) void mainWindow.loadURL(`${appUrl}/dashboard`);
}

// Ações que o menu da conta (canto inferior esquerdo do painel) e a tela
// "sem conexão" chamam pela ponte main-preload.cjs. Só respondem à própria
// página do Confeitto (ou à tela local de "sem conexão").
function registrarPonteDesktop() {
  const permitido = (event) => {
    const url = event.senderFrame?.url ?? '';
    return isInternal(url) || url.startsWith('file:');
  };
  const handlers = {
    'desktop:versao': () => APP_VERSION,
    'desktop:atualizacoes': () => checkForUpdates({ silent: false }),
    'desktop:reconectar': () => openApp(),
  };
  for (const [canal, acao] of Object.entries(handlers)) {
    ipcMain.removeHandler(canal);
    ipcMain.handle(canal, async (event) => {
      if (!permitido(event)) throw new Error('origem não permitida');
      return acao();
    });
  }
}

function buildMenu() {
  const template = [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Abrir pasta de backups',
          click: () => {
            fs.mkdirSync(backupDir, { recursive: true });
            void shell.openPath(backupDir);
          },
        },
        { label: 'Fazer backup agora', click: () => void backupComAviso() },
        { type: 'separator' },
        {
          label: 'Procurar atualizações do aplicativo',
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
    backgroundColor: '#6A3F7D',
    // Sem barra de menu (nem com Alt): tudo fica no menu da conta, no canto
    // inferior esquerdo do painel. O menu continua definido só pelos atalhos
    // (Ctrl+C, Ctrl+R, zoom…).
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'main-preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: true,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  registrarPonteDesktop();
  const ses = mainWindow.webContents.session;
  ses.setSpellCheckerLanguages(['pt-BR']);
  // O Confeitto não usa câmera, microfone, localização etc. — nega tudo,
  // menos copiar para a área de transferência (botão "Copiar link"), tela
  // cheia e notificações (aviso de pedido novo).
  const allowed = new Set(['clipboard-sanitized-write', 'fullscreen', 'notifications']);
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  // Downloads só do próprio site (relatórios, backups); nunca de páginas
  // externas.
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
    if (isInternal(url) || url.startsWith('data:') || url.startsWith('file:')) return;
    event.preventDefault();
    if (/^https?:|^mailto:/.test(url)) void shell.openExternal(url);
  });
  // Sem internet (ou site fora do ar): tela própria com "Tentar de novo".
  mainWindow.webContents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !isInternal(url)) return; // -3: navegação cancelada
    void mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  });

  void mainWindow.loadURL(LOADING_HTML).then(openApp);
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

  app.on('before-quit', () => {
    quitting = true;
  });

  app.whenReady().then(() => {
    removeLegacySecrets();
    loadAppUrl();
    buildMenu();
    createWindow();
    // Backup assim que o painel abre logado e depois a cada 6 horas (o de
    // cada dia só é gravado uma vez).
    mainWindow.webContents.on('did-finish-load', () => {
      if (quitting || !isInternal(mainWindow.webContents.getURL())) return;
      if (!mainWindow.webContents.getURL().includes('/dashboard')) return;
      runBackup().catch((error) => console.error('Backup automático falhou:', error));
    });
    setInterval(() => {
      if (mainWindow) runBackup().catch((error) => console.error('Backup automático falhou:', error));
    }, 6 * 60 * 60 * 1000);
    try {
      cleanupOldUpdates();
    } catch (error) {
      console.error('Limpeza de atualizações falhou:', error);
    }
    setTimeout(() => void checkForUpdates(), 15000);
    setInterval(() => void checkForUpdates(), 60 * 60 * 1000);
    setTimeout(() => void checkReminder(), 20000);
    setInterval(() => void checkReminder(), 10 * 60 * 1000);
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
