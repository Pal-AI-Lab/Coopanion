/**
 * Coo's Persona: Cortico's Cormini with four changes for the desktop pet.
 *
 * - `PARTNER.md` in the workspace goes into the system prefix whole (Cormini's partner segment), after a
 *   standing line asking Coo to keep it short and put details under `partner/`, and cannot be deleted with
 *   `delete_file`, as `CONSTITUTION.md` cannot.
 * - The prefix says how Coo keeps its workspace (`MEMORY_NOTE`, Cormini's memory segment, before the workspace
 *   listing): files named for what they hold, dated when tied to a time, older parts moved into `archive/`,
 *   which the listing shows as one line.
 * - Every write Coo makes to its workspace is committed to the workspace's Git repository, one commit
 *   per tool call, so the workspace has a history to look back on and go back to. `blobs/` is left out
 *   of the repository. Without Git (`gitInstalled`) the files are written all the same.
 * - The lines the Persona itself puts into the context (a session opening, new events, a World
 *   switched, context pressure, the handoff, the round cap, stalls) and its workspace listing are in
 *   English whatever the app language; Coo is told which language to talk in by the desktop-pet World.
 *
 * Cortico is staged at build time and the bots are not part of its module paths, so the base class is
 * passed in: the app loads it from the staged Cortico (`companion.ts`), the tests from vendor/cortico.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { EventEnvelope, SessionOpeningReason, ToolDef, WorldLifecycleEvent } from 'cortico/core/types.ts';
import type { Cormini } from '../vendor/cortico/bots/cormini/persona/persona.ts';
import type { GitAuthor, WorkspaceGit } from '../vendor/cortico/bots/cormini/persona/workspaceGit.ts';

/** The workspace file that goes into the prefix as Coo's notes on the person. */
export const PARTNER_FILE = 'PARTNER.md';
/** The workspace directory for details about the person that PARTNER.md leaves out; Coo reads them when needed. */
export const PARTNER_DIR = 'partner';
/** Heads the partner segment: the segment is the whole file on every request, so its length is paid each time. */
export const PARTNER_NOTE = `${PARTNER_FILE} in your workspace, below, is read in full on every request. Keep it a short, distilled portrait `
  + `of the person: merge or drop what is outdated. Put stories, logs and longer notes in files under ${PARTNER_DIR}/ and read them `
  + 'when needed.';
/** The workspace directory for what Coo has set aside; the prefix listing shows it as one line. */
export const ARCHIVE_DIR = 'archive';
/** Goes into the prefix right before the workspace listing, where the file names are all Coo sees of its files. */
export const MEMORY_NOTE = [
  'How you keep your workspace:',
  '- One subject per file, named for what it holds, specific enough that the name alone tells you whether to open it '
    + '(partner/food-likes-and-dislikes.md, not partner/notes2.md).',
  '- Before starting a file, look for one on the same subject with glob_files or grep_files and change that one. '
    + 'When a fact changes, rewrite it where it stands; delete what is no longer true.',
  '- Anything tied to a time has its date in the name: a running log one file per month (log/2026-10.md), one day\'s events by the day.',
  `- When a file grows long, move its older lines into ${ARCHIVE_DIR}/ with move_file (offset and limit); move finished files `
    + `and folders there whole. ${ARCHIVE_DIR}/ shows below as one line, and grep_files still searches it.`,
].join('\n');
/** Commits of Coo's own writes. */
export const AUTHOR_COO: GitAuthor = { name: 'coo', email: 'coo@persona.local' };
/** Commits the app makes on its own: the snapshot at start. */
export const AUTHOR_APP: GitAuthor = { name: 'coopanion', email: 'app@persona.local' };
/** What the workspace's `.gitignore` holds besides Cormini's own line: the binaries Coo saves stay out of the history. */
const IGNORED = 'blobs/';
/** Tags made by `snapshot`: the workspace as each version of the app first found it. */
export const SNAPSHOT_TAG = (version: string) => `start-${version}`;

/** Write tools and the receipt each starts with when it succeeded (Cormini's workspaceTools.ts and blobs.ts). */
const WRITES: Record<string, { ok: string; verb: string }> = {
  write_file: { ok: '[written] ', verb: 'wrote' },
  edit_file: { ok: '[edited] ', verb: 'edited' },
  append_file: { ok: '[appended] ', verb: 'appended to' },
  delete_file: { ok: '[deleted] ', verb: 'deleted' },
  move_file: { ok: '[moved] ', verb: 'moved' },
  save_blob: { ok: '[saved] ', verb: 'saved' },
};

/**
 * Takes `path` out of the repository at `dir` and leaves the files: a workspace may have committed `blobs/`
 * before it was ignored. Git variables that would point the call at another repository are dropped, as
 * WorkspaceGit drops them.
 */
function untrack(dir: string, path: string): void {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([k]) => !/^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|PREFIX)$/i.test(k)));
  execFileSync('git', ['-C', dir, '-c', 'safe.directory=*', 'rm', '-r', '--cached', '--quiet', '--ignore-unmatch', '--', path], { cwd: dir, env, stdio: 'ignore' });
}

/**
 * Puts the partner notes where this Persona reads them. Top-level entries whose names differ from `PARTNER.md` or
 * `partner/` only in letter case (possible on a case-sensitive file system) are merged in: such a file is renamed to
 * PARTNER.md, or appended to it under a line naming it when PARTNER.md exists; such a directory's entries move into
 * partner/. A file named `partner` moves into the directory as `partner/partner`. partner/ exists afterwards.
 * Returns whether anything moved.
 */
export function arrangePartner(dir: string): boolean {
  let moved = false;
  const names = () => readdirSync(dir);
  for (const name of names()) {
    if (name === PARTNER_FILE || name.toLowerCase() !== PARTNER_FILE.toLowerCase() || !statSync(join(dir, name)).isFile()) continue;
    if (names().includes(PARTNER_FILE)) {
      appendFileSync(join(dir, PARTNER_FILE), `

--- merged from ${name} ---
${readFileSync(join(dir, name), 'utf8')}`, 'utf8');
      unlinkSync(join(dir, name));
    } else {
      renameSync(join(dir, name), join(dir, PARTNER_FILE));
    }
    moved = true;
  }
  const target = join(dir, PARTNER_DIR);
  if (names().includes(PARTNER_DIR) && statSync(target).isFile()) {
    const held = join(dir, `${PARTNER_DIR}.moving`);
    renameSync(target, held);
    mkdirSync(target);
    renameSync(held, join(target, PARTNER_DIR));
    moved = true;
  }
  for (const name of names()) {
    if (name === PARTNER_DIR || name.toLowerCase() !== PARTNER_DIR || !statSync(join(dir, name)).isDirectory()) continue;
    if (!names().includes(PARTNER_DIR)) {
      renameSync(join(dir, name), target);
    } else {
      for (const entry of readdirSync(join(dir, name))) {
        const free = existsSync(join(target, entry)) ? `${name}-${entry}` : entry;
        renameSync(join(dir, name, entry), join(target, free));
      }
      rmdirSync(join(dir, name));
    }
    moved = true;
  }
  mkdirSync(target, { recursive: true });
  return moved;
}

/** Coo's Persona class on `Base`, Cormini as the staged Cortico has it. */
export function coopanionPersona(Base: typeof Cormini) {
  return class CoopanionPersona extends Base {
    /** Commits wait for the one before: Git's index takes one writer, and a turn often writes several files. */
    private commits: Promise<unknown> = Promise.resolve();

    private get git(): WorkspaceGit {
      return this.memory.git;
    }

    /** Whether Git runs here, so the workspace has a history. */
    gitAvailable(): boolean {
      return this.git.available();
    }

    protected override partnerDocFile(): string {
      return join(this.memoryDir, PARTNER_FILE);
    }

    protected override partnerDoc(): string {
      return `${PARTNER_NOTE}

${super.partnerDoc() || `(${PARTNER_FILE} is empty.)`}`;
    }

    protected override memoryNote(): string {
      return MEMORY_NOTE;
    }

    /**
     * Brings the repository in line with this Persona: `blobs/` ignored and untracked, then whatever is
     * not committed yet committed and tagged `start-<version>` the first time `version` runs; then the partner
     * notes are arranged (`arrangePartner`) and that is committed on its own, so the tag holds the workspace as it
     * was. Run once at start, before Coo writes anything; without Git only the arranging runs. A failure is logged
     * and the app starts without that step.
     */
    snapshot(version: string): void {
      const git = this.git;
      git.ensureRepo();
      const repo = git.status().repo;
      if (repo) this.tagStart(version);
      try {
        if (arrangePartner(this.memoryDir) && repo) git.commitAll('Move partner notes into PARTNER.md and partner/', AUTHOR_APP);
      } catch (err) {
        console.warn('[persona] arranging the partner notes failed', err);
      }
    }

    /** `blobs/` ignored and untracked, then the start commit or tag; a Git failure is logged. */
    private tagStart(version: string): void {
      const git = this.git;
      try {
        const ignore = join(this.memoryDir, '.gitignore');
        const lines = existsSync(ignore) ? readFileSync(ignore, 'utf8').split(/\r?\n/) : [];
        if (!lines.includes(IGNORED)) appendFileSync(ignore, `${lines.length && lines.at(-1) !== '' ? '\n' : ''}${IGNORED}\n`, 'utf8');
        untrack(this.memoryDir, IGNORED);
        const tag = SNAPSHOT_TAG(version);
        if (git.listTags().some((t) => t.name === tag)) git.commitAll('Changes from before this start', AUTHOR_APP);
        else git.tag(tag, `The workspace as version ${version} found it`, AUTHOR_APP);
      } catch (err) {
        // runs at build time, before the Core exists; Cormini's Git warnings fall back to the console the same way
        console.warn('[workspaceGit] snapshot failed', err);
      }
    }

    protected override tools(): ToolDef[] {
      return super.tools().map((t) => (WRITES[t.name] ? this.committed(t, WRITES[t.name]!) : t));
    }

    /** The tool, committing the workspace after each call that succeeded. */
    private committed(base: ToolDef, { ok, verb }: { ok: string; verb: string }): ToolDef {
      return {
        ...base,
        handler: async (args, ctx) => {
          // the repository exists before the first write, so its first commit (checkpoint0) holds the workspace as it was
          this.git.ensureRepo();
          const out = await base.handler(args, ctx);
          if (typeof out === 'string' && out.startsWith(ok)) {
            const message = `Coo ${verb} ${String(args.path ?? args.from ?? '')}`.trim();
            const run = () => this.git.commitAllAsync(message, AUTHOR_COO);
            this.commits = this.commits.then(run, run);
            await this.commits;
          }
          return out;
        },
      };
    }

    override onOpening(ctx: { reason: SessionOpeningReason }): void {
      this.core?.injectInternal(ctx.reason === 'restarted' ? '[system] The app restarted; the session carries on.' : '[system] The session has started.', 'opening');
    }

    override onWorldLifecycle(event: WorldLifecycleEvent): void {
      const what = event.kind === 'visibility'
        ? (event.visible ? 'is visible to you again' : 'is hidden from you; its events no longer reach you')
        : event.kind === 'mounted' ? 'is on' : event.kind === 'unmounted' ? 'is off' : 'restarted';
      this.core?.injectInternal(`[system] The World "${event.label}" ${what}.`, 'notice');
    }

    /** Cormini's delivery: the heartbeat's quiet time starts over, and one line counts the events. */
    override onDelivery(ctx: { events: EventEnvelope[] }): void {
      const n = ctx.events.filter((e) => e.origin === 'external').length;
      if (n === 0) return;
      // Cormini keeps its heartbeat private; the bracket access is TypeScript's way in for a subclass
      this['heartbeat'].noteActivity();
      this.core?.injectInternal(`[system] ${n} new event${n === 1 ? '' : 's'}.`, 'notice');
    }

    protected override pressureNote(): string {
      return '[system] A handoff is coming. It clears everything above; the latest stretch is written into a handoff note for the new session. '
        + 'Whatever from long before you are still following or still mean to do, write it into a file now; soon the context will be gone.';
    }

    override onStallsRecovered({ count, quietMs }: { count: number; quietMs: number }): string | null {
      if (count < 2) return null;
      const span = quietMs >= 60_000 ? `about ${Math.round(quietMs / 60_000)} min` : `about ${Math.round(quietMs / 1000)} s`;
      return `[system] You got stuck ${count} times and could not speak for ${span}; it was not your choice. You can speak again now.`;
    }

    protected override handoffNoteLines(): string[] {
      return [
        '[system] The handoff is done. The context before it is cleared; the files in your workspace are all still there. ',
        `The stretch before the clear is written up as a handoff note, delivered with this batch and saved in ${this.lastHandoffFile ?? 'handoffs/'}: `,
        'it comes in parts by time, only parts with content are sent; "the latest stretch" leads into now, "the earlier stretch" is only for reference. ',
        'Only the latest stretch keeps what your speaking tools were called with and their receipts. ',
        'What a call was given is what you meant to say; whether the person saw it is in the receipt and the events after it. ',
        'Carry on with the current topic or action naturally, with no need to remark on the pause, the clear or the handoff. Old lines and folded fragments are not models for wording or length. ',
        'Never call a speaking tool with empty content; nothing would show. ',
        'To say something, put it straight into the call. If you have nothing to say this turn, call end_turn.',
      ];
    }

    protected override softCapHint(): string | null {
      return '[system] You have taken many steps in a row this turn. Finish what is in hand, then call end_turn.';
    }

    protected override prefixFolds(): Array<{ prefix: string; line: (n: number) => string }> {
      return [
        { prefix: 'handoffs/', line: (n) => `handoffs/ (${n} handoff notes; list_files with dir handoffs lists them all)` },
        { prefix: 'blobs/', line: (n) => `blobs/ (${n} binary files; list_files with dir blobs lists them all, read_file shows an image)` },
        { prefix: `${ARCHIVE_DIR}/`, line: (n) => `${ARCHIVE_DIR}/ (${n} archived files; list_files with dir ${ARCHIVE_DIR} lists them all)` },
      ];
    }
  };
}

export type CoopanionPersona = InstanceType<ReturnType<typeof coopanionPersona>>;
