import type { SupplierAuthMode } from '../shared/studio'
import { base64ToBytes, bytesToBase64, decryptSecret, encryptSecret, timingSafeEqualText } from './crypto'
import type { Env } from './types'
import { devProxyAwareFetch } from './upstreamFetch'
import { readResponseTextWithLimit } from './validation'

export type OAuthProviderMode = Exclude<SupplierAuthMode, 'api_key'>

export interface OAuthCredentialBundle {
  kind: 'oauth_token'
  provider: OAuthProviderMode
  accessToken: string
  refreshToken: string
  idToken?: string
  expiresAt: number
  accountId?: string
  email?: string
  tokenType?: string
}

export interface ResolvedOAuthCredential {
  accessToken: string
  accountId: string
  email: string
  expiresAt: number
  refreshed: boolean
}

const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const CODEX_DEVICE_USERCODE_URL = 'https://auth.openai.com/api/accounts/deviceauth/usercode'
const CODEX_DEVICE_TOKEN_URL = 'https://auth.openai.com/api/accounts/deviceauth/token'
const CODEX_DEVICE_VERIFICATION_URI = 'https://auth.openai.com/codex/device'
const CODEX_DEVICE_REDIRECT_URI = 'https://auth.openai.com/deviceauth/callback'
const CODEX_PKCE_AUTHORIZE_URL = 'https://auth.openai.com/oauth/authorize'
const CODEX_PKCE_REDIRECT_URI = 'http://localhost:1455/auth/callback'
const CODEX_TOKEN_URL = 'https://auth.openai.com/oauth/token'
const CODEX_SCOPES = 'openid profile email offline_access'

const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const XAI_DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code'
const XAI_PKCE_AUTHORIZE_URL = 'https://auth.x.ai/oauth2/authorize'
const XAI_PKCE_REDIRECT_URI = 'http://localhost:1455/auth/callback'
const XAI_TOKEN_URL = 'https://auth.x.ai/oauth2/token'
const XAI_USERINFO_URL = 'https://auth.x.ai/oauth2/userinfo'
const XAI_SCOPES = 'openid profile email offline_access grok-cli:access api:access'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

// 刷新互斥由 GENERATION_QUEUE Durable Object (`oauth-refresh:${keyId}`) 承担，禁止模块级跨请求 Promise 缓存

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(input: string): Uint8Array {
  const norm = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = norm.length % 4 === 0 ? '' : '='.repeat(4 - (norm.length % 4))
  return base64ToBytes(norm + pad)
}

function randomUrlSafe(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

async function sha256Base64Url(plain: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(plain))
  return toBase64Url(new Uint8Array(digest))
}

export function isOAuthAuthMode(mode: unknown): mode is OAuthProviderMode {
  return mode === 'oauth_openai_codex' || mode === 'oauth_xai'
}

export function decodeJwtPayload(token?: string | null): Record<string, unknown> | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const jsonText = textDecoder.decode(fromBase64Url(parts[1]))
    const parsed = JSON.parse(jsonText)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function maskOAuthAccountLabel(emailOrId: string, fallback = 'OAuth'): string {
  const clean = emailOrId.trim()
  if (!clean) return fallback
  const atIdx = clean.indexOf('@')
  if (atIdx > 0) {
    const local = clean.slice(0, atIdx)
    const domain = clean.slice(atIdx + 1)
    const maskedLocal =
      local.length <= 2 ? `${local[0] || '*'}*` : `${local.slice(0, 2)}***${local.slice(-1)}`
    return `${maskedLocal}@${domain}`
  }
  if (clean.length <= 8) return `${clean.slice(0, 2)}***`
  return `${clean.slice(0, 4)}***${clean.slice(-4)}`
}

export function buildCodexRequestHeaders(
  accessToken: string,
  accountId?: string,
  opts?: { accept?: string; contentType?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    originator: 'codex_cli_rs',
    'User-Agent': 'codex_cli_rs/0.1.0 (Linux; x86_64)',
    Accept: opts?.accept ?? 'text/event-stream',
  }
  if (opts?.contentType) {
    headers['Content-Type'] = opts.contentType
  }
  if (accountId && accountId.trim()) {
    headers['ChatGPT-Account-Id'] = accountId.trim()
  }
  return headers
}

export function buildXaiOAuthRequestHeaders(
  accessToken: string,
  opts?: { accept?: string; contentType?: string }
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'X-XAI-Token-Auth': 'xai-grok-cli',
    'x-grok-client-identifier': 'grok-shell',
    'x-grok-client-version': '1.0.92',
    'User-Agent': 'grok-cli/1.0.92',
    Accept: opts?.accept ?? 'application/json',
  }
  if (opts?.contentType) {
    headers['Content-Type'] = opts.contentType
  }
  return headers
}

export function parseOAuthBundle(rawDecrypted: string): OAuthCredentialBundle | null {
  if (!rawDecrypted || !rawDecrypted.trim().startsWith('{')) return null
  try {
    const obj = JSON.parse(rawDecrypted) as Record<string, unknown>
    if (obj.kind !== 'oauth_token' || !isOAuthAuthMode(obj.provider)) return null
    if (typeof obj.accessToken !== 'string' || !obj.accessToken.trim()) return null
    return {
      kind: 'oauth_token',
      provider: obj.provider,
      accessToken: obj.accessToken.trim(),
      refreshToken: typeof obj.refreshToken === 'string' ? obj.refreshToken.trim() : '',
      idToken: typeof obj.idToken === 'string' ? obj.idToken.trim() : undefined,
      expiresAt: typeof obj.expiresAt === 'number' && Number.isFinite(obj.expiresAt) ? obj.expiresAt : 0,
      accountId: typeof obj.accountId === 'string' ? obj.accountId.trim() : undefined,
      email: typeof obj.email === 'string' ? obj.email.trim() : undefined,
      tokenType: typeof obj.tokenType === 'string' ? obj.tokenType.trim() : 'Bearer',
    }
  } catch {
    return null
  }
}

function extractCodexAccountMeta(
  accessToken: string,
  idToken?: string
): { accountId: string; email: string; jwtExpMs: number } {
  const idClaims = decodeJwtPayload(idToken)
  const accessClaims = decodeJwtPayload(accessToken)
  const authClaim =
    (accessClaims?.['https://api.openai.com/auth'] as Record<string, unknown> | undefined) ??
    (idClaims?.['https://api.openai.com/auth'] as Record<string, unknown> | undefined)
  const profileClaim =
    (idClaims?.['https://api.openai.com/profile'] as Record<string, unknown> | undefined) ??
    (accessClaims?.['https://api.openai.com/profile'] as Record<string, unknown> | undefined)

  const accountId =
    (typeof authClaim?.chatgpt_account_id === 'string' && authClaim.chatgpt_account_id.trim()) ||
    (typeof accessClaims?.sub === 'string' && accessClaims.sub.trim()) ||
    (typeof idClaims?.sub === 'string' && idClaims.sub.trim()) ||
    ''

  const email =
    (typeof idClaims?.email === 'string' && idClaims.email.trim()) ||
    (typeof profileClaim?.email === 'string' && profileClaim.email.trim()) ||
    (typeof accessClaims?.email === 'string' && accessClaims.email.trim()) ||
    ''

  const expSec =
    (typeof accessClaims?.exp === 'number' && accessClaims.exp) ||
    (typeof idClaims?.exp === 'number' && idClaims.exp) ||
    0

  return {
    accountId,
    email,
    jwtExpMs: expSec > 0 ? expSec * 1000 : 0,
  }
}

async function fetchXaiUserInfo(
  env: Env,
  accessToken: string,
  idToken?: string
): Promise<{ accountId: string; email: string; jwtExpMs: number }> {
  const idClaims = decodeJwtPayload(idToken)
  const accessClaims = decodeJwtPayload(accessToken)
  let accountId =
    (typeof idClaims?.sub === 'string' && idClaims.sub.trim()) ||
    (typeof accessClaims?.sub === 'string' && accessClaims.sub.trim()) ||
    ''
  let email =
    (typeof idClaims?.email === 'string' && idClaims.email.trim()) ||
    (typeof accessClaims?.email === 'string' && accessClaims.email.trim()) ||
    ''
  const expSec =
    (typeof accessClaims?.exp === 'number' && accessClaims.exp) ||
    (typeof idClaims?.exp === 'number' && idClaims.exp) ||
    0

  if (!email || !accountId) {
    try {
      const res = await devProxyAwareFetch(
        XAI_USERINFO_URL,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
        },
        env,
        10_000
      )
      if (res.ok) {
        const info = (await res.json()) as Record<string, unknown>
        if (!email && typeof info.email === 'string' && info.email.trim()) {
          email = info.email.trim()
        }
        if (!accountId && typeof info.sub === 'string' && info.sub.trim()) {
          accountId = info.sub.trim()
        }
      }
    } catch {
      // best-effort userinfo lookup
    }
  }

  return {
    accountId,
    email,
    jwtExpMs: expSec > 0 ? expSec * 1000 : 0,
  }
}

async function readJsonSafely(res: Response): Promise<Record<string, unknown>> {
  const text = await readResponseTextWithLimit(res, 2 * 1024 * 1024)
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : { _raw: text }
  } catch {
    return { _raw: text.slice(0, 400) }
  }
}

function summarizeOAuthError(data: Record<string, unknown>, status: number, fallback: string): string {
  const desc =
    (typeof data.error_description === 'string' && data.error_description.trim()) ||
    (typeof (data.error as Record<string, unknown> | undefined)?.message === 'string' &&
      String((data.error as Record<string, unknown>).message).trim()) ||
    (typeof data.error === 'string' && data.error.trim()) ||
    (typeof data.message === 'string' && data.message.trim()) ||
    (typeof data._raw === 'string' && data._raw.trim())
  if (desc) {
    return `${fallback} (HTTP ${status}): ${desc.slice(0, 220)}`
  }
  return `${fallback} (HTTP ${status})`
}

async function buildBundleFromTokenResponse(
  env: Env,
  provider: OAuthProviderMode,
  tokenData: Record<string, unknown>,
  prevBundle?: OAuthCredentialBundle
): Promise<OAuthCredentialBundle> {
  const accessToken =
    typeof tokenData.access_token === 'string' ? tokenData.access_token.trim() : ''
  if (!accessToken) {
    throw new Error('OAuth 响应缺少 access_token')
  }
  const refreshToken =
    (typeof tokenData.refresh_token === 'string' && tokenData.refresh_token.trim()) ||
    prevBundle?.refreshToken ||
    ''
  const idToken =
    (typeof tokenData.id_token === 'string' && tokenData.id_token.trim()) || prevBundle?.idToken
  const expiresInSec =
    typeof tokenData.expires_in === 'number' && Number.isFinite(tokenData.expires_in)
      ? tokenData.expires_in
      : Number(tokenData.expires_in) || 0

  const meta =
    provider === 'oauth_openai_codex'
      ? extractCodexAccountMeta(accessToken, idToken)
      : await fetchXaiUserInfo(env, accessToken, idToken)

  const expiresAt =
    expiresInSec > 0
      ? Date.now() + expiresInSec * 1000
      : meta.jwtExpMs > 0
        ? meta.jwtExpMs
        : Date.now() + 3600 * 1000

  return {
    kind: 'oauth_token',
    provider,
    accessToken,
    refreshToken,
    ...(idToken ? { idToken } : {}),
    expiresAt,
    accountId: meta.accountId || prevBundle?.accountId || '',
    email: meta.email || prevBundle?.email || '',
    tokenType: typeof tokenData.token_type === 'string' ? tokenData.token_type : 'Bearer',
  }
}

async function syncSupplierLegacyKeyMirrorLocal(db: D1Database, supplierId: string): Promise<void> {
  const keysRes = await db
    .prepare(
      `SELECT api_key_encrypted, api_key_hint, enabled
       FROM supplier_keys
       WHERE supplier_id = ?
       ORDER BY enabled DESC, created_at ASC`
    )
    .bind(supplierId)
    .all<{ api_key_encrypted: string; api_key_hint: string; enabled: number }>()

  const rows = keysRes.results || []
  const enabledRows = rows.filter((r) => r.enabled === 1)
  const primary = enabledRows[0] || rows[0] || null
  const hint =
    rows.length === 0
      ? ''
      : rows.length === 1
        ? primary?.api_key_hint || ''
        : `${enabledRows.length}/${rows.length} 个账号`

  await db
    .prepare(
      `UPDATE suppliers
       SET api_key_encrypted = ?, api_key_hint = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(primary?.api_key_encrypted || '', hint, Date.now(), supplierId)
    .run()
}

export interface DraftOAuthAccountSummary {
  sessionId: string
  label: string
  accountHint: string
  accountId: string
  expiresAt: number
}

function deriveOAuthDisplayMeta(
  bundle: OAuthCredentialBundle,
  preferredLabel?: string
): { label: string; hint: string; accountId: string } {
  const accountIdentifier = bundle.email || bundle.accountId || ''
  const hint = maskOAuthAccountLabel(
    accountIdentifier,
    bundle.provider === 'oauth_openai_codex' ? 'Codex OAuth' : 'Grok OAuth'
  )
  const label =
    preferredLabel?.trim() ||
    bundle.email ||
    (bundle.accountId
      ? `${bundle.provider === 'oauth_openai_codex' ? 'Codex' : 'Grok'} (${bundle.accountId.slice(0, 8)})`
      : '') ||
    (bundle.provider === 'oauth_openai_codex' ? 'Codex 订阅账号' : 'Grok 订阅账号')
  const accountId = bundle.accountId || bundle.email || ''
  return { label: label.slice(0, 40), hint, accountId }
}

export async function upsertSupplierOAuthKey(
  env: Env,
  supplierId: string,
  bundle: OAuthCredentialBundle,
  preferredLabel?: string
): Promise<{ keyId: string; updatedExisting: boolean }> {
  const now = Date.now()
  const encrypted = await encryptSecret(JSON.stringify(bundle), env.APP_ENCRYPTION_KEY)
  const meta = deriveOAuthDisplayMeta(bundle, preferredLabel)

  const matchAccountId = meta.accountId
  let existingRow: { id: string; label: string; oauth_token_version: number } | null = null
  if (matchAccountId) {
    existingRow = await env.DB.prepare(
      `SELECT id, label, oauth_token_version
       FROM supplier_keys
       WHERE supplier_id = ? AND credential_type = 'oauth_token' AND oauth_account_id = ?
       LIMIT 1`
    )
      .bind(supplierId, matchAccountId)
      .first<{ id: string; label: string; oauth_token_version: number }>()
  }

  if (existingRow) {
    const nextLabel = preferredLabel?.trim() || existingRow.label || meta.label
    await env.DB.prepare(
      `UPDATE supplier_keys
       SET label = ?,
           credential_type = 'oauth_token',
           api_key_encrypted = ?,
           api_key_hint = ?,
           oauth_expires_at = ?,
           oauth_account_id = ?,
           oauth_token_version = oauth_token_version + 1,
           enabled = 1,
           cooldown_until = 0,
           last_error = '',
           updated_at = ?
       WHERE id = ?`
    )
      .bind(nextLabel.slice(0, 40), encrypted, meta.hint, bundle.expiresAt, matchAccountId, now, existingRow.id)
      .run()
    await syncSupplierLegacyKeyMirrorLocal(env.DB, supplierId)
    return { keyId: existingRow.id, updatedExisting: true }
  }

  const keyId = crypto.randomUUID()
  await env.DB.prepare(
    `INSERT INTO supplier_keys (
      id, supplier_id, label, credential_type, api_key_encrypted, api_key_hint,
      oauth_expires_at, oauth_account_id, oauth_token_version,
      enabled, cooldown_until, last_error, last_used_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'oauth_token', ?, ?, ?, ?, 1, 1, 0, '', 0, ?, ?)`
  )
    .bind(
      keyId,
      supplierId,
      meta.label,
      encrypted,
      meta.hint,
      bundle.expiresAt,
      matchAccountId,
      now,
      now
    )
    .run()

  await syncSupplierLegacyKeyMirrorLocal(env.DB, supplierId)
  return { keyId, updatedExisting: false }
}

async function saveAuthorizedOAuthOutcome(
  env: Env,
  sessionId: string,
  supplierId: string | null,
  bundle: OAuthCredentialBundle,
  preferredLabel?: string
): Promise<{
  keyId?: string
  updatedExisting?: boolean
  draftAccount?: DraftOAuthAccountSummary
}> {
  if (supplierId) {
    const saved = await upsertSupplierOAuthKey(env, supplierId, bundle, preferredLabel)
    await env.DB.prepare(`UPDATE supplier_oauth_sessions SET status = 'completed' WHERE id = ?`)
      .bind(sessionId)
      .run()
    return { keyId: saved.keyId, updatedExisting: saved.updatedExisting }
  }

  const meta = deriveOAuthDisplayMeta(bundle, preferredLabel)
  const encrypted = await encryptSecret(JSON.stringify(bundle), env.APP_ENCRYPTION_KEY)
  const extendedExpiry = Math.max(Date.now() + 30 * 60_000, bundle.expiresAt)
  await env.DB.prepare(
    `UPDATE supplier_oauth_sessions
     SET status = 'authorized',
         label = ?,
         oauth_bundle_encrypted = ?,
         oauth_account_id = ?,
         oauth_account_hint = ?,
         oauth_expires_at = ?,
         expires_at = ?
     WHERE id = ?`
  )
    .bind(meta.label, encrypted, meta.accountId, meta.hint, bundle.expiresAt, extendedExpiry, sessionId)
    .run()

  return {
    draftAccount: {
      sessionId,
      label: meta.label,
      accountHint: meta.hint,
      accountId: meta.accountId,
      expiresAt: bundle.expiresAt,
    },
  }
}

export async function resolveDraftOAuthSessionCredential(
  env: Env,
  sessionId: string
): Promise<{ apiKey: string; accountId?: string; authMode: OAuthProviderMode } | null> {
  const row = await env.DB.prepare(
    `SELECT auth_mode, status, oauth_bundle_encrypted, expires_at
     FROM supplier_oauth_sessions
     WHERE id = ? AND status = 'authorized'
     LIMIT 1`
  )
    .bind(sessionId)
    .first<{
      auth_mode: string
      status: string
      oauth_bundle_encrypted: string
      expires_at: number
    }>()
  if (!row || !row.oauth_bundle_encrypted || row.expires_at <= Date.now()) return null
  if (!isOAuthAuthMode(row.auth_mode)) return null
  const plain = await decryptSecret(row.oauth_bundle_encrypted, env.APP_ENCRYPTION_KEY)
  const bundle = parseOAuthBundle(plain)
  if (!bundle) return null
  return {
    apiKey: bundle.accessToken,
    accountId: bundle.accountId,
    authMode: bundle.provider,
  }
}

export async function claimDraftOAuthSessionsForSupplier(
  env: Env,
  supplierId: string,
  expectedAuthMode: OAuthProviderMode,
  sessionIds: string[]
): Promise<{ claimedCount: number }> {
  const uniqueIds = Array.from(
    new Set(sessionIds.map((id) => id.trim()).filter((id) => id.length > 0))
  ).slice(0, 20)
  let claimedCount = 0
  for (const sid of uniqueIds) {
    const row = await env.DB.prepare(
      `SELECT id, auth_mode, label, status, oauth_bundle_encrypted, expires_at
       FROM supplier_oauth_sessions
       WHERE id = ? AND supplier_id IS NULL AND status = 'authorized'
       LIMIT 1`
    )
      .bind(sid)
      .first<{
        id: string
        auth_mode: string
        label: string
        status: string
        oauth_bundle_encrypted: string
        expires_at: number
      }>()
    if (!row || row.auth_mode !== expectedAuthMode || !row.oauth_bundle_encrypted) continue
    if (row.expires_at <= Date.now()) continue
    const plain = await decryptSecret(row.oauth_bundle_encrypted, env.APP_ENCRYPTION_KEY)
    const bundle = parseOAuthBundle(plain)
    if (!bundle) continue
    await upsertSupplierOAuthKey(env, supplierId, bundle, row.label)
    await env.DB.prepare(
      `UPDATE supplier_oauth_sessions
       SET supplier_id = ?, status = 'completed', oauth_bundle_encrypted = ''
       WHERE id = ?`
    )
      .bind(supplierId, row.id)
      .run()
    claimedCount += 1
  }
  return { claimedCount }
}

export async function startSupplierOAuthDeviceFlow(
  env: Env,
  supplierId: string | null,
  authMode: OAuthProviderMode,
  label = ''
): Promise<{
  sessionId: string
  flowType: 'device_code'
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  intervalSec: number
  expiresAt: number
}> {
  const now = Date.now()
  const sessionId = crypto.randomUUID()

  if (authMode === 'oauth_openai_codex') {
    const res = await devProxyAwareFetch(
      CODEX_DEVICE_USERCODE_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'codex_cli_rs/0.1.0 (Linux; x86_64)',
        },
        body: JSON.stringify({ client_id: CODEX_CLIENT_ID }),
        signal: AbortSignal.timeout(15_000),
      },
      env,
      15_000
    )
    const data = await readJsonSafely(res)
    if (!res.ok) {
      throw new Error(summarizeOAuthError(data, res.status, '申请 OpenAI 设备码失败'))
    }
    const deviceAuthId = typeof data.device_auth_id === 'string' ? data.device_auth_id.trim() : ''
    const userCode =
      (typeof data.user_code === 'string' && data.user_code.trim()) ||
      (typeof data.usercode === 'string' && data.usercode.trim()) ||
      ''
    if (!deviceAuthId || !userCode) {
      throw new Error('OpenAI 设备码响应缺少 device_auth_id 或 user_code')
    }
    const intervalSec = Math.max(3, Math.min(30, Number(data.interval) || 5))
    const expiresInSec = Math.max(60, Math.min(1800, Number(data.expires_in) || 900))
    const expiresAt = now + expiresInSec * 1000
    const encryptedDeviceCode = await encryptSecret(deviceAuthId, env.APP_ENCRYPTION_KEY)

    await env.DB.prepare(
      `INSERT INTO supplier_oauth_sessions (
        id, supplier_id, auth_mode, flow_type, device_code_encrypted, user_code,
        verification_uri, code_verifier_encrypted, state, label, interval_sec,
        status, error_message, created_at, expires_at
      ) VALUES (?, ?, ?, 'device_code', ?, ?, ?, '', '', ?, ?, 'pending', '', ?, ?)`
    )
      .bind(
        sessionId,
        supplierId,
        authMode,
        encryptedDeviceCode,
        userCode,
        CODEX_DEVICE_VERIFICATION_URI,
        label.trim().slice(0, 40),
        intervalSec,
        now,
        expiresAt
      )
      .run()

    return {
      sessionId,
      flowType: 'device_code',
      userCode,
      verificationUri: CODEX_DEVICE_VERIFICATION_URI,
      intervalSec,
      expiresAt,
    }
  }

  // oauth_xai
  const form = new URLSearchParams({
    client_id: XAI_CLIENT_ID,
    scope: XAI_SCOPES,
  })
  const res = await devProxyAwareFetch(
    XAI_DEVICE_CODE_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    },
    env,
    15_000
  )
  const data = await readJsonSafely(res)
  if (!res.ok) {
    throw new Error(summarizeOAuthError(data, res.status, '申请 xAI 设备码失败'))
  }
  const deviceCode = typeof data.device_code === 'string' ? data.device_code.trim() : ''
  const userCode = typeof data.user_code === 'string' ? data.user_code.trim() : ''
  const verificationUri =
    (typeof data.verification_uri === 'string' && data.verification_uri.trim()) ||
    'https://accounts.x.ai/oauth2/device'
  const verificationUriComplete =
    typeof data.verification_uri_complete === 'string' && data.verification_uri_complete.trim()
      ? data.verification_uri_complete.trim()
      : undefined

  if (!deviceCode || !userCode) {
    throw new Error('xAI 设备码响应缺少 device_code 或 user_code')
  }

  const intervalSec = Math.max(3, Math.min(30, Number(data.interval) || 5))
  const expiresInSec = Math.max(60, Math.min(1800, Number(data.expires_in) || 600))
  const expiresAt = now + expiresInSec * 1000
  const encryptedDeviceCode = await encryptSecret(deviceCode, env.APP_ENCRYPTION_KEY)

  await env.DB.prepare(
    `INSERT INTO supplier_oauth_sessions (
      id, supplier_id, auth_mode, flow_type, device_code_encrypted, user_code,
      verification_uri, code_verifier_encrypted, state, label, interval_sec,
      status, error_message, created_at, expires_at
    ) VALUES (?, ?, ?, 'device_code', ?, ?, ?, '', '', ?, ?, 'pending', '', ?, ?)`
  )
    .bind(
      sessionId,
      supplierId,
      authMode,
      encryptedDeviceCode,
      userCode,
      verificationUri,
      label.trim().slice(0, 40),
      intervalSec,
      now,
      expiresAt
    )
    .run()

  return {
    sessionId,
    flowType: 'device_code',
    userCode,
    verificationUri,
    ...(verificationUriComplete ? { verificationUriComplete } : {}),
    intervalSec,
    expiresAt,
  }
}

interface OAuthSessionRow {
  id: string
  supplier_id: string | null
  auth_mode: string
  flow_type: string
  device_code_encrypted: string
  user_code: string
  verification_uri: string
  code_verifier_encrypted: string
  state: string
  label: string
  interval_sec: number
  status: string
  error_message: string
  oauth_bundle_encrypted?: string
  oauth_account_id?: string
  oauth_account_hint?: string
  oauth_expires_at?: number
  created_at: number
  expires_at: number
}

async function loadOAuthSessionRow(
  db: D1Database,
  sessionId: string,
  supplierId: string | null
): Promise<OAuthSessionRow | null> {
  if (supplierId) {
    return db
      .prepare(`SELECT * FROM supplier_oauth_sessions WHERE id = ? AND supplier_id = ? LIMIT 1`)
      .bind(sessionId, supplierId)
      .first<OAuthSessionRow>()
  }
  return db
    .prepare(`SELECT * FROM supplier_oauth_sessions WHERE id = ? AND supplier_id IS NULL LIMIT 1`)
    .bind(sessionId)
    .first<OAuthSessionRow>()
}

export async function pollSupplierOAuthDeviceFlow(
  env: Env,
  supplierId: string | null,
  sessionId: string
): Promise<{
  status: 'pending' | 'completed' | 'expired' | 'failed'
  intervalSec?: number
  error?: string
  keyId?: string
  updatedExisting?: boolean
  draftAccount?: DraftOAuthAccountSummary
}> {
  const row = await loadOAuthSessionRow(env.DB, sessionId, supplierId)

  if (!row) {
    throw new Error('OAuth 授权会话不存在或已清理')
  }
  if (row.status === 'completed') {
    return { status: 'completed' }
  }
  if (row.status === 'authorized') {
    return {
      status: 'completed',
      draftAccount: {
        sessionId: row.id,
        label: row.label,
        accountHint: row.oauth_account_hint || '',
        accountId: row.oauth_account_id || '',
        expiresAt: row.oauth_expires_at || 0,
      },
    }
  }
  if (row.status === 'failed') {
    return { status: 'failed', error: row.error_message || '授权失败' }
  }
  if (row.status === 'expired' || row.expires_at <= Date.now()) {
    await env.DB.prepare(
      `UPDATE supplier_oauth_sessions SET status = 'expired', error_message = ? WHERE id = ?`
    )
      .bind('设备码已过期，请重新获取', row.id)
      .run()
    return { status: 'expired', error: '设备码已过期，请重新获取' }
  }
  if (!isOAuthAuthMode(row.auth_mode)) {
    throw new Error('不支持的 OAuth 认证模式')
  }

  const deviceCode = await decryptSecret(row.device_code_encrypted, env.APP_ENCRYPTION_KEY)
  if (!deviceCode) {
    throw new Error('设备码凭证解密失败')
  }

  if (row.auth_mode === 'oauth_openai_codex') {
    const pollRes = await devProxyAwareFetch(
      CODEX_DEVICE_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'codex_cli_rs/0.1.0 (Linux; x86_64)',
        },
        body: JSON.stringify({
          device_auth_id: deviceCode,
          user_code: row.user_code,
        }),
        signal: AbortSignal.timeout(15_000),
      },
      env,
      15_000
    )

    if (pollRes.status === 403 || pollRes.status === 404) {
      return { status: 'pending', intervalSec: row.interval_sec || 5 }
    }

    const pollData = await readJsonSafely(pollRes)
    const errCode = typeof pollData.error === 'string' ? pollData.error : ''
    if (!pollRes.ok) {
      if (errCode === 'authorization_pending' || errCode === 'slow_down') {
        const nextInterval =
          errCode === 'slow_down' ? Math.min(20, (row.interval_sec || 5) + 2) : row.interval_sec || 5
        if (nextInterval !== row.interval_sec) {
          await env.DB.prepare(`UPDATE supplier_oauth_sessions SET interval_sec = ? WHERE id = ?`)
            .bind(nextInterval, row.id)
            .run()
        }
        return { status: 'pending', intervalSec: nextInterval }
      }
      const errMsg = summarizeOAuthError(pollData, pollRes.status, 'OpenAI 设备码轮询失败')
      await env.DB.prepare(
        `UPDATE supplier_oauth_sessions SET status = 'failed', error_message = ? WHERE id = ?`
      )
        .bind(errMsg, row.id)
        .run()
      return { status: 'failed', error: errMsg }
    }

    const authCode =
      typeof pollData.authorization_code === 'string' ? pollData.authorization_code.trim() : ''
    const codeVerifier =
      typeof pollData.code_verifier === 'string' ? pollData.code_verifier.trim() : ''
    if (!authCode || !codeVerifier) {
      return { status: 'pending', intervalSec: row.interval_sec || 5 }
    }

    const tokenForm = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CODEX_CLIENT_ID,
      code: authCode,
      code_verifier: codeVerifier,
      redirect_uri: CODEX_DEVICE_REDIRECT_URI,
    })
    const tokenRes = await devProxyAwareFetch(
      CODEX_TOKEN_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'codex_cli_rs/0.1.0 (Linux; x86_64)',
        },
        body: tokenForm.toString(),
        signal: AbortSignal.timeout(15_000),
      },
      env,
      15_000
    )
    const tokenData = await readJsonSafely(tokenRes)
    if (!tokenRes.ok) {
      const errMsg = summarizeOAuthError(tokenData, tokenRes.status, 'OpenAI Token 兑换失败')
      await env.DB.prepare(
        `UPDATE supplier_oauth_sessions SET status = 'failed', error_message = ? WHERE id = ?`
      )
        .bind(errMsg, row.id)
        .run()
      return { status: 'failed', error: errMsg }
    }

    const bundle = await buildBundleFromTokenResponse(env, 'oauth_openai_codex', tokenData)
    const saved = await saveAuthorizedOAuthOutcome(env, row.id, supplierId, bundle, row.label)
    return { status: 'completed', ...saved }
  }

  // oauth_xai
  const pollForm = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
    client_id: XAI_CLIENT_ID,
  })
  const tokenRes = await devProxyAwareFetch(
    XAI_TOKEN_URL,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: pollForm.toString(),
      signal: AbortSignal.timeout(15_000),
    },
    env,
    15_000
  )
  const tokenData = await readJsonSafely(tokenRes)
  const errCode = typeof tokenData.error === 'string' ? tokenData.error : ''

  if (!tokenRes.ok) {
    if (errCode === 'authorization_pending' || errCode === 'slow_down') {
      const nextInterval =
        errCode === 'slow_down' ? Math.min(20, (row.interval_sec || 5) + 2) : row.interval_sec || 5
      if (nextInterval !== row.interval_sec) {
        await env.DB.prepare(`UPDATE supplier_oauth_sessions SET interval_sec = ? WHERE id = ?`)
          .bind(nextInterval, row.id)
          .run()
      }
      return { status: 'pending', intervalSec: nextInterval }
    }
    if (errCode === 'expired_token') {
      await env.DB.prepare(
        `UPDATE supplier_oauth_sessions SET status = 'expired', error_message = ? WHERE id = ?`
      )
        .bind('设备码已过期，请重新获取', row.id)
        .run()
      return { status: 'expired', error: '设备码已过期，请重新获取' }
    }
    const errMsg = summarizeOAuthError(tokenData, tokenRes.status, 'xAI 设备码授权失败')
    await env.DB.prepare(
      `UPDATE supplier_oauth_sessions SET status = 'failed', error_message = ? WHERE id = ?`
    )
      .bind(errMsg, row.id)
      .run()
    return { status: 'failed', error: errMsg }
  }

  const bundle = await buildBundleFromTokenResponse(env, 'oauth_xai', tokenData)
  const saved = await saveAuthorizedOAuthOutcome(env, row.id, supplierId, bundle, row.label)
  return { status: 'completed', ...saved }
}

export async function startSupplierOAuthPkceFlow(
  env: Env,
  supplierId: string | null,
  authMode: OAuthProviderMode,
  label = ''
): Promise<{
  sessionId: string
  flowType: 'pkce'
  authorizeUrl: string
  redirectUri: string
  expiresAt: number
}> {
  const now = Date.now()
  const sessionId = crypto.randomUUID()
  const state = randomUrlSafe(24)
  const codeVerifier = randomUrlSafe(48)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  const expiresAt = now + 15 * 60_000
  const encryptedVerifier = await encryptSecret(codeVerifier, env.APP_ENCRYPTION_KEY)

  const redirectUri =
    authMode === 'oauth_openai_codex' ? CODEX_PKCE_REDIRECT_URI : XAI_PKCE_REDIRECT_URI

  let authorizeUrl: string
  if (authMode === 'oauth_openai_codex') {
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: CODEX_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: CODEX_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: 'codex_cli_rs',
    })
    authorizeUrl = `${CODEX_PKCE_AUTHORIZE_URL}?${qs.toString()}`
  } else {
    const qs = new URLSearchParams({
      response_type: 'code',
      client_id: XAI_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: XAI_SCOPES,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    })
    authorizeUrl = `${XAI_PKCE_AUTHORIZE_URL}?${qs.toString()}`
  }

  await env.DB.prepare(
    `INSERT INTO supplier_oauth_sessions (
      id, supplier_id, auth_mode, flow_type, device_code_encrypted, user_code,
      verification_uri, code_verifier_encrypted, state, label, interval_sec,
      status, error_message, created_at, expires_at
    ) VALUES (?, ?, ?, 'pkce', '', '', ?, ?, ?, ?, 5, 'pending', '', ?, ?)`
  )
    .bind(
      sessionId,
      supplierId,
      authMode,
      authorizeUrl,
      encryptedVerifier,
      state,
      label.trim().slice(0, 40),
      now,
      expiresAt
    )
    .run()

  return {
    sessionId,
    flowType: 'pkce',
    authorizeUrl,
    redirectUri,
    expiresAt,
  }
}

export async function completeSupplierOAuthPkceFlow(
  env: Env,
  supplierId: string | null,
  sessionId: string,
  callbackInput: string
): Promise<{
  keyId?: string
  updatedExisting?: boolean
  draftAccount?: DraftOAuthAccountSummary
}> {
  const row = await loadOAuthSessionRow(env.DB, sessionId, supplierId)

  if (!row || row.flow_type !== 'pkce') {
    throw new Error('PKCE 授权会话不存在')
  }
  if (row.expires_at <= Date.now()) {
    throw new Error('授权会话已过期，请重新生成授权链接')
  }
  if (!isOAuthAuthMode(row.auth_mode)) {
    throw new Error('不支持的 OAuth 认证模式')
  }

  const trimmed = callbackInput.trim()
  if (!trimmed) {
    throw new Error('请粘贴回调 URL 或授权码 code')
  }

  let code = trimmed
  let callbackState = ''
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('code=')) {
    let parsed: URL
    try {
      parsed = /^https?:\/\//i.test(trimmed)
        ? new URL(trimmed)
        : new URL(`http://localhost/callback?${trimmed.replace(/^\?/, '')}`)
    } catch {
      throw new Error('回调地址格式无效，请完整复制浏览器地址栏 URL')
    }
    const errParam = parsed.searchParams.get('error')
    if (errParam) {
      const errDesc = parsed.searchParams.get('error_description') || errParam
      throw new Error(`上游返回授权拒绝：${errDesc}`)
    }
    code = (parsed.searchParams.get('code') || '').trim()
    callbackState = (parsed.searchParams.get('state') || '').trim()
  }

  if (!code) {
    throw new Error('未从回调内容中提取到授权码 code')
  }
  if (callbackState && row.state && !(await timingSafeEqualText(callbackState, row.state))) {
    throw new Error('OAuth state 校验不匹配，请重新生成授权链接')
  }

  const codeVerifier = await decryptSecret(row.code_verifier_encrypted, env.APP_ENCRYPTION_KEY)
  if (!codeVerifier) {
    throw new Error('PKCE code_verifier 解密失败')
  }

  const isCodex = row.auth_mode === 'oauth_openai_codex'
  const tokenUrl = isCodex ? CODEX_TOKEN_URL : XAI_TOKEN_URL
  const clientId = isCodex ? CODEX_CLIENT_ID : XAI_CLIENT_ID
  const redirectUri = isCodex ? CODEX_PKCE_REDIRECT_URI : XAI_PKCE_REDIRECT_URI

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  })

  const tokenRes = await devProxyAwareFetch(
    tokenUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        ...(isCodex ? { 'User-Agent': 'codex_cli_rs/0.1.0 (Linux; x86_64)' } : {}),
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    },
    env,
    15_000
  )
  const tokenData = await readJsonSafely(tokenRes)
  if (!tokenRes.ok) {
    throw new Error(summarizeOAuthError(tokenData, tokenRes.status, '换取 OAuth Token 失败'))
  }

  const bundle = await buildBundleFromTokenResponse(env, row.auth_mode, tokenData)
  return saveAuthorizedOAuthOutcome(env, row.id, supplierId, bundle, row.label)
}

async function refreshOAuthTokensWithProvider(
  env: Env,
  bundle: OAuthCredentialBundle
): Promise<OAuthCredentialBundle> {
  if (!bundle.refreshToken) {
    throw new Error('该 OAuth 凭证缺少 refresh_token，请重新登录授权')
  }
  const isCodex = bundle.provider === 'oauth_openai_codex'
  const tokenUrl = isCodex ? CODEX_TOKEN_URL : XAI_TOKEN_URL
  const clientId = isCodex ? CODEX_CLIENT_ID : XAI_CLIENT_ID

  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: bundle.refreshToken,
    client_id: clientId,
  })
  const res = await devProxyAwareFetch(
    tokenUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        ...(isCodex ? { 'User-Agent': 'codex_cli_rs/0.1.0 (Linux; x86_64)' } : {}),
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15_000),
    },
    env,
    15_000
  )
  const data = await readJsonSafely(res)
  if (!res.ok) {
    throw new Error(summarizeOAuthError(data, res.status, '刷新 OAuth Token 失败'))
  }
  return buildBundleFromTokenResponse(env, bundle.provider, data, bundle)
}

export async function importSupplierOAuthJson(
  env: Env,
  supplierId: string | null,
  authMode: OAuthProviderMode,
  rawJson: string,
  label = ''
): Promise<{
  keyId?: string
  updatedExisting?: boolean
  draftAccount?: DraftOAuthAccountSummary
}> {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(rawJson.trim()) as Record<string, unknown>
  } catch {
    throw new Error('凭证 JSON 格式无效，请粘贴完整的 auth.json 内容')
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('凭证 JSON 必须为对象')
  }

  const nestedTokens =
    parsed.tokens && typeof parsed.tokens === 'object'
      ? (parsed.tokens as Record<string, unknown>)
      : parsed

  const accessToken =
    (typeof nestedTokens.access_token === 'string' && nestedTokens.access_token.trim()) ||
    (typeof nestedTokens.accessToken === 'string' && nestedTokens.accessToken.trim()) ||
    ''
  const refreshToken =
    (typeof nestedTokens.refresh_token === 'string' && nestedTokens.refresh_token.trim()) ||
    (typeof nestedTokens.refreshToken === 'string' && nestedTokens.refreshToken.trim()) ||
    ''
  const idToken =
    (typeof nestedTokens.id_token === 'string' && nestedTokens.id_token.trim()) ||
    (typeof nestedTokens.idToken === 'string' && nestedTokens.idToken.trim()) ||
    undefined
  const accountIdHint =
    (typeof nestedTokens.account_id === 'string' && nestedTokens.account_id.trim()) ||
    (typeof nestedTokens.accountId === 'string' && nestedTokens.accountId.trim()) ||
    ''

  if (!accessToken && !refreshToken) {
    throw new Error('JSON 中未找到 access_token 或 refresh_token')
  }

  let bundle: OAuthCredentialBundle
  if (accessToken) {
    const rawExpiresAt = Number(nestedTokens.expires_at ?? nestedTokens.expiresAt ?? 0)
    const rawExpiresIn = Number(nestedTokens.expires_in ?? nestedTokens.expiresIn ?? 0)
    const meta =
      authMode === 'oauth_openai_codex'
        ? extractCodexAccountMeta(accessToken, idToken)
        : await fetchXaiUserInfo(env, accessToken, idToken)
    const normalizedExpAt =
      rawExpiresAt > 1_000_000_000_000
        ? rawExpiresAt
        : rawExpiresAt > 1_000_000_000
          ? rawExpiresAt * 1000
          : rawExpiresIn > 0
            ? Date.now() + rawExpiresIn * 1000
            : meta.jwtExpMs > 0
              ? meta.jwtExpMs
              : Date.now() + 3600 * 1000

    bundle = {
      kind: 'oauth_token',
      provider: authMode,
      accessToken,
      refreshToken,
      ...(idToken ? { idToken } : {}),
      expiresAt: normalizedExpAt,
      accountId: meta.accountId || accountIdHint,
      email:
        meta.email ||
        (typeof parsed.email === 'string' ? parsed.email.trim() : '') ||
        '',
      tokenType: 'Bearer',
    }

    if (bundle.expiresAt <= Date.now() + 60_000 && bundle.refreshToken) {
      bundle = await refreshOAuthTokensWithProvider(env, bundle)
    }
  } else {
    bundle = await refreshOAuthTokensWithProvider(env, {
      kind: 'oauth_token',
      provider: authMode,
      accessToken: '',
      refreshToken,
      idToken,
      expiresAt: 0,
      accountId: accountIdHint,
    })
  }

  if (supplierId) {
    return upsertSupplierOAuthKey(env, supplierId, bundle, label)
  }

  const now = Date.now()
  const sessionId = crypto.randomUUID()
  const meta = deriveOAuthDisplayMeta(bundle, label)
  const encrypted = await encryptSecret(JSON.stringify(bundle), env.APP_ENCRYPTION_KEY)
  const extendedExpiry = Math.max(now + 30 * 60_000, bundle.expiresAt)

  await env.DB.prepare(
    `INSERT INTO supplier_oauth_sessions (
      id, supplier_id, auth_mode, flow_type, device_code_encrypted, user_code,
      verification_uri, code_verifier_encrypted, state, label, interval_sec,
      status, error_message, oauth_bundle_encrypted, oauth_account_id, oauth_account_hint,
      oauth_expires_at, created_at, expires_at
    ) VALUES (?, NULL, ?, 'import', '', '', '', '', '', ?, 5, 'authorized', '', ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      sessionId,
      authMode,
      meta.label,
      encrypted,
      meta.accountId,
      meta.hint,
      bundle.expiresAt,
      now,
      extendedExpiry
    )
    .run()

  return {
    draftAccount: {
      sessionId,
      label: meta.label,
      accountHint: meta.hint,
      accountId: meta.accountId,
      expiresAt: bundle.expiresAt,
    },
  }
}

export async function refreshSupplierOAuthKeyDirect(
  env: Env,
  keyId: string,
  options?: { force?: boolean }
): Promise<ResolvedOAuthCredential> {
  const row = await env.DB.prepare(
    `SELECT k.id, k.supplier_id, k.api_key_encrypted, k.oauth_expires_at, k.oauth_account_id,
            k.oauth_token_version, s.auth_mode
     FROM supplier_keys k
     JOIN suppliers s ON s.id = k.supplier_id
     WHERE k.id = ?
     LIMIT 1`
  )
    .bind(keyId)
    .first<{
      id: string
      supplier_id: string
      api_key_encrypted: string
      oauth_expires_at: number
      oauth_account_id: string
      oauth_token_version: number
      auth_mode: string
    }>()

  if (!row) {
    throw new Error('OAuth 凭证记录不存在')
  }
  const plain = await decryptSecret(row.api_key_encrypted, env.APP_ENCRYPTION_KEY)
  const bundle = parseOAuthBundle(plain)
  if (!bundle) {
    throw new Error('OAuth 凭证解析失败')
  }

  const now = Date.now()
  if (!options?.force && bundle.expiresAt > now + 120_000) {
    return {
      accessToken: bundle.accessToken,
      accountId: bundle.accountId || row.oauth_account_id || '',
      email: bundle.email || '',
      expiresAt: bundle.expiresAt,
      refreshed: false,
    }
  }

  if (!bundle.refreshToken) {
    if (bundle.expiresAt > now) {
      return {
        accessToken: bundle.accessToken,
        accountId: bundle.accountId || row.oauth_account_id || '',
        email: bundle.email || '',
        expiresAt: bundle.expiresAt,
        refreshed: false,
      }
    }
    throw new Error('OAuth Token 已过期且缺少 refresh_token，请重新登录授权')
  }

  let nextBundle: OAuthCredentialBundle
  try {
    nextBundle = await refreshOAuthTokensWithProvider(env, bundle)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'OAuth Token 刷新失败'
    await env.DB.prepare(
      `UPDATE supplier_keys
       SET cooldown_until = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(now + 10 * 60_000, msg.slice(0, 200), now, row.id)
      .run()
    throw err
  }

  const nextEncrypted = await encryptSecret(JSON.stringify(nextBundle), env.APP_ENCRYPTION_KEY)
  const accountIdentifier = nextBundle.email || nextBundle.accountId || ''
  const hint = maskOAuthAccountLabel(
    accountIdentifier,
    nextBundle.provider === 'oauth_openai_codex' ? 'Codex OAuth' : 'Grok OAuth'
  )
  const accountId = nextBundle.accountId || nextBundle.email || row.oauth_account_id || ''

  const updateRes = await env.DB.prepare(
    `UPDATE supplier_keys
     SET api_key_encrypted = ?,
         api_key_hint = ?,
         oauth_expires_at = ?,
         oauth_account_id = ?,
         oauth_token_version = oauth_token_version + 1,
         cooldown_until = 0,
         last_error = '',
         updated_at = ?
     WHERE id = ? AND oauth_token_version = ?`
  )
    .bind(
      nextEncrypted,
      hint,
      nextBundle.expiresAt,
      accountId,
      Date.now(),
      row.id,
      row.oauth_token_version
    )
    .run()

  if ((updateRes.meta?.changes ?? 0) === 0) {
    // Another worker refreshed concurrently; re-read canonical fresh row
    const latest = await env.DB.prepare(
      `SELECT api_key_encrypted, oauth_account_id FROM supplier_keys WHERE id = ? LIMIT 1`
    )
      .bind(row.id)
      .first<{ api_key_encrypted: string; oauth_account_id: string }>()
    if (latest) {
      const latestPlain = await decryptSecret(latest.api_key_encrypted, env.APP_ENCRYPTION_KEY)
      const latestBundle = parseOAuthBundle(latestPlain)
      if (latestBundle) {
        return {
          accessToken: latestBundle.accessToken,
          accountId: latestBundle.accountId || latest.oauth_account_id || '',
          email: latestBundle.email || '',
          expiresAt: latestBundle.expiresAt,
          refreshed: true,
        }
      }
    }
  }

  await syncSupplierLegacyKeyMirrorLocal(env.DB, row.supplier_id).catch(() => {})
  return {
    accessToken: nextBundle.accessToken,
    accountId,
    email: nextBundle.email || '',
    expiresAt: nextBundle.expiresAt,
    refreshed: true,
  }
}

export async function resolveValidSupplierOAuthKey(
  env: Env,
  keyId: string,
  forceRefresh = false
): Promise<ResolvedOAuthCredential> {
  if (env.GENERATION_QUEUE) {
    try {
      const stub = env.GENERATION_QUEUE.getByName(`oauth-refresh:${keyId}`)
      const res = await stub.fetch('https://do.internal/oauth-refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ keyId, forceRefresh }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        result?: ResolvedOAuthCredential
        error?: string
      }
      if (res.ok && data.ok && data.result) {
        return data.result
      }
      if (data.error) {
        throw new Error(data.error)
      }
    } catch (err) {
      if (err instanceof Error && !/durable object|fetch failed/i.test(err.message)) {
        throw err
      }
    }
  }

  return refreshSupplierOAuthKeyDirect(env, keyId, { force: forceRefresh })
}
