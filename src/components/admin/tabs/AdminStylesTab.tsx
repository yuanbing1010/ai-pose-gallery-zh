import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  FolderTreeIcon,
  ImageIcon,
  LayersIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TagIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchAdminSettingsApi,
  updateAdminSettingsApi,
  uploadAdminStylePreviewApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import { getStyleVisualMeta } from '@/lib/stylePresets'
import type {
  PlatformConfig,
  StyleCategoryItem,
  StylePoseMode,
  StylePresetItem,
  StyleSubcategoryItem,
} from '@/types/gallery'
import {
  NONE_STYLE_PRESET,
  getEffectiveStyleCatalog,
  getEffectiveStyleCategories,
  getEffectiveStyleSubcategories,
  normalizeStylePresetTaxonomy,
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
  ADMIN_DIALOG_CLS,
  ADMIN_INPUT_CLS,
  ADMIN_SELECT_CLS,
  ADMIN_TEXT_INPUT_CLS,
  type AdminConfirmAction,
} from '../auditHelpers'

interface StyleFormState {
  isNew: boolean
  id: string
  categoryId: string
  subcategoryId: string
  label: string
  shortLabel: string
  tagline: string
  poseMode: StylePoseMode
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

interface AdminStylesTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onConfirm: (action: AdminConfirmAction) => void
  onRefreshBootstrap: () => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
}

export function AdminStylesTab({
  reloadTick,
  onLoadingChange,
  onConfirm,
  onRefreshBootstrap,
  onDirtyChange,
}: AdminStylesTabProps) {
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig | null>(null)
  const [defaultStyleDraft, setDefaultStyleDraft] = useState<string>('none')

  const [focusedCategoryId, setFocusedCategoryId] = useState<'all' | string>('all')
  const [adminStyleCategoryFilter, setAdminStyleCategoryFilter] = useState<string>('all')
  const [adminStyleSubcategoryFilter, setAdminStyleSubcategoryFilter] = useState<string>('all')
  const [adminStyleQuery, setAdminStyleQuery] = useState('')
  const [expandAllPrompts, setExpandAllPrompts] = useState(false)
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

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const res = await fetchAdminSettingsApi()
      setPlatformCfg(res.platform)
      setDefaultStyleDraft(res.platform.defaultStylePreset || 'none')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载画风图鉴数据失败')
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

  const defaultStyleDirty = Boolean(
    platformCfg && defaultStyleDraft !== (platformCfg.defaultStylePreset || 'none')
  )

  useEffect(() => {
    onDirtyChange?.(defaultStyleDirty)
    return () => onDirtyChange?.(false)
  }, [defaultStyleDirty, onDirtyChange])

  if (!platformCfg) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="画风图鉴管理"
          description="正在加载画风分类与预设数据…"
        />
      </div>
    )
  }

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

  const syncSavedTaxonomyState = (nextPlatform: PlatformConfig) => {
    setDefaultStyleDraft(nextPlatform.defaultStylePreset || 'none')
    setPlatformCfg((prev) =>
      prev
        ? {
            ...prev,
            styleCategories: nextPlatform.styleCategories,
            styleSubcategories: nextPlatform.styleSubcategories,
            stylePresets: nextPlatform.stylePresets,
            defaultStylePreset: nextPlatform.defaultStylePreset,
          }
        : nextPlatform
    )
  }

  const persistStyleCatalog = async (
    nextPresets: StylePresetItem[],
    successMsg: string,
    options?: {
      defaultStylePreset?: string
      styleCategories?: StyleCategoryItem[]
      styleSubcategories?: StyleSubcategoryItem[]
    }
  ) => {
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
      syncSavedTaxonomyState(res.platform)
      await onRefreshBootstrap()
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
    setSavingTaxonomy(true)
    try {
      const res = await updateAdminSettingsApi({
        styleCategories: nextCategories,
        styleSubcategories: nextSubcategories,
        ...(nextPresetsOverride !== undefined ? { stylePresets: nextPresetsOverride } : {}),
      })
      syncSavedTaxonomyState(res.platform)
      await onRefreshBootstrap()
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

  const handleDeleteCategory = (cat: StyleCategoryItem) => {
    const subCount = styleSubcategories.filter((s) => s.categoryId === cat.id).length
    const styleCount = styleCatalog.filter((p) => p.categoryId === cat.id).length
    if (subCount > 0 || styleCount > 0) {
      toast.error(
        `大类「${cat.label}」下仍有 ${subCount} 个小类、${styleCount} 种画风，请先清空后再删除`
      )
      return
    }
    if (styleCategories.length <= 1 && styleCatalog.length > 0) {
      toast.error('请至少保留一个画风大类')
      return
    }
    onConfirm({
      title: `删除画风大类「${cat.label}」`,
      description: '确定永久删除此画风大类？该操作将实时同步到前端图鉴。',
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        const nextCategories = styleCategories.filter((c) => c.id !== cat.id)
        await persistStyleTaxonomy(
          nextCategories,
          styleSubcategories,
          `已删除大类「${cat.label}」`
        )
        if (focusedCategoryId === cat.id) {
          setFocusedCategoryId('all')
        }
      },
    })
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
      preferredCategoryId &&
      preferredCategoryId !== 'all' &&
      styleCategoryMap.has(preferredCategoryId)
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

  const handleDeleteSubcategory = (sub: StyleSubcategoryItem) => {
    const usedCount = styleCatalog.filter((p) => p.subcategoryId === sub.id).length
    if (usedCount > 0) {
      toast.error(
        `小类「${sub.label}」下仍有 ${usedCount} 种画风，请先将画风调整至其他小类后再删除`
      )
      return
    }
    onConfirm({
      title: `删除画风小类「${sub.label}」`,
      description: '确定永久删除此画风小类？',
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        const nextSubcategories = styleSubcategories.filter((s) => s.id !== sub.id)
        await persistStyleTaxonomy(
          styleCategories,
          nextSubcategories,
          `已删除小类「${sub.label}」`
        )
      },
    })
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
      toast.error('请先配置至少一个画风大类与小类')
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
      poseMode: 'strict',
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
      poseMode: item.poseMode === 'adaptive' ? 'adaptive' : 'strict',
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
    if (!styleForm) return
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
      ...(styleForm.poseMode === 'adaptive' ? { poseMode: 'adaptive' as const } : {}),
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
    setStyleDialogOpen(false)
  }

  const handleDeleteStyle = (item: StylePresetItem) => {
    onConfirm({
      title: `删除画风预设「${item.label}」`,
      description: '删除后该画风将立即从前台画风图鉴与工作台下线（对应示意图也会自动清理），确定删除？',
      confirmLabel: '确认删除',
      destructive: true,
      run: async () => {
        const nextPresets = styleCatalog.filter((s) => s.id !== item.id)
        await persistStyleCatalog(nextPresets, `已删除画风「${item.label}」`)
      },
    })
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
    <div className="space-y-6">
      <AdminPageHeader
        title="画风图鉴管理"
        description="动态管理「大类 → 小类 → 画风预设」层级结构，实时同步至工作台 3D 展台与画风图鉴。"
      />

      <AdminPanel
        title="全站默认画风预设"
        subtitle="新访客与未自选画风的会话默认加载此画风；已在本地修改过偏好的用户不受影响。"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <AdminField label="默认选用画风">
              <Select
                value={defaultStyleDraft}
                onValueChange={setDefaultStyleDraft}
              >
                <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
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
            </AdminField>
          </div>

          <div className="flex items-center gap-2">
            {defaultStyleDirty && <AdminBadge tone="warning">有未保存更改</AdminBadge>}
            <Button
              type="button"
              size="sm"
              className={ADMIN_BTN_CLS}
              disabled={savingStyle || !defaultStyleDirty}
              onClick={() =>
                void persistStyleCatalog(styleCatalog, '全站默认画风预设已保存', {
                  defaultStylePreset: defaultStyleDraft,
                })
              }
            >
              {savingStyle ? (
                <LoaderCircleIcon className="size-3.5 animate-spin" />
              ) : (
                <CheckIcon className="size-3.5" />
              )}
              保存默认画风
            </Button>
          </div>
        </div>
      </AdminPanel>

      <AdminPanel
        title={`画风大类与小类配置（共 ${styleCategories.length} 大类 · ${styleSubcategories.length} 小类）`}
        subtitle="统一定义画风层级；下方画风预设与前端图鉴均按 ID 引用。点选左侧大类可筛选右侧小类。"
        icon={<FolderTreeIcon className="size-3.5" />}
        headerRight={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={ADMIN_BTN_CLS}
              disabled={savingTaxonomy || savingStyle}
              onClick={openNewCategory}
            >
              <PlusIcon className="size-3.5" />
              新增大类
            </Button>
            <Button
              type="button"
              size="sm"
              className={ADMIN_BTN_CLS}
              disabled={savingTaxonomy || savingStyle || styleCategories.length === 0}
              onClick={() => openNewSubcategory()}
            >
              <PlusIcon className="size-3.5" />
              新增小类
            </Button>
          </>
        }
        padded={false}
      >
        <div className="grid divide-y divide-zinc-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0 dark:divide-zinc-800">
          <div className="lg:col-span-5">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/60 px-4 py-2 text-xs font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <LayersIcon className="size-3.5" />
                画风大类（{styleCategories.length}）
              </span>
              {effectiveFocusedCategoryId !== 'all' && (
                <button
                  type="button"
                  onClick={() => setFocusedCategoryId('all')}
                  className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-950 dark:hover:text-zinc-100"
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
                  const styleCount = styleCatalog.filter((p) => p.categoryId === cat.id).length
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
                        onClick={() => setFocusedCategoryId(focused ? 'all' : cat.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-bold">{cat.label}</span>
                          <span className="shrink-0 font-mono text-xs text-zinc-400">
                            {cat.id}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {subCount} 个小类 · {styleCount} 种画风
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`${ADMIN_BTN_SM_CLS} px-1.5`}
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
                          className={`${ADMIN_BTN_SM_CLS} px-1.5`}
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
                          className={`${ADMIN_BTN_SM_CLS} px-2`}
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
                          className={`${ADMIN_BTN_SM_CLS} px-1.5 text-red-600 hover:bg-red-500/10`}
                          disabled={savingTaxonomy}
                          title="删除大类"
                          onClick={() => handleDeleteCategory(cat)}
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

          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/60 px-4 py-2 text-xs font-bold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
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
                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-800 underline underline-offset-2 hover:text-zinc-950 dark:text-zinc-200"
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
                  const styleCount = styleCatalog.filter((p) => p.subcategoryId === sub.id).length

                  return (
                    <div
                      key={sub.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <AdminBadge tone="neutral">{parentCatLabel}</AdminBadge>
                          <span className="text-xs font-bold">{sub.label}</span>
                          <span className="font-mono text-xs text-zinc-400">{sub.id}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAdminStyleCategoryFilter(sub.categoryId)
                            setAdminStyleSubcategoryFilter(sub.id)
                          }}
                          className="mr-1 border border-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-600 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-200 dark:hover:text-zinc-100"
                          title="在下方画风列表中仅看此小类"
                        >
                          {styleCount} 画风
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`${ADMIN_BTN_SM_CLS} px-1.5`}
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
                          className={`${ADMIN_BTN_SM_CLS} px-1.5`}
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
                          className={`${ADMIN_BTN_SM_CLS} px-2`}
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
                          className={`${ADMIN_BTN_SM_CLS} px-1.5 text-red-600 hover:bg-red-500/10`}
                          disabled={savingTaxonomy}
                          title="删除小类"
                          onClick={() => handleDeleteSubcategory(sub)}
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
      </AdminPanel>

      <AdminPanel
        title={`画风预设管理（共 ${styleCatalog.length} 种）`}
        subtitle="支持按分类与关键词筛选、编辑正负面提示词与示意图。"
        headerRight={
          <Button
            type="button"
            size="sm"
            className={ADMIN_BTN_CLS}
            disabled={savingStyle || savingTaxonomy || styleSubcategories.length === 0}
            onClick={openNewStyle}
          >
            <PlusIcon className="size-3.5" />
            新增画风
          </Button>
        }
        padded={false}
      >
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
            <SelectTrigger className={`w-40 ${ADMIN_SELECT_CLS}`}>
              <SelectValue placeholder="全部大类" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
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
            <SelectTrigger className={`w-44 ${ADMIN_SELECT_CLS}`}>
              <SelectValue placeholder="全部小类" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
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

          <span className="font-mono text-xs text-zinc-500">
            {filteredStyleCatalog.length} / {styleCatalog.length}
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className={ADMIN_BTN_CLS}
            onClick={() => setExpandAllPrompts((v) => !v)}
          >
            {expandAllPrompts ? '精简词条预览' : '展开全部提示词'}
          </Button>

          {(effectiveAdminCatFilter !== 'all' ||
            effectiveAdminSubFilter !== 'all' ||
            normalizedAdminStyleQuery.length > 0) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={ADMIN_BTN_CLS}
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
            当前暂无预设画风，请先配置大类与小类后点击右上角「新增画风」。
          </div>
        ) : filteredStyleCatalog.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            当前筛选条件下暂无画风，请调整大类、小类或关键词筛选。
          </div>
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredStyleCatalog.map((item, fIdx) => {
              const visual = getStyleVisualMeta(item.id, item)
              const catLabel = styleCategoryMap.get(item.categoryId)?.label || item.categoryId
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
                        <AdminBadge tone="neutral">
                          {catLabel} / {subLabel}
                        </AdminBadge>
                        {item.poseMode === 'adaptive' && (
                          <AdminBadge
                            tone="info"
                            title="选中该画风时将自动开启「姿势适配」，允许微调局部动作与镜头机位"
                          >
                            姿势适配
                          </AdminBadge>
                        )}
                        {item.shortLabel && item.shortLabel !== item.label && (
                          <AdminBadge tone="neutral">短标：{item.shortLabel}</AdminBadge>
                        )}
                        {item.tagline?.trim() && (
                          <span className="truncate text-xs text-zinc-500">
                            · {item.tagline.trim()}
                          </span>
                        )}
                      </div>

                      <div
                        className={`text-xs leading-relaxed [overflow-wrap:anywhere] text-zinc-700 dark:text-zinc-300 ${
                          expandAllPrompts ? '' : 'line-clamp-2'
                        }`}
                      >
                        <span className="mr-1 font-bold text-zinc-500">风格：</span>
                        {effectivePrompt || <span className="text-zinc-400">（未配置）</span>}
                      </div>

                      {item.negativePrompt?.trim() && (
                        <div
                          className={`text-xs leading-relaxed [overflow-wrap:anywhere] text-amber-800 dark:text-amber-300 ${
                            expandAllPrompts ? '' : 'line-clamp-1'
                          }`}
                        >
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
                      className={`${ADMIN_BTN_SM_CLS} px-2`}
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
                      className={`${ADMIN_BTN_SM_CLS} px-2`}
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
                      className={ADMIN_BTN_SM_CLS}
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
                      className={`${ADMIN_BTN_SM_CLS} px-2 text-red-600 hover:bg-red-500/10`}
                      disabled={savingStyle}
                      title="删除画风"
                      onClick={() => handleDeleteStyle(item)}
                    >
                      <Trash2Icon className="size-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </AdminPanel>

      <Dialog open={styleDialogOpen} onOpenChange={setStyleDialogOpen}>
        <DialogContent className={`max-h-[90dvh] w-[95vw] max-w-2xl overflow-y-auto sm:max-w-2xl ${ADMIN_DIALOG_CLS}`}>
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
                <AdminField label="所属大类">
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
                    <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                      <SelectValue placeholder="选择大类" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {styleCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </AdminField>

                <AdminField
                  label="所属小类"
                  hint={
                    styleSubcategories.filter((s) => s.categoryId === styleForm.categoryId)
                      .length === 0 ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        当前大类下暂无小类，请先新建小类或切换其他大类。
                      </span>
                    ) : undefined
                  }
                >
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
                    <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                      <SelectValue placeholder="选择小类" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      {styleSubcategories
                        .filter((s) => s.categoryId === styleForm.categoryId)
                        .map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </AdminField>

                <AdminField label="画风标题" required>
                  <Input
                    value={styleForm.label}
                    onChange={(e) => setStyleForm({ ...styleForm, label: e.target.value })}
                    placeholder="例如：赛博朋克霓虹插画"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="卡片短标（可选）">
                  <Input
                    value={styleForm.shortLabel}
                    onChange={(e) => setStyleForm({ ...styleForm, shortLabel: e.target.value })}
                    placeholder="4字以内，留空默认使用画风标题"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>

                <AdminField label="一句话简介（可选）" className="sm:col-span-2">
                  <Input
                    value={styleForm.tagline}
                    onChange={(e) => setStyleForm({ ...styleForm, tagline: e.target.value })}
                    placeholder="例如：高对比霓虹光影 · 未来都市质感"
                    className={ADMIN_TEXT_INPUT_CLS}
                  />
                </AdminField>

                <AdminField
                  label="姿势与机位策略"
                  hint="自拍、对镜自拍、第一人称POV、监控摄像头等建议设为「姿势适配」，选定后将自动放宽手部持机与机位限制。"
                  className="sm:col-span-2"
                >
                  <Select
                    value={styleForm.poseMode}
                    onValueChange={(v) =>
                      setStyleForm({
                        ...styleForm,
                        poseMode: v === 'adaptive' ? 'adaptive' : 'strict',
                      })
                    }
                  >
                    <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="strict">
                        严格锁定（默认）— 动作、头部朝向与镜头景别严格以姿势图为准
                      </SelectItem>
                      <SelectItem value="adaptive">
                        姿势适配（推荐用于自拍/POV/监控）— 保留核心动态，允许为配合机位与手持动作微调
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </AdminField>
              </div>

              <div className="space-y-2 border border-zinc-200 p-3.5 dark:border-zinc-800">
                <label className="block font-bold">画风示意图</label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {styleForm.previewUrl.trim() ? (
                    <img
                      src={styleForm.previewUrl.trim()}
                      alt={styleForm.label || '示意图预览'}
                      className="h-24 w-18 shrink-0 border border-zinc-200 object-cover object-top dark:border-zinc-800"
                    />
                  ) : (
                    <div className="flex h-24 w-18 shrink-0 items-center justify-center border border-dashed border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
                      <ImageIcon className="size-5" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={ADMIN_BTN_CLS}
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
                          className={`${ADMIN_BTN_CLS} text-red-600 hover:bg-red-500/10`}
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
                      className={ADMIN_INPUT_CLS}
                    />
                    <p className="text-xs text-zinc-500">
                      上传后将持久化至云端存储，并在用户端「合成台」与「使用指南」画风轮盘实时展示。
                    </p>
                  </div>
                </div>
              </div>

              <AdminField label="风格提示词" required>
                <Textarea
                  rows={3}
                  value={styleForm.prompt}
                  onChange={(e) => setStyleForm({ ...styleForm, prompt: e.target.value })}
                  placeholder="输入该画风的核心风格描述（将写入「• 风格：」之后）"
                  className="rounded-none font-mono text-xs"
                />
              </AdminField>

              <AdminField label="画风专属负面提示词（可选）">
                <Textarea
                  rows={2}
                  value={styleForm.negativePrompt}
                  onChange={(e) =>
                    setStyleForm({ ...styleForm, negativePrompt: e.target.value })
                  }
                  placeholder="例如：写实皮肤毛孔，摄影噪点（生成时将与「全局负面提示词」自动合并放入「避免：」之后）"
                  className="rounded-none font-mono text-xs"
                />
              </AdminField>

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Button
                  variant="outline"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() => setStyleDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className={ADMIN_BTN_CLS}
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

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className={`w-[94vw] max-w-md ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {categoryForm?.isNew ? '新增画风大类' : '编辑画风大类'}
            </DialogTitle>
          </DialogHeader>
          {categoryForm && (
            <div className="space-y-4 pt-2 text-xs">
              <AdminField label="大类标识 ID">
                <Input
                  value={categoryForm.id}
                  disabled
                  className={`${ADMIN_INPUT_CLS} bg-zinc-50 dark:bg-zinc-900`}
                />
              </AdminField>

              <AdminField label="大类名称" required>
                <Input
                  value={categoryForm.label}
                  onChange={(e) => setCategoryForm({ ...categoryForm, label: e.target.value })}
                  placeholder="例如：动画、写实摄影、插画漫画"
                  className={ADMIN_TEXT_INPUT_CLS}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !savingTaxonomy) {
                      e.preventDefault()
                      void handleSaveCategory()
                    }
                  }}
                />
              </AdminField>

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() => setCategoryDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={ADMIN_BTN_CLS}
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

      <Dialog open={subcategoryDialogOpen} onOpenChange={setSubcategoryDialogOpen}>
        <DialogContent className={`w-[94vw] max-w-md ${ADMIN_DIALOG_CLS}`}>
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              {subcategoryForm?.isNew ? '新增画风小类' : '编辑画风小类'}
            </DialogTitle>
          </DialogHeader>
          {subcategoryForm && (
            <div className="space-y-4 pt-2 text-xs">
              <AdminField label="小类标识 ID">
                <Input
                  value={subcategoryForm.id}
                  disabled
                  className={`${ADMIN_INPUT_CLS} bg-zinc-50 dark:bg-zinc-900`}
                />
              </AdminField>

              <AdminField
                label="所属大类"
                hint={
                  !subcategoryForm.isNew
                    ? '若更改所属大类，引用该小类的画风预设也会自动跟随归属到新的大类。'
                    : undefined
                }
              >
                <Select
                  value={subcategoryForm.categoryId}
                  onValueChange={(v) =>
                    setSubcategoryForm({ ...subcategoryForm, categoryId: v })
                  }
                >
                  <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
                    <SelectValue placeholder="选择所属大类" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {styleCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </AdminField>

              <AdminField label="小类名称" required>
                <Input
                  value={subcategoryForm.label}
                  onChange={(e) =>
                    setSubcategoryForm({ ...subcategoryForm, label: e.target.value })
                  }
                  placeholder="例如：日系2D动画、欧美2D动画、定格动画"
                  className={ADMIN_TEXT_INPUT_CLS}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !savingTaxonomy) {
                      e.preventDefault()
                      void handleSaveSubcategory()
                    }
                  }}
                />
              </AdminField>

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  onClick={() => setSubcategoryDialogOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={ADMIN_BTN_CLS}
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
    </div>
  )
}
