import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { motion } from 'motion/react'
import {
  AlertCircleIcon,
  ApertureIcon,
  ArrowRightIcon,
  CameraIcon,
  CopyIcon,
  DicesIcon,
  DownloadIcon,
  GitBranchIcon,
  GroupIcon,
  ImageIcon,
  LayersIcon,
  LoaderCircleIcon,
  Paintbrush2Icon,
  RefreshCwIcon,
  Share2Icon,
  SparklesIcon,
  UngroupIcon,
  XIcon,
  ZoomInIcon,
} from 'lucide-react'
import {
  MechanicalCameraShutter,
  VermilionHankoStamp,
} from '@/components/motion/SkeuomorphicInstruments'
import { STUDIO_ASPECT_RATIOS } from '@/lib/artists'
import { downloadFileName, hasPoseDepthMap, poseThumbPath } from '@/lib/recipeImages'
import { playBrassDialTick, playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import { getEffectiveProfileCreditCost } from '../../../shared/studio'
import type {
  GenerationHistoryItem,
  ImageProviderId,
  ProviderModelPublicInfo,
  StudioAspectRatio,
  StudioResolution,
  StylePresetItem,
} from '@/types/gallery'
import {
  getNodeDimensions,
  resolveUpstreamInputs,
} from './canvasEngine'
import type {
  CanvasAssetNode,
  CanvasEdge,
  CanvasGroupNode,
  CanvasImageNode,
  CanvasNode,
  CanvasTextNode,
} from './types'

export interface FlatCanvasBrushOption {
  providerId: ImageProviderId
  profile: ProviderModelPublicInfo
}

export interface CanvasNodeCardProps {
  node: CanvasNode
  allNodes: CanvasNode[]
  allEdges: CanvasEdge[]
  selected: boolean
  isConnecting: boolean
  isValidDropTarget: boolean
  brushes: FlatCanvasBrushOption[]
  stylePresets: StylePresetItem[]
  onPointerDownNode: (e: ReactPointerEvent<HTMLDivElement>, node: CanvasNode) => void
  onStartWireFromOut: (e: ReactPointerEvent<HTMLButtonElement>, node: CanvasNode) => void
  onCompleteWireToIn: (e: ReactPointerEvent<HTMLButtonElement>, node: CanvasNode) => void
  onResizeGroupStart?: (e: ReactPointerEvent<HTMLDivElement>, group: CanvasGroupNode) => void
  onUpdateNode: (nodeId: string, patch: Partial<CanvasNode>) => void
  onDeleteNode: (nodeId: string) => void
  onDuplicateNode: (nodeId: string) => void
  onCycleTextPreset: (node: CanvasTextNode) => void
  onSpawnImageFromNode: (sourceNode: CanvasNode) => void
  onRunImageNode: (node: CanvasImageNode) => void
  onCancelImageNode: (nodeId: string) => void
  onUngroupNode: (groupId: string) => void
  onZoomImage: (url: string, title: string) => void
  onPublishJob: (job: GenerationHistoryItem) => void
  onOpenInpaint: (node: CanvasImageNode) => void
}

function PortHandle({
  side,
  activeTarget,
  title,
  onPointerDown,
  onPointerUp,
}: {
  side: 'in' | 'out'
  activeTarget?: boolean
  title: string
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (e: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      data-canvas-port={side}
      title={title}
      aria-label={title}
      onPointerDown={(e) => {
        e.stopPropagation()
        onPointerDown?.(e)
      }}
      onPointerUp={(e) => {
        e.stopPropagation()
        onPointerUp?.(e)
      }}
      style={{ top: '42%' }}
      className={cn(
        "absolute z-30 flex size-5 -translate-y-1/2 cursor-crosshair items-center justify-center rounded-full border-2 transition-transform before:absolute before:-inset-2.5 before:content-[''] hover:scale-125",
        side === 'in' ? '-left-2.5' : '-right-2.5',
        activeTarget
          ? 'scale-125 border-[#FDE68A] bg-[#D9381E] shadow-[0_2px_8px_rgba(0,0,0,0.45)]'
          : side === 'out'
            ? 'border-[#FAF8F2] bg-[#E5A918] shadow-[0_2px_6px_rgba(0,0,0,0.35)] dark:border-[#151412]'
            : 'border-[#FAF8F2] bg-[#19857B] shadow-[0_2px_6px_rgba(0,0,0,0.35)] dark:border-[#151412]'
      )}
    >
      <span className="size-1.5 rounded-full bg-white" />
    </button>
  )
}

export function CanvasNodeCard({
  node,
  allNodes,
  allEdges,
  selected,
  isConnecting,
  isValidDropTarget,
  brushes,
  stylePresets,
  onPointerDownNode,
  onStartWireFromOut,
  onCompleteWireToIn,
  onResizeGroupStart,
  onUpdateNode,
  onDeleteNode,
  onDuplicateNode,
  onCycleTextPreset,
  onSpawnImageFromNode,
  onRunImageNode,
  onCancelImageNode,
  onUngroupNode,
  onZoomImage,
  onPublishJob,
  onOpenInpaint,
}: CanvasNodeCardProps) {
  const [shutterTick, setShutterTick] = useState(0)
  const [stampTick, setStampTick] = useState(0)
  const [prevStatus, setPrevStatus] = useState(node.kind === 'image' ? node.status : 'idle')

  if (node.kind === 'image' && node.status !== prevStatus) {
    setPrevStatus(node.status)
    if (node.status === 'succeeded' && prevStatus === 'generating') {
      setStampTick((t) => t + 1)
    }
  }

  const dims = getNodeDimensions(node)

  /* ====================== 1. 编组容器节点（GROUP） ====================== */
  if (node.kind === 'group') {
    return (
      <div
        data-canvas-interactive="true"
        onPointerDown={(e) => onPointerDownNode(e, node)}
        style={{
          transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
          width: dims.width,
          height: dims.height,
        }}
        className={cn(
          'absolute top-0 left-0 z-0 cursor-grab rounded-[24px] border-2 border-dashed bg-[#E5A918]/[0.05] transition-colors active:cursor-grabbing dark:bg-[#E5A918]/[0.04]',
          selected
            ? 'border-[#E5A918] ring-2 ring-[#E5A918]/25'
            : 'border-[#E5A918]/45 hover:border-[#E5A918]/75'
        )}
      >
        <div className="flex items-center justify-between gap-2 rounded-t-[22px] border-b border-[#E5A918]/25 bg-[#E5A918]/12 px-3.5 py-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <GroupIcon className="size-3.5 shrink-0 text-[#B88300] dark:text-[#F5C443]" />
            <input
              value={node.title}
              onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
              className="min-w-0 flex-1 bg-transparent font-mono text-xs font-bold text-foreground outline-none"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              title="解散编组（保留组内节点）"
              onClick={() => onUngroupNode(node.id)}
              className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border border-border/80 bg-card/90 px-2 text-xs font-medium text-foreground hover:border-foreground/40"
            >
              <UngroupIcon className="size-3" />
              <span>拆组</span>
            </button>
            <button
              type="button"
              aria-label="删除编组"
              onClick={() => onDeleteNode(node.id)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        </div>

        <PortHandle
          side="out"
          title="拖动此端，将整组内所有文字与图片一次连给下游生图节点"
          onPointerDown={(e) => onStartWireFromOut(e, node)}
        />

        {/* 右下角尺寸缩放拉手 */}
        <div
          onPointerDown={(e) => {
            e.stopPropagation()
            onResizeGroupStart?.(e, node)
          }}
          title="拖动调整编组框尺寸"
          className="absolute right-2 bottom-2 flex size-5 cursor-nwse-resize items-center justify-center rounded-md border border-[#E5A918]/45 bg-card/85 font-mono text-xs text-[#8A5A00] dark:text-[#F5C443]"
        >
          ⤡
        </div>
      </div>
    )
  }

  /* ====================== 2. 文本 / 提示词节点（TEXT） ====================== */
  if (node.kind === 'text') {
    const accent =
      node.role === 'optics' ? '#E5A918' : node.role === 'atmos' ? '#19857B' : '#D9381E'

    return (
      <div
        data-canvas-interactive="true"
        onPointerDown={(e) => onPointerDownNode(e, node)}
        style={{
          transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
          width: dims.width,
        }}
        className={cn(
          'absolute top-0 left-0 cursor-grab rounded-[18px] border bg-card/96 p-3 shadow-[0_14px_30px_rgba(20,16,10,0.1)] backdrop-blur-md transition-[border-color] duration-150 active:cursor-grabbing dark:bg-[#191714]/96 dark:shadow-[0_18px_36px_rgba(0,0,0,0.58)]',
          selected
            ? 'z-20 border-[#E5A918] ring-2 ring-[#E5A918]/30'
            : 'z-10 border-border/90 hover:border-foreground/30',
          node.muted && 'opacity-60'
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-1.5 border-b border-border/75 pb-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <button
              type="button"
              title={node.muted ? '重新接通此节点' : '临时静音此节点'}
              onClick={() => {
                playMechanicalSwitch(node.muted ? 1.08 : 0.92)
                onUpdateNode(node.id, { muted: !node.muted })
              }}
              className="flex size-4 shrink-0 cursor-pointer items-center justify-center"
            >
              <span
                className="size-2.5 rounded-full transition-[transform,background-color] duration-150"
                style={{
                  backgroundColor: node.muted ? 'rgba(130,124,114,0.4)' : accent,
                  boxShadow: node.muted ? 'none' : `0 0 9px ${accent}`,
                }}
              />
            </button>
            <input
              value={node.title}
              aria-label="节点标题"
              onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
              className="min-w-0 flex-1 text-ellipsis bg-transparent font-mono text-xs font-bold text-foreground outline-none"
            />
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              aria-label="复制节点"
              onClick={() => onDuplicateNode(node.id)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <CopyIcon className="size-3" />
            </button>
            <button
              type="button"
              aria-label="删除节点"
              onClick={() => onDeleteNode(node.id)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        </div>

        <textarea
          rows={3}
          value={node.text}
          onChange={(e) => onUpdateNode(node.id, { text: e.target.value })}
          placeholder="输入主体、光影、氛围或画面修饰词…"
          className="min-h-[84px] w-full resize-none rounded-xl border border-border/80 bg-background/85 px-2.5 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-[#E5A918] sm:min-h-0"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {node.text.trim().length} 字
            </span>
            {(node.role === 'optics' || node.role === 'atmos') && (
              <button
                type="button"
                onClick={() => onCycleTextPreset(node)}
                title="切换下一档预设"
                className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-full border border-border bg-secondary/75 px-2 font-mono text-xs font-semibold text-foreground transition-[transform,border-color] duration-150 ease-[var(--ease-out)] hover:border-foreground/35 active:scale-[0.97]"
              >
                <DicesIcon className="size-3 text-[#D9381E]" />
                <span>换档</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSpawnImageFromNode(node)}
            className="inline-flex h-6.5 cursor-pointer items-center gap-1 rounded-full border border-border bg-secondary/70 px-2.5 text-xs font-semibold text-foreground transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-[#D9381E]/55 hover:text-[#D9381E] active:scale-[0.97]"
          >
            <SparklesIcon className="size-3 text-[#D9381E]" />
            <span>派生出图</span>
            <ArrowRightIcon className="size-3" />
          </button>
        </div>

        <PortHandle
          side="out"
          title="从此处拖线连接到任意出图节点左侧端口"
          onPointerDown={(e) => onStartWireFromOut(e, node)}
        />
      </div>
    )
  }

  /* ====================== 3. 参考素材节点（ASSET） ====================== */
  if (node.kind === 'asset') {
    const assetNode: CanvasAssetNode = node
    const canToggleDepth = assetNode.sourceKind === 'pose' && hasPoseDepthMap(assetNode.poseItem)
    const activeThumb =
      assetNode.sourceKind === 'pose' && assetNode.poseItem
        ? poseThumbPath(assetNode.poseItem, Boolean(assetNode.useDepth))
        : assetNode.thumbUrl

    return (
      <div
        data-canvas-interactive="true"
        onPointerDown={(e) => onPointerDownNode(e, node)}
        style={{
          transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
          width: dims.width,
        }}
        className={cn(
          'absolute top-0 left-0 cursor-grab rounded-[18px] border bg-card/96 p-2.5 shadow-[0_14px_30px_rgba(20,16,10,0.1)] backdrop-blur-md transition-[border-color] duration-150 active:cursor-grabbing dark:bg-[#191714]/96 dark:shadow-[0_18px_36px_rgba(0,0,0,0.58)]',
          selected
            ? 'z-20 border-[#2DD4BF] ring-2 ring-[#2DD4BF]/30'
            : 'z-10 border-border/90 hover:border-foreground/30',
          node.muted && 'opacity-60'
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-1.5 border-b border-border/75 pb-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              title={node.muted ? '重新接通此参考图' : '临时忽略此参考图'}
              onClick={() => {
                playMechanicalSwitch(node.muted ? 1.06 : 0.92)
                onUpdateNode(node.id, { muted: !node.muted })
              }}
              className="flex size-4 shrink-0 cursor-pointer items-center justify-center"
            >
              <span
                className="size-2.5 rounded-full transition-[transform,background-color] duration-150"
                style={{
                  backgroundColor: node.muted ? 'rgba(130,124,114,0.4)' : '#19857B',
                  boxShadow: node.muted ? 'none' : '0 0 9px #2DD4BF',
                }}
              />
            </button>
            <span className="truncate font-mono text-xs font-bold text-foreground">
              {assetNode.title}
            </span>
          </div>
          <button
            type="button"
            aria-label="删除参考节点"
            onClick={() => onDeleteNode(node.id)}
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>

        <div className="ed-mat group relative aspect-[4/3.6] w-full overflow-hidden rounded-xl p-1">
          <img
            src={activeThumb}
            alt={assetNode.caption}
            draggable={false}
            onClick={() => onZoomImage(assetNode.fullUrl || activeThumb, assetNode.caption)}
            className={cn(
              'size-full cursor-zoom-in rounded-lg',
              assetNode.contain || assetNode.sourceKind === 'pose'
                ? 'bg-[#121110] object-contain p-1'
                : 'object-cover object-top'
            )}
          />
          {canToggleDepth && (
            <button
              type="button"
              onClick={() => {
                playMechanicalSwitch(assetNode.useDepth ? 0.94 : 1.08)
                onUpdateNode(node.id, { useDepth: !assetNode.useDepth })
              }}
              className="absolute bottom-2 left-2 cursor-pointer rounded-full border border-[#E5A918]/50 bg-black/75 px-2 py-0.5 font-mono text-xs font-bold text-[#F5C443] backdrop-blur-md hover:bg-black"
            >
              {assetNode.useDepth ? '深度图 ⇄' : '白模 ⇄'}
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs font-semibold text-foreground">
            {assetNode.caption}
          </span>
          <button
            type="button"
            onClick={() => onSpawnImageFromNode(node)}
            className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-border bg-secondary/70 px-2 text-xs font-semibold text-foreground hover:border-[#19857B]"
          >
            <span>生图</span>
            <ArrowRightIcon className="size-3" />
          </button>
        </div>

        <PortHandle
          side="out"
          title="拖线连接到出图节点左侧端口作为参考图"
          onPointerDown={(e) => onStartWireFromOut(e, node)}
        />
      </div>
    )
  }

  /* ====================== 4. 生图 / 成品节点（IMAGE / RENDER） ====================== */
  const imgNode: CanvasImageNode = node
  const resolved = resolveUpstreamInputs(imgNode, allNodes, allEdges)

  // 解析当前节点选中的画笔（仅展示管理员配置的画笔名称，绝不暴露画师名）
  const activeBrush =
    brushes.find(
      (b) => b.providerId === imgNode.providerId && b.profile.profileId === imgNode.profileId
    ) ?? brushes[0]
  const activeResolution: StudioResolution | undefined =
    activeBrush?.profile.resolutions.find((r) => r.resolution === imgNode.resolution)?.resolution ??
    activeBrush?.profile.defaultResolution ??
    activeBrush?.profile.resolutions[0]?.resolution

  const creditCost = activeBrush
    ? getEffectiveProfileCreditCost(activeBrush.profile, activeResolution)
    : 0
  const isBusy = imgNode.status === 'generating' || imgNode.status === 'queued'

  const handleRunClick = () => {
    setShutterTick((t) => t + 1)
    onRunImageNode({
      ...imgNode,
      providerId: activeBrush?.providerId,
      profileId: activeBrush?.profile.profileId,
      resolution: activeResolution,
    })
  }

  return (
    <div
      data-canvas-interactive="true"
      onPointerDown={(e) => onPointerDownNode(e, node)}
      style={{
        transform: `translate3d(${node.x}px, ${node.y}px, 0)`,
        width: dims.width,
      }}
      className={cn(
        'ks-obsidian-stage dark absolute top-0 left-0 cursor-grab rounded-[22px] border p-3.5 text-[#F5F1E8] shadow-[0_24px_60px_rgba(0,0,0,0.52)] transition-[border-color] duration-150 active:cursor-grabbing',
        selected
          ? 'z-25 border-[#E5A918] ring-2 ring-[#E5A918]/35'
          : isValidDropTarget && isConnecting
            ? 'z-20 border-[#D9381E] ring-2 ring-[#D9381E]/40'
            : 'z-15 border-[#E5A918]/38'
      )}
    >
      <span
        aria-hidden="true"
        className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1px]"
      />

      {/* 左输入端 & 右输出端（成品图可继续向右连线衍生迭代！） */}
      <PortHandle
        side="in"
        activeTarget={isConnecting && isValidDropTarget}
        title="松开鼠标将上游提示词 / 参考图 / 成品图接入此生图节点"
        onPointerUp={(e) => onCompleteWireToIn(e, node)}
      />
      <PortHandle
        side="out"
        title="拖线将此节点的生成成品作为下游节点的参考图继续迭代"
        onPointerDown={(e) => onStartWireFromOut(e, node)}
      />

      {/* 节点顶条 */}
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <ApertureIcon className="size-3.5 shrink-0 text-[#E5A918]" />
          <input
            value={imgNode.title}
            onChange={(e) => onUpdateNode(node.id, { title: e.target.value })}
            className="min-w-0 flex-1 bg-transparent font-mono text-xs font-bold text-white outline-none"
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="复制此生图分支"
            title="复制分支做 A/B 对比"
            onClick={() => onDuplicateNode(node.id)}
            className="flex size-6 cursor-pointer items-center justify-center rounded-full text-[#C8C0B2] hover:bg-white/10 hover:text-white"
          >
            <CopyIcon className="size-3" />
          </button>
          <button
            type="button"
            aria-label="删除节点"
            onClick={() => onDeleteNode(node.id)}
            className="flex size-6 cursor-pointer items-center justify-center rounded-full text-[#C8C0B2] hover:bg-destructive/25 hover:text-rose-300"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      </div>

      {/* 上游接入信号条（实时展示接入了几张图、几段词） */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {resolved.previews.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-[#9C9486]">
            <LayersIcon className="size-3" />
            <span>可拖入左侧连线，或直接在下方写词</span>
          </span>
        ) : (
          <>
            {resolved.previews.slice(0, 5).map((p) =>
              p.thumbUrl ? (
                <img
                  key={p.nodeId}
                  src={p.thumbUrl}
                  alt={p.label}
                  title={`已接入参考：${p.label}`}
                  className="size-6 rounded-md border border-[#E5A918]/45 object-cover"
                />
              ) : (
                <span
                  key={p.nodeId}
                  className="max-w-[112px] truncate rounded-full border border-white/12 bg-white/[0.06] px-2 py-0.5 font-mono text-xs text-[#E5A918]"
                >
                  {p.label}
                </span>
              )
            )}
            {resolved.previews.length > 5 && (
              <span className="font-mono text-xs text-[#A9A192]">
                +{resolved.previews.length - 5}
              </span>
            )}
          </>
        )}
      </div>

      {/* 核心暗房显影视窗（无边框内陷光学毛玻璃视口，避免嵌套卡片边框叠层） */}
      <div
        data-impeccable-ignore="nested-cards"
        className="relative overflow-hidden rounded-xl bg-[#0A0908] shadow-[inset_0_1px_4px_rgba(0,0,0,0.68)]"
      >
        <MechanicalCameraShutter triggerTick={shutterTick} />
        <VermilionHankoStamp
          stampTick={stampTick}
          label="显影完成"
          sublabel="CANVAS"
          className="right-3 bottom-3 scale-75"
        />

        {imgNode.resultUrl ? (
          <div className="group relative aspect-[4/4.2] w-full overflow-hidden bg-black">
            <img
              src={imgNode.resultUrl}
              alt={imgNode.title}
              draggable={false}
              onClick={() => onZoomImage(imgNode.resultUrl!, imgNode.title)}
              className="size-full cursor-zoom-in object-cover"
            />

            {/* 成品操作浮条（移动端常显，桌面端悬停/聚焦披露） */}
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1 rounded-full border border-white/15 bg-black/75 px-2 py-1 opacity-100 backdrop-blur-md transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="放大查看"
                  onClick={() => onZoomImage(imgNode.resultUrl!, imgNode.title)}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full text-white hover:bg-white/15"
                >
                  <ZoomInIcon className="size-3.5" />
                </button>
                <a
                  href={imgNode.resultUrl}
                  download={downloadFileName(imgNode.title || 'canvas-render', imgNode.resultUrl, 'png')}
                  title="下载原图"
                  className="flex size-7 items-center justify-center rounded-full text-white hover:bg-white/15"
                >
                  <DownloadIcon className="size-3.5" />
                </a>
                <button
                  type="button"
                  title="局部涂抹蒙版重绘"
                  aria-label="局部涂抹蒙版重绘"
                  onClick={() => onOpenInpaint(imgNode)}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[#FF8A75] hover:bg-white/15 hover:text-white"
                >
                  <Paintbrush2Icon className="size-3.5" />
                </button>
                {imgNode.resultJob && (
                  <button
                    type="button"
                    title="投稿发布到公共灵感画廊"
                    aria-label="投稿发布到公共灵感画廊"
                    onClick={() => onPublishJob(imgNode.resultJob!)}
                    className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[#F5C443] hover:bg-white/15"
                  >
                    <Share2Icon className="size-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => onSpawnImageFromNode(imgNode)}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-[#E5A918] px-2.5 text-xs font-bold text-[#151412] hover:bg-[#F5C443]"
              >
                <GitBranchIcon className="size-3" />
                <span>向右衍生</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 px-3 py-4 text-center">
            <ImageIcon className="size-6 text-[#E5A918]/45" />
            <div className="line-clamp-3 text-xs leading-relaxed text-[#C8C0B2]">
              {resolved.combinedPrompt || '接入上游提示词 / 参考图，或直接在下方输入画面描述后点击出图'}
            </div>
          </div>
        )}

        {/* 生成中 / 排队中暗房遮罩 */}
        {isBusy && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 bg-black/82 px-4 text-center backdrop-blur-sm">
            <LoaderCircleIcon className="size-6 animate-spin text-[#E5A918]" />
            <div className="text-xs font-bold text-white">
              {imgNode.progressMessage || (imgNode.status === 'queued' ? '排队等待暗房槽位…' : '正在暗房显影…')}
            </div>
            <div className="h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-white/15">
              <motion.div
                className="h-full w-full origin-left rounded-full bg-gradient-to-r from-[#D9381E] via-[#E5A918] to-[#FDE68A]"
                animate={{ scaleX: Math.max(0.12, (imgNode.progressPercent ?? 18) / 100) }}
                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              />
            </div>
            <button
              type="button"
              onClick={() => onCancelImageNode(imgNode.id)}
              className="cursor-pointer rounded-full border border-white/20 px-3 py-0.5 text-xs text-[#D6CEC0] hover:border-white/45 hover:text-white"
            >
              取消
            </button>
          </div>
        )}
      </div>

      {imgNode.status === 'failed' && imgNode.errorMessage && (
        <div
          title={imgNode.errorMessage}
          className="mt-2 flex items-start gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/12 px-2.5 py-1.5 text-xs text-rose-200"
        >
          <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-rose-400" />
          <span className="line-clamp-3 break-words">{imgNode.errorMessage}</span>
        </div>
      )}

      {/* 节点局部微调词 */}
      <input
        type="text"
        aria-label="本节点专属微调词"
        value={imgNode.localPrompt}
        onChange={(e) => onUpdateNode(node.id, { localPrompt: e.target.value })}
        placeholder="本节点专属微调词（如：换红色晚礼服、特写镜头）…"
        className="mt-2.5 h-8 w-full rounded-xl border border-white/12 bg-black/45 px-2.5 text-xs text-white placeholder:text-[#8E877A] focus:border-[#E5A918]/65 focus:outline-none"
      />

      {/* 精密参数选择行（画笔名 + 画幅 + 清晰度 + 画风） */}
      <div className="mt-2 grid grid-cols-[1.32fr_1fr] gap-1.5">
        <select
          aria-label="选择画笔"
          value={activeBrush ? `${activeBrush.providerId}::${activeBrush.profile.profileId}` : ''}
          onChange={(e) => {
            playBrassDialTick()
            const [pid, profId] = e.target.value.split('::')
            const found = brushes.find(
              (b) => b.providerId === pid && b.profile.profileId === profId
            )
            if (found) {
              onUpdateNode(node.id, {
                providerId: found.providerId,
                profileId: found.profile.profileId,
                resolution:
                  found.profile.defaultResolution ?? found.profile.resolutions[0]?.resolution,
              })
            }
          }}
          className="h-8 w-full truncate rounded-lg border border-white/14 bg-[#171614] px-2 text-xs whitespace-nowrap text-[#F5F1E8] outline-none focus:border-[#E5A918]"
        >
          {brushes.length === 0 ? (
            <option value="">暂无可用画笔</option>
          ) : (
            brushes.map((b) => (
              <option
                key={`${b.providerId}::${b.profile.profileId}`}
                value={`${b.providerId}::${b.profile.profileId}`}
              >
                {b.profile.displayName || b.profile.profileId}
              </option>
            ))
          )}
        </select>

        <div className="flex gap-1">
          <select
            aria-label="选择画幅"
            value={imgNode.aspectRatio}
            onChange={(e) => {
              playBrassDialTick()
              onUpdateNode(node.id, { aspectRatio: e.target.value as StudioAspectRatio })
            }}
            className="h-7.5 min-w-0 flex-1 rounded-lg border border-white/14 bg-[#171614] px-1.5 font-mono text-xs text-[#F5F1E8] outline-none focus:border-[#E5A918]"
          >
            {STUDIO_ASPECT_RATIOS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>

          {activeBrush && activeBrush.profile.resolutions.length > 1 && (
            <select
              aria-label="选择清晰度"
              value={activeResolution || ''}
              onChange={(e) => {
                playBrassDialTick()
                onUpdateNode(node.id, { resolution: e.target.value as StudioResolution })
              }}
              className="h-7.5 w-[58px] shrink-0 rounded-lg border border-white/14 bg-[#171614] px-1 font-mono text-xs text-[#F5C443] outline-none focus:border-[#E5A918]"
            >
              {activeBrush.profile.resolutions.map((res) => (
                <option key={res.resolution} value={res.resolution}>
                  {res.resolution}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {stylePresets.length > 0 && (
        <select
          aria-label="选择画风预设"
          value={imgNode.stylePreset}
          onChange={(e) => {
            playBrassDialTick()
            onUpdateNode(node.id, { stylePreset: e.target.value })
          }}
          className="mt-1.5 h-7.5 w-full rounded-lg border border-white/14 bg-[#171614] px-2 text-xs text-[#D6CEC0] outline-none focus:border-[#E5A918]"
        >
          <option value="none">画风：默认直出</option>
          {stylePresets.slice(0, 40).map((st) => (
            <option key={st.id} value={st.id}>
              画风：{st.label}
            </option>
          ))}
        </select>
      )}

      {/* 唯一展示积分费用的主行动生成按钮（严格遵循 AGENTS.md 约定） */}
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        disabled={isBusy || brushes.length === 0}
        onClick={handleRunClick}
        className="group skin-accent-btn relative mt-3 flex h-9.5 w-full cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-full text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45"
      >
        <span
          aria-hidden="true"
          className="ks-cta-glint pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-transparent via-white/35 to-transparent"
        />
        {imgNode.resultUrl ? (
          <RefreshCwIcon className="relative z-10 size-3.5" />
        ) : (
          <CameraIcon className="relative z-10 size-3.5" />
        )}
        <span className="relative z-10">
          {imgNode.resultUrl ? '原地重绘' : '原地生图'}
          {creditCost > 0 ? ` · ${creditCost} 积分` : ''}
        </span>
      </motion.button>
    </div>
  )
}
