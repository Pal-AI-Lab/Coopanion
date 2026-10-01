/**
 * Receives Coopanion's anonymous usage statistics (core/telemetry.ts, fields in docs/TELEMETRY.md)
 * and answers the operator's summary. One file, no dependencies: Node's built-in SQLite.
 *
 * - `POST /v1/report`: an install's queued events and its day records. Events are kept once per
 *   (install, type, time), so a report sent again after a lost answer adds nothing; a day record
 *   replaces the one stored for that install and date (the app sends the running day again and again).
 * - `POST /v1/uninstall`: the Windows uninstaller's one call.
 * - `GET /v1/stats` with `Authorization: Bearer <STATS_TOKEN>`: installs, active installs, retention
 *   by first date, sources, models, model failures by HTTP status, crashes, versions.
 *
 * No address is stored: the client's IP is used only to rate-limit, in memory.
 *
 * Environment: `PORT` (8790), `DB_FILE` (/data/telemetry.sqlite), `STATS_TOKEN`.
 */
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';

const PORT = Number(process.env.PORT ?? 8790);
const DB_FILE = process.env.DB_FILE ?? '/data/telemetry.sqlite';
const STATS_TOKEN = process.env.STATS_TOKEN ?? '';
/** The client sends at most 300 queued events and a few weeks of days; this is well above that. */
const MAX_BODY = 512 * 1024;
const MAX_EVENTS = 400;
const MAX_DAYS = 120;
/** Per address: a running app reports every 30 minutes; a burst of restarts stays well under this. */
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 60;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS installs (
    install_id TEXT PRIMARY KEY,
    first_date TEXT, first_seen TEXT, last_seen TEXT,
    version TEXT, os TEXT, os_release TEXT, arch TEXT, locale TEXT, time_zone TEXT,
    source TEXT, uninstalled_at TEXT, telemetry_off_at TEXT
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    install_id TEXT NOT NULL, type TEXT NOT NULL, ts TEXT NOT NULL, received_at TEXT NOT NULL, data TEXT NOT NULL,
    UNIQUE (install_id, type, ts)
  );
  CREATE TABLE IF NOT EXISTS days (
    install_id TEXT NOT NULL, date TEXT NOT NULL, received_at TEXT NOT NULL,
    running_minutes INTEGER NOT NULL, interacted_minutes INTEGER NOT NULL, messages INTEGER NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (install_id, date)
  );
  CREATE INDEX IF NOT EXISTS days_date ON days (date);
`);

const upsertInstall = db.prepare(`
  INSERT INTO installs (install_id, first_date, first_seen, last_seen, version, os, os_release, arch, locale, time_zone)
  VALUES (:id, :firstDate, :now, :now, :version, :os, :osRelease, :arch, :locale, :timeZone)
  ON CONFLICT (install_id) DO UPDATE SET
    first_date = MIN(COALESCE(installs.first_date, excluded.first_date), excluded.first_date),
    last_seen = excluded.last_seen, version = excluded.version, os = excluded.os, os_release = excluded.os_release,
    arch = excluded.arch, locale = excluded.locale, time_zone = excluded.time_zone
`);
const insertEvent = db.prepare(`INSERT OR IGNORE INTO events (install_id, type, ts, received_at, data) VALUES (?, ?, ?, ?, ?)`);
const upsertDay = db.prepare(`
  INSERT INTO days (install_id, date, received_at, running_minutes, interacted_minutes, messages, data)
  VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (install_id, date) DO UPDATE SET
    received_at = excluded.received_at, running_minutes = excluded.running_minutes,
    interacted_minutes = excluded.interacted_minutes, messages = excluded.messages, data = excluded.data
`);
const setSource = db.prepare(`UPDATE installs SET source = ? WHERE install_id = ?`);
const setUninstalled = db.prepare(`UPDATE installs SET uninstalled_at = ? WHERE install_id = ?`);
const setTelemetryOff = db.prepare(`UPDATE installs SET telemetry_off_at = ? WHERE install_id = ?`);
const clearTelemetryOff = db.prepare(`UPDATE installs SET telemetry_off_at = NULL WHERE install_id = ?`);

const str = (v, max = 100) => (typeof v === 'string' ? v.slice(0, max) : null);
const int = (v) => (Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), 1e12) : 0);

function report(body) {
  if (!ID.test(body?.installId ?? '')) return 400;
  const events = Array.isArray(body.events) ? body.events : [];
  const days = Array.isArray(body.days) ? body.days : [];
  if (events.length > MAX_EVENTS || days.length > MAX_DAYS) return 413;
  const id = body.installId;
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    upsertInstall.run({
      id, now, firstDate: DATE.test(body.firstDate ?? '') ? body.firstDate : now.slice(0, 10),
      version: str(body.version, 40), os: str(body.os, 20), osRelease: str(body.osRelease, 60), arch: str(body.arch, 20),
      locale: str(body.locale, 40), timeZone: str(body.timeZone, 60),
    });
    for (const e of events) {
      const type = str(e?.type, 40);
      const ts = str(e?.ts, 40);
      if (!type || !ts) continue;
      insertEvent.run(id, type, ts, now, JSON.stringify(e));
      if (type === 'source') setSource.run(str(e.answer, 40), id);
      if (type === 'telemetry_disabled') setTelemetryOff.run(ts, id);
      if (type === 'telemetry_enabled') clearTelemetryOff.run(id);
    }
    for (const d of days) {
      if (!DATE.test(d?.date ?? '')) continue;
      upsertDay.run(id, d.date, now, int(d.runningMinutes), int(d.interactedMinutes), int(d.messagesText) + int(d.messagesVoice), JSON.stringify(d));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return 204;
}

function uninstall(body) {
  if (!ID.test(body?.installId ?? '')) return 400;
  const now = new Date().toISOString();
  insertEvent.run(body.installId, 'uninstalled', now, now, '{}');
  setUninstalled.run(now, body.installId);
  return 204;
}

const all = (sql, ...args) => db.prepare(sql).all(...args);
/** A `models` entry's endpoint: a built-in service by its id, any other as `custom-remote via <module>` / `custom-local via <module>`. */
const VENDOR_LABEL = `CASE WHEN json_extract(m.value, '$.vendor') LIKE 'kind:%'
  THEN json_extract(m.value, '$.endpointKind') || ' via ' || substr(json_extract(m.value, '$.vendor'), 6)
  ELSE json_extract(m.value, '$.vendor') END`;

/** Retention by first date: how many of each cohort were active on day N after it (N = 1, 7, 30); a cohort younger than N days has 0 there. */
function stats() {
  const active = (days) => all(`
    SELECT COUNT(DISTINCT install_id) AS n FROM days
    WHERE interacted_minutes > 0 AND date >= date('now', ?)`, `-${days - 1} days`)[0].n;
  const retention = (on) => all(`
    SELECT i.first_date AS cohort, CAST(julianday('now') - julianday(i.first_date) AS INTEGER) AS ageDays, COUNT(*) AS installs,
      ${[1, 7, 30].map((n) => `SUM(EXISTS (SELECT 1 FROM days d WHERE d.install_id = i.install_id AND d.${on} > 0 AND d.date = date(i.first_date, '+${n} days'))) AS d${n}`).join(', ')}
    FROM installs i WHERE i.first_date >= date('now', '-90 days')
    GROUP BY i.first_date ORDER BY i.first_date`);
  return {
    generatedAt: new Date().toISOString(),
    installs: all(`SELECT COUNT(*) AS total, SUM(uninstalled_at IS NOT NULL) AS uninstalled, SUM(telemetry_off_at IS NOT NULL) AS telemetryOff FROM installs`)[0],
    activeInteracted: { day: active(1), week: active(7), month: active(30) },
    newPerDay: all(`SELECT first_date AS date, COUNT(*) AS n FROM installs WHERE first_date >= date('now', '-60 days') GROUP BY first_date ORDER BY first_date`),
    dailyActive: all(`
      SELECT date, SUM(running_minutes > 0) AS opened, SUM(interacted_minutes > 0) AS interacted,
        SUM(messages) AS messages, SUM(interacted_minutes) AS interactedMinutes
      FROM days WHERE date >= date('now', '-60 days') GROUP BY date ORDER BY date`),
    retentionInteracted: retention('interacted_minutes'),
    retentionOpened: retention('running_minutes'),
    sources: all(`SELECT COALESCE(source, 'unanswered') AS source, COUNT(*) AS n FROM installs GROUP BY 1 ORDER BY n DESC`),
    versions: all(`SELECT version, COUNT(*) AS n FROM installs WHERE last_seen >= datetime('now', '-14 days') GROUP BY version ORDER BY n DESC`),
    platforms: all(`SELECT os, arch, COUNT(*) AS n FROM installs GROUP BY os, arch ORDER BY n DESC`),
    // 0.1.10 counts every failed try in `failed`, retries and cut-off tries included, and sends no `aborted` or `failedStatus`
    models: all(`
      SELECT ${VENDOR_LABEL} AS vendor,
        json_extract(m.value, '$.model') AS model,
        COUNT(DISTINCT d.install_id) AS installs, SUM(json_extract(m.value, '$.calls')) AS calls,
        SUM(json_extract(m.value, '$.failed')) AS failed, SUM(json_extract(m.value, '$.aborted')) AS aborted,
        SUM(json_extract(m.value, '$.tokensIn')) AS tokensIn, SUM(json_extract(m.value, '$.tokensCached')) AS tokensCached,
        SUM(json_extract(m.value, '$.tokensOut')) AS tokensOut
      FROM days d, json_each(d.data, '$.models') m WHERE d.date >= date('now', '-30 days')
      GROUP BY 1, model ORDER BY installs DESC LIMIT 50`),
    failures: all(`
      SELECT ${VENDOR_LABEL} AS vendor, json_extract(m.value, '$.model') AS model, s.key AS status,
        COUNT(DISTINCT d.install_id) AS installs, SUM(s.value) AS failed
      FROM days d, json_each(d.data, '$.models') m, json_each(m.value, '$.failedStatus') s
      WHERE d.date >= date('now', '-30 days')
      GROUP BY 1, model, status ORDER BY failed DESC LIMIT 50`),
    crashes: all(`
      SELECT json_extract(data, '$.where') AS "where", json_extract(data, '$.error') AS error, json_extract(data, '$.code') AS code,
        json_extract(data, '$.frames[0]') AS frame, json_extract(data, '$.exitCode') AS exitCode,
        COUNT(DISTINCT install_id) AS installs, COUNT(*) AS n, MAX(ts) AS last
      FROM events WHERE type = 'crash' AND ts >= date('now', '-30 days')
      GROUP BY 1, 2, 3, 4, 5 ORDER BY n DESC LIMIT 50`),
    extensions: all(`
      SELECT json_extract(e.value, '$.name') AS name, COUNT(DISTINCT d.install_id) AS installs
      FROM days d, json_each(d.data, '$.extensions') e WHERE d.date >= date('now', '-30 days')
      GROUP BY name ORDER BY installs DESC LIMIT 50`),
  };
}

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.start > RATE_WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  h.n += 1;
  return h.n > RATE_MAX;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (now - h.start > RATE_WINDOW_MS) hits.delete(ip);
}, RATE_WINDOW_MS).unref();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  try {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (req.method === 'GET' && path === '/healthz') return send(200, { ok: true });
    if (req.method === 'GET' && path === '/v1/stats') {
      if (!STATS_TOKEN || req.headers.authorization !== `Bearer ${STATS_TOKEN}`) return send(401, { error: 'unauthorized' });
      return send(200, stats());
    }
    if (req.method === 'POST' && (path === '/v1/report' || path === '/v1/uninstall')) {
      const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
      if (limited(ip)) return send(429, { error: 'too many requests' });
      const body = await readBody(req);
      return send(path === '/v1/report' ? report(body) : uninstall(body));
    }
    return send(404, { error: 'not found' });
  } catch (err) {
    if (err?.status) return send(err.status, { error: err.message });
    console.error(err);
    return send(500, { error: 'internal' });
  }
}).listen(PORT, () => console.log(`coopanion telemetry on :${PORT}`));
