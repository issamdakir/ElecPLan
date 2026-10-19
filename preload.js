const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  openProject: () => ipcRenderer.invoke('file:open'),
  saveProject: (o) => ipcRenderer.invoke('file:save', o),
  pickImage: () => ipcRenderer.invoke('file:image'),
  saveText: (o) => ipcRenderer.invoke('file:saveText', o),
  exportPDF: (o) => ipcRenderer.invoke('pdf:export', o),
  openPath: (p) => ipcRenderer.invoke('shell:open', p),
  showItem: (p) => ipcRenderer.invoke('shell:show', p),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  aiCheck: () => ipcRenderer.invoke('ai:check'),
  aiSubmit: (o) => ipcRenderer.invoke('ai:submit', o),
  aiCancel: (id) => ipcRenderer.invoke('ai:cancel', id),
  aiList: () => ipcRenderer.invoke('ai:list'),
  aiResult: (id) => ipcRenderer.invoke('ai:readResult', id),
  onAiUpdate: (cb) => ipcRenderer.on('ai:update', (_e, j) => cb(j)),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, m) => cb(m))
});
