import type {
  CostumeItem,
  GenerationHistoryItem,
  ImageProviderId,
  PortraitItem,
  PoseItem,
  StudioAspectRatio,
  StudioResolution,
} from '@/types/gallery'

export type CanvasBgPattern = 'dots' | 'grid' | 'blank'

export type CanvasTextRole = 'prompt' | 'optics' | 'atmos'

export type CanvasAssetSourceKind =
  | 'pose'
  | 'costume'
  | 'portrait'
  | 'gallery'
  | 'history'
  | 'upload'

export interface CanvasBaseNode {
  id: string
  x: number
  y: number
  title: string
  muted?: boolean
}

export interface CanvasTextNode extends CanvasBaseNode {
  kind: 'text'
  role: CanvasTextRole
  text: string
  presetIndex?: number
}

export interface CanvasAssetNode extends CanvasBaseNode {
  kind: 'asset'
  sourceKind: CanvasAssetSourceKind
  thumbUrl: string
  fullUrl: string
  r2Key?: string
  contain?: boolean
  caption: string
  promptHint?: string
  poseItem?: PoseItem
  costumeItem?: CostumeItem
  portraitItem?: PortraitItem
  useDepth?: boolean
}

export interface CanvasImageNode extends CanvasBaseNode {
  kind: 'image'
  localPrompt: string
  providerId?: ImageProviderId
  profileId?: string
  resolution?: StudioResolution
  aspectRatio: StudioAspectRatio
  stylePreset: string
  status: 'idle' | 'generating' | 'queued' | 'succeeded' | 'failed'
  progressPercent?: number
  progressMessage?: string
  errorMessage?: string
  jobId?: string
  resultUrl?: string
  resultR2Key?: string
  resultJob?: GenerationHistoryItem
  lastPromptUsed?: string
  lastProfileName?: string
  lastRefCount?: number
}

export interface CanvasGroupNode extends CanvasBaseNode {
  kind: 'group'
  width: number
  height: number
  accent: string
}

export type CanvasNode =
  | CanvasTextNode
  | CanvasAssetNode
  | CanvasImageNode
  | CanvasGroupNode

export interface CanvasEdge {
  id: string
  fromId: string
  toId: string
}

export interface CanvasProject {
  id: string
  name: string
  updatedAt: number
  bgPattern: CanvasBgPattern
  pan: { x: number; y: number }
  zoom: number
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

export interface CanvasWorkspaceStore {
  version: 2
  activeProjectId: string
  projects: CanvasProject[]
}

export interface CanvasHistorySnapshot {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}
