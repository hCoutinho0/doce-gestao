// Gera UM instalador: instalador\Confeitto-Setup.exe.
//
// O electron-builder trabalha numa pasta temporária nova a cada vez (o
// Windows às vezes trava arquivos de builds anteriores, como app.asar) e só
// o .exe final é copiado para a pasta "instalador". Para mudanças do dia a
// dia não é preciso gerar instalador: use publicar-atualizacao.bat (os apps
// se atualizam sozinhos).

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'instalador');
const finalName = 'Confeitto-Setup.exe';
const buildDir = path.join(os.tmpdir(), `confeitto-build-${Date.now()}`);

function tryRemove(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
  } catch {
    // arquivo em uso por outro programa — fica para a próxima vez
  }
}

execSync('npm run desktop:preparar', { stdio: 'inherit', cwd: root });
execSync(
  `npx electron-builder --projectDir electron --win nsis --x64 --config.directories.output="${buildDir}"`,
  { stdio: 'inherit', cwd: root },
);

const built = path.join(buildDir, finalName);
if (!fs.existsSync(built)) {
  console.error('\nERRO: o instalador não foi gerado.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
// Deixa a pasta "instalador" só com o instalador novo.
for (const entry of fs.readdirSync(outDir)) tryRemove(path.join(outDir, entry));
try {
  fs.copyFileSync(built, path.join(outDir, finalName));
} catch (error) {
  console.error(
    `\nERRO: não consegui copiar o instalador para a pasta "instalador" (${error.code}).` +
      `\nFeche o Confeitto-Setup.exe se ele estiver aberto e tente de novo.` +
      `\nO instalador gerado está em: ${built}`,
  );
  process.exit(1);
}
tryRemove(buildDir);

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
console.log(`\nInstalador pronto: instalador\\${finalName} (versão ${version})`);
