const fs=require('fs');
let s=fs.readFileSync('electron/bootstrap.cjs','utf8');
function rep(a,b){if(!s.includes(a))throw new Error('nao achei '+a.slice(0,60));s=s.replace(a,()=>b);}
rep("// Esta é a única parte fixa do aplicativo instalado. Ela escolhe qual versão\n// do Confeitto rodar: a que veio no instalador ou uma versão mais nova que o\n// próprio app baixou do Supabase (em %APPDATA%\Confeitto\atualizacoes).\n// Assim, publicar uma alteração não exige reinstalar: na próxima abertura\n// (ou ao clicar em \"Reiniciar agora\") a versão nova já entra.\n//\n// A versão escolhida fica em global.CONFEITTO, que app/main.cjs usa para\n// saber onde estão o servidor, a conexão embutida e a pasta de atualizações.",
"// Esta é a única parte fixa do aplicativo instalado. Ela escolhe qual versão\n// da janela do Confeitto rodar: a que veio no instalador ou uma mais nova que\n// o próprio app baixou (em %APPDATA%\Confeitto\atualizacoes). O painel em si\n// roda no site e se atualiza sozinho; isto só muda quando a casca muda.\n//\n// A versão escolhida fica em global.CONFEITTO, que app/main.cjs usa para\n// saber onde estão os arquivos e a pasta de atualizações.");
rep("  appDir: path.join(bundleDir, 'app'),\n  serverDir: app.isPackaged\n    ? path.join(process.resourcesPath, 'server')\n    : path.join(bundleDir, '..', 'desktop-server'),\n","  appDir: path.join(bundleDir, 'app'),\n");
rep("    const appDir = path.join(dir, 'app');\n    const serverDir = path.join(dir, 'server');\n","    const appDir = path.join(dir, 'app');\n");
rep("    if (!fs.existsSync(path.join(serverDir, 'server.js'))) continue;\n","");
rep("result.push({ appDir, serverDir, version, source: 'atualizacao', dir });","result.push({ appDir, version, source: 'atualizacao', dir });");
fs.writeFileSync('electron/bootstrap.cjs',s);
let p=JSON.parse(fs.readFileSync('electron/package.json','utf8'));
p.build.files=['bootstrap.cjs','app/**/*','package.json'];
delete p.build.extraResources;
fs.writeFileSync('electron/package.json',JSON.stringify(p,null,2)+'\n');
