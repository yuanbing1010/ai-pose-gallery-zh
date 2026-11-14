import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CodeXmlIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FileUpIcon,
  LoaderCircleIcon,
  LogOutIcon,
  RotateCcwIcon,
  ScanSearchIcon,
} from 'lucide-react'
import { toast } from '@/lib/notifications'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { ComfyConnectionStatus } from '@/components/studio/ComfyConnectionStatus'
import { WorkflowParameters } from '@/components/studio/WorkflowParameters'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { applyWorkflowOverrides, workflowIdentity } from '@/lib/comfyWorkflowParameters'
import {
  autoDetectComfyMappings,
  buildRecipePrompt,
  type ComfyCheckResult,
  type ComfyPresetId,
  checkComfyWorkflow,
  COMFYUI_WORKFLOW_TEMPLATES,
  detectComfyUi,
  fetchComfyObjectInfo,
  parseComfyWorkflowNodes,
  PROVIDER_META,
  STYLE_PRESETS,
} from '@/services/aiGenerator'
import { useStudio } from '@/store/studioStore'
import { COMFY_CONNECTION_LABELS } from '@/store/useComfyConnection'
import type {
  ComfyUiParams,
  DoubaoParams,
  GeminiParams,
  GptParams,
  ImagePassMode,
  ImageProviderId,
  QwenParams,
} from '@/types/gallery'

export const Route = createFileRoute('/admin/')({
  staticData: { title: '管理端控制台' },
  component: AdminHomePage,
})

type AdminTab = 'overview' | 'api' | 'nsfw' | 'prompt'
const PROVIDER_ORDER: ImageProviderId[] = ['gemini', 'gpt', 'qwen', 'doubao', 'comfyui']

function AdminHomePage() {
  const navigate = useNavigate()
  const {
    apiConfig,
    updateApiConfig,
    updateProviderConfig,
    updateGptParams,
    updateGeminiParams,
    updateQwenParams,
    updateDoubaoParams,
    updateComfyUiParams,
    comfyConnection,
    safeMode,
    toggleSafeMode,
    recipe,
  } = useStudio()

  const [tab, setTab] = useState<AdminTab>('api')
  const [showKey, setShowKey] = useState(false)
  const [testingComfy, setTestingComfy] = useState(false)
  const [comfyCheck, setComfyCheck] = useState<(ComfyCheckResult & { info?: string }) | null>(null)
  const [checkingComfy, setCheckingComfy] = useState(false)
  const [showComfyJsonModal, setShowComfyJsonModal] = useState(false)
  const comfyFileInputRef = useRef<HTMLInputElement | null>(null)

  const pid = apiConfig.activeProvider
  const meta = PROVIDER_META[pid]
  const pCfg = apiConfig.providers[pid]

  const parsedComfyNodes = useMemo(
    () => parseComfyWorkflowNodes(apiConfig.comfyuiParams.workflowJson),
    [apiConfig.comfyuiParams.workflowJson]
  )

  const handleSelectComfyPreset = (preset: ComfyUiParams['workflowPreset']) => {
    setComfyCheck(null)
    if (preset === 'custom') {
      updateComfyUiParams({ workflowPreset: 'custom' })
      return
    }
    const tpl = COMFYUI_WORKFLOW_TEMPLATES[preset]
    updateComfyUiParams({
      workflowPreset: preset,
      workflowJson: JSON.stringify(tpl.workflow, null, 2),
      ...tpl.defaults,
    })
    toast.success(`已切换为：${tpl.label}`)
  }

  const handleCheckComfy = async () => {
    setCheckingComfy(true)
    setComfyCheck(null)
    try {
      const cfg = apiConfig.providers.comfyui
      const found = await detectComfyUi(cfg.baseUrl, cfg.apiKey)
      if (!found) {
        setComfyCheck({
          ok: false,
          errors: [
            `未找到可用的 ComfyUI 服务（已尝试：${cfg.baseUrl || '默认地址'}、127.0.0.1:8000、127.0.0.1:8188）。请确认 ComfyUI 已启动，并检查跨域 (CORS) 设置。`,
          ],
          warnings: [],
          fixes: [],
        })
        return
      }
      if (found.baseUrl !== cfg.baseUrl.trim().replace(/\/+$/, '')) {
        updateProviderConfig('comfyui', { baseUrl: found.baseUrl })
        toast.success(`已自动识别 ComfyUI 地址：${found.baseUrl}`)
      }
      const cp = apiConfig.comfyuiParams
      const result = await checkComfyWorkflow(found.baseUrl, cfg.apiKey, cp.workflowJson, [
        cp.portraitNodeId,
        cp.costumeNodeId,
        cp.poseNodeId,
        cp.stitchedNodeId,
      ])
      setComfyCheck({ ...result, info: `${found.info}（${found.baseUrl}）` })
    } catch (e) {
      setComfyCheck({ ok: false, errors: [e instanceof Error ? e.message : '检测失败'], warnings: [], fixes: [] })
    } finally {
      setCheckingComfy(false)
    }
  }

  const handleComfyFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const info = parseComfyWorkflowNodes(text)
      if (!info.valid) {
        toast.error(info.error || '工作流 JSON 无效')
        return
      }
      const detected = autoDetectComfyMappings(text)
      setComfyCheck(null)
      updateComfyUiParams({
        workflowPreset: 'custom',
        workflowJson: text,
        ...detected,
      })
      toast.success(`已导入工作流：识别到 ${info.imageNodes.length} 个图片节点、${info.promptNodes.length} 个提示词节点`)
    } catch {
      toast.error('读取 JSON 文件失败')
    }
  }

  const handleExportComfyJson = async (original = false) => {
    try {
      const cp = apiConfig.comfyuiParams
      const schemas =
        !original && cp.parameterOverrides?.workflowId === workflowIdentity(cp.workflowJson)
          ? await fetchComfyObjectInfo(pCfg.baseUrl, pCfg.apiKey, cp.workflowJson)
          : undefined
      const wf = JSON.parse(
        original ? cp.workflowJson : applyWorkflowOverrides(cp.workflowJson, cp.parameterOverrides, schemas)
      )
      const blob = new Blob([JSON.stringify(wf, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      a.download = `comfyui-workflow-${stamp}.api.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('已导出 ComfyUI API 工作流 JSON')
    } catch {
      toast.error('当前工作流 JSON 格式有误，无法导出')
    }
  }

  useEffect(() => {
    if (sessionStorage.getItem('pose_atlas_admin_auth') !== '1') {
      void navigate({ to: '/admin/login' })
    }
  }, [navigate])

  const handleLogout = () => {
    sessionStorage.removeItem('pose_atlas_admin_auth')
    void navigate({ to: '/admin/login' })
  }

  const handleDetectComfy = async () => {
    setTestingComfy(true)
    try {
      const found = await detectComfyUi(pCfg.baseUrl, pCfg.apiKey)
      if (!found) {
        toast.error('未找到可用的 ComfyUI（已尝试当前地址、127.0.0.1:8000、127.0.0.1:8188），请确认已启动并检查跨域设置', {
          duration: 10000,
        })
        return
      }
      updateProviderConfig('comfyui', { baseUrl: found.baseUrl })
      toast.success(`已识别：${found.info}（${found.baseUrl}）`)
    } finally {
      setTestingComfy(false)
    }
  }

  const navItems: Array<{ id: AdminTab; code: string; label: string; tag: string }> = [
    { id: 'overview', code: '00', label: '管理端总览', tag: '[SYS]' },
    { id: 'api', code: '01', label: 'API 接口配置', tag: `[${meta.shortName}]` },
    { id: 'nsfw', code: '02', label: 'NSFW 安全设置', tag: safeMode ? '[SFW]' : '[18+]' },
    { id: 'prompt', code: '03', label: '默认提示词设置', tag: '[TPL]' },
  ]

  const samplePrompt = buildRecipePrompt(
    recipe,
    apiConfig.stylePreset,
    [],
    {
      prefix: apiConfig.defaultPromptPrefix,
      suffix: apiConfig.defaultPromptSuffix,
    }
  )

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-white text-zinc-950 md:grid-cols-[235px_1fr] dark:bg-zinc-950 dark:text-zinc-50">
      {/* 瑞士纯血极简侧边栏 */}
      <aside className="flex flex-col justify-between border-b border-zinc-200 p-4 md:border-r md:border-b-0 dark:border-zinc-800">
        <div>
          <div className="border-b border-zinc-950 pb-3.5 font-mono text-xs font-bold dark:border-zinc-100">
            ADMIN // CONSOLE
            <div className="mt-1 font-normal text-xs text-zinc-600 dark:text-zinc-400">
              SWISS GRID SYSTEM v2.4
            </div>
          </div>

          <nav aria-label="管理端菜单" className="mt-4 font-mono text-xs">
            {navItems.map((item) => {
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex w-full items-center justify-between border-b border-zinc-200 py-2.5 text-left transition-colors dark:border-zinc-800 ${
                    active ? 'font-bold text-zinc-950 dark:text-white' : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  <span>
                    {item.code}. <span className="font-sans">{item.label}</span>
                  </span>
                  <span className={active ? 'bg-zinc-950 px-1.5 py-0.5 text-white dark:bg-zinc-100 dark:text-zinc-950' : ''}>
                    {item.tag}
                  </span>
                </button>
              )
            })}
          </nav>
        </div>

        <div className="space-y-2 border-t border-zinc-200 pt-3 font-mono text-xs dark:border-zinc-800">
          <Link
            to="/"
            className="flex w-full items-center justify-between border border-zinc-300 px-2.5 py-2 text-zinc-800 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-100"
          >
            <span>返回用户前端</span>
            <ArrowLeftIcon className="size-3.5" />
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center justify-between border border-zinc-300 px-2.5 py-2 text-zinc-800 transition-colors hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-100"
          >
            <span>退出登录</span>
            <LogOutIcon className="size-3.5" />
          </button>
        </div>
      </aside>

      {/* 右侧管理端工作区 */}
      <div className="flex min-w-0 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-6 font-mono text-xs dark:border-zinc-800">
          <span>
            DIRECTORY // {navItems.find((i) => i.id === tab)?.code}_{tab.toUpperCase()}
          </span>
          <div className="flex items-center gap-3">
            <span className="hidden text-zinc-600 sm:inline dark:text-zinc-400">
              [ADMIN: AUTHENTICATED]
            </span>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-6">
          {/* 00. 管理端总览 */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <h1 className="text-xl font-bold tracking-tight">系统配置总览</h1>
                <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  所有 API 密钥、NSFW 安全策略与默认提示词均在管理端统一配置并即时同步至用户前端。
                </p>
              </div>

              <div className="grid gap-0 divide-x divide-y divide-zinc-200 border border-zinc-200 sm:grid-cols-3 sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setTab('api')}
                  className="p-5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <div className="font-mono text-xs text-zinc-500">01 // ACTIVE_PROVIDER</div>
                  <div className="mt-2 text-lg font-bold">{meta.name}</div>
                  <div className="mt-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {pid === 'comfyui'
                      ? COMFY_CONNECTION_LABELS[comfyConnection.status]
                      : pCfg.apiKey.trim()
                        ? '[KEY: 已配置]'
                        : '[KEY: 未配置]'}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTab('nsfw')}
                  className="p-5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <div className="font-mono text-xs text-zinc-500">02 // CONTENT_SAFETY</div>
                  <div className="mt-2 text-lg font-bold">{safeMode ? 'SFW 安全模式' : '18+ 完整模式'}</div>
                  <div className="mt-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    {safeMode ? '已屏蔽性感/双人/内衣分类' : '已开放全部分类访问'}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTab('prompt')}
                  className="p-5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <div className="font-mono text-xs text-zinc-500">03 // DEFAULT_PROMPT</div>
                  <div className="mt-2 text-lg font-bold">
                    {STYLE_PRESETS[apiConfig.stylePreset]?.label || apiConfig.stylePreset}
                  </div>
                  <div className="mt-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    前缀 {apiConfig.defaultPromptPrefix?.trim() ? '已设' : '未设'} · 后缀 {apiConfig.defaultPromptSuffix?.trim() ? '已设' : '未设'}
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* 01. API 接口配置 */}
          {tab === 'api' && (
            <div className="space-y-6">
              <div className="border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <h1 className="text-xl font-bold tracking-tight">API 接口配置</h1>
                <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  配置当前激活的 AI 生图厂商接口与传输参数（密钥仅保存在当前浏览器 localStorage）。
                </p>
              </div>

              <div className="grid grid-cols-2 divide-x divide-y divide-zinc-200 border border-zinc-200 sm:grid-cols-5 sm:divide-y-0 dark:divide-zinc-800 dark:border-zinc-800">
                {PROVIDER_ORDER.map((id, idx) => {
                  const itemMeta = PROVIDER_META[id]
                  const isActive = pid === id
                  const hasKey =
                    id === 'comfyui'
                      ? Boolean(apiConfig.providers.comfyui.baseUrl.trim())
                      : Boolean(apiConfig.providers[id].apiKey.trim())
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => updateApiConfig({ activeProvider: id })}
                      className={`flex items-start justify-between p-3.5 text-left transition-colors ${
                        isActive
                          ? 'bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950'
                          : 'bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className={`block font-mono text-xs ${isActive ? 'opacity-70' : 'text-zinc-500'}`}>
                          0{idx + 1} // PROVIDER
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-bold">{itemMeta.name}</span>
                        <span className={`mt-1 block font-mono text-xs ${isActive ? 'opacity-85' : 'text-zinc-500'}`}>
                          {id === 'comfyui' ? COMFY_CONNECTION_LABELS[comfyConnection.status] : hasKey ? '[已配置]' : '[未配置]'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>

              {pid === 'comfyui' && <ComfyConnectionStatus />}

              <section className="border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="font-mono text-xs font-bold">{meta.name} · 连接配置</span>
                  <div className="flex items-center gap-2">
                    {pid === 'comfyui' && (
                      <Button variant="outline" size="sm" onClick={handleDetectComfy} disabled={testingComfy}>
                        <ScanSearchIcon className="size-3.5" />
                        自动识别
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <a href={meta.docUrl} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon className="size-3.5" />
                        文档
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        updateProviderConfig(pid, {
                          baseUrl: meta.defaultBaseUrl,
                          model: meta.models[0].value,
                        })
                        toast.success('已恢复默认')
                      }}
                    >
                      <RotateCcwIcon className="size-3.5" />
                      重置
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block font-mono text-xs font-bold">
                      {pid === 'comfyui' ? 'ComfyUI 地址 (Base URL)' : 'Base URL'}
                    </label>
                    <Input
                      type={pid === 'comfyui' ? 'text' : 'url'}
                      value={pCfg.baseUrl}
                      onChange={(e) => updateProviderConfig(pid, { baseUrl: e.target.value })}
                      placeholder={meta.defaultBaseUrl}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-mono text-xs font-bold">
                      {pid === 'comfyui' ? 'API Key（可选，本地留空）' : 'API Key'}
                    </label>
                    <div className="relative">
                      <Input
                        type={showKey ? 'text' : 'password'}
                        value={pCfg.apiKey}
                        onChange={(e) => updateProviderConfig(pid, { apiKey: e.target.value })}
                        placeholder={pid === 'comfyui' ? '本地无需填写，远程可填 Token' : '输入 API Key'}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                        onClick={() => setShowKey((s) => !s)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-500 hover:text-zinc-950"
                      >
                        {showKey ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                      </button>
                    </div>
                  </div>

                  {pid !== 'comfyui' && (
                    <div className="space-y-1.5">
                      <label className="block font-mono text-xs font-bold">默认模型 ID</label>
                      <Select value={pCfg.model} onValueChange={(v) => updateProviderConfig(pid, { model: v })}>
                        <SelectTrigger className="w-full font-mono text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {meta.models.map((m) => (
                            <SelectItem key={m.value} value={m.value} className="font-mono text-xs">
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {pid !== 'comfyui' && pCfg.model === 'custom' && (
                    <div className="space-y-1.5">
                      <label className="block font-mono text-xs font-bold">自定义模型 ID</label>
                      <Input
                        value={pCfg.customModel}
                        onChange={(e) => updateProviderConfig(pid, { customModel: e.target.value })}
                        placeholder={pid === 'doubao' ? 'ep-2026xxxx 或模型 ID' : '输入模型 ID'}
                        className="font-mono text-xs"
                      />
                    </div>
                  )}
                </div>
              </section>

              {pid === 'comfyui' && (
                <section className="border border-zinc-200 dark:border-zinc-800">
                  <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-xs font-bold dark:border-zinc-800 dark:bg-zinc-900">
                    ComfyUI 工作流模板与节点映射
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="space-y-2">
                      <label className="block font-mono text-xs font-bold">工作流模板 (API 格式)</label>
                      <Select
                        value={apiConfig.comfyuiParams.workflowPreset}
                        onValueChange={(v) => handleSelectComfyPreset(v as ComfyUiParams['workflowPreset'])}
                      >
                        <SelectTrigger className="w-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(COMFYUI_WORKFLOW_TEMPLATES) as ComfyPresetId[]).map((key) => (
                            <SelectItem key={key} value={key} className="text-xs">
                              {COMFYUI_WORKFLOW_TEMPLATES[key].label}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom" className="text-xs">
                            自定义工作流 (已导入 JSON)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <input
                          ref={comfyFileInputRef}
                          type="file"
                          accept=".json,application/json"
                          onChange={handleComfyFileUpload}
                          className="hidden"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => comfyFileInputRef.current?.click()}>
                          <FileUpIcon className="size-3.5" />
                          导入 .json
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowComfyJsonModal(true)}>
                          <CodeXmlIcon className="size-3.5" />
                          编辑 JSON
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleExportComfyJson()}>
                          <DownloadIcon className="size-3.5" />
                          导出 .json
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={handleCheckComfy} disabled={checkingComfy}>
                          {checkingComfy ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <ScanSearchIcon className="size-3.5" />}
                          检测本机模型
                        </Button>
                      </div>
                    </div>

                    {comfyCheck && (
                      <div
                        className={`space-y-1 border px-3 py-2 text-xs leading-relaxed ${
                          comfyCheck.ok
                            ? 'border-emerald-500/40 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
                            : 'border-destructive/40 bg-destructive/10 text-destructive'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold">
                          {comfyCheck.ok ? <CircleCheckIcon className="size-3.5" /> : <CircleAlertIcon className="size-3.5" />}
                          {comfyCheck.ok ? '工作流与本机模型/节点匹配，可以生成' : '检测未通过'}
                        </div>
                        {comfyCheck.info && <div className="opacity-80">{comfyCheck.info}</div>}
                        {comfyCheck.errors.map((m, i) => (
                          <div key={`e${i}`} className="whitespace-pre-wrap break-all">• {m}</div>
                        ))}
                        {comfyCheck.fixes.map((m, i) => (
                          <div key={`f${i}`} className="break-all">✓ {m}</div>
                        ))}
                        {comfyCheck.warnings.map((m, i) => (
                          <div key={`w${i}`} className="break-all opacity-80">! {m}</div>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="block font-mono text-xs font-bold">人像图节点 (LoadImage)</label>
                        <Select
                          value={apiConfig.comfyuiParams.portraitNodeId}
                          onValueChange={(v) => updateComfyUiParams({ portraitNodeId: v })}
                        >
                          <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不绑定</SelectItem>
                            {parsedComfyNodes.imageNodes.map((n) => (
                              <SelectItem key={n.id} value={n.id} className="text-xs">#{n.id} {n.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-mono text-xs font-bold">服装图节点 (LoadImage)</label>
                        <Select
                          value={apiConfig.comfyuiParams.costumeNodeId}
                          onValueChange={(v) => updateComfyUiParams({ costumeNodeId: v })}
                        >
                          <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不绑定</SelectItem>
                            {parsedComfyNodes.imageNodes.map((n) => (
                              <SelectItem key={n.id} value={n.id} className="text-xs">#{n.id} {n.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-mono text-xs font-bold">姿势图节点 (LoadImage)</label>
                        <Select
                          value={apiConfig.comfyuiParams.poseNodeId}
                          onValueChange={(v) => updateComfyUiParams({ poseNodeId: v })}
                        >
                          <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">不绑定</SelectItem>
                            {parsedComfyNodes.imageNodes.map((n) => (
                              <SelectItem key={n.id} value={n.id} className="text-xs">#{n.id} {n.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-mono text-xs font-bold">正向提示词节点 (Prompt)</label>
                        <Select
                          value={apiConfig.comfyuiParams.promptNodeId}
                          onValueChange={(v) => updateComfyUiParams({ promptNodeId: v })}
                        >
                          <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">保留工作流原提示词</SelectItem>
                            {parsedComfyNodes.promptNodes.map((n) => (
                              <SelectItem key={n.id} value={n.id} className="text-xs">#{n.id} {n.title} ({n.field})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-mono text-xs font-bold">最长等待时间（秒）</label>
                        <Input
                          type="number"
                          min={60}
                          step={60}
                          value={apiConfig.comfyuiParams.timeoutSec}
                          onChange={(e) => updateComfyUiParams({ timeoutSec: Math.max(60, Number(e.target.value) || 600) })}
                          className="text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block font-mono text-xs font-bold">随机种子 (seed)</label>
                        <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            {apiConfig.comfyuiParams.randomizeSeed ? '每次随机种子' : '固定工作流种子'}
                          </span>
                          <Switch
                            checked={apiConfig.comfyuiParams.randomizeSeed}
                            onCheckedChange={(v) => updateComfyUiParams({ randomizeSeed: v })}
                          />
                        </div>
                      </div>
                    </div>

                    <WorkflowParameters onPreview={() => {}} onUploadingChange={() => {}} />
                  </div>
                </section>
              )}

              {pid !== 'comfyui' && (
                <section className="border border-zinc-200 dark:border-zinc-800">
                  <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-xs font-bold dark:border-zinc-800 dark:bg-zinc-900">
                    协议专属高级参数与全局传输选项
                  </div>
                  <div className="grid gap-4 p-5 sm:grid-cols-2">
                    {pid === 'gemini' && (
                      <>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">Gemini 协议模式</label>
                          <Select
                            value={apiConfig.geminiParams.endpointMode}
                            onValueChange={(v) => updateGeminiParams({ endpointMode: v as GeminiParams['endpointMode'] })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="native">Native (:generateContent)</SelectItem>
                              <SelectItem value="openai_chat">OpenAI Chat (/v1/chat/completions)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">宽高比 (aspectRatio)</label>
                          <Select
                            value={apiConfig.geminiParams.aspectRatio}
                            onValueChange={(v) => updateGeminiParams({ aspectRatio: v as GeminiParams['aspectRatio'] })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3:4">3:4</SelectItem>
                              <SelectItem value="9:16">9:16</SelectItem>
                              <SelectItem value="1:1">1:1</SelectItem>
                              <SelectItem value="4:3">4:3</SelectItem>
                              <SelectItem value="16:9">16:9</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">分辨率 (imageSize)</label>
                          <Select
                            value={apiConfig.geminiParams.imageSize}
                            onValueChange={(v) => updateGeminiParams({ imageSize: v as GeminiParams['imageSize'] })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1K">1K</SelectItem>
                              <SelectItem value="2K">2K</SelectItem>
                              <SelectItem value="4K">4K</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {pid === 'gpt' && (
                      <>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">调用端点</label>
                          <Select
                            value={apiConfig.gptParams.endpointMode}
                            onValueChange={(v) => updateGptParams({ endpointMode: v as GptParams['endpointMode'] })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="images_edits_json">/v1/images/edits (JSON)</SelectItem>
                              <SelectItem value="responses">/v1/responses</SelectItem>
                              <SelectItem value="chat">/v1/chat/completions</SelectItem>
                              <SelectItem value="images_edits">/v1/images/edits (Multipart)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">输出尺寸</label>
                          <Select
                            value={apiConfig.gptParams.size}
                            onValueChange={(v) => updateGptParams({ size: v as GptParams['size'] })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1024x1536">1024x1536</SelectItem>
                              <SelectItem value="1024x1024">1024x1024</SelectItem>
                              <SelectItem value="1536x1024">1536x1024</SelectItem>
                              <SelectItem value="auto">auto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">渲染质量</label>
                          <Select
                            value={apiConfig.gptParams.quality}
                            onValueChange={(v) => updateGptParams({ quality: v as GptParams['quality'] })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
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
                      </>
                    )}

                    {pid === 'qwen' && (
                      <>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">输出尺寸</label>
                          <Select
                            value={apiConfig.qwenParams.size}
                            onValueChange={(v) => updateQwenParams({ size: v as QwenParams['size'] })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1024*1536">1024*1536</SelectItem>
                              <SelectItem value="928*1664">928*1664</SelectItem>
                              <SelectItem value="1328*1328">1328*1328</SelectItem>
                              <SelectItem value="1664*928">1664*928</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">反向提示词</label>
                          <Input
                            value={apiConfig.qwenParams.negativePrompt}
                            onChange={(e) => updateQwenParams({ negativePrompt: e.target.value })}
                            placeholder="低分辨率，多余手指，扭曲"
                            className="text-xs"
                          />
                        </div>
                      </>
                    )}

                    {pid === 'doubao' && (
                      <>
                        <div className="space-y-1.5">
                          <label className="block font-mono text-xs font-bold">输出尺寸</label>
                          <Select
                            value={apiConfig.doubaoParams.size}
                            onValueChange={(v) => updateDoubaoParams({ size: v as DoubaoParams['size'] })}
                          >
                            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1728x2304">1728x2304</SelectItem>
                              <SelectItem value="2K">2K</SelectItem>
                              <SelectItem value="4K">4K</SelectItem>
                              <SelectItem value="1440x2560">1440x2560</SelectItem>
                              <SelectItem value="2048x2048">2048x2048</SelectItem>
                              <SelectItem value="2560x1440">2560x1440</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    <div className="space-y-1.5">
                      <label className="block font-mono text-xs font-bold">参考图传参方式</label>
                      <Select
                        value={apiConfig.imagePassMode}
                        onValueChange={(v) => updateApiConfig({ imagePassMode: v as ImagePassMode })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="url">传递图片 URL（免上传文件，推荐）</SelectItem>
                          <SelectItem value="base64">转 Base64 编码传输</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block font-mono text-xs font-bold">服务端 CORS 代理 (/api/proxy)</label>
                      <div className="flex h-9 items-center justify-between border border-zinc-200 px-3 dark:border-zinc-800">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">
                          {apiConfig.useProxy ? '已启用（解决跨域限制）' : '已关闭（浏览器直连）'}
                        </span>
                        <Switch
                          checked={apiConfig.useProxy}
                          onCheckedChange={(v) => updateApiConfig({ useProxy: v })}
                        />
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <div className="flex justify-end">
                <Button size="sm" onClick={() => toast.success('API 配置已保存')}>
                  <CheckIcon className="size-4" />
                  保存配置
                </Button>
              </div>
            </div>
          )}

          {/* 02. NSFW 内容安全设置 */}
          {tab === 'nsfw' && (
            <div className="space-y-6">
              <div className="border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <h1 className="text-xl font-bold tracking-tight">NSFW 内容安全设置</h1>
                <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  控制用户前端是否展示成人向 18+ 素体姿势与内衣穿搭分类，以及随机抽取池范围。
                </p>
              </div>

              <div className="border border-zinc-200 p-6 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="font-mono text-xs font-bold text-zinc-500">SAFE_MODE_CONTROL</div>
                    <h2 className="mt-1 text-base font-bold">
                      当前状态：{safeMode ? '安全模式 (SFW) 已开启' : '18+ 完整图库已解锁'}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      开启后，用户前端将自动隐藏「全身单人・性感系 (399)」「双人缠绵 (275)」「内衣・睡衣 (199)」「性感穿搭 (140)」。
                    </p>
                  </div>
                  <Button
                    variant={safeMode ? 'default' : 'outline'}
                    onClick={toggleSafeMode}
                  >
                    {safeMode ? '申请解锁 18+ 完整图库' : '立即切回安全模式 (SFW)'}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 03. 默认提示词与画风预设 */}
          {tab === 'prompt' && (
            <div className="space-y-6">
              <div className="border-b border-zinc-950 pb-3 dark:border-zinc-100">
                <h1 className="text-xl font-bold tracking-tight">默认提示词与画风预设</h1>
                <p className="mt-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  统一设置用户前端「合成台」与「一键复制提示词」的默认画风及全局前后缀指令。
                </p>
              </div>

              <section className="space-y-4 border border-zinc-200 p-5 dark:border-zinc-800">
                <div className="space-y-1.5">
                  <label className="block font-mono text-xs font-bold">全局默认画风预设 (stylePreset)</label>
                  <Select
                    value={apiConfig.stylePreset}
                    onValueChange={(v) => updateApiConfig({ stylePreset: v })}
                  >
                    <SelectTrigger className="w-full sm:w-80">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STYLE_PRESETS).map(([key, info]) => (
                        <SelectItem key={key} value={key}>
                          {info.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="block font-mono text-xs font-bold">默认前置提示词 (Prefix)</label>
                    <Textarea
                      rows={3}
                      value={apiConfig.defaultPromptPrefix || ''}
                      onChange={(e) => updateApiConfig({ defaultPromptPrefix: e.target.value })}
                      placeholder="例如：masterpiece, best quality, 商业级角色立绘..."
                      className="font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block font-mono text-xs font-bold">默认后置提示词 (Suffix)</label>
                    <Textarea
                      rows={3}
                      value={apiConfig.defaultPromptSuffix || ''}
                      onChange={(e) => updateApiConfig({ defaultPromptSuffix: e.target.value })}
                      placeholder="例如：避免出现畸形手指、多余肢体、文字水印..."
                      className="font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  <div className="font-mono text-xs font-bold text-zinc-500">LIVE_PROMPT_PREVIEW · 实时效果预览</div>
                  <pre className="whitespace-pre-wrap border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs leading-relaxed dark:border-zinc-800 dark:bg-zinc-900">
                    {samplePrompt}
                  </pre>
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateApiConfig({
                        stylePreset: 'none',
                        defaultPromptPrefix: '',
                        defaultPromptSuffix: '',
                      })
                      toast.success('已恢复默认提示词配置')
                    }}
                  >
                    <RotateCcwIcon className="size-3.5" />
                    恢复默认
                  </Button>
                  <Button size="sm" onClick={() => toast.success('默认提示词配置已保存')}>
                    <CheckIcon className="size-4" />
                    保存提示词设置
                  </Button>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>

      <Dialog open={showComfyJsonModal} onOpenChange={setShowComfyJsonModal}>
        <DialogContent className="max-h-[90dvh] w-[95vw] max-w-3xl overflow-y-auto p-4 sm:max-w-3xl">
          <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pr-8">
            <DialogTitle className="text-base">ComfyUI API 工作流 JSON</DialogTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const info = parseComfyWorkflowNodes(apiConfig.comfyuiParams.workflowJson)
                if (!info.valid) {
                  toast.error(info.error || '工作流 JSON 无效')
                  return
                }
                const detected = autoDetectComfyMappings(apiConfig.comfyuiParams.workflowJson)
                updateComfyUiParams(detected)
                toast.success(`已自动重新识别节点：${info.imageNodes.length} 个图片节点、${info.promptNodes.length} 个提示词节点`)
              }}
            >
              自动识别节点
            </Button>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            请在 ComfyUI 设置中开启「启用开发模式选项」，点击菜单中的「导出 (API)」获取 JSON 并粘贴于下方。
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => void handleExportComfyJson(true)}>
            导出原始 API
          </Button>
          <Textarea
            value={apiConfig.comfyuiParams.workflowJson}
            onChange={(e) =>
              updateComfyUiParams({
                workflowPreset: 'custom',
                workflowJson: e.target.value,
              })
            }
            rows={18}
            className="font-mono text-xs leading-relaxed"
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
