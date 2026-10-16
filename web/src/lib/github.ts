// Reads this repo's GitHub releases. Requests go through the native shell (Electron's main process,
// Android's bridge: no CORS); in a plain browser they fall back to fetch().

import { compareVersions } from './color'
import { platform } from '../platform'

const REPO = 'voidzyntrix/WiFiFan'
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=100`
const TAG_URL = `https://api.github.com/repos/${REPO}/releases/tags`
const FEED_URL = `https://github.com/${REPO}/releases.atom`
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/download`
/**
 * The newest version of everything, as a plain file in the repo (versions.json, updated with every
 * release). Read through GitHub's file CDN, which doesn't have the API's 60-requests-an-hour limit
 * that answered 403 to Glow's frequent checks.
 */
const MANIFEST_URL = `https://raw.githubusercontent.com/${REPO}/main/versions.json`
const MANIFEST_TTL_MS = 60_000
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`

export interface ReleaseAsset { version: string; tag: string; downloadUrl: string; size: number }

interface Release {
  draft: boolean; prerelease: boolean; tag_name: string; assets: { name: string; browser_download_url: string; size: number }[]
}

// The release feed only lists the last ten releases, and firmware releases can fill it, so the app and
// desktop releases drop out of it. The API lists them all: asked for at most every ten minutes, and the
// last answer is kept (used when GitHub refuses).
const LIST_TTL_MS = 10 * 60_000
let listCache: { at: number; releases: Release[] } | null = null

async function releaseList(): Promise<Release[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.releases
  try {
    const releases = JSON.parse(await getText(RELEASES_URL)) as Release[]
    listCache = { at: Date.now(), releases }
    return releases
  } catch (e) {
    if (listCache) return listCache.releases
    throw e
  }
}

// Glow looks every few seconds, so requests are kept few: one release feed shared by every check made
// within a few seconds, a release file that exists is remembered, and after GitHub refuses (403/429)
// nothing is asked for a while.
const FEED_TTL_MS = 4500
const BACKOFF_MS = 2 * 60_000
let blockedUntil = 0
let feedCache: { at: number; text: Promise<string> } | null = null
const knownFiles = new Map<string, boolean>()
const missingAt = new Map<string, number>()

function guard<T>(p: Promise<T>): Promise<T> {
  return p.catch((e: Error) => {
    if (/HTTP (403|429)/.test(e.message)) blockedUntil = Date.now() + BACKOFF_MS
    throw e
  })
}
const getText = (url: string) => {
  if (Date.now() < blockedUntil) return Promise.reject(new Error('GitHub asked Glow to slow down; trying again in a moment'))
  return guard(platform.net.text(url))
}

export const getBytes = (url: string, limit: number) => platform.net.bytes(url, limit)

// (release files live on github.com, not the API: its rate limit doesn't apply to them)
const exists = async (url: string) => {
  if (knownFiles.get(url)) return true
  if (Date.now() - (missingAt.get(url) ?? 0) < 30_000) return false
  const ok = await platform.net.exists(url)
  if (ok) knownFiles.set(url, true); else missingAt.set(url, Date.now())
  return ok
}

/**
 * The newest asset named like [pattern] (first group = "1.2.3"). versions.json first (no rate limit), then
 * the release feed (only the last ten releases), and the API (60 requests an hour) only as the last resort.
 */
let manifestCache: { at: number; data: Promise<Record<string, string>> } | null = null

/** The newest release of `kind` per versions.json, if its file is there (a build may still be running). */
async function newestFromManifest(kind: string, assetName: (v: string) => string): Promise<ReleaseAsset | null> {
  if (!manifestCache || Date.now() - manifestCache.at > MANIFEST_TTL_MS) {
    const data = platform.net.text(MANIFEST_URL).then((t) => JSON.parse(t) as Record<string, string>)
    manifestCache = { at: Date.now(), data }
    data.catch(() => { manifestCache = null })
  }
  const v = (await manifestCache.data)[kind]
  if (!v || !/^\d+\.\d+\.\d+$/.test(v)) return null
  const tag = `${kind}-v${v}`
  const url = `${DOWNLOAD_URL}/${tag}/${assetName(v)}`
  return (await exists(url)) ? { version: v, tag, downloadUrl: url, size: 0 } : null
}

export async function newest(pattern: RegExp, kind: string, assetName: (v: string) => string): Promise<ReleaseAsset | null> {
  try {
    const fromManifest = await newestFromManifest(kind, assetName)
    if (fromManifest) return fromManifest
  } catch { /* fall back to the feed, then the API */ }
  try {
    const fromFeed = await newestFromFeed(kind, assetName)
    if (fromFeed) return fromFeed
  } catch { /* fall through to the API */ }
  try {
    const releases = await releaseList()
    let best: ReleaseAsset | null = null
    for (const rel of releases) {
      if (rel.draft || rel.prerelease) continue
      for (const a of rel.assets ?? []) {
        const m = pattern.exec(a.name)
        if (!m || m[0] !== a.name) continue
        const c = { version: m[1], tag: rel.tag_name, downloadUrl: a.browser_download_url, size: a.size }
        if (!best || compareVersions(c.version, best.version) > 0) best = c
      }
    }
    return best
  } catch (e) {
    return Promise.reject(e)
  }
}

async function newestFromFeed(kind: string, assetName: (v: string) => string): Promise<ReleaseAsset | null> {
  if (!feedCache || Date.now() - feedCache.at > FEED_TTL_MS) {
    const text = getText(FEED_URL)
    feedCache = { at: Date.now(), text }
    text.catch(() => { feedCache = null })
  }
  const feed = await feedCache.text
  const found = new Set<string>()
  for (const m of feed.matchAll(/\/releases\/tag\/([A-Za-z]+)-v(\d+\.\d+\.\d+)/g)) if (m[1] === kind) found.add(m[2])
  const versions = [...found].sort((a, b) => compareVersions(b, a)).slice(0, 3)
  // The feed lists a tag before its build attached the file: only offer one that is there.
  for (const v of versions) {
    const tag = `${kind}-v${v}`
    const url = `${DOWNLOAD_URL}/${tag}/${assetName(v)}`
    if (await exists(url)) return { version: v, tag, downloadUrl: url, size: 0 }
  }
  return null
}

/** Release notes (markdown) for a tag, or null. */
export async function releaseNotes(tag: string): Promise<string | null> {
  const json = JSON.parse(await getText(`${TAG_URL}/${tag}`)) as { body?: string }
  return json.body?.trim() || null
}
