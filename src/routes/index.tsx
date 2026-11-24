import { createFileRoute } from '@tanstack/react-router'
import { CreativeHubExperience } from '@/components/home/CreativeHubExperience'

export const Route = createFileRoute('/')({
  staticData: { title: '全能 AI 视觉工坊' },
  component: HomePage,
})

function HomePage() {
  return <CreativeHubExperience />
}
