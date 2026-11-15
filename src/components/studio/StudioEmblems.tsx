import type { ImageProviderId, StudioAspectRatio } from '../../../shared/studio'
import { cn } from '@/lib/utils'

interface ArtistLogoProps {
  providerId: ImageProviderId
  selected?: boolean
  variant?: 'badge' | 'inline'
  className?: string
}

const ARTIST_BADGE_STYLES: Record<
  ImageProviderId,
  { selected: string; unselected: string; inline: string }
> = {
  gemini: {
    selected: 'border-background/25 bg-background/12 text-[#F5C443] dark:text-[#9A6B00]',
    unselected:
      'border-[#E5A918]/35 bg-[#E5A918]/12 text-[#B88300] dark:border-[#E5A918]/30 dark:bg-[#E5A918]/15 dark:text-[#F5C443]',
    inline: 'text-[#B88300] dark:text-[#F5C443]',
  },
  gpt: {
    selected: 'border-background/25 bg-background/12 text-[#4FD1C5] dark:text-[#0F6A61]',
    unselected:
      'border-[#19857B]/35 bg-[#19857B]/12 text-[#116E65] dark:border-[#4FD1C5]/30 dark:bg-[#19857B]/20 dark:text-[#4FD1C5]',
    inline: 'text-[#116E65] dark:text-[#4FD1C5]',
  },
  grok: {
    selected: 'border-background/25 bg-background/12 text-[#9CA0FF] dark:text-[#4338CA]',
    unselected:
      'border-[#6366F1]/35 bg-[#6366F1]/12 text-[#4F46E5] dark:border-[#818CF8]/30 dark:bg-[#6366F1]/20 dark:text-[#9CA0FF]',
    inline: 'text-[#4F46E5] dark:text-[#9CA0FF]',
  },
}

function ArtistGlyph({ providerId, className }: { providerId: ImageProviderId; className?: string }) {
  if (providerId === 'gemini') {
    // 蕉糖幻想家：弯月棱镜与幻想星芒
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path
          d="M14.8 4.4A7.6 7.6 0 0 0 6.2 15.8A7.6 7.6 0 0 0 18.7 17.5A6.2 6.2 0 0 1 11.4 8.2A6.2 6.2 0 0 1 14.8 4.4Z"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16.3 6.2L17.2 8.7L19.7 9.6L17.2 10.5L16.3 13L15.4 10.5L12.9 9.6L15.4 8.7Z"
          fill="currentColor"
        />
        <circle cx="19.2" cy="5.2" r="1.1" fill="currentColor" opacity="0.75" />
      </svg>
    )
  }

  if (providerId === 'gpt') {
    // 白匣造物主：等轴测精密白匣与切面菱标
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <path
          d="M12 3.3L19.6 7.7V16.3L12 20.7L4.4 16.3V7.7L12 3.3Z"
          stroke="currentColor"
          strokeWidth="1.65"
          strokeLinejoin="round"
        />
        <path d="M12 3.3L19.6 7.7L12 12.1L4.4 7.7L12 3.3Z" fill="currentColor" fillOpacity="0.2" />
        <path
          d="M4.4 7.7L12 12.1L19.6 7.7M12 12.1V20.7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 6.1L14.4 7.5L12 8.9L9.6 7.5Z" fill="currentColor" />
      </svg>
    )
  }

  // 星舰造像师：星舰三角翼、轨道光环与锐利星芒
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <ellipse
        cx="12"
        cy="12.8"
        rx="8.9"
        ry="3.1"
        transform="rotate(-26 12 12.8)"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity="0.58"
      />
      <path d="M12 3.6L6.6 18.2L12 15.1V3.6Z" fill="currentColor" fillOpacity="0.24" />
      <path
        d="M12 3.6L17.4 18.2L12 15.1L6.6 18.2L12 3.6Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
      <path d="M18.3 4.6L18.9 6.1L20.4 6.7L18.9 7.3L18.3 8.8L17.7 7.3L16.2 6.7L17.7 6.1Z" fill="currentColor" />
    </svg>
  )
}

export function ArtistLogo({
  providerId,
  selected = false,
  variant = 'badge',
  className,
}: ArtistLogoProps) {
  const styles = ARTIST_BADGE_STYLES[providerId]

  if (variant === 'inline') {
    return <ArtistGlyph providerId={providerId} className={cn('size-3.5 shrink-0', styles.inline, className)} />
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors',
        selected ? styles.selected : styles.unselected,
        className
      )}
    >
      <ArtistGlyph providerId={providerId} className="size-4.5" />
    </span>
  )
}

interface AspectRatioLogoProps {
  ratio: StudioAspectRatio
  selected?: boolean
  compact?: boolean
  className?: string
}

// 在 24×24 视口内严格按数学宽高比绘制居中矩形框
const RATIO_RECT_GEOMETRY: Record<
  StudioAspectRatio,
  { x: number; y: number; width: number; height: number; rx: number }
> = {
  '3:4': { x: 6, y: 4, width: 12, height: 16, rx: 1.5 },
  '1:1': { x: 5, y: 5, width: 14, height: 14, rx: 1.5 },
  '4:3': { x: 4, y: 6, width: 16, height: 12, rx: 1.5 },
  '9:16': { x: 6.94, y: 3, width: 10.12, height: 18, rx: 1.35 },
  '16:9': { x: 3, y: 6.94, width: 18, height: 10.12, rx: 1.35 },
}

export function AspectRatioLogo({
  ratio,
  selected = false,
  compact = false,
  className,
}: AspectRatioLogoProps) {
  const rect = RATIO_RECT_GEOMETRY[ratio]

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn(compact ? 'size-3.5 shrink-0' : 'size-7 sm:size-8 shrink-0', className)}
    >
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        rx={rect.rx}
        fill="currentColor"
        fillOpacity={selected ? 0.2 : 0.08}
        stroke="currentColor"
        strokeWidth={compact ? 1.8 : 1.45}
      />
      {!compact && (
        <path
          d="M10.4 12H13.6M12 10.4V13.6"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinecap="round"
          strokeOpacity={selected ? 0.72 : 0.48}
        />
      )}
    </svg>
  )
}
