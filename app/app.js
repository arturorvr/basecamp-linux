const {
  app,
  BrowserWindow,
  dialog,
  Menu,
  shell,
  Tray,
} = require('electron');
const path = require('path');
const settings = require('electron-settings');
const menus = require('./menus');

const ELECTRON_VERSION = process.versions.electron;
const APP_NAME = app.name;
const APP_VERSION = app.getVersion();
const APP_DESCRIPTION = 'Unofficial Basecamp GNU/Linux Desktop Client.';
const BASECAMP_URL = 'https://launchpad.37signals.com';
const ICONS_PATH = path.join(app.getAppPath(), '..', 'assets', 'icons');
const DEFAULTS = {
  iconScheme: 'white',
  showBadge: true,
};

let win;
let tray;
let unreadsNotified = false;

/**
 * The app builder object.
 */
const basecamp = {
  buildApp(url) {
    this.createWindow(url);
    this.addAppMenu();
    this.addContextMenu();
    this.addTrayIcon();
    this.setIcons();
    this.addWindowEvents();
  },

  /**
   * Creates the app window.
   */
  createWindow(url) {
    win = new BrowserWindow({
      y: settings.getSync('posY', 0),
      x: settings.getSync('posX', 0),
      width: settings.getSync('width', 770),
      height: settings.getSync('height', 700),
      title: APP_NAME,
      icon: this.getIcon('icon'),
      autoHideMenuBar: true,
      backgroundColor: '#f5efe6',
      webPreferences: {
        nodeIntegration: false,
        preload: `${__dirname}/integration.js`,
      },
    });

    if (settings.getSync('isMaximized', false)) {
      win.maximize();
    }

    win.loadURL(url);
  },

  addWindowEvents() {
    win
      .on('close', () => {
        const bounds = win.getBounds();
        settings.setSync('posX', bounds.x);
        settings.setSync('posY', bounds.y);
        settings.setSync('width', bounds.width);
        settings.setSync('height', bounds.height);
        settings.setSync('isMaximized', win.isMaximized());
      })
      .on('closed', () => {
        tray = null;
        win = null;
      })
      .on('page-title-updated', (event, title) => {
        event.preventDefault();
        this.setTitles(title);
      });

    win.webContents
      .on('new-window', (event, linkUrl) => {
        const regex = /accounts.google.com/;

        if (!linkUrl.match(regex)) {
          event.preventDefault();
          shell.openExternal(linkUrl);
        }
      })
      .on('will-navigate', (event, linkUrl) => {
        const regex = /(37signals.com|basecamp.com)/;

        if (!linkUrl.match(regex)) {
          event.preventDefault();
          shell.openExternal(linkUrl);
        }
      });

    return win;
  },

  /**
   * Adds the app menu.
   */
  addAppMenu() {
    Menu.setApplicationMenu(menus.forApp(basecamp, settings, DEFAULTS));
  },

  /**
   * Adds the app context menu.
   */
  addContextMenu() {
    win.webContents.on('context-menu', (event, params) => {
      event.preventDefault();
      const { linkURL } = params;

      if (linkURL) {
        menus.forContext(linkURL).popup(win);
      }
    });
  },

  /**
   * Adds the tray icon.
   */
  addTrayIcon() {
    tray = new Tray(this.getIcon('tray'));
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(menus.forTray());
    tray.on('click', () => {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
      }
    });
  },

  /**
   * Generates and displays a clear data dialog.
   */
  showClearDataDialog() {
    dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Yes', 'Cancel'],
      defaultId: 1,
      title: 'Clear data',
      message: 'This will clear all data.\n\nDo you want to proceed?',
    }, (response) => {
      if (response === 0) {
        this.clearData();
      }
    });
  },

  /**
   * Generates and displays an about dialog.
   */
  showAboutDialog() {
    dialog.showMessageBox(win, {
      type: 'info',
      icon: this.getIcon('logo'),
      buttons: ['Ok'],
      defaultId: 0,
      title: 'About',
      message: `${APP_NAME} ${APP_VERSION}\n\n${APP_DESCRIPTION}\n\nElectron ${ELECTRON_VERSION}\n\n${win.webContents.getUserAgent()}`,
    });
  },

  /**
   * Sets the app & tray titles.
   *
   * @param {string} title The webpage title
   */
  setTitles(title) {
    let fixedTitle = title;

    let match = /^\((\d+)\)(.+)/.exec(title);
    if (match) {
      fixedTitle = match[2].trim();
    } else {
      match = /^(•)(.+)/.exec(title);
      if (match) {
        fixedTitle = match[2].trim();
      }
    }

    win.webContents.executeJavaScript('typeof BC === \'undefined\' ? 0 : BC.unreads.all', false, result => (result)).then((result) => {
      const unreads = result.length;

      win.setTitle(unreads > 0 ? `${fixedTitle} • ${unreads}` : fixedTitle);

      tray.setToolTip(unreads > 0 ? `${APP_NAME} • ${unreads}` : APP_NAME);

      if (unreads > 0) {
        if (!unreadsNotified) {
          const notification = `
          new Notification(
            '${APP_NAME}',
            { body: 'You have ${unreads} unread notifications' }
          );`;

          win.webContents.executeJavaScript(notification);

          unreadsNotified = true;
        }

        if (settings.getSync('showBadge', DEFAULTS.showBadge)) {
          this.setIcons(`-unreads-${(unreads > 10 ? '10p' : unreads)}`);
        } else {
          this.setIcons('-unreads');
        }
      } else {
        this.setIcons();
      }
    });
  },

  /**
   * Sets the app & tray icons.
   */
  setIcons(suffix) {
    win.setIcon(this.getIcon(`icon${suffix ? '-unreads' : ''}`));
    tray.setImage(this.getIcon(`tray${suffix || ''}`));
  },

  /**
   * Gets the corresponding icon path.
   *
   * @param {string} icon
   *
   * @return {string}
   */
  getIcon(icon) {
    const iconScheme = settings.getSync('iconScheme') || DEFAULTS.iconScheme;
    return `${ICONS_PATH}/${iconScheme}/${icon}.png`;
  },

  /**
   * Clears all the app data.
   */
  clearData() {
    const { session } = win.webContents;
    session.clearStorageData(() => {
      session.clearCache(() => {
        win.loadURL(BASECAMP_URL);
      });
    });
  },

  /**
   * Configures the icon scheme.
   *
   * @param {string} color
   */
  configureIconScheme(color) {
    settings.setSync('iconScheme', color);
    win.reload();
  },

  /**
   * Configures the icon badge showing.
   *
   * @param {string} color
   */
  configureShowBadge(config) {
    settings.setSync('showBadge', config);
    win.reload();
  },
};

// --- Build the app

app.disableHardwareAcceleration();

app
  .on('window-all-closed', () => {
    app.quit();
  })
  .on('ready', () => {
    basecamp.buildApp(BASECAMP_URL);
  })
  .on('activate', () => {
    if (win === null) {
      basecamp.buildApp(BASECAMP_URL);
    }
  });
