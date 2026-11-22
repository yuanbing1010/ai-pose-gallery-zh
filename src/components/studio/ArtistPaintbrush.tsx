import { type CSSProperties, useId } from 'react'
import { type BrushNibStyle } from '@/lib/brushPalettes'
import { cn } from '@/lib/utils'

export interface ArtistPaintbrushProps {
  colorHex: string
  glowHex?: string
  nibStyle?: BrushNibStyle
  active?: boolean
  variant?: 'compact' | 'chunky'
  viewWidth?: number
  label?: string
  style?: CSSProperties
  className?: string
}

const NIB_GEOMETRY: Record<
  BrushNibStyle,
  { tuftPath: string; paintPath: string; bristleLines: string; tipY: number; highlightCx: number; highlightRx: number }
> = {
  round: {
    tuftPath: 'M1.4 12C4.6 6.2 10.6 5.0 17.6 7.2V16.8C10.6 19.0 4.6 17.8 1.4 12Z',
    paintPath: 'M1 5H11.2C9.8 8.4 12.5 10.6 11.3 12.4C10.0 14.2 12.1 16.2 11.0 19H1Z',
    bristleLines: 'M10.0 8.8L17.2 8.5M9.5 12.0L17.2 12.0M10.0 15.2L17.2 15.5',
    tipY: 12,
    highlightCx: 5.6,
    highlightRx: 2.4,
  },
  flat: {
    tuftPath: 'M2.0 6.5L17.6 7.1V16.9L2.0 17.5C1.0 15.2 1.0 8.8 2.0 6.5Z',
    paintPath: 'M0.8 5.2H11.8C10.8 8.2 12.5 10.4 11.4 12.4C10.5 14.3 12.2 16.2 11.3 18.8H0.8Z',
    bristleLines: 'M10.6 8.4L17.2 8.4M10.2 12.0L17.2 12.0M10.6 15.6L17.2 15.6',
    tipY: 12,
    highlightCx: 5.8,
    highlightRx: 2.8,
  },
  fine: {
    tuftPath: 'M0.3 12C3.8 8.6 9.8 7.6 17.6 8.2V15.8C9.8 16.4 3.8 15.4 0.3 12Z',
    paintPath: 'M0 6.8H10.2C9.3 9.2 11.0 10.8 10.0 12.1C9.2 13.4 10.8 14.9 9.8 17.2H0Z',
    bristleLines: 'M9.6 9.6L17.2 9.4M9.2 12.0L17.2 12.0M9.6 14.4L17.2 14.6',
    tipY: 12,
    highlightCx: 4.9,
    highlightRx: 2.1,
  },
}

const CHUNKY_NIB_GEOMETRY: Record<
  BrushNibStyle,
  { tuftPath: string; paintPath: string; bristleLines: string; tipY: number; highlightCx: number; highlightRx: number }
> = {
  round: {
    tuftPath: 'M2.5 24C8.5 11.5 19.5 9.0 34.0 13.0V35.0C19.5 39.0 8.5 36.5 2.5 24Z',
    paintPath: 'M2 9H22.5C19.8 16.0 25.0 20.5 22.8 24.4C20.2 28.2 24.5 32.8 22.0 39H2Z',
    bristleLines: 'M19.5 16.5L33.2 15.8M18.5 24.0L33.2 24.0M19.5 31.5L33.2 32.2',
    tipY: 24,
    highlightCx: 11.2,
    highlightRx: 4.6,
  },
  flat: {
    tuftPath: 'M4.0 11.5L34.0 12.8V35.2L4.0 36.5C1.8 31.4 1.8 16.6 4.0 11.5Z',
    paintPath: 'M1.5 9.5H23.5C21.6 15.8 25.0 20.4 22.8 24.4C21.0 28.4 24.4 32.6 22.5 38.5H1.5Z',
    bristleLines: 'M20.5 15.8L33.2 15.8M19.5 24.0L33.2 24.0M20.5 32.2L33.2 32.2',
    tipY: 24,
    highlightCx: 11.8,
    highlightRx: 5.2,
  },
  fine: {
    tuftPath: 'M0.8 24C7.5 16.2 18.8 14.0 34.0 15.4V32.6C18.8 34.0 7.5 31.8 0.8 24Z',
    paintPath: 'M0 13H20.5C18.8 18.0 22.2 21.4 20.2 24.2C18.5 27.0 21.8 30.2 19.8 35H0Z',
    bristleLines: 'M18.5 18.5L33.2 18.0M17.8 24.0L33.2 24.0M18.5 29.5L33.2 30.0',
    tipY: 24,
    highlightCx: 9.8,
    highlightRx: 4.0,
  },
}

/**
 * 立体多层画师油画/水彩画笔：
 * 支持三种笔锋形制（round 圆锋 / flat 宽平精绘锋 / fine 尖锋速绘笔），
 * 单一轻量 SVG 内部分层绘制地面接触影、木质与金属厚度脊背、圆柱渐变笔杆/压纹笔箍/湿润毛刷头及高光水滴。
 */
export function ArtistPaintbrush({
  colorHex,
  glowHex,
  nibStyle = 'round',
  active = false,
  variant = 'compact',
  viewWidth = 224,
  label,
  style,
  className,
}: ArtistPaintbrushProps) {
  const uid = useId().replace(/:/g, '')
  const tipFill = glowHex || colorHex

  if (variant === 'chunky') {
    const nib = CHUNKY_NIB_GEOMETRY[nibStyle]
    const W = Math.max(140, Math.round(viewWidth))
    const barrelStart = 47
    const barrelEnd = W - 27
    const barrelWidth = barrelEnd - barrelStart
    const tailX = W - 28
    const tuftBottomStart =
      nibStyle === 'flat'
        ? 'M4.5 31.0C7.5 36.2 18.0 36.5 33.5 35.8'
        : nibStyle === 'fine'
          ? 'M3.5 25.0C10.0 32.5 20.0 34.4 33.5 33.8'
          : 'M4.5 25.5C10.5 35.5 20.5 37.2 33.5 35.6'
    const shadowPath = `${tuftBottomStart}L45.5 37.6L48.0 38.6H${W - 18.5}C${W - 11.8} 38.2 ${W - 6.4} 36.5 ${W - 3.6} 33.6C${W - 1.8} 30.8 ${W - 1.8} 20.0 ${W - 3.6} 17.5C${W - 6.4} 14.5 ${W - 12.0} 13.5 ${W - 18.5} 13.5H48.0L33.5 14.8C20.0 13.8 10.0 15.5 4.5 25.5Z`

    return (
      <span
        aria-hidden="true"
        style={style}
        className={cn('relative inline-block overflow-visible select-none', className)}
      >
        <svg
          viewBox={`0 0 ${W} 48`}
          fill="none"
          className="size-full overflow-visible"
        >
          <defs>
            <linearGradient id={`${uid}-wood-lg`} x1="0" y1="9.5" x2="0" y2="38.5" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFF0D6" />
              <stop offset="22%" stopColor="#EDC38B" />
              <stop offset="58%" stopColor="#CB8A4B" />
              <stop offset="86%" stopColor="#9A5926" />
              <stop offset="100%" stopColor="#5C280B" />
            </linearGradient>
            <linearGradient id={`${uid}-ferrule-lg`} x1="39" y1="11" x2="39" y2="37" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="26%" stopColor="#DDE5EF" />
              <stop offset="65%" stopColor="#7A899D" />
              <stop offset="100%" stopColor="#2F3B4C" />
            </linearGradient>
            <linearGradient id={`${uid}-paint-lg`} x1="12" y1="9" x2="12" y2="39" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor={tipFill} />
              <stop offset="58%" stopColor={colorHex} />
              <stop offset="100%" stopColor="#1E1B18" stopOpacity="0.88" />
            </linearGradient>
            <linearGradient id={`${uid}-gold-lg`} x1="46" y1="9.5" x2="46" y2="38.5" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFF3B0" />
              <stop offset="45%" stopColor="#E5A918" />
              <stop offset="100%" stopColor="#8C5D08" />
            </linearGradient>
            <filter id={`${uid}-ambient-shadow`} x="-14%" y="-40%" width="128%" height="230%">
              <feGaussianBlur stdDeviation="3.8" />
            </filter>
            <filter id={`${uid}-cast-shadow`} x="-12%" y="-35%" width="124%" height="210%">
              <feGaussianBlur stdDeviation="2.0" />
            </filter>
            <filter id={`${uid}-contact-shadow`} x="-10%" y="-25%" width="120%" height="180%">
              <feGaussianBlur stdDeviation="0.9" />
            </filter>
            <clipPath id={`${uid}-tuft-clip-lg`}>
              <path d={nib.tuftPath} />
            </clipPath>
          </defs>

          {/* 真实桌面三层物理阴影：外层漫反射余影 + 主体投射影 + 笔底贴桌暗影（单一连续轮廓，无拼接竖线） */}
          <path
            d={shadowPath}
            transform="translate(3.2 7.2)"
            fill="#261509"
            fillOpacity="0.2"
            filter={`url(#${uid}-ambient-shadow)`}
          />
          <path
            d={shadowPath}
            transform="translate(2.0 5.0)"
            fill="#1C1007"
            fillOpacity="0.34"
            filter={`url(#${uid}-cast-shadow)`}
          />
          <path
            d={shadowPath}
            transform="translate(0.5 2.0)"
            fill="#170B04"
            fillOpacity="0.46"
            filter={`url(#${uid}-contact-shadow)`}
          />

          {/* 背面立体厚度脊背 */}
          <path d="M32.5 13.6L45.5 12.2V37.8L32.5 36.4Z" fill="#273244" />
          <path d="M44.6 11.4L48.0 11.0V39.8L44.6 39.2Z" fill="#4A1E07" />
          <rect x={barrelStart} y="11.0" width={barrelWidth} height="28.8" fill="#4A1E07" />

          {/* 笔尖湿润颜料光晕 */}
          {active && (
            <circle cx="11.5" cy="24" r="14.5" fill={tipFill} fillOpacity="0.28" />
          )}

          {/* 中段实木笔杆（随 viewWidth 水平延展，整体与头尾比例协调） */}
          <rect x={barrelStart} y="9.5" width={barrelWidth} height="29.0" fill={`url(#${uid}-wood-lg)`} />
          <line x1={barrelStart} y1="9.5" x2={barrelEnd} y2="9.5" stroke="#5C280B" strokeOpacity="0.45" strokeWidth="1.2" />
          <line x1={barrelStart} y1="38.5" x2={barrelEnd} y2="38.5" stroke="#5C280B" strokeOpacity="0.45" strokeWidth="1.2" />
          <line x1={54} y1="15.0" x2={W - 34} y2="15.0" stroke="#783C15" strokeOpacity="0.16" strokeWidth="0.9" strokeLinecap="round" />
          <line x1={54} y1="33.2" x2={W - 34} y2="33.2" stroke="#783C15" strokeOpacity="0.16" strokeWidth="0.9" strokeLinecap="round" />
          <line x1={48} y1="12.2" x2={barrelEnd} y2="12.2" stroke="#FFFFFF" strokeOpacity="0.68" strokeWidth="1.5" />

          {/* 金箔过渡饰环 */}
          <path
            d="M44.6 10.4L48.0 9.5V38.5L44.6 37.6Z"
            fill={`url(#${uid}-gold-lg)`}
            stroke="#5C280B"
            strokeOpacity="0.38"
            strokeWidth="0.9"
          />

          {/* 重型金属笔箍 + 双道凹凸轧纹 */}
          <path
            d="M32.5 12.6L45.2 11.0V37.0L32.5 35.4Z"
            fill={`url(#${uid}-ferrule-lg)`}
            stroke="#334155"
            strokeOpacity="0.48"
            strokeWidth="1.15"
          />
          <line x1="36.6" y1="12.1" x2="36.6" y2="35.9" stroke="#1E293B" strokeOpacity="0.42" strokeWidth="1.25" />
          <line x1="37.5" y1="12.1" x2="37.5" y2="35.9" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="0.8" />
          <line x1="41.3" y1="11.5" x2="41.3" y2="36.5" stroke="#1E293B" strokeOpacity="0.42" strokeWidth="1.25" />
          <line x1="42.2" y1="11.5" x2="42.2" y2="36.5" stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="0.8" />

          {/* 饱满毛刷头 + 立体蘸墨笔尖 */}
          <g clipPath={`url(#${uid}-tuft-clip-lg)`}>
            <rect x="0" y="7" width="36" height="34" fill="#F4ECDE" />
            <path d="M0 26.5H36V41H0Z" fill="#D5C5AE" fillOpacity="0.68" />
            <path d={nib.bristleLines} stroke="#A6937A" strokeWidth="1.15" strokeLinecap="round" />
            <path d={nib.paintPath} fill={`url(#${uid}-paint-lg)`} />
          </g>
          <path
            d={nib.tuftPath}
            stroke="#1E293B"
            strokeOpacity="0.28"
            strokeWidth="1.15"
          />

          {/* 笔箍与金环高光 + 笔尖湿润高光水滴 */}
          <path
            d="M34.0 15.0L44.0 13.8M45.4 13.0L47.8 12.2"
            stroke="#FFFFFF"
            strokeOpacity="0.72"
            strokeWidth="1.45"
            strokeLinecap="round"
          />
          <ellipse
            cx={nib.highlightCx}
            cy={nib.tipY - 4.4}
            rx={nib.highlightRx}
            ry="1.65"
            fill="#FFFFFF"
            fillOpacity="0.78"
            transform={`rotate(-14 ${nib.highlightCx} ${nib.tipY - 4.4})`}
          />

          {/* 右侧：笔尾彩色烤漆环 + 圆润收尾木帽 */}
          <g transform={`translate(${tailX}, 0)`}>
            <path
              d="M0 11.0H10.5C17.5 11.4 23.0 13.0 25.5 15.8C27.0 18.2 27.0 32.0 25.5 34.4C23.0 37.2 17.5 38.8 10.5 39.8H0Z"
              fill="#4A1E07"
            />
            <path
              d="M9.5 9.5C16.2 9.9 21.6 11.6 24.4 14.5C26.2 17.5 26.2 30.5 24.4 33.5C21.6 36.4 16.2 38.1 9.5 38.5Z"
              fill={`url(#${uid}-wood-lg)`}
              stroke="#5C280B"
              strokeOpacity="0.45"
              strokeWidth="1.2"
            />
            <rect x="0" y="9.5" width="9.5" height="29.0" fill={colorHex} />
            <rect x="0" y="28.0" width="9.5" height="10.5" fill="#000000" fillOpacity="0.24" />
            <line x1="0" y1="9.5" x2="9.5" y2="9.5" stroke="#5C280B" strokeOpacity="0.45" strokeWidth="1.2" />
            <line x1="0" y1="38.5" x2="9.5" y2="38.5" stroke="#5C280B" strokeOpacity="0.45" strokeWidth="1.2" />
            <line x1="0.4" y1="9.6" x2="0.4" y2="38.4" stroke="#4A1E07" strokeOpacity="0.38" strokeWidth="0.9" />
            <line x1="9.5" y1="9.6" x2="9.5" y2="38.4" stroke="#4A1E07" strokeOpacity="0.38" strokeWidth="0.9" />
            <path
              d="M0 12.2H11.2C16.0 12.4 19.8 13.4 22.3 15.2"
              stroke="#FFFFFF"
              strokeOpacity="0.68"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        </svg>

        {label && (
          <span
            style={{
              left: `${(48 / W) * 100}%`,
              right: `${(28 / W) * 100}%`,
            }}
            className="pointer-events-none absolute inset-y-0 flex items-center justify-center px-1.5"
          >
            <span className="whitespace-nowrap text-xs font-extrabold leading-none tracking-tight text-[#2A1305] drop-shadow-[0_1px_0_rgba(255,238,208,0.75)]">
              {label}
            </span>
          </span>
        )}
      </span>
    )
  }

  const nib = NIB_GEOMETRY[nibStyle]

  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn('relative inline-block overflow-visible select-none', className)}
    >
      <svg
        viewBox="0 0 80 24"
        fill="none"
        className="size-full overflow-visible"
      >
        <defs>
          {/* 垂直于笔身轴线的圆柱明暗过渡：强立体滚圆感 */}
          <linearGradient id={`${uid}-wood`} x1="48" y1="6.8" x2="48" y2="17.2" gradientUnits="userSpaceOnUse">
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
            <path d={nib.tuftPath} />
          </clipPath>
        </defs>

        {/* 接触影 */}
        <path
          d="M2.0 14.8C5.1 9.4 11.0 8.0 17.8 10L25.4 10.6C39 9.5 59 11 75.8 13.2C77.8 13.6 77.8 15.6 75.8 16C59 18.2 39 19.7 25.4 18.6L17.8 19.2C11.0 21.2 5.1 19.8 2.0 14.8Z"
          fill="#0F172A"
          fillOpacity="0.22"
        />

        {/* 背面立体厚度脊背 */}
        <path
          d="M24.6 8.5C38.5 7.3 58.5 8.8 75.8 11.1C77.8 11.5 77.8 13.3 75.8 13.7C58.5 16 38.5 17.5 24.6 16.3Z"
          fill="#5C280B"
        />
        <path d="M17.2 7.7L25.4 8.4V16.4L17.2 17.1Z" fill="#334155" />

        {/* 笔尖湿润颜料光晕 */}
        {active && (
          <circle cx="5.8" cy="12" r="6.8" fill={tipFill} fillOpacity="0.34" />
        )}

        {/* 笔杆：修长立体收腰实木 */}
        <path
          d="M24.6 8.1C38.5 6.9 58.5 8.4 75.5 10.7C77.5 11.1 77.5 12.9 75.5 13.3C58.5 15.6 38.5 17.1 24.6 15.9Z"
          fill={`url(#${uid}-wood)`}
          stroke="#5C280B"
          strokeOpacity="0.4"
          strokeWidth="0.85"
        />

        {/* 笔尾立体彩色烤漆环 */}
        <path d="M62.5 9.1L67.8 9.8V14.2L62.5 14.9Z" fill={colorHex} />
        <path
          d="M62.5 12.6L67.8 12.8V14.2L62.5 14.9Z"
          fill="#000000"
          fillOpacity="0.24"
        />

        {/* 金属笔箍 + 双道凹凸轧纹 */}
        <path
          d="M17.2 7.3L25.4 8.0V16.0L17.2 16.7Z"
          fill={`url(#${uid}-ferrule)`}
          stroke="#334155"
          strokeOpacity="0.45"
          strokeWidth="0.85"
        />
        <line x1="19.7" y1="7.5" x2="19.7" y2="16.5" stroke="#1E293B" strokeOpacity="0.38" strokeWidth="0.9" />
        <line x1="22.9" y1="7.8" x2="22.9" y2="16.2" stroke="#1E293B" strokeOpacity="0.38" strokeWidth="0.9" />

        {/* 饱满毛刷头 + 立体蘸墨笔尖 */}
        <g clipPath={`url(#${uid}-tuft-clip)`}>
          <rect x="0" y="4" width="19" height="16" fill="#F2E9DA" />
          <path d="M0 13.2H19V20H0Z" fill="#D5C6B0" fillOpacity="0.65" />
          <path d={nib.bristleLines} stroke="#A6957E" strokeWidth="0.7" />
          <path
            d={nib.paintPath}
            fill={`url(#${uid}-paint)`}
          />
        </g>
        <path
          d={nib.tuftPath}
          stroke="#1E293B"
          strokeOpacity="0.26"
          strokeWidth="0.85"
        />

        {/* 顶层圆柱高光条 + 笔尖湿润高光水滴 */}
        <path
          d="M18.2 8.6L24.4 9.0M27.0 9.3C40 8.5 57.5 9.6 72.5 11.1"
          stroke="#FFFFFF"
          strokeOpacity="0.72"
          strokeWidth="1.05"
          strokeLinecap="round"
        />
        <ellipse
          cx={nib.highlightCx}
          cy={nib.tipY - 2.2}
          rx={nib.highlightRx}
          ry="0.85"
          fill="#FFFFFF"
          fillOpacity="0.75"
          transform={`rotate(-14 ${nib.highlightCx} ${nib.tipY - 2.2})`}
        />
      </svg>
    </span>
  )
}
