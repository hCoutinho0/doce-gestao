// Ponte entre o painel (página do Confeitto) e o aplicativo de desktop: o
// menu da conta, no canto inferior esquerdo, usa estas funções no lugar do
// menu "Arquivo" do Windows. Só expõe ações prontas — nada de acesso a
// arquivos ou comandos.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('confeittoDesktop', {
  versao: () => ipcRenderer.invoke('desktop:versao'),
  procurarAtualizacoes: () => ipcRenderer.invoke('desktop:atualizacoes'),
});
