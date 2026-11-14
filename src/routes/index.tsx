import { useCallback, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { costumesQuery, isNsfwCostume, isNsfwPose, portraitsQuery, posesQuery } from '@/api/gallery'
import { PackStage, type DrawnPack } from '@/components/home/PackStage'
import { Skeleton } from '@/components/ui/skeleton'
import { useStudio } from '@/store/studioStore'

export const Route = createFileRoute('/')({
  staticData: { title: '盲盒抽卡' },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(posesQuery),
      context.queryClient.ensureQueryData(costumesQuery),
      context.queryClient.ensureQueryData(portraitsQuery),
    ]),
  pendingComponent: () => (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-1 flex-col items-center justify-center gap-6 px-4">
      <Skeleton className="h-6 w-56 rounded-full" />
      <Skeleton className="h-[340px] w-[235px] rounded-2xl border border-border sm:h-[390px] sm:w-[270px]" />
      <Skeleton className="h-14 w-full max-w-3xl rounded-[22px]" />
    </div>
  ),
  component: DashboardPage,
})

function DashboardPage() {
  const { data: posesData } = useSuspenseQuery(posesQuery)
  const { data: costumes } = useSuspenseQuery(costumesQuery)
  const { data: portraits } = useSuspenseQuery(portraitsQuery)
  const {
    setPortrait,
    setCostume,
    setPose,
    poseDepthMode,
    safeMode,
  } = useStudio()

  const [packSeed, setPackSeed] = useState(0)
  const [muted, setMuted] = useState(false)

  const sfwCostumes = costumes.filter(
    (c) => !c.source && c.一级分类 !== '二次元' && (!safeMode || !isNsfwCostume(c))
  )

  const rollDrawnPack = useCallback((): DrawnPack | null => {
    const posePool = safeMode ? posesData.items.filter((p) => !isNsfwPose(p)) : posesData.items
    if (!posePool.length || !sfwCostumes.length || !portraits.length) return null
    return {
      portrait: portraits[Math.floor(Math.random() * portraits.length)],
      costume: sfwCostumes[Math.floor(Math.random() * sfwCostumes.length)],
      pose: {
        ...posePool[Math.floor(Math.random() * posePool.length)],
        useDepth: poseDepthMode,
      },
    }
  }, [posesData.items, sfwCostumes, portraits, poseDepthMode, safeMode])

  const [drawnPack, setDrawnPack] = useState<DrawnPack | null>(() => rollDrawnPack())

  const handleRedraw = useCallback(() => {
    const next = rollDrawnPack()
    if (next) {
      setDrawnPack(next)
      setPackSeed((s) => s + 1)
    }
  }, [rollDrawnPack])

  const handleSynthesize = useCallback(
    (pack: DrawnPack) => {
      setPortrait(pack.portrait)
      setCostume(pack.costume)
      setPose(pack.pose)
    },
    [setPortrait, setCostume, setPose]
  )

  const handleSynthesizeSlot = useCallback(
    (slot: 'portrait' | 'costume' | 'pose', pack: DrawnPack) => {
      if (slot === 'portrait') setPortrait(pack.portrait)
      else if (slot === 'costume') setCostume(pack.costume)
      else setPose(pack.pose)
    },
    [setPortrait, setCostume, setPose]
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {drawnPack && (
        <PackStage
          variant="inline"
          drawn={drawnPack}
          packSeed={packSeed}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          onRedraw={handleRedraw}
          onSynthesize={handleSynthesize}
          onSynthesizeSlot={handleSynthesizeSlot}
        />
      )}
    </div>
  )
}
