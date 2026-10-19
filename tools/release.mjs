#!/usr/bin/env node
// Releases the app + desktop in one command — the whole ritual from bump to verified release:
// bumps the version (web/package.json, desktop/package.json, the app/desktop keys of versions.json),
// adds the app's What's-new entry, commits, pushes main, pushes BOTH release tags (app-v* and
// desktop-v* are pushed together: the app ignores desktop releases and vice versa), then watches
// the two workflows and makes sure each release has its asset.
//
//   node tools/release.mjs                        → patch bump (2.13.17 → 2.13.18) and release
//   node tools/release.mjs --minor                → 2.13.17 → 2.14.0
//   node tools/release.mjs --major                → 2.13.17 → 3.0.0
//   node tools/release.mjs release                → same as the first line ("release" is the verb)
//   node tools/release.mjs "Line for What's new" [--major|--minor]
//                                                 → adds that line as the What's-new bullet
//   node tools/release.mjs --dry-run              → shows version, notes and steps; changes nothing
//
// Without a note argument the What's-new entry lists the commit subjects since the previous app-v
// tag (they are the release notes anyway; version-boundage commits like this script's own are
// skipped). Tracked files must be committed apart from the version files — commit UI changes
// first, with a subject worth reading in the What's-new.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const git = (args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const sh = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' })

// ---------- arguments ----------
let bump = 'patch'; let dry = false
const notes = []
for (const arg of process.argv.slice(2)) {
  if (arg === '--major' || arg === '--minor' || arg === '--patch') bump = arg.slice(2)
  else if (arg === '--dry-run') dry = true
  else if (arg === '--help' || arg === '-h') { usage(); process.exit(0) }
  else if (arg === 'release') { /* the verb: a plain release, same as the default */ }
  else notes.push(arg)
}

// ---------- next version ----------
const current = JSON.parse(readFileSync(path.join(root, 'web/package.json'), 'utf8')).version
let [major, minor, patch] = current.split('.').map(Number)
if (bump === 'major') { major += 1; minor = 0; patch = 0 }
else if (bump === 'minor') { minor += 1; patch = 0 }
else patch += 1
const version = [major, minor, patch].join('.')

// ---------- sanity: only the version files may be pending ----------
const releaseFiles = ['web/package.json', 'desktop/package.json', 'versions.json', 'web/src/ui/whatsNew.ts']
const strays = git(['diff', 'HEAD', '--name-only']).split('\n').filter((f) => f && !releaseFiles.includes(f))
if (strays.length) {
  console.error(`✗ Commit (or stash) these first — a release commit must be just the bump: ${strays.join(', ')}`)
  process.exit(1)
}

// ---------- What's-new notes ----------
if (!notes.length) {
  const prev = git(['describe', '--tags', '--abbrev=0', '--match', 'app-v*'])
  const subjects = git(['log', '--no-merges', '--format=%s', `${prev}..HEAD`]).split('\n').filter(Boolean)
  notes.push(...subjects.filter((s) => !/^(App|Desktop) \d+\.\d/.test(s)))
  if (!notes.length) notes.push('Bug fixes and polish.')
}
const summary = notes[0].length > 64 ? `${notes[0].slice(0, 64)}…` : notes[0]

console.log(`Glow ${current} → ${version} (${bump})${dry ? ' — dry run' : ''}`)
for (const n of notes) console.log(`  · ${n}`)

// ---------- edits (verified even in a dry run) ----------
const entryLines = [
  '  {',
  `    version: '${version}',`,
  '    notes: [',
  ...notes.map((n) => `      '${n.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`),
  '    ],',
  '  },',
]

const applied = []
/** Replaces the first `"key": "…"` with `"key": "value"` in a JSON file. */
const setValue = (file, key, value) => {
  const before = readFileSync(path.join(root, file), 'utf8')
  const re = new RegExp(`"${key}"\\s*:\\s*"[^"]+"`)
  if (!re.test(before)) fail(file, `no "${key}" key`)
  applied.push([file, before.replace(re, `"${key}": "${value}"`)])
}
/** Inserts the entry after the opening bracket of the WHATS_NEW list (in the file's own line endings). */
const addWhatsNew = () => {
  const file = 'web/src/ui/whatsNew.ts'
  const before = readFileSync(path.join(root, file), 'utf8')
  const eol = before.includes('\r\n') ? '\r\n' : '\n'
  const anchor = 'notes: string[] }[] = ['   // the opening bracket of the list
  if (before.split(anchor).length !== 2) fail(file, 'What\'s-new list anchor not found')
  applied.push([file, before.replace(anchor, `${anchor}${eol}${entryLines.join(eol)}${eol}`)])
}
function fail(file, why) { console.error(`✗ ${file}: ${why}`); process.exit(1) }

setValue('web/package.json', 'version', version)
setValue('desktop/package.json', 'version', version)
setValue('versions.json', 'app', version)
setValue('versions.json', 'desktop', version)
addWhatsNew()

if (dry) {
  console.log('dry run — would edit ' + applied.map(([f]) => f).join(', '))
  process.exit(0)
}
for (const [file, text] of applied) writeFileSync(path.join(root, file), text)

// ---------- commit, push, tag ----------
const tagApp = `app-v${version}`; const tagDesktop = `desktop-v${version}`
sh('git', ['add', ...releaseFiles])
sh('git', ['commit', '-m', `App ${version} / Desktop ${version}: ${summary}`])
sh('git', ['push', 'origin', 'main'])
sh('git', ['tag', tagApp]); sh('git', ['tag', tagDesktop])
sh('git', ['push', 'origin', tagApp, tagDesktop])

// ---------- wait for the releases (they can take a moment to appear) ----------
// Both waits are for the published ASSET, not the run: GitHub's run records can hang "in
// progress" long after their own Publish step succeeded, and `gh run watch` would wait forever.
// Everything is deadline-capped so a GitHub-side hiccup aborts the ritual, never wedges it.
const sha = git(['rev-parse', 'HEAD'])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const releaseJson = (tag) => {
  try { return JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'isDraft,assets'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })) }
  catch { return null }   // no release yet — that's the normal early state
}
const watch = async (workflow, tag, asset) => {
  console.log(`waiting for ${workflow} → ${asset}…`)
  const deadline = Date.now() + 20 * 60000
  let logged = false
  for (;;) {
    const rel = releaseJson(tag)
    if (rel && !rel.isDraft && rel.assets.some((a) => a.name === asset)) { console.log(`✓ ${tag} → ${asset}`); return }
    const rows = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', workflow, '--limit', '10', '--json', 'databaseId,headSha,status,conclusion'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
    const ours = rows.find((r) => r.headSha === sha)
    if (ours && !logged) { console.log(`watching ${workflow} run ${ours.databaseId}…`); logged = true }
    if (ours?.status === 'completed' && ours.conclusion !== 'success') throw new Error(`${workflow}: ${ours.conclusion}`)
    if (Date.now() > deadline) throw new Error(`${workflow}: ${asset} still missing after 20 min — check \`gh run list\` and \`gh run watch\``)
    await wait(15000)
  }
}

try {
  await watch('app-release.yml', tagApp, `wififan-app-${version}.apk`)
  await watch('desktop-release.yml', tagDesktop, `Glow-Desktop-${version}.exe`)
  console.log(`\n✅ ${version} released`)
} catch (e) {
  console.error(`✗ ${e.message} — the version files are already committed`)
  process.exit(1)
}
