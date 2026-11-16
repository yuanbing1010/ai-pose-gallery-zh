import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  LoaderCircleIcon,
  LockIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from 'lucide-react'
import { bootstrapAdminApi, fetchAdminBootstrapStatusApi } from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { useStudio } from '@/store/studioStore'

export const Route = createFileRoute('/admin/login')({
  staticData: { title: '管理端登录' },
  component: AdminLoginPage,
})

function AdminLoginPage() {
  const navigate = useNavigate()
  const { user, bootstrapLoaded, login, refreshBootstrap } = useStudio()

  const [checking, setChecking] = useState(true)
  const [connectError, setConnectError] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (bootstrapLoaded && user?.role === 'admin') {
      void navigate({ to: '/admin' })
    }
  }, [bootstrapLoaded, navigate, user])

  const checkStatus = useCallback(async () => {
    setChecking(true)
    setConnectError('')
    try {
      const res = await fetchAdminBootstrapStatusApi()
      setNeedsSetup(res.needsSetup)
    } catch (err) {
      setConnectError(
        err instanceof Error
          ? err.message
          : '无法连接后端服务，请确认已启动本地服务（pnpm dev 或 pnpm dev:worker）'
      )
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkStatus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [checkStatus])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!account.trim() || !password) {
      setError('请输入管理员账号与密码')
      return
    }
    if (needsSetup) {
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
        await bootstrapAdminApi({ username: account.trim(), password })
        await refreshBootstrap()
        toast.success('首个管理员账号已创建并登录')
      } else {
        await login(account.trim(), password, true)
        toast.success('已进入管理端控制台')
      }
      void navigate({ to: '/admin' })
    } catch (err) {
      setError(err instanceof Error ? err.message : '认证失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      {/* 顶部通栏 */}
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

      {/* 中央登录框 */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="border border-zinc-950 bg-white dark:border-zinc-200 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-950 bg-zinc-100 px-5 py-3 text-xs dark:border-zinc-200 dark:bg-zinc-900">
            <span className="font-bold">
              {connectError
                ? '安全网关 · 连接异常'
                : needsSetup
                  ? '安全网关 · 初始化管理员'
                  : '安全网关 · 管理员登录'}
            </span>
            <LockIcon className="size-3.5" />
          </div>

          {checking ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-zinc-500">
              <LoaderCircleIcon className="size-4 animate-spin" />
              <span>正在检查系统初始化状态…</span>
            </div>
          ) : connectError ? (
            <div className="space-y-4 p-6">
              <div className="flex items-start gap-2.5 border border-amber-500/60 bg-amber-500/10 p-3.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-1.5">
                  <div className="font-bold">后端服务未连通</div>
                  <div>{connectError}</div>
                  <div className="font-mono text-[11px] opacity-85">
                    本地开发请停止仅前端进程后运行：<code>pnpm dev</code>（或另开终端运行{' '}
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
                <div className="text-[11px] tracking-wide text-zinc-500">管理端认证</div>
                <h1 className="mt-1 text-xl font-bold tracking-tight">
                  {needsSetup ? '初始化首个管理员账号' : '管理后台系统登录'}
                </h1>
                <p className="mt-1 text-xs text-zinc-500">
                  {needsSetup
                    ? '当前数据库尚无管理员（无默认密码），请直接设置您的首个管理员账号与密码以进入后台。'
                    : '管理端会话受服务端安全凭证校验保护。'}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-400"
                >
                  {error}
                </div>
              )}

              <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
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
                    className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 font-mono text-xs outline-none focus:border-zinc-950 dark:border-zinc-700 dark:focus:border-zinc-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="admin-pass" className="block text-xs font-bold">
                    02. 登录密码
                  </label>
                  <input
                    id="admin-pass"
                    type="password"
                    autoComplete={needsSetup ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 6 位字符"
                    className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 font-mono text-xs outline-none focus:border-zinc-950 dark:border-zinc-700 dark:focus:border-zinc-100"
                  />
                </div>

                {needsSetup && (
                  <div className="space-y-1.5">
                    <label htmlFor="admin-pass-confirm" className="block text-xs font-bold">
                      03. 确认密码
                    </label>
                    <input
                      id="admin-pass-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="再次输入密码"
                      className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 font-mono text-xs outline-none focus:border-zinc-950 dark:border-zinc-700 dark:focus:border-zinc-100"
                    />
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="flex h-10 w-full items-center justify-center gap-2 bg-zinc-950 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
              >
                {submitting ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
                <span>{needsSetup ? '初始化并进入后台' : '登录管理端'}</span>
                <ArrowRightIcon className="size-3.5" />
              </button>
            </form>
          )}

          <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-2.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <span className="inline-flex items-center gap-1">
              <ShieldCheckIcon className="size-3" />
              服务端加密会话校验
            </span>
            <span>安全访问</span>
          </div>
        </div>
      </main>

      {/* 底部状态栏 */}
      <footer className="flex h-10 items-center justify-between border-t border-zinc-200 px-6 text-[11px] text-zinc-500 dark:border-zinc-800">
        <span>系统状态：在线</span>
        <span>CASTDECK 管理后台 · 2026</span>
      </footer>
    </div>
  )
}
