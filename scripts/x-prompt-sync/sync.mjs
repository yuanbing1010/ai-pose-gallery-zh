#!/usr/bin/env node
/**
 * X (Twitter) 提示词博主定时同步脚本（部署于 GCP 东京 VPS）
 *
 * 工作流：
 * 1. 从本站 GET /api/gallery/sync-sources 拉取在 /admin 配置好的启用博主白名单
 * 2. 调用你的 Grok API / Grok Bot X 连接器检索每位博主近期高赞「出图 + 提示词」推文，
 *    并同步完成广告过滤、纯 Prompt 清洗、中文标题/译文生成与分类打标
 * 3. 通过 api.fxtwitter.com 核验推文真实性并获取高清无损原图 URL 与分辨率
 * 4. 批量推送至本站 POST /api/gallery/ingest（按 tweetId 幂等去重、自动转存 Cloudflare R2、
 *    按白名单 auto_publish 配置决定直接上架或进入先审后发队列）
 *
 * 运行要求：Node.js 20+（零外部依赖）
 */

const SITE_ORIGIN = (process.env.SITE_ORIGIN || '').replace(/\/+$/, '')
const GALLERY_INGEST_KEY = (process.env.GALLERY_INGEST_KEY || '').trim()
const GROK_API_BASE = (process.env.GROK_API_BASE || 'https://api.x.ai/v1').replace(/\/+$/, '')
const GROK_API_KEY = (process.env.GROK_API_KEY || '').trim()
const GROK_MODEL = (process.env.GROK_MODEL || 'grok-4-fast').trim()
// 支持三种调用协议：
// - responses_x_search: xAI 官方 /v1/responses + { type: "x_search" }（推荐）
// - chat_search: OpenAI 兼容 /v1/chat/completions + search_parameters（适合支持 live search 的中转/bot）
// - chat_plain: 纯 /v1/chat/completions（适合已内置 X 连接器代理的 Grok Bot 网关）
const GROK_API_MODE = (process.env.GROK_API_MODE || 'responses_x_search').trim()
const MAX_BLOGGERS_PER_RUN = Math.max(1, Number(process.env.MAX_BLOGGERS_PER_RUN || '8') || 8)
const MAX_TWEETS_PER_BLOGGER = Math.max(1, Math.min(10, Number(process.env.MAX_TWEETS_PER_BLOGGER || '4') || 4))
const LOOKBACK_DAYS = Math.max(1, Math.min(30, Number(process.env.LOOKBACK_DAYS || '7') || 7))
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'

const ALLOWED_CATEGORIES = [
  '写实人像',
  '二次元',
  '时尚穿搭',
  '光影氛围',
  '场景建筑',
  '创意艺术',
  '其他',
]

function requireEnv(name, val) {
  if (!val) {
    console.error(`[x-prompt-sync] 缺少必填环境变量: ${name}`)
    process.exit(1)
  }
}

function extractTweetId(urlOrId) {
  const s = String(urlOrId || '').trim()
  if (/^\d{10,25}$/.test(s)) return s
  const m = s.match(/status(?:es)?\/(\d{10,25})/i)
  return m ? m[1] : null
}

function parseJsonFromModelOutput(text) {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1].trim() : raw
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

async function fetchSyncSources() {
  const fallbackHandles = (process.env.X_HANDLES || '')
    .split(/[,，\s]+/)
    .map((h) => h.replace(/^@+/, '').trim().toLowerCase())
    .filter(Boolean)

  try {
    const res = await fetch(`${SITE_ORIGIN}/api/gallery/sync-sources`, {
      headers: { Authorization: `Bearer ${GALLERY_INGEST_KEY}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) {
      const data = await res.json()
      if (Array.isArray(data.items) && data.items.length > 0) {
        return data.items
      }
    } else {
      console.warn(`[x-prompt-sync] 拉取线上白名单返回 HTTP ${res.status}，将尝试回退 X_HANDLES`)
    }
  } catch (err) {
    console.warn(`[x-prompt-sync] 拉取线上白名单异常: ${err.message}`)
  }

  return fallbackHandles.map((handle) => ({
    handle,
    displayName: `@${handle}`,
    autoPublish: false,
    lastTweetId: null,
  }))
}

function buildGrokExtractionPrompt(handle, lastTweetId) {
  const sinceHint = lastTweetId
    ? `优先检索比推文 ID ${lastTweetId} 更新的帖子。`
    : `检索最近 ${LOOKBACK_DAYS} 天内发布的帖子。`

  return [
    `请使用 X 搜索工具检索博主 @${handle} 的原创帖子（排除纯转推、广告、抽奖、纯文字吐槽以及未附带完整提示词的引流帖）。`,
    sinceHint,
    `最多挑选 ${MAX_TWEETS_PER_BLOGGER} 条同时包含「高质量 AI 生成配图」和「完整可复用生图提示词（Prompt）」的帖子。`,
    `对每条符合条件的帖子，请清洗去掉推文废话、话题标签(#hashtag)和推广链接，提取纯净原始提示词，并翻译为自然优雅的中文说明。`,
    `严格只输出一个 JSON 对象，不要包含任何额外解释文字，结构如下：`,
    `{`,
    `  "posts": [`,
    `    {`,
    `      "tweetUrl": "https://x.com/${handle}/status/推文数字ID",`,
    `      "title": "不超过24字的简洁中文标题",`,
    `      "promptText": "清洗后的原始完整提示词（保留英文或原语言）",`,
    `      "promptZh": "自然流畅的中文提示词译文或画面说明",`,
    `      "category": "从以下7个中选1个：${ALLOWED_CATEGORIES.join(' / ')}",`,
    `      "tags": ["标签1", "标签2", "标签3"]`,
    `    }`,
    `  ]`,
    `}`,
    `如果该博主近期没有符合条件的帖子，请返回 {"posts": []}。`,
  ].join('\n')
}

async function queryGrokForBlogger(source) {
  const prompt = buildGrokExtractionPrompt(source.handle, source.lastTweetId)
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${GROK_API_KEY}`,
  }

  if (GROK_API_MODE === 'responses_x_search') {
    const res = await fetch(`${GROK_API_BASE}/responses`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: GROK_MODEL,
        tools: [{ type: 'x_search', allowed_x_handles: [source.handle] }],
        input: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) {
      throw new Error(`Grok responses HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`)
    }
    const json = await res.json()
    const text =
      json.output_text ||
      (Array.isArray(json.output)
        ? json.output
            .flatMap((o) => (Array.isArray(o.content) ? o.content : []))
            .map((c) => c.text || '')
            .join('\n')
        : '')
    return parseJsonFromModelOutput(text)
  }

  const chatPayload = {
    model: GROK_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: '你是专业的 AI 绘画提示词策展助手。只返回合法 JSON，不输出多余说明。',
      },
      { role: 'user', content: prompt },
    ],
  }
  if (GROK_API_MODE === 'chat_search') {
    chatPayload.search_parameters = {
      mode: 'on',
      sources: [{ type: 'x', included_x_handles: [source.handle] }],
    }
  }

  const res = await fetch(`${GROK_API_BASE}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(chatPayload),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    throw new Error(`Grok chat HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`)
  }
  const json = await res.json()
  const text = json?.choices?.[0]?.message?.content || ''
  return parseJsonFromModelOutput(text)
}

async function resolveTweetMediaViaFxTwitter(handle, tweetId) {
  const url = handle
    ? `https://api.fxtwitter.com/${encodeURIComponent(handle)}/status/${tweetId}`
    : `https://api.fxtwitter.com/status/${tweetId}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ai-pose-gallery-x-sync/1.0' },
    signal: AbortSignal.timeout(18_000),
  })
  if (!res.ok) return null
  const data = await res.json()
  const tweet = data?.tweet
  if (!tweet) return null
  const photos =
    Array.isArray(tweet.media?.photos) && tweet.media.photos.length > 0
      ? tweet.media.photos
      : Array.isArray(tweet.media?.all)
        ? tweet.media.all.filter((m) => m.type === 'photo' && m.url)
        : []
  const first = photos[0]
  if (!first?.url) return null
  return {
    imageUrl: first.url,
    width: typeof first.width === 'number' ? first.width : undefined,
    height: typeof first.height === 'number' ? first.height : undefined,
    authorHandle: (tweet.author?.screen_name || handle || '').replace(/^@+/, ''),
    authorName: tweet.author?.name || (handle ? `@${handle}` : 'X 精选博主'),
    authorAvatar: tweet.author?.avatar_url || undefined,
    tweetUrl: `https://x.com/${(tweet.author?.screen_name || handle || 'i').replace(/^@+/, '')}/status/${tweetId}`,
  }
}

async function ingestBatch(items) {
  if (items.length === 0) return { created: 0, skipped: 0, failed: 0 }
  if (DRY_RUN) {
    console.log('[x-prompt-sync] DRY_RUN=1 预览推送数据：')
    console.log(JSON.stringify(items, null, 2))
    return { created: items.length, skipped: 0, failed: 0 }
  }
  const res = await fetch(`${SITE_ORIGIN}/api/gallery/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GALLERY_INGEST_KEY}`,
    },
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(60_000),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`入库接口返回 HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return JSON.parse(text)
}

async function main() {
  requireEnv('SITE_ORIGIN', SITE_ORIGIN)
  requireEnv('GALLERY_INGEST_KEY', GALLERY_INGEST_KEY)
  requireEnv('GROK_API_KEY', GROK_API_KEY)

  const sources = (await fetchSyncSources()).slice(0, MAX_BLOGGERS_PER_RUN)
  if (sources.length === 0) {
    console.log('[x-prompt-sync] 未找到已启用的 X 博主，请先在 /admin -> 画廊审核与导入 -> X 博主白名单中添加。')
    return
  }

  console.log(`[x-prompt-sync] 开始同步 ${sources.length} 位博主（模式: ${GROK_API_MODE}，模型: ${GROK_MODEL}）`)
  const batch = []

  for (const src of sources) {
    try {
      console.log(`  -> 检索 @${src.handle} ...`)
      const parsed = await queryGrokForBlogger(src)
      const posts = Array.isArray(parsed?.posts) ? parsed.posts : []
      console.log(`     Grok 返回 ${posts.length} 条候选帖子`)

      for (const post of posts.slice(0, MAX_TWEETS_PER_BLOGGER)) {
        const tweetId = extractTweetId(post.tweetUrl || post.tweetId)
        if (!tweetId || !post.promptText) continue
        const media = await resolveTweetMediaViaFxTwitter(src.handle, tweetId)
        if (!media) {
          console.log(`     [跳过] tweet ${tweetId} 未解析到有效配图`)
          continue
        }
        batch.push({
          tweetId,
          tweetUrl: media.tweetUrl,
          authorHandle: media.authorHandle,
          authorName: media.authorName,
          authorAvatar: media.authorAvatar,
          title: String(post.title || '').trim(),
          promptText: String(post.promptText || '').trim(),
          promptZh: String(post.promptZh || '').trim(),
          imageUrl: media.imageUrl,
          width: media.width,
          height: media.height,
          category: ALLOWED_CATEGORIES.includes(post.category) ? post.category : '其他',
          tags: Array.isArray(post.tags) ? post.tags.slice(0, 6) : [],
          autoPublish: Boolean(src.autoPublish),
        })
      }
    } catch (err) {
      console.error(`  !! 处理 @${src.handle} 失败: ${err.message}`)
    }
  }

  // 分批提交（每批最多 15 条，防止单次 Worker CPU 超时）
  let totalCreated = 0
  let totalSkipped = 0
  let totalFailed = 0
  for (let i = 0; i < batch.length; i += 15) {
    const slice = batch.slice(i, i + 15)
    const result = await ingestBatch(slice)
    totalCreated += Number(result.created || 0)
    totalSkipped += Number(result.skipped || 0)
    totalFailed += Number(result.failed || 0)
  }

  console.log(
    `[x-prompt-sync] 同步完成：新增 ${totalCreated} 条，重复跳过 ${totalSkipped} 条，失败 ${totalFailed} 条`
  )
}

main().catch((err) => {
  console.error('[x-prompt-sync] 致命错误:', err)
  process.exit(1)
})
