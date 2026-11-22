import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  CoinsIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogOutIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  TicketIcon,
  UserRoundIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { changePasswordApi, fetchLedgerApi } from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { cn } from '@/lib/utils'
import { useStudio, type AccountModalTab } from '@/store/studioStore'
import type { CreditLedgerItem, CreditLedgerType } from '@/types/gallery'
import { WechatIcon } from './WechatIcon'
import { WechatQrPanel } from './WechatQrPanel'

const LEDGER_LABELS: Record<CreditLedgerType, string> = {
  register_bonus: '注册赠送',
  redeem_code: '卡密兑换',
  admin_adjust: '后台调整',
  generate_deduct: '生图消耗',
  generate_refund: '失败退还',
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AccountModal() {
  const {
    user,
    wechatLogin,
    accountModalOpen,
    accountModalTab,
    openAccountModal,
    closeAccountModal,
    refreshBootstrap,
    redeemCode,
    unbindWechat,
    logout,
    history,
  } = useStudio()

  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  const [ledger, setLedger] = useState<CreditLedgerItem[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)
  const [ledgerError, setLedgerError] = useState('')
  const [ledgerReloadTick, setLedgerReloadTick] = useState(0)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showCurPwd, setShowCurPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [savingPwd, setSavingPwd] = useState(false)

  const [bindingWechat, setBindingWechat] = useState(false)
  const [confirmingUnbind, setConfirmingUnbind] = useState(false)
  const [unbindingWechat, setUnbindingWechat] = useState(false)
  const [avatarErrorForUrl, setAvatarErrorForUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!accountModalOpen || !user || accountModalTab !== 'ledger') return
    let active = true
    const run = async () => {
      setLoadingLedger(true)
      setLedgerError('')
      try {
        const res = await fetchLedgerApi(50)
        if (active) setLedger(res.items)
      } catch (err) {
        if (active) setLedgerError(err instanceof Error ? err.message : '积分流水加载失败')
      } finally {
        if (active) setLoadingLedger(false)
      }
    }
    const timer = window.setTimeout(() => {
      void run()
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [accountModalOpen, accountModalTab, user, ledgerReloadTick])

  const hasPassword = user?.hasPassword !== false
  const wechatReady = Boolean(wechatLogin.enabled && wechatLogin.configured)
  const showAvatar = Boolean(user?.avatarUrl && avatarErrorForUrl !== user.avatarUrl)

  const handleRedeem = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) {
      toast.error('请输入积分兑换码')
      return
    }
    setRedeeming(true)
    try {
      const res = await redeemCode(code.trim())
      setCode('')
      toast.success(`兑换成功！获得 ${res.credits} 积分，当前余额 ${res.creditBalance} 积分`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '兑换失败')
    } finally {
      setRedeeming(false)
    }
  }

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (hasPassword && !currentPassword) {
      toast.error('请输入当前密码')
      return
    }
    if (newPassword.length < 6) {
      toast.error('新密码长度至少为 6 位')
      return
    }
    if (newPassword !== confirmNewPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setSavingPwd(true)
    try {
      await changePasswordApi({
        ...(hasPassword ? { currentPassword } : {}),
        newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setShowCurPwd(false)
      setShowNewPwd(false)
      await refreshBootstrap()
      toast.success(hasPassword ? '密码已修改' : '登录密码已设置')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败')
    } finally {
      setSavingPwd(false)
    }
  }

  const handleUnbindWechat = async () => {
    setUnbindingWechat(true)
    try {
      await unbindWechat()
      setConfirmingUnbind(false)
      toast.success('已解除微信账号绑定')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '解绑失败')
    } finally {
      setUnbindingWechat(false)
    }
  }

  const handleLogout = async () => {
    await logout()
    toast.success('已退出登录')
  }

  const tabs: Array<{ id: AccountModalTab; label: string; icon: typeof UserRoundIcon }> = [
    { id: 'overview', label: '账户概览', icon: UserRoundIcon },
    { id: 'redeem', label: '积分兑换', icon: TicketIcon },
    { id: 'ledger', label: '积分流水', icon: HistoryIcon },
    { id: 'security', label: '安全设置', icon: KeyRoundIcon },
  ]

  return (
    <Dialog
      open={accountModalOpen && Boolean(user)}
      onOpenChange={(open) => {
        if (!open) {
          setCurrentPassword('')
          setNewPassword('')
          setConfirmNewPassword('')
          setShowCurPwd(false)
          setShowNewPwd(false)
          setShowConfirmPwd(false)
          setBindingWechat(false)
          setConfirmingUnbind(false)
          closeAccountModal()
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-xl overflow-y-auto rounded-2xl p-4 sm:max-w-xl sm:p-5">
        {user ? (
        <>
        <DialogHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-base font-extrabold">
              {showAvatar && user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarErrorForUrl(user.avatarUrl || null)}
                  className="size-7 shrink-0 rounded-full border border-border object-cover"
                />
              ) : null}
              <span className="truncate">{user.displayName}</span>
              {user.role === 'admin' && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-2 py-0.5 font-mono text-xs font-semibold text-background">
                  <ShieldCheckIcon className="size-3" />
                  ADMIN
                </span>
              )}
              {user.wechatBound && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#07C160]/12 px-2 py-0.5 text-xs font-semibold text-[#059449] dark:text-[#34D399]">
                  <WechatIcon className="size-3" />
                  <span>微信已绑定</span>
                </span>
              )}
            </DialogTitle>
            <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#E5A918]/40 bg-[#E5A918]/12 px-3 py-1 font-mono text-xs font-bold text-[#7A5200] dark:text-[#E5A918]">
              <CoinsIcon className="size-3.5" />
              <span>{user.creditBalance} 积分</span>
            </div>
          </div>
          <DialogDescription className="truncate font-mono text-xs text-muted-foreground">
            @{user.username}
            {user.email ? ` · ${user.email}` : ''}
            {user.wechatBound && user.wechatNickname ? ` · 微信：${user.wechatNickname}` : ''}
          </DialogDescription>
        </DialogHeader>

        {/* 选项卡 */}
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-muted/60 p-1">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = accountModalTab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setBindingWechat(false)
                  setConfirmingUnbind(false)
                  openAccountModal(t.id)
                }}
                className={cn(
                  'flex h-8 items-center justify-center gap-1 rounded-lg px-1.5 text-xs font-semibold whitespace-nowrap transition-colors sm:px-2',
                  active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="hidden size-3.5 shrink-0 sm:inline" />
                <span>{t.label}</span>
              </button>
            )
          })}
        </div>

        {accountModalTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-[#FAF8F4] p-4 dark:bg-muted/30">
                <div className="text-xs text-muted-foreground">可用积分余额</div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-foreground">
                  {user.creditBalance}
                </div>
                <button
                  type="button"
                  onClick={() => openAccountModal('redeem')}
                  className="mt-2 text-xs font-semibold text-[#B82914] hover:underline dark:text-[#FF7A59]"
                >
                  使用兑换码充值 →
                </button>
              </div>
              <div className="rounded-xl border border-border bg-[#FAF8F4] p-4 dark:bg-muted/30">
                <div className="text-xs text-muted-foreground">云端已存作品</div>
                <div className="mt-1 font-mono text-2xl font-extrabold text-foreground">
                  {history.filter((h) => h.status === 'succeeded').length}
                </div>
                <Link
                  to="/studio"
                  onClick={() => closeAccountModal()}
                  className="mt-2 inline-block text-xs font-semibold text-[#116E65] hover:underline dark:text-[#4FD1C5]"
                >
                  前往合成台查看 →
                </Link>
              </div>
            </div>

            {(wechatReady || user.wechatBound) && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-[#FAF8F4] px-3.5 py-2.5 text-xs dark:bg-muted/30">
                <div className="flex min-w-0 items-center gap-2">
                  <WechatIcon className="size-4 text-[#07C160]" />
                  <span className="truncate text-muted-foreground">
                    {user.wechatBound
                      ? `已绑定微信（${user.wechatNickname || '微信用户'}）${!hasPassword ? ' · 建议设置登录密码' : ''}`
                      : '尚未绑定微信，绑定后支持微信扫码快捷登录'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openAccountModal('security')}
                  className="shrink-0 font-semibold text-[#059449] hover:underline dark:text-[#34D399]"
                >
                  {user.wechatBound ? '管理绑定 →' : '立即绑定 →'}
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              {user.role === 'admin' ? (
                <Button variant="outline" size="sm" asChild className="rounded-xl text-xs">
                  <Link to="/admin" onClick={() => closeAccountModal()}>
                    <ShieldCheckIcon className="size-3.5" />
                    进入管理控制台
                  </Link>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  遇到生图失败时，扣除的积分将自动全额退还
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleLogout()}
                className="rounded-xl text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOutIcon className="size-3.5" />
                退出登录
              </Button>
            </div>
          </div>
        )}

        {accountModalTab === 'redeem' && (
          <form onSubmit={handleRedeem} className="space-y-4">
            <div className="rounded-xl border border-border bg-[#FAF8F4] p-4 text-xs leading-relaxed text-muted-foreground dark:bg-muted/30">
              输入管理员发放的积分兑换码（例如 <code className="font-mono font-semibold text-foreground">POSE-XXXX-XXXX</code>），积分将立即充入当前账号。
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="redeem-code-input" className="text-xs font-semibold">
                积分兑换码
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="redeem-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="POSE-XXXX-XXXX"
                  className="h-10 rounded-xl font-mono text-xs uppercase"
                />
                <Button
                  type="submit"
                  disabled={redeeming}
                  className="h-10 shrink-0 rounded-xl bg-[#D9381E] px-5 text-xs font-bold text-white hover:bg-[#C23018]"
                >
                  {redeeming ? <LoaderCircleIcon className="size-4 animate-spin" /> : '立即兑换'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {accountModalTab === 'ledger' && (
          <div className="space-y-2">
            {loadingLedger ? (
              <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
                <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                正在加载流水记录…
              </div>
            ) : ledgerError ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/35 bg-destructive/10 py-6 text-center text-xs text-destructive">
                <span>{ledgerError}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setLedgerReloadTick((n) => n + 1)}
                  className="h-7 rounded-lg text-xs text-foreground"
                >
                  <RotateCcwIcon className="size-3" />
                  <span>重试加载</span>
                </Button>
              </div>
            ) : ledger.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">暂无积分变动记录</div>
            ) : (
              <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {ledger.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-foreground">
                          {LEDGER_LABELS[item.type]}
                        </span>
                        <span className="truncate text-muted-foreground">{item.note}</span>
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {formatTime(item.createdAt)} · 余额 {item.balanceAfter}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-sm font-bold tabular-nums',
                        item.delta >= 0
                          ? 'text-[#116E65] dark:text-[#4FD1C5]'
                          : 'text-[#B82914] dark:text-[#FF7A59]'
                      )}
                    >
                      {item.delta >= 0 ? `+${item.delta}` : item.delta}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {accountModalTab === 'security' && (
          bindingWechat && wechatReady ? (
            <WechatQrPanel
              intent="bind"
              title="扫码绑定微信账号"
              subtitle="绑定后可直接使用微信扫码快捷登录当前账号"
              backLabel="返回安全设置"
              onBack={() => setBindingWechat(false)}
            />
          ) : (
            <div className="space-y-4">
              {(wechatReady || user.wechatBound) && (
                <div className="rounded-xl border border-border bg-[#FAF8F4] p-3.5 dark:bg-muted/30">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#07C160]/15 text-[#059449] dark:text-[#34D399]">
                        <WechatIcon className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-foreground">
                          {user.wechatBound ? '已绑定微信账号' : '绑定微信账号'}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {user.wechatBound
                            ? `微信昵称：${user.wechatNickname || '微信用户'}`
                            : '绑定后可直接使用微信扫码快捷登录'}
                        </div>
                      </div>
                    </div>

                    {user.wechatBound ? (
                      confirmingUnbind ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={unbindingWechat || !hasPassword}
                            onClick={() => void handleUnbindWechat()}
                            className="h-7 rounded-lg text-xs"
                          >
                            {unbindingWechat ? (
                              <LoaderCircleIcon className="size-3 animate-spin" />
                            ) : null}
                            <span>确认解绑</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={unbindingWechat}
                            onClick={() => setConfirmingUnbind(false)}
                            className="h-7 rounded-lg text-xs"
                          >
                            取消
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!hasPassword}
                          onClick={() => setConfirmingUnbind(true)}
                          className="h-7 rounded-lg text-xs"
                        >
                          解除绑定
                        </Button>
                      )
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => setBindingWechat(true)}
                        className="h-7 rounded-lg bg-[#07C160] text-xs font-semibold text-white hover:bg-[#06AD56]"
                      >
                        <WechatIcon className="size-3.5" />
                        <span>立即扫码绑定</span>
                      </Button>
                    )}
                  </div>

                  {user.wechatBound && !hasPassword && (
                    <div className="mt-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-300">
                      解绑微信前请先在下方设置账号登录密码，以免解绑后无法登录。
                    </div>
                  )}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-3.5">
                {!hasPassword && (
                  <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                    当前账号通过微信快捷注册，尚未设置密码。设置后可使用用户名{' '}
                    <code className="font-mono font-semibold text-foreground">@{user.username}</code> + 密码登录。
                  </div>
                )}

                {hasPassword && (
                  <div className="space-y-1.5">
                    <Label htmlFor="acct-cur-pwd" className="text-xs font-semibold">
                      当前密码
                    </Label>
                    <div className="relative">
                      <Input
                        id="acct-cur-pwd"
                        type={showCurPwd ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="h-9 rounded-xl pr-9 text-xs"
                      />
                      <button
                        type="button"
                        aria-label={showCurPwd ? '隐藏当前密码' : '显示当前密码'}
                        onClick={() => setShowCurPwd((v) => !v)}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {showCurPwd ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="acct-new-pwd" className="text-xs font-semibold">
                      {hasPassword ? '新密码（至少 6 位）' : '设置登录密码（至少 6 位）'}
                    </Label>
                    <div className="relative">
                      <Input
                        id="acct-new-pwd"
                        type={showNewPwd ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-9 rounded-xl pr-9 text-xs"
                      />
                      <button
                        type="button"
                        aria-label={showNewPwd ? '隐藏新密码' : '显示新密码'}
                        onClick={() => setShowNewPwd((v) => !v)}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPwd ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="acct-confirm-pwd" className="text-xs font-semibold">
                      确认密码
                    </Label>
                    <div className="relative">
                      <Input
                        id="acct-confirm-pwd"
                        type={showConfirmPwd ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="再次输入密码"
                        className="h-9 rounded-xl pr-9 text-xs"
                      />
                      <button
                        type="button"
                        aria-label={showConfirmPwd ? '隐藏确认密码' : '显示确认密码'}
                        onClick={() => setShowConfirmPwd((v) => !v)}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPwd ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <Button type="submit" disabled={savingPwd} className="h-9 w-full rounded-xl text-xs font-bold">
                  {savingPwd ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
                  <span>{hasPassword ? '保存新密码' : '设置登录密码'}</span>
                </Button>
              </form>
            </div>
          )
        )}
        </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
