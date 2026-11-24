import { createFileRoute } from '@tanstack/react-router'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { BlindboxExperience } from '@/components/home/BlindboxExperience'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/blindbox')({
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
  component: BlindboxExperience,
})
