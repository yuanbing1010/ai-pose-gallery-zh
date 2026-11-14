import { useState, type FormEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeftIcon, ArrowRightIcon, LockIcon, ShieldCheckIcon } from 'lucide-react'
import { toast } from '@/lib/notifications'

export const Route = createFileRoute('/admin/login')({
  staticData: { title: '管理端登录' },
  component: AdminLoginPage,
})

function AdminLoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      toast.error('请输入管理员账号与密码')
      return
    }
    sessionStorage.setItem('pose_atlas_admin_auth', '1')
    toast.success('已进入管理端控制台')
    void navigate({ to: '/admin' })
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      {/* 顶部瑞士极简通栏 */}
      <header className="flex h-12 items-center justify-between border-b border-zinc-950 px-6 font-mono text-xs dark:border-zinc-200">
        <div className="flex items-center gap-3">
          <span className="bg-zinc-950 px-2 py-0.5 font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
            ADMIN // CONSOLE
          </span>
          <span className="text-zinc-500">CHARADECK ARCHIVE SYSTEM v2.4</span>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 border border-zinc-300 px-3 py-1 font-mono text-xs transition-colors hover:border-zinc-950 hover:bg-zinc-100 dark:border-zinc-800 dark:hover:border-zinc-200 dark:hover:bg-zinc-900"
        >
          <ArrowLeftIcon className="size-3.5" />
          <span>RETURN_FRONTEND · 返回用户前端</span>
        </Link>
      </header>

      {/* 中央瑞士网格登录框 */}
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="border border-zinc-950 bg-white dark:border-zinc-200 dark:bg-zinc-950">
          <div className="flex items-center justify-between border-b border-zinc-950 bg-zinc-100 px-5 py-3 font-mono text-xs dark:border-zinc-200 dark:bg-zinc-900">
            <span className="font-bold">AUTH_GATE // 01_LOGIN</span>
            <LockIcon className="size-3.5" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 p-6">
            <div>
              <div className="font-mono text-[10px] tracking-widest text-zinc-500 uppercase">
                SWISS ARCHIVE MANAGEMENT
              </div>
              <h1 className="mt-1 text-xl font-bold tracking-tight">管理后台系统登录</h1>
              <p className="mt-1 text-xs text-zinc-500">
                管理端采用瑞士极简高密度网格规范，与用户创意前端独立运行。
              </p>
            </div>

            <div className="space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <div className="space-y-1.5">
                <label htmlFor="admin-user" className="block font-mono text-xs font-bold uppercase">
                  01 / USERNAME · 管理员账号
                </label>
                <input
                  id="admin-user"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 font-mono text-xs outline-none focus:border-zinc-950 dark:border-zinc-700 dark:focus:border-zinc-100"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="admin-pass" className="block font-mono text-xs font-bold uppercase">
                  02 / PASSWORD · 访问密钥
                </label>
                <input
                  id="admin-pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-10 w-full rounded-none border border-zinc-300 bg-transparent px-3 font-mono text-xs outline-none focus:border-zinc-950 dark:border-zinc-700 dark:focus:border-zinc-100"
                />
              </div>
            </div>

            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-2 bg-zinc-950 font-mono text-xs font-bold text-white transition-opacity hover:opacity-90 dark:bg-zinc-100 dark:text-zinc-950"
            >
              <span>AUTHENTICATE · 登录管理端</span>
              <ArrowRightIcon className="size-3.5" />
            </button>
          </form>

          <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 px-5 py-2.5 font-mono text-[10px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
            <span className="inline-flex items-center gap-1">
              <ShieldCheckIcon className="size-3" />
              DEMO_CREDENTIALS_PREFILLED
            </span>
            <span>[DIRECT_ACCESS_READY]</span>
          </div>
        </div>
      </main>

      {/* 底部瑞士极简状态栏 */}
      <footer className="flex h-10 items-center justify-between border-t border-zinc-200 px-6 font-mono text-[11px] text-zinc-500 dark:border-zinc-800">
        <span>SYSTEM_STATUS: ONLINE</span>
        <span>SWISS_GRID_CONSOLE // 2026</span>
      </footer>
    </div>
  )
}
