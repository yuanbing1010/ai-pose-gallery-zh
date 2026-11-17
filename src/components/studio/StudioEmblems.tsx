import { useId } from 'react'
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
  const gradId = useId()

  if (providerId === 'gemini') {
    // 蕉糖幻想家：纯多色渐变四角星（去太阳月亮）
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <defs>
          <linearGradient id={gradId} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4285F4" />
            <stop offset="38%" stopColor="#2DD4BF" />
            <stop offset="72%" stopColor="#F5C443" />
            <stop offset="100%" stopColor="#FB7185" />
          </linearGradient>
        </defs>
        <path
          d="M12 2.4C12.75 7.9 16.1 11.25 21.6 12C16.1 12.75 12.75 16.1 12 21.6C11.25 16.1 7.9 12.75 2.4 12C7.9 11.25 11.25 7.9 12 2.4Z"
          fill={`url(#${gradId})`}
        />
        <circle cx="10.2" cy="11.8" r="0.85" fill="#18181B" />
        <circle cx="13.8" cy="11.8" r="0.85" fill="#18181B" />
      </svg>
    )
  }

  if (providerId === 'gpt') {
    // 白匣造物主：官方风格六瓣交织立体花结（去方框）
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <path
            key={deg}
            d="M12.2 2.4C14.7 2.4 16.7 4.4 16.7 6.9V10.6L13.5 8.75V6.9C13.5 6.18 12.92 5.6 12.2 5.6C11.48 5.6 10.9 6.18 10.9 6.9V8.7L8.2 10.25V6.9C8.2 4.4 9.7 2.4 12.2 2.4Z"
            fill="currentColor"
            fillOpacity="0.88"
            stroke="var(--background, #fff)"
            strokeWidth="0.6"
            transform={`rotate(${deg} 12 12)`}
          />
        ))}
        <circle cx="12" cy="12" r="3.4" fill="var(--background, #fff)" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="10.9" cy="12" r="0.65" fill="currentColor" />
        <circle cx="13.1" cy="12" r="0.65" fill="currentColor" />
      </svg>
    )
  }

  // 星舰造像师：黑洞日食缺口环与斜穿光束
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="5.2" fill="#0B0B14" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M16.2 7.2A7.2 7.2 0 1 0 18.6 14.8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path d="M5.2 18.6L19.4 4.8" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
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
