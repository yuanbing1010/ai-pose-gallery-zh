import { useCallback, useEffect, useMemo, useState, type ClipboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  FileTextIcon,
  FlaskConicalIcon,
  LoaderCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  TagIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { posesQuery } from '@/api/gallery'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { fetchAdminSettingsApi, updateAdminSettingsApi } from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type {
  CloudTermReplacement,
  PlatformConfig,
  PoseGroup,
  PoseSanitizeConfig,
  PoseSanitizeInspectResult,
} from '@/types/gallery'
import {
  buildRecipePrompt,
  createDefaultPoseSanitizeConfig,
  inspectPoseSanitizeForCloud,
  mergePoseSanitizeConfig,
} from '../../../../shared/studio'
import {
  AdminBadge,
  AdminField,
  AdminFilterBar,
  AdminMetricGrid,
  AdminPageHeader,
  AdminPanel,
} from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_SELECT_CLS,
  ADMIN_TEXT_INPUT_CLS,
  type AdminConfirmAction,
} from '../auditHelpers'

type SanitizeSubView = 'rules' | 'audit'
type TermLangFilter = 'all' | 'zh' | 'en'
type AuditStatusFilter = 'all' | 'modified' | 'silenced' | 'unchanged'

const AUDIT_PAGE_SIZE = 60

const SANDBOX_PRESETS: Array<{ label: string; name: string; system: string; category: string }> = [
  {
    label: '手扶墙顶胯（站立后入待位）',
    name: '手扶墙顶胯（站立后入待位）',
    system: '全身单人・性感系',
    category: '站姿',
  },
  {
    label: 'S形站姿・胯部侧顶',
    name: 'S形站姿・胯部侧顶',
    system: '全身单人・性感系',
    category: '站姿',
  },
  {
    label: '猫式（胸贴地翘臀・侧面）',
    name: '猫式（胸贴地翘臀・侧面）',
    system: '全身单人・性感系',
    category: '跪立・四肢着地',
  },
  {
    label: '双臂内夹合手（前倾挤胸）',
    name: '双臂内夹合手（前倾挤胸）',
    system: '上半身单人',
    category: '挤胸・强调事业线系',
  },
  {
    label: '双人缠绵体位示例',
    name: '侧身・单腿搭肩',
    system: '双人缠绵',
    category: '侧卧位',
  },
]

interface AdminSanitizeTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onRefreshBootstrap: () => Promise<void>
}

function isAsciiTerm(term: string): boolean {
  return /^[\x20-\x7e]+$/.test(term)
}

function parseTermBatchInput(raw: string): string[] {
  return raw
    .split(/[,，、;\n\r]+/)
    .map((s) => s.trim().slice(0, 80))
    .filter(Boolean)
}

function extractCandidateSegments(title: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of title.split(/[・·＋（()）]/)) {
    const clean = part.trim()
    if (!clean) continue
    const key = clean.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clean)
  }
  return out
}

function renderActionBadge(result: PoseSanitizeInspectResult) {
  switch (result.action) {
    case 'modified':
      return <AdminBadge tone="info">已脱敏精简</AdminBadge>
    case 'silenced':
      return <AdminBadge tone="warning">整条静默</AdminBadge>
    case 'disabled':
      return <AdminBadge tone="danger">未启用屏蔽</AdminBadge>
    default:
      return <AdminBadge tone="success">安全保留</AdminBadge>
  }
}

export function AdminSanitizeTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
  onRefreshBootstrap,
}: AdminSanitizeTabProps) {
  const [subView, setSubView] = useState<SanitizeSubView>('rules')
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig | null>(null)
  const [cfg, setCfg] = useState<PoseSanitizeConfig | null>(null)
  const [savedJson, setSavedJson] = useState('')
  const [saving, setSaving] = useState(false)

  // Term editor state
  const [termInput, setTermInput] = useState('')
  const [termSearch, setTermSearch] = useState('')
  const [termLangFilter, setTermLangFilter] = useState<TermLangFilter>('all')
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkText, setBulkText] = useState('')

  // System / category keyword inputs
  const [systemInput, setSystemInput] = useState('')
  const [categoryKeywordInput, setCategoryKeywordInput] = useState('')

  // Replacement inputs
  const [newRepFrom, setNewRepFrom] = useState('')
  const [newRepTo, setNewRepTo] = useState('')

  // Sandbox tester state
  const [testName, setTestName] = useState('手扶墙顶胯（站立后入待位）')
  const [testSystem, setTestSystem] = useState('全身单人・性感系')
  const [testCategory, setTestCategory] = useState('站姿')

  // Pose library audit state
  const [auditStatus, setAuditStatus] = useState<AuditStatusFilter>('all')
  const [auditSystem, setAuditSystem] = useState<string>('all')
  const [auditQuery, setAuditQuery] = useState('')
  const [auditPage, setAuditPage] = useState(1)
  const [selectedPoseKey, setSelectedPoseKey] = useState<string | null>(null)
  const [auditQuickTerm, setAuditQuickTerm] = useState('')

  const posesState = useQuery(posesQuery)

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const res = await fetchAdminSettingsApi()
      const normalized = mergePoseSanitizeConfig(res.platform.poseSanitize)
      setPlatformCfg(res.platform)
      setCfg(normalized)
      setSavedJson(JSON.stringify(normalized))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载敏感词配置失败')
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

  const dirty = Boolean(cfg && savedJson && JSON.stringify(cfg) !== savedJson)

  const updateCfg = useCallback((updater: (prev: PoseSanitizeConfig) => PoseSanitizeConfig) => {
    setCfg((prev) => (prev ? updater(prev) : prev))
  }, [])

  const handleSave = async () => {
    if (!cfg) return
    const normalized = mergePoseSanitizeConfig(cfg)
    setSaving(true)
    try {
      const res = await updateAdminSettingsApi({ poseSanitize: normalized })
      const saved = mergePoseSanitizeConfig(res.platform.poseSanitize)
      setPlatformCfg(res.platform)
      setCfg(saved)
      setSavedJson(JSON.stringify(saved))
      await onRefreshBootstrap()
      toast.success('姿势敏感词屏蔽配置已保存并生效')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDiscard = () => {
    if (!savedJson) return
    try {
      const parsed = JSON.parse(savedJson) as PoseSanitizeConfig
      setCfg(mergePoseSanitizeConfig(parsed))
      setBulkMode(false)
      toast.info('已还原为上次保存的配置')
    } catch {
      // ignore invalid local json
    }
  }

  const handleResetDefaults = () => {
    onConfirm({
      title: '恢复出厂默认敏感词库',
      description:
        '将敏感词列表、安全词替换映射和整类静默规则恢复为系统默认值。恢复后请检查效果并点击「保存配置」正式生效。',
      confirmLabel: '恢复默认',
      run: async () => {
        const defaults = createDefaultPoseSanitizeConfig()
        setCfg(defaults)
        if (bulkMode) setBulkText(defaults.blockedTerms.join('\n'))
        toast.info('已恢复默认规则（点击右上角「保存配置」后正式生效）')
      },
    })
  }

  const addBlockedTermsBatch = useCallback(
    (candidates: string[]): number => {
      if (!cfg) return 0
      const existing = new Set(cfg.blockedTerms.map((t) => t.toLowerCase()))
      const added: string[] = []
      for (const raw of candidates) {
        const clean = raw.trim().slice(0, 80)
        if (!clean) continue
        const key = clean.toLowerCase()
        if (existing.has(key)) continue
        existing.add(key)
        added.push(clean)
      }
      if (added.length === 0) return 0
      updateCfg((prev) => ({
        ...prev,
        blockedTerms: [...added, ...prev.blockedTerms].slice(0, 1000),
      }))
      return added.length
    },
    [cfg, updateCfg]
  )

  const handleAddTermSubmit = () => {
    const parsed = parseTermBatchInput(termInput)
    if (parsed.length === 0) {
      toast.error('请输入要屏蔽的敏感词')
      return
    }
    const addedCount = addBlockedTermsBatch(parsed)
    if (addedCount === 0) {
      toast.info('输入的词条均已存在于屏蔽词库中')
      return
    }
    setTermInput('')
    toast.success(`已添加 ${addedCount} 个敏感词（别忘了保存配置）`)
  }

  const handleAddAuditQuickTerm = () => {
    const parsed = parseTermBatchInput(auditQuickTerm)
    if (!parsed.length) return
    const added = addBlockedTermsBatch(parsed)
    if (added > 0) {
      setAuditQuickTerm('')
      toast.success(`已添加 ${added} 个屏蔽词（点击右上角「保存配置」生效）`)
    } else {
      toast.info('输入词条已在屏蔽词库中')
    }
  }

  const handleTermInputPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text')
    if (!/[\n\r,，、;]/.test(pasted)) return
    const parsed = parseTermBatchInput(pasted)
    if (parsed.length <= 1) return
    e.preventDefault()
    const addedCount = addBlockedTermsBatch(parsed)
    if (addedCount > 0) {
      toast.success(`已从剪贴板批量导入 ${addedCount} 个敏感词`)
    } else {
      toast.info('剪贴板中的词条均已存在')
    }
  }

  const handleRemoveTerm = (termToRemove: string) => {
    const targetLower = termToRemove.toLowerCase()
    updateCfg((prev) => ({
      ...prev,
      blockedTerms: prev.blockedTerms.filter((t) => t.toLowerCase() !== targetLower),
    }))
  }

  const handleToggleTerm = (term: string) => {
    if (!cfg) return
    const exists = cfg.blockedTerms.some((t) => t.toLowerCase() === term.toLowerCase())
    if (exists) {
      handleRemoveTerm(term)
      toast.info(`已从屏蔽词库移除「${term}」`)
    } else {
      addBlockedTermsBatch([term])
      toast.success(`已添加「${term}」到屏蔽词库`)
    }
  }

  const handleEnterBulkMode = () => {
    if (!cfg) return
    setBulkText(cfg.blockedTerms.join('\n'))
    setBulkMode(true)
  }

  const handleApplyBulkText = () => {
    const parsed = parseTermBatchInput(bulkText)
    const seen = new Set<string>()
    const deduped: string[] = []
    for (const item of parsed) {
      const key = item.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(item)
      if (deduped.length >= 1000) break
    }
    updateCfg((prev) => ({ ...prev, blockedTerms: deduped }))
    setBulkMode(false)
    toast.success(`已更新词库，共 ${deduped.length} 个词条`)
  }

  const handleCopyTerms = async () => {
    if (!cfg) return
    try {
      await navigator.clipboard.writeText(cfg.blockedTerms.join('\n'))
      toast.success(`已复制 ${cfg.blockedTerms.length} 个敏感词到剪贴板`)
    } catch {
      toast.error('无法访问剪贴板，请使用「批量文本模式」手动复制')
    }
  }

  const handleAddSystem = (val?: string) => {
    if (!cfg) return
    const clean = (val ?? systemInput).trim().slice(0, 80)
    if (!clean) return
    if (cfg.blockedPoseSystems.some((s) => s.toLowerCase() === clean.toLowerCase())) {
      toast.info('该体系已在静默列表中')
      return
    }
    updateCfg((prev) => ({
      ...prev,
      blockedPoseSystems: [...prev.blockedPoseSystems, clean].slice(0, 100),
    }))
    if (!val) setSystemInput('')
  }

  const handleToggleSystem = (sys: string) => {
    if (!cfg) return
    const exists = cfg.blockedPoseSystems.some((s) => s.toLowerCase() === sys.toLowerCase())
    if (exists) {
      updateCfg((prev) => ({
        ...prev,
        blockedPoseSystems: prev.blockedPoseSystems.filter(
          (s) => s.toLowerCase() !== sys.toLowerCase()
        ),
      }))
    } else {
      handleAddSystem(sys)
    }
  }

  const handleAddCategoryKeyword = () => {
    if (!cfg) return
    const clean = categoryKeywordInput.trim().slice(0, 80)
    if (!clean) return
    if (cfg.blockedPoseCategoryKeywords.some((k) => k.toLowerCase() === clean.toLowerCase())) {
      toast.info('该分类关键词已存在')
      return
    }
    updateCfg((prev) => ({
      ...prev,
      blockedPoseCategoryKeywords: [...prev.blockedPoseCategoryKeywords, clean].slice(0, 100),
    }))
    setCategoryKeywordInput('')
  }

  const handleUpdateReplacement = (
    index: number,
    patch: Partial<CloudTermReplacement>
  ) => {
    updateCfg((prev) => ({
      ...prev,
      replacements: prev.replacements.map((item, idx) =>
        idx === index ? { ...item, ...patch } : item
      ),
    }))
  }

  const handleAddReplacement = () => {
    if (!cfg) return
    const from = newRepFrom.trim().slice(0, 80)
    const to = newRepTo.trim().slice(0, 80)
    if (!from) {
      toast.error('请填写需要替换的原短语')
      return
    }
    if (cfg.replacements.some((r) => r.from.toLowerCase() === from.toLowerCase())) {
      toast.info(`已存在「${from}」的替换规则`)
      return
    }
    updateCfg((prev) => ({
      ...prev,
      replacements: [...prev.replacements, { from, to }].slice(0, 200),
    }))
    setNewRepFrom('')
    setNewRepTo('')
  }

  const handleRemoveReplacement = (index: number) => {
    updateCfg((prev) => ({
      ...prev,
      replacements: prev.replacements.filter((_, idx) => idx !== index),
    }))
  }

  const termCounts = useMemo(() => {
    if (!cfg) return { total: 0, zh: 0, en: 0 }
    let en = 0
    for (const t of cfg.blockedTerms) {
      if (isAsciiTerm(t)) en++
    }
    return { total: cfg.blockedTerms.length, zh: cfg.blockedTerms.length - en, en }
  }, [cfg])

  const filteredTerms = useMemo(() => {
    if (!cfg) return []
    const q = termSearch.trim().toLowerCase()
    return cfg.blockedTerms.filter((t) => {
      if (termLangFilter === 'en' && !isAsciiTerm(t)) return false
      if (termLangFilter === 'zh' && isAsciiTerm(t)) return false
      if (q && !t.toLowerCase().includes(q)) return false
      return true
    })
  }, [cfg, termLangFilter, termSearch])

  const auditRows = useMemo<
    Array<{ group: PoseGroup; result: PoseSanitizeInspectResult }>
  >(() => {
    if (!cfg || !posesState.data) return []
    return posesState.data.groups.map((group) => ({
      group,
      result: inspectPoseSanitizeForCloud(
        {
          体系: group.system,
          分类: group.category,
          姿势名称: group.name,
        },
        cfg
      ),
    }))
  }, [cfg, posesState.data])

  const auditStats = useMemo(() => {
    let modified = 0
    let silenced = 0
    let unchanged = 0
    let disabled = 0
    for (const row of auditRows) {
      if (row.result.action === 'modified') modified++
      else if (row.result.action === 'silenced') silenced++
      else if (row.result.action === 'disabled') disabled++
      else unchanged++
    }
    return {
      total: auditRows.length,
      modified,
      silenced,
      unchanged,
      disabled,
      affected: modified + silenced,
    }
  }, [auditRows])

  const filteredAuditRows = useMemo(() => {
    const q = auditQuery.trim().toLowerCase()
    return auditRows.filter(({ group, result }) => {
      if (auditStatus !== 'all' && result.action !== auditStatus) return false
      if (auditSystem !== 'all' && group.system !== auditSystem) return false
      if (!q) return true
      return [
        group.number,
        group.system,
        group.category,
        group.name,
        result.sanitized,
        result.reason,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [auditQuery, auditRows, auditStatus, auditSystem])

  const totalAuditPages = Math.max(1, Math.ceil(filteredAuditRows.length / AUDIT_PAGE_SIZE))
  const safeAuditPage = Math.min(auditPage, totalAuditPages)
  const pagedAuditRows = useMemo(() => {
    const start = (safeAuditPage - 1) * AUDIT_PAGE_SIZE
    return filteredAuditRows.slice(start, start + AUDIT_PAGE_SIZE)
  }, [filteredAuditRows, safeAuditPage])

  const selectedAuditRow = useMemo(() => {
    if (!selectedPoseKey) return null
    return auditRows.find((r) => r.group.key === selectedPoseKey) ?? null
  }, [auditRows, selectedPoseKey])

  const sandboxInspection = useMemo(() => {
    if (!cfg) return null
    const testPose = {
      id: 'sandbox-pose',
      体系: testSystem,
      姿势编号: 'TEST',
      分类: testCategory,
      姿势名称: testName,
      角度: '正面',
      缩略图: '',
      原图: '',
      检索: '',
    }
    const result = inspectPoseSanitizeForCloud(testPose, cfg)
    const promptPreview = buildRecipePrompt(
      {
        pose: testPose,
        costume: null,
        portrait: null,
      },
      'none',
      {
        promptTemplate: platformCfg?.promptTemplate,
        poseSanitize: cfg,
      }
    )
    return { result, promptPreview }
  }, [cfg, platformCfg?.promptTemplate, testCategory, testName, testSystem])

  if (!cfg) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="姿势图名称敏感词屏蔽"
          description="正在加载敏感词与脱敏配置…"
        />
      </div>
    )
  }

  const knownSystems = posesState.data?.lines ?? []

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="姿势图名称敏感词屏蔽"
        description="配置调用云端生图模型时对姿势图名称、附加参考图名称进行脱敏清洗的敏感词库、替换规则与整类静默策略，防止仅因文本标签触发上游模型安全拦截。前台浏览与本地下载保留原名。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <AdminBadge tone="warning">有未保存的敏感词更改</AdminBadge>}
            {dirty && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={ADMIN_BTN_CLS}
                disabled={saving}
                onClick={handleDiscard}
              >
                <Undo2Icon className="size-3.5" />
                放弃更改
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={ADMIN_BTN_CLS}
              disabled={saving}
              onClick={handleResetDefaults}
            >
              <RotateCcwIcon className="size-3.5" />
              恢复默认词库
            </Button>
            <Button
              type="button"
              size="sm"
              className={ADMIN_BTN_CLS}
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              保存配置
            </Button>
          </div>
        }
      />

      <AdminMetricGrid
        items={[
          {
            code: '01.',
            label: '云端名称脱敏开关',
            value: cfg.enabled ? '已开启' : '已关闭',
            tone: cfg.enabled ? 'success' : 'warning',
            hint: cfg.enabled ? '生图时自动清洗敏感姿势词' : '当前将原样发送姿势名称',
          },
          {
            code: '02.',
            label: '屏蔽敏感词条数',
            value: termCounts.total,
            hint: `中文 ${termCounts.zh} 条 · 英文 ${termCounts.en} 条`,
          },
          {
            code: '03.',
            label: '安全替换 / 静默规则',
            value: `${cfg.replacements.length} / ${cfg.blockedPoseSystems.length + cfg.blockedPoseCategoryKeywords.length}`,
            hint: `替换映射 ${cfg.replacements.length} 条 · 静默规则 ${cfg.blockedPoseSystems.length + cfg.blockedPoseCategoryKeywords.length} 条`,
          },
          {
            code: '04.',
            label: '姿势库脱敏覆盖',
            value: posesState.isLoading
              ? '扫描中…'
              : `${auditStats.affected} / ${auditStats.total}`,
            tone: auditStats.affected > 0 ? 'default' : 'warning',
            hint: posesState.isLoading
              ? '正在读取姿势索引…'
              : `精简保留 ${auditStats.modified} · 整条静默 ${auditStats.silenced}`,
            onClick: () => setSubView('audit'),
          },
        ]}
      />

      <AdminFilterBar
        options={[
          { id: 'rules', label: `01. 词库与脱敏规则 (${cfg.blockedTerms.length})` },
          {
            id: 'audit',
            label: `02. 姿势库全量检测 (${posesState.isLoading ? '…' : auditStats.total})`,
          },
        ]}
        value={subView}
        onChange={setSubView}
      />

      {subView === 'rules' && (
        <div className="space-y-6">
          {/* 1. 总开关与整类静默策略 */}
          <AdminPanel
            title="屏蔽总开关与整类静默规则"
            subtitle="命中的体系或分类关键词将在发往云端时整条静默（不附带姿势名称文本，仅发参考图）。"
          >
            <div className="space-y-4">
              <AdminField
                label="启用云端姿势名称敏感词屏蔽"
                hint="开启后自动清洗提示词（<IMAGE_0>(...)）与云端三合一拼图卡片中的姿势文本；前台图库与本地拼图导出不受影响。"
              >
                <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                  <span className="text-xs text-zinc-700 dark:text-zinc-300">
                    {cfg.enabled
                      ? '已开启：向云端模型发送参考图时自动过滤敏感词'
                      : '已关闭：向云端发送原始姿势名称（慎用，可能触发上游审核）'}
                  </span>
                  <Switch
                    checked={cfg.enabled}
                    onCheckedChange={(v) => updateCfg((prev) => ({ ...prev, enabled: v }))}
                  />
                </div>
              </AdminField>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2.5 border border-zinc-200 p-3.5 dark:border-zinc-800">
                  <div>
                    <div className="text-xs font-bold">整类静默的姿势体系（精确匹配）</div>
                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      属于以下体系的姿势，发往云端时直接省去全部文本标注。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {cfg.blockedPoseSystems.length === 0 ? (
                      <span className="text-[11px] text-zinc-400">暂无整类静默体系</span>
                    ) : (
                      cfg.blockedPoseSystems.map((sys) => (
                        <span
                          key={sys}
                          className="inline-flex items-center gap-1 border border-zinc-950 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950"
                        >
                          <span>{sys}</span>
                          <button
                            type="button"
                            aria-label={`移除静默体系 ${sys}`}
                            onClick={() => handleToggleSystem(sys)}
                            className="opacity-75 transition-opacity hover:opacity-100"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  {knownSystems.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-100 pt-2 dark:border-zinc-800/80">
                      <span className="text-[10px] font-medium text-zinc-500">图库现有体系：</span>
                      {knownSystems.map((sys) => {
                        const active = cfg.blockedPoseSystems.some(
                          (s) => s.toLowerCase() === sys.toLowerCase()
                        )
                        return (
                          <button
                            key={sys}
                            type="button"
                            onClick={() => handleToggleSystem(sys)}
                            className={`border px-1.5 py-0.5 text-[11px] transition-colors ${
                              active
                                ? 'border-zinc-950 bg-zinc-100 font-bold text-zinc-950 dark:border-zinc-200 dark:bg-zinc-800 dark:text-zinc-100'
                                : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-400'
                            }`}
                          >
                            {active ? '✓ ' : '+ '}
                            {sys}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Input
                      value={systemInput}
                      onChange={(e) => setSystemInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddSystem()
                        }
                      }}
                      placeholder="输入自定义体系名称…"
                      className={ADMIN_TEXT_INPUT_CLS}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={ADMIN_BTN_CLS}
                      onClick={() => handleAddSystem()}
                    >
                      <PlusIcon className="size-3.5" />
                      添加
                    </Button>
                  </div>
                </div>

                <div className="space-y-2.5 border border-zinc-200 p-3.5 dark:border-zinc-800">
                  <div>
                    <div className="text-xs font-bold">整类静默的分类关键词（包含匹配）</div>
                    <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      姿势「分类」包含任一关键词时整条静默（大小写不敏感）。
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {cfg.blockedPoseCategoryKeywords.length === 0 ? (
                      <span className="text-[11px] text-zinc-400">暂无静默分类关键词</span>
                    ) : (
                      cfg.blockedPoseCategoryKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          <span>{kw}</span>
                          <button
                            type="button"
                            aria-label={`移除分类关键词 ${kw}`}
                            onClick={() =>
                              updateCfg((prev) => ({
                                ...prev,
                                blockedPoseCategoryKeywords:
                                  prev.blockedPoseCategoryKeywords.filter(
                                    (item) => item.toLowerCase() !== kw.toLowerCase()
                                  ),
                              }))
                            }
                            className="text-zinc-500 hover:text-red-600"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Input
                      value={categoryKeywordInput}
                      onChange={(e) => setCategoryKeywordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddCategoryKeyword()
                        }
                      }}
                      placeholder="输入分类关键词（如：后入、贴脸）…"
                      className={ADMIN_TEXT_INPUT_CLS}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={ADMIN_BTN_CLS}
                      onClick={handleAddCategoryKeyword}
                    >
                      <PlusIcon className="size-3.5" />
                      添加
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </AdminPanel>

          {/* 2. 屏蔽敏感词库 */}
          <AdminPanel
            title={`屏蔽敏感词库（共 ${cfg.blockedTerms.length} 条）`}
            subtitle="姿势名称按「・」「＋」「（）」分段后，包含敏感词的词段会被剔除，仅保留安全无害的体态词段。纯英文词自动按单词边界匹配。"
            headerRight={
              <div className="flex flex-wrap items-center gap-2">
                {!bulkMode && (
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
                    <Input
                      value={termSearch}
                      onChange={(e) => setTermSearch(e.target.value)}
                      placeholder="搜索词条…"
                      className="h-8 w-44 rounded-none pl-8 text-xs"
                    />
                  </div>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={ADMIN_BTN_CLS}
                  onClick={() => void handleCopyTerms()}
                >
                  <CopyIcon className="size-3.5" />
                  复制词库
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={ADMIN_BTN_CLS}
                  onClick={() => (bulkMode ? setBulkMode(false) : handleEnterBulkMode())}
                >
                  {bulkMode ? (
                    <>
                      <TagIcon className="size-3.5" />
                      标签模式
                    </>
                  ) : (
                    <>
                      <FileTextIcon className="size-3.5" />
                      批量文本编辑
                    </>
                  )}
                </Button>
              </div>
            }
          >
            {!cfg.enabled && (
              <div className="mb-4 border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                提示：当前顶部「启用云端姿势名称敏感词屏蔽」处于关闭状态，以下词库暂不生效。
              </div>
            )}

            {bulkMode ? (
              <div className="space-y-3">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  每行一个敏感词，也支持英文/中文逗号、顿号或分号分隔；应用后将自动去除空白并按大小写去重（最多保留 1000 条）。
                </p>
                <Textarea
                  rows={14}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="每行输入一个敏感词…"
                  className="rounded-none font-mono text-xs leading-relaxed"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-zinc-500">
                    当前文本解析词数：{parseTermBatchInput(bulkText).length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={ADMIN_BTN_CLS}
                      onClick={() => setBulkMode(false)}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className={ADMIN_BTN_CLS}
                      onClick={handleApplyBulkText}
                    >
                      <CheckIcon className="size-3.5" />
                      应用词库变更
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    onPaste={handleTermInputPaste}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddTermSubmit()
                      }
                    }}
                    placeholder="输入敏感词后回车添加（支持逗号、顿号或多行文本批量粘贴，如：黑丝, bunny girl）"
                    className={`min-w-[260px] flex-1 ${ADMIN_TEXT_INPUT_CLS}`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className={ADMIN_BTN_CLS}
                    onClick={handleAddTermSubmit}
                  >
                    <PlusIcon className="size-3.5" />
                    添加敏感词
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { id: 'all', label: `全部 (${termCounts.total})` },
                        { id: 'zh', label: `中文 (${termCounts.zh})` },
                        { id: 'en', label: `英文 (${termCounts.en})` },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setTermLangFilter(opt.id)}
                        className={`border px-2 py-0.5 font-mono transition-colors ${
                          termLangFilter === opt.id
                            ? 'border-zinc-950 bg-zinc-950 font-bold text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <span className="font-mono text-zinc-500">
                    当前显示 {filteredTerms.length} / {cfg.blockedTerms.length} 条
                  </span>
                </div>

                <div className="max-h-80 overflow-y-auto border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/30">
                  {filteredTerms.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-500">
                      {cfg.blockedTerms.length === 0
                        ? '当前词库为空，请在上方添加敏感词或点击「批量文本编辑」。'
                        : '没有匹配当前筛选条件的词条。'}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {filteredTerms.map((term) => (
                        <span
                          key={term}
                          className="inline-flex items-center gap-1 border border-zinc-300 bg-white px-2 py-0.5 font-mono text-[11px] text-zinc-900 transition-colors hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-400"
                        >
                          <span>{term}</span>
                          <button
                            type="button"
                            aria-label={`删除敏感词 ${term}`}
                            onClick={() => handleRemoveTerm(term)}
                            className="text-zinc-400 transition-colors hover:text-red-600"
                          >
                            <XIcon className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </AdminPanel>

          {/* 3. 安全词替换映射 */}
          <AdminPanel
            title={`安全词替换映射（共 ${cfg.replacements.length} 条）`}
            subtitle="在分片与敏感词拦截前执行，用于将复合敏感短语保留为安全的动作部分（如「手扶墙顶胯」→「手扶墙」）。「替换为」留空表示直接删去原短语。"
          >
            <div className="space-y-3">
              {cfg.replacements.length > 0 && (
                <div className="divide-y divide-zinc-200 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                  {cfg.replacements.map((rep, idx) => (
                    <div
                      key={`${idx}-${rep.from}`}
                      className="grid items-center gap-2 p-2.5 sm:grid-cols-[1fr_auto_1fr_auto]"
                    >
                      <Input
                        value={rep.from}
                        onChange={(e) =>
                          handleUpdateReplacement(idx, { from: e.target.value })
                        }
                        placeholder="原短语（如：前屈翘臀）"
                        className={ADMIN_TEXT_INPUT_CLS}
                      />
                      <span className="hidden text-center font-mono text-xs text-zinc-400 sm:inline">
                        →
                      </span>
                      <Input
                        value={rep.to}
                        onChange={(e) =>
                          handleUpdateReplacement(idx, { to: e.target.value })
                        }
                        placeholder="替换为安全词（留空则删除）"
                        className={ADMIN_TEXT_INPUT_CLS}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`${ADMIN_BTN_SM_CLS} px-2 text-red-600 hover:bg-red-500/10`}
                        title="删除此替换规则"
                        onClick={() => handleRemoveReplacement(idx)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid items-center gap-2 border border-dashed border-zinc-300 bg-zinc-50/70 p-2.5 sm:grid-cols-[1fr_auto_1fr_auto] dark:border-zinc-700 dark:bg-zinc-900/40">
                <Input
                  value={newRepFrom}
                  onChange={(e) => setNewRepFrom(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddReplacement()
                    }
                  }}
                  placeholder="新增原短语（如：手扶墙顶胯）"
                  className={ADMIN_TEXT_INPUT_CLS}
                />
                <span className="hidden text-center font-mono text-xs text-zinc-400 sm:inline">
                  →
                </span>
                <Input
                  value={newRepTo}
                  onChange={(e) => setNewRepTo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddReplacement()
                    }
                  }}
                  placeholder="替换为安全描述（可留空）"
                  className={ADMIN_TEXT_INPUT_CLS}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={ADMIN_BTN_CLS}
                  onClick={handleAddReplacement}
                >
                  <PlusIcon className="size-3.5" />
                  新增映射
                </Button>
              </div>
            </div>
          </AdminPanel>

          {/* 4. 实时效果测试沙盒 */}
          <AdminPanel
            title={
              <span className="inline-flex items-center gap-1.5">
                <FlaskConicalIcon className="size-3.5" />
                <span>单条姿势名称脱敏实时测试</span>
              </span>
            }
            subtitle="实时使用当前编辑中的规则（无需先保存）预览云端提示词与命中明细。"
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-zinc-500">快捷示例：</span>
                {SANDBOX_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setTestName(preset.name)
                      setTestSystem(preset.system)
                      setTestCategory(preset.category)
                    }}
                    className="border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-zinc-700 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <AdminField label="姿势名称">
                  <Input
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="输入测试姿势名称…"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>
                <AdminField label="所属体系（可选）">
                  <Input
                    value={testSystem}
                    onChange={(e) => setTestSystem(e.target.value)}
                    placeholder="如：全身单人・性感系"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>
                <AdminField label="所属分类（可选）">
                  <Input
                    value={testCategory}
                    onChange={(e) => setTestCategory(e.target.value)}
                    placeholder="如：站姿"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>
              </div>

              {sandboxInspection && (
                <div className="space-y-3 border border-zinc-200 bg-zinc-50/70 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {renderActionBadge(sandboxInspection.result)}
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {sandboxInspection.result.reason}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500">
                      云端标注：
                      <strong className="ml-1 text-zinc-950 dark:text-zinc-100">
                        {sandboxInspection.result.sanitized
                          ? `<IMAGE_0>(${sandboxInspection.result.sanitized})`
                          : '<IMAGE_0>（不附带姿势名称）'}
                      </strong>
                    </div>
                  </div>

                  {(sandboxInspection.result.matchedReplacements.length > 0 ||
                    sandboxInspection.result.matchedTerms.length > 0) && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      {sandboxInspection.result.matchedReplacements.map((r) => (
                        <AdminBadge key={r.from} tone="info">
                          替换：{r.from} → {r.to || '删除'}
                        </AdminBadge>
                      ))}
                      {sandboxInspection.result.matchedTerms.map((term) => (
                        <AdminBadge key={term} tone="warning">
                          屏蔽词：{term}
                        </AdminBadge>
                      ))}
                    </div>
                  )}

                  <pre className="whitespace-pre-wrap border border-zinc-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    {sandboxInspection.promptPreview}
                  </pre>
                </div>
              )}
            </div>
          </AdminPanel>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
            {dirty && <AdminBadge tone="warning">有未保存的敏感词更改</AdminBadge>}
            <Button
              type="button"
              size="sm"
              className={ADMIN_BTN_CLS}
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              保存敏感词配置
            </Button>
          </div>
        </div>
      )}

      {subView === 'audit' && (
        <div className="space-y-4">
          {selectedAuditRow && (
            <AdminPanel
              title={`快捷调校词段 · ${selectedAuditRow.group.number} ${selectedAuditRow.group.name}`}
              subtitle={`${selectedAuditRow.group.system} · ${selectedAuditRow.group.category} — 点击下方词段芯片或手动输入子词条，可立即加入屏蔽词库并实时重算全表`}
              headerRight={
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_SM_CLS}
                    onClick={() => {
                      setTestName(selectedAuditRow.group.name)
                      setTestSystem(selectedAuditRow.group.system)
                      setTestCategory(selectedAuditRow.group.category)
                      setSubView('rules')
                    }}
                  >
                    <FlaskConicalIcon className="size-3.5" />
                    带入沙盒测试
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_SM_CLS}
                    onClick={() => setSelectedPoseKey(null)}
                  >
                    <XIcon className="size-3.5" />
                    关闭调校栏
                  </Button>
                </div>
              }
            >
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-zinc-500">脱敏结果：</span>
                  {renderActionBadge(selectedAuditRow.result)}
                  <span className="font-mono font-bold text-zinc-950 dark:text-zinc-100">
                    {selectedAuditRow.result.sanitized || '（整条静默，仅发送姿势参考图）'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[11px] text-zinc-500">词段一键屏蔽/解除：</span>
                  {extractCandidateSegments(selectedAuditRow.group.name).map((seg) => {
                    const inBlocked = cfg.blockedTerms.some(
                      (t) => t.toLowerCase() === seg.toLowerCase()
                    )
                    return (
                      <button
                        key={seg}
                        type="button"
                        onClick={() => handleToggleTerm(seg)}
                        className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                          inBlocked
                            ? 'border-amber-600/50 bg-amber-500/15 font-bold text-amber-800 dark:text-amber-300'
                            : 'border-zinc-300 bg-white text-zinc-800 hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200'
                        }`}
                      >
                        <span>{inBlocked ? `✓ 已屏蔽：${seg}` : `+ 屏蔽：${seg}`}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex max-w-md items-center gap-2 pt-1">
                  <Input
                    value={auditQuickTerm}
                    onChange={(e) => setAuditQuickTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddAuditQuickTerm()
                      }
                    }}
                    placeholder="或输入自定义子串屏蔽词（如：挤胸）回车添加…"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_CLS}
                    onClick={handleAddAuditQuickTerm}
                  >
                    <PlusIcon className="size-3.5" />
                    加入屏蔽
                  </Button>
                </div>
              </div>
            </AdminPanel>
          )}

          <AdminPanel
            title="全量姿势图名称脱敏扫描"
            subtitle="实时对本地姿势库全部条目运行当前屏蔽规则，便于核查是否存在漏网敏感词或误伤。"
            headerRight={
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={auditSystem}
                  onValueChange={(v) => {
                    setAuditSystem(v)
                    setAuditPage(1)
                  }}
                >
                  <SelectTrigger className={`w-44 ${ADMIN_SELECT_CLS}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部体系</SelectItem>
                    {knownSystems.map((sys) => (
                      <SelectItem key={sys} value={sys}>
                        {sys}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-400" />
                  <Input
                    value={auditQuery}
                    onChange={(e) => {
                      setAuditQuery(e.target.value)
                      setAuditPage(1)
                    }}
                    placeholder="搜索姿势名、编号或分类…"
                    className="h-8 w-52 rounded-none pl-8 text-xs"
                  />
                </div>
              </div>
            }
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {(
                  [
                    { id: 'all', label: `全部 (${auditStats.total})` },
                    { id: 'modified', label: `已脱敏精简 (${auditStats.modified})` },
                    { id: 'silenced', label: `整条静默 (${auditStats.silenced})` },
                    { id: 'unchanged', label: `安全保留 (${auditStats.unchanged})` },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setAuditStatus(opt.id)
                      setAuditPage(1)
                    }}
                    className={`border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                      auditStatus === opt.id
                        ? 'border-zinc-950 bg-zinc-950 font-bold text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-950'
                        : 'border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[11px] text-zinc-500">
                匹配 {filteredAuditRows.length} 条
              </span>
            </div>

            {posesState.isLoading ? (
              <div className="flex items-center justify-center py-12 text-xs text-zinc-500">
                <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
                正在加载姿势库数据…
              </div>
            ) : posesState.error ? (
              <div className="border border-red-500/40 bg-red-500/10 p-4 text-xs text-red-700 dark:text-red-400">
                加载姿势库失败：{posesState.error instanceof Error ? posesState.error.message : '未知错误'}
              </div>
            ) : pagedAuditRows.length === 0 ? (
              <div className="border border-zinc-200 py-10 text-center text-xs text-zinc-500 dark:border-zinc-800">
                当前筛选条件下无匹配姿势
              </div>
            ) : (
              <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-300">
                      <th className="px-3 py-2">编号 / 体系·分类</th>
                      <th className="px-3 py-2">原始姿势名称</th>
                      <th className="px-3 py-2">云端脱敏结果</th>
                      <th className="px-3 py-2">状态与命中说明</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {pagedAuditRows.map(({ group, result }) => {
                      const isSelected = selectedPoseKey === group.key
                      return (
                        <tr
                          key={group.key}
                          className={
                            isSelected
                              ? 'bg-zinc-100/80 dark:bg-zinc-900'
                              : 'hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40'
                          }
                        >
                          <td className="px-3 py-2 align-top whitespace-nowrap">
                            <div className="font-mono text-[11px] font-bold">{group.number}</div>
                            <div className="text-[11px] text-zinc-500">
                              {group.system} · {group.category}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top font-medium text-zinc-900 dark:text-zinc-100">
                            {group.name}
                          </td>
                          <td className="px-3 py-2 align-top font-mono text-[11px]">
                            {result.sanitized ? (
                              <span className="text-zinc-900 dark:text-zinc-100">
                                {result.sanitized}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                &lt;整条静默：仅发参考图&gt;
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {renderActionBadge(result)}
                              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {result.reason}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right align-top whitespace-nowrap">
                            <Button
                              type="button"
                              size="sm"
                              variant={isSelected ? 'default' : 'outline'}
                              className={ADMIN_BTN_SM_CLS}
                              onClick={() =>
                                setSelectedPoseKey(isSelected ? null : group.key)
                              }
                            >
                              {isSelected ? '收起' : '调整词条'}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {totalAuditPages > 1 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono text-[11px] text-zinc-500">
                  第 {safeAuditPage} / {totalAuditPages} 页
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_SM_CLS}
                    disabled={safeAuditPage <= 1}
                    onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeftIcon className="size-3.5" />
                    上一页
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_SM_CLS}
                    disabled={safeAuditPage >= totalAuditPages}
                    onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
                  >
                    下一页
                    <ChevronRightIcon className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </AdminPanel>
        </div>
      )}
    </div>
  )
}
