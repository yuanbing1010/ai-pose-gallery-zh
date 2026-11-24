import { useState } from 'react'
import { MinusIcon, PlusIcon } from 'lucide-react'
import { playMechanicalSwitch } from '@/lib/tactileFoley'
import { cn } from '@/lib/utils'

const PROCESS_STAGES = [
  {
    code: '01',
    title: '自由文生图',
    enTitle: 'DIRECT PROMPT STUDIO',
    summary: '支持黄铜灵感摇词与自由编写描述，五路云端暗房引擎高分辨率直出，作品云端同步。',
  },
  {
    code: '02',
    title: '公共灵感画廊',
    enTitle: 'CURATED GALLERY',
    summary: '每日精选双语提示词与社区佳作，支持点赞珍藏、评论交流与一键同款复刻。',
  },
  {
    code: '03',
    title: '无限节点画布',
    enTitle: 'INFINITE CANVAS',
    summary: '自由拖线编排提示词、光学与参考标本，支持画布内原地并行 A/B 出图与链式迭代。',
  },
  {
    code: '04',
    title: '实体角色图鉴',
    enTitle: 'CHARACTER ARCHIVES',
    summary: '动作姿势（含原始白模与 3D 深度骨骼）、服装穿搭与人像颜值三卷合璧，精准控图。',
  },
  {
    code: '05',
    title: '烫金盲盒抽卡',
    enTitle: 'TACTILE BLINDBOX',
    summary: '手撕锯齿箔袋随机掉落姿势、穿搭与人像三卡，用意外组合打破创作空白。',
  },
] as const

export function SantalProcessAccordion() {
  const [openCode, setOpenCode] = useState<string>('01')

  return (
    <section
      className="ks-obsidian-stage dark relative w-full overflow-x-clip border-y border-[#E5A918]/22 py-20 text-[#F5F1E8] lg:py-28"
    >
      <span
        aria-hidden="true"
        className="ks-foil-hairline pointer-events-none absolute inset-x-0 top-0 h-[1px]"
      />

      <div className="relative z-10 mx-auto grid w-full max-w-[1360px] grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:px-10">
        <div className="space-y-3 lg:sticky lg:top-32 lg:col-span-5 lg:self-start">
          <div className="ed-eyebrow flex items-center gap-2 text-[#E5A918]">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#D9381E]" />
            <span>02 · WORKFLOW</span>
          </div>
          <h2 className="ed-headline-tight text-3xl font-bold text-white sm:text-5xl">
            <span>五条链路，</span>
            <br />
            <span className="font-bold text-[#F5C443]">
              同一间暗房。
            </span>
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-[#A9A192]">
            从起念到成片，所有能力都在顶部导航一键直达。
          </p>
        </div>

        <div className="divide-y divide-white/12 border-y border-white/12 lg:col-span-7">
          {PROCESS_STAGES.map((item) => {
            const expanded = openCode === item.code
            return (
              <div key={item.code} className="group">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => {
                    playMechanicalSwitch(expanded ? 0.92 : 1.06)
                    setOpenCode(expanded ? '' : item.code)
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left transition-colors"
                >
                  <div className="flex items-baseline gap-4 sm:gap-6">
                    <span className="font-mono text-xs font-bold text-[#E5A918]/80">
                      {item.code}
                    </span>
                    <div>
                      <div
                        className={cn(
                          'text-xl font-bold tracking-tight transition-colors sm:text-3xl',
                          expanded ? 'text-white' : 'text-white/70 group-hover:text-white/95'
                        )}
                      >
                        {item.title}
                      </div>
                      <div className="mt-1 font-mono text-xs tracking-wider text-[#A9A192]">
                        {item.enTitle}
                      </div>
                    </div>
                  </div>

                  <span
                    className={cn(
                      'flex size-8.5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150',
                      expanded
                        ? 'border-[#E5A918]/60 bg-[#E5A918]/15 text-[#F5C443]'
                        : 'border-white/15 text-white/60 group-hover:border-white/40 group-hover:text-white'
                    )}
                  >
                    {expanded ? <MinusIcon className="size-4" /> : <PlusIcon className="size-4" />}
                  </span>
                </button>

                <div
                  data-open={expanded ? 'true' : 'false'}
                  aria-hidden={!expanded}
                  className="ks-accordion-grid"
                >
                  <div className="ks-accordion-inner">
                    <p className="max-w-xl pr-2 pb-5 pl-8 text-sm leading-relaxed text-[#D6CEC0] sm:pl-11">
                      {item.summary}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
