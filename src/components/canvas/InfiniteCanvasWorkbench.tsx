import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import {
  ApertureIcon,
  ChevronDownIcon,
  CloudIcon,
  CloudOffIcon,
  CopyIcon,
  DownloadIcon,
  FolderPlusIcon,
  GridIcon,
  GroupIcon,
  ImagePlusIcon,
  ImagesIcon,
  LayoutGridIcon,
  LayoutTemplateIcon,
  LoaderCircleIcon,
  Maximize2Icon,
  MinusIcon,
  NetworkIcon,
  PlusIcon,
  Redo2Icon,
  SparklesIcon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { ImageViewer } from '@/components/common/ImageViewer'
import { PublishToGalleryDialog } from '@/components/gallery/PublishToGalleryDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  deleteCloudCanvasProjectApi,
  fetchCloudCanvasProjectsApi,
  fetchGenerationByIdApi,
  saveCloudCanvasProjectApi,
  startGenerationStreamApi,
  uploadReferenceFileApi,
} from '@/lib/apiClient'
import { idbGet, idbSet } from '@/lib/idbStorage'
import { toast } from '@/lib/notifications'
import {
  playBrassDialTick,
  playInkStamp,
  playMechanicalSwitch,
  playTypewriterKey,
} from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'
import { useStudio } from '@/store/studioStore'
import { getEffectiveStyleCatalog } from '../../../shared/studio'
import type { CostumeItem, GenerationHistoryItem, PortraitItem, PoseItem } from '@/types/gallery'
import { CanvasAssetDrawer, type CanvasAssetInsertPayload } from './CanvasAssetDrawer'
import { CanvasInpaintDialog, type InpaintSubmission } from './CanvasInpaintDialog'
import { CanvasMiniMap } from './CanvasMiniMap'
import { CanvasNodeCard, type FlatCanvasBrushOption } from './CanvasNodeCard'
import {
  ATMOS_PRESETS,
  autoLayoutCanvas,
  buildBezierPath,
  buildWorkflowTemplateProject,
  CANVAS_PROJECTS_IDB_KEY,
  CANVAS_WORKFLOW_TEMPLATES,
  createAssetNodeFromExternal,
  createGroupNode,
  createImageNode,
  createStarterProject,
  createTextNode,
  findNonOverlappingPosition,
  getBezierMidpoint,
  getGroupMemberIds,
  getNodeDimensions,
  getPortCoords,
  makeId,
  OPTICS_PRESETS,
  resolveUpstreamInputs,
  sanitizeProjectForStorage,
  wouldCreateCycle,
  type CanvasWorkflowTemplateId,
} from './canvasEngine'
import type {
  CanvasBgPattern,
  CanvasEdge,
  CanvasGroupNode,
  CanvasHistorySnapshot,
  CanvasImageNode,
  CanvasNode,
  CanvasProject,
  CanvasTextNode,
  CanvasWorkspaceStore,
} from './types'

const BG_CYCLE: Array<{ id: CanvasBgPattern; label: string }> = [
  { id: 'dots', label: '点阵' },
  { id: 'grid', label: '网格' },
  { id: 'blank', label: '纯纸' },
]

export function InfiniteCanvasWorkbench() {
  const qc = useQueryClient()
  const {
    user,
    providers,
    platform,
    history,
    openAuthModal,
    refreshBootstrap,
    refreshHistory,
  } = useStudio()

  const starter = useMemo(() => createStarterProject('主创作画布 #01'), [])
  const [projects, setProjects] = useState<CanvasProject[]>([starter])
  const [activeProjectId, setActiveProjectId] = useState<string>(starter.id)
  const [hydrated, setHydrated] = useState(false)
  const [cloudSyncState, setCloudSyncState] = useState<'local' | 'syncing' | 'synced' | 'error'>(
    'local'
  )
  const effectiveCloudSyncState: 'local' | 'syncing' | 'synced' | 'error' = user?.id
    ? cloudSyncState
    : 'local'
  const cloudLoadedUserRef = useRef<string | null>(null)
  const lastCloudPushedRef = useRef<string>('')

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0],
    [projects, activeProjectId]
  )

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 760 })
  const [zoomUrl, setZoomUrl] = useState<{ url: string; title: string } | null>(null)
  const [publishJob, setPublishJob] = useState<GenerationHistoryItem | null>(null)
  const [inpaintNode, setInpaintNode] = useState<CanvasImageNode | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    screenX: number
    screenY: number
    worldX: number
    worldY: number
  } | null>(null)
  const [marqueeRect, setMarqueeRect] = useState<{
    x: number
    y: number
    w: number
    h: number
  } | null>(null)
  const [wiringDraft, setWiringDraft] = useState<{
    fromId: string
    x1: number
    y1: number
    x2: number
    y2: number
  } | null>(null)
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null)
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false)

  // 撤销 / 重做历史栈
  const undoStackRef = useRef<CanvasHistorySnapshot[]>([])
  const redoStackRef = useRef<CanvasHistorySnapshot[]>([])
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 })

  const syncHistoryCounts = useCallback(() => {
    setHistoryCounts({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    })
  }, [])

  // 正在运行中的生图 AbortControllers（支持多分支并行生图与独立取消）
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const pendingPanRef = useRef<{ x: number; y: number } | null>(null)
  const dragMoveRafRef = useRef<number | null>(null)
  const pendingPointerPosRef = useRef<{ clientX: number; clientY: number } | null>(null)
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null)
  const jsonImportInputRef = useRef<HTMLInputElement | null>(null)

  const dragRef = useRef<
    | {
        mode: 'pan'
        startClientX: number
        startClientY: number
        originPanX: number
        originPanY: number
      }
    | {
        mode: 'nodes'
        startClientX: number
        startClientY: number
        origins: Map<string, { x: number; y: number }>
        moved: boolean
      }
    | {
        mode: 'resize-group'
        groupId: string
        startClientX: number
        startClientY: number
        originW: number
        originH: number
      }
    | {
        mode: 'marquee'
        startClientX: number
        startClientY: number
        rectLeft: number
        rectTop: number
      }
    | null
  >(null)

  // 从 IndexedDB 恢复多项目画布状态
  useEffect(() => {
    let alive = true
    void idbGet<CanvasWorkspaceStore>(CANVAS_PROJECTS_IDB_KEY).then((saved) => {
      if (!alive) return
      if (saved && saved.version === 2 && Array.isArray(saved.projects) && saved.projects.length > 0) {
        setProjects(saved.projects)
        setActiveProjectId(
          saved.projects.some((p) => p.id === saved.activeProjectId)
            ? saved.activeProjectId
            : saved.projects[0].id
        )
      }
      setHydrated(true)
    })
    return () => {
      alive = false
    }
  }, [])

  // 防抖写入 IndexedDB
  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => {
      const payload: CanvasWorkspaceStore = {
        version: 2,
        activeProjectId,
        projects: projects.map(sanitizeProjectForStorage),
      }
      void idbSet(CANVAS_PROJECTS_IDB_KEY, payload)
    }, 320)
    return () => window.clearTimeout(timer)
  }, [projects, activeProjectId, hydrated])

  // 登录后自动从 D1 拉取并合并云端画布项目（同 ID 取更新时间戳较新者）
  useEffect(() => {
    if (!hydrated) return
    if (!user?.id) {
      cloudLoadedUserRef.current = null
      return
    }
    if (cloudLoadedUserRef.current === user.id) return
    cloudLoadedUserRef.current = user.id

    let alive = true
    void Promise.resolve()
      .then(() => {
        if (alive) setCloudSyncState('syncing')
        return fetchCloudCanvasProjectsApi()
      })
      .then((res) => {
        if (!alive) return
        const cloudProjects = (res.projects || []) as unknown as CanvasProject[]
        if (cloudProjects.length > 0) {
          setProjects((localProjects) => {
            const merged = new Map<string, CanvasProject>()
            for (const lp of localProjects) merged.set(lp.id, lp)
            for (const cp of cloudProjects) {
              const existing = merged.get(cp.id)
              if (!existing || cp.updatedAt >= existing.updatedAt) {
                merged.set(cp.id, cp)
              }
            }
            return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt)
          })
          // 若当前仍是未修改的默认引导空项目，则优先切到最新云端画布
          setActiveProjectId((currId) => {
            if (currId === starter.id) {
              return cloudProjects[0].id
            }
            return currId
          })
        }
        setCloudSyncState('synced')
      })
      .catch(() => {
        if (!alive) return
        setCloudSyncState('error')
      })

    return () => {
      alive = false
    }
  }, [hydrated, user?.id, starter.id])

  // 登录后自动防抖推送当前活跃画布至 Cloudflare D1
  useEffect(() => {
    if (!hydrated || !user?.id || !activeProject) return
    const clean = sanitizeProjectForStorage(activeProject)
    const fingerprint = JSON.stringify({
      id: clean.id,
      name: clean.name,
      bgPattern: clean.bgPattern,
      nodes: clean.nodes,
      edges: clean.edges,
    })
    if (fingerprint === lastCloudPushedRef.current) return

    const timer = window.setTimeout(() => {
      setCloudSyncState('syncing')
      void saveCloudCanvasProjectApi(clean)
        .then(() => {
          lastCloudPushedRef.current = fingerprint
          setCloudSyncState('synced')
        })
        .catch(() => {
          setCloudSyncState('error')
        })
    }, 950)
    return () => window.clearTimeout(timer)
  }, [hydrated, user?.id, activeProject])

  const handleManualCloudSync = async () => {
    if (!user) {
      openAuthModal('login')
      toast.info('登录后即可开启画布项目跨设备 D1 云同步')
      return
    }
    setCloudSyncState('syncing')
    try {
      const clean = sanitizeProjectForStorage(activeProject)
      await saveCloudCanvasProjectApi(clean)
      lastCloudPushedRef.current = JSON.stringify({
        id: clean.id,
        name: clean.name,
        bgPattern: clean.bgPattern,
        nodes: clean.nodes,
        edges: clean.edges,
      })
      setCloudSyncState('synced')
      toast.success('已将当前画布同步至云端')
    } catch (err) {
      setCloudSyncState('error')
      toast.error(err instanceof Error ? err.message : '云端同步失败，请稍后重试')
    }
  }

  // 监听视口尺寸以驱动小地图
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      setViewportSize({
        width: el.clientWidth || 1280,
        height: el.clientHeight || 760,
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 卸载时中止所有正在进行的生图流
  useEffect(() => {
    const controllers = abortControllersRef.current
    return () => {
      for (const ctrl of controllers.values()) ctrl.abort()
      controllers.clear()
    }
  }, [])

  // 扁平化可用画笔列表（仅展示管理员配置的画笔名称，严禁暴露画师名）
  const availableBrushes = useMemo<FlatCanvasBrushOption[]>(() => {
    const list: FlatCanvasBrushOption[] = []
    for (const provider of providers) {
      if (!provider.enabled) continue
      for (const profile of provider.models) {
        if (!profile.enabled || !profile.configured) continue
        list.push({ providerId: provider.providerId, profile })
      }
    }
    if (list.length === 0) {
      for (const provider of providers) {
        for (const profile of provider.models) {
          if (profile.enabled) list.push({ providerId: provider.providerId, profile })
        }
      }
    }
    return list
  }, [providers])

  const stylePresets = useMemo(() => getEffectiveStyleCatalog(platform), [platform])

  const updateActiveProject = useCallback(
    (updater: (prev: CanvasProject) => CanvasProject, recordHistory = false) => {
      setProjects((list) =>
        list.map((proj) => {
          if (proj.id !== activeProject.id) return proj
          if (recordHistory) {
            undoStackRef.current.push({
              nodes: proj.nodes,
              edges: proj.edges,
            })
            if (undoStackRef.current.length > 40) undoStackRef.current.shift()
            redoStackRef.current = []
            syncHistoryCounts()
          }
          return { ...updater(proj), updatedAt: Date.now() }
        })
      )
    },
    [activeProject.id, syncHistoryCounts]
  )

  const handleUndo = useCallback(() => {
    const snap = undoStackRef.current.pop()
    if (!snap) return
    playMechanicalSwitch(0.92)
    setProjects((list) =>
      list.map((proj) => {
        if (proj.id !== activeProject.id) return proj
        redoStackRef.current.push({ nodes: proj.nodes, edges: proj.edges })
        return { ...proj, nodes: snap.nodes, edges: snap.edges, updatedAt: Date.now() }
      })
    )
    syncHistoryCounts()
  }, [activeProject.id, syncHistoryCounts])

  const handleRedo = useCallback(() => {
    const snap = redoStackRef.current.pop()
    if (!snap) return
    playMechanicalSwitch(1.06)
    setProjects((list) =>
      list.map((proj) => {
        if (proj.id !== activeProject.id) return proj
        undoStackRef.current.push({ nodes: proj.nodes, edges: proj.edges })
        return { ...proj, nodes: snap.nodes, edges: snap.edges, updatedAt: Date.now() }
      })
    )
    syncHistoryCounts()
  }, [activeProject.id, syncHistoryCounts])

  const getViewportWorldCenter = useCallback(() => {
    return {
      x: Math.round((viewportSize.width / 2 - activeProject.pan.x) / activeProject.zoom),
      y: Math.round((viewportSize.height / 2 - activeProject.pan.y) / activeProject.zoom),
    }
  }, [activeProject.pan, activeProject.zoom, viewportSize])

  const handleGroupSelected = useCallback(() => {
    const picked = activeProject.nodes.filter(
      (n) => selectedIds.has(n.id) && n.kind !== 'group'
    )
    if (picked.length < 2) {
      toast.info('请先按住 Shift 框选或点选至少 2 个节点后再编组（⌘G）')
      return
    }
    playInkStamp()
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of picked) {
      const dims = getNodeDimensions(n)
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + dims.width)
      maxY = Math.max(maxY, n.y + dims.height)
    }
    const padX = 28
    const padTop = 52
    const padBottom = 28
    const group = createGroupNode(
      minX - padX,
      minY - padTop,
      maxX - minX + padX * 2,
      maxY - minY + padTop + padBottom,
      `素材编组（${picked.length} 项）`
    )
    updateActiveProject(
      (p) => ({
        ...p,
        nodes: [group, ...p.nodes],
      }),
      true
    )
    setSelectedIds(new Set([group.id]))
    toast.success('已创建编组：拖动编组右端即可一根线打包连出全部内容')
  }, [activeProject.nodes, selectedIds, updateActiveProject])

  // 全局快捷键：撤销 / 重做 / 编组 / 删除选中节点
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      if (typing) return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        handleGroupSelected()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        playMechanicalSwitch(0.86)
        updateActiveProject(
          (p) => ({
            ...p,
            nodes: p.nodes.filter((n) => !selectedIds.has(n.id)),
            edges: p.edges.filter(
              (edge) => !selectedIds.has(edge.fromId) && !selectedIds.has(edge.toId)
            ),
          }),
          true
        )
        setSelectedIds(new Set())
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleGroupSelected, handleRedo, handleUndo, selectedIds, updateActiveProject])

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return { x: 200, y: 200 }
      return {
        x: (clientX - rect.left - activeProject.pan.x) / activeProject.zoom,
        y: (clientY - rect.top - activeProject.pan.y) / activeProject.zoom,
      }
    },
    [activeProject.pan, activeProject.zoom]
  )

  // 鼠标滚轮以指针为中心平滑缩放
  const handleWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('textarea, select, [data-canvas-scrollable="true"]')) {
      return
    }
    e.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const factor = e.deltaY < 0 ? 1.08 : 0.92
    const nextZoom = Math.min(1.8, Math.max(0.35, Number((activeProject.zoom * factor).toFixed(3))))
    if (nextZoom === activeProject.zoom) return
    const pointerX = e.clientX - rect.left
    const pointerY = e.clientY - rect.top
    const worldX = (pointerX - activeProject.pan.x) / activeProject.zoom
    const worldY = (pointerY - activeProject.pan.y) / activeProject.zoom
    const nextPanX = pointerX - worldX * nextZoom
    const nextPanY = pointerY - worldY * nextZoom
    updateActiveProject((p) => ({
      ...p,
      zoom: nextZoom,
      pan: { x: Math.round(nextPanX), y: Math.round(nextPanY) },
    }))
  }

  const adjustZoomCenter = (delta: number) => {
    playBrassDialTick()
    const nextZoom = Math.min(1.8, Math.max(0.35, Number((activeProject.zoom + delta).toFixed(2))))
    const cx = viewportSize.width / 2
    const cy = viewportSize.height / 2
    const wx = (cx - activeProject.pan.x) / activeProject.zoom
    const wy = (cy - activeProject.pan.y) / activeProject.zoom
    updateActiveProject((p) => ({
      ...p,
      zoom: nextZoom,
      pan: { x: Math.round(cx - wx * nextZoom), y: Math.round(cy - wy * nextZoom) },
    }))
  }

  const computeFitViewport = (nodes: CanvasNode[]) => {
    if (nodes.length === 0) {
      return { pan: { x: 0, y: 0 }, zoom: 1 }
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const n of nodes) {
      const d = getNodeDimensions(n)
      minX = Math.min(minX, n.x)
      minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x + d.width)
      maxY = Math.max(maxY, n.y + d.height)
    }
    const contentW = Math.max(360, maxX - minX + 140)
    const contentH = Math.max(260, maxY - minY + 140)
    const fitZoom = Math.min(
      1.12,
      Math.max(0.42, Math.min(viewportSize.width / contentW, viewportSize.height / contentH))
    )
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    return {
      zoom: Number(fitZoom.toFixed(2)),
      pan: {
        x: Math.round(viewportSize.width / 2 - midX * fitZoom),
        y: Math.round(viewportSize.height / 2 - midY * fitZoom),
      },
    }
  }

  const handleFitView = () => {
    playBrassDialTick()
    const fit = computeFitViewport(activeProject.nodes)
    updateActiveProject((p) => ({ ...p, ...fit }))
  }

  const handleViewportPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setContextMenu(null)
    if ((e.target as HTMLElement).closest('[data-canvas-interactive="true"]')) return
    if (e.button !== 0) return

    e.currentTarget.setPointerCapture(e.pointerId)
    if (e.shiftKey) {
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return
      dragRef.current = {
        mode: 'marquee',
        startClientX: e.clientX,
        startClientY: e.clientY,
        rectLeft: rect.left,
        rectTop: rect.top,
      }
      setMarqueeRect({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        w: 0,
        h: 0,
      })
      return
    }

    setSelectedIds(new Set())
    dragRef.current = {
      mode: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPanX: activeProject.pan.x,
      originPanY: activeProject.pan.y,
    }
  }

  const handleNodePointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    node: CanvasNode
  ) => {
    setContextMenu(null)
    if ((e.target as HTMLElement).closest('button, textarea, input, select, a, [data-canvas-port]')) {
      return
    }
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)

    let nextSelected: Set<string>
    if (e.shiftKey) {
      nextSelected = new Set(selectedIds)
      if (nextSelected.has(node.id)) nextSelected.delete(node.id)
      else nextSelected.add(node.id)
    } else if (selectedIds.has(node.id)) {
      nextSelected = new Set(selectedIds)
    } else {
      nextSelected = new Set([node.id])
    }
    setSelectedIds(nextSelected)

    // 如果拖的是 Group，自动把组内成员节点一起带着移动
    const movingIds = new Set<string>(nextSelected)
    for (const id of nextSelected) {
      const found = activeProject.nodes.find((n) => n.id === id)
      if (found && found.kind === 'group') {
        for (const mid of getGroupMemberIds(found, activeProject.nodes)) {
          movingIds.add(mid)
        }
      }
    }

    const origins = new Map<string, { x: number; y: number }>()
    for (const n of activeProject.nodes) {
      if (movingIds.has(n.id)) origins.set(n.id, { x: n.x, y: n.y })
    }

    dragRef.current = {
      mode: 'nodes',
      startClientX: e.clientX,
      startClientY: e.clientY,
      origins,
      moved: false,
    }
  }

  const handleResizeGroupStart = (
    e: ReactPointerEvent<HTMLDivElement>,
    group: CanvasGroupNode
  ) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      mode: 'resize-group',
      groupId: group.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originW: group.width,
      originH: group.height,
    }
  }

  const handleStartWireFromOut = (
    e: ReactPointerEvent<HTMLButtonElement>,
    node: CanvasNode
  ) => {
    playMechanicalSwitch(1.1)
    const out = getPortCoords(node, 'out')
    const pointerWorld = screenToWorld(e.clientX, e.clientY)
    setWiringDraft({
      fromId: node.id,
      x1: out.x,
      y1: out.y,
      x2: pointerWorld.x,
      y2: pointerWorld.y,
    })
  }

  const handleCompleteWireToIn = (
    _e: ReactPointerEvent<HTMLButtonElement>,
    targetNode: CanvasNode
  ) => {
    if (!wiringDraft) return
    const { fromId } = wiringDraft
    setWiringDraft(null)
    if (fromId === targetNode.id) return
    if (targetNode.kind !== 'image') {
      toast.info('请将连线接入「出图节点」的左侧输入端口')
      return
    }
    const alreadyExists = activeProject.edges.some(
      (edge) => edge.fromId === fromId && edge.toId === targetNode.id
    )
    if (alreadyExists) {
      toast.info('这两个节点已经连线')
      return
    }
    if (wouldCreateCycle(activeProject.edges, fromId, targetNode.id)) {
      toast.error('不能形成循环连线')
      return
    }
    playInkStamp()
    updateActiveProject(
      (p) => ({
        ...p,
        edges: [...p.edges, { id: makeId('edge'), fromId, toId: targetNode.id }],
      }),
      true
    )
  }

  useEffect(() => {
    return () => {
      if (dragMoveRafRef.current !== null) {
        cancelAnimationFrame(dragMoveRafRef.current)
        dragMoveRafRef.current = null
      }
    }
  }, [])

  const flushPointerMove = (clientX: number, clientY: number) => {
    if (wiringDraft) {
      const pt = screenToWorld(clientX, clientY)
      setWiringDraft((prev) => (prev ? { ...prev, x2: pt.x, y2: pt.y } : null))
      return
    }

    const drag = dragRef.current
    if (!drag) return

    if (drag.mode === 'marquee') {
      const curX = clientX - drag.rectLeft
      const curY = clientY - drag.rectTop
      const startX = drag.startClientX - drag.rectLeft
      const startY = drag.startClientY - drag.rectTop
      setMarqueeRect({
        x: Math.min(startX, curX),
        y: Math.min(startY, curY),
        w: Math.abs(curX - startX),
        h: Math.abs(curY - startY),
      })
      return
    }

    if (drag.mode === 'resize-group') {
      const dx = (clientX - drag.startClientX) / activeProject.zoom
      const dy = (clientY - drag.startClientY) / activeProject.zoom
      updateActiveProject((p) => ({
        ...p,
        nodes: p.nodes.map((n) =>
          n.id === drag.groupId && n.kind === 'group'
            ? {
                ...n,
                width: Math.max(280, Math.round(drag.originW + dx)),
                height: Math.max(220, Math.round(drag.originH + dy)),
              }
            : n
        ),
      }))
      return
    }

    if (drag.mode !== 'nodes') return

    const dx = (clientX - drag.startClientX) / activeProject.zoom
    const dy = (clientY - drag.startClientY) / activeProject.zoom
    if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.moved = true
      undoStackRef.current.push({
        nodes: activeProject.nodes,
        edges: activeProject.edges,
      })
      if (undoStackRef.current.length > 40) undoStackRef.current.shift()
      redoStackRef.current = []
      syncHistoryCounts()
    }

    updateActiveProject((p) => ({
      ...p,
      nodes: p.nodes.map((n) => {
        const origin = drag.origins.get(n.id)
        if (!origin) return n
        return {
          ...n,
          x: Math.round(origin.x + dx),
          y: Math.round(origin.y + dy),
        }
      }),
    }))
  }

  const handleViewportPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current

    // 画布平移直接操作 DOM transform，拖拽全程零 React 重渲染，松手时统一落盘
    if (!wiringDraft && drag?.mode === 'pan') {
      const nextX = Math.round(drag.originPanX + (e.clientX - drag.startClientX))
      const nextY = Math.round(drag.originPanY + (e.clientY - drag.startClientY))
      pendingPanRef.current = { x: nextX, y: nextY }
      if (worldRef.current) {
        worldRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0) scale(${activeProject.zoom})`
      }
      if (
        viewportRef.current &&
        (activeProject.bgPattern === 'dots' || activeProject.bgPattern === 'grid')
      ) {
        viewportRef.current.style.backgroundPosition = `${nextX}px ${nextY}px`
      }
      return
    }

    if (!wiringDraft && !drag) return

    pendingPointerPosRef.current = { clientX: e.clientX, clientY: e.clientY }
    if (dragMoveRafRef.current === null) {
      dragMoveRafRef.current = requestAnimationFrame(() => {
        dragMoveRafRef.current = null
        const pos = pendingPointerPosRef.current
        pendingPointerPosRef.current = null
        if (pos) flushPointerMove(pos.clientX, pos.clientY)
      })
    }
  }

  const handleViewportPointerUp = () => {
    if (dragMoveRafRef.current !== null) {
      cancelAnimationFrame(dragMoveRafRef.current)
      dragMoveRafRef.current = null
      const pos = pendingPointerPosRef.current
      pendingPointerPosRef.current = null
      if (pos) flushPointerMove(pos.clientX, pos.clientY)
    }

    if (pendingPanRef.current) {
      const committedPan = pendingPanRef.current
      pendingPanRef.current = null
      updateActiveProject((p) => ({
        ...p,
        pan: committedPan,
      }))
    }

    if (wiringDraft) {
      setWiringDraft(null)
    }
    const drag = dragRef.current
    if (drag?.mode === 'marquee' && marqueeRect) {
      const left = (marqueeRect.x - activeProject.pan.x) / activeProject.zoom
      const top = (marqueeRect.y - activeProject.pan.y) / activeProject.zoom
      const right = (marqueeRect.x + marqueeRect.w - activeProject.pan.x) / activeProject.zoom
      const bottom = (marqueeRect.y + marqueeRect.h - activeProject.pan.y) / activeProject.zoom
      const hits = new Set<string>()
      for (const n of activeProject.nodes) {
        const d = getNodeDimensions(n)
        const overlaps =
          n.x + d.width >= left && n.x <= right && n.y + d.height >= top && n.y <= bottom
        if (overlaps) hits.add(n.id)
      }
      setSelectedIds(hits)
      setMarqueeRect(null)
    }
    dragRef.current = null
  }

  const handleContextMenu = (e: ReactMouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('textarea, input, select')) return
    e.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const world = screenToWorld(e.clientX, e.clientY)
    setContextMenu({
      screenX: Math.min(rect.width - 210, Math.max(12, e.clientX - rect.left)),
      screenY: Math.min(rect.height - 240, Math.max(12, e.clientY - rect.top)),
      worldX: Math.round(world.x),
      worldY: Math.round(world.y),
    })
  }

  const spawnNodeAt = (node: CanvasNode, connectFromId?: string) => {
    playTypewriterKey()
    updateActiveProject((p) => {
      const edges = connectFromId
        ? [...p.edges, { id: makeId('edge'), fromId: connectFromId, toId: node.id }]
        : p.edges
      return {
        ...p,
        nodes: [...p.nodes, node],
        edges,
      }
    }, true)
    setSelectedIds(new Set([node.id]))
  }

  const handleInsertFromAssetDrawer = (payload: CanvasAssetInsertPayload) => {
    const center = getViewportWorldCenter()
    if (payload.asset) {
      const pos = findNonOverlappingPosition(
        center.x - 240,
        center.y - 140,
        236,
        276,
        activeProject.nodes
      )
      const node = createAssetNodeFromExternal({
        ...payload.asset,
        x: pos.x,
        y: pos.y,
      })
      spawnNodeAt(node)
      toast.success(`已落板：${payload.asset.caption}`)
      return
    }
    if (payload.promptText) {
      const pos = findNonOverlappingPosition(
        center.x - 220,
        center.y - 100,
        276,
        196,
        activeProject.nodes
      )
      const node = createTextNode(pos.x, pos.y, 'prompt', payload.promptText)
      if (payload.promptTitle) node.title = payload.promptTitle
      spawnNodeAt(node)
      toast.success('已插入画廊提示词节点')
    }
  }

  const handleUploadLocalFiles = async (files: FileList | File[], dropWorld?: { x: number; y: number }) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 6)
    if (arr.length === 0) return

    const base = dropWorld ?? getViewportWorldCenter()
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i]
      const x = base.x - 110 + i * 36
      const y = base.y - 120 + i * 36
      if (user) {
        try {
          const uploaded = await uploadReferenceFileApi({
            file,
            filename: file.name || 'canvas-ref.png',
            purpose: 'extra',
          })
          const node = createAssetNodeFromExternal({
            title: '本地参考 · UPLOAD',
            sourceKind: 'upload',
            thumbUrl: uploaded.url,
            fullUrl: uploaded.url,
            r2Key: uploaded.r2Key,
            caption: file.name.replace(/\.[^.]+$/, '') || '上传图片',
            x,
            y,
          })
          spawnNodeAt(node)
          toast.success(`已上传至云端画布：${file.name}`)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : '图片上传失败')
        }
      } else {
        const localUrl = URL.createObjectURL(file)
        const node = createAssetNodeFromExternal({
          title: '本地预览 · LOCAL',
          sourceKind: 'upload',
          thumbUrl: localUrl,
          fullUrl: localUrl,
          caption: file.name.replace(/\.[^.]+$/, '') || '本地图片',
          x,
          y,
        })
        spawnNodeAt(node)
        toast.info('已放上画布（登录后上传可参与云端生图参考）')
      }
    }
  }

  const handleDropFiles = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDraggingFileOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const pt = screenToWorld(e.clientX, e.clientY)
      void handleUploadLocalFiles(e.dataTransfer.files, pt)
    }
  }

  const handleUpdateNode = useCallback(
    (nodeId: string, patch: Partial<CanvasNode>) => {
      updateActiveProject((p) => ({
        ...p,
        nodes: p.nodes.map((n) => (n.id === nodeId ? ({ ...n, ...patch } as CanvasNode) : n)),
      }))
    },
    [updateActiveProject]
  )

  const handleDeleteNode = (nodeId: string) => {
    playMechanicalSwitch(0.86)
    const ctrl = abortControllersRef.current.get(nodeId)
    if (ctrl) {
      ctrl.abort()
      abortControllersRef.current.delete(nodeId)
    }
    updateActiveProject(
      (p) => ({
        ...p,
        nodes: p.nodes.filter((n) => n.id !== nodeId),
        edges: p.edges.filter((edge) => edge.fromId !== nodeId && edge.toId !== nodeId),
      }),
      true
    )
    setSelectedIds((prev) => {
      if (!prev.has(nodeId)) return prev
      const next = new Set(prev)
      next.delete(nodeId)
      return next
    })
  }

  const handleDuplicateNode = (nodeId: string) => {
    const src = activeProject.nodes.find((n) => n.id === nodeId)
    if (!src) return
    playTypewriterKey()
    const clone: CanvasNode = {
      ...src,
      id: makeId(src.kind === 'image' ? 'img' : src.kind === 'text' ? 'txt' : 'node'),
      x: src.x + 48,
      y: src.y + 48,
      ...(src.kind === 'image'
        ? {
            title: `${src.title} · 副本`,
            status: 'idle' as const,
            progressPercent: undefined,
            progressMessage: undefined,
            errorMessage: undefined,
            resultUrl: undefined,
            resultR2Key: undefined,
            resultJob: undefined,
          }
        : {}),
    } as CanvasNode
    // 若复制的是出图节点，同时继承它的全部上游连线，方便立刻改参数做 A/B 分支对比！
    updateActiveProject((p) => {
      const inheritedEdges =
        src.kind === 'image'
          ? p.edges
              .filter((edge) => edge.toId === src.id)
              .map((edge) => ({ id: makeId('edge'), fromId: edge.fromId, toId: clone.id }))
          : []
      return {
        ...p,
        nodes: [...p.nodes, clone],
        edges: [...p.edges, ...inheritedEdges],
      }
    }, true)
    setSelectedIds(new Set([clone.id]))
    toast.success(
      src.kind === 'image'
        ? '已复制分支节点并继承上游连线，可直接调整参数做 A/B 对比'
        : '已复制节点'
    )
  }

  const handleCycleTextPreset = (node: CanvasTextNode) => {
    playBrassDialTick()
    if (node.role === 'optics') {
      const idx = ((node.presetIndex ?? 0) + 1) % OPTICS_PRESETS.length
      handleUpdateNode(node.id, {
        presetIndex: idx,
        title: `光学 · ${OPTICS_PRESETS[idx].name}`,
        text: OPTICS_PRESETS[idx].text,
      })
    } else if (node.role === 'atmos') {
      const idx = ((node.presetIndex ?? 0) + 1) % ATMOS_PRESETS.length
      handleUpdateNode(node.id, {
        presetIndex: idx,
        title: `氛围 · ${ATMOS_PRESETS[idx].name}`,
        text: ATMOS_PRESETS[idx].text,
      })
    }
  }

  const handleSpawnImageFromNode = (sourceNode: CanvasNode) => {
    const dims = getNodeDimensions(sourceNode)
    const existingOutCount = activeProject.edges.filter((e) => e.fromId === sourceNode.id).length
    const defaultBrush = availableBrushes[0]
    const pos = findNonOverlappingPosition(
      sourceNode.x + dims.width + 116,
      sourceNode.y,
      320,
      374,
      activeProject.nodes
    )
    const nextNode = createImageNode(pos.x, pos.y, {
      title:
        sourceNode.kind === 'image'
          ? `衍生分支 #${existingOutCount + 1}`
          : `出图分支 #${existingOutCount + 1}`,
      providerId: defaultBrush?.providerId,
      profileId: defaultBrush?.profile.profileId,
      resolution:
        defaultBrush?.profile.defaultResolution ??
        defaultBrush?.profile.resolutions[0]?.resolution,
    })
    spawnNodeAt(nextNode, sourceNode.id)
  }

  const handleUngroupNode = (groupId: string) => {
    playMechanicalSwitch(0.95)
    updateActiveProject(
      (p) => ({
        ...p,
        nodes: p.nodes.filter((n) => n.id !== groupId),
        edges: p.edges.filter((edge) => edge.fromId !== groupId && edge.toId !== groupId),
      }),
      true
    )
    toast.info('已解散编组（组内节点已保留）')
  }

  const handleCancelImageNode = (nodeId: string) => {
    const ctrl = abortControllersRef.current.get(nodeId)
    if (ctrl) {
      ctrl.abort()
      abortControllersRef.current.delete(nodeId)
    }
    handleUpdateNode(nodeId, {
      status: 'idle',
      progressPercent: undefined,
      progressMessage: undefined,
    })
  }

  // ==================== 画布节点原地云端 SSE 生图 ====================
  const handleRunImageNode = async (
    node: CanvasImageNode,
    graphOverride?: { nodes: CanvasNode[]; edges: CanvasEdge[] }
  ) => {
    if (!user) {
      openAuthModal('login')
      toast.info('请先登录账号，即可直接在画布节点内调用云端引擎生图')
      return
    }

    const resolved = resolveUpstreamInputs(
      node,
      graphOverride?.nodes ?? activeProject.nodes,
      graphOverride?.edges ?? activeProject.edges
    )
    if (!resolved.combinedPrompt && resolved.refCount === 0) {
      toast.info('请先给该节点连入提示词/参考图，或在节点内填写画面描述')
      return
    }

    const brush =
      availableBrushes.find(
        (b) => b.providerId === node.providerId && b.profile.profileId === node.profileId
      ) ?? availableBrushes[0]

    if (!brush) {
      toast.error('当前暂无可用画笔，请稍后再试')
      return
    }

    const activeResolution =
      brush.profile.resolutions.find((r) => r.resolution === node.resolution)?.resolution ??
      brush.profile.defaultResolution ??
      brush.profile.resolutions[0]?.resolution

    // 检查是否存在未上传至 R2 的本地 blob URL
    const hasBlobOnly = resolved.recipe.extraImages?.some((img) => img.url.startsWith('blob:') && !img.r2Key)
    if (hasBlobOnly) {
      toast.error('画布中有登录前拖入的本地预览图，请重新上传后再参与云端生图')
      return
    }

    const controller = new AbortController()
    abortControllersRef.current.get(node.id)?.abort()
    abortControllersRef.current.set(node.id, controller)

    const isPromptMode = Boolean(resolved.combinedPrompt)
    handleUpdateNode(node.id, {
      status: 'generating',
      progressPercent: 12,
      progressMessage: '正在连接暗房引擎…',
      errorMessage: undefined,
      providerId: brush.providerId,
      profileId: brush.profile.profileId,
      resolution: activeResolution,
    })

    try {
      const result = await startGenerationStreamApi(
        {
          idempotencyKey: crypto.randomUUID(),
          generationMode: isPromptMode ? 'prompt' : 'recipe',
          ...(isPromptMode ? { userPrompt: resolved.combinedPrompt } : {}),
          provider: brush.providerId,
          modelProfileId: brush.profile.profileId,
          resolution: activeResolution,
          stylePreset: node.stylePreset || 'none',
          aspectRatio: node.aspectRatio || '3:4',
          sceneNote: isPromptMode ? '' : resolved.combinedPrompt,
          recipe: resolved.recipe,
        },
        {
          signal: controller.signal,
          onProgress: (p) => {
            handleUpdateNode(node.id, {
              status: p.stage === 'queued' ? 'queued' : 'generating',
              progressPercent: typeof p.percent === 'number' ? p.percent : 35,
              progressMessage: p.message || '正在显影成像…',
              ...(p.jobId ? { jobId: p.jobId } : {}),
            })
          },
        }
      )

      if (result.kind === 'done') {
        const resultR2Key = result.job.imageUrl.startsWith('/api/files/')
          ? result.job.imageUrl.slice('/api/files/'.length)
          : undefined
        handleUpdateNode(node.id, {
          status: 'succeeded',
          progressPercent: 100,
          progressMessage: undefined,
          jobId: result.job.id,
          resultUrl: result.job.imageUrl,
          resultR2Key,
          resultJob: result.job,
          lastPromptUsed: resolved.combinedPrompt,
          lastProfileName: brush.profile.displayName || brush.profile.profileId,
          lastRefCount: resolved.refCount,
        })
        toast.success(`「${node.title}」已在画布显影完成`)
        void Promise.all([refreshBootstrap(), refreshHistory()])
        return
      }

      // 排队中任务：轮询直至完成或失败
      const queuedJobId = result.job.id
      handleUpdateNode(node.id, {
        status: 'queued',
        jobId: queuedJobId,
        progressPercent: 25,
        progressMessage: `排队中（前方 ${Math.max(0, result.queueInfo.aheadCount)} 个任务）…`,
      })

      for (let round = 0; round < 90; round++) {
        if (controller.signal.aborted) return
        await new Promise((r) => window.setTimeout(r, 2500))
        if (controller.signal.aborted) return
        const polled = await fetchGenerationByIdApi(queuedJobId)
        if (polled.job.status === 'succeeded' && polled.job.imageUrl) {
          const resultR2Key = polled.job.imageUrl.startsWith('/api/files/')
            ? polled.job.imageUrl.slice('/api/files/'.length)
            : undefined
          handleUpdateNode(node.id, {
            status: 'succeeded',
            progressPercent: 100,
            progressMessage: undefined,
            resultUrl: polled.job.imageUrl,
            resultR2Key,
            resultJob: polled.job,
            lastPromptUsed: resolved.combinedPrompt,
            lastProfileName: brush.profile.displayName || brush.profile.profileId,
            lastRefCount: resolved.refCount,
          })
          toast.success(`「${node.title}」排队显影完成`)
          void Promise.all([refreshBootstrap(), refreshHistory()])
          return
        }
        if (polled.job.status === 'failed' || polled.job.status === 'cancelled') {
          handleUpdateNode(node.id, {
            status: 'failed',
            progressPercent: undefined,
            progressMessage: undefined,
            errorMessage: polled.job.errorMessage || '生成失败，积分已自动退还',
          })
          void refreshBootstrap()
          return
        }
        handleUpdateNode(node.id, {
          status: polled.job.status === 'queued' ? 'queued' : 'generating',
          progressPercent: polled.job.status === 'processing' ? 68 : 30,
          progressMessage:
            polled.job.status === 'processing' ? '暗房显影冲印中…' : '正在排队等待处理…',
        })
      }
    } catch (err) {
      if (controller.signal.aborted) return
      const msg = err instanceof Error ? err.message : '生图失败，请重试'
      handleUpdateNode(node.id, {
        status: 'failed',
        progressPercent: undefined,
        progressMessage: undefined,
        errorMessage: msg,
      })
      toast.error(msg)
      void refreshBootstrap()
    } finally {
      abortControllersRef.current.delete(node.id)
    }
  }

  const handleInpaintSubmit = (payload: InpaintSubmission) => {
    const { sourceNode, instruction, maskAssetUrl, maskR2Key, autoRun } = payload
    const dims = getNodeDimensions(sourceNode)
    const defaultBrush = availableBrushes[0]

    const newNodes: CanvasNode[] = []
    const newEdges: CanvasEdge[] = []
    let anchorX = sourceNode.x + dims.width + 112

    let maskNodeId: string | null = null
    if (maskAssetUrl) {
      const maskPos = findNonOverlappingPosition(
        anchorX,
        sourceNode.y + 44,
        236,
        276,
        activeProject.nodes
      )
      const maskNode = createAssetNodeFromExternal({
        sourceKind: 'upload',
        title: '蒙版标注 · MASK',
        caption: '红色涂抹区域为局部修改范围',
        thumbUrl: maskAssetUrl,
        fullUrl: maskAssetUrl,
        ...(maskR2Key ? { r2Key: maskR2Key } : {}),
        contain: true,
        x: maskPos.x,
        y: maskPos.y,
      })
      maskNodeId = maskNode.id
      newNodes.push(maskNode)
      anchorX = maskPos.x + 236 + 112
    }

    const renderPos = findNonOverlappingPosition(
      anchorX,
      sourceNode.y,
      320,
      374,
      [...activeProject.nodes, ...newNodes]
    )
    const inpaintRenderNode = createImageNode(renderPos.x, renderPos.y, {
      title: `${sourceNode.title.slice(0, 14)} · 局部重绘`,
      localPrompt: `严格保持原图未涂抹区域的构图、人物五官与整体光影一致，仅对红色蒙版标注的局部区域进行精细修改：${instruction}`,
      providerId: sourceNode.providerId ?? defaultBrush?.providerId,
      profileId: sourceNode.profileId ?? defaultBrush?.profile.profileId,
      resolution:
        sourceNode.resolution ??
        defaultBrush?.profile.defaultResolution ??
        defaultBrush?.profile.resolutions[0]?.resolution,
      aspectRatio: sourceNode.aspectRatio,
      stylePreset: sourceNode.stylePreset,
    })

    newNodes.push(inpaintRenderNode)
    newEdges.push({
      id: makeId('edge'),
      fromId: sourceNode.id,
      toId: inpaintRenderNode.id,
    })
    if (maskNodeId) {
      newEdges.push({
        id: makeId('edge'),
        fromId: maskNodeId,
        toId: inpaintRenderNode.id,
      })
    }

    const nextNodes = [...activeProject.nodes, ...newNodes]
    const nextEdges = [...activeProject.edges, ...newEdges]
    updateActiveProject(
      (p) => ({
        ...p,
        nodes: [...p.nodes, ...newNodes],
        edges: [...p.edges, ...newEdges],
      }),
      true
    )
    setSelectedIds(new Set([inpaintRenderNode.id]))
    toast.success(autoRun ? '已创建局部蒙版重绘分支并开始显影' : '已创建局部蒙版重绘分支')

    if (autoRun) {
      void handleRunImageNode(inpaintRenderNode, { nodes: nextNodes, edges: nextEdges })
    }
  }

  // ==================== 多项目管理操作 ====================
  const handleCreateProject = () => {
    playInkStamp()
    const next = createStarterProject(`创作画布 #0${projects.length + 1}`)
    setProjects((prev) => [next, ...prev])
    setActiveProjectId(next.id)
    setSelectedIds(new Set())
    undoStackRef.current = []
    redoStackRef.current = []
    syncHistoryCounts()
    toast.success(`已新建画布：${next.name}`)
  }

  const handleRenameProject = () => {
    const nextName = window.prompt('输入新的画布项目名称', activeProject.name)
    if (!nextName || !nextName.trim()) return
    updateActiveProject((p) => ({ ...p, name: nextName.trim().slice(0, 32) }))
  }

  const handleDuplicateProject = () => {
    playMechanicalSwitch(1.04)
    const copy: CanvasProject = {
      ...sanitizeProjectForStorage(activeProject),
      id: makeId('proj'),
      name: `${activeProject.name} 副本`,
      updatedAt: Date.now(),
    }
    setProjects((prev) => [copy, ...prev])
    setActiveProjectId(copy.id)
    toast.success(`已复制画布：${copy.name}`)
  }

  const handleDeleteProject = () => {
    const targetId = activeProject.id
    if (user?.id) {
      void deleteCloudCanvasProjectApi(targetId).catch(() => {})
    }
    if (projects.length <= 1) {
      const fresh = createStarterProject('主创作画布 #01')
      setProjects([fresh])
      setActiveProjectId(fresh.id)
      toast.info('已重置当前画布为初始模板')
      return
    }
    const rest = projects.filter((p) => p.id !== targetId)
    setProjects(rest)
    setActiveProjectId(rest[0].id)
    toast.success('已删除画布项目')
  }

  const handleApplyWorkflowTemplate = async (templateId: CanvasWorkflowTemplateId) => {
    playInkStamp()
    let pose: PoseItem | null = null
    let costumes: CostumeItem[] | undefined
    let portrait: PortraitItem | null = null

    if (templateId === 'outfit-swap') {
      try {
        const [posesRes, costumesList, portraitsList] = await Promise.all([
          qc.ensureQueryData(posesQuery),
          qc.ensureQueryData(costumesQuery),
          qc.ensureQueryData(portraitsQuery),
        ])
        pose = posesRes.items.find((p) => !p.source) ?? posesRes.items[0] ?? null
        costumes = costumesList.slice(0, 2)
        portrait = portraitsList[0] ?? null
      } catch {
        // 图库离线时自动降级为纯文本换装模板
      }
    }

    const defaultBrush = availableBrushes[0]
    const rawProject = buildWorkflowTemplateProject(templateId, {
      pose,
      costumes,
      portrait,
    })

    // 为模板中所有出图节点自动绑定默认画笔，开箱即点即出图
    const hydratedNodes = rawProject.nodes.map((n) => {
      if (n.kind !== 'image' || !defaultBrush) return n
      return {
        ...n,
        providerId: defaultBrush.providerId,
        profileId: defaultBrush.profile.profileId,
        resolution:
          defaultBrush.profile.defaultResolution ?? defaultBrush.profile.resolutions[0]?.resolution,
      }
    })
    const fit = computeFitViewport(hydratedNodes)
    const nextProject: CanvasProject = {
      ...rawProject,
      ...fit,
      nodes: hydratedNodes,
    }

    setProjects((prev) => [nextProject, ...prev])
    setActiveProjectId(nextProject.id)
    setSelectedIds(new Set())
    undoStackRef.current = []
    redoStackRef.current = []
    syncHistoryCounts()
    toast.success(`已创建模板画布：${nextProject.name}`)
  }

  const handleExportJson = () => {
    const clean = sanitizeProjectForStorage(activeProject)
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeProject.name.replace(/[\\/:*?"<>|]+/g, '_')}.castdeck-canvas.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('已导出画布工程 JSON')
  }

  const handleImportJson = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as Partial<CanvasProject>
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
        throw new Error('无效的画布 JSON 文件')
      }
      const imported: CanvasProject = {
        id: makeId('proj'),
        name: (parsed.name || file.name.replace(/\.json$/i, '')).slice(0, 32),
        updatedAt: Date.now(),
        bgPattern: parsed.bgPattern === 'grid' || parsed.bgPattern === 'blank' ? parsed.bgPattern : 'dots',
        pan: parsed.pan ?? { x: 24, y: 24 },
        zoom: typeof parsed.zoom === 'number' ? parsed.zoom : 0.92,
        nodes: parsed.nodes,
        edges: parsed.edges,
      }
      setProjects((prev) => [imported, ...prev])
      setActiveProjectId(imported.id)
      toast.success(`已导入画布：${imported.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败')
    }
  }

  const handleAutoArrange = () => {
    playBrassDialTick()
    const arranged = autoLayoutCanvas(activeProject.nodes, activeProject.edges)
    const fit = computeFitViewport(arranged)
    updateActiveProject((p) => ({ ...p, nodes: arranged, ...fit }), true)
    toast.success('已按 DAG 拓扑链路自动齐整排版')
  }

  const nodeMap = useMemo(
    () => new Map(activeProject.nodes.map((n) => [n.id, n])),
    [activeProject.nodes]
  )

  const canUndo = historyCounts.undo > 0
  const canRedo = historyCounts.redo > 0

  const bgStyle =
    activeProject.bgPattern === 'dots'
      ? {
          backgroundImage:
            'radial-gradient(circle, rgba(168,136,74,0.34) 1.15px, transparent 1.15px)',
          backgroundSize: `${Math.round(24 * activeProject.zoom)}px ${Math.round(24 * activeProject.zoom)}px`,
          backgroundPosition: `${activeProject.pan.x}px ${activeProject.pan.y}px`,
        }
      : activeProject.bgPattern === 'grid'
        ? {
            backgroundImage:
              'linear-gradient(to right, rgba(168,136,74,0.13) 1px, transparent 1px), linear-gradient(to bottom, rgba(168,136,74,0.13) 1px, transparent 1px)',
            backgroundSize: `${Math.round(32 * activeProject.zoom)}px ${Math.round(32 * activeProject.zoom)}px`,
            backgroundPosition: `${activeProject.pan.x}px ${activeProject.pan.y}px`,
          }
        : undefined

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#F2EFE8] dark:bg-[#0E0D0C]">
      {/* 隐藏文件上传与 JSON 导入输入框 */}
      <input
        ref={fileUploadInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            void handleUploadLocalFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />
      <input
        ref={jsonImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            void handleImportJson(f)
            e.target.value = ''
          }
        }}
      />

      {/* ==================== 顶部悬浮黑曜石工程控制台（移动端单行横向滑动，释放 130px+ 纵向画布空间） ==================== */}
      <header className="ks-obsidian-stage dark no-scrollbar relative z-30 flex shrink-0 flex-nowrap items-center justify-between gap-2 overflow-x-auto overscroll-x-contain border-b border-[#E5A918]/25 px-3 py-2 text-[#F5F1E8] sm:flex-wrap sm:overflow-visible sm:px-4">
        <h1 className="sr-only">CASTDECK 无限节点创作画布</h1>
        <span
          aria-hidden="true"
          className="ks-foil-hairline pointer-events-none absolute inset-x-0 bottom-0 h-[1px]"
        />

        {/* 左区：多项目切换器 + 撤销重做 + 编组 */}
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-[#E5A918]/40 bg-[#E5A918]/12 px-3 text-xs font-bold text-[#F5C443] transition hover:bg-[#E5A918]/22"
              >
                <LayoutGridIcon className="size-3.5" />
                <span className="max-w-[130px] truncate">{activeProject.name}</span>
                <ChevronDownIcon className="size-3.5 opacity-75" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-60 rounded-2xl border border-border bg-popover p-1.5 shadow-2xl"
            >
              <div className="px-2.5 py-1 font-mono text-xs text-muted-foreground">
                画布项目（{projects.length}）
              </div>
              {projects.map((proj) => (
                <DropdownMenuItem
                  key={proj.id}
                  onClick={() => {
                    playMechanicalSwitch(1.02)
                    setActiveProjectId(proj.id)
                    setSelectedIds(new Set())
                    undoStackRef.current = []
                    redoStackRef.current = []
                    syncHistoryCounts()
                  }}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs',
                    proj.id === activeProject.id && 'bg-muted font-bold'
                  )}
                >
                  <span className="truncate">{proj.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {proj.nodes.length} 节点
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCreateProject} className="cursor-pointer rounded-xl text-xs">
                <FolderPlusIcon className="mr-2 size-3.5 text-[#D9381E]" />
                <span>新建画布项目</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleRenameProject} className="cursor-pointer rounded-xl text-xs">
                <span>重命名当前画布</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicateProject} className="cursor-pointer rounded-xl text-xs">
                <CopyIcon className="mr-2 size-3.5" />
                <span>复制当前画布</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportJson} className="cursor-pointer rounded-xl text-xs">
                <DownloadIcon className="mr-2 size-3.5" />
                <span>导出工程 JSON</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => jsonImportInputRef.current?.click()}
                className="cursor-pointer rounded-xl text-xs"
              >
                <UploadIcon className="mr-2 size-3.5" />
                <span>导入工程 JSON</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDeleteProject}
                className="cursor-pointer rounded-xl text-xs text-destructive"
              >
                <Trash2Icon className="mr-2 size-3.5" />
                <span>{projects.length <= 1 ? '重置初始画布' : '删除当前画布'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 一键工作流模板库下拉菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-2.5 text-xs font-semibold text-[#F5F1E8] transition hover:border-[#E5A918]/55 hover:text-[#F5C443]"
              >
                <LayoutTemplateIcon className="size-3.5 text-[#E5A918]" />
                <span>模板库</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-72 rounded-2xl border border-border bg-popover p-1.5 shadow-2xl"
            >
              <div className="px-2.5 py-1 font-mono text-xs text-muted-foreground">
                一键新建节点工作流模板
              </div>
              {CANVAS_WORKFLOW_TEMPLATES.map((tpl) => (
                <DropdownMenuItem
                  key={tpl.id}
                  onClick={() => void handleApplyWorkflowTemplate(tpl.id)}
                  className="flex cursor-pointer flex-col items-start gap-0.5 rounded-xl px-2.5 py-2"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground">
                      <span className="mr-1.5 font-mono text-[#D9381E]">{tpl.code}</span>
                      {tpl.title}
                    </span>
                    <span className="rounded-full bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {tpl.badge}
                    </span>
                  </div>
                  <span className="text-xs leading-snug text-muted-foreground">{tpl.subtitle}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* D1 云端同步状态胶囊 */}
          <button
            type="button"
            onClick={() => void handleManualCloudSync()}
            title={
              user
                ? '点击立即同步当前画布至 Cloudflare D1 云端'
                : '当前仅保存在浏览器本地，点击登录开启跨设备云同步'
            }
            className={cn(
              'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 font-mono text-xs transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] active:scale-95',
              effectiveCloudSyncState === 'synced'
                ? 'border-[#19857B]/45 bg-[#19857B]/15 text-[#99F6E4] hover:bg-[#19857B]/25'
                : effectiveCloudSyncState === 'syncing'
                  ? 'border-[#E5A918]/45 bg-[#E5A918]/15 text-[#F5C443]'
                  : effectiveCloudSyncState === 'error'
                    ? 'border-rose-500/45 bg-rose-500/15 text-rose-300'
                    : 'border-white/12 bg-black/35 text-[#A9A192] hover:border-white/30 hover:text-white'
            )}
          >
            {effectiveCloudSyncState === 'syncing' ? (
              <LoaderCircleIcon className="size-3.5 animate-spin" />
            ) : user ? (
              <CloudIcon className="size-3.5" />
            ) : (
              <CloudOffIcon className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {effectiveCloudSyncState === 'syncing'
                ? '同步中'
                : effectiveCloudSyncState === 'synced'
                  ? '云端已同步'
                  : effectiveCloudSyncState === 'error'
                    ? '同步重试'
                    : '仅本地'}
            </span>
          </button>

          <div className="inline-flex items-center rounded-full border border-white/12 bg-black/35 p-0.5">
            <button
              type="button"
              disabled={!canUndo}
              onClick={handleUndo}
              aria-label="撤销 (⌘Z)"
              title="撤销 (⌘Z)"
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[#EAE4D7] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Undo2Icon className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={handleRedo}
              aria-label="重做 (⌘⇧Z)"
              title="重做 (⌘⇧Z)"
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[#EAE4D7] transition-[transform,background-color] duration-150 ease-[var(--ease-out)] hover:bg-white/10 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Redo2Icon className="size-3.5" />
            </button>
          </div>

          {selectedIds.size >= 2 && (
            <button
              type="button"
              onClick={handleGroupSelected}
              className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-[#E5A918]/50 bg-[#E5A918]/18 px-2.5 text-xs font-bold text-[#F5C443] hover:bg-[#E5A918]/30"
            >
              <GroupIcon className="size-3.5" />
              <span>编组 ({selectedIds.size})</span>
            </button>
          )}
        </div>

        {/* 中区：核心节点快速创建坞 */}
        <div className="flex shrink-0 flex-nowrap items-center gap-1.5 sm:flex-wrap">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              const c = getViewportWorldCenter()
              spawnNodeAt(createTextNode(c.x - 140, c.y - 90, 'prompt'))
            }}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-white/14 bg-white/[0.06] px-2.5 text-xs font-semibold whitespace-nowrap text-white transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] hover:border-[#D9381E]/70 hover:bg-[#D9381E]/20"
          >
            <PlusIcon className="size-3.5 text-[#D9381E]" />
            <span>提示词</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              const c = getViewportWorldCenter()
              spawnNodeAt(createTextNode(c.x - 140, c.y - 40, 'optics'))
            }}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-white/14 bg-white/[0.06] px-2.5 text-xs font-semibold whitespace-nowrap text-white transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] hover:border-[#E5A918]/70 hover:bg-[#E5A918]/20"
          >
            <ApertureIcon className="size-3.5 text-[#E5A918]" />
            <span>光影</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              const c = getViewportWorldCenter()
              const defaultBrush = availableBrushes[0]
              spawnNodeAt(
                createImageNode(c.x - 160, c.y - 160, {
                  providerId: defaultBrush?.providerId,
                  profileId: defaultBrush?.profile.profileId,
                  resolution:
                    defaultBrush?.profile.defaultResolution ??
                    defaultBrush?.profile.resolutions[0]?.resolution,
                })
              )
            }}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-[#E5A918]/55 bg-[#E5A918]/18 px-3 text-xs font-bold whitespace-nowrap text-[#F5C443] transition-[transform,border-color,background-color] duration-150 ease-[var(--ease-out)] hover:border-[#F5C443] hover:bg-[#E5A918]/28"
          >
            <SparklesIcon className="size-3.5" />
            <span>生图节点</span>
          </motion.button>

          <button
            type="button"
            onClick={() => {
              playMechanicalSwitch(drawerOpen ? 0.94 : 1.06)
              setDrawerOpen((o) => !o)
            }}
            className={cn(
              'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-bold whitespace-nowrap transition-[transform,background-color,border-color,color] duration-150 ease-[var(--ease-out)] active:scale-[0.96]',
              drawerOpen
                ? 'border-[#2DD4BF]/70 bg-[#19857B]/30 text-[#99F6E4]'
                : 'border-white/14 bg-white/[0.06] text-white hover:border-[#2DD4BF]/60'
            )}
          >
            <ImagesIcon className="size-3.5 text-[#4FD1C5]" />
            <span className="sm:hidden">资产库</span>
            <span className="hidden sm:inline">三库与画廊资产</span>
          </button>

          <button
            type="button"
            onClick={() => fileUploadInputRef.current?.click()}
            title="上传本地参考图到画布"
            className="hidden h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full border border-white/12 bg-black/35 px-2.5 text-xs font-medium whitespace-nowrap text-[#D8D0C2] transition-[transform,border-color,color] duration-150 ease-[var(--ease-out)] hover:border-white/30 hover:text-white active:scale-[0.96] sm:inline-flex"
          >
            <ImagePlusIcon className="size-3.5" />
            <span>本地图</span>
          </button>
        </div>

        {/* 右区：底纹切换 + 自适应居中 + 齐整排版 + 黄铜缩放旋钮 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            title="切换画布底纹（点阵 / 网格 / 纯纸）"
            onClick={() => {
              playBrassDialTick()
              const currIdx = BG_CYCLE.findIndex((b) => b.id === activeProject.bgPattern)
              const next = BG_CYCLE[(currIdx + 1) % BG_CYCLE.length]
              updateActiveProject((p) => ({ ...p, bgPattern: next.id }))
            }}
            className="hidden h-8 cursor-pointer items-center gap-1 rounded-full border border-white/12 bg-black/35 px-2.5 font-mono text-xs text-[#D6CEC0] hover:border-white/30 hover:text-white md:inline-flex"
          >
            <GridIcon className="size-3.5 text-[#E5A918]" />
            <span>{BG_CYCLE.find((b) => b.id === activeProject.bgPattern)?.label}</span>
          </button>

          <button
            type="button"
            title="自适应居中全部节点"
            onClick={handleFitView}
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-white/12 bg-black/35 text-[#D6CEC0] hover:border-white/30 hover:text-white"
          >
            <Maximize2Icon className="size-3.5" />
          </button>

          <button
            type="button"
            title="按 DAG 连线拓扑智能自动排版"
            onClick={handleAutoArrange}
            className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border border-white/12 bg-black/35 px-2.5 text-xs font-medium text-[#D6CEC0] transition hover:border-[#E5A918]/50 hover:text-white"
          >
            <NetworkIcon className="size-3.5 text-[#E5A918]" />
            <span className="hidden lg:inline">智能排版</span>
          </button>

          <div className="inline-flex items-center gap-0.5 rounded-full border border-white/15 bg-black/45 p-0.5 font-mono text-xs">
            <button
              type="button"
              aria-label="缩小"
              onClick={() => adjustZoomCenter(-0.1)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[#EAE4D7] hover:bg-white/10"
            >
              <MinusIcon className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={handleFitView}
              className="cursor-pointer px-1.5 font-bold tabular-nums text-[#F5C443]"
              title="点击自适应全部节点"
            >
              {Math.round(activeProject.zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label="放大"
              onClick={() => adjustZoomCenter(0.1)}
              className="flex size-7 cursor-pointer items-center justify-center rounded-full text-[#EAE4D7] hover:bg-white/10"
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* ==================== 全屏无限制图视口 ==================== */}
      <div
        ref={viewportRef}
        data-impeccable-ignore="radial-spotlight-glow"
        onWheel={handleWheel}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={handleViewportPointerUp}
        onContextMenu={handleContextMenu}
        onDragOver={(e) => {
          e.preventDefault()
          if (!isDraggingFileOver) setIsDraggingFileOver(true)
        }}
        onDragLeave={() => setIsDraggingFileOver(false)}
        onDrop={handleDropFiles}
        className="relative min-h-0 w-full flex-1 cursor-grab touch-none overscroll-none overflow-hidden select-none active:cursor-grabbing"
        style={bgStyle}
      >
        {/* 外部拖拽图片覆盖提示 */}
        {isDraggingFileOver && (
          <div className="pointer-events-none absolute inset-4 z-40 flex items-center justify-center rounded-3xl border-2 border-dashed border-[#E5A918] bg-black/55 backdrop-blur-sm">
            <div className="rounded-2xl border border-[#E5A918]/50 bg-[#151412] px-6 py-4 text-center text-white shadow-2xl">
              <UploadIcon className="mx-auto mb-2 size-7 text-[#F5C443]" />
              <div className="text-sm font-bold">松开鼠标，立即将本地图片放上画布</div>
              <div className="mt-1 text-xs text-[#C8C0B2]">
                支持多图同时拖入，拉线即可参与云端参考生图
              </div>
            </div>
          </div>
        )}

        {/* Shift 框选矩形 */}
        {marqueeRect && (
          <div
            aria-hidden="true"
            style={{
              left: marqueeRect.x,
              top: marqueeRect.y,
              width: marqueeRect.w,
              height: marqueeRect.h,
            }}
            className="pointer-events-none absolute z-40 rounded-xl border border-[#E5A918] bg-[#E5A918]/12"
          />
        )}

        {/* 无限坐标世界容器 */}
        <div
          ref={worldRef}
          className="absolute inset-0 origin-top-left"
          style={{
            transform: `translate3d(${activeProject.pan.x}px, ${activeProject.pan.y}px, 0) scale(${activeProject.zoom})`,
          }}
        >
          {/* SVG 自由端口贝塞尔连线层 */}
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 h-[4000px] w-[4000px] overflow-visible"
          >
            <defs>
              <linearGradient id="v2-cable-gold" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#E5A918" />
                <stop offset="52%" stopColor="#D9381E" />
                <stop offset="100%" stopColor="#F5C443" />
              </linearGradient>
              <linearGradient id="v2-cable-jade" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#19857B" />
                <stop offset="100%" stopColor="#E5A918" />
              </linearGradient>
            </defs>

            {activeProject.edges.map((edge) => {
              const from = nodeMap.get(edge.fromId)
              const to = nodeMap.get(edge.toId)
              if (!from || !to) return null
              const p1 = getPortCoords(from, 'out')
              const p2 = getPortCoords(to, 'in')
              const d = buildBezierPath(p1.x, p1.y, p2.x, p2.y)
              const muted = Boolean(from.muted)
              const hovered = hoveredEdgeId === edge.id

              return (
                <g key={edge.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke="rgba(16,14,10,0.18)"
                    strokeWidth={hovered ? 7 : 5}
                    strokeLinecap="round"
                  />
                  <path
                    d={d}
                    fill="none"
                    stroke={
                      muted
                        ? 'rgba(130,124,114,0.38)'
                        : from.kind === 'asset'
                          ? 'url(#v2-cable-jade)'
                          : 'url(#v2-cable-gold)'
                    }
                    strokeWidth={hovered ? 3.6 : 2.6}
                    strokeDasharray={muted ? '6 6' : undefined}
                    strokeLinecap="round"
                  />
                </g>
              )
            })}

            {/* 正在拖拽拉出中的动态预览连线 */}
            {wiringDraft && (
              <path
                d={buildBezierPath(
                  wiringDraft.x1,
                  wiringDraft.y1,
                  wiringDraft.x2,
                  wiringDraft.y2
                )}
                fill="none"
                stroke="#F5C443"
                strokeWidth={3}
                strokeDasharray="7 5"
                strokeLinecap="round"
              />
            )}
          </svg>

          {/* 每条连线中点的可点击「断开」小圆扣 */}
          {activeProject.edges.map((edge) => {
            const from = nodeMap.get(edge.fromId)
            const to = nodeMap.get(edge.toId)
            if (!from || !to) return null
            const p1 = getPortCoords(from, 'out')
            const p2 = getPortCoords(to, 'in')
            const mid = getBezierMidpoint(p1.x, p1.y, p2.x, p2.y)
            return (
              <button
                key={`cut-${edge.id}`}
                type="button"
                data-canvas-interactive="true"
                onMouseEnter={() => setHoveredEdgeId(edge.id)}
                onMouseLeave={() => setHoveredEdgeId(null)}
                onClick={(e) => {
                  e.stopPropagation()
                  playMechanicalSwitch(0.85)
                  updateActiveProject(
                    (p) => ({ ...p, edges: p.edges.filter((x) => x.id !== edge.id) }),
                    true
                  )
                }}
                title="点击断开此连线"
                aria-label="断开连线"
                style={{
                  transform: `translate3d(${mid.x - 11}px, ${mid.y - 11}px, 0)`,
                }}
                className="absolute top-0 left-0 z-15 flex size-5.5 cursor-pointer items-center justify-center rounded-full border border-[#E5A918]/50 bg-[#151412]/85 text-[#F5C443] opacity-40 shadow transition hover:scale-115 hover:border-[#D9381E] hover:bg-[#D9381E] hover:text-white hover:opacity-100"
              >
                <XIcon className="size-3" />
              </button>
            )
          })}

          {/* 渲染所有画布节点（编组在底层，普通节点在上层） */}
          {activeProject.nodes.map((node) => (
            <CanvasNodeCard
              key={node.id}
              node={node}
              allNodes={activeProject.nodes}
              allEdges={activeProject.edges}
              selected={selectedIds.has(node.id)}
              isConnecting={Boolean(wiringDraft)}
              isValidDropTarget={
                Boolean(wiringDraft) &&
                node.kind === 'image' &&
                wiringDraft?.fromId !== node.id
              }
              brushes={availableBrushes}
              stylePresets={stylePresets}
              onPointerDownNode={handleNodePointerDown}
              onStartWireFromOut={handleStartWireFromOut}
              onCompleteWireToIn={handleCompleteWireToIn}
              onResizeGroupStart={handleResizeGroupStart}
              onUpdateNode={handleUpdateNode}
              onDeleteNode={handleDeleteNode}
              onDuplicateNode={handleDuplicateNode}
              onCycleTextPreset={handleCycleTextPreset}
              onSpawnImageFromNode={handleSpawnImageFromNode}
              onRunImageNode={(n) => void handleRunImageNode(n)}
              onCancelImageNode={handleCancelImageNode}
              onUngroupNode={handleUngroupNode}
              onZoomImage={(url, title) => setZoomUrl({ url, title })}
              onPublishJob={(job) => setPublishJob(job)}
              onOpenInpaint={(n) => setInpaintNode(n)}
            />
          ))}
        </div>

        {/* 右键快捷建节点菜单 */}
        {contextMenu && (
          <div
            data-canvas-interactive="true"
            style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
            className="ks-obsidian-stage dark absolute z-40 w-48 overflow-hidden rounded-2xl border border-[#E5A918]/35 p-1.5 text-[#F5F1E8] shadow-2xl"
          >
            <div className="px-2.5 py-1 font-mono text-xs text-[#A9A192]">在此处新建</div>
            {[
              {
                label: '提示词节点',
                action: () => spawnNodeAt(createTextNode(contextMenu.worldX, contextMenu.worldY, 'prompt')),
              },
              {
                label: '光学滤镜节点',
                action: () => spawnNodeAt(createTextNode(contextMenu.worldX, contextMenu.worldY, 'optics')),
              },
              {
                label: '场景氛围节点',
                action: () => spawnNodeAt(createTextNode(contextMenu.worldX, contextMenu.worldY, 'atmos')),
              },
              {
                label: '原地生图节点',
                action: () => {
                  const defaultBrush = availableBrushes[0]
                  spawnNodeAt(
                    createImageNode(contextMenu.worldX, contextMenu.worldY, {
                      providerId: defaultBrush?.providerId,
                      profileId: defaultBrush?.profile.profileId,
                      resolution:
                        defaultBrush?.profile.defaultResolution ??
                        defaultBrush?.profile.resolutions[0]?.resolution,
                    })
                  )
                },
              },
              {
                label: '空白编组框',
                action: () => spawnNodeAt(createGroupNode(contextMenu.worldX, contextMenu.worldY)),
              },
              {
                label: '打开三库 / 画廊抽屉',
                action: () => setDrawerOpen(true),
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  item.action()
                  setContextMenu(null)
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-xs font-medium text-[#EAE4D7] transition hover:bg-white/10 hover:text-white"
              >
                <span>{item.label}</span>
                <PlusIcon className="size-3 text-[#E5A918]" />
              </button>
            ))}
          </div>
        )}

        {/* 左下角操控提示条 */}
        <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-20 hidden items-center gap-2 rounded-full border border-border/80 bg-card/88 px-3 py-1 font-mono text-xs text-muted-foreground shadow-sm backdrop-blur-md lg:flex">
          <span className="size-1.5 rounded-full bg-[#D9381E]" />
          <span>
            拖右端口自由连线 · 右键原地建节点 · Shift 框选 + ⌘G 编组 · 滚轮缩放 · 拖本地图入画布
          </span>
        </div>

        {/* 右下角实时小地图（抽屉打开时自动左移避让） */}
        <div
          className={cn(
            'pointer-events-none absolute right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 hidden transition-transform duration-200 ease-[var(--ease-out)] sm:block',
            drawerOpen ? '-translate-x-[336px]' : 'translate-x-0'
          )}
        >
          <CanvasMiniMap
            nodes={activeProject.nodes}
            edges={activeProject.edges}
            pan={activeProject.pan}
            zoom={activeProject.zoom}
            viewportSize={viewportSize}
            selectedIds={selectedIds}
            onJumpToWorldCenter={(wx, wy) => {
              updateActiveProject((p) => ({
                ...p,
                pan: {
                  x: Math.round(viewportSize.width / 2 - wx * p.zoom),
                  y: Math.round(viewportSize.height / 2 - wy * p.zoom),
                },
              }))
            }}
          />
        </div>

        {/* 右侧三库 / 灵感画廊 / 云端作品资产抽屉 */}
        <CanvasAssetDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          history={history}
          onInsert={handleInsertFromAssetDrawer}
          onUploadLocalFiles={(files) => void handleUploadLocalFiles(files)}
        />
      </div>

      {/* 高清大图预览与投稿公共画廊弹窗 */}
      <ImageViewer
        open={zoomUrl !== null}
        imageUrl={zoomUrl?.url || ''}
        title={zoomUrl?.title || '画布高清预览'}
        onOpenChange={(open) => {
          if (!open) setZoomUrl(null)
        }}
      />
      <PublishToGalleryDialog
        job={publishJob}
        open={publishJob !== null}
        onOpenChange={(open) => {
          if (!open) setPublishJob(null)
        }}
      />
      <CanvasInpaintDialog
        node={inpaintNode}
        open={inpaintNode !== null}
        isAuthenticated={Boolean(user)}
        onRequireAuth={() => {
          setInpaintNode(null)
          openAuthModal('login')
          toast.info('请先登录账号，再上传局部蒙版并执行重绘')
        }}
        onOpenChange={(open) => {
          if (!open) setInpaintNode(null)
        }}
        onSubmit={handleInpaintSubmit}
      />
    </div>
  )
}
