import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const STATIC_ENTRIES = [
  '_headers',
  'robots.txt',
  'sitemap.xml',
  'og-cover.jpg',
  'data',
  'thumbs',
  'img',
]

/** Recursively count files and total byte size inside a directory. */
function measureDirectory(dirPath) {
  let files = 0
  let bytes = 0
  const stack = [dirPath]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
      } else if (entry.isFile()) {
        files += 1
        bytes += statSync(fullPath).size
      }
    }
  }
  return { files, bytes }
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(repoRoot, 'dist')
const isWin = process.platform === 'win32'
const pnpmCmd = isWin ? 'pnpm.cmd' : 'pnpm'

console.log('[build-dist] Generating lightweight data/home-preview.json...')
const previewRes = spawnSync(process.execPath, ['scripts/build-home-preview.mjs'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
})
if (previewRes.status !== 0) {
  process.exit(previewRes.status ?? 1)
}

console.log('[build-dist] Running frontend & TypeScript build...')
const buildRes = spawnSync(pnpmCmd, ['build'], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
})
if (buildRes.status !== 0) {
  process.exit(buildRes.status ?? 1)
}

console.log('[build-dist] Copying static assets into dist/...')
for (const entry of STATIC_ENTRIES) {
  const srcPath = path.join(repoRoot, entry)
  if (!existsSync(srcPath)) {
    console.warn(`[build-dist] Warning: missing ${entry}, skipping`)
    continue
  }
  cpSync(srcPath, path.join(distDir, entry), { recursive: true, force: true })
}

const { files, bytes } = measureDirectory(distDir)
const mb = (bytes / (1024 * 1024)).toFixed(1)
console.log(`[build-dist] dist ready: ${files} files, ${mb} MiB`)
