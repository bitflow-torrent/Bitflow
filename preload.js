const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bitflow', {
  // Torrent operations
  addMagnet:         (magnetURI) => ipcRenderer.invoke('add-magnet', magnetURI),
  addTorrentFile:    ()          => ipcRenderer.invoke('add-torrent-file'),
  pauseTorrent:      (hash)      => ipcRenderer.invoke('pause-torrent', hash),
  resumeTorrent:     (hash)      => ipcRenderer.invoke('resume-torrent', hash),
  removeTorrent:     (hash)      => ipcRenderer.invoke('remove-torrent', hash),
  getTorrentFiles:   (hash)      => ipcRenderer.invoke('get-torrent-files', hash),
  openTorrentFolder: (hash)      => ipcRenderer.invoke('open-torrent-folder', hash),
  getDownloadPath:    ()           => ipcRenderer.invoke('get-download-path'),
  chooseDownloadPath: ()           => ipcRenderer.invoke('choose-download-path'),
  isFirstLaunch:      ()           => ipcRenderer.invoke('is-first-launch'),
  completeSetup:      (dlPath)     => ipcRenderer.invoke('complete-setup', dlPath),

  // Explorer
  scanDownloads: ()         => ipcRenderer.invoke('scan-downloads'),
  openFile:      (filePath) => ipcRenderer.invoke('open-file', filePath),

  // System theme
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),

  // Event listeners
  onSpeedUpdate: (cb) => {
    ipcRenderer.on('speed-update', (_e, data) => cb(data));
  },
  onTorrentError: (cb) => {
    ipcRenderer.on('torrent-error', (_e, msg) => cb(msg));
  },
  onSystemThemeChanged: (cb) => {
    ipcRenderer.on('system-theme-changed', (_e, theme) => cb(theme));
  },

  // Cleanup
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
