# WearMate 阶段 2 验收报告

## 一、交付与体验

本地服装素材库包含 12 张原始 PNG 和 12 张独立卡通展示图。打开 [我的衣橱](http://127.0.0.1:4193/wardrobe.html)，点击「添加衣物」，选择从 `衣服.zip` 解压的原始 PNG。核对原图、插画及预填信息后点击「加入我的衣橱」。新衣橱初始为空，也可以主动点击「导入示例衣橱」体验整套素材。

从项目根目录运行 `node scripts/serve.mjs 4193` 可重新启动演示。请使用同一个浏览器和本机地址，衣橱记录按站点地址及端口隔离。

## 二、12 件实物与插画对应

原图均从 `C:\Users\Administrator\Desktop\衣服.zip` 原样提取。来源以用户提供的压缩包为准，具体商品链接、摄影版权及公开使用许可均待确认。表内原始文件位于 `.local-wardrobe-references/`，展示图文件位于 `assets/wardrobe/display/`。

| # | 衣物 | 分类 | 原始文件 | ID / 展示图文件 | 对照检查 |
|---|---|---|---|---|---|
| 01 | 深蓝色短袖衬衫 | 上衣 | `accent.png` | `navy-shirt.webp` | 深蓝几何暗纹、浅色扣与弧形下摆保留。前襟敞开程度稍小。 |
| 02 | 裸色尖头高跟鞋 | 鞋子 | `accent.png` | `nude-pumps.webp` | 裸杏色绒面、尖头和细高跟保留，共两只。鞋面略提亮。 |
| 03 | 白色碎花长裙 | 连衣裙 | `statement.png` | `floral-maxi.webp` | 保留方领、短泡袖、长裙和多色植物印花。花枝被重新绘制，非逐花复制。 |
| 04 | 白色宽松卫衣 | 上衣 | `basic.png` | `white-sweatshirt.webp` | 保留白色、落肩、罗纹袖口与小型睡猫线描。去掉周围商品背景。 |
| 05 | 黑色直筒裤 | 裤子 | `basic.png` | `black-trousers.webp` | 保持高腰、黑色和直筒长腿。插画增加了少量布料明暗。 |
| 06 | 米白色玛丽珍鞋 | 鞋子 | `accent.png` | `ivory-mary-janes.webp` | 保留米白鞋面、方圆头、细扣带和低方跟，共两只。扣饰形状有简化。 |
| 07 | 米白色拼浅蓝翻领上衣 | 上衣 | `accent.png` | `blue-collar-polo.webp` | 保留暖米白底、浅蓝翻领、袖口与下摆边。纽扣细节经简化。 |
| 08 | 浅灰色直腿运动裤 | 裤子 | `basic.png` | `gray-joggers.webp` | 保留浅灰杂色棉纹、松紧腰和宽腿开口，删除模特和鞋子。 |
| 09 | 白色立领羽绒服 | 外套 | `accent.png` | `white-puffer.webp` | 第一版误加了兜帽，已用原图重新生成。保留立领、中门襟、横向绗缝和蓬松轮廓。 |
| 10 | 浅蓝色牛仔裤 | 裤子 | `basic.png` | `light-blue-jeans.webp` | 保留浅蓝水洗、口袋与直筒腿；褪色纹理位置为插画重绘。 |
| 11 | 白色厚底运动鞋 | 鞋子 | `accent.png` | `white-platform-sneakers.webp` | 保留米白网面、鞋带、拉环和厚波纹外底，共两只。简化鞋身文字和部分切线。 |
| 12 | 紫色印花 T 恤 | 上衣 | `statement.png` | `purple-graphic-tee.webp` | 保留灰紫底色与奶油色主字、上绿下金的复古印花层次。细小字样和褶皱有再绘。 |

[12 件原图与插画对照](stage2-wardrobe-evidence/originals-and-illustrations.jpg)

在同一色板背景逐件检查了裁切、颜色、结构、印花及缩小后的轮廓。三款鞋图均为一双，长裙、长裤及羽绒服完整显示。卡片统一使用 768×768 透明 WebP，等比缩放并留出边距。不同商品的印花密度、质地和轮廓仍可辨识。

## 三、素材制作

使用 Codex 内置 ImageGen，每件输入压缩包内的对应照片单独生成。角色画风沿用轻写实 2D 时装插画方向。生成后用 Pillow 等比归一画布、保留透明通道并导出 WebP。人工对照原图筛选，羽绒服追加无帽立领修正。运行网页时没有 ImageGen、付费 API 或其他外部服务依赖。

<details>
<summary>开发阶段提示词</summary>

各项通用提示词

> Create an independent transparent illustration of the specific clothing in the input photo for a boutique fashion wardrobe. Use the photo solely as the garment design reference. High-end 2D light-realistic fashion editorial illustration consistent across a premium collection: restrained precise edges, nuanced hand-painted color, softly shaded cloth volume, plausible seam/topstitch detail, recognizable textile, broad clear shapes at thumbnail scale. A hand-rendered garment study, not a photograph, vector glyph, filter, toy or CGI. One centered complete isolated product, generous 8% clear padding, no cropping, no shadow on a floor, no backing card, no logo/caption outside the garment, zero visible body/mannequin, true transparent alpha background.

- `navy-shirt` — Short-sleeve inky navy collared button-up, subtle overlapping dark angular broken-grid print visible across every panel, off-white buttons, subtle red stitch accent, curved split hem. Slight three-quarter ghost mannequin orientation close to original, naturally draping. Omit hangtag and surrounding store heading.
- `nude-pumps` — Exactly a pair of warm taupe nude suede pointed court pumps. Fine high stiletto heels and genuinely slender sharply pointed toes. Two separate legible shoes in elegant three-quarter product view like the reference. Soft suede rather than glossy patent.
- `floral-maxi` — Long ivory ankle-length dress, fitted seamed bodice, wide softly squared neckline, slightly puffed short sleeves, light A-line flare and the reference's delicate scattered multicolor botanical print with blue, lavender, green, yellow and faint coral brushwork. Dress only, remove model, bag and background.
- `white-sweatshirt` — Cloud white oversized dropped-shoulder crewneck sweatshirt, long roomy sleeves with ribbed cuffs and ribbed hem. Retain the small thin muted grey hand-drawn mountain/cloud motif on the viewer's right chest. No other artwork, labels or text.
- `black-trousers` — Black high-rise straight-leg trousers with a slightly relaxed full-length line, subtle central fly, waistband and pockets, no cuffs, both legs separate with a small natural opening. Preserve deep almost-black color with charcoal shadows and softly rendered folds.
- `ivory-mary-janes` — Exactly a pair of creamy ivory Mary Jane shoes. Square-rounded toes, slender instep straps and small subtle gold-tone buckles, low block heels, tan interiors, thin light sole. Match graceful diagonal three-quarter product arrangement without a platform or props.
- `blue-collar-polo` — Creamy pale yellow short-sleeve relaxed top with light powder blue spread polo collar, blue inset placket, fine chambray-blue turned sleeve cuffs and visible slim blue undershirt-like lower hem trim. Preserve the distinct lightweight silhouette and two-color treatment. Remove all labels and outside writing.
- `gray-joggers` — Light heather-grey elastic-waisted sweatpants with two long relaxed straight wide legs and open loose hems, fine garment drape, no elastic ankle cuffs and no contrasting drawstring unless subtle tonal. Plush heather fabric. Keep high waist and long loose legs. Show the pants only, no skin or shoes.
- `white-puffer` — Off-white hip-length quilted puffer jacket with thick puff, broad horizontal down baffles, full concealed central zipper, raised stand collar, voluminous dropped sleeves and gathered cuffs. Keep coherent symmetrical sleeve architecture and side pockets. Jacket only, no person, hair, skin, or background. Show neckline and zipper clearly.
- `light-blue-jeans` — Light blue washed high-waisted denim jeans, slight straight wide-leg fall with modest open hem, contrast golden seams, five-pocket construction, button fly and belt loops. Gentle fading and whiskers, no rips or embroidery. Preserve reference wash and fresh long proportions.
- `white-platform-sneakers` — Exactly a pair of layered ivory athletic sneakers, unmistakable sculpted thick wavy platforms and textured outsole, mesh panels, cream laces, small warm beige accents and heel pull tabs. Reference-like three-quarter sneakers with clean silhouette, unique layered construction, no extra shoe, blocks, text or graphics outside the sneakers.
- `purple-graphic-tee` — Muted medium grape-purple oversized dropped-shoulder short-sleeve T-shirt with ribbed crew-neck, fuller sleeve and soft cotton gathers. Retain its unmistakable central pale cream retro script print (close to original lettering 'Psezodir'), small subdued green lettering/oval above and small curved wheat-gold lettering below. Keep the chest print proportion and hierarchy.

羽绒服复修以初次插画作为待修改图，原照作为设计依据。提示着重要求 “COMPLETELY REMOVE THE HOOD. The neckline is ONLY a short upright padded mandarin/stand collar band around the neck”。

</details>

## 四、衣橱、匹配与本地数据

- 浏览器先验证文件签名、格式、大小及解码，再计算原文件 SHA-256。预制库按唯一哈希及 ID 索引。一字节变化都会重新计算签名。仅改名可匹配，重采样、裁剪、截图及重新保存后的文件可能被拒绝。
- 成功时展示浏览器生成的原图预览和预制插画，并预填名称、类别、主色、辅色、风格标签、季节、厚度和搭配定位。支持修改及可穿、清洗中、暂不可穿三个状态。
- 支持全量与五类筛选、名称搜索、详情、编辑和删除。删除仅移除个人记录，可以重新匹配并加入。上传去重，示例导入保留已有编辑。
- `localStorage` 键 `wearmate.personal-wardrobe.v1` 保存衣物 ID 与可编辑字段，刷新仍保留，清理站点数据后移除。暂不提供跨设备同步。读取失败或写入配额异常会显示提示。
- 上传文件只在浏览器内读取，临时预览使用 Blob URL，切换文件或关闭时释放。保留的 12 张源图位于 Git 忽略目录，可由仅监听本机回环的开发服务器按注册白名单读取，子目录不会被静态服务器直接公开。对照证据中也含原图缩略图，仅供本地验收。公开部署前须核查原图、生成图及截图的使用许可。

## 五、分身兼容与阶段边界

「穿搭工作台」「创建分身」「我的衣橱」可直接互跳。已确认角色沿用原会话配置。工作台按角色 ID 记住上衣、裤子、鞋子组合及当前分类，返回后恢复。Mila 和四个预制分身继续使用各自原有 A/B 素材，渲染器与原有衣物坐标协议沿用。

12 件本批商品的 `tryOnStatus` 均为 `pending`，`tryOnAssets` 为空。详情明确提示「试穿待适配」。未来 `tryOnAssets` 可按角色 ID 或人体模板 ID 分别登记，`tryOnCoverage` 已标注连衣裙跨上衣和下装区域，以及外套层级和手臂遮挡需求。

阶段 3 的难点在于两类人体的肩宽、腰线和脚位不同。轻薄裙装需要连贯覆盖上下身，外套需要处理袖子与手臂、头发及内搭的前后关系，高跟鞋需要考虑脚踝和站姿。每件实际穿戴素材仍需按 560×1536 角色协议制作、对位和检查。

## 六、代码与验收证据

| 能力 | 关键文件 |
|---|---|
| 预制库及稳定 ID | `src/wardrobe/garments.mjs` |
| 元数据校验、类别与试穿覆盖 | `src/wardrobe/model.mjs` |
| 本地预制素材来源 | `src/wardrobe/provider.mjs` |
| 个人记录及持久化 | `src/wardrobe/store.mjs` |
| 衣橱页面 | `wardrobe.html`、`src/wardrobe/page.mjs`、`src/wardrobe/wardrobe.css` |
| 工作台恢复、原图服务 | `src/studio.mjs`、`scripts/serve.mjs` |

- [桌面衣橱 1440×900](stage2-wardrobe-evidence/wardrobe-desktop.png) · [完整衣物陈列](stage2-wardrobe-evidence/wardrobe-desktop-full.png) · [首次进入空状态](stage2-wardrobe-evidence/empty-desktop.png)
- [桌面上传对照](stage2-wardrobe-evidence/upload-compare-desktop.png) · [桌面详情](stage2-wardrobe-evidence/details-desktop.png)
- [移动衣橱 390×844](stage2-wardrobe-evidence/wardrobe-mobile.png) · [移动详情](stage2-wardrobe-evidence/details-mobile.png)

## 七、测试结果与遗留事项

- `node --test` 在 `D:\wear` 通过 21 项，包含 5 项衣橱测试与 16 项原有回归。检查了透明 WebP、注册表去重、无关文件拒绝、重复添加、元数据编辑及存储错误隔离。
- `git diff --check` 通过。用 `git check-ignore -v` 核实 12 张源图目录及含照片的验收图目录被忽略。项目没有配置独立的 Lint、TypeScript 检查或生产构建。
- `node work/stage2/verify.cjs http://127.0.0.1:4193` 在 Chrome 157 实测桌面 1440×900 和移动 390×844。逐件实测 12 张原图匹配、对照、确认入橱、详情原图字节一致。验证了五类筛选、名称搜索、编辑、可穿状态、刷新恢复、删除后重加、重复和不支持文件、可选示例导入、存储写入失败反馈及隐私路径限制。确认衣橱和工作台往返后，角色、当前三件衣物和衣物分类仍保持一致。
- `node work/stage2/recheck-avatar.cjs http://127.0.0.1:4193 work/stage2/avatar-recheck` 用阶段 1 的四张原照回归了创建、预览、确认、A/B 和独立鞋子切换，并复测 Mila 的 A/B。另在 390×844 复测银发分身。
- 浏览器脚本位于本次 Codex 验收工作区。两轮请求监测均未发现向外站发起的浏览器请求或文件上传。

正式公开发布前需核查商品来源许可。图案配色及主要结构通过内部对照，细小文字和印花位置保留插画化差异。端口或浏览器变化会使用新的个人衣橱。展示素材对各人体的适配留待后续阶段。
