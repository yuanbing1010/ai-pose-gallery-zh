import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CoinsIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FolderTreeIcon,
  ImageIcon,
  LayersIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldAlertIcon,
  TagIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { AdminShell } from '@/components/admin/AdminShell'
import {
  ADMIN_TABS,
  AUDIT_STATUS_META,
  LEDGER_TYPE_LABELS,
  getAdminNavItems,
  type AdminTab,
} from '@/components/admin/auditHelpers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  adjustUserCreditsApi,
  createAdminChannelApi,
  createAdminRedeemCodesApi,
  createAdminSupplierApi,
  deleteAdminChannelApi,
  deleteAdminSupplierApi,
  fetchAdminGenerationsApi,
  fetchAdminLedgerApi,
  fetchAdminOverviewApi,
  fetchAdminProvidersApi,
  fetchAdminRedeemCodesApi,
  fetchAdminSettingsApi,
  fetchAdminSuppliersApi,
  fetchAdminUsersApi,
  toggleAdminRedeemCodeApi,
  updateAdminChannelApi,
  updateAdminProviderSlotApi,
  updateAdminSettingsApi,
  updateAdminSupplierApi,
  updateUserStatusApi,
  uploadAdminStylePreviewApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { getStyleVisualMeta } from '@/lib/stylePresets'
import {
  DEFAULT_PROVIDER_PARAMS,
  NONE_STYLE_PRESET,
  PROVIDER_META,
  PROVIDER_ORDER,
  buildRecipePrompt,
  getEffectiveStyleCatalog,
  getEffectiveStyleCategories,
  getEffectiveStyleSubcategories,
  getStudioArtist,
  normalizeStylePresetTaxonomy,
} from '../../shared/studio'
import type {
  AdminOverviewPayload,
  AdminProviderSlotDTO,
  CreditLedgerItem,
  GeminiParams,
  GenerationHistoryItem,
  GptParams,
  GrokParams,
  ImagePassMode,
  ImageProviderId,
  PlatformConfig,
  ProviderChannelDTO,
  PublicUser,
  RedeemCodeItem,
  StyleCategoryItem,
  StylePresetItem,
  StyleSubcategoryItem,
  SupplierDTO,
} from '@/types/gallery'
import { useStudio } from '@/store/studioStore'

export const Route = createFileRoute('/admin/')({
  staticData: { title: '管理端控制台' },
  validateSearch: (search: Record<string, unknown>): { tab?: AdminTab } => {
    const raw = typeof search.tab === 'string' ? search.tab : ''
    if (ADMIN_TABS.includes(raw as AdminTab)) {
      return { tab: raw as AdminTab }
    }
    return {}
  },
  component: AdminHomePage,
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—'
  const safe = Math.max(0, Math.round(ms))
  if (safe < 1000) return `${safe}ms`
  return `${(safe / 1000).toFixed(1)}s`
}

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

interface StyleFormState {
  isNew: boolean
  id: string
  categoryId: string
  subcategoryId: string
  label: string
  shortLabel: string
  tagline: string
  prompt: string
  negativePrompt: string
  previewUrl: string
}

interface CategoryFormState {
  isNew: boolean
  id: string
  label: string
}

interface SubcategoryFormState {
  isNew: boolean
  id: string
  categoryId: string
  label: string
}

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

function AdminHomePage() {
  const navigate = useNavigate()
  const { tab: searchTab } = Route.useSearch()
  const tab: AdminTab = searchTab ?? 'overview'
  const setTab = useCallback(
    (nextTab: AdminTab) => {
      void navigate({
        to: '/admin',
        search: nextTab === 'overview' ? {} : { tab: nextTab },
        replace: true,
      })
    },
    [navigate]
  )
  const { user, bootstrapLoaded, refreshBootstrap } = useStudio()

  const [loading, setLoading] = useState(false)

  // 00. Overview
  const [overview, setOverview] = useState<AdminOverviewPayload | null>(null)

  // 01. Suppliers
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

  // 02. Provider Slots & Channels
  const [slots, setSlots] = useState<AdminProviderSlotDTO[]>([])
  const [activePid, setActivePid] = useState<ImageProviderId>('gpt')
  const [savingSlot, setSavingSlot] = useState(false)
  const [channelDialogOpen, setChannelDialogOpen] = useState(false)
  const [channelForm, setChannelForm] = useState<ChannelFormState | null>(null)
  const [savingChannel, setSavingChannel] = useState(false)

  // 03. Users & Credits
  const [userQuery, setUserQuery] = useState('')
  const [users, setUsers] = useState<Array<PublicUser & { jobsCount: number }>>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [ledger, setLedger] = useState<CreditLedgerItem[]>([])
  const [adjustTarget, setAdjustTarget] = useState<(PublicUser & { jobsCount: number }) | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('100')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  // 04. Redeem Codes
  const [codes, setCodes] = useState<RedeemCodeItem[]>([])
  const [newCodeCount, setNewCodeCount] = useState('5')
  const [newCodeCredits, setNewCodeCredits] = useState('50')
  const [newCodeMaxUses, setNewCodeMaxUses] = useState('1')
  const [newCodeDays, setNewCodeDays] = useState('30')
  const [newCodePrefix, setNewCodePrefix] = useState('POSE')
  const [newCodeNote, setNewCodeNote] = useState('')
  const [creatingCodes, setCreatingCodes] = useState(false)

  // 05. Platform Settings & Styles
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig | null>(null)
  const [savingPlatform, setSavingPlatform] = useState(false)
  const [previewStyleKey, setPreviewStyleKey] = useState<string>('')
  const [styleDialogOpen, setStyleDialogOpen] = useState(false)
  const [styleForm, setStyleForm] = useState<StyleFormState | null>(null)
  const [savingStyle, setSavingStyle] = useState(false)
  const [uploadingStyleImg, setUploadingStyleImg] = useState(false)
  const styleFileInputRef = useRef<HTMLInputElement | null>(null)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState | null>(null)
  const [subcategoryDialogOpen, setSubcategoryDialogOpen] = useState(false)
  const [subcategoryForm, setSubcategoryForm] = useState<SubcategoryFormState | null>(null)
  const [savingTaxonomy, setSavingTaxonomy] = useState(false)
  const [focusedCategoryId, setFocusedCategoryId] = useState<'all' | string>('all')
  const [adminStyleCategoryFilter, setAdminStyleCategoryFilter] = useState<string>('all')
  const [adminStyleSubcategoryFilter, setAdminStyleSubcategoryFilter] = useState<string>('all')
  const [adminStyleQuery, setAdminStyleQuery] = useState('')

  // 06. Jobs Audit
  const [jobs, setJobs] = useState<GenerationHistoryItem[]>([])
  const [jobStatusFilter, setJobStatusFilter] = useState('all')
  const [jobProviderFilter, setJobProviderFilter] = useState('all')
  const [jobQuery, setJobQuery] = useState('')
  const [appliedJobQuery, setAppliedJobQuery] = useState('')

  useEffect(() => {
    if (!bootstrapLoaded) return
    if (!user || user.role !== 'admin') {
      void navigate({ to: '/admin/login' })
    }
  }, [bootstrapLoaded, navigate, user])

  const loadTabData = useCallback(
    async (targetTab: AdminTab) => {
      setLoading(true)
      try {
        if (targetTab === 'overview') {
          setOverview(await fetchAdminOverviewApi())
        } else if (targetTab === 'suppliers') {
          const res = await fetchAdminSuppliersApi()
          setSuppliers(res.suppliers)
        } else if (targetTab === 'api') {
          const [pRes, sRes] = await Promise.all([
            fetchAdminProvidersApi(),
            fetchAdminSettingsApi(),
          ])
          setSlots(pRes.slots)
          setSuppliers(pRes.suppliers)
          setPlatformCfg(sRes.platform)
        } else if (targetTab === 'users') {
          const [uRes, lRes] = await Promise.all([
            fetchAdminUsersApi(userQuery, 60, 0),
            fetchAdminLedgerApi(60),
          ])
          setUsers(uRes.users)
          setUsersTotal(uRes.total)
          setLedger(lRes.items)
        } else if (targetTab === 'redeem') {
          const res = await fetchAdminRedeemCodesApi()
          setCodes(res.codes)
        } else if (targetTab === 'safety') {
          const res = await fetchAdminSettingsApi()
          setPlatformCfg(res.platform)
        } else if (targetTab === 'jobs') {
          const res = await fetchAdminGenerationsApi({
            status: jobStatusFilter === 'all' ? undefined : jobStatusFilter,
            provider: jobProviderFilter === 'all' ? undefined : jobProviderFilter,
            q: appliedJobQuery.trim() || undefined,
            limit: 60,
          })
          setJobs(res.items)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '加载管理数据失败')
      } finally {
        setLoading(false)
      }
    },
    [appliedJobQuery, jobProviderFilter, jobStatusFilter, userQuery]
  )

  useEffect(() => {
    if (tab !== 'jobs') return
    const timer = window.setTimeout(() => {
      setAppliedJobQuery(jobQuery)
    }, 280)
    return () => window.clearTimeout(timer)
  }, [jobQuery, tab])

  useEffect(() => {
    if (!bootstrapLoaded || user?.role !== 'admin') return
    const timer = window.setTimeout(() => {
      void loadTabData(tab)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [bootstrapLoaded, loadTabData, tab, user?.role])

  if (!bootstrapLoaded || !user || user.role !== 'admin') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white text-xs text-zinc-500 dark:bg-zinc-950">
        <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
        正在校验管理员会话…
      </div>
    )
  }

  const activeSlot = slots.find((s) => s.providerId === activePid)
  const meta = PROVIDER_META[activePid]

  // Supplier handlers
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
      await refreshBootstrap()
      toast.success(supplierForm.id ? '供应商已更新（引用它的全部渠道已即时生效）' : '供应商已创建')
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
      setSupplierForm((prev) => ({ ...prev, apiKey: '', hasExistingKey: false, apiKeyHint: '' }))
      await refreshBootstrap()
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
      await refreshBootstrap()
      toast.success(!s.enabled ? `已启用供应商「${s.name}」` : `已停用供应商「${s.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '切换失败')
    }
  }

  const handleDeleteSupplier = async (s: SupplierDTO) => {
    try {
      const res = await deleteAdminSupplierApi(s.id)
      setSuppliers(res.suppliers)
      toast.success(`已删除供应商「${s.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  // Slot & Channel handlers
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
      if (settingsRes) {
        setPlatformCfg(settingsRes.platform)
      }
      await refreshBootstrap()
      toast.success(`已保存「${getStudioArtist(activePid).name}」槽位配置与全局传参模式`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingSlot(false)
    }
  }

  const openNewChannel = () => {
    if (suppliers.length === 0) {
      toast.info('请先在「01. 供应商管理」创建一个供应商（填好域名与密钥）')
      setTab('suppliers')
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
      await refreshBootstrap()
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
      await refreshBootstrap()
      toast.success(!ch.enabled ? `已启用渠道「${ch.name}」` : `已停用渠道「${ch.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleDeleteChannel = async (ch: ProviderChannelDTO) => {
    try {
      const res = await deleteAdminChannelApi(ch.id)
      setSlots(res.slots)
      await refreshBootstrap()
      toast.success(`已删除渠道「${ch.name}」`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败')
    }
  }

  const handleSavePlatform = async (successMsg = '平台全局设置已保存') => {
    if (!platformCfg) return
    setSavingPlatform(true)
    try {
      const res = await updateAdminSettingsApi(platformCfg)
      setPlatformCfg(res.platform)
      await refreshBootstrap()
      toast.success(successMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingPlatform(false)
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
      await loadTabData('users')
      if (adjustTarget.id === user.id) await refreshBootstrap()
      toast.success(`已为 ${adjustTarget.username} ${delta > 0 ? '充值' : '扣减'} ${Math.abs(delta)} 积分`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '调整失败')
    } finally {
      setAdjusting(false)
    }
  }

  const handleToggleUserStatus = async (u: PublicUser & { jobsCount: number }) => {
    const nextStatus = u.status === 'active' ? 'disabled' : 'active'
    try {
      await updateUserStatusApi(u.id, { status: nextStatus })
      await loadTabData('users')
      toast.success(nextStatus === 'disabled' ? `已禁用账号 ${u.username}` : `已恢复账号 ${u.username}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const handleCreateCodes = async () => {
    setCreatingCodes(true)
    try {
      const res = await createAdminRedeemCodesApi({
        count: Number(newCodeCount) || 1,
        credits: Number(newCodeCredits) || 50,
        maxUses: Number(newCodeMaxUses) || 1,
        expiresDays: newCodeDays.trim() ? Number(newCodeDays) : null,
        prefix: newCodePrefix.trim() || 'POSE',
        note: newCodeNote.trim(),
      })
      setCodes((prev) => [...res.codes, ...prev])
      setNewCodeNote('')
      toast.success(`已生成 ${res.codes.length} 个兑换码`)
      try {
        await navigator.clipboard.writeText(res.codes.map((c) => c.code).join('\n'))
        toast.info('已自动复制新生成的兑换码到剪贴板')
      } catch {}
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    } finally {
      setCreatingCodes(false)
    }
  }

  const handleToggleCodeStatus = async (item: RedeemCodeItem) => {
    const next = item.status === 'active' ? 'disabled' : 'active'
    try {
      await toggleAdminRedeemCodeApi(item.id, next)
      setCodes((prev) => prev.map((c) => (c.id === item.id ? { ...c, status: next } : c)))
      toast.success(next === 'active' ? '已启用兑换码' : '已停用兑换码')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '操作失败')
    }
  }

  const navItems = getAdminNavItems()
  const activeNavItem = navItems.find((i) => i.id === tab)
  const directoryLabel = activeNavItem ? `${activeNavItem.code}. ${activeNavItem.label}` : '00. 系统总览'

  const styleCategories = getEffectiveStyleCategories(platformCfg)
  const styleSubcategories = getEffectiveStyleSubcategories(platformCfg)
  const styleCategoryMap = new Map(styleCategories.map((c) => [c.id, c]))
  const styleSubcategoryMap = new Map(styleSubcategories.map((s) => [s.id, s]))
  const styleCatalog = getEffectiveStyleCatalog(platformCfg)

  const effectiveFocusedCategoryId =
    focusedCategoryId === 'all' || styleCategoryMap.has(focusedCategoryId)
      ? focusedCategoryId
      : 'all'
  const visibleSubcategories =
    effectiveFocusedCategoryId === 'all'
      ? styleSubcategories
      : styleSubcategories.filter((s) => s.categoryId === effectiveFocusedCategoryId)

  const effectiveAdminCatFilter =
    adminStyleCategoryFilter === 'all' || styleCategoryMap.has(adminStyleCategoryFilter)
      ? adminStyleCategoryFilter
      : 'all'
  const adminFilterSubcategories =
    effectiveAdminCatFilter === 'all'
      ? styleSubcategories
      : styleSubcategories.filter((s) => s.categoryId === effectiveAdminCatFilter)
  const effectiveAdminSubFilter =
    adminStyleSubcategoryFilter === 'all' ||
    adminFilterSubcategories.some((s) => s.id === adminStyleSubcategoryFilter)
      ? adminStyleSubcategoryFilter
      : 'all'

  const normalizedAdminStyleQuery = adminStyleQuery.trim().toLowerCase()
  const filteredStyleCatalog = styleCatalog.filter((item) => {
    if (effectiveAdminCatFilter !== 'all' && item.categoryId !== effectiveAdminCatFilter) {
      return false
    }
    if (effectiveAdminSubFilter !== 'all' && item.subcategoryId !== effectiveAdminSubFilter) {
      return false
    }
    if (!normalizedAdminStyleQuery) return true
    const catLabel = styleCategoryMap.get(item.categoryId)?.label || ''
    const subLabel = styleSubcategoryMap.get(item.subcategoryId)?.label || ''
    return [item.label, item.shortLabel || '', item.tagline || '', item.prompt, catLabel, subLabel]
      .join(' ')
      .toLowerCase()
      .includes(normalizedAdminStyleQuery)
  })

  const effectivePreviewStyle =
    previewStyleKey === 'none' || styleCatalog.some((s) => s.id === previewStyleKey)
      ? previewStyleKey
      : styleCatalog[0]?.id || 'none'

  const samplePrompt = buildRecipePrompt(
    {
      portrait: {
        id: 'sample-p',
        分区: '正脸',
        发长: '短发',
        发型名称: '示例发型',
        标题: '示例人像',
        宽: 512,
        高: 512,
        字节数: 1024,
        精选: false,
        热门: false,
        缩略图: '',
        原图: '',
        检索: '',
      },
      costume: {
        id: 'sample-c',
        分类: '日常',
        服装名称: '示例服装',
        标签: [],
        关键词: '',
        缩略图: '',
        预览图: '',
        原图: '',
        检索: '',
      },
      pose: {
        id: 'sample-pose',
        体系: '全身',
        姿势编号: 'P001',
        分类: '站姿',
        姿势名称: '示例姿势',
        角度: '正面',
        缩略图: '',
        原图: '',
        检索: '',
      },
      extraImages: [],
    },
    effectivePreviewStyle,
    {
      prefix: platformCfg?.defaultPromptPrefix,
      suffix: platformCfg?.defaultPromptSuffix,
      negativePrompt: platformCfg?.defaultNegativePrompt,
      styleCategories,
      styleSubcategories,
      stylePresets: styleCatalog,
      stylePromptOverrides: platformCfg?.stylePromptOverrides,
    }
  )

  const persistStyleCatalog = async (
    nextPresets: StylePresetItem[],
    successMsg: string,
    options?: {
      defaultStylePreset?: string
      styleCategories?: StyleCategoryItem[]
      styleSubcategories?: StyleSubcategoryItem[]
    }
  ) => {
    if (!platformCfg) return
    setSavingStyle(true)
    try {
      const nextDefaultStyle =
        options?.defaultStylePreset !== undefined
          ? options.defaultStylePreset
          : platformCfg.defaultStylePreset === 'none' ||
              nextPresets.some((s) => s.id === platformCfg.defaultStylePreset)
            ? platformCfg.defaultStylePreset
            : 'none'
      const res = await updateAdminSettingsApi({
        ...(options?.styleCategories !== undefined
          ? { styleCategories: options.styleCategories }
          : {}),
        ...(options?.styleSubcategories !== undefined
          ? { styleSubcategories: options.styleSubcategories }
          : {}),
        stylePresets: nextPresets,
        defaultStylePreset: nextDefaultStyle,
      })
      setPlatformCfg((prev) =>
        prev
          ? {
              ...prev,
              styleCategories: res.platform.styleCategories,
              styleSubcategories: res.platform.styleSubcategories,
              stylePresets: res.platform.stylePresets,
              defaultStylePreset: res.platform.defaultStylePreset,
            }
          : res.platform
      )
      await refreshBootstrap()
      toast.success(successMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存画风失败')
    } finally {
      setSavingStyle(false)
    }
  }

  const persistStyleTaxonomy = async (
    nextCategories: StyleCategoryItem[],
    nextSubcategories: StyleSubcategoryItem[],
    successMsg: string,
    nextPresetsOverride?: StylePresetItem[]
  ) => {
    if (!platformCfg) return
    setSavingTaxonomy(true)
    try {
      const res = await updateAdminSettingsApi({
        styleCategories: nextCategories,
        styleSubcategories: nextSubcategories,
        ...(nextPresetsOverride !== undefined ? { stylePresets: nextPresetsOverride } : {}),
      })
      setPlatformCfg((prev) =>
        prev
          ? {
              ...prev,
              styleCategories: res.platform.styleCategories,
              styleSubcategories: res.platform.styleSubcategories,
              stylePresets: res.platform.stylePresets,
              defaultStylePreset: res.platform.defaultStylePreset,
            }
          : res.platform
      )
      await refreshBootstrap()
      toast.success(successMsg)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存画风分类失败')
    } finally {
      setSavingTaxonomy(false)
    }
  }

  const openNewCategory = () => {
    setCategoryForm({
      isNew: true,
      id: `cat_${crypto.randomUUID().slice(0, 8)}`,
      label: '',
    })
    setCategoryDialogOpen(true)
  }

  const openEditCategory = (cat: StyleCategoryItem) => {
    setCategoryForm({
      isNew: false,
      id: cat.id,
      label: cat.label,
    })
    setCategoryDialogOpen(true)
  }

  const handleSaveCategory = async () => {
    if (!categoryForm) return
    const label = categoryForm.label.trim()
    if (!label) {
      toast.error('请填写大类名称')
      return
    }
    const duplicated = styleCategories.some(
      (c) => c.id !== categoryForm.id && c.label.trim() === label
    )
    if (duplicated) {
      toast.error(`大类名称「${label}」已存在`)
      return
    }
    const nextItem: StyleCategoryItem = { id: categoryForm.id, label }
    const nextCategories = categoryForm.isNew
      ? [...styleCategories, nextItem]
      : styleCategories.map((c) => (c.id === nextItem.id ? nextItem : c))
    await persistStyleTaxonomy(
      nextCategories,
      styleSubcategories,
      categoryForm.isNew ? `已新增大类「${label}」` : `已更新大类「${label}」`
    )
    setFocusedCategoryId(nextItem.id)
    setCategoryDialogOpen(false)
  }

  const handleDeleteCategory = async (cat: StyleCategoryItem) => {
    const subCount = styleSubcategories.filter((s) => s.categoryId === cat.id).length
    const styleCount = styleCatalog.filter((p) => p.categoryId === cat.id).length
    if (subCount > 0 || styleCount > 0) {
      toast.error(`大类「${cat.label}」下仍有 ${subCount} 个小类、${styleCount} 种画风，请先清空后再删除`)
      return
    }
    if (styleCategories.length <= 1 && styleCatalog.length > 0) {
      toast.error('请至少保留一个画风大类')
      return
    }
    const nextCategories = styleCategories.filter((c) => c.id !== cat.id)
    await persistStyleTaxonomy(nextCategories, styleSubcategories, `已删除大类「${cat.label}」`)
    if (focusedCategoryId === cat.id) {
      setFocusedCategoryId('all')
    }
  }

  const handleMoveCategory = async (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= styleCategories.length) return
    const nextCategories = [...styleCategories]
    ;[nextCategories[index], nextCategories[target]] = [
      nextCategories[target],
      nextCategories[index],
    ]
    await persistStyleTaxonomy(nextCategories, styleSubcategories, '大类排序已更新')
  }

  const openNewSubcategory = (preferredCategoryId?: string) => {
    const defaultCategoryId =
      preferredCategoryId && preferredCategoryId !== 'all' && styleCategoryMap.has(preferredCategoryId)
        ? preferredCategoryId
        : effectiveFocusedCategoryId !== 'all'
          ? effectiveFocusedCategoryId
          : styleCategories[0]?.id || ''
    if (!defaultCategoryId) {
      toast.error('请先创建一个画风大类')
      return
    }
    setSubcategoryForm({
      isNew: true,
      id: `sub_${crypto.randomUUID().slice(0, 8)}`,
      categoryId: defaultCategoryId,
      label: '',
    })
    setSubcategoryDialogOpen(true)
  }

  const openEditSubcategory = (sub: StyleSubcategoryItem) => {
    setSubcategoryForm({
      isNew: false,
      id: sub.id,
      categoryId: sub.categoryId,
      label: sub.label,
    })
    setSubcategoryDialogOpen(true)
  }

  const handleSaveSubcategory = async () => {
    if (!subcategoryForm) return
    const label = subcategoryForm.label.trim()
    if (!label) {
      toast.error('请填写小类名称')
      return
    }
    if (!styleCategoryMap.has(subcategoryForm.categoryId)) {
      toast.error('请选择所属大类')
      return
    }
    const duplicated = styleSubcategories.some(
      (s) =>
        s.id !== subcategoryForm.id &&
        s.categoryId === subcategoryForm.categoryId &&
        s.label.trim() === label
    )
    if (duplicated) {
      toast.error(`该大类下已存在小类「${label}」`)
      return
    }

    const nextSub: StyleSubcategoryItem = {
      id: subcategoryForm.id,
      categoryId: subcategoryForm.categoryId,
      label,
    }
    const nextSubcategories = subcategoryForm.isNew
      ? [...styleSubcategories, nextSub]
      : styleSubcategories.map((s) => (s.id === nextSub.id ? nextSub : s))

    const prevSub = styleSubcategoryMap.get(nextSub.id)
    const categoryChanged = Boolean(prevSub && prevSub.categoryId !== nextSub.categoryId)
    const syncedPresets = categoryChanged
      ? styleCatalog.map((p) =>
          p.subcategoryId === nextSub.id ? { ...p, categoryId: nextSub.categoryId } : p
        )
      : undefined

    await persistStyleTaxonomy(
      styleCategories,
      nextSubcategories,
      subcategoryForm.isNew ? `已新增小类「${label}」` : `已更新小类「${label}」`,
      syncedPresets
    )
    setSubcategoryDialogOpen(false)
  }

  const handleDeleteSubcategory = async (sub: StyleSubcategoryItem) => {
    const usedCount = styleCatalog.filter((p) => p.subcategoryId === sub.id).length
    if (usedCount > 0) {
      toast.error(`小类「${sub.label}」下仍有 ${usedCount} 种画风，请先将画风调整至其他小类后再删除`)
      return
    }
    const nextSubcategories = styleSubcategories.filter((s) => s.id !== sub.id)
    await persistStyleTaxonomy(styleCategories, nextSubcategories, `已删除小类「${sub.label}」`)
  }

  const handleMoveSubcategory = async (subId: string, delta: -1 | 1) => {
    const visibleIdx = visibleSubcategories.findIndex((s) => s.id === subId)
    const targetSub = visibleSubcategories[visibleIdx + delta]
    if (visibleIdx < 0 || !targetSub) return
    const idxA = styleSubcategories.findIndex((s) => s.id === subId)
    const idxB = styleSubcategories.findIndex((s) => s.id === targetSub.id)
    if (idxA < 0 || idxB < 0) return
    const nextSubcategories = [...styleSubcategories]
    ;[nextSubcategories[idxA], nextSubcategories[idxB]] = [
      nextSubcategories[idxB],
      nextSubcategories[idxA],
    ]
    await persistStyleTaxonomy(styleCategories, nextSubcategories, '小类排序已更新')
  }

  const openNewStyle = () => {
    const preferredSub =
      (effectiveAdminSubFilter !== 'all'
        ? styleSubcategoryMap.get(effectiveAdminSubFilter)
        : undefined) ??
      (effectiveAdminCatFilter !== 'all'
        ? styleSubcategories.find((s) => s.categoryId === effectiveAdminCatFilter)
        : undefined) ??
      styleSubcategories[0]

    if (!preferredSub) {
      toast.error('请先在上方配置至少一个画风大类与小类')
      return
    }

    setStyleForm({
      isNew: true,
      id: `style_${crypto.randomUUID().slice(0, 8)}`,
      categoryId: preferredSub.categoryId,
      subcategoryId: preferredSub.id,
      label: '',
      shortLabel: '',
      tagline: '',
      prompt: '',
      negativePrompt: '',
      previewUrl: '',
    })
    setStyleDialogOpen(true)
  }

  const openEditStyle = (item: StylePresetItem) => {
    const normalized = normalizeStylePresetTaxonomy(item, styleCategories, styleSubcategories)
    setStyleForm({
      isNew: false,
      id: item.id,
      categoryId: normalized.categoryId,
      subcategoryId: normalized.subcategoryId,
      label: item.label,
      shortLabel: item.shortLabel || '',
      tagline: item.tagline || '',
      prompt: item.prompt,
      negativePrompt: item.negativePrompt || '',
      previewUrl: item.previewUrl || '',
    })
    setStyleDialogOpen(true)
  }

  const handleUploadStylePreview = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    setUploadingStyleImg(true)
    try {
      const uploaded = await uploadAdminStylePreviewApi({
        file,
        filename: file.name || 'style-preview.png',
      })
      setStyleForm((prev) => (prev ? { ...prev, previewUrl: uploaded.url } : prev))
      toast.success('示意图已上传')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传示意图失败')
    } finally {
      setUploadingStyleImg(false)
    }
  }

  const handleSaveStyle = async () => {
    if (!styleForm || !platformCfg) return
    const label = styleForm.label.trim()
    if (!label) {
      toast.error('请填写画风标题')
      return
    }
    const selectedSub = styleSubcategoryMap.get(styleForm.subcategoryId)
    if (!selectedSub) {
      toast.error('请选择所属画风大类与小类')
      return
    }
    if (!styleForm.prompt.trim()) {
      toast.error('请填写风格提示词')
      return
    }
    const nextItem: StylePresetItem = {
      id: styleForm.id,
      categoryId: selectedSub.categoryId,
      subcategoryId: selectedSub.id,
      label,
      ...(styleForm.shortLabel.trim() ? { shortLabel: styleForm.shortLabel.trim() } : {}),
      ...(styleForm.tagline.trim() ? { tagline: styleForm.tagline.trim() } : {}),
      prompt: styleForm.prompt.trim(),
      ...(styleForm.negativePrompt.trim()
        ? { negativePrompt: styleForm.negativePrompt.trim() }
        : {}),
      ...(styleForm.previewUrl.trim() ? { previewUrl: styleForm.previewUrl.trim() } : {}),
    }

    const nextPresets = styleForm.isNew
      ? [...styleCatalog, nextItem]
      : styleCatalog.map((item) => (item.id === nextItem.id ? nextItem : item))

    await persistStyleCatalog(
      nextPresets,
      styleForm.isNew ? `已添加画风「${label}」` : `已更新画风「${label}」`
    )
    setPreviewStyleKey(nextItem.id)
    setStyleDialogOpen(false)
  }

  const handleDeleteStyle = async (item: StylePresetItem) => {
    const nextPresets = styleCatalog.filter((s) => s.id !== item.id)
    await persistStyleCatalog(nextPresets, `已删除画风「${item.label}」`)
  }

  const handleMoveStyleById = async (styleId: string, delta: -1 | 1) => {
    const filteredIdx = filteredStyleCatalog.findIndex((s) => s.id === styleId)
    const targetItem = filteredStyleCatalog[filteredIdx + delta]
    if (filteredIdx < 0 || !targetItem) return
    const idxA = styleCatalog.findIndex((s) => s.id === styleId)
    const idxB = styleCatalog.findIndex((s) => s.id === targetItem.id)
    if (idxA < 0 || idxB < 0) return
    const nextPresets = [...styleCatalog]
    ;[nextPresets[idxA], nextPresets[idxB]] = [nextPresets[idxB], nextPresets[idxA]]
    await persistStyleCatalog(nextPresets, '画风排序已更新')
  }

  return (
    <AdminShell
      activeTab={tab}
      directoryLabel={directoryLabel}
      loading={loading}
      onRefresh={() => void loadTabData(tab)}
      onSelectTab={setTab}
    >
      {/* 00. 系统总览 */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <h1 className="text-xl font-bold tracking-tight">系统运营与资源总览</h1>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  用户账本、供应商路由与云端对象存储实时统计。
                </p>
              </div>

              {overview && !overview.encryptionConfigured && (
                <div className="flex items-center gap-3 border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
                  <ShieldAlertIcon className="size-4 shrink-0" />
                  <span>
                    未检测到环境变量 <code>APP_ENCRYPTION_KEY</code>（当前使用开发降级密钥）。生产部署前请务必运行{' '}
                    <code>npx wrangler secret put APP_ENCRYPTION_KEY</code>。
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 divide-x divide-y divide-zinc-200 border border-zinc-200 sm:grid-cols-4 sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
                <div className="p-5">
                  <div className="text-xs font-medium text-zinc-500">01. 注册用户总数</div>
                  <div className="mt-2 font-mono text-2xl font-bold">{overview?.usersTotal ?? '—'}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    正常活跃：{overview?.activeUsersTotal ?? 0}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs font-medium text-zinc-500">02. 积分累计消耗</div>
                  <div className="mt-2 font-mono text-2xl font-bold">{overview?.creditsConsumedTotal ?? '—'}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    累计发放：{overview?.creditsIssuedTotal ?? 0}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs font-medium text-zinc-500">03. 供应商 / 渠道</div>
                  <div className="mt-2 font-mono text-2xl font-bold">
                    {overview ? `${overview.suppliersTotal} / ${overview.channelsTotal}` : '—'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    生图成功 {overview?.jobsSucceeded ?? 0} · 失败 {overview?.jobsFailed ?? 0}
                  </div>
                </div>
                <div className="p-5">
                  <div className="text-xs font-medium text-zinc-500">04. 云端存储空间</div>
                  <div className="mt-2 font-mono text-2xl font-bold">
                    {overview ? formatBytes(overview.r2TotalBytes) : '—'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    对象数：{overview?.r2AssetsTotal ?? 0} · 卡密 {overview?.redeemCodesTotal ?? 0}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 01. 供应商管理 */}
          {tab === 'suppliers' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">供应商凭证池 ({suppliers.length})</h1>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    统一配置官方或中转站接口域名与密钥（加密入库），同一供应商可被多个模型渠道复用。
                  </p>
                </div>
                <Button size="sm" onClick={openNewSupplier}>
                  <PlusIcon className="size-4" />
                  新建供应商
                </Button>
              </div>

              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
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
                        <td colSpan={6} className="px-4 py-10 text-center font-sans text-zinc-500">
                          暂无供应商，请点击右上角「新建供应商」添加官方或中转站凭证。
                        </td>
                      </tr>
                    ) : (
                      suppliers.map((s) => (
                        <tr key={s.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                          <td className="px-4 py-3">
                            <div className="font-sans font-bold">{s.name}</div>
                            {s.note && <div className="font-sans text-[11px] text-zinc-500">{s.note}</div>}
                          </td>
                          <td className="max-w-[260px] truncate px-4 py-3">{s.baseUrl}</td>
                          <td className="px-4 py-3">
                            {s.hasApiKey ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {s.apiKeyHint || '已配置'}
                              </span>
                            ) : (
                              <span className="text-red-500">[未配置]</span>
                            )}
                          </td>
                          <td className="px-4 py-3">{s.channelCount} 个渠道</td>
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
                                className="h-7 text-xs"
                                onClick={() => openEditSupplier(s)}
                              >
                                <PencilIcon className="size-3" />
                                编辑
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-red-600 hover:bg-red-500/10"
                                disabled={s.channelCount > 0}
                                title={s.channelCount > 0 ? '正被渠道引用，不可删除' : '删除供应商'}
                                onClick={() => void handleDeleteSupplier(s)}
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
            </div>
          )}

          {/* 02. 模型渠道与定价 */}
          {tab === 'api' && activeSlot && (
            <div className="space-y-6">
              <div className="border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <h1 className="text-xl font-bold tracking-tight">模型渠道调度与积分定价</h1>
                <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  每种模型可配置多条渠道（官方 / 中转站混用）：优先调度高优先级渠道，同优先级均衡调度，失败自动无缝切换备用渠道。
                </p>
              </div>

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
                      className={`flex flex-col items-start p-3.5 text-left transition-colors ${
                        isActive
                          ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                          : 'bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <span className={`font-mono text-xs ${isActive ? 'opacity-70' : 'text-zinc-500'}`}>
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
              <section className="border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="font-mono text-xs font-bold">
                    {meta.name} · 对应画师「{getStudioArtist(activePid).name}」槽位配置
                  </span>
                  <Button variant="ghost" size="sm" asChild>
                    <a href={meta.docUrl} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon className="size-3.5" />
                      官方文档
                    </a>
                  </Button>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="block font-mono text-xs font-bold">画师开放状态</label>
                    <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {activeSlot.enabled ? '对用户前端开放' : '已下线（前端显示暂休）'}
                      </span>
                      <Switch
                        checked={activeSlot.enabled}
                        onCheckedChange={(v) => updateLocalSlot({ enabled: v })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block font-mono text-xs font-bold">单次生图消耗积分</label>
                    <Input
                      type="number"
                      min={0}
                      max={100000}
                      value={activeSlot.creditCost}
                      onChange={(e) =>
                        updateLocalSlot({ creditCost: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
                      }
                      className="font-mono text-xs"
                    />
                  </div>
                  {platformCfg && (
                    <div className="space-y-1.5">
                      <label className="block font-mono text-xs font-bold">全局参考图传参方式（全站共用）</label>
                      <Select
                        value={platformCfg.imagePassMode}
                        onValueChange={(v) =>
                          setPlatformCfg((prev) =>
                            prev ? { ...prev, imagePassMode: v as ImagePassMode } : prev
                          )
                        }
                      >
                        <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url">优先 HTTPS URL（私有图自动转 Base64）</SelectItem>
                          <SelectItem value="base64">统一转 Base64 编码发送</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="flex justify-end border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
                  <Button size="sm" disabled={savingSlot} onClick={() => void handleSaveSlotAndPassMode()}>
                    {savingSlot ? <LoaderCircleIcon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
                    保存配置
                  </Button>
                </div>
              </section>

              {/* 多渠道列表 */}
              <section className="border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <div>
                    <span className="text-xs font-bold">
                      路由渠道列表 ({activeSlot.channels.length})
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">
                      优先调度高优先级渠道，同优先级均衡调度，失败自动无缝切换备用渠道
                    </span>
                  </div>
                  <Button size="sm" onClick={openNewChannel}>
                    <PlusIcon className="size-3.5" />
                    添加渠道
                  </Button>
                </div>

                {activeSlot.channels.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    当前模型尚未配置任何渠道。点击右上角「添加渠道」引用已配置的供应商即可启用。
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead className="border-b border-zinc-200 bg-zinc-50/70 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50">
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
                          const effectiveModel = ch.model === 'custom' ? ch.customModel || '(未填)' : ch.model
                          return (
                            <tr key={ch.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                              <td className="px-4 py-3">
                                <div className="font-sans font-bold">{ch.name}</div>
                                {!ch.supplierEnabled && (
                                  <span className="text-[11px] text-amber-600">[供应商已停用]</span>
                                )}
                                {ch.supplierEnabled && !ch.supplierHasKey && (
                                  <span className="text-[11px] text-red-500">[供应商未配密钥]</span>
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
                                  {(ch.params as any).endpointMode}
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
                                    className="h-7 text-xs"
                                    onClick={() => openEditChannel(ch)}
                                  >
                                    <PencilIcon className="size-3" />
                                    编辑
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-red-600 hover:bg-red-500/10"
                                    onClick={() => void handleDeleteChannel(ch)}
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
              </section>
            </div>
          )}

          {/* 03. 用户与积分 */}
          {tab === 'users' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">用户账号与积分管理 ({usersTotal})</h1>
                  <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    支持按用户名/邮箱搜索、手动加减积分、封禁异常账号与审查近期积分流水。
                  </p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void loadTabData('users')
                  }}
                  className="flex items-center gap-2"
                >
                  <Input
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    placeholder="搜索用户名 / 邮箱…"
                    className="h-8 w-52 font-mono text-xs"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-8">
                    <SearchIcon className="size-3.5" />
                    查询
                  </Button>
                </form>
              </div>

              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    <tr>
                      <th className="px-4 py-2.5">账号</th>
                      <th className="px-4 py-2.5">角色</th>
                      <th className="px-4 py-2.5">积分余额</th>
                      <th className="px-4 py-2.5">生图数</th>
                      <th className="px-4 py-2.5">状态</th>
                      <th className="px-4 py-2.5">注册时间</th>
                      <th className="px-4 py-2.5 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-zinc-50/70 dark:hover:bg-zinc-900/50">
                        <td className="px-4 py-2.5">
                          <div className="font-sans font-bold">{u.displayName}</div>
                          <div className="text-[11px] text-zinc-500">
                            @{u.username}
                            {u.email ? ` · ${u.email}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={
                              u.role === 'admin'
                                ? 'bg-zinc-950 px-1.5 py-0.5 text-white dark:bg-zinc-100 dark:text-zinc-950'
                                : 'text-zinc-500'
                            }
                          >
                            {u.role === 'admin' ? '管理员' : '普通用户'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-bold">{u.creditBalance}</td>
                        <td className="px-4 py-2.5">{u.jobsCount}</td>
                        <td className="px-4 py-2.5">
                          <span className={u.status === 'active' ? 'text-emerald-600' : 'text-red-500'}>
                            {u.status === 'active' ? '正常' : '已禁用'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-500">{formatDateTime(u.createdAt)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => {
                                setAdjustTarget(u)
                                setAdjustDelta('100')
                                setAdjustNote('')
                              }}
                            >
                              <CoinsIcon className="size-3" />
                              调积分
                            </Button>
                            {u.id !== user.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => void handleToggleUserStatus(u)}
                              >
                                {u.status === 'active' ? '禁用' : '启用'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <section className="space-y-3">
                <h2 className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  全站近期积分流水
                </h2>
                <div className="max-h-72 overflow-y-auto border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left font-mono text-xs">
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {ledger.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-bold">@{item.username || item.userId.slice(0, 8)}</td>
                          <td className="px-3 py-2 font-sans text-zinc-500">
                            {LEDGER_TYPE_LABELS[item.type] ?? item.type}
                          </td>
                          <td className="px-3 py-2 font-sans text-zinc-600 dark:text-zinc-400">{item.note}</td>
                          <td
                            className={`px-3 py-2 font-bold ${
                              item.delta >= 0 ? 'text-emerald-600' : 'text-red-500'
                            }`}
                          >
                            {item.delta >= 0 ? `+${item.delta}` : item.delta}
                          </td>
                          <td className="px-3 py-2 text-zinc-500">余 {item.balanceAfter}</td>
                          <td className="px-3 py-2 text-right text-zinc-500">{formatDateTime(item.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* 04. 兑换码管理 */}
          {tab === 'redeem' && (
            <div className="space-y-6">
              <div className="border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <h1 className="text-xl font-bold tracking-tight">积分兑换码（卡密）管理</h1>
                <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  批量生成一次性或多次可用兑换码，用户在前端点击积分余额即可自助兑换。
                </p>
              </div>

              <section className="border border-zinc-200 p-5 dark:border-zinc-800">
                <div className="mb-3 text-xs font-bold text-zinc-600 dark:text-zinc-400">
                  批量生成兑换码
                </div>
                <div className="grid gap-3 sm:grid-cols-6">
                  <div className="space-y-1">
                    <label className="block font-mono text-[11px] font-bold">生成数量 (1~50)</label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={newCodeCount}
                      onChange={(e) => setNewCodeCount(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-mono text-[11px] font-bold">面值积分</label>
                    <Input
                      type="number"
                      min={1}
                      value={newCodeCredits}
                      onChange={(e) => setNewCodeCredits(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-mono text-[11px] font-bold">可用人数/次数</label>
                    <Input
                      type="number"
                      min={1}
                      value={newCodeMaxUses}
                      onChange={(e) => setNewCodeMaxUses(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-mono text-[11px] font-bold">有效天数（留空永久）</label>
                    <Input
                      type="number"
                      min={1}
                      value={newCodeDays}
                      onChange={(e) => setNewCodeDays(e.target.value)}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-mono text-[11px] font-bold">前缀</label>
                    <Input
                      value={newCodePrefix}
                      onChange={(e) => setNewCodePrefix(e.target.value.toUpperCase())}
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-mono text-[11px] font-bold">备注</label>
                    <Input
                      value={newCodeNote}
                      onChange={(e) => setNewCodeNote(e.target.value)}
                      placeholder="活动批次等"
                      className="text-xs"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button size="sm" disabled={creatingCodes} onClick={() => void handleCreateCodes()}>
                    {creatingCodes ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
                    批量生成兑换码
                  </Button>
                </div>
              </section>

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
                    {codes.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2 font-bold">
                          <div className="inline-flex items-center gap-2">
                            <span>{c.code}</span>
                            <button
                              type="button"
                              aria-label="复制兑换码"
                              onClick={() => {
                                void navigator.clipboard.writeText(c.code)
                                toast.success(`已复制 ${c.code}`)
                              }}
                              className="text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
                            >
                              <CopyIcon className="size-3" />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2 font-bold">{c.credits}</td>
                        <td className="px-4 py-2">
                          {c.usedCount} / {c.maxUses}
                        </td>
                        <td className="px-4 py-2 text-zinc-500">
                          {c.expiresAt ? formatDateTime(c.expiresAt) : '永久'}
                        </td>
                        <td className="px-4 py-2 font-sans text-zinc-500">{c.note || '—'}</td>
                        <td className="px-4 py-2">
                          <span className={c.status === 'active' ? 'text-emerald-600' : 'text-red-500'}>
                            {c.status === 'active' ? '可用' : '已停用'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => void handleToggleCodeStatus(c)}
                          >
                            {c.status === 'active' ? '停用' : '启用'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 05. 安全与提示词设置 */}
          {tab === 'safety' && platformCfg && (
            <div className="space-y-6">
              <div className="border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <h1 className="text-xl font-bold tracking-tight">注册策略、安全模式与默认提示词</h1>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  所有设置保存后，用户前端每次访问实时同步。
                </p>
              </div>

              <section className="grid gap-4 border border-zinc-200 p-5 sm:grid-cols-2 dark:border-zinc-800">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold">开放新用户自助注册</label>
                  <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500">
                      {platformCfg.allowRegistration ? '允许访客自主注册' : '关闭注册（仅管理员可建号）'}
                    </span>
                    <Switch
                      checked={platformCfg.allowRegistration}
                      onCheckedChange={(v) => setPlatformCfg({ ...platformCfg, allowRegistration: v })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold">新用户注册赠送积分</label>
                  <Input
                    type="number"
                    min={0}
                    max={100000}
                    value={platformCfg.registerBonusCredits}
                    onChange={(e) =>
                      setPlatformCfg({
                        ...platformCfg,
                        registerBonusCredits: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                      })
                    }
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold">全站默认安全模式</label>
                  <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500">
                      {platformCfg.defaultSafeMode ? '默认隐藏 18+ 敏感分类' : '默认展示完整图库'}
                    </span>
                    <Switch
                      checked={platformCfg.defaultSafeMode}
                      onCheckedChange={(v) => setPlatformCfg({ ...platformCfg, defaultSafeMode: v })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold">允许用户自行解锁 18+ 图库</label>
                  <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500">
                      {platformCfg.allowUserNsfwUnlock ? '允许年龄确认后解锁' : '全站强制锁定安全模式'}
                    </span>
                    <Switch
                      checked={platformCfg.allowUserNsfwUnlock}
                      onCheckedChange={(v) => setPlatformCfg({ ...platformCfg, allowUserNsfwUnlock: v })}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold">全局默认画风预设</label>
                  <Select
                    value={platformCfg.defaultStylePreset}
                    onValueChange={(v) => setPlatformCfg({ ...platformCfg, defaultStylePreset: v })}
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{NONE_STYLE_PRESET.label}</SelectItem>
                      {styleCatalog.map((item) => {
                        const catLabel = styleCategoryMap.get(item.categoryId)?.label
                        const subLabel = styleSubcategoryMap.get(item.subcategoryId)?.label
                        return (
                          <SelectItem key={item.id} value={item.id}>
                            {catLabel && subLabel
                              ? `[${catLabel} · ${subLabel}] ${item.label}`
                              : item.label}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold">额外附带三合一拼图卡片</label>
                  <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500">开启后生成时附加三合一参考拼图</span>
                    <Switch
                      checked={platformCfg.sendStitchedSheet}
                      onCheckedChange={(v) => setPlatformCfg({ ...platformCfg, sendStitchedSheet: v })}
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4 border border-zinc-200 p-5 dark:border-zinc-800">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold">默认前置提示词</label>
                    <Textarea
                      rows={2}
                      value={platformCfg.defaultPromptPrefix}
                      onChange={(e) => setPlatformCfg({ ...platformCfg, defaultPromptPrefix: e.target.value })}
                      placeholder="例如：高精细度商业级人物立绘…"
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold">默认后置提示词</label>
                    <Textarea
                      rows={2}
                      value={platformCfg.defaultPromptSuffix}
                      onChange={(e) => setPlatformCfg({ ...platformCfg, defaultPromptSuffix: e.target.value })}
                      placeholder="例如：构图完整，光影协调…"
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold">全局负面提示词</label>
                  <Textarea
                    rows={2}
                    value={platformCfg.defaultNegativePrompt}
                    onChange={(e) =>
                      setPlatformCfg({ ...platformCfg, defaultNegativePrompt: e.target.value })
                    }
                    placeholder="例如：畸形手指，多指，画面模糊，文字水印（将与所选画风的专属负面提示词自动合并写入「避免：」）"
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex justify-end">
                  <Button size="sm" disabled={savingPlatform} onClick={() => void handleSavePlatform()}>
                    {savingPlatform ? (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    ) : (
                      <CheckIcon className="size-4" />
                    )}
                    保存策略与全局提示词
                  </Button>
                </div>
              </section>

              {/* 画风大类与小类配置（统一定义，画风预设按 ID 引用） */}
              <section className="border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <FolderTreeIcon className="size-3.5" />
                      <span>
                        画风大类与小类配置（共 {styleCategories.length} 大类 · {styleSubcategories.length} 小类）
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      在此统一定义画风的大类与小类层级；下方画风预设与前端工作台图鉴均通过 ID 引用此分类树。点选左侧大类可筛选右侧小类。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-none text-xs"
                      disabled={savingTaxonomy || savingStyle}
                      onClick={openNewCategory}
                    >
                      <PlusIcon className="size-3.5" />
                      新增大类
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 rounded-none text-xs"
                      disabled={savingTaxonomy || savingStyle || styleCategories.length === 0}
                      onClick={() => openNewSubcategory()}
                    >
                      <PlusIcon className="size-3.5" />
                      新增小类
                    </Button>
                  </div>
                </div>

                <div className="grid divide-y divide-zinc-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0 dark:divide-zinc-800">
                  {/* 左列：画风大类 */}
                  <div className="lg:col-span-5">
                    <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/60 px-4 py-2 text-[11px] font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        <LayersIcon className="size-3.5" />
                        画风大类（{styleCategories.length}）
                      </span>
                      {effectiveFocusedCategoryId !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setFocusedCategoryId('all')}
                          className="text-[11px] font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-950 dark:hover:text-zinc-100"
                        >
                          查看全部小类
                        </button>
                      )}
                    </div>

                    {styleCategories.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500">
                        暂无画风大类，点击右上角「新增大类」创建。
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {styleCategories.map((cat, cIdx) => {
                          const subCount = styleSubcategories.filter(
                            (s) => s.categoryId === cat.id
                          ).length
                          const styleCount = styleCatalog.filter(
                            (p) => p.categoryId === cat.id
                          ).length
                          const focused = effectiveFocusedCategoryId === cat.id

                          return (
                            <div
                              key={cat.id}
                              className={`flex items-center justify-between gap-2 px-4 py-2.5 transition-colors ${
                                focused
                                  ? 'border-l-2 border-l-zinc-950 bg-zinc-100/80 dark:border-l-zinc-100 dark:bg-zinc-800/60'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/40'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setFocusedCategoryId(focused ? 'all' : cat.id)
                                }
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-xs font-bold">{cat.label}</span>
                                  <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                                    {cat.id}
                                  </span>
                                </div>
                                <div className="mt-0.5 text-[11px] text-zinc-500">
                                  {subCount} 个小类 · {styleCount} 种画风
                                </div>
                              </button>

                              <div className="flex shrink-0 items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-1.5 text-xs"
                                  disabled={savingTaxonomy || cIdx === 0}
                                  title="上移大类"
                                  onClick={() => void handleMoveCategory(cIdx, -1)}
                                >
                                  <ArrowUpIcon className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-1.5 text-xs"
                                  disabled={savingTaxonomy || cIdx === styleCategories.length - 1}
                                  title="下移大类"
                                  onClick={() => void handleMoveCategory(cIdx, 1)}
                                >
                                  <ArrowDownIcon className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-2 text-xs"
                                  disabled={savingTaxonomy}
                                  title="编辑大类"
                                  onClick={() => openEditCategory(cat)}
                                >
                                  <PencilIcon className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-1.5 text-xs text-red-600 hover:bg-red-500/10"
                                  disabled={savingTaxonomy}
                                  title="删除大类"
                                  onClick={() => void handleDeleteCategory(cat)}
                                >
                                  <Trash2Icon className="size-3" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* 右列：画风小类 */}
                  <div className="lg:col-span-7">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/60 px-4 py-2 text-[11px] font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1.5">
                        <TagIcon className="size-3.5" />
                        {effectiveFocusedCategoryId === 'all'
                          ? `全部小类（${visibleSubcategories.length}）`
                          : `${styleCategoryMap.get(effectiveFocusedCategoryId)?.label || ''} · 小类（${visibleSubcategories.length}）`}
                      </span>
                      {effectiveFocusedCategoryId !== 'all' && (
                        <button
                          type="button"
                          onClick={() => openNewSubcategory(effectiveFocusedCategoryId)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-800 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-200"
                        >
                          <PlusIcon className="size-3" />
                          在此大类下新增小类
                        </button>
                      )}
                    </div>

                    {visibleSubcategories.length === 0 ? (
                      <div className="p-6 text-center text-xs text-zinc-500">
                        当前范围内暂无小类，可点击右上角或上方按钮新增小类。
                      </div>
                    ) : (
                      <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {visibleSubcategories.map((sub, sIdx) => {
                          const parentCatLabel =
                            styleCategoryMap.get(sub.categoryId)?.label || sub.categoryId
                          const styleCount = styleCatalog.filter(
                            (p) => p.subcategoryId === sub.id
                          ).length

                          return (
                            <div
                              key={sub.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                                    {parentCatLabel}
                                  </span>
                                  <span className="text-xs font-bold">{sub.label}</span>
                                  <span className="font-mono text-[10px] text-zinc-400">
                                    {sub.id}
                                  </span>
                                </div>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAdminStyleCategoryFilter(sub.categoryId)
                                    setAdminStyleSubcategoryFilter(sub.id)
                                  }}
                                  className="mr-1 border border-zinc-200 px-2 py-0.5 font-mono text-[10px] text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-200 dark:hover:text-zinc-100"
                                  title="在下方画风列表中仅看此小类"
                                >
                                  {styleCount} 画风
                                </button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-1.5 text-xs"
                                  disabled={savingTaxonomy || sIdx === 0}
                                  title="上移小类"
                                  onClick={() => void handleMoveSubcategory(sub.id, -1)}
                                >
                                  <ArrowUpIcon className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-1.5 text-xs"
                                  disabled={savingTaxonomy || sIdx === visibleSubcategories.length - 1}
                                  title="下移小类"
                                  onClick={() => void handleMoveSubcategory(sub.id, 1)}
                                >
                                  <ArrowDownIcon className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-2 text-xs"
                                  disabled={savingTaxonomy}
                                  title="编辑小类"
                                  onClick={() => openEditSubcategory(sub)}
                                >
                                  <PencilIcon className="size-3" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 rounded-none px-1.5 text-xs text-red-600 hover:bg-red-500/10"
                                  disabled={savingTaxonomy}
                                  title="删除小类"
                                  onClick={() => void handleDeleteSubcategory(sub)}
                                >
                                  <Trash2Icon className="size-3" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* 画风预设管理（支持按大类/小类筛选、新增、删除、排序及编辑分类/示意图/正负面提示词） */}
              <section className="border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <div>
                    <div className="text-xs font-bold">画风预设管理（共 {styleCatalog.length} 种）</div>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      每个画风预设引用上方定义的「大类 / 小类」；支持按分类与关键词筛选、编辑正负面提示词与示意图。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 rounded-none text-xs"
                      disabled={savingStyle || savingTaxonomy || styleSubcategories.length === 0}
                      onClick={openNewStyle}
                    >
                      <PlusIcon className="size-3.5" />
                      新增画风
                    </Button>
                  </div>
                </div>

                {/* 筛选工具栏 */}
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="relative min-w-[200px] flex-1">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
                    <Input
                      value={adminStyleQuery}
                      onChange={(e) => setAdminStyleQuery(e.target.value)}
                      placeholder="按画风标题、简介、提示词或分类搜索…"
                      className="h-8 rounded-none pl-8 text-xs"
                    />
                  </div>

                  <Select
                    value={effectiveAdminCatFilter}
                    onValueChange={(v) => {
                      setAdminStyleCategoryFilter(v)
                      setAdminStyleSubcategoryFilter('all')
                    }}
                  >
                    <SelectTrigger className="h-8 w-40 rounded-none text-xs">
                      <SelectValue placeholder="全部大类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部大类 ({styleCategories.length})</SelectItem>
                      {styleCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={effectiveAdminSubFilter}
                    onValueChange={setAdminStyleSubcategoryFilter}
                  >
                    <SelectTrigger className="h-8 w-44 rounded-none text-xs">
                      <SelectValue placeholder="全部小类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部小类 ({adminFilterSubcategories.length})</SelectItem>
                      {adminFilterSubcategories.map((sub) => {
                        const catLabel = styleCategoryMap.get(sub.categoryId)?.label
                        return (
                          <SelectItem key={sub.id} value={sub.id}>
                            {effectiveAdminCatFilter === 'all' && catLabel
                              ? `${sub.label}（${catLabel}）`
                              : sub.label}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  <span className="font-mono text-[11px] text-zinc-500">
                    {filteredStyleCatalog.length} / {styleCatalog.length}
                  </span>

                  {(effectiveAdminCatFilter !== 'all' ||
                    effectiveAdminSubFilter !== 'all' ||
                    normalizedAdminStyleQuery.length > 0) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-none px-2.5 text-xs"
                      onClick={() => {
                        setAdminStyleCategoryFilter('all')
                        setAdminStyleSubcategoryFilter('all')
                        setAdminStyleQuery('')
                      }}
                    >
                      清空筛选
                    </Button>
                  )}
                </div>

                {styleCatalog.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    当前暂无预设画风，用户前端仅保留「无预设（跟随参考图）」。请先在上方新建画风大类与小类，再点击右上角「新增画风」添加。
                  </div>
                ) : filteredStyleCatalog.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500">
                    当前筛选条件下暂无画风，请调整大类、小类或关键词筛选。
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {filteredStyleCatalog.map((item, fIdx) => {
                      const visual = getStyleVisualMeta(item.id, item)
                      const catLabel =
                        styleCategoryMap.get(item.categoryId)?.label || item.categoryId
                      const subLabel =
                        styleSubcategoryMap.get(item.subcategoryId)?.label || item.subcategoryId
                      const effectivePrompt = item.prompt.trim()

                      return (
                        <div
                          key={item.id}
                          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                        >
                          <div className="flex min-w-0 flex-1 items-start gap-3.5">
                            {visual.preview ? (
                              <img
                                src={visual.preview}
                                alt={item.label}
                                className="h-14 w-11 shrink-0 border border-zinc-200 object-cover object-top dark:border-zinc-800"
                              />
                            ) : (
                              <div className="flex h-14 w-11 shrink-0 items-center justify-center border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
                                <ImageIcon className="size-4" />
                              </div>
                            )}

                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold">{item.label}</span>
                                <span className="border border-zinc-900/20 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
                                  {catLabel} / {subLabel}
                                </span>
                                {item.shortLabel && item.shortLabel !== item.label && (
                                  <span className="border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                                    短标：{item.shortLabel}
                                  </span>
                                )}
                                {item.tagline?.trim() && (
                                  <span className="truncate text-[11px] text-zinc-500">
                                    · {item.tagline.trim()}
                                  </span>
                                )}
                              </div>

                              <div className="text-xs leading-relaxed [overflow-wrap:anywhere] text-zinc-700 dark:text-zinc-300">
                                <span className="mr-1 font-bold text-zinc-500">风格：</span>
                                {effectivePrompt || <span className="text-zinc-400">（未配置）</span>}
                              </div>

                              {item.negativePrompt?.trim() && (
                                <div className="text-[11px] leading-relaxed [overflow-wrap:anywhere] text-amber-800 dark:text-amber-300">
                                  <span className="mr-1 font-bold">专属负面词：</span>
                                  {item.negativePrompt}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-none px-2 text-xs"
                              disabled={savingStyle || fIdx === 0}
                              title="上移"
                              onClick={() => void handleMoveStyleById(item.id, -1)}
                            >
                              <ArrowUpIcon className="size-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-none px-2 text-xs"
                              disabled={savingStyle || fIdx === filteredStyleCatalog.length - 1}
                              title="下移"
                              onClick={() => void handleMoveStyleById(item.id, 1)}
                            >
                              <ArrowDownIcon className="size-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-none text-xs"
                              disabled={savingStyle}
                              onClick={() => openEditStyle(item)}
                            >
                              <PencilIcon className="size-3" />
                              编辑
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-none px-2 text-xs text-red-600 hover:bg-red-500/10"
                              disabled={savingStyle}
                              title="删除画风"
                              onClick={() => void handleDeleteStyle(item)}
                            >
                              <Trash2Icon className="size-3" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-4 border border-zinc-200 p-5 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs font-bold text-zinc-600 dark:text-zinc-400">
                    服务端指令实时预览
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">模拟所选画风：</span>
                    <Select value={effectivePreviewStyle} onValueChange={setPreviewStyleKey}>
                      <SelectTrigger className="h-8 w-64 rounded-none text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{NONE_STYLE_PRESET.label}</SelectItem>
                        {styleCatalog.map((item) => {
                          const catLabel = styleCategoryMap.get(item.categoryId)?.label
                          const subLabel = styleSubcategoryMap.get(item.subcategoryId)?.label
                          return (
                            <SelectItem key={item.id} value={item.id}>
                              {catLabel && subLabel
                                ? `[${catLabel} · ${subLabel}] ${item.label}`
                                : item.label}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <pre className="whitespace-pre-wrap border border-zinc-200 bg-zinc-50 p-3.5 font-mono text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
                  {samplePrompt}
                </pre>
              </section>
            </div>
          )}

          {/* 06. 生成记录审计 */}
          {tab === 'jobs' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <div>
                  <h1 className="text-xl font-bold tracking-tight">全站生图任务与全链路调度审计</h1>
                  <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    监控提示词、供应商/渠道调度队列、重试与降级链路及成图结果；点击「全链路」或任意行进入独立审计页。
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (appliedJobQuery === jobQuery) {
                        void loadTabData('jobs')
                      } else {
                        setAppliedJobQuery(jobQuery)
                      }
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <Input
                      value={jobQuery}
                      onChange={(e) => setJobQuery(e.target.value)}
                      placeholder="搜索用户 / 提示词 / 模型 / 渠道 / 报错…"
                      className="h-8 w-56 rounded-none font-mono text-xs sm:w-64"
                    />
                    <Button type="submit" size="sm" variant="outline" className="h-8 rounded-none">
                      <SearchIcon className="size-3.5" />
                      查询
                    </Button>
                  </form>
                  <Select value={jobStatusFilter} onValueChange={setJobStatusFilter}>
                    <SelectTrigger className="h-8 w-28 rounded-none font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部状态</SelectItem>
                      <SelectItem value="succeeded">成功</SelectItem>
                      <SelectItem value="processing">进行中</SelectItem>
                      <SelectItem value="failed">失败</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={jobProviderFilter} onValueChange={setJobProviderFilter}>
                    <SelectTrigger className="h-8 w-32 rounded-none font-mono text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部厂商</SelectItem>
                      {PROVIDER_ORDER.map((pid) => (
                        <SelectItem key={pid} value={pid}>
                          {PROVIDER_META[pid].shortName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-y divide-zinc-200 border border-zinc-200 sm:grid-cols-4 sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
                <div className="px-4 py-3">
                  <div className="text-xs text-zinc-500">当前匹配任务</div>
                  <div className="mt-1 font-mono text-lg font-bold">{jobs.length}</div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-xs text-zinc-500">成功</div>
                  <div className="mt-1 font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {jobs.filter((j) => j.status === 'succeeded').length}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-xs text-zinc-500">失败</div>
                  <div className="mt-1 font-mono text-lg font-bold text-red-500">
                    {jobs.filter((j) => j.status === 'failed').length}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-xs text-zinc-500">发生切换或重试</div>
                  <div className="mt-1 font-mono text-lg font-bold text-amber-600 dark:text-amber-400">
                    {jobs.filter((j) => (j.auditTrace?.attempts?.length ?? 0) > 1).length}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left font-mono text-xs">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    <tr>
                      <th className="px-3.5 py-2.5">用户 / 时间</th>
                      <th className="px-3.5 py-2.5">厂商 / 最终模型</th>
                      <th className="px-3.5 py-2.5">供应商 / 渠道</th>
                      <th className="px-3.5 py-2.5">提交提示词与配方</th>
                      <th className="px-3.5 py-2.5">调度链路</th>
                      <th className="px-3.5 py-2.5">积分</th>
                      <th className="px-3.5 py-2.5">状态 / 报错摘要</th>
                      <th className="px-3.5 py-2.5 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {jobs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center font-sans text-zinc-500">
                          暂无符合筛选条件的生图审计记录。
                        </td>
                      </tr>
                    ) : (
                      jobs.map((j) => {
                        const trace = j.auditTrace ?? null
                        const attempts = trace?.attempts ?? []
                        const attemptCount = attempts.length
                        const durationMs =
                          trace?.totalDurationMs ??
                          (j.finishedAt ? Math.max(0, j.finishedAt - j.createdAt) : null)
                        const uniqueChannels = new Set(attempts.map((a) => a.channelId)).size
                        const hasDowngrade = attempts.some((a) => a.triggerType === 'compat_downgrade')
                        const hasFailover =
                          attempts.some(
                            (a) =>
                              a.triggerType === 'failover_switch' ||
                              a.triggerType === 'fallback_retry'
                          ) || uniqueChannels > 1
                        const hasRetry = attempts.some(
                          (a) =>
                            a.triggerType === 'transient_retry' ||
                            a.triggerType === 'fallback_retry'
                        )
                        const submittedPrompt =
                          trace?.promptBreakdown?.finalPrompt || j.prompt || j.recipeSummary

                        return (
                          <tr
                            key={j.id}
                            onClick={() =>
                              void navigate({ to: '/admin/jobs/$jobId', params: { jobId: j.id } })
                            }
                            className="cursor-pointer transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50"
                          >
                            <td className="px-3.5 py-3 whitespace-nowrap">
                              <div className="font-bold">@{j.username || j.userId?.slice(0, 8)}</div>
                              <div className="mt-0.5 text-[11px] text-zinc-500">
                                {formatDateTime(j.createdAt)}
                              </div>
                            </td>
                            <td className="px-3.5 py-3">
                              <div className="font-bold uppercase">
                                {PROVIDER_META[j.provider]?.shortName || j.provider}
                              </div>
                              <div
                                className="mt-0.5 max-w-[150px] truncate text-[11px] text-zinc-500"
                                title={j.model}
                              >
                                {j.model}
                              </div>
                            </td>
                            <td className="px-3.5 py-3 font-sans">
                              <div className="max-w-[140px] truncate font-semibold">
                                {j.supplierName || '—'}
                              </div>
                              <div
                                className="mt-0.5 max-w-[140px] truncate text-[11px] text-zinc-500"
                                title={j.channelName || undefined}
                              >
                                {j.channelName || '—'}
                              </div>
                            </td>
                            <td className="max-w-[280px] px-3.5 py-3 font-sans">
                              <div
                                className="line-clamp-2 text-xs leading-snug text-zinc-800 dark:text-zinc-200"
                                title={submittedPrompt}
                              >
                                {submittedPrompt || '—'}
                              </div>
                              {j.recipeSummary && (
                                <div
                                  className="mt-1 truncate text-[11px] text-zinc-500"
                                  title={j.recipeSummary}
                                >
                                  {j.recipeSummary}
                                </div>
                              )}
                            </td>
                            <td className="px-3.5 py-3 whitespace-nowrap">
                              {!trace ? (
                                <div className="space-y-1">
                                  <span className="inline-block border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:border-zinc-700">
                                    历史记录
                                  </span>
                                  <div className="text-[11px] text-zinc-500">
                                    {formatShortDuration(durationMs)}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {attemptCount === 0 ? (
                                      <span className="border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                                        {j.status === 'processing' ? '调度中' : '0次调用'}
                                      </span>
                                    ) : attemptCount === 1 ? (
                                      <span
                                        className={`border px-1.5 py-0.5 text-[10px] font-bold ${
                                          j.status === 'succeeded'
                                            ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                            : j.status === 'failed'
                                              ? 'border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-400'
                                              : 'border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                                        }`}
                                      >
                                        {j.status === 'succeeded'
                                          ? '1次直出'
                                          : j.status === 'failed'
                                            ? '1次失败'
                                            : '1次调度'}
                                      </span>
                                    ) : (
                                      <>
                                        {hasFailover ? (
                                          <span className="border border-amber-600/45 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                            切换{uniqueChannels}渠道
                                          </span>
                                        ) : hasRetry ? (
                                          <span className="border border-sky-600/45 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:text-sky-300">
                                            重试{attemptCount}次
                                          </span>
                                        ) : null}
                                        {hasDowngrade && (
                                          <span className="border border-purple-600/45 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300">
                                            降级重试
                                          </span>
                                        )}
                                        {!hasFailover && !hasRetry && !hasDowngrade && (
                                          <span className="border border-zinc-400/50 px-1.5 py-0.5 text-[10px] font-bold">
                                            {attemptCount}次调用
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-zinc-500">
                                    {attemptCount}次 · {formatShortDuration(durationMs)}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-3.5 py-3 whitespace-nowrap">
                              <div>-{j.creditsCost}</div>
                              {j.creditsRefunded > 0 && (
                                <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                                  +{j.creditsRefunded} 退
                                </div>
                              )}
                            </td>
                            <td className="max-w-[200px] px-3.5 py-3">
                              <span
                                className={
                                  j.status === 'succeeded'
                                    ? 'font-bold text-emerald-600 dark:text-emerald-400'
                                    : j.status === 'failed'
                                      ? 'font-bold text-red-500'
                                      : 'font-bold text-amber-600'
                                }
                              >
                                {AUDIT_STATUS_META[j.status]?.label ?? j.status}
                              </span>
                              {j.errorMessage && (
                                <div
                                  className="mt-0.5 truncate font-sans text-[11px] text-zinc-500"
                                  title={j.errorMessage}
                                >
                                  {j.errorMessage}
                                </div>
                              )}
                            </td>
                            <td className="px-3.5 py-3 text-right whitespace-nowrap">
                              <Link
                                to="/admin/jobs/$jobId"
                                params={{ jobId: j.id }}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 border border-zinc-950 bg-zinc-950 px-2.5 py-1 text-[11px] font-bold text-white transition-opacity hover:opacity-85 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-950"
                              >
                                <ActivityIcon className="size-3" />
                                全链路
                              </Link>
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

      {/* 新建/编辑供应商弹窗 */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-lg rounded-none border-zinc-950 dark:border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {supplierForm.id ? '编辑供应商凭证' : '新建供应商凭证'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 text-xs">
            <div className="space-y-1.5">
              <label className="block font-bold">供应商名称</label>
              <Input
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="例如：我的聚合中转站 A"
                className="rounded-none text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold">接口基础地址 (HTTPS)</label>
              <Input
                type="url"
                value={supplierForm.baseUrl}
                onChange={(e) => setSupplierForm((p) => ({ ...p, baseUrl: e.target.value }))}
                placeholder="https://api.example.com"
                className="rounded-none font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block font-bold">
                访问密钥{' '}
                {supplierForm.hasExistingKey && (
                  <span className="font-normal text-zinc-500">（当前：{supplierForm.apiKeyHint}）</span>
                )}
              </label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    type={showSupplierKey ? 'text' : 'password'}
                    value={supplierForm.apiKey}
                    onChange={(e) => setSupplierForm((p) => ({ ...p, apiKey: e.target.value }))}
                    placeholder={supplierForm.hasExistingKey ? '留空表示保持原有密钥不变' : '输入访问密钥'}
                    className="rounded-none pr-9 font-mono text-xs"
                  />
                  <button
                    type="button"
                    aria-label={showSupplierKey ? '隐藏密钥' : '显示密钥'}
                    onClick={() => setShowSupplierKey((v) => !v)}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-500"
                  >
                    {showSupplierKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                </div>
                {supplierForm.id && supplierForm.hasExistingKey && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={savingSupplier}
                    onClick={() => void handleClearSupplierKey()}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block font-bold">启用状态</label>
                <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                  <span className="font-sans text-zinc-500">
                    {supplierForm.enabled ? '正常启用' : '全局停用'}
                  </span>
                  <Switch
                    checked={supplierForm.enabled}
                    onCheckedChange={(v) => setSupplierForm((p) => ({ ...p, enabled: v }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block font-bold">备注（可选）</label>
                <Input
                  value={supplierForm.note}
                  onChange={(e) => setSupplierForm((p) => ({ ...p, note: e.target.value }))}
                  placeholder="用途或到期日备注"
                  className="rounded-none font-sans text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setSupplierDialogOpen(false)}>
                取消
              </Button>
              <Button size="sm" disabled={savingSupplier} onClick={() => void handleSaveSupplier()}>
                {savingSupplier ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
                保存供应商
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新建/编辑渠道弹窗 */}
      <Dialog open={channelDialogOpen} onOpenChange={setChannelDialogOpen}>
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-2xl overflow-y-auto rounded-none border-zinc-950 dark:border-zinc-200 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {channelForm?.id ? '编辑模型渠道' : '添加模型渠道'}
            </DialogTitle>
          </DialogHeader>
          {channelForm && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block font-bold">引用供应商（复用接口地址与密钥）</label>
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
                    <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          {s.name} ({s.baseUrl}) {s.hasApiKey ? '' : '[未配Key]'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold">渠道名称（默认取供应商名称）</label>
                  <Input
                    value={channelForm.name}
                    onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                    placeholder="留空默认取供应商名称"
                    className="rounded-none font-sans text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold">优先级（数字越大越先调度）</label>
                  <Input
                    type="number"
                    value={channelForm.priority}
                    onChange={(e) =>
                      setChannelForm({ ...channelForm, priority: Math.trunc(Number(e.target.value) || 0) })
                    }
                    className="rounded-none font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold">渠道开关</label>
                  <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                    <span className="font-sans text-zinc-500">
                      {channelForm.enabled ? '参与路由调度' : '已禁用'}
                    </span>
                    <Switch
                      checked={channelForm.enabled}
                      onCheckedChange={(v) => setChannelForm({ ...channelForm, enabled: v })}
                    />
                  </div>
                </div>

                <div className={`space-y-1.5 ${channelForm.model === 'custom' ? '' : 'sm:col-span-2'}`}>
                  <label className="block font-bold">模型 ID</label>
                  <Select
                    value={channelForm.model}
                    onValueChange={(v) => setChannelForm({ ...channelForm, model: v })}
                  >
                    <SelectTrigger className="w-full rounded-none font-mono text-xs"><SelectValue /></SelectTrigger>
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
                </div>

                {channelForm.model === 'custom' && (
                  <div className="space-y-1.5">
                    <label className="block font-bold">自定义模型 ID</label>
                    <Input
                      value={channelForm.customModel}
                      onChange={(e) => setChannelForm({ ...channelForm, customModel: e.target.value })}
                      placeholder="输入完整模型 ID"
                      className="rounded-none font-mono text-xs"
                    />
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <div className="mb-3 font-bold text-zinc-500">渠道专属协议参数（支持官方与中转站混配）</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {channelForm.providerId === 'gemini' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block font-bold">协议模式</label>
                        <Select
                          value={(channelForm.params as GeminiParams).endpointMode}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, endpointMode: v } as GeminiParams,
                            })
                          }
                        >
                          <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="native">原生协议 (:generateContent)</SelectItem>
                            <SelectItem value="openai_chat">OpenAI 对话接口 (/v1/chat/completions)</SelectItem>
                            <SelectItem value="openai_edits_json">OpenAI 图像接口 (/v1/images/edits JSON)</SelectItem>
                            <SelectItem value="openai_edits">OpenAI 图像接口 (/v1/images/edits 表单)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-bold">原生协议鉴权方式</label>
                        <Select
                          value={(channelForm.params as GeminiParams).authMode || 'auto'}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, authMode: v } as GeminiParams,
                            })
                          }
                        >
                          <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">自动兼容（官方/Vertex 走密钥，中转站走令牌）</SelectItem>
                            <SelectItem value="bearer">仅 Authorization: Bearer</SelectItem>
                            <SelectItem value="goog_key">仅 x-goog-api-key + ?key=</SelectItem>
                            <SelectItem value="both">同时发送 Bearer + goog-key + ?key=</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-bold">默认分辨率</label>
                        <Select
                          value={(channelForm.params as GeminiParams).imageSize}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, imageSize: v } as GeminiParams,
                            })
                          }
                        >
                          <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1K">1K</SelectItem>
                            <SelectItem value="2K">2K</SelectItem>
                            <SelectItem value="4K">4K</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {channelForm.providerId === 'gpt' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block font-bold">调用端点</label>
                        <Select
                          value={(channelForm.params as GptParams).endpointMode}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, endpointMode: v } as GptParams,
                            })
                          }
                        >
                          <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="images_edits_json">/v1/images/edits (JSON)</SelectItem>
                            <SelectItem value="images_edits">/v1/images/edits (Multipart 中转常用)</SelectItem>
                            <SelectItem value="responses">/v1/responses</SelectItem>
                            <SelectItem value="chat">/v1/chat/completions</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-bold">渲染质量 (quality)</label>
                        <Select
                          value={(channelForm.params as GptParams).quality}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, quality: v } as GptParams,
                            })
                          }
                        >
                          <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">high</SelectItem>
                            <SelectItem value="xhigh">xhigh</SelectItem>
                            <SelectItem value="max">max</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="auto">auto</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-bold">规划复杂度 (2.6 专属)</label>
                        <Select
                          value={(channelForm.params as GptParams).complexity || 'auto'}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, complexity: v } as GptParams,
                            })
                          }
                        >
                          <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">auto（默认）</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="low">low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}

                  {channelForm.providerId === 'grok' && (
                    <>
                      <div className="space-y-1.5">
                        <label className="block font-bold">调用端点</label>
                        <Select
                          value={(channelForm.params as GrokParams).endpointMode}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, endpointMode: v } as GrokParams,
                            })
                          }
                        >
                          <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="xai_edits">xAI Edits JSON (/v1/images/edits)</SelectItem>
                            <SelectItem value="openai_edits_json">OpenAI Edits JSON</SelectItem>
                            <SelectItem value="openai_edits">OpenAI Edits Multipart</SelectItem>
                            <SelectItem value="openai_chat">OpenAI Chat (/v1/chat/completions)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-bold">输出分辨率</label>
                        <Select
                          value={(channelForm.params as GrokParams).resolution}
                          onValueChange={(v) =>
                            setChannelForm({
                              ...channelForm,
                              params: { ...channelForm.params, resolution: v } as GrokParams,
                            })
                          }
                        >
                          <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2k">2k</SelectItem>
                            <SelectItem value="1k">1k</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-bold">质量 / 返回格式</label>
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
                            <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
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
                            <SelectTrigger className="w-full rounded-none text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="b64_json">b64_json</SelectItem>
                              <SelectItem value="url">url</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setChannelDialogOpen(false)}>
                  取消
                </Button>
                <Button size="sm" disabled={savingChannel} onClick={() => void handleSaveChannel()}>
                  {savingChannel ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <CheckIcon className="size-3.5" />}
                  保存渠道
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 手动调积分弹窗 */}
      <Dialog open={Boolean(adjustTarget)} onOpenChange={(o) => !o && setAdjustTarget(null)}>
        <DialogContent className="max-w-sm rounded-none border-zinc-950 dark:border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              调整用户积分 · @{adjustTarget?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 text-xs">
            <div>当前余额：{adjustTarget?.creditBalance ?? 0} 积分</div>
            <div className="space-y-1.5">
              <label className="block font-bold">变动值（正数为充值，负数为扣减）</label>
              <Input
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                className="rounded-none font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block font-bold">备注说明</label>
              <Input
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="例如：微信充值 100 积分 / 活动补偿"
                className="rounded-none text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setAdjustTarget(null)}>
                取消
              </Button>
              <Button size="sm" disabled={adjusting} onClick={() => void handleAdjustCredits()}>
                {adjusting ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : null}
                确认调整
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新建/编辑画风弹窗 */}
      <Dialog open={styleDialogOpen} onOpenChange={setStyleDialogOpen}>
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-2xl overflow-y-auto rounded-none border-zinc-950 sm:max-w-2xl dark:border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {styleForm?.isNew ? '新增画风预设' : '编辑画风预设'}
            </DialogTitle>
          </DialogHeader>
          {styleForm && (
            <div className="space-y-4 pt-2 text-xs">
              <input
                ref={styleFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleUploadStylePreview(e)}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block font-bold">所属大类</label>
                  <Select
                    value={styleForm.categoryId}
                    onValueChange={(catId) => {
                      const firstSub = styleSubcategories.find((s) => s.categoryId === catId)
                      setStyleForm({
                        ...styleForm,
                        categoryId: catId,
                        subcategoryId: firstSub?.id || '',
                      })
                    }}
                  >
                    <SelectTrigger className="w-full rounded-none text-xs">
                      <SelectValue placeholder="选择大类" />
                    </SelectTrigger>
                    <SelectContent>
                      {styleCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold">所属小类</label>
                  <Select
                    value={styleForm.subcategoryId}
                    onValueChange={(subId) => {
                      const sub = styleSubcategoryMap.get(subId)
                      setStyleForm({
                        ...styleForm,
                        categoryId: sub?.categoryId || styleForm.categoryId,
                        subcategoryId: subId,
                      })
                    }}
                  >
                    <SelectTrigger className="w-full rounded-none text-xs">
                      <SelectValue placeholder="选择小类" />
                    </SelectTrigger>
                    <SelectContent>
                      {styleSubcategories
                        .filter((s) => s.categoryId === styleForm.categoryId)
                        .map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {styleSubcategories.filter((s) => s.categoryId === styleForm.categoryId)
                    .length === 0 && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      当前大类下暂无小类，请先新建小类或切换其他大类。
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold">画风标题</label>
                  <Input
                    value={styleForm.label}
                    onChange={(e) => setStyleForm({ ...styleForm, label: e.target.value })}
                    placeholder="例如：赛博朋克霓虹插画"
                    className="rounded-none text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold">卡片短标（可选）</label>
                  <Input
                    value={styleForm.shortLabel}
                    onChange={(e) => setStyleForm({ ...styleForm, shortLabel: e.target.value })}
                    placeholder="4字以内，留空默认使用画风标题"
                    className="rounded-none text-xs"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block font-bold">一句话简介（可选）</label>
                  <Input
                    value={styleForm.tagline}
                    onChange={(e) => setStyleForm({ ...styleForm, tagline: e.target.value })}
                    placeholder="例如：高对比霓虹光影 · 未来都市质感"
                    className="rounded-none text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2 border border-zinc-200 p-3.5 dark:border-zinc-800">
                <label className="block font-bold">画风示意图</label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {(() => {
                    const effectivePreview = styleForm.previewUrl.trim() || undefined
                    return effectivePreview ? (
                      <img
                        src={effectivePreview}
                        alt={styleForm.label || '示意图预览'}
                        className="h-24 w-18 shrink-0 border border-zinc-200 object-cover object-top dark:border-zinc-800"
                      />
                    ) : (
                      <div className="flex h-24 w-18 shrink-0 items-center justify-center border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
                        <ImageIcon className="size-5" />
                      </div>
                    )
                  })()}

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-none text-xs"
                        disabled={uploadingStyleImg}
                        onClick={() => styleFileInputRef.current?.click()}
                      >
                        {uploadingStyleImg ? (
                          <LoaderCircleIcon className="size-3.5 animate-spin" />
                        ) : (
                          <UploadIcon className="size-3.5" />
                        )}
                        上传本地示意图
                      </Button>
                      {styleForm.previewUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-none text-xs text-red-600 hover:bg-red-500/10"
                          onClick={() => setStyleForm({ ...styleForm, previewUrl: '' })}
                        >
                          清除自定义图片
                        </Button>
                      )}
                    </div>
                    <Input
                      value={styleForm.previewUrl}
                      onChange={(e) => setStyleForm({ ...styleForm, previewUrl: e.target.value })}
                      placeholder="支持上传图片或粘贴 https:// 图片链接"
                      className="rounded-none font-mono text-xs"
                    />
                    <p className="text-[11px] text-zinc-500">
                      上传后将持久化至云端存储，并在用户端「合成台」与「使用指南」画风轮盘实时展示。
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold">风格提示词</label>
                <Textarea
                  rows={3}
                  value={styleForm.prompt}
                  onChange={(e) => setStyleForm({ ...styleForm, prompt: e.target.value })}
                  placeholder="输入该画风的核心风格描述（将写入「• 风格：」之后）"
                  className="rounded-none font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold">画风专属负面提示词（可选）</label>
                <Textarea
                  rows={2}
                  value={styleForm.negativePrompt}
                  onChange={(e) =>
                    setStyleForm({ ...styleForm, negativePrompt: e.target.value })
                  }
                  placeholder="例如：写实皮肤毛孔，摄影噪点（生成时将与「全局负面提示词」自动合并放入「避免：」之后）"
                  className="rounded-none font-mono text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setStyleDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="rounded-none"
                  disabled={savingStyle || uploadingStyleImg}
                  onClick={() => void handleSaveStyle()}
                >
                  {savingStyle ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  保存画风
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 新建/编辑画风大类弹窗 */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="w-[94vw] max-w-md rounded-none border-zinc-950 dark:border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {categoryForm?.isNew ? '新增画风大类' : '编辑画风大类'}
            </DialogTitle>
          </DialogHeader>
          {categoryForm && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="space-y-1.5">
                <label className="block font-bold">大类标识 ID</label>
                <Input
                  value={categoryForm.id}
                  disabled
                  className="rounded-none bg-zinc-50 font-mono text-xs dark:bg-zinc-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold">大类名称</label>
                <Input
                  value={categoryForm.label}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, label: e.target.value })
                  }
                  placeholder="例如：动画、写实摄影、插画漫画"
                  className="rounded-none text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !savingTaxonomy) {
                      e.preventDefault()
                      void handleSaveCategory()
                    }
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setCategoryDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-none"
                  disabled={savingTaxonomy}
                  onClick={() => void handleSaveCategory()}
                >
                  {savingTaxonomy ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  保存大类
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 新建/编辑画风小类弹窗 */}
      <Dialog open={subcategoryDialogOpen} onOpenChange={setSubcategoryDialogOpen}>
        <DialogContent className="w-[94vw] max-w-md rounded-none border-zinc-950 dark:border-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {subcategoryForm?.isNew ? '新增画风小类' : '编辑画风小类'}
            </DialogTitle>
          </DialogHeader>
          {subcategoryForm && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="space-y-1.5">
                <label className="block font-bold">小类标识 ID</label>
                <Input
                  value={subcategoryForm.id}
                  disabled
                  className="rounded-none bg-zinc-50 font-mono text-xs dark:bg-zinc-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold">所属大类</label>
                <Select
                  value={subcategoryForm.categoryId}
                  onValueChange={(v) =>
                    setSubcategoryForm({ ...subcategoryForm, categoryId: v })
                  }
                >
                  <SelectTrigger className="w-full rounded-none text-xs">
                    <SelectValue placeholder="选择所属大类" />
                  </SelectTrigger>
                  <SelectContent>
                    {styleCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!subcategoryForm.isNew && (
                  <p className="text-[11px] text-zinc-500">
                    若更改所属大类，引用该小类的画风预设也会自动跟随归属到新的大类。
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold">小类名称</label>
                <Input
                  value={subcategoryForm.label}
                  onChange={(e) =>
                    setSubcategoryForm({ ...subcategoryForm, label: e.target.value })
                  }
                  placeholder="例如：日系2D动画、欧美2D动画、定格动画"
                  className="rounded-none text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !savingTaxonomy) {
                      e.preventDefault()
                      void handleSaveSubcategory()
                    }
                  }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-none"
                  onClick={() => setSubcategoryDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-none"
                  disabled={savingTaxonomy}
                  onClick={() => void handleSaveSubcategory()}
                >
                  {savingTaxonomy ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  保存小类
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  )
}
