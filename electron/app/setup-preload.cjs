// Ponte mínima entre a tela de configuração (setup.html) e o aplicativo.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('confeitto', {
  current: () => ipcRenderer.invoke('setup:current'),
  testAndSave: (url, key) => ipcRenderer.invoke('setup:save', { url, key }),
  cancel: () => ipcRenderer.send('setup:cancel'),
});
