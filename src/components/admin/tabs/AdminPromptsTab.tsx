import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  LoaderCircleIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchAdminSettingsApi,
  updateAdminSettingsApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type {
  PlatformConfig,
  PromptConstraintCondition,
  PromptConstraintItem,
  PromptTemplateConfig,
} from '@/types/gallery'
import {
  NONE_STYLE_PRESET,
  PROMPT_CONSTRAINT_CONDITION_OPTIONS,
  buildRecipePrompt,
  createDefaultPromptTemplate,
  getEffectiveStyleCatalog,
  getEffectiveStyleCategories,
  getEffectiveStyleSubcategories,
  mergePromptTemplate,
} from '../../../../shared/studio'
import {
  AdminBadge,
  AdminField,
  AdminPageHeader,
  AdminPanel,
} from '../AdminPrimitives'
import {
  ADMIN_BTN_CLS,
  ADMIN_BTN_SM_CLS,
  ADMIN_SELECT_CLS,
  type AdminConfirmAction,
} from '../auditHelpers'

interface AdminPromptsTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onRefreshBootstrap: () => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
}

type PromptTemplateStringKey = Exclude<keyof PromptTemplateConfig, 'constraints'>

export function AdminPromptsTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
  onRefreshBootstrap,
  onDirtyChange,
}: AdminPromptsTabProps) {
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig | null>(null)
  const [savedPlatformJson, setSavedPlatformJson] = useState('')
  const [savingPlatform, setSavingPlatform] = useState(false)

  const [previewStyleKey, setPreviewStyleKey] = useState<string>('')
  const [previewAllowFaceStyleShift, setPreviewAllowFaceStyleShift] = useState(false)
  const [previewAllowPoseStyleShift, setPreviewAllowPoseStyleShift] = useState(false)
  const [previewScenario, setPreviewScenario] = useState<
    'all' | 'with_extra' | 'no_portrait' | 'no_costume' | 'portrait_only' | 'pose_only'
  >('all')

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const res = await fetchAdminSettingsApi()
      setPlatformCfg(res.platform)
      setSavedPlatformJson(JSON.stringify(res.platform))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载提示词模板配置失败')
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

  const platformDirty = Boolean(
    platformCfg && savedPlatformJson && JSON.stringify(platformCfg) !== savedPlatformJson
  )

  useEffect(() => {
    onDirtyChange?.(platformDirty)
    return () => onDirtyChange?.(false)
  }, [platformDirty, onDirtyChange])

  if (!platformCfg) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="提示词模板"
          description="正在加载提示词模板与约束配置…"
        />
      </div>
    )
  }

  const styleCategories = getEffectiveStyleCategories(platformCfg)
  const styleSubcategories = getEffectiveStyleSubcategories(platformCfg)
  const styleCategoryMap = new Map(styleCategories.map((c) => [c.id, c]))
  const styleSubcategoryMap = new Map(styleSubcategories.map((s) => [s.id, s]))
  const styleCatalog = getEffectiveStyleCatalog(platformCfg)

  const effectivePreviewStyle =
    previewStyleKey === 'none' || styleCatalog.some((s) => s.id === previewStyleKey)
      ? previewStyleKey
      : styleCatalog[0]?.id || 'none'

  const sampleRecipe = {
    portrait:
      previewScenario === 'all' ||
      previewScenario === 'with_extra' ||
      previewScenario === 'no_costume' ||
      previewScenario === 'portrait_only'
        ? {
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
          }
        : null,
    costume:
      previewScenario === 'all' ||
      previewScenario === 'with_extra' ||
      previewScenario === 'no_portrait'
        ? {
            id: 'sample-c',
            分类: '日常',
            服装名称: '示例服装',
            标签: [],
            关键词: '',
            缩略图: '',
            预览图: '',
            原图: '',
            检索: '',
          }
        : null,
    pose:
      previewScenario === 'all' ||
      previewScenario === 'with_extra' ||
      previewScenario === 'no_portrait' ||
      previewScenario === 'no_costume' ||
      previewScenario === 'pose_only'
        ? {
            id: 'sample-pose',
            体系: '全身',
            姿势编号: 'P001',
            分类: '站姿',
            姿势名称: '示例姿势',
            角度: '正面',
            缩略图: '',
            原图: '',
            检索: '',
          }
        : null,
    extraImages:
      previewScenario === 'with_extra'
        ? [{ id: 'sample-extra', name: '场景道具', url: '' }]
        : [],
  }

  const samplePrompt = buildRecipePrompt(sampleRecipe, effectivePreviewStyle, {
    prefix: platformCfg.defaultPromptPrefix,
    suffix: platformCfg.defaultPromptSuffix,
    negativePrompt: platformCfg.defaultNegativePrompt,
    promptTemplate: platformCfg.promptTemplate,
    poseSanitize: platformCfg.poseSanitize,
    allowFaceStyleShift: previewAllowFaceStyleShift,
    allowPoseStyleShift: previewAllowPoseStyleShift,
    styleCategories,
    styleSubcategories,
    stylePresets: styleCatalog,
  })

  const handleSavePrompts = async () => {
    setSavingPlatform(true)
    try {
      const res = await updateAdminSettingsApi({
        defaultPromptPrefix: platformCfg.defaultPromptPrefix,
        defaultPromptSuffix: platformCfg.defaultPromptSuffix,
        defaultNegativePrompt: platformCfg.defaultNegativePrompt,
        promptTemplate: platformCfg.promptTemplate,
      })
      setPlatformCfg(res.platform)
      setSavedPlatformJson(JSON.stringify(res.platform))
      await onRefreshBootstrap()
      toast.success('提示词模板配置已保存')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存提示词模板失败')
    } finally {
      setSavingPlatform(false)
    }
  }

  const tpl = mergePromptTemplate(platformCfg.promptTemplate, {
    preserveWhitespace: true,
  })

  const updateTplField = (key: PromptTemplateStringKey, value: string) => {
    setPlatformCfg({
      ...platformCfg,
      promptTemplate: {
        ...tpl,
        [key]: value,
      },
    })
  }

  const updateConstraints = (nextConstraints: PromptConstraintItem[]) => {
    setPlatformCfg({
      ...platformCfg,
      promptTemplate: {
        ...tpl,
        constraints: nextConstraints,
      },
    })
  }

  const addConstraint = () => {
    updateConstraints([
      ...tpl.constraints,
      {
        id: `c_${crypto.randomUUID().slice(0, 8)}`,
        condition: 'always',
        text: '',
        enabled: true,
      },
    ])
  }

  const updateConstraintAt = (index: number, patch: Partial<PromptConstraintItem>) => {
    updateConstraints(
      tpl.constraints.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    )
  }

  const moveConstraint = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= tpl.constraints.length) return
    const next = [...tpl.constraints]
    ;[next[index], next[target]] = [next[target], next[index]]
    updateConstraints(next)
  }

  const removeConstraint = (index: number) => {
    updateConstraints(tpl.constraints.filter((_, idx) => idx !== index))
  }

  type PromptTemplateFieldMeta = {
    key: PromptTemplateStringKey
    label: string
    rows?: number
    hint: string
    colSpan2?: boolean
  }

  const standardFields: PromptTemplateFieldMeta[] = [
    {
      key: 'intro',
      label: '开篇总指令',
      rows: 2,
      hint: '支持 {{总数}} {{参考图序}} {{媒介}}',
      colSpan2: true,
    },
    {
      key: 'poseClause',
      label: '• 姿势规则（严格模式）',
      rows: 2,
      hint: '支持 {{姿势图}}（自动附带脱敏后的名称）',
    },
    {
      key: 'costumeClause',
      label: '• 服装规则（传了服装图时）',
      rows: 2,
      hint: '支持 {{服装图}}',
    },
    {
      key: 'portraitClause',
      label: '• 人物外貌规则（传了人像图时）',
      rows: 2,
      hint: '支持 {{人像图}}',
    },
    {
      key: 'portraitOwnOutfitClause',
      label: '• 人物原穿搭补充（未选服装图时自动追加）',
      rows: 2,
      hint: '支持 {{人像图}}',
    },
    {
      key: 'facelessClause',
      label: '• 无人像展示规则（仅传姿势 + 服装时）',
      rows: 2,
      hint: '无独立人像的服装展示场景',
    },
    {
      key: 'defaultPersonClause',
      label: '• 无人像兜底规则（其余无人像组合）',
      rows: 2,
      hint: '如仅姿势图或附图时生成普通清晰人物',
    },
    {
      key: 'extraClause',
      label: '• 补充参考规则（有额外附图时）',
      rows: 2,
      hint: '支持 {{附图列表}}',
      colSpan2: true,
    },
  ]

  const adaptiveFields: PromptTemplateFieldMeta[] = [
    {
      key: 'adaptiveCostumeClause',
      label: '• 服装跨画风适配（替代服装规则）',
      rows: 2,
      hint: '支持 {{服装图}}',
    },
    {
      key: 'adaptivePortraitClause',
      label: '• 人物跨画风适配（替代外貌规则）',
      rows: 2,
      hint: '支持 {{人像图}}',
    },
    {
      key: 'adaptiveStyleSuffix',
      label: '• 画风跟随附加指令（追加于「• 风格：」段尾）',
      rows: 2,
      hint: '统一提示人物外貌与服饰适配目标风格',
      colSpan2: true,
    },
  ]

  const adaptivePoseFields: PromptTemplateFieldMeta[] = [
    {
      key: 'adaptivePoseClause',
      label: '• 姿势适配规则（替代严格姿势规则）',
      rows: 3,
      hint: '传了姿势图且开启「姿势适配」时生效；支持 {{姿势图}}',
      colSpan2: true,
    },
    {
      key: 'adaptiveNoPoseRecompositionClause',
      label: '• 构图释放补充（未传姿势图且开启姿势适配时追加）',
      rows: 2,
      hint: '释放人像原图机位与站姿；支持 {{人像图}}',
    },
    {
      key: 'adaptivePoseStyleSuffix',
      label: '• 画风交互优先指令（追加于「• 风格：」段尾）',
      rows: 2,
      hint: '优先该画风视角与交互并复用现有双臂',
    },
  ]

  const renderFieldGrid = (fields: PromptTemplateFieldMeta[]) => (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {fields.map((f) => (
        <div
          key={f.key}
          className={`space-y-1 ${f.colSpan2 ? 'sm:col-span-2' : ''}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-xs font-bold">{f.label}</label>
            <span className="font-mono text-xs text-zinc-500">{f.hint}</span>
          </div>
          <Textarea
            rows={f.rows ?? 2}
            value={tpl[f.key]}
            onChange={(e) => updateTplField(f.key, e.target.value)}
            className="rounded-none font-mono text-xs leading-relaxed"
          />
        </div>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="SECTION 07 // PROMPT TEMPLATES"
        title="提示词模板"
        description="统一管理全局前后置提示词、负面提示词、动态结构化模板（含跨画风面部自适应条款）与实时指令预览。"
      />

      <AdminPanel
        title="全局默认前后置与负面提示词"
        subtitle="自动注入到每次生图指令的首尾及负面排除项中。"
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="默认前置提示词">
              <Textarea
                rows={2}
                value={platformCfg.defaultPromptPrefix}
                onChange={(e) =>
                  setPlatformCfg({ ...platformCfg, defaultPromptPrefix: e.target.value })
                }
                placeholder="例如：高精细度商业级人物立绘…"
                className="rounded-none font-mono text-xs"
              />
            </AdminField>
            <AdminField label="默认后置提示词">
              <Textarea
                rows={2}
                value={platformCfg.defaultPromptSuffix}
                onChange={(e) =>
                  setPlatformCfg({ ...platformCfg, defaultPromptSuffix: e.target.value })
                }
                placeholder="例如：构图完整，光影协调…"
                className="rounded-none font-mono text-xs"
              />
            </AdminField>
          </div>

          <AdminField label="全局负面提示词">
            <Textarea
              rows={2}
              value={platformCfg.defaultNegativePrompt}
              onChange={(e) =>
                setPlatformCfg({ ...platformCfg, defaultNegativePrompt: e.target.value })
              }
              placeholder="例如：畸形手指，多指，画面模糊，文字水印"
              className="rounded-none font-mono text-xs"
            />
          </AdminField>
        </div>
      </AdminPanel>

      <AdminPanel
        title="结构化提示词模板配置"
        subtitle={
          <>
            生图支持只选 1～3 个参考槽位，以下模板按实际参考图存在与否自动拼装；留空对应段落则跳过输出。
            <span className="ml-1 font-mono text-zinc-700 dark:text-zinc-300">
              可用变量：
              {'{{总数}} {{参考图序}} {{媒介}} {{姿势图}} {{服装图}} {{人像图}} {{附图列表}} {{非姿势图}}'}
            </span>
          </>
        }
        headerRight={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={ADMIN_BTN_SM_CLS}
            onClick={() =>
              onConfirm({
                title: '恢复默认结构化提示词模板？',
                description: '会将上方各段落模板与条款规则重置为系统默认版本（确认后仍需点击「保存提示词模板」才会写入线上配置）。',
                confirmLabel: '确认恢复默认',
                destructive: true,
                run: async () => {
                  setPlatformCfg({
                    ...platformCfg,
                    promptTemplate: createDefaultPromptTemplate(),
                  })
                  toast.info('已填入默认结构化模板，请检查后点击底部保存按钮')
                },
              })
            }
          >
            <RotateCcwIcon className="size-3" />
            恢复默认模板
          </Button>
        }
      >
        <div className="space-y-6">
          {renderFieldGrid(standardFields)}

          <div className="space-y-3 border border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <div className="text-xs font-bold">跨画风面部自适应专属规则（当用户开启「跟随画风」时生效）</div>
              <p className="mt-0.5 text-xs text-zinc-500">
                当工作台开启「跟随画风」且目标画风生效时，以下条款将自动替代对应的常规人物与服装规则。
              </p>
            </div>
            {renderFieldGrid(adaptiveFields)}
          </div>

          <div className="space-y-3 border border-zinc-200 p-4 dark:border-zinc-800">
            <div>
              <div className="text-xs font-bold">姿势与机位随画风适配规则（当开启「姿势适配」时生效）</div>
              <p className="mt-0.5 text-xs text-zinc-500">
                选中自拍、对镜自拍、第一人称POV、监控摄像头等强机位/手持互动画风（或用户在工作台手动开启「姿势适配」）时，以下条款将自动接管姿势与构图规则。
              </p>
            </div>
            {renderFieldGrid(adaptivePoseFields)}
          </div>

          <div className="border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
              <div className="space-y-0.5">
                <div className="text-xs font-bold">
                  • 约束规则列表（共 {tpl.constraints.length} 条）
                </div>
                <div className="text-xs text-zinc-500">
                  按顺序筛选启用且满足触发条件的约束并从 1) 起自动递增编号；支持变量：
                  <span className="ml-1 font-mono">
                    {'{{姿势图}} {{服装图}} {{人像图}} {{附图列表}} {{非姿势图}}'}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={ADMIN_BTN_SM_CLS}
                disabled={tpl.constraints.length >= 30}
                onClick={addConstraint}
              >
                <PlusIcon className="size-3" />
                添加约束
              </Button>
            </div>

            {tpl.constraints.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-500">
                当前未配置任何约束规则，生图时将省略「• 约束：」段落；点击右上角「添加约束」可新增规则。
              </div>
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {tpl.constraints.map((item, cIdx) => (
                  <div key={item.id} className="space-y-2 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs font-bold dark:border-zinc-700 dark:bg-zinc-900">
                          #{cIdx + 1}
                        </span>
                        <Select
                          value={item.condition}
                          onValueChange={(v) =>
                            updateConstraintAt(cIdx, {
                              condition: v as PromptConstraintCondition,
                            })
                          }
                        >
                          <SelectTrigger className={`w-56 ${ADMIN_SELECT_CLS}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            {PROMPT_CONSTRAINT_CONDITION_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                          <Switch
                            className="rounded-none"
                            checked={item.enabled}
                            onCheckedChange={(v) =>
                              updateConstraintAt(cIdx, { enabled: v })
                            }
                          />
                          <span>{item.enabled ? '已启用' : '已停用'}</span>
                        </label>
                      </div>

                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`${ADMIN_BTN_SM_CLS} px-1.5`}
                          disabled={cIdx === 0}
                          title="上移"
                          onClick={() => moveConstraint(cIdx, -1)}
                        >
                          <ArrowUpIcon className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`${ADMIN_BTN_SM_CLS} px-1.5`}
                          disabled={cIdx === tpl.constraints.length - 1}
                          title="下移"
                          onClick={() => moveConstraint(cIdx, 1)}
                        >
                          <ArrowDownIcon className="size-3" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`${ADMIN_BTN_SM_CLS} px-1.5 text-red-600 hover:bg-red-500/10`}
                          title="删除约束"
                          onClick={() => removeConstraint(cIdx)}
                        >
                          <Trash2Icon className="size-3" />
                        </Button>
                      </div>
                    </div>

                    <Textarea
                      rows={2}
                      value={item.text}
                      onChange={(e) =>
                        updateConstraintAt(cIdx, { text: e.target.value })
                      }
                      placeholder="输入约束内容（无需手写编号，系统将自动从 1) 起递增编号）"
                      className="rounded-none font-mono text-xs leading-relaxed"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border border-zinc-300 bg-white/95 px-4 py-2.5 shadow-sm backdrop-blur-xs dark:border-zinc-700 dark:bg-zinc-950/95">
          <div className="flex items-center gap-2 text-xs">
            {platformDirty ? (
              <AdminBadge tone="warning">有未保存的提示词模板更改</AdminBadge>
            ) : (
              <span className="text-zinc-500">提示词与约束配置已同步至线上</span>
            )}
          </div>
          <Button
            size="sm"
            className={ADMIN_BTN_CLS}
            disabled={savingPlatform}
            onClick={() => void handleSavePrompts()}
          >
            {savingPlatform ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <CheckIcon className="size-3.5" />
            )}
            保存全部提示词与模板配置
          </Button>
        </div>
      </AdminPanel>

      <AdminPanel
        title="服务端指令实时预览"
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-8 items-center gap-2 border border-zinc-200 px-2.5 text-xs dark:border-zinc-800">
              <Switch
                className="rounded-none"
                checked={previewAllowFaceStyleShift}
                onCheckedChange={setPreviewAllowFaceStyleShift}
              />
              <span>跟随画风</span>
            </label>
            <label className="inline-flex h-8 items-center gap-2 border border-zinc-200 px-2.5 text-xs dark:border-zinc-800">
              <Switch
                className="rounded-none"
                checked={previewAllowPoseStyleShift}
                onCheckedChange={setPreviewAllowPoseStyleShift}
              />
              <span>姿势适配</span>
            </label>
            <Select
              value={previewScenario}
              onValueChange={(v) =>
                setPreviewScenario(
                  v as
                    | 'all'
                    | 'with_extra'
                    | 'no_portrait'
                    | 'no_costume'
                    | 'portrait_only'
                    | 'pose_only'
                )
              }
            >
              <SelectTrigger className={`w-52 ${ADMIN_SELECT_CLS}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">场景：姿势 + 服装 + 人像</SelectItem>
                <SelectItem value="with_extra">场景：姿势 + 服装 + 人像 + 附图</SelectItem>
                <SelectItem value="no_portrait">场景：姿势 + 服装（无人像）</SelectItem>
                <SelectItem value="no_costume">场景：姿势 + 人像（无服装）</SelectItem>
                <SelectItem value="portrait_only">场景：仅人像（单图）</SelectItem>
                <SelectItem value="pose_only">场景：仅姿势（单图）</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={effectivePreviewStyle}
              onValueChange={(nextKey) => {
                setPreviewStyleKey(nextKey)
                const matched = styleCatalog.find((s) => s.id === nextKey)
                setPreviewAllowPoseStyleShift(matched?.poseMode === 'adaptive')
              }}
            >
              <SelectTrigger className={`w-56 ${ADMIN_SELECT_CLS}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
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
        }
      >
        <pre className="whitespace-pre-wrap border border-zinc-200 bg-zinc-50 p-3.5 font-mono text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
          {samplePrompt}
        </pre>
      </AdminPanel>
    </div>
  )
}
