'use strict';
/** The only bridge between the auditorium UI and the Node side. */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('cinema', {
  config: {
    get: () => invoke('config:get'),
    set: (patch) => invoke('config:set', patch),
    reset: () => invoke('config:reset'),
  },
  programme: {
    load: (opts) => invoke('programme:load', opts),
  },
  addons: {
    refresh: () => invoke('addons:refresh'),
    add: (transportUrl) => invoke('addons:add', transportUrl),
    remove: (transportUrl) => invoke('addons:remove', transportUrl),
    list: () => invoke('addons:list'),
  },
  catalog: {
    meta: (type, id) => invoke('catalog:meta', { type, id }),
    streams: (type, id) => invoke('catalog:streams', { type, id }),
    search: (type, query) => invoke('catalog:search', { type, query }),
  },
  playback: {
    resolve: (stream) => invoke('playback:resolve', stream),
    serverStatus: () => invoke('playback:serverStatus'),
  },
  player: {
    status: () => invoke('player:status'),
    play: (options) => invoke('player:play', options),
    command: (...args) => invoke('player:command', args),
    stop: () => invoke('player:stop'),
    install: () => invoke('player:install'),
  },
  update: {
    status: () => invoke('update:status'),
    check: () => invoke('update:check'),
    install: () => invoke('update:install'),
  },
  account: {
    login: (email, password) => invoke('account:login', { email, password }),
    logout: () => invoke('account:logout'),
  },
  app: {
    quit: () => invoke('app:quit'),
    cinemaMode: (mode) => invoke('app:cinemaMode', mode),
    tvStatus: () => invoke('app:tvStatus'),
    displays: () => invoke('app:displays'),
    useDisplay: (index) => invoke('app:useDisplay', index),
    keepAwake: (on) => invoke('app:keepAwake', on),
    openExternal: (url) => invoke('app:openExternal', url),
    version: () => invoke('app:version'),
  },
  on: (channel, handler) => {
    const allowed = ['ui:command'];
    if (!allowed.includes(channel)) return () => {};
    const wrapped = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
});
