const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('confirmHost', {
  state: () => ipcRenderer.invoke('confirm:state'),
  answer: index => ipcRenderer.send('confirm:answer', index),
});
