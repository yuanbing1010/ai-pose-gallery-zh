import { createFileRoute, Link, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  staticData: { title: '系统配置已迁移至管理端' },
  beforeLoad: () => {
    throw redirect({ to: '/admin/login' })
  },
  component: SettingsRedirectPage,
})

function SettingsRedirectPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm text-muted-foreground">API 配置、用户积分、NSFW 设置与默认提示词已迁移至管理端。</p>
      <Link to="/admin/login" className="mt-4 inline-block underline">
        前往管理端登录 →
      </Link>
    </div>
  )
}
