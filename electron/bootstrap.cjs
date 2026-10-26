// Confeitto — inicializador.
//
// Esta é a única parte fixa do aplicativo instalado. Ela escolhe qual versão
// do Confeitto rodar: a que veio no instalador ou uma versão mais nova que o
// próprio app baixou do Supabase (em %APPDATA%\Confeitto\atualizacoes).
// Assim, publicar uma alteração não exige reinstalar: na próxima abertura
// (ou ao clicar em "Reiniciar agora") a versão nova já entra.
//
// A versão escolhida fica em global.CONFEITTO, que app/main.cjs usa para
// saber onde estão o servidor, a conexão embutida e a pasta de atualizações.

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.setName('Confeitto');

const bundleDir = __dirname;
const updatesDir = path.join(app.getPath('userData'), 'atualizacoes');

function readVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'versao.json'), 'utf8')).version || null;
  } catch {
    return null;
  }
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

const bundled = {
  appDir: path.join(bundleDir, 'app'),
  serverDir: app.isPackaged
    ? path.join(process.resourcesPath, 'server')
    : path.join(bundleDir, '..', 'desktop-server'),
  version: readVersion(path.join(bundleDir, 'app')) || app.getVersion(),
  source: 'instalador',
};

// Versões baixadas que estão completas e não foram marcadas como quebradas.
function downloadedVersions() {
  let names = [];
  try {
    names = fs.readdirSync(updatesDir);
  } catch {
    return [];
  }
  const result = [];
  for (const name of names) {
    const dir = path.join(updatesDir, name);
    const appDir = path.join(dir, 'app');
    const serverDir = path.join(dir, 'server');
    const version = readVersion(appDir);
    if (!version || version !== name) continue;
    if (fs.existsSync(path.join(dir, 'QUEBRADA'))) continue;
    if (!fs.existsSync(path.join(appDir, 'main.cjs'))) continue;
    if (!fs.existsSync(path.join(serverDir, 'server.js'))) continue;
    result.push({ appDir, serverDir, version, source: 'atualizacao', dir });
  }
  return result;
}

let chosen = bundled;
for (const candidate of downloadedVersions()) {
  if (compareVersions(candidate.version, chosen.version) > 0) chosen = candidate;
}

global.CONFEITTO = {
  ...chosen,
  bundleDir,
  updatesDir,
  installerVersion: app.getVersion(),
  compareVersions,
  fallbackToInstaller() {
    // Uma atualização que falha ao abrir é marcada como quebrada, e a
    // próxima abertura volta para a versão anterior.
    if (chosen.dir) fs.writeFileSync(path.join(chosen.dir, 'QUEBRADA'), new Date().toISOString());
  },
};

try {
  require(path.join(chosen.appDir, 'main.cjs'));
} catch (error) {
  if (chosen === bundled) throw error;
  global.CONFEITTO.fallbackToInstaller();
  global.CONFEITTO = {
    ...bundled,
    bundleDir,
    updatesDir,
    installerVersion: app.getVersion(),
    compareVersions,
    fallbackToInstaller() {},
  };
  require(path.join(bundled.appDir, 'main.cjs'));
}
