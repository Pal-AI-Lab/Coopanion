import { pick } from '../../base/language.ts';
import { S as zhHant } from './strings.zh-Hant.ts';
import { S as ja } from './strings.ja.ts';
import { S as ko } from './strings.ko.ts';
import { S as fr } from './strings.fr.ts';
import { S as de } from './strings.de.ts';
import { S as es419 } from './strings.es-419.ts';
import { S as ptBR } from './strings.pt-BR.ts';
import { S as it } from './strings.it.ts';
import { S as ru } from './strings.ru.ts';

const zh = {
  nav: '联机',
  intro: '同一局域网里的 Coo 会出现在彼此桌面上。位置按各自屏幕换算，缩放仍由本机设置决定。',
  profileTitle: '角色',
  name: '角色名',
  nameHint: '加入或创建房间时使用。',
  joinTitle: '加入房间',
  joinHint: '输入房主的 IP 和端口。加入后不能创建房间。',
  hostTitle: '创建房间',
  hostHint: '监听 localhost 时只允许本机连接；局域网其他电脑可填写本机 IP 或 0.0.0.0。创建后不能加入其他房间。',
  joinHost: '房间 IP',
  hostAddress: '监听 IP',
  port: '端口',
  join: '加入房间',
  create: '创建房间',
  leave: '离开房间',
  close: '关闭房间',
  statusTitle: '联机状态',
  idle: '未联机',
  connecting: '正在连接',
  hosting: (port: number) => `已创建房间，端口 ${port}`,
  joined: (host: string, port: number) => `已加入 ${host}:${port}`,
  address: '局域网地址',
  noPlayers: '还没有其他玩家',
  players: (count: number) => `${count} 名玩家在线`,
  errors: {
    busy: '当前已有房间连接。',
    name: '请填写角色名。',
    host: 'IP 地址无效。',
    port: '端口应为 1–65535。',
    listen: '无法监听这个地址。',
    connect: '无法连接房间。',
    disconnected: '房间连接已断开。',
    full: '房间已满。',
    protocol: '房间通信格式无效。',
  },
};

export const en: typeof zh = {
  nav: 'Online',
  intro: 'Pets on the same LAN appear on one another’s desktops. Positions adapt to each screen; size stays local.',
  profileTitle: 'Player',
  name: 'Name',
  nameHint: 'Used when joining or creating a room.',
  joinTitle: 'Join a room',
  joinHint: 'Enter the host IP and port. You cannot create a room while joined.',
  hostTitle: 'Create a room',
  hostHint: 'Listening on localhost accepts this computer only; use this computer’s LAN IP or 0.0.0.0 for other computers. You cannot join a room while hosting.',
  joinHost: 'Room IP',
  hostAddress: 'Listen IP',
  port: 'Port',
  join: 'Join room',
  create: 'Create room',
  leave: 'Leave room',
  close: 'Close room',
  statusTitle: 'Connection',
  idle: 'Not connected',
  connecting: 'Connecting',
  hosting: (port: number) => `Room open on port ${port}`,
  joined: (host: string, port: number) => `Joined ${host}:${port}`,
  address: 'LAN addresses',
  noPlayers: 'No other players yet',
  players: (count: number) => `${count} ${count === 1 ? 'player' : 'players'} online`,
  errors: {
    busy: 'A room connection is already active.',
    name: 'Enter a player name.',
    host: 'The IP address is invalid.',
    port: 'The port must be from 1 to 65535.',
    listen: 'This address cannot be opened for listening.',
    connect: 'Could not connect to the room.',
    disconnected: 'The room connection was closed.',
    full: 'The room is full.',
    protocol: 'The room sent an invalid message.',
  },
};

export const S = pick({
  zh, en, 'zh-Hant': zhHant, ja, ko, fr, de, 'es-419': es419, 'pt-BR': ptBR, it, ru,
});
