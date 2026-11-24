import { useRef } from 'react'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme, type Theme } from './ThemeProvider'

export function ThemeToggle({ square = false }: { square?: boolean }) {
  const { theme, setTheme } = useTheme()
  const triggerRef = useRef<HTMLButtonElement>(null)

  const handleThemeChange = (v: string) => {
    const rect = triggerRef.current?.getBoundingClientRect()
    const origin = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : undefined
    setTheme(v as Theme, origin)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          size="icon"
          aria-label="切换主题"
          className={square ? 'size-8 rounded-none border border-zinc-300 hover:border-zinc-950 dark:border-zinc-700 dark:hover:border-zinc-200' : undefined}
        >
          <SunIcon className="size-4 scale-100 rotate-0 opacity-100 transition-[transform,opacity] duration-150 ease-out dark:scale-75 dark:-rotate-45 dark:opacity-0" />
          <MoonIcon className="absolute size-4 scale-75 rotate-45 opacity-0 transition-[transform,opacity] duration-150 ease-out dark:scale-100 dark:rotate-0 dark:opacity-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={square ? 'rounded-none border-zinc-950 dark:border-zinc-200' : undefined}>
        <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
          <DropdownMenuRadioItem value="light" className={square ? 'rounded-none font-mono text-xs' : undefined}>
            <SunIcon /> 浅色画廊
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className={square ? 'rounded-none font-mono text-xs' : undefined}>
            <MoonIcon /> 深色暗房
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className={square ? 'rounded-none font-mono text-xs' : undefined}>
            <MonitorIcon /> 跟随系统
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
