import { LayersIcon, ShieldCheckIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  MIO_ARCHIVE_ORIGIN,
  MIO_AUTHOR_HANDLE,
  MIO_AUTHOR_NAME,
  MIO_AUTHOR_URL,
} from '../../../shared/mioArchive'
import {
  OUTFIT_DB_AUTHOR_HANDLE,
  OUTFIT_DB_AUTHOR_NAME,
  OUTFIT_DB_AUTHOR_URL,
  OUTFIT_DB_ORIGIN,
  OUTFIT_DB_SOURCE_LABEL,
} from '../../../shared/outfitDbArchive'

const LEGAL_RULES = [
  {
    no: '01',
    title: '仅限学习与合法艺术创作',
    body: '本图库与创作台仅用于绘画构图、人体动态研究与艺术创作交流。严禁用于制作传播违法违规、低俗色情或暴力内容；严禁未经授权上传真实人物照片进行换脸或侵权合成。',
  },
  {
    no: '02',
    title: '账号积分与云端存档',
    body: '注册登录后将按平台策略获赠初始积分；每次云端生图消耗对应积分（失败自动全额退还），生成记录与配方快照保存在云端作品集中以便跨设备回看。使用者对其上传素材与生成内容独立承担全部法律责任。',
  },
] as const

export function AttributionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold tracking-tight">
            使用规范与参考素材来源
          </DialogTitle>
          <DialogDescription className="text-xs">
            CASTDECK 图库署名归属与创作合规说明
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1 text-xs leading-relaxed text-muted-foreground">
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-foreground">
              <ShieldCheckIcon className="size-4 text-[#116E65] dark:text-[#4FD1C5]" />
              <h3 className="text-xs font-bold tracking-wide">使用规范与免责声明</h3>
            </div>
            <div className="space-y-2 rounded-xl border border-border/80 bg-muted/35 p-3.5">
              {LEGAL_RULES.map((rule) => (
                <p key={rule.no}>
                  <span className="mr-1.5 font-mono font-bold text-[#D9381E]">{rule.no}</span>
                  <strong className="mr-1 text-foreground">{rule.title}：</strong>
                  {rule.body}
                </p>
              ))}
            </div>
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-foreground">
              <LayersIcon className="size-4 text-[#B88300] dark:text-[#E5A918]" />
              <h3 className="text-xs font-bold tracking-wide">参考素材来源署名</h3>
            </div>
            <div className="space-y-2.5 rounded-xl border border-border/80 bg-muted/35 p-3.5">
              <p>
                <strong className="mr-1 text-foreground">ギア（@giaaibusi）：</strong>
                基础人体动态（白模与深度图）、写实与动漫服装及人像参考源自原作者公开图集并作中文本地化整理；仅限学习与艺术创作参考，严禁将原始图片打包转售或付费分发。
              </p>
              <p>
                <strong className="mr-1 text-foreground">Shisei &amp; CharaDB：</strong>
                中国历代多视角服饰源自 Shisei（仅作造型参考，非专业历史复原）；二次元穿搭源自{' '}
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
                扩展人体动态姿势与主题服装源自{' '}
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
                </a>{' '}
                所有；图片由原站在线加载，仅限学习与创作参考，禁止二次分发或商业再发布。
              </p>
              <p>
                <strong className="mr-1 text-foreground">{OUTFIT_DB_SOURCE_LABEL}：</strong>
                精选穿搭（含设计规格板与试穿效果多视角）整理自{' '}
                <a
                  className="font-semibold text-foreground underline hover:opacity-80"
                  href={OUTFIT_DB_ORIGIN}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  sleepyzone.online/outfit-db-cn
                </a>
                ，设计与图片版权归原作者{' '}
                <a
                  className="font-semibold text-foreground underline hover:opacity-80"
                  href={OUTFIT_DB_AUTHOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {OUTFIT_DB_AUTHOR_NAME}（{OUTFIT_DB_AUTHOR_HANDLE}）
                </a>{' '}
                所有；图片由原站在线加载，仅限学习与创作参考，禁止二次分发或商业再发布。
              </p>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
