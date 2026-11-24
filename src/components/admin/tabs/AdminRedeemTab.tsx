import { useCallback, useEffect, useState } from 'react'
import {
  CopyIcon,
  DownloadIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createAdminRedeemCodesApi,
  deleteAdminRedeemCodeApi,
  fetchAdminRedeemCodesApi,
  toggleAdminRedeemCodeApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type { RedeemCodeItem } from '@/types/gallery'
import {
  AdminBadge,
  AdminField,
  AdminFilterBar,
  AdminPageHeader,
  AdminPagination,
  AdminPanel,
} from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_INPUT_CLS,
  ADMIN_TEXT_INPUT_CLS,
  formatAdminDateTime,
  type AdminConfirmAction,
} from '../auditHelpers'

type RedeemFilter = 'all' | 'active' | 'exhausted' | 'disabled' | 'expired'

interface AdminRedeemTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
}

const PAGE_LIMIT = 50

export function AdminRedeemTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
}: AdminRedeemTabProps) {
  const [codes, setCodes] = useState<RedeemCodeItem[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({
    all: 0,
    active: 0,
    exhausted: 0,
    disabled: 0,
    expired: 0,
  })
  const [codeFilter, setCodeFilter] = useState<RedeemFilter>('all')
  const [queryInput, setQueryInput] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [offset, setOffset] = useState(0)

  const [newCodeCount, setNewCodeCount] = useState('5')
  const [newCodeCredits, setNewCodeCredits] = useState('50')
  const [newCodeMaxUses, setNewCodeMaxUses] = useState('1')
  const [newCodeDays, setNewCodeDays] = useState('30')
  const [newCodePrefix, setNewCodePrefix] = useState('POSE')
  const [newCodeNote, setNewCodeNote] = useState('')
  const [creatingCodes, setCreatingCodes] = useState(false)
  const [renderedAt, setRenderedAt] = useState(() => Date.now())

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const res = await fetchAdminRedeemCodesApi({
        limit: PAGE_LIMIT,
        offset,
        filter: codeFilter,
        q: appliedQuery.trim() || undefined,
      })
      setCodes(res.codes)
      setTotal(res.total)
      setCounts(res.counts)
      setRenderedAt(Date.now())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载兑换码失败')
    } finally {
      onLoadingChange(false)
    }
  }, [appliedQuery, codeFilter, offset, onLoadingChange])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(queryInput)
      setOffset(0)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [queryInput])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData, reloadTick])

  const handleCreateCodes = async () => {
    const count = Number(newCodeCount)
    const credits = Number(newCodeCredits)
    const maxUses = Number(newCodeMaxUses)
    const expiresDaysRaw = newCodeDays.trim()
    const expiresDays = expiresDaysRaw ? Number(expiresDaysRaw) : null

    if (!Number.isInteger(count) || count < 1 || count > 50) {
      toast.error('生成数量需为 1~50 的整数')
      return
    }
    if (!Number.isInteger(credits) || credits < 1 || credits > 1_000_000) {
      toast.error('面值积分需为 1~1000000 的整数')
      return
    }
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100_000) {
      toast.error('可用人数/次数需为 1~100000 的整数')
      return
    }
    if (
      expiresDays !== null &&
      (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 3650)
    ) {
      toast.error('有效天数需为 1~3650 的整数，留空表示永久')
      return
    }

    setCreatingCodes(true)
    try {
      const res = await createAdminRedeemCodesApi({
        count,
        credits,
        maxUses,
        expiresDays,
        prefix: newCodePrefix.trim() || 'POSE',
        note: newCodeNote.trim(),
      })
      setNewCodeNote('')
      toast.success(`已生成 ${res.codes.length} 个兑换码`)
      try {
        await navigator.clipboard.writeText(res.codes.map((c) => c.code).join('\n'))
        toast.info('已自动复制新生成的兑换码到剪贴板')
      } catch {
        // Ignore clipboard fallback
      }
      setOffset(0)
      await loadData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    } finally {
      setCreatingCodes(false)
    }
  }

  const handleToggleCodeStatus = async (item: RedeemCodeItem) => {
    const next = item.status === 'active' ? 'disabled' : 'active'
    const exec = async () => {
      await toggleAdminRedeemCodeApi(item.id, next)
      toast.success(next === 'active' ? '已启用兑换码' : '已停用兑换码')
      await loadData()
    }
    if (next === 'disabled') {
      onConfirm({
        title: `停用兑换码 ${item.code}`,
        description: '停用后用户将无法再兑换该卡密剩余额度，可随时重新启用。',
        confirmLabel: '确认停用',
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

  const handleDeleteCode = (item: RedeemCodeItem) => {
    onConfirm({
      title: `删除兑换码 ${item.code}`,
      description: '仅未领取过的兑换码支持永久删除，删除后无法恢复。确认移除？',
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        await deleteAdminRedeemCodeApi(item.id)
        toast.success(`已删除兑换码 ${item.code}`)
        await loadData()
      },
    })
  }

  const downloadBlobFile = (filename: string, mime: string, content: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleExportTxt = () => {
    if (codes.length === 0) return
    const text = codes.map((c) => c.code).join('\n')
    downloadBlobFile(`redeem-codes-${codeFilter}.txt`, 'text/plain;charset=utf-8', text)
    toast.success(`已导出本页 ${codes.length} 条兑换码（TXT）`)
  }

  const handleExportCsv = () => {
    if (codes.length === 0) return
    const esc = (v: string | number | null) => {
      const s = v === null ? '' : String(v)
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = 'code,credits,usedCount,maxUses,status,expiresAt,note'
    const lines = codes.map((c) =>
      [
        c.code,
        c.credits,
        c.usedCount,
        c.maxUses,
        c.status,
        c.expiresAt ? new Date(c.expiresAt).toISOString() : '',
        c.note || '',
      ]
        .map(esc)
        .join(',')
    )
    downloadBlobFile(
      `redeem-codes-${codeFilter}.csv`,
      'text/csv;charset=utf-8',
      '\uFEFF' + [header, ...lines].join('\r\n')
    )
    toast.success(`已导出本页 ${codes.length} 条兑换码（CSV）`)
  }

  const activeAvailableOnPage = codes.filter(
    (c) =>
      c.status === 'active' &&
      c.usedCount < c.maxUses &&
      (c.expiresAt === null || c.expiresAt > renderedAt)
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="SECTION 02 // REDEEM CODES"
        title={`积分兑换码管理 (${counts.all})`}
        description="批量生成一次性或多次可用兑换码，支持按卡密码/批次备注检索及服务端分页。"
      />

      <AdminPanel title="批量生成兑换码">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <AdminField label="生成数量 (1~50)">
            <Input
              type="number"
              min={1}
              max={50}
              value={newCodeCount}
              onChange={(e) => setNewCodeCount(e.target.value)}
              className={ADMIN_INPUT_CLS}
            />
          </AdminField>
          <AdminField label="面值积分">
            <Input
              type="number"
              min={1}
              value={newCodeCredits}
              onChange={(e) => setNewCodeCredits(e.target.value)}
              className={ADMIN_INPUT_CLS}
            />
          </AdminField>
          <AdminField label="可用人数/次数">
            <Input
              type="number"
              min={1}
              value={newCodeMaxUses}
              onChange={(e) => setNewCodeMaxUses(e.target.value)}
              className={ADMIN_INPUT_CLS}
            />
          </AdminField>
          <AdminField label="有效天数（留空永久）">
            <Input
              type="number"
              min={1}
              value={newCodeDays}
              onChange={(e) => setNewCodeDays(e.target.value)}
              className={ADMIN_INPUT_CLS}
            />
          </AdminField>
          <AdminField label="前缀">
            <Input
              value={newCodePrefix}
              onChange={(e) => setNewCodePrefix(e.target.value.toUpperCase())}
              className={ADMIN_INPUT_CLS}
            />
          </AdminField>
          <AdminField label="备注">
            <Input
              value={newCodeNote}
              onChange={(e) => setNewCodeNote(e.target.value)}
              placeholder="活动批次等"
              className={ADMIN_TEXT_INPUT_CLS}
            />
          </AdminField>
        </div>
        <div className="mt-4 flex justify-end border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <Button
            size="sm"
            className={ADMIN_BTN_CLS}
            disabled={creatingCodes}
            onClick={() => void handleCreateCodes()}
          >
            {creatingCodes ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <PlusIcon className="size-3.5" />
            )}
            批量生成兑换码
          </Button>
        </div>
      </AdminPanel>

      <AdminFilterBar
        options={[
          { id: 'all', label: `全部 (${counts.all})` },
          { id: 'active', label: `可用 (${counts.active})` },
          { id: 'exhausted', label: `已领完 (${counts.exhausted})` },
          { id: 'expired', label: `已过期 (${counts.expired})` },
          { id: 'disabled', label: `已停用 (${counts.disabled})` },
        ]}
        value={codeFilter}
        onChange={(f) => {
          setCodeFilter(f)
          setOffset(0)
        }}
        rightSlot={
          <div className="flex flex-wrap items-center gap-2">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setOffset(0)
                if (appliedQuery === queryInput && offset === 0) {
                  void loadData()
                } else {
                  setAppliedQuery(queryInput)
                }
              }}
              className="flex items-center gap-1.5"
            >
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="搜卡密 / 备注…"
                  className="h-8 w-44 rounded-none pl-8 font-mono text-xs sm:w-52"
                />
              </div>
              <Button type="submit" size="sm" variant="outline" className={ADMIN_BTN_CLS}>
                查询
              </Button>
            </form>
            {codes.length > 0 && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={ADMIN_BTN_SM_CLS}
                  onClick={handleExportTxt}
                >
                  <DownloadIcon className="size-3" />
                  导出 TXT
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={ADMIN_BTN_SM_CLS}
                  onClick={handleExportCsv}
                >
                  <DownloadIcon className="size-3" />
                  导出 CSV
                </Button>
              </>
            )}
            {activeAvailableOnPage.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={ADMIN_BTN_SM_CLS}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      activeAvailableOnPage.map((c) => c.code).join('\n')
                    )
                    toast.success(`已复制本页 ${activeAvailableOnPage.length} 个可用兑换码`)
                  } catch {
                    toast.error('剪贴板复制失败')
                  }
                }}
              >
                <CopyIcon className="size-3" />
                复制本页可用 ({activeAvailableOnPage.length})
              </Button>
            )}
          </div>
        }
      />

      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left font-mono text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2.5">兑换码</th>
              <th className="px-4 py-2.5">面值</th>
              <th className="px-4 py-2.5">已领 / 上限</th>
              <th className="px-4 py-2.5">过期时间</th>
              <th className="px-4 py-2.5">备注</th>
              <th className="px-4 py-2.5">状态</th>
              <th className="px-4 py-2.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {codes.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center font-sans text-xs text-zinc-500">
                  {counts.all === 0
                    ? '暂无兑换码，可在上方表单批量生成。'
                    : '当前筛选条件下无兑换码记录。'}
                </td>
              </tr>
            ) : (
              codes.map((c) => {
                const isExpired = c.expiresAt !== null && c.expiresAt <= renderedAt
                return (
                  <tr key={c.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-2.5 font-bold">
                      <div className="inline-flex items-center gap-2">
                        <span>{c.code}</span>
                        <button
                          type="button"
                          aria-label="复制兑换码"
                          onClick={() => {
                            void navigator.clipboard.writeText(c.code)
                            toast.success(`已复制 ${c.code}`)
                          }}
                          className="text-zinc-400 transition-colors hover:text-zinc-950 dark:hover:text-white"
                        >
                          <CopyIcon className="size-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-bold">{c.credits}</td>
                    <td className="px-4 py-2.5">
                      {c.usedCount} / {c.maxUses}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {c.expiresAt ? formatAdminDateTime(c.expiresAt) : '永久'}
                    </td>
                    <td className="px-4 py-2.5 font-sans text-zinc-500">{c.note || '—'}</td>
                    <td className="px-4 py-2.5">
                      <AdminBadge
                        tone={
                          c.status !== 'active'
                            ? 'danger'
                            : c.usedCount >= c.maxUses || isExpired
                              ? 'neutral'
                              : 'success'
                        }
                      >
                        {c.status !== 'active'
                          ? '已停用'
                          : isExpired
                            ? '已过期'
                            : c.usedCount >= c.maxUses
                              ? '已领完'
                              : '可用'}
                      </AdminBadge>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className={ADMIN_BTN_SM_CLS}
                          onClick={() => void handleToggleCodeStatus(c)}
                        >
                          {c.status === 'active' ? '停用' : '启用'}
                        </Button>
                        {c.usedCount === 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            title="删除未使用的兑换码"
                            aria-label={`删除兑换码 ${c.code}`}
                            className={`${ADMIN_BTN_SM_CLS} text-red-600 hover:bg-red-500/10`}
                            onClick={() => handleDeleteCode(c)}
                          >
                            <Trash2Icon className="size-3" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <AdminPagination
        offset={offset}
        limit={PAGE_LIMIT}
        total={total}
        unitLabel="条"
        onPageChange={setOffset}
      />
    </div>
  )
}
