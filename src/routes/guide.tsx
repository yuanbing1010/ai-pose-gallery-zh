import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
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
  WandSparklesIcon,
} from 'lucide-react'
import { costumesQuery, portraitsQuery, posesQuery } from '@/api/gallery'
import { StyleWheelDeck } from '@/components/guide/StyleWheelDeck'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/notifications'
import { getVisualStylePresets } from '@/lib/stylePresets'
import { useStudio } from '@/store/studioStore'
import {
  MIO_ARCHIVE_ORIGIN,
  MIO_AUTHOR_HANDLE,
  MIO_AUTHOR_NAME,
  MIO_AUTHOR_URL,
} from '../../shared/mioArchive'

export const Route = createFileRoute('/guide')({
  staticData: { title: '使用指南' },
  component: GuidePage,
})

const EASE_OUT = [0.22, 1, 0.36, 1] as const

const STEPS = [
  {
    code: '01',
    accent: '#D9381E',
    badgeClass: 'bg-[#D9381E]/12 text-[#B82914] dark:text-[#FF7A59]',
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
    badgeClass: 'bg-[#E5A918]/15 text-[#7A5200] dark:text-[#E5A918]',
    icon: UserRoundIcon,
    title: '人像颜值库',
    count: '1,499 张',
    summary: '按正脸 / 造型氛围、4 种发长与 51 种细分发型筛选高清人像，也可在合成台上传照片锁定五官与发色。',
    chips: ['正脸参考', '造型氛围', '51 款发型', '支持自传面部'],
    to: '/portraits' as const,
    cta: '前往人像库',
  },
] as const

const OBSERVATION_STEPS = [
  {
    no: '01',
    title: '先看构图重心',
    body: '确定需要全身立绘、七分半身还是近景特写，并在姿势库挑选对应视角或开启深度图约束，稳定画面骨架。',
  },
  {
    no: '02',
    title: '再定光线与色温',
    body: '把模糊的“好看氛围”写成具体光源，例如影棚柔和漫反射、金色侧逆光或阴天散射光，避免画面平淡。',
  },
  {
    no: '03',
    title: '补充材质与环境',
    body: '标注衣料垂坠感、缝线纹理或背景景深（如纯净暖白影棚、虚化街头光斑），大幅提升立绘完成度。',
  },
  {
    no: '04',
    title: '成图设为附图迭代',
    body: '满意雏形后，在监视器或云端作品集中一键「设为附图」，锁定五官或主造型继续微调光影与穿搭细节。',
  },
] as const

const DETAIL_RECIPES = [
  {
    label: '棚拍清透人像',
    text: '膝上七分半身构图，影棚级柔和漫反射主光，肤色通透自然，干净纯粹浅暖白影棚背景',
  },
  {
    label: '电影逆光戏剧感',
    text: '全身完整出镜，金色侧逆光勾勒发丝与肩部轮廓光，轻微仰拍广角透视，虚化城市日系街头背景',
  },
  {
    label: '国风工笔留白',
    text: '轻盈垂坠丝绸与自然风动衣褶质感，保留轻盈水彩纸纹与温润手绘笔触，中式园林木构回廊浅景深',
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
  const { platform, setSceneNote } = useStudio()
  const navigate = useNavigate()
  const { data: posesData } = useQuery(posesQuery)
  const { data: costumes } = useQuery(costumesQuery)
  const { data: portraits } = useQuery(portraitsQuery)

  const styleCount = getVisualStylePresets(platform).length
  const poseCount = posesData?.items.length ?? 1689
  const costumeCount = costumes?.length ?? 3341
  const portraitCount = portraits?.length ?? 1499
  const giaRealisticCount = costumes
    ? costumes.filter((c) => !c.source && c.一级分类 !== '二次元').length
    : 1407
  const giaAnimeCount = costumes
    ? costumes.filter((c) => c.source === 'gia-anime' || (!c.source && c.一级分类 === '二次元')).length
    : 1320
  const shiseiCount = costumes ? costumes.filter((c) => c.source === 'shisei').length : 57
  const charadbCount = costumes ? costumes.filter((c) => c.source === 'charadb').length : 440
  const mioPoseCount = posesData ? posesData.items.filter((p) => p.source === 'mio').length : 250
  const mioCostumeCount = costumes ? costumes.filter((c) => c.source === 'mio').length : 117

  const stepCounts: Record<string, string> = {
    '/poses': `${poseCount.toLocaleString('zh-CN')} 张`,
    '/costumes': `${costumeCount.toLocaleString('zh-CN')} 套`,
    '/portraits': `${portraitCount.toLocaleString('zh-CN')} 张`,
  }

  const statMatrix = [
    { label: '动作姿势', value: poseCount.toLocaleString('zh-CN'), to: '/poses' as const },
    { label: '服装穿搭', value: costumeCount.toLocaleString('zh-CN'), to: '/costumes' as const },
    { label: '人像参考', value: portraitCount.toLocaleString('zh-CN'), to: '/portraits' as const },
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
            <span>CASTDECK · 创作指南</span>
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
          className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-4 sm:divide-y-0"
        >
          {statMatrix.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="px-3.5 py-2.5 text-center transition-colors hover:bg-muted/60 sm:px-5"
            >
              <div className="text-xs whitespace-nowrap text-muted-foreground">{item.label}</div>
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
            {/* 公式条（扁平分隔避免卡片嵌套） */}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-border/75 pt-4 text-xs sm:gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/45 px-2.5 py-1 font-semibold text-foreground">
                <span className="size-2 rounded-full bg-[#D9381E]" />
                01 选姿势
              </span>
              <span className="hidden font-mono text-muted-foreground sm:inline">+</span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/45 px-2.5 py-1 font-semibold text-foreground">
                <span className="size-2 rounded-full bg-[#19857B]" />
                02 选穿搭
              </span>
              <span className="hidden font-mono text-muted-foreground sm:inline">+</span>
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/45 px-2.5 py-1 font-semibold text-foreground">
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
                  <span className="font-mono text-xs font-semibold text-muted-foreground">
                    {stepCounts[step.to] ?? step.count}
                  </span>
                </div>
                <h2 className="mt-3 text-base font-extrabold tracking-tight">{step.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{step.summary}</p>

                <div className="mt-3.5 flex flex-wrap gap-1.5 border-t border-border/65 pt-3">
                  {step.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-md border border-border/80 bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      {chip}
                    </span>
                  ))}
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

      {/* 高对比暗房观察与拆解工作流（吸收自排版对比带设计） */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, delay: 0.16, ease: EASE_OUT }}
        className="overflow-hidden rounded-[24px] border border-white/10 bg-[#121210] text-zinc-100"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-white/10 px-6 py-6 sm:flex-row sm:items-end sm:px-8">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wider text-[#E5A918]">
              <span>OBSERVE &amp; COMPOSE</span>
            </div>
            <h2 className="text-lg font-extrabold tracking-tight text-white sm:text-xl">
              四步拆解好画面 · 一键带入合成细节
            </h2>
            <p className="text-xs leading-relaxed text-zinc-400">
              参考图负责“动作 / 穿搭 / 五官”实体约束，画面细节负责“景别 / 光线 / 材质 / 背景”氛围控制。
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-9 shrink-0 rounded-full border-white/20 bg-white/5 px-4 text-xs font-semibold text-white hover:bg-white/15 hover:text-white"
          >
            <Link to="/studio">
              <SparklesIcon className="size-3.5 text-[#E5A918]" />
              <span>打开合成工作台</span>
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          {OBSERVATION_STEPS.map((item) => (
            <div key={item.no} className="space-y-2.5 p-6">
              <div className="font-mono text-xs font-bold tracking-widest text-[#E5A918]">
                {item.no}
              </div>
              <h3 className="text-sm font-extrabold text-white">{item.title}</h3>
              <p className="text-xs leading-relaxed text-zinc-400">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/[0.03] px-6 py-4 sm:px-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <WandSparklesIcon className="size-3.5 text-[#D9381E]" />
            <span>试试带入一组结构化画面细节：</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {DETAIL_RECIPES.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setSceneNote(preset.text)
                  toast.success(`已填入「${preset.label}」画面细节`)
                  void navigate({ to: '/studio' })
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-white/8 px-3 text-xs font-semibold text-white transition hover:border-[#E5A918]/60 hover:bg-white/15"
              >
                <span>{preset.label}</span>
                <ArrowRightIcon className="size-3 text-zinc-400" />
              </button>
            ))}
          </div>
        </div>
      </motion.section>

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
                <span className="mr-1.5 font-mono font-bold text-[#B82914] dark:text-[#FF7A59]">{rule.no}</span>
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
              基础人体动态（白模与深度图）、写实服装（{giaRealisticCount.toLocaleString('zh-CN')}）、动漫服装（{giaAnimeCount.toLocaleString('zh-CN')}）与人像参考（{portraitCount.toLocaleString('zh-CN')}）源自原作者公开图集并作中文本地化整理；仅限学习与艺术创作参考，严禁将原始图片打包转售或付费分发。
            </p>
            <p>
              <strong className="mr-1 text-foreground">Shisei &amp; CharaDB：</strong>
              {shiseiCount} 套中国历代多视角服饰源自 Shisei（仅作造型参考，非专业历史复原）；{charadbCount} 套二次元穿搭源自{' '}
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
            <p>
              <strong className="mr-1 text-foreground">霧島澪 · 设计档案：</strong>
              {mioPoseCount.toLocaleString('zh-CN')} 项人体动态姿势与 {mioCostumeCount.toLocaleString('zh-CN')} 套主题服装源自{' '}
              <a
                className="font-semibold text-foreground underline hover:opacity-80"
                href={MIO_ARCHIVE_ORIGIN}
                target="_blank"
                rel="noopener noreferrer"
              >
                sleepyzone.online/mio-design-archive
              </a>
              ，设计与图片版权归原网站及原作者{' '}
              <a
                className="font-semibold text-foreground underline hover:opacity-80"
                href={MIO_AUTHOR_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                {MIO_AUTHOR_NAME}（{MIO_AUTHOR_HANDLE}）
              </a>
              {' '}所有；图片由原站在线加载，仅限学习与创作参考，禁止二次分发或商业再发布。
            </p>
          </div>
        </section>
      </motion.footer>
    </div>
  )
}
