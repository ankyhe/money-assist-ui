'use strict';

const electron = require('electron');
const path = require('path');
const fs = require('fs').promises
const spawn = require('await-spawn');
const { ipcMain } = require('electron');
const sprintf = require('sprintf-js').sprintf;

const {app, BrowserWindow, Menu} = electron;

const CONFIG_FILE = "com.gmail.at.gerystuio.money-assist-ui.plist";

let mainWindow;
let preferenceWindow;
let last = '';
let configFileChanges = 0;

const toDateString = (d) => {
  return `${d.getFullYear()}-${sprintf('%02d', d.getMonth() + 1)}-${sprintf('%02d', d.getDate())} ` 
    + `${sprintf('%02d', d.getHours())}:${sprintf('%02d', d.getMinutes())}:${sprintf('%02d', d.getSeconds())}`
};

const isMac = () => {
  return process.platform === 'darwin'
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const speak = async (str, chineseVoiceName, rate) => {
  const args = ['-v', `${chineseVoiceName}`, '-r', `${rate}`, `${str}`];
  await spawn('say', args);
};

const updateTime = async (start, end) => {
  const currentConfigFileChanges = configFileChanges;
  for (; ;) {
    if (currentConfigFileChanges != configFileChanges) {
      return false;
    }
    const now = new Date();
    if (now.getTime() < start.getTime()) {
      mainWindow.webContents.send("time:update", toDateString(now));
      await sleep(1 * 1000);
      continue;
    }
    if (now.getTime() > end.getTime()) {
      await speak(`计时结束`, 'Ting-Ting', '24')
      return true;
    }
    const nowStr = toDateString(now);
    if (last != nowStr) {
      last = nowStr;
      mainWindow.webContents.send("time:update", toDateString(now));
      await speak(`${now.getSeconds()}`, 'Ting-Ting', '300')
    }
  }
};

const loadConfigStr = async () => {
  const configPath = path.join(process.env.HOME, 'Library', 'Preferences', CONFIG_FILE);
  try {
    await fs.access(configPath, fs.constants.R_OK | fs.constants.W_OK);
    const data = await fs.readFile(configPath);
    return data.toString();
  } catch (err) {
    console.log('error is', err);
    return '23:59';
  }
}

const loadConfig = async () => {
  const data = await loadConfigStr();
  const config = data.toString();
  console.log('config is ', config);

  const arr = config.split('-');

  if (arr.length >= 2) {
    const now = new Date();
    let start = new Date(now);
    start = fixDate(start, arr[0]);
    let end = new Date(now);
    end = fixDate(end, arr[1]);

    if (end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
    return {start, end};
  }

  if (arr.length === 1) {
    const now = new Date();
    let start = new Date(now);
    start = fixDate(start, arr[0]);
    const end = new Date(start.getTime() + 1 * 60 * 1000);  // add one minute
    return {start, end};
  }

  throw new Error(`config: ${config} is not a valid format`);
};

const fixDate = (date, hourMinuteStr) => {
  const arr = hourMinuteStr.split(':');
  if (arr.length < 2) {
    throw new Error(`hourMinuteStr: ${hourMinuteStr} is not valid format`);
  }
  const hour = 1 * arr[0];
  if (isNaN(hour) || !Number.isInteger(hour) || hour < 0 || hour >= 24) {
    throw new Error(`hourMinuteStr: ${hourMinuteStr} has not a valid hour`);
  }
  const minute = 1 * arr[1];
  if (isNaN(minute) || !Number.isInteger(minute) || minute < 0 || minute >= 60) {
    throw new Error(`hourMinuteStr: ${hourMinuteStr} has not a valid minue`);
  }

  date.setHours(hour);
  date.setMinutes(minute);
  date.setSeconds(0);
  date.setMilliseconds(0);

  return date;
};

const run = async () => {
  const { start, end } = await loadConfig();
  const timeRangeStr = `${toDateString(start)}到${toDateString(end)}`;
  mainWindow.webContents.send("timeRange:update", timeRangeStr);
  updateTime(start, end);
};

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  mainWindow.on('close', () => {
    app.quit();
  });

  const loadPath = path.join(__dirname, 'mainWindow.html');
  mainWindow.loadFile(loadPath);
  //! mainWindow.webContents.openDevTools()

  const mainMenu = Menu.buildFromTemplate(mainMenuTemplate);
  Menu.setApplicationMenu(mainMenu);
  
  run();
});

const createPreferenceWindow = async () => {
  preferenceWindow = new BrowserWindow({
    width: 300,
    height: 300,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  const loadPath = path.join(__dirname, 'preference.html');
  preferenceWindow.loadFile(loadPath);
  preferenceWindow.on('close', () => {
    preferenceWindow = null;
  });

  //! preferenceWindow.webContents.openDevTools()

  const configStr = await loadConfigStr();
  preferenceWindow.webContents.send('timeRange:update', configStr);
};

ipcMain.on('timeRange:updateFromUI', async (e, configStr) => {
  preferenceWindow.close();

  await sleep(1);

  const currentConfigStr = loadConfigStr();
  if (configStr === currentConfigStr) {
    // do nothing
    return;
  }
  const configPath = path.join(process.env.HOME, 'Library', 'Preferences', CONFIG_FILE);
  await fs.writeFile(configPath, configStr);
  configFileChanges += 1;
  run();
});

const mainMenuTemplate = [
  {
    label: app.name,
    submenu: [
      {
        label: "Preference",
        accelerator: isMac() ? 'Command+,' : "Ctrl+S",
        click() {
          createPreferenceWindow();
        }
      },
      {role: 'separator'},
      { 
        label: "Quit",
        accelerator: isMac() ? 'Command+Q' : "Ctrl+Q",
        click() {
          app.quit();
        }
      }
    ]
  }
];