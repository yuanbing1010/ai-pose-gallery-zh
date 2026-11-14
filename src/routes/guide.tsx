import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  DicesIcon,
  LayersIcon,
  PersonStandingIcon,
  ShieldCheckIcon,
  ShirtIcon,
  SparklesIcon,
  UserRoundIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/guide')({
  staticData: { title: '使用指南与免责声明' },
  component: GuidePage,
})

const STEPS = [
  {
    code: '01',
    accent: '#E5A918',
    badgeClass: 'bg-[#E5A918]/15 text-[#9A6B00] dark:text-[#E5A918]',
    icon: UserRoundIcon,
    title: '人像颜值库',
    count: '1,499 张',
    summary: '按正脸 / 造型氛围、4 种发长与 51 种细分发型检索 CC0 人像参考，也可在合成台上传自定义面部图，锁定角色五官与发色特征。',
    to: '/portraits' as const,
    cta: '浏览人像卡',
  },
  {
    code: '02',
    accent: '#19857B',
    badgeClass: 'bg-[#19857B]/12 text-[#116E65] dark:text-[#4FD1C5]',
    icon: ShirtIcon,
    title: '服装穿搭库',
    count: '3,224 套',
    summary: '融合 ギア写实（1,407）、Shisei 中国历代多视角（57 套 / 227 视角）、ギア动漫（1,320）与 CharaDB 二次元（440），覆盖全品类穿搭剪裁与配饰。',
    to: '/costumes' as const,
    cta: '浏览服装卡',
  },
  {
    code: '03',
    accent: '#D9381E',
    badgeClass: 'bg-[#D9381E]/12 text-[#D9381E] dark:text-[#FF7A59]',
    icon: PersonStandingIcon,
    title: '动作姿势 & 13 画风合成',
    count: '1,439 张',
    summary: '覆盖 4 大动作体系与 5 种镜头视角，支持素体白模与深度图（Depth）一键切换；搭配 13 种可视化成图画风与自由细节描述，直连云端模型或本地 ComfyUI。',
    to: '/poses' as const,
    cta: '浏览姿势卡',
  },
] as const

const LEGAL_RULES = [
  {
    no: '01',
    title: '仅供学习与合法艺术创作',
    body: '本图库与合成台仅用于人体结构研究、插画构图参考与技术交流。严禁用于制作传播违法违规、淫秽色情或暴力内容；严禁未经授权上传真实人物照片进行换脸或深伪合成。',
  },
  {
    no: '02',
    title: '默认安全模式与年龄限制',
    body: '图库包含部分 18+ 人体动态与性感穿搭参考，系统默认开启「安全模式 (SFW)」屏蔽敏感分类。未满 18 周岁的未成年人严禁关闭安全模式或访问相关内容。',
  },
  {
    no: '03',
    title: '本地隐私与责任归属',
    body: '本工作台为纯前端/本地工具，API Key 仅保存在浏览器本地，平台不收集、不存储任何用户上传图片或成图；使用者对其生成内容与行为独立承担全部法律责任。',
  },
] as const

export function GuidePage() {
  return (
    <div className="space-y-5">
      {/* 画册级顶栏引导卡 */}
      <section className="ks-elevation relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-[#FAF8F4] px-3 py-1 font-mono text-xs font-semibold text-muted-foreground dark:bg-muted/50">
              <span className="size-1.5 rounded-full bg-[#D9381E]" />
              <span>GUIDE // 三合一角色参考与合成指南</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              从盲盒抽卡到角色立绘，三步完成创作闭环
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              在首页撕开盲盒获取灵感，或在三大图库精确挑卡，最后在工作台选择 13 种直觉画风与 5 大 AI 引擎一键出图。
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Button variant="outline" className="h-10 rounded-full bg-card px-4 text-xs font-semibold" asChild>
              <Link to="/">
                <DicesIcon className="size-4 text-[#E5A918]" />
                <span>去盲盒抽卡</span>
              </Link>
            </Button>
            <Button
              className="ks-keycap h-10 rounded-full border-0 bg-[#D9381E] px-5 text-xs font-bold text-white hover:bg-[#C23018]"
              asChild
            >
              <Link to="/studio">
                <SparklesIcon className="size-4" />
                <span>进入 AI 合成台</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 三轨卡片流程：可点击直达对应图库 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {STEPS.map((step) => {
          const Icon = step.icon
          return (
            <div
              key={step.code}
              className="ks-elevation group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-5 top-0 h-0.5 rounded-b-full"
                style={{ backgroundColor: step.accent }}
              />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs font-bold ${step.badgeClass}`}
                  >
                    <Icon className="size-3.5" />
                    <span>{step.code}</span>
                  </span>
                  <span className="font-mono text-xs font-semibold text-muted-foreground">{step.count}</span>
                </div>
                <h2 className="mt-3 text-base font-extrabold tracking-tight">{step.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.summary}</p>
              </div>

              <div className="mt-4 border-t border-border/70 pt-3">
                <Link
                  to={step.to}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground transition-colors hover:text-[#D9381E]"
                >
                  <span>{step.cta}</span>
                  <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          )
        })}
      </section>

      {/* 合规底线 + 数据版权矩阵 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="ks-elevation rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-[#116E65] dark:text-[#4FD1C5]" />
            <h2 className="text-base font-extrabold tracking-tight">免责声明与合规规范</h2>
          </div>
          <div className="space-y-2.5">
            {LEGAL_RULES.map((rule) => (
              <div
                key={rule.no}
                className="rounded-2xl border border-border/80 bg-[#FAF8F4] p-3.5 dark:bg-muted/25"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#D9381E]">{rule.no}</span>
                  <h3 className="text-xs font-bold text-foreground">{rule.title}</h3>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{rule.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ks-elevation rounded-3xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <LayersIcon className="size-4 text-[#B88300] dark:text-[#E5A918]" />
            <h2 className="text-base font-extrabold tracking-tight">数据来源与开源边界</h2>
          </div>
          <div className="space-y-2.5">
            <div className="rounded-2xl border border-border/80 bg-[#FAF8F4] p-3.5 dark:bg-muted/25">
              <div className="text-xs font-bold text-foreground">原作者图库归属（ギア / @giaaibusi）</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                原有姿势（白模与 Depth）、写实服装（1,407）、动漫服装（1,320）与人像库（1,499）数据源自原作者公开站点，其中人像库遵循{' '}
                <strong className="text-[#116E65] dark:text-[#4FD1C5]">CC0 1.0 协议</strong>；本仓库仅作中文本地化与前端工程学习存档，严禁将原始图片打包转售或付费分发。
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-[#FAF8F4] p-3.5 dark:bg-muted/25">
              <div className="text-xs font-bold text-foreground">中国历代服饰（Shisei）与二次元（CharaDB）</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                57 套中国历代多视角服装源自 Shisei；440 套二次元服装源自{' '}
                <a
                  className="font-semibold underline hover:text-foreground"
                  href="https://charadb-2fi.pages.dev/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  たき AI · CharaDB
                </a>
                （标签遵循 CC0，图片在线加载，禁止用于真人/未成年人或二次分发，详见{' '}
                <a
                  className="font-semibold underline hover:text-foreground"
                  href="https://github.com/taki-ttt/charadb/blob/main/LICENSE"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  原作者 LICENSE
                </a>
                ）。
              </p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-[#FAF8F4] p-3.5 dark:bg-muted/25">
              <div className="text-xs font-bold text-foreground">前端代码与 ComfyUI 插件开源协议</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                前端应用代码（<code>src/</code>）、ComfyUI 自定义节点（<code>comfyui_plugin/</code>）与维护脚本以{' '}
                <strong className="text-foreground">MIT 协议</strong> 开源；图库图片与原始元数据不在此 MIT 协议覆盖范围内。
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
