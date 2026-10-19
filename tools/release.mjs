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

// ---------- watch the workflows (they can take a moment to appear) ----------
const sha = git(['rev-parse', 'HEAD'])
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const watch = async (workflow) => {
  let id
  for (let attempt = 0; attempt < 12 && !id; attempt++) {
    const rows = JSON.parse(execFileSync('gh', ['run', 'list', '--workflow', workflow, '--limit', '10', '--json', 'databaseId,headSha'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
    id = rows.find((r) => r.headSha === sha)?.databaseId
    if (!id) await wait(5000)
  }
  if (!id) throw new Error(`no ${workflow} run found for ${sha.slice(0, 7)}`)
  console.log(`watching ${workflow} run ${id}…`)
  execFileSync('gh', ['run', 'watch', String(id), '--exit-status', '--interval', '15'], { cwd: root, stdio: 'inherit' })
}

try {
  await watch('app-release.yml')
  await watch('desktop-release.yml')

  // ---------- each release must exist, published, with its exact asset ----------
  const verify = (tag, asset) => {
    const rel = JSON.parse(execFileSync('gh', ['release', 'view', tag, '--json', 'isDraft,assets'], { cwd: root, encoding: 'utf8' }))
    if (rel.isDraft || !rel.assets.some((a) => a.name === asset)) throw new Error(`${tag}: ${asset} missing`)
    console.log(`✓ ${tag} → ${asset}`)
  }
  verify(tagApp, `wififan-app-${version}.apk`)
  verify(tagDesktop, `Glow-Desktop-${version}.exe`)
  console.log(`\n✅ ${version} released`)
} catch (e) {
  console.error(`✗ ${e.message} — check \`gh run list\`, the version files are already committed`)
  process.exit(1)
}
