import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = path.join(repoRoot, 'data')

function readJson(file, fallback = []) {
  const full = path.join(dataDir, file)
  if (!existsSync(full)) return fallback
  return JSON.parse(readFileSync(full, 'utf8'))
}

const giaPoses = readJson('pose-zh.json', [])
const mioPoses = readJson('pose-mio-zh.json', [])
const allPoses = [...giaPoses, ...mioPoses]

const groupKeys = new Set(allPoses.map((item) => `${item.体系}|${item.姿势编号 || item.id}`))

// 仅从原始姿势库（含深度图）中抽取 18 个多体系代表标本，供首页「换标本」瞬时切换
const depthCapable = giaPoses.filter((p) => !p.source && p.缩略图)
const preferredFront = depthCapable.filter((p) => p.角度 === '正面')
const pool = preferredFront.length >= 18 ? preferredFront : depthCapable
const step = Math.max(1, Math.floor(pool.length / 18))
const depthPoses = []
for (let i = 0; i < pool.length && depthPoses.length < 18; i += step) {
  depthPoses.push(pool[i])
}

const costumeFiles = [
  'costume-zh.json',
  'costume-anime-zh.json',
  'costume-gia-anime-zh.json',
  'costume-shisei-zh.json',
  'costume-mio-zh.json',
  'costume-outfit-db-zh.json',
]
let costumesCount = 0
let sampleCostume = null
for (const file of costumeFiles) {
  const list = readJson(file, [])
  if (Array.isArray(list)) {
    costumesCount += list.length
    if (!sampleCostume && list.length > 0) {
      sampleCostume = list[0]
    }
  }
}

const portraits = readJson('portrait-zh.json', [])
const samplePortrait = portraits[0] || null

const preview = {
  generatedAt: new Date().toISOString(),
  counts: {
    poseGroups: groupKeys.size,
    poses: allPoses.length,
    depthCapablePoses: depthCapable.length,
    costumes: costumesCount,
    portraits: portraits.length,
  },
  depthPoses,
  sampleCostume,
  samplePortrait,
}

const outPath = path.join(dataDir, 'home-preview.json')
writeFileSync(outPath, JSON.stringify(preview))
const sizeKb = (Buffer.byteLength(JSON.stringify(preview)) / 1024).toFixed(1)
console.log(
  `[build-home-preview] wrote data/home-preview.json (${sizeKb} KB · ${preview.counts.poseGroups} groups, ${preview.counts.poses} poses, ${preview.counts.costumes} costumes, ${preview.counts.portraits} portraits)`
)
