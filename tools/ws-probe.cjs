// WS 探针：模拟"手机浏览器标签页"连 Coopanion 宠物页 socket（经 LAN 反代）
// 用法：set ELECTRON_RUN_AS_NODE=1 && Coopanion.exe ws-probe.cjs
const WS = require('D:/yangyu/Coopanion/resources/app/node_modules/ws');
const url = process.argv[2] || 'ws://192.168.1.11:17789/socket?role=pet&host=tab';
const ws = new WS(url, { origin: 'http://127.0.0.1:17789' });
const seen = [];
const timer = setTimeout(() => {
  console.log('TIMEOUT, messages:', seen.length);
  console.log(seen.slice(0, 6).join('\n---\n').slice(0, 1500));
  process.exit(0);
}, 6000);
ws.on('open', () => {
  console.log('OPEN', url);
  ws.send(JSON.stringify({ t: 'hello', screen: { w: 412, h: 915 }, host: 'tab' }));
});
ws.on('message', (d, bin) => { seen.push((bin ? '[bin] ' : '') + d.toString().slice(0, 400)); });
ws.on('error', (e) => { console.log('ERROR', e.message); clearTimeout(timer); process.exit(1); });
ws.on('close', (c, r) => { console.log('CLOSE', c, r.toString()); clearTimeout(timer); process.exit(0); });