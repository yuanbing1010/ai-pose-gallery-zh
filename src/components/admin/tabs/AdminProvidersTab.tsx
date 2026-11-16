import { useCallback, useEffect, useState } from 'react'
import { CheckIcon, ExternalLinkIcon, LoaderCircleIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  createAdminChannelApi,
  deleteAdminChannelApi,
  fetchAdminProvidersApi,
  fetchAdminSettingsApi,
  updateAdminChannelApi,
  updateAdminProviderSlotApi,
  updateAdminSettingsApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type {
  AdminProviderSlotDTO,
  GeminiParams,
  GptParams,
  GrokParams,
  ImagePassMode,
  ImageProviderId,
  PlatformConfig,
  ProviderChannelDTO,
  SupplierDTO,
} from '@/types/gallery'
import {
  DEFAULT_PROVIDER_PARAMS,
  PROVIDER_META,
  getStudioArtist,
} from '../../../../shared/studio'
import { AdminBadge, AdminField, AdminPageHeader, AdminPanel } from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_DIALOG_CLS,
  ADMIN_INPUT_CLS,
  ADMIN_SELECT_CLS,
  ADMIN_TEXT_INPUT_CLS,
  type AdminConfirmAction,
  type AdminTab,
} from '../auditHelpers'

interface ChannelFormState {
  id?: string
  providerId: ImageProviderId
  supplierId: string
  name: string
  enabled: boolean
  model: string
  customModel: string
  priority: number
  params: GptParams | GeminiParams | GrokParams
}

interface AdminProvidersTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onSelectTab: (tab: AdminTab) => void
  onRefreshBootstrap: () => Promise<void>
}

export function AdminProvidersTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
  onSelectTab,
  onRefreshBootstrap,
}: AdminProvidersTabProps) {
  const [slots, setSlots] = useState<AdminProviderSlotDTO[]>([])
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig | null>(null)
  const [activePid, setActivePid] = useState<ImageProviderId>('gpt')
  const [savingSlot, setSavingSlot] = useState(false)
  const [savedSlotMetaKey, setSavedSlotMetaKey] = useState('')
  const [channelDialogOpen, setChannelDialogOpen] = useState(false)
  const [channelForm, setChannelForm] = useState<ChannelFormState | null>(null)
  const [savingChannel, setSavingChannel] = useState(false)

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const [pRes, sRes] = await Promise.all([
        fetchAdminProvidersApi(),
        fetchAdminSettingsApi(),
      ])
      setSlots(pRes.slots)
      setSuppliers(pRes.suppliers)
      setPlatformCfg(sRes.platform)
      setSavedSlotMetaKey(
        JSON.stringify({
          slots: pRes.slots.map((sl) => ({
            id: sl.providerId,
            enabled: sl.enabled,
            creditCost: sl.creditCost,
          })),
          imagePassMode: sRes.platform.imagePassMode,
        })
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载模型渠道配置失败')
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

  const activeSlot = slots.find((s) => s.providerId === activePid)
  const meta = PROVIDER_META[activePid]

  const currentSlotMetaKey = JSON.stringify({
    slots: slots.map((sl) => ({
      id: sl.providerId,
      enabled: sl.enabled,
      creditCost: sl.creditCost,
    })),
    imagePassMode: platformCfg?.imagePassMode,
  })
  const slotDirty = Boolean(savedSlotMetaKey && currentSlotMetaKey !== savedSlotMetaKey)

  const updateLocalSlot = (patch: Partial<AdminProviderSlotDTO>) => {
    setSlots((prev) => prev.map((s) => (s.providerId === activePid ? { ...s, ...patch } : s)))
  }

  const handleSaveSlotAndPassMode = async () => {
    if (!activeSlot) return
    setSavingSlot(true)
    try {
      const [slotRes, settingsRes] = await Promise.all([
        updateAdminProviderSlotApi(activePid, {
          enabled: activeSlot.enabled,
          creditCost: activeSlot.creditCost,
        }),
        platformCfg
          ? updateAdminSettingsApi({ imagePassMode: platformCfg.imagePassMode })
          : Promise.resolve(null),
      ])
      setSlots(slotRes.slots)
      if (settingsRes) setPlatformCfg(settingsRes.platform)
      setSavedSlotMetaKey(
        JSON.stringify({
          slots: slotRes.slots.map((sl) => ({
            id: sl.providerId,
            enabled: sl.enabled,
            creditCost: sl.creditCost,
          })),
          imagePassMode: settingsRes?.platform.imagePassMode ?? platformCfg?.imagePassMode,
        })
      )
      await onRefreshBootstrap()
      toast.success(`已保存「${getStudioArtist(activePid).name}」槽位配置与全局传参模式`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingSlot(false)
    }
  }

  const openNewChannel = () => {
    if (suppliers.length === 0) {
      toast.info('请先在「03. 供应商凭证」创建一个供应商（填好域名与密钥）')
      onSelectTab('suppliers')
      return
    }
    const defaultSup = suppliers[0]
    setChannelForm({
      providerId: activePid,
      supplierId: defaultSup.id,
      name: defaultSup.name,
      enabled: true,
      model: meta.models[0].value,
      customModel: '',
      priority: 100,
      params: { ...DEFAULT_PROVIDER_PARAMS[activePid] },
    })
    setChannelDialogOpen(true)
  }

  const openEditChannel = (ch: ProviderChannelDTO) => {
    setChannelForm({
      id: ch.id,
      providerId: ch.providerId,
      supplierId: ch.supplierId,
      name: ch.name,
      enabled: ch.enabled,
      model: ch.model,
      customModel: ch.customModel,
      priority: ch.priority,
      params: { ...DEFAULT_PROVIDER_PARAMS[ch.providerId], ...ch.params },
    })
    setChannelDialogOpen(true)
  }

  const handleSaveChannel = async () => {
    if (!channelForm) return
    if (!channelForm.supplierId) {
      toast.error('请选择引用的供应商')
      return
    }
    const selectedSup = suppliers.find((s) => s.id === channelForm.supplierId)
    const effectiveName = channelForm.name.trim() || selectedSup?.name.trim() || ''
    if (!effectiveName) {
      toast.error('请填写渠道名称')
      return
    }
    setSavingChannel(true)
    try {
      const res = channelForm.id
        ? await updateAdminChannelApi(channelForm.id, {
            supplierId: channelForm.supplierId,
            name: effectiveName,
            enabled: channelForm.enabled,
            model: channelForm.model,
            customModel: channelForm.customModel.trim(),
            priority: channelForm.priority,
            params: channelForm.params as unknown as Record<string, unknown>,
          })
        : await createAdminChannelApi(channelForm.providerId, {
            supplierId: channelForm.supplierId,
            name: effectiveName,
            enabled: channelForm.enabled,
            model: channelForm.model,
            customModel: channelForm.customModel.trim(),
            priority: channelForm.priority,
            params: channelForm.params as unknown as Record<string, unknown>,
          })
      setSlots(res.slots)
      setChannelDialogOpen(false)
      await onRefreshBootstrap()
      toast.success(channelForm.id ? '渠道配置已更新' : '新渠道已添加')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存渠道失败')
    } finally {
      setSavingChannel(false)
    }
  }

  const handleToggleChannelEnabled = async (ch: ProviderChannelDTO) => {
    try {
      const res = await updateAdminChannelApi(ch.id, { enabled: !ch.enabled })
      setSlots(res.slots)
      await onRefreshBootstrap()
      toast.success(!ch.enabled ? `已启用渠道「${ch.name}」` : `已停用渠道「${ch.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleDeleteChannel = (ch: ProviderChannelDTO) => {
    onConfirm({
      title: `删除路由渠道「${ch.name}」`,
      description: '删除后该渠道不再参与模型容灾与负载均衡调度。',
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        const res = await deleteAdminChannelApi(ch.id)
        setSlots(res.slots)
        await onRefreshBootstrap()
        toast.success(`已删除渠道「${ch.name}」`)
      },
    })
  }

  if (!activeSlot) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="模型渠道调度与积分定价"
          description="正在同步模型槽位与渠道路由信息…"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="模型渠道调度与积分定价"
        description="每种模型可配置多条渠道（官方 / 中转站混用）：优先调度高优先级渠道，同优先级均衡调度，失败自动无缝切换备用渠道。"
      />

      <div className="grid grid-cols-1 divide-y divide-zinc-200 border border-zinc-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
        {slots.map((s, idx) => {
          const pMeta = PROVIDER_META[s.providerId]
          const artist = getStudioArtist(s.providerId)
          const isActive = activePid === s.providerId
          const readyCount = s.channels.filter(
            (c) => c.enabled && c.supplierEnabled && c.supplierHasKey
          ).length
          return (
            <button
              key={s.providerId}
              type="button"
              onClick={() => setActivePid(s.providerId)}
              className={`flex flex-col items-start p-4 text-left transition-colors ${
                isActive
                  ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900'
              }`}
            >
              <span className={`font-mono text-xs ${isActive ? 'opacity-75' : 'text-zinc-500'}`}>
                0{idx + 1} · {artist.name}
              </span>
              <span className="mt-0.5 text-sm font-bold">{pMeta.name}</span>
              <span className={`mt-1 font-mono text-xs ${isActive ? 'opacity-85' : 'text-zinc-500'}`}>
                {s.enabled ? `${s.creditCost} 积分/次` : '[已停用]'} · {readyCount} 条可用渠道
              </span>
            </button>
          )
        })}
      </div>

      {/* 槽位定价与总开关 */}
      <AdminPanel
        title={`${meta.name} · 对应画师「${getStudioArtist(activePid).name}」槽位配置`}
        headerRight={
          <Button variant="ghost" size="sm" className={ADMIN_BTN_SM_CLS} asChild>
            <a href={meta.docUrl} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="size-3.5" />
              官方文档
            </a>
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <AdminField label="画师开放状态">
            <div className="flex h-8 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {activeSlot.enabled ? '对用户前端开放' : '已下线（前端显示暂休）'}
              </span>
              <Switch
                checked={activeSlot.enabled}
                onCheckedChange={(v) => updateLocalSlot({ enabled: v })}
              />
            </div>
          </AdminField>

          <AdminField label="单次生图消耗积分">
            <Input
              type="number"
              min={0}
              max={100000}
              value={activeSlot.creditCost}
              onChange={(e) =>
                updateLocalSlot({
                  creditCost: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                })
              }
              className={ADMIN_INPUT_CLS}
            />
          </AdminField>

          {platformCfg && (
            <AdminField label="全局参考图传参方式（全站共用）">
              <Select
                value={platformCfg.imagePassMode}
                onValueChange={(v) =>
                  setPlatformCfg((prev) =>
                    prev ? { ...prev, imagePassMode: v as ImagePassMode } : prev
                  )
                }
              >
                <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">优先 HTTPS URL（私有图自动转 Base64）</SelectItem>
                  <SelectItem value="base64">统一转 Base64 编码发送</SelectItem>
                </SelectContent>
              </Select>
            </AdminField>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {slotDirty && <AdminBadge tone="warning">有未保存的槽位 / 传参改动</AdminBadge>}
          <Button
            size="sm"
            className={ADMIN_BTN_CLS}
            disabled={savingSlot}
            onClick={() => void handleSaveSlotAndPassMode()}
          >
            {savingSlot ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <CheckIcon className="size-3.5" />
            )}
            保存配置
          </Button>
        </div>
      </AdminPanel>

      {/* 多渠道列表 */}
      <AdminPanel
        title={`路由渠道列表 (${activeSlot.channels.length})`}
        subtitle="优先调度高优先级渠道，同优先级均衡调度，失败自动无缝切换备用渠道。"
        headerRight={
          <Button size="sm" className={ADMIN_BTN_CLS} onClick={openNewChannel}>
            <PlusIcon className="size-3.5" />
            添加渠道
          </Button>
        }
        padded={false}
      >
        {activeSlot.channels.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            当前模型尚未配置任何渠道。点击右上角「添加渠道」引用已配置的供应商即可启用。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2.5">渠道名称</th>
                  <th className="px-4 py-2.5">引用供应商</th>
                  <th className="px-4 py-2.5">模型 / 协议</th>
                  <th className="px-4 py-2.5">优先级</th>
                  <th className="px-4 py-2.5">启用</th>
                  <th className="px-4 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {activeSlot.channels.map((ch) => {
                  const effectiveModel =
                    ch.model === 'custom' ? ch.customModel || '(未填)' : ch.model
                  return (
                    <tr key={ch.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                      <td className="px-4 py-3">
                        <div className="font-sans font-bold">{ch.name}</div>
                        {!ch.supplierEnabled && (
                          <AdminBadge tone="warning" className="mt-1">
                            供应商已停用
                          </AdminBadge>
                        )}
                        {ch.supplierEnabled && !ch.supplierHasKey && (
                          <AdminBadge tone="danger" className="mt-1">
                            供应商未配密钥
                          </AdminBadge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-sans font-semibold">{ch.supplierName}</div>
                        <div className="max-w-[200px] truncate text-[11px] text-zinc-500">
                          {ch.supplierBaseUrl}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold">{effectiveModel}</div>
                        <div className="text-[11px] text-zinc-500">
                          {(ch.params as { endpointMode?: string }).endpointMode}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold">{ch.priority}</td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={ch.enabled}
                          onCheckedChange={() => void handleToggleChannelEnabled(ch)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className={ADMIN_BTN_SM_CLS}
                            onClick={() => openEditChannel(ch)}
                          >
                            <PencilIcon className="size-3" />
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={`${ADMIN_BTN_SM_CLS} text-red-600 hover:bg-red-500/10`}
                            onClick={() => handleDeleteChannel(ch)}
                          >
                            <Trash2Icon className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      {/* 新建/编辑渠道弹窗 */}
      <Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
        <DialogContent className={`max-h-[90dvh] w-[95vw] max-w-2xl overflow-y-auto sm:max-w-2xl ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {channelForm?.id ? '编辑模型渠道' : '添加模型渠道'}
            </DialogTitle>
          </DialogHeader>
          {channelForm && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="引用供应商（复用接口地址与密钥）">
                  <Select
                    value={channelForm.supplierId}
                    onValueChange={(v) => {
                      const prevSup = suppliers.find((s) => s.id === channelForm.supplierId)
                      const nextSup = suppliers.find((s) => s.id === v)
                      const currentName = channelForm.name.trim()
                      const shouldSyncName =
                        !currentName || (prevSup && currentName === prevSup.name.trim())
                      setChannelForm({
                        ...channelForm,
                        supplierId: v,
                        name: shouldSyncName && nextSup ? nextSup.name : channelForm.name,
                      })
                    }}
                  >
                    <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name} ({s.baseUrl}) {s.hasApiKey ? '' : '[未配Key]'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AdminField>

                <AdminField label="渠道名称（默认取供应商名称）">
                  <Input
                    value={channelForm.name}
                    onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                    placeholder="留空默认取供应商名称"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="优先级（数字越大越先调度）">
                  <Input
                    type="number"
                    value={channelForm.priority}
                    onChange={(e) =>
                      setChannelForm({
                        ...channelForm,
                        priority: Math.trunc(Number(e.target.value) || 0),
                      })
                    }
                    className={ADMIN_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="渠道开关">
                  <div className="flex h-8 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                    <span className="text-zinc-500">
                      {channelForm.enabled ? '参与路由调度' : '已禁用'}
                    </span>
                    <Switch
                      checked={channelForm.enabled}
                      onCheckedChange={(v) => setChannelForm({ ...channelForm, enabled: v })}
                    />
                  </div>
                </AdminField>

                <AdminField
                  label="模型 ID"
                  className={channelForm.model === 'custom' ? '' : 'sm:col-span-2'}
                >
                  <Select
                    value={channelForm.model}
                    onValueChange={(v) => setChannelForm({ ...channelForm, model: v })}
                  >
                    <SelectTrigger className={`w-full font-mono ${ADMIN_SELECT_CLS}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {!PROVIDER_META[channelForm.providerId].models.some(
                        (m) => m.value === channelForm.model
                      ) && (
                        <SelectItem value={channelForm.model} className="font-mono text-xs">
                          {channelForm.model} (当前配置)
                        </SelectItem>
                      )}
                      {PROVIDER_META[channelForm.providerId].models.map((m) => (
                        <SelectItem key={m.value} value={m.value} className="font-mono text-xs">
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AdminField>

                {channelForm.model === 'custom' && (
                  <AdminField label="自定义模型 ID">
                    <Input
                      value={channelForm.customModel}
                      onChange={(e) =>
                        setChannelForm({ ...channelForm, customModel: e.target.value })
                      }
                      placeholder="输入完整模型 ID"
                      className={ADMIN_INPUT_CLS}
                    />
                  </AdminField>
                )}
              </div>

              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <div className="mb-3 font-bold text-zinc-500">
                  渠道专属协议参数（支持官方与中转站混配）
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {channelForm.providerId === 'gemini' && (
                    <>
                      <AdminField label="协议模式">
                        <Select
                          value={(channelForm.params as GeminiParams).endpointMode}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, endpointMode: v } as GeminiParams,
                            })
                          }
                        >
                          <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="native">原生协议 (:generateContent)</SelectItem>
                            <SelectItem value="openai_chat">
                              OpenAI 对话接口 (/v1/chat/completions)
                            </SelectItem>
                            <SelectItem value="openai_edits_json">
                              OpenAI 图像接口 (/v1/images/edits JSON)
                            </SelectItem>
                            <SelectItem value="openai_edits">
                              OpenAI 图像接口 (/v1/images/edits 表单)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </AdminField>
                      <AdminField label="原生协议鉴权方式">
                        <Select
                          value={(channelForm.params as GeminiParams).authMode || 'auto'}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, authMode: v } as GeminiParams,
                            })
                          }
                        >
                          <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              自动兼容（官方/Vertex 走密钥，中转站走令牌）
                            </SelectItem>
                            <SelectItem value="bearer">仅 Authorization: Bearer</SelectItem>
                            <SelectItem value="goog_key">仅 x-goog-api-key + ?key=</SelectItem>
                            <SelectItem value="both">
                              同时发送 Bearer + goog-key + ?key=
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </AdminField>
                      <AdminField label="默认分辨率">
                        <Select
                          value={(channelForm.params as GeminiParams).imageSize}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, imageSize: v } as GeminiParams,
                            })
                          }
                        >
                          <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1K">1K</SelectItem>
                            <SelectItem value="2K">2K</SelectItem>
                            <SelectItem value="4K">4K</SelectItem>
                          </SelectContent>
                        </Select>
                      </AdminField>
                    </>
                  )}

                  {channelForm.providerId === 'gpt' && (
                    <>
                      <AdminField label="调用端点">
                        <Select
                          value={(channelForm.params as GptParams).endpointMode}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, endpointMode: v } as GptParams,
                            })
                          }
                        >
                          <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="images_edits_json">/v1/images/edits (JSON)</SelectItem>
                            <SelectItem value="images_edits">
                              /v1/images/edits (Multipart 中转常用)
                            </SelectItem>
                            <SelectItem value="responses">/v1/responses</SelectItem>
                            <SelectItem value="chat">/v1/chat/completions</SelectItem>
                          </SelectContent>
                        </Select>
                      </AdminField>
                      <AdminField label="渲染质量 (quality)">
                        <Select
                          value={(channelForm.params as GptParams).quality}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, quality: v } as GptParams,
                            })
                          }
                        >
                          <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">high</SelectItem>
                            <SelectItem value="xhigh">xhigh</SelectItem>
                            <SelectItem value="max">max</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="auto">auto</SelectItem>
                          </SelectContent>
                        </Select>
                      </AdminField>
                      <AdminField label="规划复杂度 (2.6 专属)">
                        <Select
                          value={(channelForm.params as GptParams).complexity || 'auto'}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, complexity: v } as GptParams,
                            })
                          }
                        >
                          <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">auto（默认）</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="low">low</SelectItem>
                          </SelectContent>
                        </Select>
                      </AdminField>
                    </>
                  )}

                  {channelForm.providerId === 'grok' && (
                    <>
                      <AdminField label="调用端点">
                        <Select
                          value={(channelForm.params as GrokParams).endpointMode}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, endpointMode: v } as GrokParams,
                            })
                          }
                        >
                          <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="xai_edits">
                              xAI Edits JSON (/v1/images/edits)
                            </SelectItem>
                            <SelectItem value="openai_edits_json">OpenAI Edits JSON</SelectItem>
                            <SelectItem value="openai_edits">OpenAI Edits Multipart</SelectItem>
                            <SelectItem value="openai_chat">
                              OpenAI Chat (/v1/chat/completions)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </AdminField>
                      <AdminField label="输出分辨率">
                        <Select
                          value={(channelForm.params as GrokParams).resolution}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, resolution: v } as GrokParams,
                            })
                          }
                        >
                          <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2k">2k</SelectItem>
                            <SelectItem value="1k">1k</SelectItem>
                          </SelectContent>
                        </Select>
                      </AdminField>
                      <AdminField label="质量 / 返回格式">
                        <div className="flex gap-1.5">
                          <Select
                            value={(channelForm.params as GrokParams).quality}
                            onValueChange={(v) =>
                              setChannelForm({
                                ...channelForm,
                                params: { ...channelForm.params, quality: v } as GrokParams,
                              })
                            }
                          >
                            <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="medium">medium</SelectItem>
                              <SelectItem value="low">low</SelectItem>
                              <SelectItem value="auto">auto</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={(channelForm.params as GrokParams).responseFormat}
                            onValueChange={(v) =>
                              setChannelForm({
                                ...channelForm,
                                params: { ...channelForm.params, responseFormat: v } as GrokParams,
                              })
                            }
                          >
                            <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="b64_json">b64_json</SelectItem>
                              <SelectItem value="url">url</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </AdminField>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Button
                  variant="outline"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() => setChannelDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  disabled={savingChannel}
                  onClick={() => void handleSaveChannel()}
                >
                  {savingChannel ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  保存渠道
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
