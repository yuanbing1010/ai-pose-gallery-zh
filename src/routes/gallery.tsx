import { createFileRoute } from '@tanstack/react-router'
import { GalleryExperience } from '@/components/gallery/GalleryExperience'

export const Route = createFileRoute('/gallery')({
  staticData: { title: '灵感画廊' },
  component: GalleryExperience,
})
