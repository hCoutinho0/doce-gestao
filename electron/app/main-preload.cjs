// Ponte entre o painel (página do Confeitto) e o aplicativo de desktop: o
// menu da conta, no canto inferior esquerdo, e a tela "sem conexão" usam
// estas funções. Só expõe ações prontas — nada de acesso a arquivos ou
// comandos.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('confeittoDesktop', {
  versao: () => ipcRenderer.invoke('desktop:versao'),
  procurarAtualizacoes: () => ipcRenderer.invoke('desktop:atualizacoes'),
  reconectar: () => ipcRenderer.invoke('desktop:reconectar'),
});
