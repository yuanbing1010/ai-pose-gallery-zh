import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
  WifiIcon,
  XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  addAdminSupplierKeysApi,
  createAdminSupplierApi,
  deleteAdminSupplierApi,
  deleteAdminSupplierKeyApi,
  fetchAdminSuppliersApi,
  queryAdminSupplierModelsApi,
  testAdminSupplierApi,
  updateAdminSupplierApi,
  updateAdminSupplierKeyApi,
  type SupplierKeyTestResult,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type {
  ImageProviderId,
  SupplierDTO,
  SupplierKeyDTO,
  SupplierQueriedModel,
} from '@/types/gallery'
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
  rawKeysText: string
  keyEntryMode: 'single' | 'batch'
  hasExistingKey: boolean
  apiKeyHint: string
  keyCount: number
  selectedModels: string[]
  enabled: boolean
  note: string
}

interface ModelQueryState {
  loading: boolean
  queried: boolean
  endpointUrl: string
  error: string
  models: SupplierQueriedModel[]
  filter: string
}

const INITIAL_MODEL_QUERY_STATE: ModelQueryState = {
  loading: false,
  queried: false,
  endpointUrl: '',
  error: '',
  models: [],
  filter: '',
}

interface AdminSuppliersTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onRefreshBootstrap: () => Promise<void>
  onOpenProvider?: (providerId: ImageProviderId) => void
}

function countBatchLines(raw: string): number {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')).length
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
    rawKeysText: '',
    keyEntryMode: 'single',
    hasExistingKey: false,
    apiKeyHint: '',
    keyCount: 0,
    selectedModels: [],
    enabled: true,
    note: '',
  })
  const [modelQuery, setModelQuery] = useState<ModelQueryState>(INITIAL_MODEL_QUERY_STATE)
  const [showSupplierKey, setShowSupplierKey] = useState(false)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [testingSupplierId, setTestingSupplierId] = useState<string | null>(null)

  // 密钥池管理弹窗
  const [keyPoolSupplierId, setKeyPoolSupplierId] = useState<string | null>(null)
  const [batchImportText, setBatchImportText] = useState('')
  const [importingKeys, setImportingKeys] = useState(false)
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null)
  const [editingKeyLabel, setEditingKeyLabel] = useState('')
  const [testingKeyId, setTestingKeyId] = useState<string | null>(null)
  const [keyTestResults, setKeyTestResults] = useState<Record<string, SupplierKeyTestResult>>({})
  const [nowTs, setNowTs] = useState(() => Date.now())

  const activePoolSupplier = suppliers.find((s) => s.id === keyPoolSupplierId) ?? null

  const syncSuppliersState = useCallback((next: SupplierDTO[]) => {
    setSuppliers(next)
    setNowTs(Date.now())
  }, [])

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const res = await fetchAdminSuppliersApi()
      syncSuppliersState(res.suppliers)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载供应商列表失败')
    } finally {
      onLoadingChange(false)
    }
  }, [onLoadingChange, syncSuppliersState])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadData, reloadTick])

  const openNewSupplier = () => {
    setShowSupplierKey(false)
    setModelQuery(INITIAL_MODEL_QUERY_STATE)
    setSupplierForm({
      name: '',
      baseUrl: 'https://',
      apiKey: '',
      rawKeysText: '',
      keyEntryMode: 'single',
      hasExistingKey: false,
      apiKeyHint: '',
      keyCount: 0,
      selectedModels: [],
      enabled: true,
      note: '',
    })
    setSupplierDialogOpen(true)
  }

  const openCloneSupplier = (s: SupplierDTO) => {
    setShowSupplierKey(false)
    setModelQuery(INITIAL_MODEL_QUERY_STATE)
    setSupplierForm({
      name: `${s.name} 副本`,
      baseUrl: s.baseUrl,
      apiKey: '',
      rawKeysText: '',
      keyEntryMode: 'batch',
      hasExistingKey: false,
      apiKeyHint: '',
      keyCount: 0,
      selectedModels: [...(s.models || [])],
      enabled: true,
      note: s.note,
    })
    setSupplierDialogOpen(true)
  }

  const openEditSupplier = (s: SupplierDTO) => {
    setShowSupplierKey(false)
    setModelQuery(INITIAL_MODEL_QUERY_STATE)
    setSupplierForm({
      id: s.id,
      name: s.name,
      baseUrl: s.baseUrl,
      apiKey: '',
      rawKeysText: '',
      keyEntryMode: 'single',
      hasExistingKey: s.hasApiKey,
      apiKeyHint: s.apiKeyHint,
      keyCount: s.keyCount,
      selectedModels: [...(s.models || [])],
      enabled: s.enabled,
      note: s.note,
    })
    setSupplierDialogOpen(true)
  }

  const openKeyPoolModal = (s: SupplierDTO) => {
    setKeyPoolSupplierId(s.id)
    setBatchImportText('')
    setEditingKeyId(null)
    setEditingKeyLabel('')
    setKeyTestResults({})
  }

  const filteredQueriedModels = useMemo(() => {
    const q = modelQuery.filter.trim().toLowerCase()
    if (!q) return modelQuery.models
    return modelQuery.models.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.ownedBy ? m.ownedBy.toLowerCase().includes(q) : false)
    )
  }, [modelQuery.filter, modelQuery.models])

  const selectedModelSet = useMemo(
    () => new Set(supplierForm.selectedModels),
    [supplierForm.selectedModels]
  )

  const handleQueryModels = async () => {
    const cleanBase = supplierForm.baseUrl.trim()
    if (!/^https:\/\//i.test(cleanBase)) {
      toast.error('接口基础地址必须以 https:// 开头')
      return
    }
    setModelQuery((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const res = await queryAdminSupplierModelsApi({
        supplierId: supplierForm.id,
        baseUrl: cleanBase,
        apiKey:
          supplierForm.keyEntryMode === 'single'
            ? supplierForm.apiKey.trim() || undefined
            : undefined,
        rawKeysText:
          supplierForm.keyEntryMode === 'batch'
            ? supplierForm.rawKeysText.trim() || undefined
            : undefined,
      })
      setModelQuery((prev) => ({
        ...prev,
        loading: false,
        queried: true,
        endpointUrl: res.endpointUrl,
        error: res.ok ? '' : res.message,
        models: res.ok ? res.models : [],
      }))
      if (res.ok) {
        if (res.models.length === 0) {
          toast.info('接口查询成功，但上游未返回可用模型')
        } else {
          toast.success(`已获取 ${res.models.length} 个模型（${res.latencyMs}ms）`)
        }
      } else {
        toast.error(res.message)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '查询模型列表失败'
      setModelQuery((prev) => ({
        ...prev,
        loading: false,
        queried: true,
        error: message,
        models: [],
      }))
      toast.error(message)
    }
  }

  const toggleSelectedModel = (modelId: string) => {
    setSupplierForm((prev) => {
      const exists = prev.selectedModels.includes(modelId)
      return {
        ...prev,
        selectedModels: exists
          ? prev.selectedModels.filter((m) => m !== modelId)
          : [...prev.selectedModels, modelId],
      }
    })
  }

  const selectAllFilteredModels = () => {
    setSupplierForm((prev) => {
      const nextSet = new Set(prev.selectedModels)
      for (const item of filteredQueriedModels) {
        nextSet.add(item.id)
      }
      return { ...prev, selectedModels: Array.from(nextSet) }
    })
  }

  const unselectFilteredModels = () => {
    const removeSet = new Set(filteredQueriedModels.map((m) => m.id))
    setSupplierForm((prev) => ({
      ...prev,
      selectedModels: prev.selectedModels.filter((id) => !removeSet.has(id)),
    }))
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
      if (supplierForm.id) {
        const res = await updateAdminSupplierApi(supplierForm.id, {
          name: supplierForm.name.trim(),
          baseUrl: supplierForm.baseUrl.trim(),
          apiKey:
            supplierForm.keyEntryMode === 'single'
              ? supplierForm.apiKey.trim() || undefined
              : undefined,
          rawKeysText:
            supplierForm.keyEntryMode === 'batch'
              ? supplierForm.rawKeysText.trim() || undefined
              : undefined,
          models: supplierForm.selectedModels,
          enabled: supplierForm.enabled,
          note: supplierForm.note.trim(),
        })
        setSuppliers(res.suppliers)
        setSupplierDialogOpen(false)
        await onRefreshBootstrap()
        toast.success('供应商已更新（引用它的全部渠道已即时生效）')
      } else {
        const res = await createAdminSupplierApi({
          name: supplierForm.name.trim(),
          baseUrl: supplierForm.baseUrl.trim(),
          apiKey:
            supplierForm.keyEntryMode === 'single'
              ? supplierForm.apiKey.trim() || undefined
              : undefined,
          rawKeysText:
            supplierForm.keyEntryMode === 'batch'
              ? supplierForm.rawKeysText.trim() || undefined
              : undefined,
          models: supplierForm.selectedModels,
          enabled: supplierForm.enabled,
          note: supplierForm.note.trim(),
        })
        setSuppliers(res.suppliers)
        setSupplierDialogOpen(false)
        await onRefreshBootstrap()
        toast.success(
          res.addedCount && res.addedCount > 1
            ? `供应商已创建，已导入 ${res.addedCount} 个 API 密钥`
            : '供应商已创建'
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存供应商失败')
    } finally {
      setSavingSupplier(false)
    }
  }

  const handleClearSupplierKey = () => {
    const targetId = supplierForm.id
    if (!targetId) return
    onConfirm({
      title: `清空供应商「${supplierForm.name || targetId}」全部密钥？`,
      description: '清空后引用该供应商的全部模型渠道将停止可用，直到重新添加密钥。',
      confirmLabel: '确认清空密钥',
      destructive: true,
      run: async () => {
        setSavingSupplier(true)
        try {
          const res = await updateAdminSupplierApi(targetId, { clearApiKey: true })
          setSuppliers(res.suppliers)
          setSupplierForm((prev) => ({
            ...prev,
            apiKey: '',
            rawKeysText: '',
            hasExistingKey: false,
            apiKeyHint: '',
            keyCount: 0,
          }))
          await onRefreshBootstrap()
          toast.success('已清空该供应商的全部 API 密钥')
        } finally {
          setSavingSupplier(false)
        }
      },
    })
  }

  const handleToggleSupplierEnabled = async (s: SupplierDTO) => {
    const runToggle = async () => {
      const res = await updateAdminSupplierApi(s.id, { enabled: !s.enabled })
      setSuppliers(res.suppliers)
      await onRefreshBootstrap()
      toast.success(!s.enabled ? `已启用供应商「${s.name}」` : `已停用供应商「${s.name}」`)
    }
    if (s.enabled && s.channelCount > 0) {
      onConfirm({
        title: `停用供应商「${s.name}」？`,
        description: `当前有 ${s.channelCount} 个模型渠道引用该供应商，停用后这些渠道将立即无法生图。`,
        confirmLabel: '确认停用',
        destructive: true,
        run: runToggle,
      })
      return
    }
    try {
      await runToggle()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换失败')
    }
  }

  const handleTestSupplier = async (s: SupplierDTO) => {
    setTestingSupplierId(s.id)
    try {
      const res = await testAdminSupplierApi(s.id)
      await loadData()
      if (res.results && res.results.length > 0) {
        const nextMap: Record<string, SupplierKeyTestResult> = {}
        for (const item of res.results) {
          nextMap[item.keyId] = item
        }
        setKeyTestResults((prev) => ({ ...prev, ...nextMap }))
      }
      if (res.ok) {
        toast.success(`${s.name}：${res.message}（${res.latencyMs}ms）`)
      } else {
        toast.error(`${s.name}：${res.message}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '连通测试失败')
    } finally {
      setTestingSupplierId(null)
    }
  }

  const handleDeleteSupplier = (s: SupplierDTO) => {
    onConfirm({
      title: `删除供应商「${s.name}」`,
      description: '删除后该供应商及其密钥池中全部加密 API Key 将被永久移除，无法恢复。',
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        const res = await deleteAdminSupplierApi(s.id)
        setSuppliers(res.suppliers)
        toast.success(`已删除供应商「${s.name}」`)
      },
    })
  }

  const handleBatchImportKeys = async () => {
    if (!activePoolSupplier) return
    if (!batchImportText.trim()) {
      toast.error('请填写或粘贴至少 1 个 API 密钥')
      return
    }
    setImportingKeys(true)
    try {
      const res = await addAdminSupplierKeysApi(activePoolSupplier.id, {
        rawKeysText: batchImportText,
      })
      setSuppliers(res.suppliers)
      setBatchImportText('')
      await onRefreshBootstrap()
      if (res.addedCount > 0 && res.skippedCount > 0) {
        toast.success(`已导入 ${res.addedCount} 个密钥，跳过 ${res.skippedCount} 个重复密钥`)
      } else if (res.addedCount > 0) {
        toast.success(`已导入 ${res.addedCount} 个密钥`)
      } else {
        toast.info(`未新增密钥（跳过 ${res.skippedCount} 个已存在的重复密钥）`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入密钥失败')
    } finally {
      setImportingKeys(false)
    }
  }

  const handleToggleSingleKey = async (s: SupplierDTO, k: SupplierKeyDTO) => {
    try {
      const res = await updateAdminSupplierKeyApi(s.id, k.id, { enabled: !k.enabled })
      setSuppliers(res.suppliers)
      await onRefreshBootstrap()
      toast.success(!k.enabled ? `已启用密钥 ${k.label || k.apiKeyHint}` : `已停用密钥 ${k.label || k.apiKeyHint}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新密钥状态失败')
    }
  }

  const handleSaveKeyLabel = async (s: SupplierDTO, k: SupplierKeyDTO) => {
    try {
      const res = await updateAdminSupplierKeyApi(s.id, k.id, { label: editingKeyLabel.trim() })
      setSuppliers(res.suppliers)
      setEditingKeyId(null)
      toast.success('密钥备注已更新')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新密钥备注失败')
    }
  }

  const handleClearKeyCooldown = async (s: SupplierDTO, k: SupplierKeyDTO) => {
    try {
      const res = await updateAdminSupplierKeyApi(s.id, k.id, { clearCooldown: true })
      setSuppliers(res.suppliers)
      toast.success('已清除冷却标记')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '清除冷却失败')
    }
  }

  const handleTestSingleKey = async (s: SupplierDTO, k: SupplierKeyDTO) => {
    setTestingKeyId(k.id)
    try {
      const res = await testAdminSupplierApi(s.id, k.id)
      await loadData()
      if (res.results && res.results[0]) {
        setKeyTestResults((prev) => ({ ...prev, [k.id]: res.results![0] }))
      }
      if (res.ok) {
        toast.success(`${k.label || k.apiKeyHint}：${res.message}（${res.latencyMs}ms）`)
      } else {
        toast.error(`${k.label || k.apiKeyHint}：${res.message}`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '密钥测活失败')
    } finally {
      setTestingKeyId(null)
    }
  }

  const handleDeleteSingleKey = (s: SupplierDTO, k: SupplierKeyDTO) => {
    onConfirm({
      title: `删除密钥「${k.label || k.apiKeyHint}」？`,
      description: '删除后该密钥将从供应商凭证池中永久移除；若该供应商下所有密钥被删空，引用它的渠道将无法生图。',
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        const res = await deleteAdminSupplierKeyApi(s.id, k.id)
        setSuppliers(res.suppliers)
        await onRefreshBootstrap()
        toast.success('已移除该密钥')
      },
    })
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`供应商凭证池 (${suppliers.length})`}
        description="统一管理官方或中转站接口域名与多 Key 凭证池（AES-GCM 加密入库）；同一个站点只需配置 1 个供应商并导入多个 API Key，渠道即可自动轮询与池内容灾。"
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
              <th className="px-4 py-2.5">密钥池</th>
              <th className="px-4 py-2.5">已选模型</th>
              <th className="px-4 py-2.5">引用渠道</th>
              <th className="px-4 py-2.5">状态</th>
              <th className="px-4 py-2.5 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-500">
                  暂无供应商，请点击右上角「新建供应商」添加官方或中转站凭证。
                </td>
              </tr>
            ) : (
              suppliers.map((s) => {
                const coolingCount = s.keys.filter(
                  (k) => k.enabled && k.cooldownUntil > nowTs
                ).length
                return (
                  <tr key={s.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                    <td className="px-4 py-3">
                      <div className="font-bold">{s.name}</div>
                      {s.note && <div className="text-xs text-zinc-500">{s.note}</div>}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-3 font-mono">{s.baseUrl}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {s.keyCount === 0 ? (
                          <AdminBadge tone="danger">未配置</AdminBadge>
                        ) : s.activeKeyCount === 0 ? (
                          <AdminBadge tone="warning">0/{s.keyCount} 启用</AdminBadge>
                        ) : (
                          <AdminBadge tone="success">
                            {s.keyCount > 1
                              ? `${s.activeKeyCount}/${s.keyCount} 密钥`
                              : s.apiKeyHint || '已配置'}
                          </AdminBadge>
                        )}
                        {coolingCount > 0 && (
                          <AdminBadge tone="warning">{coolingCount} 冷却中</AdminBadge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className={ADMIN_BTN_SM_CLS}
                          onClick={() => openKeyPoolModal(s)}
                        >
                          <KeyRoundIcon className="size-3" />
                          密钥池 ({s.keyCount})
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {s.models && s.models.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => openEditSupplier(s)}
                          title={s.models.join('\n')}
                          className="flex flex-wrap items-center gap-1 text-left transition-opacity hover:opacity-80"
                        >
                          <AdminBadge tone="info">{s.models.length} 个</AdminBadge>
                          {s.models.slice(0, 2).map((modelId) => (
                            <span
                              key={modelId}
                              className="max-w-[140px] truncate border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                            >
                              {modelId}
                            </span>
                          ))}
                          {s.models.length > 2 && (
                            <span className="font-mono text-xs text-zinc-500">
                              +{s.models.length - 2}
                            </span>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEditSupplier(s)}
                          className="font-mono text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          未预设
                        </button>
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
                              {PROVIDER_META[ch.providerId]?.shortName || ch.providerId} ·{' '}
                              {ch.profileName || ch.channelName}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-zinc-500">
                          {s.channelCount} 个渠道
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        className="rounded-none"
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
                          disabled={!s.hasApiKey || testingSupplierId === s.id}
                          title={
                            s.hasApiKey
                              ? s.activeKeyCount > 1
                                ? `批量测试全部 ${s.activeKeyCount} 个启用密钥`
                                : '向该供应商发起轻量接口连通探测'
                              : '请先配置 API 密钥'
                          }
                          onClick={() => void handleTestSupplier(s)}
                        >
                          {testingSupplierId === s.id ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <WifiIcon className="size-3" />
                          )}
                          {s.activeKeyCount > 1 ? '批量测活' : '测试连通'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={ADMIN_BTN_SM_CLS}
                          title="复制此供应商的接口域名与备注"
                          onClick={() => openCloneSupplier(s)}
                        >
                          <CopyIcon className="size-3" />
                          复制
                        </Button>
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
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 新建/编辑供应商弹窗 */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent
          className={`max-h-[90dvh] w-[95vw] max-w-2xl overflow-y-auto sm:max-w-2xl ${ADMIN_DIALOG_CLS}`}
        >
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
                <div className="flex w-full items-center justify-between gap-2">
                  <span>
                    {supplierForm.id
                      ? supplierForm.keyCount > 1
                        ? `追加新密钥（当前密钥池共 ${supplierForm.keyCount} 个）`
                        : '访问密钥'
                      : '访问密钥（支持批量导入多 Key）'}
                    {supplierForm.hasExistingKey && supplierForm.keyCount <= 1 && (
                      <span className="ml-1 font-mono font-normal text-zinc-500">
                        （当前：{supplierForm.apiKeyHint}）
                      </span>
                    )}
                  </span>
                  <div className="inline-flex border border-zinc-200 dark:border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setSupplierForm((p) => ({ ...p, keyEntryMode: 'single' }))}
                      className={`px-2 py-0.5 text-xs ${
                        supplierForm.keyEntryMode === 'single'
                          ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                          : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-100'
                      }`}
                    >
                      单条
                    </button>
                    <button
                      type="button"
                      onClick={() => setSupplierForm((p) => ({ ...p, keyEntryMode: 'batch' }))}
                      className={`px-2 py-0.5 text-xs ${
                        supplierForm.keyEntryMode === 'batch'
                          ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                          : 'text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-100'
                      }`}
                    >
                      批量多行
                    </button>
                  </div>
                </div>
              }
            >
              {supplierForm.keyEntryMode === 'single' ? (
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Input
                      type={showSupplierKey ? 'text' : 'password'}
                      value={supplierForm.apiKey}
                      onChange={(e) => setSupplierForm((p) => ({ ...p, apiKey: e.target.value }))}
                      placeholder={
                        supplierForm.id
                          ? supplierForm.keyCount > 1
                            ? '输入新密钥将追加到密钥池（管理已有密钥请点击表格「密钥池」）'
                            : supplierForm.hasExistingKey
                              ? '留空表示保持原有密钥不变'
                              : '输入访问密钥'
                          : '输入访问密钥'
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
                  {supplierForm.id && supplierForm.keyCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      title="清空全部已保存的 API 密钥"
                      className={ADMIN_BTN_CLS}
                      disabled={savingSupplier}
                      onClick={handleClearSupplierKey}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Textarea
                    rows={4}
                    value={supplierForm.rawKeysText}
                    onChange={(e) =>
                      setSupplierForm((p) => ({ ...p, rawKeysText: e.target.value }))
                    }
                    placeholder={'每行一个密钥，自动去重；可选「备注|密钥」格式，例如：\n主力Key|sk-xxxx1\nsk-xxxx2'}
                    className="rounded-none font-mono text-xs"
                  />
                  <div className="text-xs text-zinc-500">
                    已识别 {countBatchLines(supplierForm.rawKeysText)} 行待导入密钥
                  </div>
                </div>
              )}
            </AdminField>

            <AdminField
              label={
                <div className="flex w-full items-center justify-between gap-2">
                  <span>可用模型列表（OpenAI 兼容 /models · 勾选后可在渠道与画笔直接引用）</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_SM_CLS}
                    disabled={modelQuery.loading || !/^https:\/\/.+/i.test(supplierForm.baseUrl.trim())}
                    onClick={() => void handleQueryModels()}
                  >
                    {modelQuery.loading ? (
                      <LoaderCircleIcon className="size-3 animate-spin" />
                    ) : (
                      <RefreshCwIcon className="size-3" />
                    )}
                    {modelQuery.queried ? '重新查询' : '查询模型列表'}
                  </Button>
                </div>
              }
            >
              <div className="space-y-2.5 border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                {supplierForm.selectedModels.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-200">
                        已选模型 ({supplierForm.selectedModels.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => setSupplierForm((p) => ({ ...p, selectedModels: [] }))}
                        className="text-xs text-zinc-500 hover:text-zinc-950 dark:hover:text-zinc-100"
                      >
                        清空已选
                      </button>
                    </div>
                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                      {supplierForm.selectedModels.map((modelId) => (
                        <span
                          key={modelId}
                          className="inline-flex items-center gap-1 border border-zinc-950 bg-zinc-950 px-2 py-0.5 font-mono text-xs text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                        >
                          <span>{modelId}</span>
                          <button
                            type="button"
                            aria-label={`移除模型 ${modelId}`}
                            onClick={() => toggleSelectedModel(modelId)}
                            className="opacity-75 hover:opacity-100"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {modelQuery.error && (
                  <div className="border border-red-300 bg-red-50 px-2.5 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
                    {modelQuery.error}
                    {modelQuery.endpointUrl && (
                      <div className="mt-0.5 font-mono text-xs opacity-75">
                        请求地址：{modelQuery.endpointUrl}
                      </div>
                    )}
                  </div>
                )}

                {modelQuery.models.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1">
                        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
                        <Input
                          value={modelQuery.filter}
                          onChange={(e) =>
                            setModelQuery((prev) => ({ ...prev, filter: e.target.value }))
                          }
                          placeholder="筛选模型 ID，例如 image / gpt / gemini / flux..."
                          className={`${ADMIN_INPUT_CLS} pl-8`}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={ADMIN_BTN_SM_CLS}
                        disabled={filteredQueriedModels.length === 0}
                        onClick={selectAllFilteredModels}
                      >
                        全选当前
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={ADMIN_BTN_SM_CLS}
                        disabled={filteredQueriedModels.length === 0}
                        onClick={unselectFilteredModels}
                      >
                        取消当前
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-zinc-500">
                      <span>
                        共 {modelQuery.models.length} 个模型
                        {filteredQueriedModels.length !== modelQuery.models.length
                          ? `（匹配 ${filteredQueriedModels.length} 个）`
                          : ''}
                      </span>
                      {modelQuery.endpointUrl && (
                        <span className="max-w-[300px] truncate" title={modelQuery.endpointUrl}>
                          {modelQuery.endpointUrl}
                        </span>
                      )}
                    </div>

                    <div className="max-h-48 divide-y divide-zinc-200 overflow-y-auto border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
                      {filteredQueriedModels.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-zinc-500">
                          没有匹配「{modelQuery.filter}」的模型
                        </div>
                      ) : (
                        filteredQueriedModels.slice(0, 300).map((item) => {
                          const checked = selectedModelSet.has(item.id)
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => toggleSelectedModel(item.id)}
                              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
                                checked
                                  ? 'bg-zinc-950/5 text-zinc-950 dark:bg-zinc-100/10 dark:text-zinc-100'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'
                              }`}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <span
                                  className={`flex size-4 shrink-0 items-center justify-center border ${
                                    checked
                                      ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                                      : 'border-zinc-300 dark:border-zinc-700'
                                  }`}
                                >
                                  {checked && <CheckIcon className="size-3" />}
                                </span>
                                <span className="truncate font-mono text-xs font-medium">
                                  {item.id}
                                </span>
                              </span>
                              {item.ownedBy && (
                                <span className="shrink-0 font-mono text-xs text-zinc-400">
                                  {item.ownedBy}
                                </span>
                              )}
                            </button>
                          )
                        })
                      )}
                      {filteredQueriedModels.length > 300 && (
                        <div className="px-3 py-2 text-center text-xs text-zinc-500">
                          仅展示前 300 个模型，请输入关键词缩小筛选范围（点击「全选当前」仍可覆盖全部匹配项）
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!modelQuery.queried && supplierForm.selectedModels.length === 0 && (
                  <div className="text-xs text-zinc-500">
                    兼容 OpenAI 风格的供应商，填写接口地址与密钥后可点击右上角「查询模型列表」（通过{' '}
                    <span className="font-mono">baseUrl/models</span> 拉取），勾选常用模型并保存即可在渠道与画笔中直接引用。
                  </div>
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
                    className="rounded-none"
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

      {/* 供应商多 Key 凭证池管理弹窗 */}
      <Dialog
        open={Boolean(activePoolSupplier)}
        onOpenChange={(open) => {
          if (!open) setKeyPoolSupplierId(null)
        }}
      >
        <DialogContent
          className={`max-h-[90dvh] w-[95vw] max-w-3xl overflow-y-auto sm:max-w-3xl ${ADMIN_DIALOG_CLS}`}
        >
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pr-6 text-sm font-bold">
              <span>
                「{activePoolSupplier?.name}」密钥池 ({activePoolSupplier?.keyCount ?? 0})
              </span>
              <span className="font-mono text-xs font-normal text-zinc-500">
                {activePoolSupplier?.baseUrl}
              </span>
            </DialogTitle>
          </DialogHeader>

          {activePoolSupplier && (
            <div className="space-y-4 pt-1 text-xs">
              {/* 批量导入区 */}
              <div className="space-y-2 border border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">批量添加 / 粘贴 API 密钥</span>
                  <span className="text-zinc-500">
                    支持每行 `sk-xxx` 或 `备注|sk-xxx`，自动去重
                  </span>
                </div>
                <Textarea
                  rows={3}
                  value={batchImportText}
                  onChange={(e) => setBatchImportText(e.target.value)}
                  placeholder={'粘贴 1 个或多个密钥（每行一个），例如：\n主力额度|sk-proj-xxxx1\n备用额度|sk-proj-xxxx2'}
                  className="rounded-none font-mono text-xs"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-zinc-500">
                    待导入：{countBatchLines(batchImportText)} 个
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className={ADMIN_BTN_SM_CLS}
                      disabled={
                        !activePoolSupplier.hasApiKey || testingSupplierId === activePoolSupplier.id
                      }
                      onClick={() => void handleTestSupplier(activePoolSupplier)}
                    >
                      {testingSupplierId === activePoolSupplier.id ? (
                        <LoaderCircleIcon className="size-3 animate-spin" />
                      ) : (
                        <WifiIcon className="size-3" />
                      )}
                      全部测活
                    </Button>
                    <Button
                      size="sm"
                      className={ADMIN_BTN_SM_CLS}
                      disabled={importingKeys || !batchImportText.trim()}
                      onClick={() => void handleBatchImportKeys()}
                    >
                      {importingKeys ? (
                        <LoaderCircleIcon className="size-3 animate-spin" />
                      ) : (
                        <PlusIcon className="size-3" />
                      )}
                      批量导入密钥
                    </Button>
                  </div>
                </div>
              </div>

              {/* 密钥池列表 */}
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 font-mono text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3 py-2">备注名</th>
                      <th className="px-3 py-2">脱敏密钥</th>
                      <th className="px-3 py-2">健康状态</th>
                      <th className="px-3 py-2">启用</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {activePoolSupplier.keys.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-zinc-500">
                          该供应商暂无密钥，请在上方粘贴并导入。
                        </td>
                      </tr>
                    ) : (
                      activePoolSupplier.keys.map((k) => {
                        const isCooling = k.cooldownUntil > nowTs
                        const probe = keyTestResults[k.id]
                        return (
                          <tr key={k.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                            <td className="px-3 py-2.5">
                              {editingKeyId === k.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editingKeyLabel}
                                    onChange={(e) => setEditingKeyLabel(e.target.value)}
                                    className={`h-7 w-32 ${ADMIN_TEXT_INPUT_CLS}`}
                                  />
                                  <Button
                                    size="sm"
                                    className={ADMIN_BTN_SM_CLS}
                                    onClick={() => void handleSaveKeyLabel(activePoolSupplier, k)}
                                  >
                                    <CheckIcon className="size-3" />
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingKeyId(k.id)
                                    setEditingKeyLabel(k.label)
                                  }}
                                  title="点击修改备注名"
                                  className="inline-flex items-center gap-1 font-semibold hover:underline"
                                >
                                  <span>{k.label || '未命名密钥'}</span>
                                  <PencilIcon className="size-2.5 text-zinc-400" />
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                              {k.apiKeyHint || '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="space-y-1">
                                {probe ? (
                                  <AdminBadge tone={probe.ok ? 'success' : 'danger'}>
                                    {probe.message} ({probe.latencyMs}ms)
                                  </AdminBadge>
                                ) : isCooling ? (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <AdminBadge tone="warning">
                                      冷却中 ({Math.ceil((k.cooldownUntil - nowTs) / 1000)}s)
                                    </AdminBadge>
                                    <button
                                      type="button"
                                      onClick={() => void handleClearKeyCooldown(activePoolSupplier, k)}
                                      className="inline-flex items-center gap-0.5 border border-zinc-300 px-1.5 py-0.5 text-xs hover:border-zinc-950 dark:border-zinc-700"
                                      title="手动解除冷却"
                                    >
                                      <RefreshCwIcon className="size-2.5" />
                                      重置
                                    </button>
                                  </div>
                                ) : k.enabled ? (
                                  <AdminBadge tone="success">可用</AdminBadge>
                                ) : (
                                  <AdminBadge tone="neutral">已停用</AdminBadge>
                                )}
                                {k.lastError && (
                                  <div className="max-w-[240px] truncate font-mono text-xs text-red-600 dark:text-red-400" title={k.lastError}>
                                    {k.lastError}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5">
                              <Switch
                                className="rounded-none"
                                checked={k.enabled}
                                onCheckedChange={() => void handleToggleSingleKey(activePoolSupplier, k)}
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={ADMIN_BTN_SM_CLS}
                                  disabled={testingKeyId === k.id}
                                  onClick={() => void handleTestSingleKey(activePoolSupplier, k)}
                                >
                                  {testingKeyId === k.id ? (
                                    <LoaderCircleIcon className="size-3 animate-spin" />
                                  ) : (
                                    <WifiIcon className="size-3" />
                                  )}
                                  测活
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className={`${ADMIN_BTN_SM_CLS} text-red-600 hover:bg-red-500/10`}
                                  onClick={() => handleDeleteSingleKey(activePoolSupplier, k)}
                                >
                                  <Trash2Icon className="size-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
