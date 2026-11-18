import { useId } from 'react'
import { cn } from '@/lib/utils'

export interface ArtistPaintbrushProps {
  colorHex: string
  glowHex?: string
  active?: boolean
  className?: string
}

/**
 * 立体多层画师油画/水彩画笔：
 * 单一轻量 SVG 内部分层绘制地面接触影、木质与金属厚度脊背、圆柱渐变笔杆/压纹笔箍/湿润毛刷头
 * 及顶层镜面高光带，保持立体视觉的同时大幅减少 SVG DOM 与 3D 合成层数量。
 */
export function ArtistPaintbrush({
  colorHex,
  glowHex,
  active = false,
  className,
}: ArtistPaintbrushProps) {
  const uid = useId().replace(/:/g, '')
  const tipFill = glowHex || colorHex

  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-block overflow-visible select-none', className)}
    >
      <svg
        viewBox="0 0 64 24"
        fill="none"
        className="size-full overflow-visible"
      >
        <defs>
          {/* 垂直于笔身轴线的圆柱明暗过渡：强立体滚圆感 */}
          <linearGradient id={`${uid}-wood`} x1="36" y1="6.8" x2="36" y2="17.2" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FCE7C8" />
            <stop offset="28%" stopColor="#E6B87E" />
            <stop offset="68%" stopColor="#B87A40" />
            <stop offset="100%" stopColor="#6D3612" />
          </linearGradient>
          <linearGradient id={`${uid}-ferrule`} x1="20" y1="7" x2="20" y2="17" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="30%" stopColor="#CBD5E1" />
            <stop offset="66%" stopColor="#64748B" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <linearGradient id={`${uid}-paint`} x1="6" y1="6" x2="6" y2="18" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={tipFill} />
            <stop offset="60%" stopColor={colorHex} />
            <stop offset="100%" stopColor="#1E1B18" stopOpacity="0.88" />
          </linearGradient>
          <clipPath id={`${uid}-tuft-clip`}>
            <path d="M1.6 12C4.5 6.4 10.2 5.2 16.8 7.2V16.8C10.2 18.8 4.5 17.6 1.6 12Z" />
          </clipPath>
        </defs>

        {/* 接触影 */}
        <path
          d="M2.2 14.8C5 9.6 10.6 8.2 17 10L24.2 10.6C35 9.6 49 11 59.8 13.2C61.6 13.6 61.6 15.6 59.8 16C49 18.2 35 19.6 24.2 18.6L17 19.2C10.6 21 5 19.6 2.2 14.8Z"
          fill="#0F172A"
          fillOpacity="0.22"
        />

        {/* 背面立体厚度脊背 */}
        <path
          d="M23.5 8.5C34.5 7.4 48.5 8.8 59.8 11.1C61.8 11.5 61.8 13.3 59.8 13.7C48.5 16 34.5 17.4 23.5 16.3Z"
          fill="#5C280B"
        />
        <path d="M16.4 7.7L24.2 8.4V16.4L16.4 17.1Z" fill="#334155" />

        {/* 笔尖湿润颜料光晕 */}
        {active && (
          <circle cx="5.5" cy="12" r="6.5" fill={tipFill} fillOpacity="0.32" />
        )}

        {/* 笔杆：立体收腰实木 */}
        <path
          d="M23.5 8.1C34.5 7.0 48.5 8.4 59.5 10.7C61.5 11.1 61.5 12.9 59.5 13.3C48.5 15.6 34.5 17.0 23.5 15.9Z"
          fill={`url(#${uid}-wood)`}
          stroke="#5C280B"
          strokeOpacity="0.4"
          strokeWidth="0.85"
        />

        {/* 笔尾立体彩色烤漆环 */}
        <path d="M49.2 9.1L53.6 9.75V14.25L49.2 14.9Z" fill={colorHex} />
        <path
          d="M49.2 12.6L53.6 12.8V14.25L49.2 14.9Z"
          fill="#000000"
          fillOpacity="0.24"
        />

        {/* 金属笔箍 + 双道凹凸轧纹 */}
        <path
          d="M16.4 7.3L24.2 8.0V16.0L16.4 16.7Z"
          fill={`url(#${uid}-ferrule)`}
          stroke="#334155"
          strokeOpacity="0.45"
          strokeWidth="0.85"
        />
        <line x1="18.8" y1="7.5" x2="18.8" y2="16.5" stroke="#1E293B" strokeOpacity="0.38" strokeWidth="0.9" />
        <line x1="21.8" y1="7.8" x2="21.8" y2="16.2" stroke="#1E293B" strokeOpacity="0.38" strokeWidth="0.9" />

        {/* 饱满毛刷头 + 立体蘸墨笔尖 */}
        <g clipPath={`url(#${uid}-tuft-clip)`}>
          <rect x="0" y="4" width="18" height="16" fill="#F2E9DA" />
          <path d="M0 13.2H18V20H0Z" fill="#D5C6B0" fillOpacity="0.65" />
          <path d="M9.5 8.8L16.5 8.5M9.0 12.0L16.5 12.0M9.5 15.2L16.5 15.5" stroke="#A6957E" strokeWidth="0.7" />
          <path
            d="M1 5H10.6C9.3 8.4 11.9 10.6 10.7 12.4C9.5 14.2 11.5 16.2 10.4 19H1Z"
            fill={`url(#${uid}-paint)`}
          />
        </g>
        <path
          d="M1.6 12C4.5 6.4 10.2 5.2 16.8 7.2V16.8C10.2 18.8 4.5 17.6 1.6 12Z"
          stroke="#1E293B"
          strokeOpacity="0.26"
          strokeWidth="0.85"
        />

        {/* 顶层圆柱高光条 + 笔尖湿润高光水滴 */}
        <path
          d="M17.4 8.6L23.2 9.0M25.6 9.3C36 8.6 48 9.6 57.2 11.1"
          stroke="#FFFFFF"
          strokeOpacity="0.72"
          strokeWidth="1.05"
          strokeLinecap="round"
        />
        <ellipse
          cx="5.3"
          cy="9.8"
          rx="2.3"
          ry="0.85"
          fill="#FFFFFF"
          fillOpacity="0.75"
          transform="rotate(-14 5.3 9.8)"
        />
      </svg>
    </span>
  )
}
