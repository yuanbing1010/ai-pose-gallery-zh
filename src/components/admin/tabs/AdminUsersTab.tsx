import { useCallback, useEffect, useState } from 'react'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CoinsIcon,
  CopyIcon,
  DicesIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  PencilIcon,
  SearchIcon,
  UserPlusIcon,
} from 'lucide-react'
import { WechatIcon } from '@/components/auth/WechatIcon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  adjustUserCreditsApi,
  createAdminUserApi,
  fetchAdminLedgerApi,
  fetchAdminUsersApi,
  updateAdminUserApi,
  updateUserStatusApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { useStudio } from '@/store/studioStore'
import type { AdminUserItem, CreditLedgerItem, PublicUser, UserRole, UserStatus } from '@/types/gallery'
import {
  AdminBadge,
  AdminField,
  AdminFilterBar,
  AdminPageHeader,
  AdminPanel,
} from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_DIALOG_CLS,
  ADMIN_INPUT_CLS,
  ADMIN_SELECT_CLS,
  ADMIN_TEXT_INPUT_CLS,
  LEDGER_TYPE_LABELS,
  formatAdminDateTime,
  generateRandomPassword,
  type AdminConfirmAction,
} from '../auditHelpers'

type UsersFilter = 'all' | 'active' | 'disabled' | 'admin'
type UsersSubView = 'members' | 'ledger'

interface AdminUsersTabProps {
  currentUser: PublicUser
  reloadTick: number
  autoOpenCreate?: boolean
  onAutoOpenConsumed?: () => void
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onRefreshBootstrap: () => Promise<void>
}

export function AdminUsersTab({
  currentUser,
  reloadTick,
  autoOpenCreate = false,
  onAutoOpenConsumed,
  onLoadingChange,
  onConfirm,
  onRefreshBootstrap,
}: AdminUsersTabProps) {
  const { platform } = useStudio()
  const defaultBonusCredits = String(platform.registerBonusCredits ?? 50)
  const [subView, setSubView] = useState<UsersSubView>('members')
  const [userQuery, setUserQuery] = useState('')
  const [appliedUserQuery, setAppliedUserQuery] = useState('')
  const [userFilter, setUserFilter] = useState<UsersFilter>('all')
  const [usersOffset, setUsersOffset] = useState(0)
  const [users, setUsers] = useState<AdminUserItem[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [ledger, setLedger] = useState<CreditLedgerItem[]>([])
  const [busyList, setBusyList] = useState(false)

  // 新建成员弹窗
  const [createOpen, setCreateOpen] = useState(() => autoOpenCreate)
  const [createUsername, setCreateUsername] = useState('')
  const [createAdminNote, setCreateAdminNote] = useState('')
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState(() => generateRandomPassword(10))
  const [createCredits, setCreateCredits] = useState(() => defaultBonusCredits)
  const [createRole, setCreateRole] = useState<UserRole>('user')
  const [showCreatePwd, setShowCreatePwd] = useState(true)
  const [creatingUser, setCreatingUser] = useState(false)
  const [createdCredential, setCreatedCredential] = useState<{
    username: string
    password: string
    adminNote: string
    displayName: string
    creditBalance: number
  } | null>(null)

  // 编辑成员（备注/昵称/改密/状态/角色）弹窗
  const [editTarget, setEditTarget] = useState<AdminUserItem | null>(null)
  const [editAdminNote, setEditAdminNote] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editNewPassword, setEditNewPassword] = useState('')
  const [showEditPwd, setShowEditPwd] = useState(true)
  const [editRole, setEditRole] = useState<UserRole>('user')
  const [editStatus, setEditStatus] = useState<UserStatus>('active')
  const [savingEdit, setSavingEdit] = useState(false)

  // 调整积分弹窗
  const [adjustTarget, setAdjustTarget] = useState<AdminUserItem | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('100')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  const loadData = useCallback(async () => {
    setBusyList(true)
    onLoadingChange(true)
    try {
      const [uRes, lRes] = await Promise.all([
        fetchAdminUsersApi(appliedUserQuery.trim(), 60, usersOffset, userFilter),
        fetchAdminLedgerApi(80),
      ])
      setUsers(uRes.users)
      setUsersTotal(uRes.total)
      setLedger(lRes.items)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载成员与流水失败')
    } finally {
      setBusyList(false)
      onLoadingChange(false)
    }
  }, [appliedUserQuery, onLoadingChange, userFilter, usersOffset])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedUserQuery(userQuery)
      setUsersOffset(0)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [userQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData, reloadTick])

  const openCreateDialog = useCallback(() => {
    setCreatedCredential(null)
    setCreateUsername('')
    setCreateAdminNote('')
    setCreateDisplayName('')
    setCreateEmail('')
    setCreatePassword(generateRandomPassword(10))
    setCreateCredits(defaultBonusCredits)
    setCreateRole('user')
    setShowCreatePwd(true)
    setCreateOpen(true)
  }, [defaultBonusCredits])

  const handleCreateUser = async () => {
    const username = createUsername.trim()
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
      toast.error('用户名需为 3~32 位字母、数字、下划线或点/连字符')
      return
    }
    if (createPassword.length < 6 || createPassword.length > 128) {
      toast.error('初始密码长度需在 6~128 位之间')
      return
    }
    const credits = Number(createCredits)
    if (!Number.isInteger(credits) || credits < 0 || credits > 1_000_000) {
      toast.error('初始积分必须为 0~1000000 的整数')
      return
    }
    setCreatingUser(true)
    try {
      const res = await createAdminUserApi({
        username,
        password: createPassword,
        adminNote: createAdminNote.trim(),
        displayName: createDisplayName.trim() || undefined,
        email: createEmail.trim() || undefined,
        initialCredits: credits,
        role: createRole,
      })
      setCreatedCredential({
        username: res.user.username,
        password: createPassword,
        adminNote: res.user.adminNote,
        displayName: res.user.displayName,
        creditBalance: res.user.creditBalance,
      })
      toast.success(`已创建成员账号 @${res.user.username}`)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建账号失败')
    } finally {
      setCreatingUser(false)
    }
  }

  const copyCredentialText = async (username: string, password: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const lines = [
      'CASTDECK 账号登录信息',
      ...(origin ? [`登录地址：${origin}`] : []),
      `用户名：${username}`,
      `密码：${password}`,
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success('已复制账号登录信息')
    } catch {
      toast.error('剪贴板复制失败')
    }
  }

  const openEditDialog = (u: AdminUserItem) => {
    setEditTarget(u)
    setEditAdminNote(u.adminNote || '')
    setEditDisplayName(u.displayName)
    setEditNewPassword('')
    setShowEditPwd(true)
    setEditRole(u.role)
    setEditStatus(u.status)
  }

  const handleSaveEditUser = async () => {
    if (!editTarget) return
    if (editNewPassword && (editNewPassword.length < 6 || editNewPassword.length > 128)) {
      toast.error('重置密码长度需在 6~128 位之间')
      return
    }
    setSavingEdit(true)
    try {
      await updateAdminUserApi(editTarget.id, {
        adminNote: editAdminNote.trim(),
        displayName: editDisplayName.trim() || editTarget.displayName,
        ...(editNewPassword ? { newPassword: editNewPassword } : {}),
        ...(editTarget.id !== currentUser.id ? { role: editRole, status: editStatus } : {}),
      })
      toast.success(`已更新 @${editTarget.username} 的成员信息`)
      if (editTarget.id === currentUser.id) {
        await onRefreshBootstrap()
      }
      setEditTarget(null)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleToggleUserStatus = async (u: AdminUserItem) => {
    const nextStatus = u.status === 'active' ? 'disabled' : 'active'
    const exec = async () => {
      await updateUserStatusApi(u.id, { status: nextStatus })
      await loadData()
      toast.success(nextStatus === 'disabled' ? `已禁用账号 @${u.username}` : `已恢复账号 @${u.username}`)
    }
    if (nextStatus === 'disabled') {
      onConfirm({
        title: `禁用成员 @${u.username}${u.adminNote ? `（${u.adminNote}）` : ''}`,
        description: '禁用后该成员将立即下线且无法登录或发起生图任务，可随时再次启用恢复。',
        confirmLabel: '确认禁用',
        destructive: true,
        run: exec,
      })
      return
    }
    try {
      await exec()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleAdjustCredits = async () => {
    if (!adjustTarget) return
    const delta = Number(adjustDelta)
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error('请输入非零整数积分')
      return
    }
    setAdjusting(true)
    try {
      await adjustUserCreditsApi(adjustTarget.id, delta, adjustNote.trim())
      setAdjustTarget(null)
      setAdjustNote('')
      await loadData()
      if (adjustTarget.id === currentUser.id) await onRefreshBootstrap()
      toast.success(
        `已为 @${adjustTarget.username} ${delta > 0 ? '充值' : '扣减'} ${Math.abs(delta)} 积分`
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '调整失败')
    } finally {
      setAdjusting(false)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`成员账号与积分账本 (${usersTotal})`}
        description="支持管理员新建成员账号、维护仅后台可见的内部备注、重置密码、手动调积分与审查流水。"
        actions={
          <Button type="button" size="sm" className={ADMIN_BTN_CLS} onClick={openCreateDialog}>
            <UserPlusIcon className="size-3.5" />
            新建成员账号
          </Button>
        }
      />

      <AdminFilterBar
        options={[
          { id: 'members', label: `成员账号 (${usersTotal})` },
          { id: 'ledger', label: `近期积分流水 (${ledger.length})` },
        ]}
        value={subView}
        onChange={setSubView}
        rightSlot={
          subView === 'members' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setUsersOffset(0)
                if (appliedUserQuery === userQuery && usersOffset === 0) {
                  void loadData()
                } else {
                  setAppliedUserQuery(userQuery)
                }
              }}
              className="flex items-center gap-1.5"
            >
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={userQuery}
                  onChange={(e) => setUserQuery(e.target.value)}
                  placeholder="搜用户名 / 备注 / 邮箱…"
                  className="h-8 w-52 rounded-none pl-8 font-mono text-xs sm:w-60"
                />
              </div>
              <Button type="submit" size="sm" variant="outline" className={ADMIN_BTN_CLS}>
                查询
              </Button>
            </form>
          ) : null
        }
      />

      {subView === 'members' ? (
        <div className="space-y-4">
          <AdminFilterBar
            options={[
              { id: 'all', label: '全部状态' },
              { id: 'active', label: '正常活跃' },
              { id: 'disabled', label: '已禁用' },
              { id: 'admin', label: '管理员' },
            ]}
            value={userFilter}
            onChange={(next) => {
              setUserFilter(next)
              setUsersOffset(0)
            }}
          />

          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 font-mono text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2.5">成员 / 内部备注</th>
                  <th className="px-4 py-2.5">角色</th>
                  <th className="px-4 py-2.5">积分余额</th>
                  <th className="px-4 py-2.5">生图数</th>
                  <th className="px-4 py-2.5">状态</th>
                  <th className="px-4 py-2.5">最近登录 / 创建</th>
                  <th className="px-4 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-xs text-zinc-500">
                      {appliedUserQuery.trim()
                        ? `未找到匹配“${appliedUserQuery.trim()}”的成员账号。`
                        : '当前筛选下暂无成员账号，可点击右上角「新建成员账号」创建账号。'}
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-zinc-950 dark:text-zinc-100">
                            {u.displayName}
                          </span>
                          {u.adminNote ? (
                            <AdminBadge tone="info" title="管理员内部备注（仅后台可见）">
                              备注：{u.adminNote}
                            </AdminBadge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openEditDialog(u)}
                              className="border border-dashed border-zinc-300 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-700 dark:border-zinc-700 dark:hover:border-zinc-300 dark:hover:text-zinc-200"
                            >
                              + 加备注
                            </button>
                          )}
                          {u.wechatBound && (
                            <AdminBadge
                              tone="success"
                              title={u.wechatNickname ? `微信：${u.wechatNickname}` : '已绑定微信'}
                            >
                              <WechatIcon className="size-2.5" />
                              <span>微信</span>
                            </AdminBadge>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
                          @{u.username}
                          {u.email ? ` · ${u.email}` : ''}
                          {u.wechatBound && u.wechatNickname ? ` · 微信:${u.wechatNickname}` : ''}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {u.role === 'admin' ? (
                          <AdminBadge tone="dark">管理员</AdminBadge>
                        ) : (
                          <span className="text-zinc-500">成员</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold">{u.creditBalance}</td>
                      <td className="px-4 py-2.5 font-mono">{u.jobsCount}</td>
                      <td className="px-4 py-2.5">
                        <AdminBadge tone={u.status === 'active' ? 'success' : 'danger'}>
                          {u.status === 'active' ? '正常' : '已禁用'}
                        </AdminBadge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-500">
                        <div>{u.lastLoginAt ? formatAdminDateTime(u.lastLoginAt) : '尚未登录'}</div>
                        <div className="text-[10px] opacity-75">
                          建于 {formatAdminDateTime(u.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className={ADMIN_BTN_SM_CLS}
                            onClick={() => {
                              setAdjustTarget(u)
                              setAdjustDelta('100')
                              setAdjustNote('')
                            }}
                          >
                            <CoinsIcon className="size-3" />
                            调积分
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={ADMIN_BTN_SM_CLS}
                            onClick={() => openEditDialog(u)}
                          >
                            <PencilIcon className="size-3" />
                            备注 / 改密
                          </Button>
                          {u.id !== currentUser.id && (
                            <Button
                              size="sm"
                              variant="outline"
                              className={ADMIN_BTN_SM_CLS}
                              onClick={() => void handleToggleUserStatus(u)}
                            >
                              {u.status === 'active' ? '禁用' : '启用'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {usersTotal > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-mono">
                第 {usersOffset + 1}–{Math.min(usersTotal, usersOffset + users.length)} 位 · 共{' '}
                {usersTotal} 位成员
              </span>
              {usersTotal > 60 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_SM_CLS}
                    disabled={usersOffset === 0 || busyList}
                    onClick={() => setUsersOffset((o) => Math.max(0, o - 60))}
                  >
                    <ChevronLeftIcon className="size-3.5" />
                    上一页
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_SM_CLS}
                    disabled={usersOffset + 60 >= usersTotal || busyList}
                    onClick={() => setUsersOffset((o) => o + 60)}
                  >
                    下一页
                    <ChevronRightIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <AdminPanel
          title="全站近期积分流水（最近 80 笔）"
          subtitle="包含成员充值、生图扣费与失败自动退还明细。"
          padded={false}
        >
          {ledger.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-500">暂无积分变动流水。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                  <tr>
                    <th className="px-4 py-2.5">成员</th>
                    <th className="px-4 py-2.5">类型</th>
                    <th className="px-4 py-2.5">说明</th>
                    <th className="px-4 py-2.5">变动</th>
                    <th className="px-4 py-2.5">余</th>
                    <th className="px-4 py-2.5 text-right">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {ledger.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-2.5">
                        <span className="font-bold">@{item.username || item.userId.slice(0, 8)}</span>
                        {item.userAdminNote && (
                          <span className="ml-1.5 font-sans text-[11px] text-zinc-500">
                            ({item.userAdminNote})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-sans text-zinc-500">
                        {LEDGER_TYPE_LABELS[item.type] ?? item.type}
                      </td>
                      <td className="px-4 py-2.5 font-sans text-zinc-600 dark:text-zinc-400">
                        {item.note || '—'}
                      </td>
                      <td
                        className={`px-4 py-2.5 font-bold ${
                          item.delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                        }`}
                      >
                        {item.delta >= 0 ? `+${item.delta}` : item.delta}
                      </td>
                      <td className="px-4 py-2.5 text-zinc-500">{item.balanceAfter}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-500">
                        {formatAdminDateTime(item.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminPanel>
      )}

      {/* 新建成员账号弹窗 */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open) onAutoOpenConsumed?.()
        }}
      >
        <DialogContent className={`max-w-lg ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {createdCredential ? '成员账号创建成功' : '新建成员账号（后台直开）'}
            </DialogTitle>
          </DialogHeader>

          {createdCredential ? (
            <div className="space-y-4 pt-2 text-xs">
              <div className="space-y-2 border border-emerald-600/40 bg-emerald-500/8 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    已开通账号 · 初始积分 {createdCredential.creditBalance}
                  </span>
                  {createdCredential.adminNote && (
                    <AdminBadge tone="info">备注：{createdCredential.adminNote}</AdminBadge>
                  )}
                </div>
                <div className="space-y-1 border-t border-emerald-600/20 pt-2 font-mono text-xs">
                  <div>
                    <span className="text-zinc-500">用户名：</span>
                    <span className="font-bold">{createdCredential.username}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">初始密码：</span>
                    <span className="font-bold">{createdCredential.password}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">展示昵称：</span>
                    <span className="font-sans">{createdCredential.displayName}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() =>
                    void copyCredentialText(
                      createdCredential.username,
                      createdCredential.password
                    )
                  }
                >
                  <CopyIcon className="size-3.5" />
                  复制账号登录信息
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={ADMIN_BTN_CLS}
                    onClick={openCreateDialog}
                  >
                    继续创建下一个
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={ADMIN_BTN_CLS}
                    onClick={() => {
                      setCreateOpen(false)
                      onAutoOpenConsumed?.()
                    }}
                  >
                    完成关闭
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField
                  label="登录用户名"
                  required
                  hint="3~32 位字母、数字、下划线或点"
                >
                  <Input
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    placeholder="例如：member_01"
                    className={ADMIN_INPUT_CLS}
                  />
                </AdminField>

                <AdminField
                  label="管理员备注（可选）"
                  hint="仅后台可见，用于标记成员身份或账号用途"
                >
                  <Input
                    value={createAdminNote}
                    onChange={(e) => setCreateAdminNote(e.target.value)}
                    placeholder="例如：姓名、团队或用途说明"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>
              </div>

              <AdminField
                label="初始密码"
                required
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setCreatePassword(generateRandomPassword(10))}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    <DicesIcon className="size-3" />
                    <span>随机生成</span>
                  </button>
                }
              >
                <div className="relative">
                  <Input
                    type={showCreatePwd ? 'text' : 'password'}
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    placeholder="至少 6 位字符"
                    className={`${ADMIN_INPUT_CLS} pr-9`}
                  />
                  <button
                    type="button"
                    aria-label={showCreatePwd ? '隐藏密码' : '显示密码'}
                    onClick={() => setShowCreatePwd((v) => !v)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-100"
                  >
                    {showCreatePwd ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                  </button>
                </div>
              </AdminField>

              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="前端展示昵称（可选）">
                  <Input
                    value={createDisplayName}
                    onChange={(e) => setCreateDisplayName(e.target.value)}
                    placeholder="留空默认使用用户名"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="初始积分">
                  <div className="space-y-1.5">
                    <Input
                      type="number"
                      min={0}
                      max={1000000}
                      value={createCredits}
                      onChange={(e) => setCreateCredits(e.target.value)}
                      className={ADMIN_INPUT_CLS}
                    />
                    <div className="flex flex-wrap gap-1">
                      {['50', '100', '500', '9999'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setCreateCredits(preset)}
                          className="border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-200 dark:hover:text-zinc-100"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </AdminField>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="邮箱（可选）">
                  <Input
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="可用于邮箱登录"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="账号角色">
                  <Select
                    value={createRole}
                    onValueChange={(v) => setCreateRole(v as UserRole)}
                  >
                    <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">普通成员</SelectItem>
                      <SelectItem value="admin">管理员</SelectItem>
                    </SelectContent>
                  </Select>
                </AdminField>
              </div>

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() => setCreateOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  disabled={creatingUser}
                  onClick={() => void handleCreateUser()}
                >
                  {creatingUser ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  确认创建账号
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 编辑成员备注 / 昵称 / 重置密码弹窗 */}
      <Dialog open={Boolean(editTarget)} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className={`max-w-md ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              编辑成员信息 · @{editTarget?.username}
            </DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 pt-2 text-xs">
              <AdminField
                label="管理员内部备注"
                hint="仅管理员可见，用户修改前端昵称不会影响此备注"
              >
                <Input
                  value={editAdminNote}
                  onChange={(e) => setEditAdminNote(e.target.value)}
                  placeholder="例如：姓名、部门或用途说明"
                  className={ADMIN_TEXT_INPUT_CLS}
                />
              </AdminField>

              <AdminField label="前端展示昵称">
                <Input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className={ADMIN_TEXT_INPUT_CLS}
                />
              </AdminField>

              <AdminField
                label="重置登录密码（可选）"
                hint="留空表示保持原密码不变；填写新密码后将自动使该成员旧会话失效"
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setEditNewPassword(generateRandomPassword(10))}
                    className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    <DicesIcon className="size-3" />
                    <span>生成新密码</span>
                  </button>
                }
              >
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Input
                      type={showEditPwd ? 'text' : 'password'}
                      value={editNewPassword}
                      onChange={(e) => setEditNewPassword(e.target.value)}
                      placeholder="留空则不修改密码"
                      className={`${ADMIN_INPUT_CLS} pr-9`}
                    />
                    <button
                      type="button"
                      aria-label={showEditPwd ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowEditPwd((v) => !v)}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-500"
                    >
                      {showEditPwd ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                    </button>
                  </div>
                  {editNewPassword && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={ADMIN_BTN_CLS}
                      title="复制账号与新密码"
                      onClick={() =>
                        void copyCredentialText(
                          editTarget.username,
                          editNewPassword
                        )
                      }
                    >
                      <CopyIcon className="size-3.5" />
                    </Button>
                  )}
                </div>
              </AdminField>

              {editTarget.id !== currentUser.id && (
                <div className="grid grid-cols-2 gap-3">
                  <AdminField label="账号角色">
                    <Select
                      value={editRole}
                      onValueChange={(v) => setEditRole(v as UserRole)}
                    >
                      <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">普通成员</SelectItem>
                        <SelectItem value="admin">管理员</SelectItem>
                      </SelectContent>
                    </Select>
                  </AdminField>
                  <AdminField label="账号状态">
                    <div className="flex h-8 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                      <span className="text-zinc-500">
                        {editStatus === 'active' ? '正常启用' : '已禁用'}
                      </span>
                      <Switch
                        checked={editStatus === 'active'}
                        onCheckedChange={(v) => setEditStatus(v ? 'active' : 'disabled')}
                      />
                    </div>
                  </AdminField>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() => setEditTarget(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  disabled={savingEdit}
                  onClick={() => void handleSaveEditUser()}
                >
                  {savingEdit ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  保存修改
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 手动调积分弹窗 */}
      <Dialog open={Boolean(adjustTarget)} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className={`max-w-sm ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              调整积分 · @{adjustTarget?.username}
              {adjustTarget?.adminNote ? `（${adjustTarget.adminNote}）` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 text-xs">
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono dark:border-zinc-800 dark:bg-zinc-900">
              当前可用余额：<span className="font-bold">{adjustTarget?.creditBalance ?? 0}</span> 积分
            </div>
            <AdminField label="变动值（正数为充值，负数为扣减）">
              <div className="space-y-1.5">
                <Input
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  className={ADMIN_INPUT_CLS}
                />
                <div className="flex flex-wrap gap-1">
                  {['+50', '+100', '+500', '-50'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAdjustDelta(preset.replace('+', ''))}
                      className="border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-200 dark:hover:text-zinc-100"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </AdminField>
            <AdminField label="备注说明">
              <Input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="例如：额度补充 / 活动补偿"
                className={ADMIN_TEXT_INPUT_CLS}
              />
            </AdminField>
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={ADMIN_BTN_CLS}
                onClick={() => setAdjustTarget(null)}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                className={ADMIN_BTN_CLS}
                disabled={adjusting}
                onClick={() => void handleAdjustCredits()}
              >
                {adjusting ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
                确认调整
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
