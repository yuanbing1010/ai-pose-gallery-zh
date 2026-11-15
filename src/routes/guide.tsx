import { createFileRoute, Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
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
import { StyleWheelDeck } from '@/components/guide/StyleWheelDeck'
import { Button } from '@/components/ui/button'
import { getVisualStylePresets } from '@/lib/stylePresets'
import { useStudio } from '@/store/studioStore'

export const Route = createFileRoute('/guide')({
  staticData: { title: '使用指南' },
  component: GuidePage,
})

const EASE_OUT = [0.22, 1, 0.36, 1] as const

const STEPS = [
  {
    code: '01',
    accent: '#D9381E',
    badgeClass: 'bg-[#D9381E]/12 text-[#D9381E] dark:text-[#FF7A59]',
    icon: PersonStandingIcon,
    title: '动作姿势库',
    count: '1,439 张',
    summary: '覆盖多种人体动态与 5 种镜头视角，支持素体白模与深度图一键切换，快速锁定角色肢体动作与构图角度。',
    chips: ['5 视角叠牌', '白模 / 深度切换', '站坐卧特写', '4 大动作体系'],
    to: '/poses' as const,
    cta: '前往姿势库',
  },
  {
    code: '02',
    accent: '#19857B',
    badgeClass: 'bg-[#19857B]/12 text-[#116E65] dark:text-[#4FD1C5]',
    icon: ShirtIcon,
    title: '服装穿搭库',
    count: '3,224 套',
    summary: '覆盖现实写真、动漫次元与中国历代服饰多视角卡组，点击单品标签即可一键筛选同款材质与色彩。',
    chips: ['现实写真', '动漫次元', '中国历代', '多视角叠牌'],
    to: '/costumes' as const,
    cta: '前往服装库',
  },
  {
    code: '03',
    accent: '#E5A918',
    badgeClass: 'bg-[#E5A918]/15 text-[#9A6B00] dark:text-[#E5A918]',
    icon: UserRoundIcon,
    title: '人像颜值库',
    count: '1,499 张',
    summary: '按正脸 / 造型氛围、4 种发长与 51 种细分发型筛选高清人像，也可在合成台上传照片锁定五官与发色。',
    chips: ['正脸参考', '造型氛围', '51 款发型', '支持自传面部'],
    to: '/portraits' as const,
    cta: '前往人像库',
  },
] as const

const LEGAL_RULES = [
  {
    no: '01',
    title: '仅限学习与合法艺术创作',
    body: '本图库与合成台仅用于绘画构图、人体动态研究与艺术创作交流。严禁用于制作传播违法违规、低俗色情或暴力内容；严禁未经授权上传真实人物照片进行换脸或侵权合成。',
  },
  {
    no: '02',
    title: '账号积分与云端存档',
    body: '注册登录后将根据平台策略获赠初始积分；每次云端生图消耗对应积分（失败自动全额退还），生成记录与配方快照保存在云端作品集中以便跨设备回看。使用者对其上传素材与生成内容独立承担全部法律责任。',
  },
] as const

function GuidePage() {
  const { platform } = useStudio()
  const styleCount = getVisualStylePresets(platform).length
  const statMatrix = [
    { label: '动作姿势', value: '1,439', to: '/poses' as const },
    { label: '服装穿搭', value: '3,224', to: '/costumes' as const },
    { label: '人像参考', value: '1,499', to: '/portraits' as const },
    { label: '成图画风', value: String(styleCount), to: '/studio' as const },
  ] as const

  return (
    <div className="space-y-5">
      {/* 与三库完全一致的编辑杂志顶栏 + 右侧 1px 统计矩阵 */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: EASE_OUT }}
        className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block h-px w-5 bg-foreground/40" aria-hidden="true" />
            <span>CASTDECK 造角牌 · 创作指南</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            使用指南与创作规范
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            盲盒获取灵感 · 三库精确挑卡 · 合成台多画风一键立绘
          </p>
        </div>

        <div
          aria-label="图库规模概览"
          className="grid grid-cols-4 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card"
        >
          {statMatrix.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="px-3.5 py-2.5 text-center transition-colors hover:bg-muted/60 sm:px-5"
            >
              <div className="text-[11px] whitespace-nowrap text-muted-foreground">{item.label}</div>
              <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-foreground">
                {item.value}
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      {/* 视觉主展台：左侧配方公式与直达按钮 + 右侧全画风动态轮盘 */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.04, ease: EASE_OUT }}
        className="ks-elevation grid grid-cols-1 overflow-hidden rounded-[24px] border border-border bg-card lg:grid-cols-[1.08fr_1fr]"
      >
        <div className="flex flex-col justify-between gap-5 p-6 sm:p-8">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-[#FAF8F4] px-3 py-1 font-mono text-xs font-semibold text-muted-foreground dark:bg-muted/50">
              <span className="size-1.5 rounded-full bg-[#D9381E]" />
              <span>3-IN-1 // 姿势 + 服装 + 人像</span>
            </div>
            <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              像组卡组一样，三步完成角色立绘
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              在首页撕开盲盒抽卡，或在三大图库挑出满意的动作、穿搭与五官，点击锁入底部配方坞，进入合成台即可挑选画风与画师出图。
            </p>
          </div>

          <div className="space-y-4">
            {/* 实体凹槽公式条 */}
            <div className="ks-recess flex flex-wrap items-center gap-2 rounded-2xl border border-border/75 p-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 font-semibold text-foreground shadow-2xs">
                <span className="size-2 rounded-full bg-[#D9381E]" />
                01 选姿势
              </span>
              <span className="font-mono text-muted-foreground">+</span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 font-semibold text-foreground shadow-2xs">
                <span className="size-2 rounded-full bg-[#19857B]" />
                02 选穿搭
              </span>
              <span className="font-mono text-muted-foreground">+</span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 font-semibold text-foreground shadow-2xs">
                <span className="size-2 rounded-full bg-[#E5A918]" />
                03 选人像
              </span>
              <ArrowRightIcon className="size-3.5 text-muted-foreground" />
              <span className="inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1 font-semibold text-background">
                <SparklesIcon className="size-3" />
                {styleCount} 画风成图
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                variant="outline"
                className="h-10 rounded-full bg-card px-5 text-xs font-semibold transition-transform active:scale-[0.97]"
                asChild
              >
                <Link to="/">
                  <DicesIcon className="size-4 text-[#E5A918]" />
                  <span>去首页抽盲盒</span>
                </Link>
              </Button>
              <Button
                className="ks-keycap h-10 rounded-full border-0 bg-[#D9381E] px-6 text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#C23018] active:scale-[0.97]"
                asChild
              >
                <Link to="/studio">
                  <SparklesIcon className="size-4" />
                  <span>进入角色合成台</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* 右侧：可拖动轮盘卡牌展台（动态读取全站全部画风） */}
        <StyleWheelDeck />
      </motion.section>

      {/* 三轨卡片流程：统一高度与凹槽标签 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {STEPS.map((step, idx) => {
          const Icon = step.icon
          return (
            <motion.div
              key={step.code}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.08 + idx * 0.05, ease: EASE_OUT }}
              whileHover={{ y: -3 }}
              className="ks-elevation group relative flex flex-col justify-between overflow-hidden rounded-[22px] border border-border bg-card p-5 transition-colors hover:border-foreground/25"
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

                <div className="ks-recess mt-3.5 rounded-xl border border-border/75 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {step.chips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded-md border border-border/80 bg-card px-2 py-0.5 text-[11px] font-medium text-foreground shadow-2xs"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-border/70 pt-3">
                <Link
                  to={step.to}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground transition-colors hover:text-[#D9381E]"
                >
                  <span>{step.cta}</span>
                  <ArrowRightIcon className="size-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </motion.div>
          )
        })}
      </section>

      {/* 底部编排：1px 分隔画册版本页脚（使用规范 + 来源归属） */}
      <motion.footer
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.2, ease: EASE_OUT }}
        className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-[22px] border border-border bg-card lg:grid-cols-2 lg:divide-x lg:divide-y-0"
      >
        <section className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-[#116E65] dark:text-[#4FD1C5]" />
            <h2 className="text-sm font-extrabold tracking-tight">使用规范与免责声明</h2>
          </div>
          <div className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
            {LEGAL_RULES.map((rule) => (
              <p key={rule.no}>
                <span className="mr-1.5 font-mono font-bold text-[#D9381E]">{rule.no}</span>
                <strong className="mr-1 text-foreground">{rule.title}：</strong>
                {rule.body}
              </p>
            ))}
          </div>
        </section>

        <section className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <LayersIcon className="size-4 text-[#B88300] dark:text-[#E5A918]" />
            <h2 className="text-sm font-extrabold tracking-tight">参考素材来源说明</h2>
          </div>
          <div className="space-y-2.5 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="mr-1 text-foreground">ギア（@giaaibusi）：</strong>
              基础人体动态（白模与深度图）、写实服装（1,407）、动漫服装（1,320）与人像参考（1,499）源自原作者公开图集并作中文本地化整理；仅限学习与艺术创作参考，严禁将原始图片打包转售或付费分发。
            </p>
            <p>
              <strong className="mr-1 text-foreground">Shisei &amp; CharaDB：</strong>
              57 套中国历代多视角服饰源自 Shisei（仅作造型参考，非专业历史复原）；440 套二次元穿搭源自{' '}
              <a
                className="font-semibold text-foreground underline hover:opacity-80"
                href="https://charadb-2fi.pages.dev/"
                target="_blank"
                rel="noopener noreferrer"
              >
                たき AI · CharaDB
              </a>
              （仅作绘画参考，禁止用于真人、未成年人或二次分发，详见{' '}
              <a
                className="font-semibold text-foreground underline hover:opacity-80"
                href="https://github.com/taki-ttt/charadb/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
              >
                原作者条款
              </a>
              ）。
            </p>
          </div>
        </section>
      </motion.footer>
    </div>
  )
}
