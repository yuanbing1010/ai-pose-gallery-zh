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
    selected: 'border-background/25 bg-background/12 text-[#E4B278] dark:text-[#8E4F18]',
    unselected:
      'border-[#B86B27]/35 bg-[#B86B27]/12 text-[#9A571D] dark:border-[#D69553]/30 dark:bg-[#B86B27]/20 dark:text-[#E4B278]',
    inline: 'text-[#9A571D] dark:text-[#E4B278]',
  },
  muse: {
    selected: 'border-background/25 bg-background/12 text-[#60A5FA] dark:text-[#0064E0]',
    unselected:
      'border-[#0064E0]/35 bg-[#0064E0]/12 text-[#0052CC] dark:border-[#3898FF]/30 dark:bg-[#0064E0]/20 dark:text-[#60A5FA]',
    inline: 'text-[#0052CC] dark:text-[#60A5FA]',
  },
  seedream: {
    selected: 'border-background/25 bg-background/12 text-[#22D3EE] dark:text-[#0E7490]',
    unselected:
      'border-[#06B6D4]/35 bg-[#06B6D4]/12 text-[#0891B2] dark:border-[#22D3EE]/30 dark:bg-[#06B6D4]/20 dark:text-[#67E8F9]',
    inline: 'text-[#0891B2] dark:text-[#22D3EE]',
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

  if (providerId === 'muse') {
    // 缪斯织梦师：官方 Meta Muse 灵动波浪 "m" 标志
    return (
      <svg viewBox="0 0 100 100" fill="none" aria-hidden="true" className={className}>
        <defs>
          <linearGradient id={gradId} x1="133.245" y1="109.046" x2="24.9203" y2="-12.5565" gradientUnits="userSpaceOnUse">
            <stop offset="0.254808" stopColor="#0082FB" />
            <stop offset="0.697115" stopColor="#0064E0" />
            <stop offset="1" stopColor="#0040DC" />
          </linearGradient>
        </defs>
        <path
          d="M24.6257 16.1214C28.2365 16.1214 30.8187 18.9408 30.8187 23.3643C30.8185 27.7868 30.1055 31.7765 28.9225 40.2466C28.0743 46.1813 26.62 55.2418 26.0132 59.0088C27.1782 56.7815 29.9074 51.5757 30.3914 50.5982C36.1081 39.061 42.0657 28.7544 43.7826 26.0254C46.0594 22.382 48.062 20.9229 51.1597 20.9229C52.7685 20.923 54.6826 21.7357 55.6315 22.819C56.9178 24.2895 57.1859 26.6602 57.1411 29.244C57.0738 33.2073 56.5599 39.5264 55.8553 46.5698C55.5416 49.7057 54.9365 56.1066 54.5288 60.4004C58.1883 53.8532 64.9609 41.8109 67.6921 37.6058C70.0727 33.9402 72.466 31.5797 75.6836 31.5796C78.4595 31.5796 81.8809 33.5416 81.6772 38.7573C81.3774 46.4556 80.2673 63.2232 79.7607 70.7479C83.1662 65.7913 87.6377 58.4543 89.3148 55.6966C91.0104 52.908 92.75 50.6542 95.3898 50.5778C98.0987 50.4995 99.913 52.341 99.9959 55.1839C100.078 58.0277 98.3835 61.2256 96.1344 64.856C93.6937 68.7957 90.9621 73.0123 87.6383 76.9491C84.3148 80.8856 81.2604 83.8782 76.5991 83.8786C72.4243 83.8786 69.4869 81.1043 69.283 76.0254C69.1768 73.364 69.6804 67.6405 70.0602 63.1673C70.5 57.9875 71.0315 52.9861 71.403 49.6786C67.7337 56.3979 60.0101 70.4676 56.5348 75.9603C53.1343 81.3339 51.4774 83.2269 47.8882 83.2275C44.2977 83.2275 42.7226 80.6416 42.6717 76.7497C42.6142 72.5285 45.7852 47.1821 46.8587 38.737C45.1183 42.4616 40.839 51.6056 38.1551 57.0435C35.5587 62.3055 31.204 71.3978 28.0436 76.6357C25.7668 80.4094 23.2092 83.2273 19.4173 83.2275C15.6252 83.2275 13.4847 80.6784 13.4847 76.5788C13.4847 72.4794 14.6716 65.6492 15.9465 57.1777C16.5839 53.0781 17.3108 48.6133 18.1315 43.8761C18.7324 40.448 19.7764 34.4169 20.4183 30.7129C17.502 35.2539 12.2536 43.4278 10.6567 45.8903C8.88113 48.6291 7.28747 50.626 4.64681 50.6266C1.7329 50.6266 0.000532901 48.3522 0 45.7113C0 43.0703 1.34323 41.0344 3.52376 37.4512C6.32403 32.8465 11.3578 26.57 14.1154 23.2747C17.3656 19.3912 20.6139 16.1219 24.6257 16.1214Z"
          fill={`url(#${gradId})`}
        />
      </svg>
    )
  }

  if (providerId === 'seedream') {
    // 旋梦造境师：字节跳动官方四联斜切音律柱（左深宝蓝 -> 右薄荷青渐变 + 中间双柱灵动双眸）
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
        <defs>
          <linearGradient id={gradId} x1="2" y1="12" x2="22" y2="12" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1D4ED8" />
            <stop offset="32%" stopColor="#2563EB" />
            <stop offset="68%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#5EEAD4" />
          </linearGradient>
        </defs>
        {/* 1. 左一高柱（顶向右斜、底向左斜，深宝蓝） */}
        <path d="M2.6 4.4L6.0 5.3V18.7L2.6 19.6V4.4Z" fill={`url(#${gradId})`} />
        {/* 2. 左二矮柱（顶向右斜、底向左斜，电光蓝） */}
        <path d="M7.6 10.6L11.0 11.4V18.4L7.6 19.2V10.6Z" fill={`url(#${gradId})`} />
        {/* 3. 右二中矮柱（镜像斜切：顶向右上、底向右下，天青蓝） */}
        <path d="M13.0 9.0L16.4 8.2V16.8L13.0 16.0V9.0Z" fill={`url(#${gradId})`} />
        {/* 4. 右一高柱（镜像斜切：顶向右上、底向右下，薄荷青） */}
        <path d="M18.0 4.0L21.4 3.1V20.9L18.0 20.0V4.0Z" fill={`url(#${gradId})`} />
        {/* 中间双柱灵动双眸 */}
        <rect x="8.8" y="13.95" width="1.0" height="1.5" rx="0.5" fill="#0F172A" />
        <rect x="14.2" y="11.95" width="1.0" height="1.5" rx="0.5" fill="#0F172A" />
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
