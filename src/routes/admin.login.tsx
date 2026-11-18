import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import {
  adminLoginApi,
  adminSessionFromFrontendApi,
  bootstrapAdminApi,
  fetchAdminBootstrapStatusApi,
  fetchAdminMeApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type { PublicUser } from '@/types/gallery'

export const Route = createFileRoute('/admin/login')({
  staticData: { title: '管理端登录' },
  component: AdminLoginPage,
})

function AdminLoginPage() {
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [connectError, setConnectError] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [requiresSetupToken, setRequiresSetupToken] = useState(false)
  const [remoteBlocked, setRemoteBlocked] = useState(false)
  const [frontendUser, setFrontendUser] = useState<PublicUser | null>(null)
  const [authorizingFront, setAuthorizingFront] = useState(false)

  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [setupToken, setSetupToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const checkStatus = useCallback(async () => {
    setChecking(true)
    setConnectError('')
    try {
      const [meRes, statusRes] = await Promise.all([
        fetchAdminMeApi(),
        fetchAdminBootstrapStatusApi(),
      ])
      if (meRes.user?.role === 'admin') {
        void navigate({ to: '/admin', replace: true })
        return
      }
      setFrontendUser(meRes.frontendUser)
      setNeedsSetup(statusRes.needsSetup)
      setRequiresSetupToken(statusRes.requiresSetupToken)
      setRemoteBlocked(statusRes.remoteBlocked)
    } catch (err) {
      setConnectError(
        err instanceof Error
          ? err.message
          : '无法连接后端服务，请确认已启动本地服务（pnpm dev 或 pnpm dev:worker）'
      )
    } finally {
      setChecking(false)
    }
  }, [navigate])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkStatus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [checkStatus])

  const handleAuthorizeFromFrontend = async () => {
    setAuthorizingFront(true)
    setError('')
    try {
      await adminSessionFromFrontendApi()
      toast.success('已建立独立管理端会话')
      void navigate({ to: '/admin', replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '快速授权失败，请使用账号密码登录')
    } finally {
      setAuthorizingFront(false)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!account.trim() || !password) {
      setError('请输入管理员账号与密码')
      return
    }
    if (needsSetup) {
      if (remoteBlocked) {
        setError('公网环境未配置安全口令，当前禁止直接初始化管理员')
        return
      }
      if (requiresSetupToken && !setupToken.trim()) {
        setError('请输入部署环境变量中配置的初始化安全口令')
        return
      }
      if (password.length < 6) {
        setError('密码长度至少为 6 位')
        return
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致')
        return
      }
    }

    setSubmitting(true)
    try {
      if (needsSetup) {
        await bootstrapAdminApi({
          username: account.trim(),
          password,
          ...(requiresSetupToken ? { setupToken: setupToken.trim() } : {}),
        })
        toast.success('首个管理员账号已创建并登录')
      } else {
        await adminLoginApi({
          account: account.trim(),
          password,
        })
        toast.success('已进入管理端控制台')
      }
      void navigate({ to: '/admin', replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : '认证失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="flex h-12 items-center justify-between border-b border-zinc-950 px-6 text-xs dark:border-zinc-200">
        <div className="flex items-center gap-3">
          <span className="bg-zinc-950 px-2 py-0.5 font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
            管理控制台
          </span>
          <span className="hidden text-zinc-500 sm:inline">全站运维与资产管理中心</span>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 border border-zinc-300 px-3 py-1 text-xs transition-colors hover:border-zinc-950 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:border-zinc-200 dark:hover:bg-zinc-900"
        >
          <ArrowLeftIcon className="size-3.5" />
          <span>返回用户前端</span>
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="border border-zinc-950 bg-white dark:border-zinc-200 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-950 bg-zinc-100 px-5 py-3 text-xs dark:border-zinc-200 dark:bg-zinc-900">
            <span className="font-bold">
              {connectError
                ? '安全网关 · 连接异常'
                : needsSetup
                  ? '安全网关 · 初始化管理员'
                  : '安全网关 · 独立管理端登录'}
            </span>
            <LockIcon className="size-3.5" />
          </div>

          {checking ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-500">
              <LoaderCircleIcon className="size-4 animate-spin" />
              <span>正在检查管理会话与系统状态…</span>
            </div>
          ) : connectError ? (
            <div className="space-y-4 p-6">
              <div className="flex items-start gap-2.5 border border-amber-500/60 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1.5">
                  <div className="font-bold">后端服务未连通</div>
                  <div>{connectError}</div>
                  <div className="font-mono text-xs">
                    本地开发请运行：<code>pnpm dev</code>（或另开终端运行{' '}
                    <code>pnpm dev:worker</code>）。
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void checkStatus()}
                className="flex h-10 w-full items-center justify-center gap-2 bg-zinc-950 text-xs font-bold text-white transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-950"
              >
                <RefreshCwIcon className="size-3.5" />
                <span>重新检测连接</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              <div>
                <div className="text-xs tracking-wide text-zinc-500">独立管理端认证</div>
                <h1 className="mt-1 text-xl font-bold tracking-tight">
                  {needsSetup ? '初始化首个管理员账号' : '管理后台系统登录'}
                </h1>
                <p className="mt-1 text-xs text-zinc-500">
                  {needsSetup
                    ? '当前数据库尚无管理员（无默认密码），请设置您的首个管理员账号与密码。'
                    : '管理端采用独立会话 Cookie，在此登录或退出不会影响用户端当前登录状态。'}
                </p>
              </div>

              {!needsSetup && frontendUser?.role === 'admin' && (
                <div className="space-y-2.5 border border-emerald-600/40 bg-emerald-500/10 p-3.5 text-xs">
                  <div className="font-bold text-emerald-800 dark:text-emerald-300">
                    检测到前台已登录管理员 @{frontendUser.username}
                  </div>
                  <button
                    type="button"
                    disabled={authorizingFront}
                    onClick={() => void handleAuthorizeFromFrontend()}
                    className="flex h-9 w-full items-center justify-center gap-2 border border-zinc-950 bg-zinc-950 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                  >
                    {authorizingFront ? (
                      <LoaderCircleIcon className="size-3.5 animate-spin" />
                    ) : (
                      <KeyRoundIcon className="size-3.5" />
                    )}
                    <span>一键授权进入管理后台</span>
                  </button>
                </div>
              )}

              {!needsSetup && frontendUser && frontendUser.role !== 'admin' && (
                <div className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  前台当前已登录普通用户 <span className="font-mono font-bold">@{frontendUser.username}</span>；此处登录管理员不会覆盖您的前台会话。
                </div>
              )}

              {needsSetup && remoteBlocked && (
                <div className="flex items-start gap-2.5 border border-red-500/60 bg-red-500/10 p-3.5 text-xs leading-relaxed text-red-700 dark:text-red-300">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    <div className="font-bold">公网无口令初始化已拦截</div>
                    <div>
                      为防止首次部署公网抢注，请先通过 <code>wrangler secret put BOOTSTRAP_SETUP_TOKEN</code> 配置初始化安全口令后再刷新此页面。
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400"
                >
                  {error}
                </div>
              )}

              <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                {needsSetup && requiresSetupToken && (
                  <div className="space-y-1.5">
                    <label htmlFor="admin-setup-token" className="block text-xs font-bold">
                      00. 初始化安全口令
                    </label>
                    <input
                      id="admin-setup-token"
                      type="password"
                      autoComplete="off"
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      placeholder="填写 BOOTSTRAP_SETUP_TOKEN"
                      className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 font-mono text-xs placeholder:text-zinc-500 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:placeholder:text-zinc-400 dark:focus:border-zinc-100"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="admin-user" className="block text-xs font-bold">
                    01. 管理员账号
                  </label>
                  <input
                    id="admin-user"
                    type="text"
                    autoComplete="username"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder={needsSetup ? '例如 admin（3~32 位字母数字）' : '管理员用户名或邮箱'}
                    className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 font-mono text-xs placeholder:text-zinc-500 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:placeholder:text-zinc-400 dark:focus:border-zinc-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin-pass" className="block text-xs font-bold">
                    02. 登录密码
                  </label>
                  <div className="relative">
                    <input
                      id="admin-pass"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={needsSetup ? 'new-password' : 'current-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="至少 6 位字符"
                      className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 pr-10 font-mono text-xs placeholder:text-zinc-500 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:placeholder:text-zinc-400 dark:focus:border-zinc-100"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                    >
                      {showPassword ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                    </button>
                  </div>
                </div>

                {needsSetup && (
                  <div className="space-y-1.5">
                    <label htmlFor="admin-pass-confirm" className="block text-xs font-bold">
                      03. 确认密码
                    </label>
                    <div className="relative">
                      <input
                        id="admin-pass-confirm"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="再次输入密码"
                        className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 pr-10 font-mono text-xs placeholder:text-zinc-500 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:placeholder:text-zinc-400 dark:focus:border-zinc-100"
                      />
                      <button
                        type="button"
                        aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                      >
                        {showConfirmPassword ? (
                          <EyeOffIcon className="size-3.5" />
                        ) : (
                          <EyeIcon className="size-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || (needsSetup && remoteBlocked)}
                className="flex h-10 w-full items-center justify-center gap-2 bg-zinc-950 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
              >
                {submitting ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
                <span>{needsSetup ? '初始化并进入后台' : '登录管理端'}</span>
                <ArrowRightIcon className="size-3.5" />
              </button>
            </form>
          )}

          <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <span className="inline-flex items-center gap-1">
              <ShieldCheckIcon className="size-3.5" />
              服务端独立管理凭证校验
            </span>
            <span>安全访问</span>
          </div>
        </div>
      </main>

      <footer className="flex h-10 items-center justify-between border-t border-zinc-200 px-6 text-xs text-zinc-500 dark:border-zinc-800">
        <span>系统状态：在线</span>
        <span>CASTDECK 管理后台</span>
      </footer>
    </div>
  )
}
