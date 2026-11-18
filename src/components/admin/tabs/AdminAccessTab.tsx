import { useCallback, useEffect, useState } from 'react'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
} from 'lucide-react'
import { WechatIcon } from '@/components/auth/WechatIcon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  fetchAdminSettingsApi,
  fetchAdminWechatApi,
  updateAdminSettingsApi,
  updateAdminWechatApi,
} from '@/lib/apiClient'
import { toast } from '@/lib/notifications'
import type {
  AdminWechatConfigDTO,
  ImagePassMode,
  PlatformConfig,
} from '@/types/gallery'
import {
  NONE_STYLE_PRESET,
  getEffectiveStyleCatalog,
  getEffectiveStyleCategories,
  getEffectiveStyleSubcategories,
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
  ADMIN_INPUT_CLS,
  ADMIN_SELECT_CLS,
} from '../auditHelpers'

interface AdminAccessTabProps {
  reloadTick: number
  onLoadingChange: (loading: boolean) => void
  onRefreshBootstrap: () => Promise<void>
  onDirtyChange?: (dirty: boolean) => void
}

export function AdminAccessTab({
  reloadTick,
  onLoadingChange,
  onRefreshBootstrap,
  onDirtyChange,
}: AdminAccessTabProps) {
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig | null>(null)
  const [savedPlatformJson, setSavedPlatformJson] = useState('')
  const [savingPlatform, setSavingPlatform] = useState(false)

  const [wechatCfg, setWechatCfg] = useState<AdminWechatConfigDTO | null>(null)
  const [wechatExpanded, setWechatExpanded] = useState(false)
  const [wechatAppIdInput, setWechatAppIdInput] = useState('')
  const [wechatAppSecretInput, setWechatAppSecretInput] = useState('')
  const [wechatCallbackBaseInput, setWechatCallbackBaseInput] = useState('')
  const [wechatEnabledInput, setWechatEnabledInput] = useState(false)
  const [showWechatSecret, setShowWechatSecret] = useState(false)
  const [savingWechat, setSavingWechat] = useState(false)

  const loadData = useCallback(async () => {
    onLoadingChange(true)
    try {
      const [sRes, wRes] = await Promise.all([
        fetchAdminSettingsApi(),
        fetchAdminWechatApi(),
      ])
      setPlatformCfg(sRes.platform)
      setSavedPlatformJson(JSON.stringify(sRes.platform))
      setWechatCfg(wRes.wechat)
      setWechatEnabledInput(wRes.wechat.enabled)
      setWechatAppIdInput(wRes.wechat.appId)
      setWechatAppSecretInput('')
      setWechatCallbackBaseInput(wRes.wechat.callbackBaseUrl)
      setShowWechatSecret(false)
      if (wRes.wechat.enabled || wRes.wechat.appId || wRes.wechat.hasAppSecret) {
        setWechatExpanded(true)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载准入与生图策略失败')
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
  const wechatDirty = Boolean(
    wechatCfg &&
      (wechatEnabledInput !== wechatCfg.enabled ||
        wechatAppIdInput.trim() !== wechatCfg.appId ||
        wechatCallbackBaseInput.trim() !== wechatCfg.callbackBaseUrl ||
        wechatAppSecretInput.trim() !== '')
  )

  useEffect(() => {
    onDirtyChange?.(platformDirty || wechatDirty)
    return () => onDirtyChange?.(false)
  }, [platformDirty, wechatDirty, onDirtyChange])

  if (!platformCfg) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="准入与生图链路"
          description="正在加载平台策略配置…"
        />
      </div>
    )
  }

  const styleCategories = getEffectiveStyleCategories(platformCfg)
  const styleSubcategories = getEffectiveStyleSubcategories(platformCfg)
  const styleCategoryMap = new Map(styleCategories.map((c) => [c.id, c]))
  const styleSubcategoryMap = new Map(styleSubcategories.map((s) => [s.id, s]))
  const styleCatalog = getEffectiveStyleCatalog(platformCfg)

  const handleSavePlatform = async () => {
    setSavingPlatform(true)
    try {
      const res = await updateAdminSettingsApi({
        allowRegistration: platformCfg.allowRegistration,
        registerBonusCredits: platformCfg.registerBonusCredits,
        defaultStylePreset: platformCfg.defaultStylePreset,
        imagePassMode: platformCfg.imagePassMode,
        sendStitchedSheet: platformCfg.sendStitchedSheet,
      })
      setPlatformCfg(res.platform)
      setSavedPlatformJson(JSON.stringify(res.platform))
      await onRefreshBootstrap()
      toast.success('准入与生图链路配置已保存')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSavingPlatform(false)
    }
  }

  const handleSaveWechat = async () => {
    setSavingWechat(true)
    try {
      const res = await updateAdminWechatApi({
        enabled: wechatEnabledInput,
        appId: wechatAppIdInput.trim(),
        ...(wechatAppSecretInput.trim() ? { appSecret: wechatAppSecretInput.trim() } : {}),
        callbackBaseUrl: wechatCallbackBaseInput.trim(),
      })
      setWechatCfg(res.wechat)
      setWechatEnabledInput(res.wechat.enabled)
      setWechatAppIdInput(res.wechat.appId)
      setWechatAppSecretInput('')
      setWechatCallbackBaseInput(res.wechat.callbackBaseUrl)
      await onRefreshBootstrap()
      toast.success('微信扫码登录配置已保存')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存微信配置失败')
    } finally {
      setSavingWechat(false)
    }
  }

  const handleClearWechatSecret = async () => {
    setSavingWechat(true)
    try {
      const res = await updateAdminWechatApi({ clearAppSecret: true })
      setWechatCfg(res.wechat)
      setWechatAppSecretInput('')
      await onRefreshBootstrap()
      toast.success('已清除数据库中保存的 AppSecret')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '清除失败')
    } finally {
      setSavingWechat(false)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="准入与生图链路"
        description="统一管理用户注册开关、初始积分赠送、全站默认画风、参考图传参协议及可选第三方微信登录。"
      />

      <AdminPanel
        title="成员准入与全局生图链路"
        subtitle="关闭自助注册后，前端仅显示登录入口，由管理员在「01. 成员与积分」创建并分发账号；参考图传参策略全站通用。"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <AdminField label="开放访客自助注册">
            <div className="flex h-8 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                {platformCfg.allowRegistration
                  ? '允许访客自主注册'
                  : '已关闭（仅管理员可后台建号）'}
              </span>
              <Switch
                checked={platformCfg.allowRegistration}
                onCheckedChange={(v) =>
                  setPlatformCfg({ ...platformCfg, allowRegistration: v })
                }
              />
            </div>
          </AdminField>

          <AdminField label="新用户默认赠送积分">
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
              className={ADMIN_INPUT_CLS}
            />
          </AdminField>

          <AdminField label="全局默认画风预设">
            <Select
              value={platformCfg.defaultStylePreset}
              onValueChange={(v) =>
                setPlatformCfg({ ...platformCfg, defaultStylePreset: v })
              }
            >
              <SelectTrigger className={`w-full ${ADMIN_SELECT_CLS}`}>
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
          </AdminField>

          <AdminField label="全局参考图传参方式">
            <Select
              value={platformCfg.imagePassMode}
              onValueChange={(v) =>
                setPlatformCfg({
                  ...platformCfg,
                  imagePassMode: v as ImagePassMode,
                })
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

          <AdminField label="额外附带三合一拼图卡片" className="sm:col-span-2">
            <div className="flex h-8 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                开启后，生成请求将额外附带「姿势 + 服装 + 人像」三合一合成参考拼图
              </span>
              <Switch
                checked={platformCfg.sendStitchedSheet}
                onCheckedChange={(v) =>
                  setPlatformCfg({ ...platformCfg, sendStitchedSheet: v })
                }
              />
            </div>
          </AdminField>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          {platformDirty && <AdminBadge tone="warning">有未保存的准入 / 链路更改</AdminBadge>}
          <Button
            size="sm"
            className={ADMIN_BTN_CLS}
            disabled={savingPlatform}
            onClick={() => void handleSavePlatform()}
          >
            {savingPlatform ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : (
              <CheckIcon className="size-3.5" />
            )}
            保存准入与生图链路
          </Button>
        </div>
      </AdminPanel>

      {wechatCfg && (
        <AdminPanel
          title={
            <span className="inline-flex items-center gap-2">
              <WechatIcon className="size-4 text-[#07C160]" />
              <span>微信开放平台（网站应用）扫码登录（可选）</span>
            </span>
          }
          subtitle="仅拥有已认证企业/个体户微信开放平台网站应用时需要配置；关闭后仅保留账号密码登录与后台建号。"
          headerRight={
            <div className="flex items-center gap-2">
              <AdminBadge tone={wechatEnabledInput ? 'success' : 'neutral'}>
                {wechatEnabledInput ? '已启用' : '未启用'}
              </AdminBadge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={ADMIN_BTN_SM_CLS}
                onClick={() => setWechatExpanded((v) => !v)}
              >
                {wechatExpanded ? (
                  <>
                    <ChevronUpIcon className="size-3.5" />
                    收起配置
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="size-3.5" />
                    展开配置
                  </>
                )}
              </Button>
            </div>
          }
          padded={wechatExpanded}
        >
          {wechatExpanded && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <AdminField label="开启微信扫码登录">
                  <div className="flex h-8 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500">
                      {wechatEnabledInput
                        ? '前端登录弹窗展示微信扫码入口'
                        : '隐藏微信登录入口'}
                    </span>
                    <Switch
                      checked={wechatEnabledInput}
                      onCheckedChange={setWechatEnabledInput}
                    />
                  </div>
                </AdminField>

                <AdminField label="微信开放平台 AppID">
                  <Input
                    value={wechatAppIdInput}
                    onChange={(e) => setWechatAppIdInput(e.target.value)}
                    placeholder={
                      wechatCfg.hasEnvFallback
                        ? `留空使用环境变量兜底 (${wechatCfg.envAppIdHint})`
                        : '例如：wx1234567890abcdef'
                    }
                    className={ADMIN_INPUT_CLS}
                  />
                </AdminField>

                <AdminField
                  label={
                    <>
                      AppSecret{' '}
                      {wechatCfg.hasAppSecret && (
                        <span className="font-mono font-normal text-emerald-600 dark:text-emerald-400">
                          （已保存：{wechatCfg.appSecretHint}）
                        </span>
                      )}
                    </>
                  }
                  rightSlot={
                    wechatCfg.hasAppSecret ? (
                      <button
                        type="button"
                        disabled={savingWechat}
                        onClick={() => void handleClearWechatSecret()}
                        className="font-mono text-xs text-red-600 hover:underline dark:text-red-400"
                      >
                        清除库内密钥
                      </button>
                    ) : null
                  }
                >
                  <div className="relative">
                    <Input
                      type={showWechatSecret ? 'text' : 'password'}
                      value={wechatAppSecretInput}
                      onChange={(e) => setWechatAppSecretInput(e.target.value)}
                      placeholder={
                        wechatCfg.hasAppSecret
                          ? '留空则保持当前已加密密钥不变'
                          : '填入网站应用的 AppSecret'
                      }
                      className={`${ADMIN_INPUT_CLS} pr-9`}
                    />
                    <button
                      type="button"
                      aria-label={showWechatSecret ? '隐藏 AppSecret' : '显示 AppSecret'}
                      onClick={() => setShowWechatSecret((v) => !v)}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 text-zinc-500"
                    >
                      {showWechatSecret ? (
                        <EyeOffIcon className="size-3.5" />
                      ) : (
                        <EyeIcon className="size-3.5" />
                      )}
                    </button>
                  </div>
                </AdminField>

                <AdminField label="自定义回调基础地址（可选）">
                  <Input
                    value={wechatCallbackBaseInput}
                    onChange={(e) => setWechatCallbackBaseInput(e.target.value)}
                    placeholder={
                      typeof window !== 'undefined'
                        ? `留空默认当前域名：${window.location.origin}`
                        : 'https://your-domain.com'
                    }
                    className={ADMIN_INPUT_CLS}
                  />
                </AdminField>
              </div>

              {typeof window !== 'undefined' && (
                <div className="flex flex-wrap items-center justify-between gap-2 border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="space-y-0.5 text-zinc-600 dark:text-zinc-400">
                    <div>
                      开放平台「授权回调域」请填：
                      <span className="font-bold text-zinc-950 dark:text-zinc-100">
                        {wechatCallbackBaseInput.trim()
                          ? (() => {
                              try {
                                return new URL(wechatCallbackBaseInput.trim()).host
                              } catch {
                                return window.location.host
                              }
                            })()
                          : window.location.host}
                      </span>
                    </div>
                    <div className="truncate">
                      完整回调 URL：
                      {(wechatCallbackBaseInput.trim().replace(/\/+$/, '') ||
                        window.location.origin)}
                      /api/auth/wechat/callback
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={ADMIN_BTN_SM_CLS}
                    onClick={async () => {
                      const domain = (() => {
                        if (wechatCallbackBaseInput.trim()) {
                          try {
                            return new URL(wechatCallbackBaseInput.trim()).host
                          } catch {
                            return window.location.host
                          }
                        }
                        return window.location.host
                      })()
                      try {
                        await navigator.clipboard.writeText(domain)
                        toast.success(`已复制回调域名：${domain}`)
                      } catch {
                        toast.error('剪贴板复制失败')
                      }
                    }}
                  >
                    <CopyIcon className="size-3" />
                    <span>复制回调域</span>
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                {wechatDirty && <AdminBadge tone="warning">有未保存的微信登录更改</AdminBadge>}
                <Button
                  type="button"
                  size="sm"
                  className={ADMIN_BTN_CLS}
                  disabled={savingWechat}
                  onClick={() => void handleSaveWechat()}
                >
                  {savingWechat ? (
                    <LoaderCircleIcon className="size-3.5 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3.5" />
                  )}
                  保存微信登录配置
                </Button>
              </div>
            </div>
          )}
        </AdminPanel>
      )}
    </div>
  )
}
