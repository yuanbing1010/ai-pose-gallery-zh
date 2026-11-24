import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpIcon } from 'lucide-react'
import { MOTION_EASE_OUT, prefersReducedMotionNow } from '@/lib/motionTokens'

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 560)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          aria-label="回到顶部"
          title="回到顶部"
          initial={{ opacity: 0, y: 12, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: MOTION_EASE_OUT } }}
          exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.14, ease: MOTION_EASE_OUT } }}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotionNow() ? 'auto' : 'smooth' })}
          className="md-glass fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] z-25 flex size-11 items-center justify-center rounded-full border border-border text-foreground shadow-md transition-colors hover:bg-card sm:right-6 sm:bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:size-10 lg:bottom-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <ArrowUpIcon className="size-4" />
        </motion.button>
      )}
    </AnimatePresence>
  )
}
