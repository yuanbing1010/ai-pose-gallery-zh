import { useCallback, useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { PackStage, type DrawnPack } from '@/components/home/PackStage'
import { hasPoseDepthMap } from '@/lib/recipeImages'
import { getStudioMuted, setStudioMuted } from '@/lib/studioAudio'
import { useStudio } from '@/store/studioStore'

export function BlindboxExperience() {
  const { data: posesData } = useSuspenseQuery(posesQuery)
  const { data: costumes } = useSuspenseQuery(costumesQuery)
  const { data: portraits } = useSuspenseQuery(portraitsQuery)
  const { setPortrait, setCostume, setPose, poseDepthMode } = useStudio()

  const [packSeed, setPackSeed] = useState(0)
  const [muted, setMuted] = useState(() => getStudioMuted())

  const rollDrawnPack = useCallback((): DrawnPack | null => {
    if (!posesData.items.length || !costumes.length || !portraits.length) return null
    const pickedPose = posesData.items[Math.floor(Math.random() * posesData.items.length)]
    return {
      portrait: portraits[Math.floor(Math.random() * portraits.length)],
      costume: costumes[Math.floor(Math.random() * costumes.length)],
      pose: {
        ...pickedPose,
        useDepth: hasPoseDepthMap(pickedPose) ? poseDepthMode : false,
      },
    }
  }, [posesData.items, costumes, portraits, poseDepthMode])

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

  const totalReferenceCount = posesData.items.length + costumes.length + portraits.length

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">CASTDECK 3-IN-1 角色配方盲盒抽卡</h1>
      {drawnPack && (
        <PackStage
          variant="inline"
          drawn={drawnPack}
          totalCount={totalReferenceCount}
          packSeed={packSeed}
          muted={muted}
          onToggleMute={() => {
            setMuted((m) => {
              const next = !m
              setStudioMuted(next)
              return next
            })
          }}
          onRedraw={handleRedraw}
          onSynthesize={handleSynthesize}
          onSynthesizeSlot={handleSynthesizeSlot}
        />
      )}
    </div>
  )
}
