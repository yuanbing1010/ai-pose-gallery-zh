import { cn } from '@/lib/utils'

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn('size-7 shrink-0', className)}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      {/* 后层斜卡 */}
      <rect
        x="7.5"
        y="7.5"
        width="12"
        height="16"
        rx="2.6"
        transform="rotate(-11 13.5 15.5)"
        className="fill-primary-foreground/30"
      />
      {/* 中层斜卡 */}
      <rect
        x="11.5"
        y="7.5"
        width="12"
        height="16"
        rx="2.6"
        transform="rotate(9 17.5 15.5)"
        className="fill-primary-foreground/55"
      />
      {/* 前层主卡 */}
      <rect x="9.5" y="7" width="13" height="18" rx="3" className="fill-primary-foreground" />
      {/* 中心四角星芒 */}
      <path
        d="M16 11.4L17.15 14.85L20.6 16L17.15 17.15L16 20.6L14.85 17.15L11.4 16L14.85 14.85L16 11.4Z"
        className="fill-primary"
      />
    </svg>
  )
}
