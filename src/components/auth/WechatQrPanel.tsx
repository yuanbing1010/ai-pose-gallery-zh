import { useCallback, useEffect, useState } from 'react'
import { ArrowLeftIcon, ExternalLinkIcon, LoaderCircleIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startWechatAuthApi } from '@/lib/apiClient'
import { WechatIcon } from './WechatIcon'

interface WechatQrPanelProps {
  intent: 'login' | 'bind'
  title?: string
  subtitle?: string
  onBack: () => void
  backLabel?: string
}

export function WechatQrPanel({
  intent,
  title,
  subtitle,
  onBack,
  backLabel = '返回',
}: WechatQrPanelProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [session, setSession] = useState<{
    authorizeUrl: string
    iframeUrl: string
    expiresAt: number
  } | null>(null)
  const [expired, setExpired] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)

  const handleRefresh = useCallback(() => {
    setLoading(true)
    setError('')
    setExpired(false)
    setReloadTick((n) => n + 1)
  }, [])

  useEffect(() => {
    let active = true
    const returnTo =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '/'

    startWechatAuthApi({ intent, returnTo })
      .then((res) => {
        if (!active) return
        setSession(res)
        setError('')
        setExpired(false)
      })
      .catch((err) => {
        if (!active) return
        setSession(null)
        setError(err instanceof Error ? err.message : '获取微信二维码失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [intent, reloadTick])

  useEffect(() => {
    if (!session) return
    const msLeft = Math.max(0, session.expiresAt - Date.now())
    const timer = window.setTimeout(() => {
      setExpired(true)
    }, msLeft)
    return () => window.clearTimeout(timer)
  }, [session])

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          <span>{backLabel}</span>
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#07C160]/12 px-2.5 py-0.5 text-[11px] font-semibold text-[#059449] dark:text-[#34D399]">
          <WechatIcon className="size-3.5" />
          <span>微信开放平台安全扫码</span>
        </span>
      </div>

      {(title || subtitle) && (
        <div className="text-center">
          {title && <div className="text-sm font-bold text-foreground">{title}</div>}
          {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      )}

      <div className="flex flex-col items-center justify-center">
        {loading ? (
          <div className="flex h-[320px] w-full max-w-[320px] flex-col items-center justify-center gap-2.5 rounded-2xl border border-border bg-muted/30 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-5 animate-spin text-[#07C160]" />
            <span>正在生成微信扫码会话…</span>
          </div>
        ) : error ? (
          <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-destructive/35 bg-destructive/10 p-5 text-center">
            <div className="text-xs leading-relaxed text-destructive">{error}</div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRefresh}
                className="h-8 rounded-xl text-xs"
              >
                <RefreshCwIcon className="size-3.5" />
                <span>重新加载</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={onBack}
                className="h-8 rounded-xl text-xs"
              >
                {backLabel}
              </Button>
            </div>
          </div>
        ) : session ? (
          <div className="relative overflow-hidden rounded-2xl border border-border bg-white p-2 shadow-xs">
            <iframe
              key={session.iframeUrl}
              title="微信扫码授权"
              src={session.iframeUrl}
              className="h-[385px] w-[300px] max-w-full border-0 bg-white"
              scrolling="no"
            />
            {expired && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/92 p-4 text-center backdrop-blur-xs">
                <div className="text-xs font-semibold text-zinc-900">二维码已过期</div>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRefresh}
                  className="h-8 rounded-xl bg-[#07C160] text-xs font-bold text-white hover:bg-[#06AD56]"
                >
                  <RefreshCwIcon className="size-3.5" />
                  <span>刷新二维码</span>
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {session && !error && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-0.5 text-xs">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <RefreshCwIcon className="size-3" />
            <span>刷新二维码</span>
          </button>
          <span className="text-border">·</span>
          <a
            href={session.authorizeUrl}
            className="inline-flex items-center gap-1 font-medium text-[#059449] hover:underline dark:text-[#34D399]"
          >
            <span>打开微信官方扫码页</span>
            <ExternalLinkIcon className="size-3" />
          </a>
        </div>
      )}
    </div>
  )
}
