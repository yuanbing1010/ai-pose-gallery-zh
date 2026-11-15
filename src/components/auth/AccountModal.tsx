import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import {
  CoinsIcon,
  HistoryIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogOutIcon,
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
    accountModalOpen,
    accountModalTab,
    openAccountModal,
    closeAccountModal,
    redeemCode,
    logout,
    history,
  } = useStudio()

  const [code, setCode] = useState('')
  const [redeeming, setRedeeming] = useState(false)

  const [ledger, setLedger] = useState<CreditLedgerItem[]>([])
  const [loadingLedger, setLoadingLedger] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  useEffect(() => {
    if (!accountModalOpen || !user || accountModalTab !== 'ledger') return
    let active = true
    const run = async () => {
      setLoadingLedger(true)
      try {
        const res = await fetchLedgerApi(50)
        if (active) setLedger(res.items)
      } catch {
        // ignore
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
  }, [accountModalOpen, accountModalTab, user])

  if (!user) return null

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
    if (!currentPassword || newPassword.length < 6) {
      toast.error('请输入当前密码以及至少 6 位的新密码')
      return
    }
    setSavingPwd(true)
    try {
      await changePasswordApi({ currentPassword, newPassword })
      setCurrentPassword('')
      setNewPassword('')
      toast.success('密码已修改')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败')
    } finally {
      setSavingPwd(false)
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
    { id: 'security', label: '安全改密', icon: KeyRoundIcon },
  ]

  return (
    <Dialog open={accountModalOpen} onOpenChange={(open) => !open && closeAccountModal()}>
      <DialogContent className="max-h-[90dvh] w-[95vw] max-w-xl overflow-y-auto rounded-2xl p-5 sm:max-w-xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold">
              <span>{user.displayName}</span>
              {user.role === 'admin' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 font-mono text-[11px] font-semibold text-background">
                  <ShieldCheckIcon className="size-3" />
                  ADMIN
                </span>
              )}
            </DialogTitle>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[#E5A918]/40 bg-[#E5A918]/12 px-3 py-1 font-mono text-xs font-bold text-[#9A6B00] dark:text-[#E5A918]">
              <CoinsIcon className="size-3.5" />
              <span>{user.creditBalance} 积分</span>
            </div>
          </div>
          <DialogDescription className="font-mono text-xs text-muted-foreground">
            @{user.username}
            {user.email ? ` · ${user.email}` : ''}
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
                onClick={() => openAccountModal(t.id)}
                className={cn(
                  'flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors',
                  active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{t.label}</span>
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
                  className="mt-2 text-xs font-semibold text-[#D9381E] hover:underline"
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
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {formatTime(item.createdAt)} · 余额 {item.balanceAfter}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 font-mono text-sm font-bold tabular-nums',
                        item.delta >= 0
                          ? 'text-[#116E65] dark:text-[#4FD1C5]'
                          : 'text-[#D9381E] dark:text-[#FF7A59]'
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
          <form onSubmit={handleChangePassword} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="acct-cur-pwd" className="text-xs font-semibold">
                当前密码
              </Label>
              <Input
                id="acct-cur-pwd"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-new-pwd" className="text-xs font-semibold">
                新密码（至少 6 位）
              </Label>
              <Input
                id="acct-new-pwd"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-9 rounded-xl text-xs"
              />
            </div>
            <Button type="submit" disabled={savingPwd} className="h-9 w-full rounded-xl text-xs font-bold">
              {savingPwd ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              <span>保存新密码</span>
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
