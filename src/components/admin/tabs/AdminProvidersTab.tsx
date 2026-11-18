import { useCallback, useEffect, useState } from 'react'
import {
  CheckIcon,
  ExternalLinkIcon,
  LayersIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  createAdminChannelApi,
  createAdminProfileApi,
  deleteAdminChannelApi,
  deleteAdminProfileApi,
  fetchAdminProvidersApi,
  updateAdminChannelApi,
  updateAdminProfileApi,
  updateAdminProviderSlotApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type {
  AdminProviderSlotDTO,
  GeminiParams,
  GptParams,
  GrokParams,
  ImageProviderId,
  ModelProfileDTO,
  ProfileResolutionOption,
  ProviderChannelDTO,
  StudioResolution,
  SupplierDTO,
} from '@/types/gallery'
import {
  DEFAULT_PROVIDER_PARAMS,
  PROVIDER_META,
  PROVIDER_SUPPORTED_RESOLUTIONS,
  STUDIO_RESOLUTION_META,
  getProfileCreditRange,
  getStudioArtist,
  normalizeProfileResolutions,
  resolveProfileDefaultResolution,
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

interface ProfileFormState {
  id?: string
  providerId: ImageProviderId
  displayName: string
  badge: string
  tagline: string
  enabled: boolean
  isDefault: boolean
  creditCost: number
  defaultResolution: StudioResolution
  resolutions: ProfileResolutionOption[]
  sortOrder: number
}

interface ChannelFormState {
  id?: string
  providerId: ImageProviderId
  profileId: string
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
  initialProvider?: ImageProviderId | null
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onSelectTab: (tab: AdminTab) => void
  onRefreshBootstrap: () => Promise<void>
}

function formatSlotCostSummary(profiles: ModelProfileDTO[]): string {
  const active = profiles.filter((p) => p.enabled)
  const pool = active.length > 0 ? active : profiles
  if (pool.length === 0) return '未设档位'
  let min = Infinity
  let max = -Infinity
  for (const p of pool) {
    const r = getProfileCreditRange(p)
    if (r.min < min) min = r.min
    if (r.max > max) max = r.max
  }
  if (!Number.isFinite(min)) return '—'
  return min === max ? `${min} 积分/次` : `${min}~${max} 积分/次`
}

export function AdminProvidersTab({
  reloadTick,
  initialProvider,
  onLoadingChange,
  onConfirm,
  onSelectTab,
  onRefreshBootstrap,
}: AdminProvidersTabProps) {
  const [slots, setSlots] = useState<AdminProviderSlotDTO[]>([])
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [activePid, setActivePid] = useState<ImageProviderId>(initialProvider || 'gpt')
  const [selectedProfileByPid, setSelectedProfileByPid] = useState<
    Partial<Record<ImageProviderId, string>>
  >({})
  const [savingSlot, setSavingSlot] = useState(false)
  const [savedSlotMetaKey, setSavedSlotMetaKey] = useState('')

  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [profileForm, setProfileForm] = useState<ProfileFormState | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  const [channelDialogOpen, setChannelDialogOpen] = useState(false)
  const [channelForm, setChannelForm] = useState<ChannelFormState | null>(null)
  const [savingChannel, setSavingChannel] = useState(false)
  const [prevInitialProvider, setPrevInitialProvider] = useState(initialProvider)

  if (initialProvider !== prevInitialProvider) {
    setPrevInitialProvider(initialProvider)
    if (initialProvider) {
      setActivePid(initialProvider)
    }
  }

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const pRes = await fetchAdminProvidersApi()
      setSlots(pRes.slots)
      setSuppliers(pRes.suppliers)
      setSavedSlotMetaKey(
        JSON.stringify(
          pRes.slots.map((sl) => ({
            id: sl.providerId,
            enabled: sl.enabled,
          }))
        )
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载画笔档位与路由配置失败')
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
  const activeProfiles = activeSlot?.profiles || []
  const selectedProfileId = selectedProfileByPid[activePid]
  const activeProfile =
    activeProfiles.find((p) => p.id === selectedProfileId) ??
    activeProfiles.find((p) => p.isDefault) ??
    activeProfiles[0] ??
    null

  const currentSlotMetaKey = JSON.stringify(
    slots.map((sl) => ({
      id: sl.providerId,
      enabled: sl.enabled,
    }))
  )
  const slotDirty = Boolean(savedSlotMetaKey && currentSlotMetaKey !== savedSlotMetaKey)

  const updateLocalSlot = (patch: Partial<AdminProviderSlotDTO>) => {
    setSlots((prev) => prev.map((s) => (s.providerId === activePid ? { ...s, ...patch } : s)))
  }

  const handleSaveSlot = async () => {
    if (!activeSlot) return
    setSavingSlot(true)
    try {
      const slotRes = await updateAdminProviderSlotApi(activePid, {
        enabled: activeSlot.enabled,
      })
      setSlots(slotRes.slots)
      setSavedSlotMetaKey(
        JSON.stringify(
          slotRes.slots.map((sl) => ({
            id: sl.providerId,
            enabled: sl.enabled,
          }))
        )
      )
      await onRefreshBootstrap()
      toast.success(`已保存「${getStudioArtist(activePid).name}」开放状态`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingSlot(false)
    }
  }

  const openNewProfile = () => {
    const baseCost = activeProfile?.creditCost ?? activeSlot?.creditCost ?? 10
    const resolutions = normalizeProfileResolutions(activePid, null, baseCost)
    const defRes = resolveProfileDefaultResolution(activePid, '2K', resolutions) ?? '2K'
    setProfileForm({
      providerId: activePid,
      displayName: '',
      badge: '',
      tagline: '',
      enabled: true,
      isDefault: activeProfiles.length === 0,
      creditCost: baseCost,
      defaultResolution: defRes,
      resolutions,
      sortOrder: activeProfiles.length,
    })
    setProfileDialogOpen(true)
  }

  const openEditProfile = (prof: ModelProfileDTO) => {
    const resolutions = normalizeProfileResolutions(prof.providerId, prof.resolutions, prof.creditCost)
    const defRes =
      resolveProfileDefaultResolution(prof.providerId, prof.defaultResolution, resolutions) ?? '2K'
    setProfileForm({
      id: prof.id,
      providerId: prof.providerId,
      displayName: prof.displayName,
      badge: prof.badge,
      tagline: prof.tagline,
      enabled: prof.enabled,
      isDefault: prof.isDefault,
      creditCost: prof.creditCost,
      defaultResolution: defRes,
      resolutions,
      sortOrder: prof.sortOrder,
    })
    setProfileDialogOpen(true)
  }

  const handleSaveProfile = async () => {
    if (!profileForm) return
    if (!profileForm.displayName.trim()) {
      toast.error('请填写前端展示名称')
      return
    }
    const supported = PROVIDER_SUPPORTED_RESOLUTIONS[profileForm.providerId]
    if (supported.length > 0 && !profileForm.resolutions.some((r) => r.enabled)) {
      toast.error('请至少启用 1 个输出分辨率')
      return
    }

    setSavingProfile(true)
    try {
      const payload = {
        displayName: profileForm.displayName.trim(),
        badge: profileForm.badge.trim(),
        tagline: profileForm.tagline.trim(),
        enabled: profileForm.enabled,
        isDefault: profileForm.isDefault,
        creditCost: profileForm.creditCost,
        defaultResolution: supported.length > 0 ? profileForm.defaultResolution : null,
        resolutions: supported.length > 0 ? profileForm.resolutions : [],
        sortOrder: profileForm.sortOrder,
      }
      const res = profileForm.id
        ? await updateAdminProfileApi(profileForm.id, payload)
        : await createAdminProfileApi(profileForm.providerId, payload)
      setSlots(res.slots)
      if (!profileForm.id && 'createdProfileId' in res && res.createdProfileId) {
        setSelectedProfileByPid((prev) => ({
          ...prev,
          [profileForm.providerId]: res.createdProfileId,
        }))
      }
      setProfileDialogOpen(false)
      await onRefreshBootstrap()
      toast.success(profileForm.id ? '画笔档位已更新' : '新画笔档位已创建')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存画笔档位失败')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleToggleProfileEnabled = async (prof: ModelProfileDTO) => {
    try {
      const res = await updateAdminProfileApi(prof.id, { enabled: !prof.enabled })
      setSlots(res.slots)
      await onRefreshBootstrap()
      toast.success(!prof.enabled ? `已开放画笔「${prof.displayName}」` : `已停用画笔「${prof.displayName}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleSetDefaultProfile = async (prof: ModelProfileDTO) => {
    if (prof.isDefault) return
    try {
      const res = await updateAdminProfileApi(prof.id, { isDefault: true })
      setSlots(res.slots)
      await onRefreshBootstrap()
      toast.success(`已将「${prof.displayName}」设为默认画笔`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleDeleteProfile = (prof: ModelProfileDTO) => {
    onConfirm({
      title: `删除画笔档位「${prof.displayName}」`,
      description: `删除后该档位下绑定的 ${prof.channels.length} 条路由渠道也将一并移除，已生成的历史作品不受影响。`,
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        const res = await deleteAdminProfileApi(prof.id)
        setSlots(res.slots)
        await onRefreshBootstrap()
        toast.success(`已删除画笔「${prof.displayName}」`)
      },
    })
  }

  const openNewChannel = () => {
    if (suppliers.length === 0) {
      toast.info('请先在「03. 供应商凭证」创建一个供应商（填好域名与密钥）')
      onSelectTab('suppliers')
      return
    }
    if (!activeProfile) {
      toast.info('请先新建一个画笔档位')
      return
    }
    const defaultSup = suppliers.find((s) => s.enabled && s.hasApiKey) || suppliers[0]
    setChannelForm({
      providerId: activePid,
      profileId: activeProfile.id,
      supplierId: defaultSup.id,
      name: defaultSup.name,
      enabled: defaultSup.enabled && defaultSup.hasApiKey,
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
      profileId: ch.profileId,
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
    if (channelForm.enabled && selectedSup && (!selectedSup.enabled || !selectedSup.hasApiKey)) {
      toast.error('所选供应商已停用或未配置访问密钥，无法启用该路由渠道')
      return
    }
    const effectiveName = channelForm.name.trim() || selectedSup?.name.trim() || ''
    if (!effectiveName) {
      toast.error('请填写渠道名称')
      return
    }
    if (channelForm.model === 'custom' && !channelForm.customModel.trim()) {
      toast.error('选择自定义模型时请填写自定义模型 ID')
      return
    }
    setSavingChannel(true)
    try {
      const res = channelForm.id
        ? await updateAdminChannelApi(channelForm.id, {
            profileId: channelForm.profileId,
            supplierId: channelForm.supplierId,
            name: effectiveName,
            enabled: channelForm.enabled,
            model: channelForm.model,
            customModel: channelForm.customModel.trim(),
            priority: channelForm.priority,
            params: channelForm.params as unknown as Record<string, unknown>,
          })
        : await createAdminChannelApi(channelForm.providerId, {
            profileId: channelForm.profileId,
            supplierId: channelForm.supplierId,
            name: effectiveName,
            enabled: channelForm.enabled,
            model: channelForm.model,
            customModel: channelForm.customModel.trim(),
            priority: channelForm.priority,
            params: channelForm.params as unknown as Record<string, unknown>,
          })
      setSlots(res.slots)
      setSelectedProfileByPid((prev) => ({
        ...prev,
        [channelForm.providerId]: channelForm.profileId,
      }))
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
      description: '删除后该渠道不再参与当前画笔档位的容灾与负载均衡调度。',
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
          title="画笔档位、分辨率定价与路由调度"
          description="正在同步画笔档位与渠道路由信息…"
        />
      </div>
    )
  }

  const activeProfileChannels = activeProfile?.channels || []
  const profileSupportedResolutions = profileForm
    ? PROVIDER_SUPPORTED_RESOLUTIONS[profileForm.providerId]
    : []

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="画笔档位、分辨率定价与路由调度"
        description="每位画师家族下可开放多支画笔（建议用直白中文命名与简短特点词，如 GPT Sunburst 设为「稳绘精修 · 画得稳」、Flare 设为「疾速草图 · 画得快」），分别配置分辨率开关与积分价格；每支画笔内部独立挂载多条官方/中转站渠道做容灾调度。"
      />

      {/* 顶部 3 栏：画师家族切换 */}
      <div className="grid grid-cols-1 divide-y divide-zinc-200 border border-zinc-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
        {slots.map((s, idx) => {
          const pMeta = PROVIDER_META[s.providerId]
          const artist = getStudioArtist(s.providerId)
          const isActive = activePid === s.providerId
          const enabledProfiles = s.profiles.filter((p) => p.enabled)
          const readyChannels = s.profiles.reduce(
            (sum, p) =>
              sum +
              p.channels.filter((c) => c.enabled && c.supplierEnabled && c.supplierHasKey).length,
            0
          )
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
                {s.enabled ? formatSlotCostSummary(s.profiles) : '[已停用]'} · {enabledProfiles.length} 档位 ·{' '}
                {readyChannels} 渠道{s.usesEnvFallback ? ' (+Env兜底)' : ''}
              </span>
            </button>
          )
        })}
      </div>

      {/* 画师总开关与兜底状态 */}
      <AdminPanel
        title={`${meta.name} · 对应画师「${getStudioArtist(activePid).name}」总控`}
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            {activeSlot.hasEnvKey ? (
              <AdminBadge tone={activeSlot.usesEnvFallback ? 'warning' : 'success'}>
                {activeSlot.usesEnvFallback ? '当前走 Env Secret 兜底运行' : '已配 Env Secret 备用'}
              </AdminBadge>
            ) : null}
            <Button variant="ghost" size="sm" className={ADMIN_BTN_SM_CLS} asChild>
              <a href={meta.docUrl} target="_blank" rel="noreferrer">
                <ExternalLinkIcon className="size-3.5" />
                官方文档
              </a>
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="画师家族总开关">
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

          <AdminField label="参考图传输协议设置">
            <div className="flex h-8 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
              <span className="text-xs text-zinc-500">URL / Base64 与拼图开关已统一至全局配置</span>
              <button
                type="button"
                onClick={() => onSelectTab('access')}
                className="font-mono text-xs font-bold underline underline-offset-2 hover:text-zinc-950 dark:hover:text-white"
              >
                前往调整
              </button>
            </div>
          </AdminField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {slotDirty && <AdminBadge tone="warning">有未保存的总控状态改动</AdminBadge>}
          <Button
            size="sm"
            className={ADMIN_BTN_CLS}
            disabled={savingSlot}
            onClick={() => void handleSaveSlot()}
          >
            {savingSlot ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <CheckIcon className="size-3.5" />
            )}
            保存画师开放状态
          </Button>
        </div>
      </AdminPanel>

      {/* 画笔档位列表 */}
      <AdminPanel
        title={`前端画笔档位 (${activeProfiles.length})`}
        subtitle="每个档位对应工作台中的一支画笔；建议填写直白中文名和简短特点短标（如：画得稳、画得快），点击某行可管理该画笔下的路由渠道。"
        icon={<LayersIcon className="size-3.5" />}
        headerRight={
          <Button size="sm" className={ADMIN_BTN_CLS} onClick={openNewProfile}>
            <PlusIcon className="size-3.5" />
            新增画笔档位
          </Button>
        }
        padded={false}
      >
        {activeProfiles.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            当前画师尚无画笔档位，请点击右上角「新增画笔档位」。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 font-mono text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2.5">画笔名称与特点</th>
                  <th className="px-4 py-2.5">分辨率与积分定价</th>
                  <th className="px-4 py-2.5">可用渠道</th>
                  <th className="px-4 py-2.5">排序</th>
                  <th className="px-4 py-2.5">开放</th>
                  <th className="px-4 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {activeProfiles.map((prof) => {
                  const selected = activeProfile?.id === prof.id
                  const readyCount = prof.channels.filter(
                    (c) => c.enabled && c.supplierEnabled && c.supplierHasKey
                  ).length
                  const enabledRes = prof.resolutions.filter((r) => r.enabled)
                  return (
                    <tr
                      key={prof.id}
                      tabIndex={0}
                      aria-label={`选择画笔档位 ${prof.displayName}`}
                      aria-selected={selected}
                      onClick={() =>
                        setSelectedProfileByPid((prev) => ({ ...prev, [activePid]: prof.id }))
                      }
                      onKeyDown={(e) => {
                        if (
                          e.target !== e.currentTarget &&
                          (e.target as HTMLElement).closest('button,a,input,select,[role="switch"]')
                        ) {
                          return
                        }
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedProfileByPid((prev) => ({ ...prev, [activePid]: prof.id }))
                        }
                      }}
                      className={`cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-950 dark:focus-visible:outline-zinc-100 ${
                        selected
                          ? 'bg-zinc-100/90 dark:bg-zinc-900'
                          : 'hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {selected && (
                            <span className="inline-block size-1.5 bg-zinc-950 dark:bg-zinc-100" />
                          )}
                          <span className="font-bold text-zinc-950 dark:text-zinc-100">
                            {prof.displayName}
                          </span>
                          {prof.badge && <AdminBadge tone="info">{prof.badge}</AdminBadge>}
                          {prof.isDefault && <AdminBadge tone="dark">默认</AdminBadge>}
                        </div>
                        {prof.tagline && (
                          <div className="mt-1 text-xs text-zinc-500">{prof.tagline}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {enabledRes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {enabledRes.map((r) => (
                              <span
                                key={r.resolution}
                                className={`border px-1.5 py-0.5 text-xs ${
                                  r.resolution === prof.defaultResolution
                                    ? 'border-zinc-950 bg-zinc-950/5 font-bold dark:border-zinc-200 dark:bg-zinc-100/10'
                                    : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400'
                                }`}
                              >
                                {r.resolution}
                                {r.resolution === prof.defaultResolution ? '(默)' : ''}: {r.creditCost}分
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="font-bold">{prof.creditCost} 积分/次</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span
                          className={
                            readyCount > 0
                              ? 'font-bold text-emerald-700 dark:text-emerald-400'
                              : 'font-bold text-amber-700 dark:text-amber-400'
                          }
                        >
                          {readyCount} / {prof.channels.length}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-zinc-500">{prof.sortOrder}</td>
                      <td
                        className="px-4 py-3"
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                      >
                        <Switch
                          checked={prof.enabled}
                          onCheckedChange={() => void handleToggleProfileEnabled(prof)}
                        />
                      </td>
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => {
                          e.stopPropagation()
                        }}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          {!prof.isDefault && (
                            <Button
                              size="sm"
                              variant="outline"
                              className={ADMIN_BTN_SM_CLS}
                              onClick={() => void handleSetDefaultProfile(prof)}
                              title="设为选中该画师时的默认档位"
                            >
                              <StarIcon className="size-3" />
                              设为默认
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className={ADMIN_BTN_SM_CLS}
                            onClick={() => openEditProfile(prof)}
                          >
                            <PencilIcon className="size-3" />
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={activeProfiles.length <= 1}
                            title={
                              activeProfiles.length <= 1
                                ? '每位画师至少保留 1 个档位'
                                : '删除此档位及其渠道'
                            }
                            className={`${ADMIN_BTN_SM_CLS} text-red-600 hover:bg-red-500/10 disabled:opacity-35`}
                            onClick={() => handleDeleteProfile(prof)}
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

      {/* 当前选中档位的路由渠道列表 */}
      <AdminPanel
        title={
          activeProfile
            ? `「${activeProfile.displayName}」专属路由渠道 (${activeProfileChannels.length})`
            : '路由渠道列表'
        }
        subtitle="仅在当前选中的画笔档位内部按优先级调度与故障转移；可混配官方与多家中转站的不同模型别名。"
        headerRight={
          <Button size="sm" className={ADMIN_BTN_CLS} onClick={openNewChannel} disabled={!activeProfile}>
            <PlusIcon className="size-3.5" />
            添加渠道
          </Button>
        }
        padded={false}
      >
        {activeProfileChannels.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            档位「{activeProfile?.displayName || '—'}」尚未配置任何路由渠道。点击右上角「添加渠道」引用供应商，或编辑其他档位下的现有渠道将其迁移至此。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2.5">渠道名称</th>
                  <th className="px-4 py-2.5">引用供应商</th>
                  <th className="px-4 py-2.5">上游模型 / 协议</th>
                  <th className="px-4 py-2.5">优先级</th>
                  <th className="px-4 py-2.5">启用</th>
                  <th className="px-4 py-2.5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {activeProfileChannels.map((ch) => {
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
                        <div className="max-w-[200px] truncate text-xs text-zinc-500">
                          {ch.supplierBaseUrl}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold">{effectiveModel}</div>
                        <div className="text-xs text-zinc-500">
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

      {/* 新建/编辑画笔档位弹窗 */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className={`max-h-[90dvh] w-[95vw] max-w-2xl overflow-y-auto sm:max-w-2xl ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {profileForm?.id ? '编辑画笔档位' : '新增画笔档位'}
            </DialogTitle>
          </DialogHeader>
          {profileForm && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="画笔名称（直接展示给用户，建议直白中文）">
                  <Input
                    value={profileForm.displayName}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, displayName: e.target.value })
                    }
                    placeholder="例如：稳绘精修 / 疾速快笔 / 细腻精绘"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="画笔特点短标（简短中文，代替生涩的 PRO / NEW）">
                  <div className="space-y-1.5">
                    <Input
                      value={profileForm.badge}
                      onChange={(e) => setProfileForm({ ...profileForm, badge: e.target.value })}
                      placeholder="例如：画得稳、画得快、细节足（留空不显示）"
                      className={ADMIN_TEXT_INPUT_CLS}
                    />
                    <div className="flex flex-wrap gap-1">
                      {['画得稳', '画得快', '细节足', '理解准', '质感强', '省积分'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setProfileForm({ ...profileForm, badge: preset })}
                          className={`border px-1.5 py-0.5 text-xs transition-colors ${
                            profileForm.badge === preset
                              ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                              : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </AdminField>

                <AdminField label="画笔特点说明（悬浮或选中该画笔时显示在「选择画笔」栏右侧）" className="sm:col-span-2">
                  <Input
                    value={profileForm.tagline}
                    onChange={(e) => setProfileForm({ ...profileForm, tagline: e.target.value })}
                    placeholder="例如：Sunburst 模型画得稳，适合精细服饰纹理 / Flare 模型画得快，适合快速出图"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="排序权重（数字越小越靠前）">
                  <Input
                    type="number"
                    value={profileForm.sortOrder}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        sortOrder: Math.trunc(Number(e.target.value) || 0),
                      })
                    }
                    className={ADMIN_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="开放与默认状态">
                  <div className="flex h-8 items-center justify-between gap-3 border border-zinc-200 px-3 dark:border-zinc-800">
                    <label className="flex items-center gap-2">
                      <span className="text-zinc-600 dark:text-zinc-400">开放</span>
                      <Switch
                        checked={profileForm.enabled}
                        onCheckedChange={(v) => setProfileForm({ ...profileForm, enabled: v })}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="text-zinc-600 dark:text-zinc-400">设为默认</span>
                      <Switch
                        checked={profileForm.isDefault}
                        onCheckedChange={(v) => setProfileForm({ ...profileForm, isDefault: v })}
                      />
                    </label>
                  </div>
                </AdminField>
              </div>

              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                {profileSupportedResolutions.length > 0 ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-zinc-700 dark:text-zinc-200">
                        前端可选分辨率与分档积分定价
                      </span>
                      <span className="text-xs text-zinc-500">
                        开启 2 个及以上分辨率时，工作台前端将展示分辨率切换按钮
                      </span>
                    </div>
                    <div className="divide-y divide-zinc-200 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                      {profileForm.resolutions.map((resOpt) => {
                        const resMeta = STUDIO_RESOLUTION_META[resOpt.resolution]
                        const isDef = profileForm.defaultResolution === resOpt.resolution
                        return (
                          <div
                            key={resOpt.resolution}
                            className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                          >
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={resOpt.enabled}
                                onCheckedChange={(checked) => {
                                  const nextList = profileForm.resolutions.map((item) =>
                                    item.resolution === resOpt.resolution
                                      ? { ...item, enabled: checked }
                                      : item
                                  )
                                  if (!nextList.some((item) => item.enabled)) {
                                    toast.error('至少保留 1 个可用分辨率')
                                    return
                                  }
                                  const nextDefault =
                                    resolveProfileDefaultResolution(
                                      profileForm.providerId,
                                      profileForm.defaultResolution,
                                      nextList
                                    ) ?? nextList.find((x) => x.enabled)!.resolution
                                  setProfileForm({
                                    ...profileForm,
                                    resolutions: nextList,
                                    defaultResolution: nextDefault,
                                  })
                                }}
                              />
                              <div>
                                <div className="font-mono font-bold">
                                  {resMeta.label}{' '}
                                  <span className="font-sans font-normal text-zinc-500">
                                    · {resMeta.hint}
                                  </span>
                                </div>
                                <div className="text-xs text-zinc-500">{resMeta.description}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={isDef ? 'default' : 'outline'}
                                disabled={!resOpt.enabled}
                                className={ADMIN_BTN_SM_CLS}
                                onClick={() =>
                                  setProfileForm({
                                    ...profileForm,
                                    defaultResolution: resOpt.resolution,
                                  })
                                }
                              >
                                {isDef ? '默认分辨率' : '设为默认'}
                              </Button>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min={0}
                                  max={100000}
                                  disabled={!resOpt.enabled}
                                  value={resOpt.creditCost}
                                  onChange={(e) => {
                                    const nextVal = Math.max(
                                      0,
                                      Math.trunc(Number(e.target.value) || 0)
                                    )
                                    setProfileForm({
                                      ...profileForm,
                                      resolutions: profileForm.resolutions.map((item) =>
                                        item.resolution === resOpt.resolution
                                          ? { ...item, creditCost: nextVal }
                                          : item
                                      ),
                                    })
                                  }}
                                  className={`w-20 ${ADMIN_INPUT_CLS}`}
                                />
                                <span className="text-zinc-500">积分</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AdminField label="单次生图消耗积分">
                      <Input
                        type="number"
                        min={0}
                        max={100000}
                        value={profileForm.creditCost}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            creditCost: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                          })
                        }
                        className={ADMIN_INPUT_CLS}
                      />
                    </AdminField>
                    <div className="flex items-end pb-1 text-xs text-zinc-500">
                      OpenAI GPT Image 尺寸按画幅比例固定映射，画质由下方路由渠道的 quality 参数控制。
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Button
                  variant="outline"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() => setProfileDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  disabled={savingProfile}
                  onClick={() => void handleSaveProfile()}
                >
                  {savingProfile ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  保存画笔档位
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 新建/编辑渠道弹窗 */}
      <Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
        <DialogContent className={`max-h-[90dvh] w-[95vw] max-w-2xl overflow-y-auto sm:max-w-2xl ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {channelForm?.id ? '编辑路由渠道' : '添加路由渠道'}
            </DialogTitle>
          </DialogHeader>
          {channelForm && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label="所属前端画笔档位（支持迁移渠道归属）" className="sm:col-span-2">
                  <Select
                    value={channelForm.profileId}
                    onValueChange={(v) => setChannelForm({ ...channelForm, profileId: v })}
                  >
                    <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(slots.find((s) => s.providerId === channelForm.providerId)?.profiles || []).map(
                        (p) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.displayName} {p.isDefault ? '(默认)' : ''}{' '}
                            {p.enabled ? '' : '[已停用]'}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </AdminField>

                <AdminField label="引用供应商（复用接口地址与密钥）">
                  <Select
                    value={channelForm.supplierId}
                    onValueChange={(v) => {
                      const prevSup = suppliers.find((s) => s.id === channelForm.supplierId)
                      const nextSup = suppliers.find((s) => s.id === v)
                      const currentName = channelForm.name.trim()
                      const shouldSyncName =
                        !currentName || (prevSup && currentName === prevSup.name.trim())
                      const supUsable = Boolean(nextSup?.enabled && nextSup?.hasApiKey)
                      setChannelForm({
                        ...channelForm,
                        supplierId: v,
                        name: shouldSyncName && nextSup ? nextSup.name : channelForm.name,
                        enabled: supUsable ? channelForm.enabled : false,
                      })
                    }}
                  >
                    <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name} ({s.baseUrl}) {!s.enabled ? '[已停用]' : !s.hasApiKey ? '[未配Key]' : ''}
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
                  label="上游模型 ID"
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
                      <AdminField label="兜底分辨率（前端自选会覆盖）">
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
                      <AdminField label="兜底分辨率（前端自选会覆盖）">
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
