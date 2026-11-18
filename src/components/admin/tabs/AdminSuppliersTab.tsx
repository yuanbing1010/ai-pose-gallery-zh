import { useCallback, useEffect, useState } from 'react'
import { CheckIcon, EyeIcon, EyeOffIcon, LoaderCircleIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  createAdminSupplierApi,
  deleteAdminSupplierApi,
  fetchAdminSuppliersApi,
  updateAdminSupplierApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type { ImageProviderId, SupplierDTO } from '@/types/gallery'
import { PROVIDER_META } from '../../../../shared/studio'
import { AdminBadge, AdminField, AdminPageHeader } from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_DIALOG_CLS,
  ADMIN_INPUT_CLS,
  ADMIN_TEXT_INPUT_CLS,
  type AdminConfirmAction,
} from '../auditHelpers'

interface SupplierFormState {
  id?: string
  name: string
  baseUrl: string
  apiKey: string
  hasExistingKey: boolean
  apiKeyHint: string
  enabled: boolean
  note: string
}

interface AdminSuppliersTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onRefreshBootstrap: () => Promise<void>
  onOpenProvider?: (providerId: ImageProviderId) => void
}

export function AdminSuppliersTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
  onRefreshBootstrap,
  onOpenProvider,
}: AdminSuppliersTabProps) {
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false)
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>({
    name: '',
    baseUrl: 'https://',
    apiKey: '',
    hasExistingKey: false,
    apiKeyHint: '',
    enabled: true,
    note: '',
  })
  const [showSupplierKey, setShowSupplierKey] = useState(false)
  const [savingSupplier, setSavingSupplier] = useState(false)

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const res = await fetchAdminSuppliersApi()
      setSuppliers(res.suppliers)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载供应商列表失败')
    } finally {
      onLoadingChange(false)
    }
  }, [onLoadingChange])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData, reloadTick])

  const openNewSupplier = () => {
    setShowSupplierKey(false)
    setSupplierForm({
      name: '',
      baseUrl: 'https://',
      apiKey: '',
      hasExistingKey: false,
      apiKeyHint: '',
      enabled: true,
      note: '',
    })
    setSupplierDialogOpen(true)
  }

  const openEditSupplier = (s: SupplierDTO) => {
    setShowSupplierKey(false)
    setSupplierForm({
      id: s.id,
      name: s.name,
      baseUrl: s.baseUrl,
      apiKey: '',
      hasExistingKey: s.hasApiKey,
      apiKeyHint: s.apiKeyHint,
      enabled: s.enabled,
      note: s.note,
    })
    setSupplierDialogOpen(true)
  }

  const handleSaveSupplier = async () => {
    if (!supplierForm.name.trim()) {
      toast.error('请填写供应商名称')
      return
    }
    if (!/^https:\/\//i.test(supplierForm.baseUrl.trim())) {
      toast.error('接口基础地址必须以 https:// 开头')
      return
    }
    setSavingSupplier(true)
    try {
      const res = supplierForm.id
        ? await updateAdminSupplierApi(supplierForm.id, {
            name: supplierForm.name.trim(),
            baseUrl: supplierForm.baseUrl.trim(),
            apiKey: supplierForm.apiKey.trim() || undefined,
            enabled: supplierForm.enabled,
            note: supplierForm.note.trim(),
          })
        : await createAdminSupplierApi({
            name: supplierForm.name.trim(),
            baseUrl: supplierForm.baseUrl.trim(),
            apiKey: supplierForm.apiKey.trim() || undefined,
            enabled: supplierForm.enabled,
            note: supplierForm.note.trim(),
          })
      setSuppliers(res.suppliers)
      setSupplierDialogOpen(false)
      await onRefreshBootstrap()
      toast.success(
        supplierForm.id ? '供应商已更新（引用它的全部渠道已即时生效）' : '供应商已创建'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存供应商失败')
    } finally {
      setSavingSupplier(false)
    }
  }

  const handleClearSupplierKey = async () => {
    if (!supplierForm.id) return
    setSavingSupplier(true)
    try {
      const res = await updateAdminSupplierApi(supplierForm.id, { clearApiKey: true })
      setSuppliers(res.suppliers)
      setSupplierForm((prev) => ({
        ...prev,
        apiKey: '',
        hasExistingKey: false,
        apiKeyHint: '',
      }))
      await onRefreshBootstrap()
      toast.success('已清除该供应商的 API 密钥')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '清除失败')
    } finally {
      setSavingSupplier(false)
    }
  }

  const handleToggleSupplierEnabled = async (s: SupplierDTO) => {
    try {
      const res = await updateAdminSupplierApi(s.id, { enabled: !s.enabled })
      setSuppliers(res.suppliers)
      await onRefreshBootstrap()
      toast.success(!s.enabled ? `已启用供应商「${s.name}」` : `已停用供应商「${s.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换失败')
    }
  }

  const handleDeleteSupplier = (s: SupplierDTO) => {
    onConfirm({
      title: `删除供应商「${s.name}」`,
      description: '删除后该供应商及其加密 API Key 将被永久移除，无法恢复。',
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        const res = await deleteAdminSupplierApi(s.id)
        setSuppliers(res.suppliers)
        toast.success(`已删除供应商「${s.name}」`)
      },
    })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`供应商凭证池 (${suppliers.length})`}
        description="统一配置官方或中转站接口域名与密钥（AES-GCM 加密入库），同一供应商可被多个模型渠道复用。"
        actions={
          <Button size="sm" className={ADMIN_BTN_CLS} onClick={openNewSupplier}>
            <PlusIcon className="size-3.5" />
            新建供应商
          </Button>
        }
      />

      <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 font-mono text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2.5">供应商名称</th>
              <th className="px-4 py-2.5">接口基础地址</th>
              <th className="px-4 py-2.5">访问密钥</th>
              <th className="px-4 py-2.5">引用渠道</th>
              <th className="px-4 py-2.5">状态</th>
              <th className="px-4 py-2.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                  暂无供应商，请点击右上角「新建供应商」添加官方或中转站凭证。
                </td>
              </tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <div className="font-bold">{s.name}</div>
                    {s.note && <div className="text-xs text-zinc-500">{s.note}</div>}
                  </td>
                  <td className="max-w-[260px] truncate px-4 py-3 font-mono">{s.baseUrl}</td>
                  <td className="px-4 py-3">
                    {s.hasApiKey ? (
                      <AdminBadge tone="success">{s.apiKeyHint || '已配置'}</AdminBadge>
                    ) : (
                      <AdminBadge tone="danger">未配置</AdminBadge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.channels && s.channels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {s.channels.map((ch) => (
                          <button
                            key={ch.channelId}
                            type="button"
                            onClick={() => onOpenProvider?.(ch.providerId)}
                            title={`跳转到「04. 画笔档位与路由」查看 ${ch.channelName}`}
                            className={`border px-1.5 py-0.5 font-mono text-xs transition-colors hover:border-zinc-950 dark:hover:border-zinc-100 ${
                              ch.enabled
                                ? 'border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                                : 'border-zinc-200 text-zinc-400 line-through dark:border-zinc-800'
                            }`}
                          >
                            {PROVIDER_META[ch.providerId]?.shortName || ch.providerId} · {ch.profileName || ch.channelName}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-zinc-500">{s.channelCount} 个渠道</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={s.enabled}
                      onCheckedChange={() => void handleToggleSupplierEnabled(s)}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className={ADMIN_BTN_SM_CLS}
                        onClick={() => openEditSupplier(s)}
                      >
                        <PencilIcon className="size-3" />
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={`${ADMIN_BTN_SM_CLS} text-red-600 hover:bg-red-500/10`}
                        disabled={s.channelCount > 0}
                        title={s.channelCount > 0 ? '正被渠道引用，不可删除' : '删除供应商'}
                        onClick={() => handleDeleteSupplier(s)}
                      >
                        <Trash2Icon className="size-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 新建/编辑供应商弹窗 */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className={`max-w-lg ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {supplierForm.id ? '编辑供应商凭证' : '新建供应商凭证'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 text-xs">
            <AdminField label="供应商名称" required>
              <Input
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="例如：官方直连 / 聚合中转站"
                className={ADMIN_TEXT_INPUT_CLS}
              />
            </AdminField>

            <AdminField label="接口基础地址 (HTTPS)" required>
              <Input
                type="url"
                value={supplierForm.baseUrl}
                onChange={(e) => setSupplierForm((p) => ({ ...p, baseUrl: e.target.value }))}
                placeholder="https://api.example.com"
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>

            <AdminField
              label={
                <>
                  访问密钥{' '}
                  {supplierForm.hasExistingKey && (
                    <span className="font-mono font-normal text-zinc-500">
                      （当前：{supplierForm.apiKeyHint}）
                    </span>
                  )}
                </>
              }
            >
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    type={showSupplierKey ? 'text' : 'password'}
                    value={supplierForm.apiKey}
                    onChange={(e) => setSupplierForm((p) => ({ ...p, apiKey: e.target.value }))}
                    placeholder={
                      supplierForm.hasExistingKey ? '留空表示保持原有密钥不变' : '输入访问密钥'
                    }
                    className={`${ADMIN_INPUT_CLS} pr-9`}
                  />
                  <button
                    type="button"
                    aria-label={showSupplierKey ? '隐藏密钥' : '显示密钥'}
                    onClick={() => setShowSupplierKey((v) => !v)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-500"
                  >
                    {showSupplierKey ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </button>
                </div>
                {supplierForm.id && supplierForm.hasExistingKey && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={ADMIN_BTN_CLS}
                    disabled={savingSupplier}
                    onClick={() => void handleClearSupplierKey()}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                )}
              </div>
            </AdminField>

            <div className="grid grid-cols-2 gap-3">
              <AdminField label="启用状态">
                <div className="flex h-8 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                  <span className="text-zinc-500">
                    {supplierForm.enabled ? '正常启用' : '全局停用'}
                  </span>
                  <Switch
                    checked={supplierForm.enabled}
                    onCheckedChange={(v) => setSupplierForm((p) => ({ ...p, enabled: v }))}
                  />
                </div>
              </AdminField>
              <AdminField label="备注（可选）">
                <Input
                  value={supplierForm.note}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="用途或到期日备注"
                  className={ADMIN_TEXT_INPUT_CLS}
                />
              </AdminField>
            </div>

            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                className={ADMIN_BTN_CLS}
                onClick={() => setSupplierDialogOpen(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className={ADMIN_BTN_CLS}
                disabled={savingSupplier}
                onClick={() => void handleSaveSupplier()}
              >
                {savingSupplier ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <CheckIcon className="size-3.5" />
                )}
                保存供应商
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
