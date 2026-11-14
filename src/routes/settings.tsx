import { createFileRoute, Link, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  staticData: { title: '系统配置已迁移至管理端' },
  beforeLoad: () => {
    const authed = typeof window !== 'undefined' && sessionStorage.getItem('pose_atlas_admin_auth') === '1'
    throw redirect({ to: authed ? '/admin' : '/admin/login' })
  },
  component: SettingsRedirectPage,
})

function SettingsRedirectPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="text-sm text-muted-foreground">API 配置、NSFW 设置与默认提示词已迁移至管理端。</p>
      <Link to="/admin/login" className="mt-4 inline-block underline">
        前往管理端登录 →
      </Link>
    </div>
  )
}
