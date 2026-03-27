const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

nativeTheme.themeSource = 'dark';

// ── Config helpers ────────────────────────────────────
function configPath() {
  return path.join(app.getPath('userData'), 'bitflow-config.json');
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath(), 'utf8')); }
  catch (e) { return {}; }
}
function writeConfig(data) {
  try { fs.writeFileSync(configPath(), JSON.stringify(data, null, 2)); }
  catch (e) { console.error('Failed to write config:', e.message); }
}
function getDownloadPath() {
  const cfg = readConfig();
  return cfg.downloadPath || path.join(app.getPath('downloads'), 'Bitflow');
}

let mainWindow;
let client = null;
let torrentList = [];
let speedHistory = { download: new Array(60).fill(0), upload: new Array(60).fill(0) };
let speedUpdateInterval = null;

// Try to load WebTorrent (graceful fallback if not installed yet)
let WebTorrent;
try {
  WebTorrent = require('webtorrent');
} catch (e) {
  console.log('WebTorrent not available, running in demo mode');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: '#0a0b10',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    show: false,
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (client) {
      client.destroy();
      client = null;
    }
    if (speedUpdateInterval) {
      clearInterval(speedUpdateInterval);
    }
  });

  // Remove default menu
  Menu.setApplicationMenu(null);
}

// Initialize WebTorrent client
function initClient() {
  if (!WebTorrent) return;
  try {
    client = new WebTorrent();

    client.on('error', (err) => {
      console.error('WebTorrent error:', err.message);
      if (mainWindow) {
        mainWindow.webContents.send('torrent-error', err.message);
      }
    });
  } catch (e) {
    console.error('Failed to create WebTorrent client:', e.message);
  }
}

// Speed update loop — pushes realtime stats to renderer
function startSpeedUpdates() {
  speedUpdateInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    let totalDownload = 0;
    let totalUpload = 0;
    const torrentsData = [];

    if (client) {
      totalDownload = client.downloadSpeed;
      totalUpload = client.uploadSpeed;

      client.torrents.forEach((torrent) => {
        // Count peers and seeds from active wires
        const wires = torrent.wires || [];
        const numPeers = wires.length;
        const totalPieces = torrent.pieces ? torrent.pieces.length : 0;
        const numSeeds = wires.filter(w => {
          try {
            if (!w.peerPieces || totalPieces === 0) return false;
            for (let i = 0; i < totalPieces; i++) {
              if (!w.peerPieces.get(i)) return false;
            }
            return true;
          } catch (e) { return false; }
        }).length;

        torrentsData.push({
          infoHash: torrent.infoHash,
          name: torrent.name || 'Loading...',
          progress: torrent.progress,
          downloadSpeed: torrent.downloadSpeed,
          uploadSpeed: torrent.uploadSpeed,
          downloaded: torrent.downloaded,
          uploaded: torrent.uploaded,
          length: torrent.length,
          numPeers,
          numSeeds,
          timeRemaining: torrent.timeRemaining,
          paused: torrent.paused,
          done: torrent.done,
          ratio: torrent.ratio,
          path: torrent.path
        });
      });
    }

    // Shift speed history
    speedHistory.download.push(totalDownload);
    speedHistory.download.shift();
    speedHistory.upload.push(totalUpload);
    speedHistory.upload.shift();

    mainWindow.webContents.send('speed-update', {
      downloadSpeed: totalDownload,
      uploadSpeed: totalUpload,
      speedHistory: speedHistory,
      torrents: torrentsData,
      ratio: client ? (client.uploaded / Math.max(client.downloaded, 1)) : 0
    });
  }, 500);
}

// IPC Handlers

ipcMain.handle('add-magnet', async (event, magnetURI) => {
  if (!client) return { error: 'Client not ready' };
  return new Promise((resolve) => {
    try {
      const savePath = getDownloadPath();
      if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

      const torrent = client.add(magnetURI, { path: savePath }, (t) => {
        t.pause(); // hold until user confirms file selection
        resolve({
          infoHash: t.infoHash,
          name: t.name,
          length: t.length,
          files: t.files.map(f => ({ name: f.name, path: f.path, length: f.length, progress: f.progress }))
        });
      });

      torrent.on('error', (err) => {
        resolve({ error: err.message });
      });
    } catch (e) {
      resolve({ error: e.message });
    }
  });
});

ipcMain.handle('add-torrent-file', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add Torrent',
    filters: [{ name: 'Torrent Files', extensions: ['torrent'] }],
    properties: ['openFile']
  });

  if (result.canceled || !result.filePaths.length) return { canceled: true };

  const filePath = result.filePaths[0];
  if (!client) return { error: 'Client not ready' };

  return new Promise((resolve) => {
    try {
      const savePath = getDownloadPath();
      if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

      const torrent = client.add(filePath, { path: savePath }, (t) => {
        t.pause(); // hold until user confirms file selection
        resolve({
          infoHash: t.infoHash,
          name: t.name,
          length: t.length,
          files: t.files.map(f => ({ name: f.name, path: f.path, length: f.length, progress: f.progress }))
        });
      });

      torrent.on('error', (err) => resolve({ error: err.message }));
    } catch (e) {
      resolve({ error: e.message });
    }
  });
});

ipcMain.handle('pause-torrent', async (event, infoHash) => {
  if (!client) return;
  const torrent = client.get(infoHash);
  if (torrent) torrent.pause();
});

ipcMain.handle('resume-torrent', async (event, infoHash) => {
  if (!client) return;
  const torrent = client.get(infoHash);
  if (torrent) torrent.resume();
});

ipcMain.handle('remove-torrent', async (event, infoHash) => {
  if (!client) return;
  const torrent = client.get(infoHash);
  if (torrent) {
    return new Promise((resolve) => {
      torrent.destroy({ destroyStore: false }, resolve);
    });
  }
});

ipcMain.handle('get-torrent-files', async (event, infoHash) => {
  if (!client) return [];
  const torrent = client.get(infoHash);
  if (!torrent) return [];
  return torrent.files.map(f => ({
    name: f.name,
    path: f.path,
    length: f.length,
    downloaded: f.downloaded,
    progress: f.progress
  }));
});

ipcMain.handle('open-torrent-folder', async (event, infoHash) => {
  if (!client) return;
  const torrent = client.get(infoHash);
  if (torrent) {
    const { shell } = require('electron');
    shell.showItemInFolder(torrent.path);
  }
});

ipcMain.handle('get-download-path', async () => {
  return getDownloadPath();
});

ipcMain.handle('is-first-launch', async () => {
  const cfg = readConfig();
  return {
    firstLaunch: !cfg.setupComplete,
    downloadPath: getDownloadPath()
  };
});

ipcMain.handle('complete-setup', async (event, downloadPath) => {
  const cfg = readConfig();
  cfg.setupComplete = true;
  cfg.downloadPath  = downloadPath;
  writeConfig(cfg);
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }
  return { ok: true };
});

ipcMain.handle('choose-download-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Download Folder'
  });
  if (!result.canceled) return result.filePaths[0];
  return null;
});

// ── Explorer: scan downloads folder and categorise by file type ───────────
const FILE_CATEGORIES = {
  video:    ['mp4','mkv','avi','mov','wmv','flv','webm','m4v','mpg','mpeg','3gp','ts','m2ts'],
  music:    ['mp3','flac','wav','aac','ogg','m4a','wma','opus','aiff','alac'],
  document: ['pdf','doc','docx','xls','xlsx','ppt','pptx','txt','epub','mobi','rtf','odt','md','csv'],
  image:    ['jpg','jpeg','png','gif','webp','bmp','tiff','svg','heic','raw','cr2','nef'],
  archive:  ['zip','rar','7z','tar','gz','bz2','xz','iso','dmg','pkg']
};

function categoriseFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  for (const [cat, exts] of Object.entries(FILE_CATEGORIES)) {
    if (exts.includes(ext)) return cat;
  }
  return 'other';
}

function scanDir(dirPath, results = [], depth = 0) {
  if (depth > 4) return results;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath, results, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          results.push({
            name: entry.name,
            path: fullPath,
            size: stat.size,
            modified: stat.mtimeMs,
            category: categoriseFile(entry.name)
          });
        } catch (_) {}
      }
    }
  } catch (_) {}
  return results;
}

ipcMain.handle('scan-downloads', async () => {
  const dlPath = getDownloadPath();
  if (!fs.existsSync(dlPath)) return {};
  const all = scanDir(dlPath);
  const grouped = { video: [], music: [], document: [], image: [], archive: [], other: [] };
  all.forEach(f => grouped[f.category].push(f));
  // Sort each category by modified date desc
  Object.values(grouped).forEach(arr => arr.sort((a, b) => b.modified - a.modified));
  return grouped;
});

ipcMain.handle('open-file', async (event, filePath) => {
  const { shell } = require('electron');
  shell.openPath(filePath);
});

ipcMain.handle('get-system-theme', async () => {
  // nativeTheme already imported at top of file
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// Push theme changes to renderer (nativeTheme already imported at top)
nativeTheme.on('updated', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  }
});

app.whenReady().then(() => {
  initClient();
  createWindow();
  startSpeedUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (client) {
    client.destroy();
  }
});
