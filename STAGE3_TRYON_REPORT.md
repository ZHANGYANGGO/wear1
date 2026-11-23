# WearMate 阶段 3 试穿适配报告

**验收结论：11 件已适配，1 件待适配。** 四个分身各通过 11 件衣物，合计 44 个「角色 × 衣物」组合。下表和截图记录的是逐件换装及代表性完整组合。裸色尖头高跟鞋留在衣橱，当前试穿按钮禁用。

[打开 WearMate 我的衣橱](http://127.0.0.1:4193/wardrobe.html)。先在「创建分身」确认四个本地分身之一，再从衣橱导入示例或上传阶段 2 原始衣物照片。打开衣物详情点击「试穿」，工作台会保留当前分身和其余搭配。可继续替换单件、叠加外套和命名保存。

## 兼容性矩阵

| # | 衣物 | 短发女士 | 微笑男士 | 戴眼镜男士 | 银发女士 | 美术检查 |
|---|---|---|---|---|---|---|
| 1 | 深蓝色短袖衬衫 | 通过 | 通过 | 通过 | 通过 | 几何暗纹、胸袋、浅扣和红标保留。修身版手动清除了后领横带。 |
| 2 | 裸色尖头高跟鞋 | 待适配 | 待适配 | 待适配 | 待适配 | 两套轮廓均试制过。细跟落点和脚背角度与现有平脚站姿不匹配，待制作抬跟脚型。 |
| 3 | 白色碎花长裙 | 通过 | 通过 | 通过 | 通过 | 保留方领、泡袖、收腰与多色植物印花。两版袖口、腰线和裙长分别对位。 |
| 4 | 白色宽松卫衣 | 通过 | 通过 | 通过 | 通过 | 保留胸口小图案、落肩与罗纹。分别调整肩部、手腕和衣身下摆。 |
| 5 | 黑色直筒裤 | 通过 | 通过 | 通过 | 通过 | 保留深黑、腰头和直筒腿。左右裆线及裤脚分别对位。 |
| 6 | 米白色玛丽珍鞋 | 通过 | 通过 | 通过 | 通过 | 保留方圆头、细带和金扣。正面站姿下低鞋跟的侧面露出较少。 |
| 7 | 米白色拼浅蓝翻领上衣 | 通过 | 通过 | 通过 | 通过 | 保留浅蓝领、袖口和下摆条纹，移除生成稿里穿过颈部的后领横带。 |
| 8 | 浅灰色直腿运动裤 | 通过 | 通过 | 通过 | 通过 | 保留浅灰、松紧腰和开口宽腿，插画稿的同色腰绳比原照更明显。 |
| 9 | 白色立领羽绒服 | 通过 | 通过 | 通过 | 通过 | 保留无帽立领、拉链门襟和绗缝。拆分里领及前襟袖身。 |
| 10 | 浅蓝色牛仔裤 | 通过 | 通过 | 通过 | 通过 | 保留浅蓝水洗和橙色缝线。按两套腿部轮廓对齐。 |
| 11 | 白色厚底运动鞋 | 通过 | 通过 | 通过 | 通过 | 保留米白网面、厚底和波纹，左右脚单独定位。 |
| 12 | 紫色印花 T 恤 | 通过 | 通过 | 通过 | 通过 | 保留复古奶油色主字和上下配色。小字、褶皱与原照存在插画化差异。 |

短发女士与银发女士使用 `fitted` 轮廓，微笑男士与戴眼镜男士使用 `straight` 轮廓。两套坐标均为 560×1536。修身版的领口、肩线和高腰位置与宽肩直身版分别对位。鞋子左右脚各自使用对应轮廓的脚位。各分身继续引用原有头脸、发型、手臂和脚踝图层。Mila 继续支持旧衣物及 A/B。

## 对照与实拍

- [四个分身，八套穿搭总览](stage3-tryon-evidence/four-roles-eight-looks.jpg)
- [第 1–6 件原图、衣橱插画与试穿](stage3-tryon-evidence/garment-comparisons-1.jpg) · [第 7–12 件对照](stage3-tryon-evidence/garment-comparisons-2.jpg)
- [桌面完整界面 1440×900](stage3-tryon-evidence/woman-bob-desktop.png) · [移动完整界面 390×844](stage3-tryon-evidence/man-smile-mobile.png)
- 短发女士 [印花 T 恤造型](stage3-tryon-evidence/woman-bob-look-a.png) · [碎花长裙造型](stage3-tryon-evidence/woman-bob-look-b.png)
- 微笑男士 [印花 T 恤造型](stage3-tryon-evidence/man-smile-look-a.png) · [羽绒服造型](stage3-tryon-evidence/man-smile-look-b.png)
- 戴眼镜男士 [印花 T 恤造型](stage3-tryon-evidence/man-glasses-look-a.png) · [羽绒服造型](stage3-tryon-evidence/man-glasses-look-b.png)
- 银发女士 [印花 T 恤造型](stage3-tryon-evidence/woman-silver-look-a.png) · [碎花长裙造型](stage3-tryon-evidence/woman-silver-look-b.png)

总览和对照页的试穿图取自 Chrome 的实际分层渲染截图。衣物逐件截图保存在同一验收目录。原始照片继续保留在本机原图目录。包含原照的对照页和浏览器验收截图均作为本地文件交付。

## 透明素材与制作方式

以下 11 个 WebP 文件及 `white-puffer-back.webp` 分别位于 `assets/wardrobe/tryon/fitted/` 和 `assets/wardrobe/tryon/straight/`。共 24 个独立透明 WebP，尺寸为 560×1536。

`navy-shirt.webp`、`floral-maxi.webp`、`white-sweatshirt.webp`、`black-trousers.webp`、`ivory-mary-janes.webp`、`blue-collar-polo.webp`、`gray-joggers.webp`、`white-puffer.webp`、`light-blue-jeans.webp`、`white-platform-sneakers.webp`、`purple-graphic-tee.webp`、`white-puffer-back.webp`。

在开发阶段用 Codex 内置 ImageGen 生成穿着视角的独立服装稿。输入为同一衣物的阶段 2 展示插画和对应人体轮廓的已验收姿势或衣物对位图。分别制作并审看了两套轮廓的 12 件候选稿。产物仅保留通过对位的服装图层。浏览器运行时从本地加载 WebP。

人工设定肩、袖口、腰头、裆线、裤脚和鞋底的轮廓控制点，再用 Pillow 与 NumPy 做分区重映射。修身卫衣候选稿额外画出了牛仔裤，已沿罗纹和袖口清理出卫衣部分。试穿首轮发现修身衬衫后领横带和长袖接缝，已分别裁分后领及平滑腋下的袖身映射。拼色上衣也清理了穿过颈部的后领带。实际衣物的展示图和穿戴图各自独立。

连衣裙为独立全身衣饰层，优先于上下装槽位。选裙时隐藏上衣和裤子，双鞋独立。切回后恢复之前的两件组。裙摆覆盖至现有脚踝区域，袖口落在原有手臂的肩袖位置。

外套由后领和前襟袖身组成。后领在头脸层后方，前襟袖身在内搭前方，袖口在固定手部上方结束。原手部通过袖口以下轮廓保留。两张图都完成解码才会显示外套。缺一个部分只影响该件衣物。浏览器检查包括外套覆盖连衣裙、叠加上衣加裤子、脱下外套和切回上下装。

<details>
<summary>ImageGen 提示词要点与各款提示</summary>

通用约束为透明背景与布料独立图层，轻写实插画、柔和左上光，使用第二套参考锁定站姿与肩、腕、腰、踝关系。短上衣要求领口真实透明、双袖沿身体下垂。裤子要求两条真实裤腿和独立裤脚。鞋子要求与现有左右脚前向站姿一致。每件分别生成修身和直身版。

- `navy-shirt` — buttoned navy geometric jacquard short-sleeve button-down, subtle midnight angular pattern everywhere, ivory buttons down center, chest pocket/red tab, spread collar closed to second button, little neck exposure, lightly curved hem
- `purple-graphic-tee` — dusty grape oversized shirt, all-over purple cloth, cream chest lettering 'Psezodir' in large vintage script, dark green small curved caption above, muted mustard small swooping lettering below, short broad sleeves and crewneck
- `light-blue-jeans` — light-wash blue full-length straight-leg jeans, five pockets, brass button, contrast stitched fly, naturally straight open hems without rolled cuffs, pale faded thighs
- `white-platform-sneakers` — two ivory athletic sneakers, thick sculptural wavy platform soles, warm beige mesh and overt layered panels, heel loops, cream laces. Two distinct shoes, matched to the reference's toe angle and gap, NEVER overlap. Both feet viewed from the front with their tiny outward angle as in guide 2, no display/product side view
- `white-sweatshirt` — round-neck warm white oversized dropped-shoulder sweatshirt with full-length softly draped sleeves alongside the torso ending just before the palms. Sleeves angled downward with slight tilt following reference arms, tiny gap between arm and torso if visible. Ribbed collar, waist hem and sleeve cuffs. Keep the small gray sleeping cat line motif at viewer right chest. Collar around skin must open to transparent and shoulders natural.
- `black-trousers` — true black high-waist straight-leg loose dress trousers, flat waistband and subtle fly/pocket seams, slightly wide straight open hems. Texture shading in nearly black values. Exactly two legs, matching the existing trouser pose. No cuff rolls, no jeans styling.
- `gray-joggers` — light heather-gray open-hem sweatpants, relaxed straight wide legs, generous length, elastic shirred waistband, cotton fleece, subtle folds. Exactly two separate legs, loose open flat hems, no elastic on ankles.
- `ivory-mary-janes` — a pair of cream ivory Mary Jane low block heel shoes in straight front view with each toe slightly out, specifically oriented and separated like pose guide. Elegant squared round toes, thin straps across insteps and tiny golden buckles, subtle tan lining, show very slight heel on outer side only if possible with that pose. Transparent openings. No feet or socks.
- `nude-pumps` — a pair of nude taupe suede pointed toe pumps with slender heels, worn geometry from the portrait front view, thin pointed toes pointed slightly outward like calibration sprite, transparent foot openings. Respect ankle placement. Do not make flat shoes or add shoes in other views.
- `blue-collar-polo` — cream and pale blue short sleeve polo, the cream pale yellow body framed with light blue spread collar, pale blue rolled sleeves and thin blue hem edge. Layered contrasting blue inner placket. Downward sleeves end matching pose guide, lightly relaxed, maintain transparent opening at neck and keep rear collar rim behind.
- `floral-maxi` — A full-length light ivory maxi dress with a softly squared neckline, two gently puffed short sleeves, a visibly fitted waist and softly flared near-ankle-length flowing skirt. Keep the distinctive scattered pale yellow, blue, lavender, green, sparse pink botanical print and visible cloth drape, as in design reference 1. Short sleeve openings must align to both unchanged arms where the guide top's sleeves end, that is the ONLY permitted cuff position. Use a modest square collar opening near the base of the neck, square opening is genuinely transparent, no back collar bridge, no skin, no gap between top and skirt. Finish above the top of the shoes in the pose guide. Straight-front view. Solid low-opacity-free finished hem, folds softly defined.
- `white-puffer` — Warm white down-filled puffer jacket, NO HOOD, high thick stand collar, concealed central zip placket, slanted handwarmer pockets, horizontal bulky quilting, rounded slightly billowing sleeves and small gathered cuffs. Respect the shoulders and wrists of reference 2. Draw sleeves directed almost straight downward, the sleeve tips ending just above the start of the hands at the wrist, do not spread sideways. The jacket body hem is higher than the sleeve cuffs, ending around the upper thighs. A little separation between cuffs and body at bottom. Collar opening true transparent. Straight-front view as if worn over a shirt. No round hood loop, only short padded upright collar.

</details>

## 数据与交互

- `src/wardrobe/garments.mjs` 继续提供原图、展示图、衣物元数据和原始哈希。衣橱原图匹配及原图保存沿用阶段 2。
- `src/wardrobe/tryon-assets.mjs` 通过 `getFitInfo(garmentId, roleId)` 返回角色针对的状态、身体模板和图层。两套模板的准入名单独立，支持角色级覆盖。
- `src/avatar/renderer.mjs` 为原有分层渲染器增加单件多部件显示，同一件的部件共用加载状态。`src/wardrobe/tryon-selection.mjs` 维护上下装互斥、可选外套和鞋子。
- 工作台新衣物选择来自个人衣橱。浏览器会话按分身保存当前搭配、上下装草稿及所选分类。转到衣橱再返回时读取同一个状态。技术穿戴槽位来自预制素材注册，个人显示分类编辑不改变实际穿戴部位。
- 穿搭持久化键为 `wearmate.saved-looks.v1`，由 `src/wardrobe/saved-looks.mjs` 管理。记录格式为 `{roleId, top, bottom, dress, outerwear, shoes, name, createdAt}`。可选槽位使用 `null`，`createdAt` 使用 ISO 时间。保存前检查当前分身适配、服装互斥和浏览器解码结果，按对应分身回读。

后续阶段可用 `WardrobeStore.list()` 读取个人衣物、颜色、风格、适穿季节、厚度、搭配定位和可穿状态。用 `withTryOnAvailability(item, roleId)` 或 `getFitInfo` 取限定角色的试穿状态，用 `canWearSelection` 校验组合，用 `readSavedLooks(storage)` 读取历史搭配。这些接口已提供给后续集成。

## 验收命令与遗留

- `node --test` 在 `D:\wear` 通过 25 项。新增检查覆盖分部件外套原子显示、透明文件规格、连衣裙互斥、持久化记录、不可完整显示时拒绝保存及存储错误隔离。
- `git diff --check` 通过。验收图目录已加入 Git 忽略规则。项目未配置独立 Lint、TypeScript 检查或生产构建。
- `node work/stage3/verify.cjs http://127.0.0.1:4193` 使用 Chrome 157 实测 1440×900。四个分身分别从原照创建，浏览器逐件验证 44 个已适配组合，检查了文件归属、图层尺寸、基础图层节点保持、选中状态、衣橱往返、连衣裙互斥、外套穿脱、保存及刷新回读。另在 390×844 实测试穿，并模拟服装图层请求失败。失败后上一套造型正常，其他衣物仍能使用。
- `node work/stage2/recheck-avatar.cjs http://127.0.0.1:4193 work/stage3/legacy-avatar` 通过 Mila 和四个分身原有创建、A/B 与单件换装回归。
- `node work/stage2/verify.cjs http://127.0.0.1:4193 work/stage3/legacy-wardrobe` 通过 12 张原图匹配与衣橱导入、编辑、删除和本地存储回归。浏览器请求监测仅发现本机资源读取。浏览器脚本位于验收工作区。

高跟鞋需要能够随鞋切换的抬跟脚背、鞋跟落点和裤脚遮挡规则，再验证四个角色。待适配状态已在衣橱详情显示。玛丽珍鞋的低方跟在接近正面的姿势中仅少量可见。外套在肩袖放大观察时仍可见一定重映射纹理。印花小字、绗缝和单品褪色位置有绘制取舍，照片和穿戴图可在对照页中比较。商品参考图的公开使用许可沿用阶段 2 的待确认记录。
