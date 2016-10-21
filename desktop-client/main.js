const {app, BrowserWindow} = require('electron');
let win;

app.on('ready', () => {
  win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: false
    }
  });
  win.loadURL(`http://localhost/curly-invention/client/index.html?uid=317&sid=1337`);
});
