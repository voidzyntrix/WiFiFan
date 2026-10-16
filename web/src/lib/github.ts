// Reads this repo's GitHub releases. Requests go through the native shell (Electron's main process,
// Android's bridge: no CORS); in a plain browser they fall back to fetch().

import { compareVersions } from './color'
import { platform } from '../platform'

const REPO = 'voidzyntrix/WiFiFan'
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=30`
const TAG_URL = `https://api.github.com/repos/${REPO}/releases/tags`
const FEED_URL = `https://github.com/${REPO}/releases.atom`
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/download`
export const RELEASES_PAGE = `https://github.com/${REPO}/releases`

export interface ReleaseAsset { version: string; tag: string; downloadUrl: string; size: number }

const getText = (url: string) => platform.net.text(url)

export const getBytes = (url: string, limit: number) => platform.net.bytes(url, limit)

const exists = (url: string) => platform.net.exists(url)

/**
 * The newest asset named like [pattern] (first group = "1.2.3"). The release feed first: it has no rate
 * limit, which matters as Glow looks every few seconds; the API (60 requests an hour) only if the feed fails.
 */
export async function newest(pattern: RegExp, kind: string, assetName: (v: string) => string): Promise<ReleaseAsset | null> {
  try {
    const fromFeed = await newestFromFeed(kind, assetName)
    if (fromFeed) return fromFeed
  } catch { /* fall through to the API */ }
  try {
    const releases = JSON.parse(await getText(RELEASES_URL)) as {
      draft: boolean; prerelease: boolean; tag_name: string; assets: { name: string; browser_download_url: string; size: number }[]
    }[]
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
  const feed = await getText(FEED_URL)
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
