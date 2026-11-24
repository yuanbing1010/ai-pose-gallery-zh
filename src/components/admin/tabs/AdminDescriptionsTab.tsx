import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CheckIcon,
  ImageIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  deleteAdminReferenceDescriptionApi,
  fetchAdminReferenceDescriptionsApi,
  fetchAdminSettingsApi,
  fetchAdminSuppliersApi,
  regenerateAdminReferenceDescriptionApi,
  transcribeAdminReferenceDescriptionApi,
  updateAdminReferenceDescriptionApi,
  updateAdminSettingsApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type {
  PlatformConfig,
  ReferenceDescriptionDTO,
  ReferenceDescriptionKind,
  SupplierDTO,
  VisionFallbackConfig,
} from '@/types/gallery'
import {
  DEFAULT_COSTUME_DESCRIBE_PROMPT,
  DEFAULT_EXTRA_DESCRIBE_PROMPT,
  DEFAULT_PORTRAIT_DESCRIBE_PROMPT,
  DEFAULT_POSE_DESCRIBE_PROMPT,
  mergeVisionFallbackConfig,
  referenceImageUrl,
} from '../../../../shared/studio'
import {
  AdminBadge,
  AdminField,
  AdminPageHeader,
  AdminPagination,
  AdminPanel,
} from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_DIALOG_CLS,
  ADMIN_INPUT_CLS,
  ADMIN_SELECT_CLS,
  ADMIN_TEXT_INPUT_CLS,
  formatTimestampMs,
  type AdminConfirmAction,
} from '../auditHelpers'

interface AdminDescriptionsTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onRefreshBootstrap: () => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
}

const PAGE_LIMIT = 20

const DESC_KIND_META: Record<
  ReferenceDescriptionKind,
  { label: string; badgeTone: 'info' | 'neutral' | 'warning' | 'dark' }
> = {
  pose: { label: '姿势图', badgeTone: 'info' },
  costume: { label: '服装图', badgeTone: 'neutral' },
  portrait: { label: '人像图', badgeTone: 'warning' },
  extra: { label: '附加图', badgeTone: 'dark' },
}

const DESC_PROMPT_FIELDS: ReadonlyArray<{
  key: 'poseDescribePrompt' | 'costumeDescribePrompt' | 'portraitDescribePrompt' | 'extraDescribePrompt'
  label: string
  defaultValue: string
}> = [
  { key: 'poseDescribePrompt', label: '姿势图转文字指令提示词', defaultValue: DEFAULT_POSE_DESCRIBE_PROMPT },
  { key: 'costumeDescribePrompt', label: '服装图转文字指令提示词', defaultValue: DEFAULT_COSTUME_DESCRIBE_PROMPT },
  { key: 'portraitDescribePrompt', label: '人像图转文字指令提示词', defaultValue: DEFAULT_PORTRAIT_DESCRIBE_PROMPT },
  { key: 'extraDescribePrompt', label: '附加参考图转文字指令提示词', defaultValue: DEFAULT_EXTRA_DESCRIBE_PROMPT },
]

function resolveAdminPreviewSrc(previewPath: string): string | null {
  const trimmed = previewPath.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('uploads/')) {
    return `/api/admin/reference-descriptions/preview?key=${encodeURIComponent(trimmed)}`
  }
  return referenceImageUrl(trimmed)
}

export function AdminDescriptionsTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
  onRefreshBootstrap,
  onDirtyChange,
}: AdminDescriptionsTabProps) {
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig | null>(null)
  const [visionCfg, setVisionCfg] = useState<VisionFallbackConfig>(() =>
    mergeVisionFallbackConfig(null)
  )
  const [savedVisionJson, setSavedVisionJson] = useState('')
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [manualVisionModel, setManualVisionModel] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)

  const [items, setItems] = useState<ReferenceDescriptionDTO[]>([])
  const [total, setTotal] = useState(0)
  const [poseCount, setPoseCount] = useState(0)
  const [costumeCount, setCostumeCount] = useState(0)
  const [portraitCount, setPortraitCount] = useState(0)
  const [extraCount, setExtraCount] = useState(0)
  const [kindFilter, setKindFilter] = useState<'all' | ReferenceDescriptionKind>('all')
  const [searchInput, setSearchInput] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [offset, setOffset] = useState(0)

  const [editingItem, setEditingItem] = useState<ReferenceDescriptionDTO | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createKind, setCreateKind] = useState<ReferenceDescriptionKind>('pose')
  const [createPath, setCreatePath] = useState('')
  const [createLabel, setCreateLabel] = useState('')
  const [createManualDesc, setCreateManualDesc] = useState('')
  const [submittingCreate, setSubmittingCreate] = useState(false)

  const loadDescriptions = useCallback(
    async (opts?: {
      kind?: 'all' | ReferenceDescriptionKind
      q?: string
      offset?: number
      silent?: boolean
    }) => {
      if (!opts?.silent) onLoadingChange(true)
      try {
        const res = await fetchAdminReferenceDescriptionsApi({
          kind: opts?.kind ?? kindFilter,
          q: opts?.q ?? appliedQuery,
          limit: PAGE_LIMIT,
          offset: opts?.offset ?? offset,
        })
        setItems(res.items)
        setTotal(res.total)
        setPoseCount(res.poseCount)
        setCostumeCount(res.costumeCount)
        setPortraitCount(res.portraitCount)
        setExtraCount(res.extraCount)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '加载参考图描述库失败')
      } finally {
        if (!opts?.silent) onLoadingChange(false)
      }
    },
    [kindFilter, appliedQuery, offset, onLoadingChange]
  )

  const loadConfig = useCallback(async () => {
    onLoadingChange(true)
    try {
      const [settingsRes, suppliersRes] = await Promise.all([
        fetchAdminSettingsApi(),
        fetchAdminSuppliersApi(),
      ])
      const mergedVision = mergeVisionFallbackConfig(settingsRes.platform.visionFallback)
      setPlatformCfg(settingsRes.platform)
      setVisionCfg(mergedVision)
      setSavedVisionJson(JSON.stringify(mergedVision))
      setSuppliers(suppliersRes.suppliers || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载图转文配置失败')
    } finally {
      onLoadingChange(false)
    }
  }, [onLoadingChange])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadConfig()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadConfig, reloadTick])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDescriptions()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadDescriptions, reloadTick])

  const visionModelOptions = useMemo(() => {
    const selectedSup = visionCfg.supplierId
      ? suppliers.find((s) => s.id === visionCfg.supplierId)
      : null
    const pool = selectedSup
      ? [selectedSup]
      : suppliers.filter((s) => s.enabled && s.hasApiKey)
    const seen = new Set<string>()
    const result: string[] = []
    for (const sup of pool) {
      for (const m of sup.models || []) {
        if (!seen.has(m)) {
          seen.add(m)
          result.push(m)
        }
      }
    }
    return result
  }, [suppliers, visionCfg.supplierId])

  const isDirty = Boolean(savedVisionJson && JSON.stringify(visionCfg) !== savedVisionJson)
  useEffect(() => {
    onDirtyChange?.(isDirty)
    return () => onDirtyChange?.(false)
  }, [isDirty, onDirtyChange])

  const handleSaveConfig = async () => {
    if (!platformCfg) return
    if (!visionCfg.model.trim()) {
      toast.error('请填写视觉转译模型 ID（如 gemini-4-hydrogen）')
      return
    }
    setSavingConfig(true)
    try {
      const normalized = mergeVisionFallbackConfig(visionCfg)
      const res = await updateAdminSettingsApi({
        visionFallback: normalized,
      })
      const savedVision = mergeVisionFallbackConfig(res.platform.visionFallback)
      setPlatformCfg(res.platform)
      setVisionCfg(savedVision)
      setSavedVisionJson(JSON.stringify(savedVision))
      await onRefreshBootstrap()
      toast.success('图转文视觉配置已保存')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingConfig(false)
    }
  }

  const handleOpenEdit = (item: ReferenceDescriptionDTO) => {
    setEditingItem(item)
    setEditLabel(item.sourceLabel)
    setEditDesc(item.description)
  }

  const handleSaveEdit = async () => {
    if (!editingItem) return
    if (!editDesc.trim()) {
      toast.error('描述文本不能为空')
      return
    }
    setSavingEdit(true)
    try {
      await updateAdminReferenceDescriptionApi(editingItem.id, {
        description: editDesc.trim(),
        sourceLabel: editLabel.trim(),
      })
      setEditingItem(null)
      toast.success('描述已保存并标记为人工精修，后续图转文生图将直接复用')
      await loadDescriptions({ silent: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存描述失败')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleRegenerate = async (item: ReferenceDescriptionDTO) => {
    if (isDirty) {
      toast.info('检测到视觉配置有未保存修改，请先点击“保存视觉配置”后再重新识别')
      return
    }
    setRegeneratingId(item.id)
    try {
      await regenerateAdminReferenceDescriptionApi(item.id)
      toast.success('已调用视觉模型重新识图并覆盖入库')
      await loadDescriptions({ silent: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重新识图失败')
    } finally {
      setRegeneratingId(null)
    }
  }

  const handleDelete = (item: ReferenceDescriptionDTO) => {
    onConfirm({
      title: '删除该参考图文字描述？',
      description: `删除后，「${item.sourceLabel || item.refKey}」再次使用图转文生图时将重新调用一次视觉模型转译入库。`,
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        await deleteAdminReferenceDescriptionApi(item.id)
        toast.success('已删除描述记录')
        await loadDescriptions({ silent: true })
      },
    })
  }

  const handleCreateOrTest = async () => {
    if (!createPath.trim()) {
      toast.error('请输入参考图路径或公网 URL（如 img/upper80v2_P037_front.png）')
      return
    }
    if (isDirty && !createManualDesc.trim()) {
      toast.info('检测到视觉配置尚未保存，请先保存配置再即时识图')
      return
    }
    setSubmittingCreate(true)
    try {
      const res = await transcribeAdminReferenceDescriptionApi({
        kind: createKind,
        previewPath: createPath.trim(),
        sourceLabel: createLabel.trim() || undefined,
        description: createManualDesc.trim() || undefined,
      })
      toast.success(
        createManualDesc.trim()
          ? '已保存人工录入的参考图描述'
          : res.cacheHit
            ? '库中已存在同一张图的描述，直接返回缓存（未重复调用视觉模型）'
            : `已调用 ${res.visionModel || visionCfg.model} 转译并入库`
      )
      setCreateOpen(false)
      setCreatePath('')
      setCreateLabel('')
      setCreateManualDesc('')
      setOffset(0)
      await loadDescriptions({ offset: 0, silent: true })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '转译入库失败')
    } finally {
      setSubmittingCreate(false)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="SECTION 09 // IMAGE-TO-TEXT CACHE"
        title="图转文生图与描述库"
        description="开启后，前台工作台将常驻「带图生图 / 图转文生图」切换开关：用户选择图转文生图时，将把姿势图、服装图、人像图及附加参考图转译为文字描述并执行纯文生图（适用于 GPT / Grok / Gemini 自家协议渠道，跳过 WaveSpeed 渠道）。同一张图仅转译一次，后续命中 D1 缓存直读。"
      />

      <AdminPanel
        title="视觉转译模型配置"
        subtitle="优先复用「03. 供应商凭证」中的渠道 URL 与密钥，支持任意切换模型与转换提示词"
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            {isDirty && <AdminBadge tone="warning">配置待保存</AdminBadge>}
            <AdminBadge tone={visionCfg.enabled ? 'success' : 'neutral'}>
              {visionCfg.enabled ? '已开启' : '已关闭'}
            </AdminBadge>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-zinc-200 px-3 py-2.5 dark:border-zinc-800">
            <div>
              <div className="text-xs font-bold">开启工作台常驻「图转文 · 文生图」功能</div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                开启后，工作台支持在「带图生图」与「图转文生图」间自由切换；开启图转文生图时将先转译全部参考图为文字，再交由自家协议渠道纯文生图。
              </div>
            </div>
            <Switch
              className="rounded-none"
              checked={visionCfg.enabled}
              onCheckedChange={(v) => setVisionCfg((prev) => ({ ...prev, enabled: v }))}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <AdminField label="复用供应商凭证（URL 与密钥）">
              <Select
                value={visionCfg.supplierId || '__auto__'}
                onValueChange={(v) =>
                  setVisionCfg((prev) => ({ ...prev, supplierId: v === '__auto__' ? '' : v }))
                }
              >
                <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="__auto__">
                    自动复用已启用同协议供应商（推荐）
                  </SelectItem>
                  {suppliers.map((s) => {
                    const usable = s.enabled && s.hasApiKey
                    return (
                      <SelectItem
                        key={s.id}
                        value={s.id}
                        disabled={!usable}
                        className="text-xs"
                      >
                        {s.authMode === 'oauth_openai_codex'
                          ? '[Codex OAuth] '
                          : s.authMode === 'oauth_xai'
                            ? '[Grok OAuth] '
                            : ''}
                        {s.name} ({s.baseUrl}){' '}
                        {!s.enabled
                          ? '[已停用 · 不可用]'
                          : !s.hasApiKey
                            ? s.authMode !== 'api_key'
                              ? '[未授权 · 不可用]'
                              : '[未配Key · 不可用]'
                            : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </AdminField>

            <AdminField label="视觉生文模型 ID">
              {visionModelOptions.length > 0 ? (
                <div className="space-y-1.5">
                  <Select
                    value={
                      !manualVisionModel && visionModelOptions.includes(visionCfg.model)
                        ? visionCfg.model
                        : '__manual__'
                    }
                    onValueChange={(v) => {
                      if (v === '__manual__') {
                        setManualVisionModel(true)
                      } else {
                        setManualVisionModel(false)
                        setVisionCfg((prev) => ({ ...prev, model: v }))
                      }
                    }}
                  >
                    <SelectTrigger className={`w-full font-mono ${ADMIN_SELECT_CLS}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectGroup>
                        <SelectLabel className="font-mono text-xs">
                          供应商已选模型 ({visionModelOptions.length})
                        </SelectLabel>
                        {visionModelOptions.map((modelId) => (
                          <SelectItem key={modelId} value={modelId} className="font-mono text-xs">
                            {modelId}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectItem value="__manual__" className="text-xs">
                        手动输入模型 ID
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {(manualVisionModel || !visionModelOptions.includes(visionCfg.model)) && (
                    <Input
                      value={visionCfg.model}
                      onChange={(e) => setVisionCfg((prev) => ({ ...prev, model: e.target.value }))}
                      placeholder="如 gemini-4-hydrogen"
                      className={ADMIN_INPUT_CLS}
                    />
                  )}
                </div>
              ) : (
                <Input
                  value={visionCfg.model}
                  onChange={(e) => setVisionCfg((prev) => ({ ...prev, model: e.target.value }))}
                  placeholder="如 gemini-4-hydrogen"
                  className={ADMIN_INPUT_CLS}
                />
              )}
            </AdminField>

            <AdminField label="接口协议模式">
              <Select
                value={visionCfg.endpointMode}
                onValueChange={(v) =>
                  setVisionCfg((prev) => ({
                    ...prev,
                    endpointMode: v === 'openai_chat' ? 'openai_chat' : 'gemini_native',
                  }))
                }
              >
                <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="gemini_native">Gemini 原生 (:generateContent)</SelectItem>
                  <SelectItem value="openai_chat">OpenAI 对话 (/v1/chat/completions)</SelectItem>
                </SelectContent>
              </Select>
            </AdminField>

            {visionCfg.endpointMode === 'gemini_native' && (
              <AdminField label="Gemini 鉴权方式">
                <Select
                  value={visionCfg.authMode || 'auto'}
                  onValueChange={(v) =>
                    setVisionCfg((prev) => ({
                      ...prev,
                      authMode: v as VisionFallbackConfig['authMode'],
                    }))
                  }
                >
                  <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="auto">自动兼容（复用渠道设置）</SelectItem>
                    <SelectItem value="bearer">仅 Authorization: Bearer</SelectItem>
                    <SelectItem value="goog_key">仅 x-goog-api-key + ?key=</SelectItem>
                    <SelectItem value="both">同时 Bearer + goog-key + ?key=</SelectItem>
                  </SelectContent>
                </Select>
              </AdminField>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {DESC_PROMPT_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{field.label}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={ADMIN_BTN_SM_CLS}
                    onClick={() =>
                      setVisionCfg((prev) => ({
                        ...prev,
                        [field.key]: field.defaultValue,
                      }))
                    }
                  >
                    <RotateCcwIcon className="size-3" />
                    恢复默认
                  </Button>
                </div>
                <Textarea
                  rows={4}
                  value={visionCfg[field.key]}
                  onChange={(e) =>
                    setVisionCfg((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  className="rounded-none text-xs leading-relaxed"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            <Button
              size="sm"
              className={ADMIN_BTN_CLS}
              disabled={savingConfig}
              onClick={() => void handleSaveConfig()}
            >
              {savingConfig ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              保存视觉配置
            </Button>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel
        title="已入库参考图文字描述缓存"
        subtitle="姿势图 / 服装图 / 人像图 / 附加图首次转译后即永久落库；支持人工精修覆盖或调用视觉模型重新生成"
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <AdminBadge tone="neutral">姿势 {poseCount}</AdminBadge>
            <AdminBadge tone="neutral">服装 {costumeCount}</AdminBadge>
            <AdminBadge tone="neutral">人像 {portraitCount}</AdminBadge>
            {extraCount > 0 && <AdminBadge tone="neutral">附加 {extraCount}</AdminBadge>}
            <AdminBadge tone="info">总计 {total}</AdminBadge>
            <Button
              size="sm"
              className={ADMIN_BTN_SM_CLS}
              onClick={() => setCreateOpen(true)}
            >
              <PlusIcon className="size-3" />
              测试转译 / 预录入
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'pose', 'costume', 'portrait', 'extra'] as const).map((k) => (
              <Button
                key={k}
                type="button"
                variant={kindFilter === k ? 'default' : 'outline'}
                size="sm"
                className={ADMIN_BTN_SM_CLS}
                onClick={() => {
                  setKindFilter(k)
                  setOffset(0)
                }}
              >
                {k === 'all' ? '全部' : DESC_KIND_META[k].label}
              </Button>
            ))}
          </div>

          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              setAppliedQuery(searchInput.trim())
              setOffset(0)
            }}
          >
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜名称 / 路径 Key / 描述内容…"
              className={`w-64 ${ADMIN_TEXT_INPUT_CLS}`}
            />
            <Button type="submit" variant="outline" size="sm" className={ADMIN_BTN_CLS}>
              <SearchIcon className="size-3.5" />
              搜索
            </Button>
          </form>
        </div>

        {items.length === 0 ? (
          <div className="border border-zinc-200 p-8 text-center dark:border-zinc-800">
            <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              暂无已落库的参考图文字描述
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              当用户使用图转文生图或手动使用上方「测试转译 / 预录入」后，结果会保存在此处并供后续直读复用。
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {items.map((item) => {
              const imgSrc = resolveAdminPreviewSrc(item.previewPath)
              const isRegen = regeneratingId === item.id
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-[88px_1fr]"
                >
                  <div className="aspect-[3/4] w-[88px] overflow-hidden border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={item.sourceLabel || item.kind}
                        className="size-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-zinc-400">
                        <ImageIcon className="size-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <AdminBadge tone={DESC_KIND_META[item.kind].badgeTone}>
                            {DESC_KIND_META[item.kind].label}
                          </AdminBadge>
                          <AdminBadge tone={item.sourceType === 'manual' ? 'warning' : 'success'}>
                            {item.sourceType === 'manual' ? '人工精修' : '自动转译'}
                          </AdminBadge>
                          <span className="truncate text-xs font-bold">
                            {item.sourceLabel || '未命名参考图'}
                          </span>
                        </div>
                        <div className="truncate font-mono text-xs text-zinc-500">
                          Key: {item.refKey}
                          {item.visionModel ? ` · 模型: ${item.visionModel}` : ''}
                          {` · 更新: ${formatTimestampMs(item.updatedAt)}`}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className={ADMIN_BTN_SM_CLS}
                          onClick={() => handleOpenEdit(item)}
                        >
                          <PencilIcon className="size-3" />
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={ADMIN_BTN_SM_CLS}
                          disabled={isRegen}
                          onClick={() => void handleRegenerate(item)}
                        >
                          {isRegen ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <RefreshCwIcon className="size-3" />
                          )}
                          重新识图
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className={`${ADMIN_BTN_SM_CLS} text-red-600 hover:text-red-700 dark:text-red-400`}
                          onClick={() => handleDelete(item)}
                        >
                          <Trash2Icon className="size-3" />
                          删除
                        </Button>
                      </div>
                    </div>

                    <p className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200">
                      {item.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <AdminPagination
          offset={offset}
          limit={PAGE_LIMIT}
          total={total}
          unitLabel="条"
          onPageChange={setOffset}
          className="mt-4 border-0 px-0 pb-0"
        />
      </AdminPanel>

      <Dialog open={Boolean(editingItem)} onOpenChange={(v) => !v && setEditingItem(null)}>
        <DialogContent className={`w-[95vw] max-w-xl sm:max-w-xl ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              编辑参考图文字描述（保存后锁定为人工精修）
            </DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-3 text-xs">
              <AdminField label="显示名称">
                <Input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className={ADMIN_TEXT_INPUT_CLS}
                />
              </AdminField>
              <AdminField label="精确文字描述（失败去图重试时将直接并入生图提示词）">
                <Textarea
                  rows={6}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="rounded-none text-xs leading-relaxed"
                />
              </AdminField>
              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Button
                  variant="outline"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() => setEditingItem(null)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  disabled={savingEdit}
                  onClick={() => void handleSaveEdit()}
                >
                  {savingEdit ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  保存精修文本
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={`w-[95vw] max-w-xl sm:max-w-xl ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              即时测试视觉转译 / 手动预录入参考图描述
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminField label="参考图类型">
                <Select
                  value={createKind}
                  onValueChange={(v) => setCreateKind(v as ReferenceDescriptionKind)}
                >
                  <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="pose">姿势图 (pose)</SelectItem>
                    <SelectItem value="costume">服装图 (costume)</SelectItem>
                    <SelectItem value="portrait">人像图 (portrait)</SelectItem>
                    <SelectItem value="extra">附加图 (extra)</SelectItem>
                  </SelectContent>
                </Select>
              </AdminField>
              <AdminField label="名称备注（可选）">
                <Input
                  value={createLabel}
                  onChange={(e) => setCreateLabel(e.target.value)}
                  placeholder="例如：正面双手托腮"
                  className={ADMIN_TEXT_INPUT_CLS}
                />
              </AdminField>
            </div>
            <AdminField label="参考图路径或公网 URL（支持 img/...、data/mio/... 或 https://...）">
              <Input
                value={createPath}
                onChange={(e) => setCreatePath(e.target.value)}
                placeholder="例如：img/upper80v2_P037_front.png"
                className={ADMIN_INPUT_CLS}
              />
            </AdminField>
            <AdminField label="手工描述文本（留空则立即调用配置的视觉模型自动转译并入库）">
              <Textarea
                rows={4}
                value={createManualDesc}
                onChange={(e) => setCreateManualDesc(e.target.value)}
                placeholder={`留空将自动调用 ${visionCfg.model} 识别上方图片并落库`}
                className="rounded-none text-xs leading-relaxed"
              />
            </AdminField>
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <Button
                variant="outline"
                size="sm"
                className={ADMIN_BTN_CLS}
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button
                size="sm"
                className={ADMIN_BTN_CLS}
                disabled={submittingCreate}
                onClick={() => void handleCreateOrTest()}
              >
                {submittingCreate ? (
                  <LoaderCircleIcon className="size-3.5 animate-spin" />
                ) : (
                  <SparklesIcon className="size-3.5" />
                )}
                {createManualDesc.trim() ? '保存录入' : '即时识图并入库'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
