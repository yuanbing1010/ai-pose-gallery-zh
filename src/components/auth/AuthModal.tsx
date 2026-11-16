import { useState, type FormEvent } from 'react'
import { EyeIcon, EyeOffIcon, KeyRoundIcon, LoaderCircleIcon, SparklesIcon, UserPlusIcon } from 'lucide-react'
import { BrandMark } from '@/components/common/BrandMark'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'

export function AuthModal() {
  const {
    authModalOpen,
    authModalTab,
    platform,
    openAuthModal,
    closeAuthModal,
    login,
    register,
  } = useStudio()

  const [account, setAccount] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setError('')
      setPassword('')
      setConfirmPassword('')
      setShowPassword(false)
      setShowConfirmPassword(false)
      closeAuthModal()
    }
  }

  const switchTab = (tab: 'login' | 'register') => {
    setError('')
    setPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowConfirmPassword(false)
    openAuthModal(tab)
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    if (!account.trim() || !password) {
      setError('请输入账号与密码')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const user = await login(account.trim(), password)
      setPassword('')
      toast.success(`欢迎回来，${user.displayName}（剩余 ${user.creditBalance} 积分）`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password) {
      setError('请填写用户名和密码')
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
    setSubmitting(true)
    setError('')
    try {
      const user = await register({
        username: username.trim(),
        email: email.trim() || undefined,
        displayName: displayName.trim() || undefined,
        password,
      })
      setPassword('')
      setConfirmPassword('')
      toast.success(
        platform.registerBonusCredits > 0
          ? `注册成功！已赠送 ${platform.registerBonusCredits} 积分`
          : '注册成功！'
      )
      if (user.role === 'admin') {
        toast.info('您拥有管理员权限')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={authModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6">
        <DialogHeader className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <DialogTitle className="text-lg font-extrabold tracking-tight">
              {authModalTab === 'login' ? '登录 CASTDECK 创作账号' : '注册 CASTDECK 创作账号'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            登录后可使用云端 AI 画师生成角色立绘，并在云端持久保存全部创作作品与配方记录。
          </DialogDescription>
        </DialogHeader>

        {/* 登录 / 注册切换 */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border bg-muted/60 p-1">
          <button
            type="button"
            onClick={() => switchTab('login')}
            className={cn(
              'flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors',
              authModalTab === 'login'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <KeyRoundIcon className="size-3.5" />
            <span>登录账号</span>
          </button>
          <button
            type="button"
            onClick={() => switchTab('register')}
            className={cn(
              'flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors',
              authModalTab === 'register'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <UserPlusIcon className="size-3.5" />
            <span>注册账号</span>
          </button>
        </div>

        {authModalTab === 'register' && platform.registerBonusCredits > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-[#E5A918]/40 bg-[#E5A918]/10 px-3 py-2 text-xs font-medium text-foreground">
            <SparklesIcon className="size-3.5 shrink-0 text-[#7A5200] dark:text-[#E5A918]" />
            <span>新用户注册立即赠送 {platform.registerBonusCredits} 积分，立即可用！</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </div>
        )}

        {authModalTab === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="auth-account" className="text-xs font-semibold">
                用户名或邮箱
              </Label>
              <Input
                id="auth-account"
                autoComplete="username"
                value={account}
                onChange={(e) => {
                  setAccount(e.target.value)
                  if (error) setError('')
                }}
                placeholder="输入用户名或邮箱"
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-login-password" className="text-xs font-semibold">
                密码
              </Label>
              <div className="relative">
                <Input
                  id="auth-login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    if (error) setError('')
                  }}
                  placeholder="输入密码"
                  className="h-9 rounded-xl pr-9 text-xs"
                />
                <button
                  type="button"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="ks-keycap h-10 w-full rounded-xl border-0 bg-[#D9381E] text-xs font-bold text-white hover:bg-[#C23018]"
            >
              {submitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              <span>{submitting ? '正在登录…' : '立即登录'}</span>
            </Button>
          </form>
        ) : !platform.allowRegistration ? (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-center text-xs text-muted-foreground">
            管理员当前已关闭自助注册，请联系管理员为您开通账号。
          </div>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="auth-reg-username" className="text-xs font-semibold">
                用户名 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="auth-reg-username"
                autoComplete="username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (error) setError('')
                }}
                placeholder="3~32 位字母、数字、下划线"
                className="h-9 rounded-xl font-mono text-xs"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="auth-reg-display" className="text-xs font-semibold">
                  昵称（可选）
                </Label>
                <Input
                  id="auth-reg-display"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="展示名称"
                  className="h-9 rounded-xl text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-reg-email" className="text-xs font-semibold">
                  邮箱（可选）
                </Label>
                <Input
                  id="auth-reg-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="可用于登录"
                  className="h-9 rounded-xl text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="auth-reg-password" className="text-xs font-semibold">
                  密码 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="auth-reg-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (error) setError('')
                    }}
                    placeholder="至少 6 位字符"
                    className="h-9 rounded-xl pr-9 text-xs"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="auth-reg-confirm" className="text-xs font-semibold">
                  确认密码 <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="auth-reg-confirm"
                    type={showConfirmPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      if (error) setError('')
                    }}
                    placeholder="再次输入密码"
                    className="h-9 rounded-xl pr-9 text-xs"
                  />
                  <button
                    type="button"
                    aria-label={showConfirmPassword ? '隐藏确认密码' : '显示确认密码'}
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="ks-keycap h-10 w-full rounded-xl border-0 bg-[#D9381E] text-xs font-bold text-white hover:bg-[#C23018]"
            >
              {submitting ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              <span>{submitting ? '正在创建账号…' : '完成注册并登录'}</span>
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
