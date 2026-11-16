import { sanitizeReturnToPath, validateExternalImageUrl } from './validation'

export interface WechatTokenResult {
  accessToken: string
  openid: string
  unionid: string | null
}

export interface WechatProfileResult {
  nickname: string
  avatarUrl: string
  unionid: string | null
}

const WECHAT_ERROR_MAP: Record<number, string> = {
  40013: '微信 AppID 配置无效，请管理员在后台核对配置',
  40029: '微信登录二维码已失效或授权码错误，请刷新重试',
  40125: '微信 AppSecret 配置无效，请管理员在后台核对配置',
  40163: '微信授权码已被使用，请重新扫码登录',
  41001: '缺少微信 access_token 参数',
  42001: '微信授权凭证已过期，请重新扫码',
  50001: '该微信应用未获得网页扫码登录权限，请检查开放平台资质',
}

function formatWechatError(errcode: number, errmsg?: string): string {
  return (
    WECHAT_ERROR_MAP[errcode] ||
    `微信开放平台接口返回错误 (${errcode}${errmsg ? `: ${errmsg}` : ''})`
  )
}

export function buildWechatRedirectUri(origin: string, callbackBaseUrl?: string): string {
  const cleanBase = (callbackBaseUrl || '').trim().replace(/\/+$/, '') || origin.replace(/\/+$/, '')
  return `${cleanBase}/api/auth/wechat/callback`
}

export function buildWechatAuthorizeUrl(
  appId: string,
  redirectUri: string,
  state: string
): string {
  const qs = new URLSearchParams({
    appid: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  })
  return `https://open.weixin.qq.com/connect/qrconnect?${qs.toString()}#wechat_redirect`
}

export function buildWechatIframeUrl(
  appId: string,
  redirectUri: string,
  state: string
): string {
  const qs = new URLSearchParams({
    appid: appId,
    scope: 'snsapi_login',
    redirect_uri: redirectUri,
    state,
    login_type: 'jssdk',
    self_redirect: 'false',
    style: 'black',
  })
  return `https://open.weixin.qq.com/connect/qrconnect?${qs.toString()}`
}

export async function exchangeWechatCode(
  appId: string,
  appSecret: string,
  code: string
): Promise<WechatTokenResult> {
  const qs = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    code,
    grant_type: 'authorization_code',
  })
  let res: Response
  try {
    res = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?${qs.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Error('连接微信开放平台超时或网络异常，请稍后重试')
  }

  let data: Record<string, unknown> = {}
  try {
    data = (await res.json()) as Record<string, unknown>
  } catch {
    throw new Error(`微信接口响应解析失败 (HTTP ${res.status})`)
  }

  if (typeof data.errcode === 'number' && data.errcode !== 0) {
    throw new Error(formatWechatError(data.errcode, typeof data.errmsg === 'string' ? data.errmsg : ''))
  }

  const accessToken = typeof data.access_token === 'string' ? data.access_token.trim() : ''
  const openid = typeof data.openid === 'string' ? data.openid.trim() : ''
  const unionid =
    typeof data.unionid === 'string' && data.unionid.trim() ? data.unionid.trim() : null

  if (!res.ok || !accessToken || !openid) {
    throw new Error('微信登录未返回有效的授权标识 (openid)，请重试')
  }

  return { accessToken, openid, unionid }
}

function sanitizeWechatAvatarUrl(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const trimmed = raw.trim().replace(/^http:\/\//i, 'https://')
  if (!trimmed) return ''
  const validated = validateExternalImageUrl(trimmed)
  return validated ? validated.toString() : ''
}

export async function fetchWechatUserInfo(
  accessToken: string,
  openid: string
): Promise<WechatProfileResult> {
  const fallbackName = `微信用户_${openid.slice(-4) || 'user'}`
  const qs = new URLSearchParams({
    access_token: accessToken,
    openid,
    lang: 'zh_CN',
  })
  try {
    const res = await fetch(`https://api.weixin.qq.com/sns/userinfo?${qs.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return { nickname: fallbackName, avatarUrl: '', unionid: null }
    }
    const data = (await res.json()) as Record<string, unknown>
    if (typeof data.errcode === 'number' && data.errcode !== 0) {
      return { nickname: fallbackName, avatarUrl: '', unionid: null }
    }
    const rawNick = typeof data.nickname === 'string' ? data.nickname.trim() : ''
    const nickname = (rawNick || fallbackName).slice(0, 40)
    const avatarUrl = sanitizeWechatAvatarUrl(data.headimgurl)
    const unionid =
      typeof data.unionid === 'string' && data.unionid.trim() ? data.unionid.trim() : null
    return { nickname, avatarUrl, unionid }
  } catch {
    return { nickname: fallbackName, avatarUrl: '', unionid: null }
  }
}

export function buildWechatCallbackRedirect(
  origin: string,
  returnTo: string,
  params: {
    status: 'login' | 'registered' | 'bound' | 'cancelled' | 'error'
    credits?: number
    message?: string
  }
): string {
  const safePath = sanitizeReturnToPath(returnTo)
  const target = new URL(safePath, origin)
  target.searchParams.set('wx_status', params.status)
  if (typeof params.credits === 'number' && Number.isFinite(params.credits)) {
    target.searchParams.set('wx_credits', String(Math.max(0, Math.floor(params.credits))))
  } else {
    target.searchParams.delete('wx_credits')
  }
  if (params.message) {
    target.searchParams.set('wx_message', params.message.slice(0, 200))
  } else {
    target.searchParams.delete('wx_message')
  }
  return target.toString()
}
