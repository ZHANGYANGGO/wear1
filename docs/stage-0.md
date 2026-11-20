# WearMate 阶段 0 交付说明

## 运行与体验

在项目根目录使用 Node.js 20+ 执行 `node scripts/serve.mjs`，打开 [本地换装工作台](http://127.0.0.1:4173/)。4173 端口已占用时，可在命令结尾指定其他端口，例如 `node scripts/serve.mjs 4180`。启动、运行和测试均无需安装第三方依赖。

进入页面默认穿着 A「舒适休闲」。点击 B「精致通勤」可同时换全套服装。选用「上衣」「裤子」「鞋子」里的任意单品，组合会即时更新。只要三件衣物与某套预设完全一致，预设会自动选中。其他组合显示为「自定义搭配」。窄屏支持在舞台和单品区之间快速跳转。

## 工程结构

| 位置 | 职责 |
| --- | --- |
| `index.html`、`src/studio.mjs` | 工作台结构、控件和界面状态绑定 |
| `src/theme.css`、`src/studio.css` | 主题 token、桌面与窄屏布局、互动状态 |
| `src/avatar/config.mjs`、`src/avatar/renderer.mjs` | 角色坐标、锚点、固定图层和透明精灵合成 |
| `src/wardrobe/catalog.mjs`、`src/wardrobe/selection.mjs` | 衣物注册、服装 ID 组合、纯函数选择逻辑 |
| `assets/avatar/` | 独立的透明 WebP 身体和衣物图层、衣物缩略图 |
| `scripts/serve.mjs`、`tests/selection.test.mjs` | 本地启动脚本、选择逻辑与素材校验 |

使用原生 ES 模块和 JSDoc 数据类型。阶段 0 的工作台只有一个页面，浏览器能直接运行该结构。渲染采用 DOM 叠放透明 WebP，保留插画的纹理与光影，九张精灵共享一个固定比例的容器。所有图层解码后启用换装控件，切换时仅更新衣物图层的可见性。皮肤和服装图片节点持续存在，窗口调整只缩放整个画布。

## 素材规范

- 示例模特 Mila 为固定正面全身姿势，约 7.5 头身。角色注册使用 **560 × 1536 px** 透明画布，原点在左上角，x 向右、y 向下。素材生产时统一从原始 1024 × 1536 px 画面裁取 x = 232…791。
- 服装以完整画布导出，画布外及未被衣物占用的区域保留透明。领口基准为 `neck (276, 260)`，腰线为 `waist (274, 566)`，鞋口组为 `feet (260, 1422)`，另记录双肩和双踝。衣物的 `offset` 以画布像素计，`scale` 围绕各自锚点缩放。本次精灵已完成对位，均使用零偏移和 1 倍比例。
- 由后至前依次排布固定脚踝、头脸及头发、手臂与手、鞋、裤、上衣。上衣覆盖袖口和裤腰接缝，裤脚覆盖鞋口。腕部及手部和衣服轮廓之间保留间隙。排序由各素材的 `layer` 数据决定。
- 内置 ImageGen 为本项目生成休闲造型源图，并以原图为参考制作通勤服装源图。提示词要求成年的 7.4 头身女性、固定正面姿势、深棕短发、透明背景、细墨线与水粉轻写实质感。休闲套装包含砖红 T 恤、水洗蓝高腰直筒牛仔裤和奶白生胶底运动鞋。通勤源图保留脸、姿势和锚点，仅换为深咖金属扣夹克、燕麦色压褶西裤和黑色乐福鞋。随后沿领口、袖口、裤腰、裤脚和鞋口人工设定蒙版，导出三张固定层、六张可穿戴层，以及从衣物层裁出的六张缩略图。品牌图标为项目绘制。示例资产来源为上述生成及绘制流程。

<details>
<summary>内置 ImageGen 生成提示词</summary>

**休闲源图**

> Use case: stylized-concept. Create ONE genuinely transparent background production sprite for a premium digital fashion closet, a beautiful fully visible full-length editorial fashion illustration of a fictional adult woman, centered, facing straight forward, at normal 7.4-head human proportions, casually poised with weight barely shifted. A fashion illustration in refined semi-realistic painted gouache and very fine warm dark ink outlines, subtle grain inside shapes, nuanced face anatomy, adult natural eye sizes, elegant painterly lighting and convincing cloth seams; look like a high-end fashion magazine illustration, not photography, not 3D, not anime or flat vector. Woman in her late 20s, light-medium warm olive skin, tousled dark brown chin-length bob tucked behind one ear, subtle gold stud earrings, soft confident direct gaze. Arms hang at sides, both hands open and clearly seen, with a little transparent space between both hands and hips, no hands in pockets, sleeves end well above elbow. Feet almost facing forward, spaced the width of her hips, no leg crossing. Clothes: a saturated brick-vermillion red short-sleeved round-neck T-shirt ending right at the waist, entire hem visible, NO exposed midriff, red sleeves defined with simple crisp hem; vintage mid washed blue high-waisted straight-leg jeans with waist seam, visible denim texture, full jeans to ankles; simple warm white low-tops with small brown gum outsoles. Sharp visible color boundary between shirt and jeans, sleeve and skin, and jeans and shoes. Front view, no accessories other than studs, no props, no cast ground shadow, no text, no logos, no marks, no other copies or variants. Fill the portrait image nearly top to bottom with the full human figure from hair to footwear, with a little transparent space all around, hands and heels entirely in frame. Real RGBA transparency beyond the illustrated silhouette; no background color, no grid, no checkerboard. This image will be separated into sprite layers by a human developer, clean shapes and visible garment seam boundaries throughout.

**通勤源图**

> Use case: precise-object-edit, fashion sprite fitting reference. Edit this exact transparent 1024 x 1536 illustration. Change ONLY the clothes on this exact character, preserving face, hair, pose, arms and hand placement, neck, waist, ankles, foot placement, image registration and image dimensions. The artist will cut out individual new garments and place them back on the original character. 1. Replace the vermilion tee with a chic near-black espresso tailored short sleeve jacket, round high neckline with the SAME neck opening and the exact same two sleeve-to-skin boundaries, precisely same shoulder and bottom hem positions as the original red tee, petite brass buttons down center front, princess seams and two narrow chest welt pockets. 2. Replace blue jeans with creamy pale oat tailored pleated trousers, high waist same waistband height and ankle cuffs EXACTLY the same positions, gently wider straight leg with obvious pressed vertical creases and a narrow black belt with a brass clasp. 3. Replace the two white sneakers with black soft leather classic penny loafers facing the exact same direction, honest shoe-shine, matching original sneaker footprint and ankle placement (black loafers can extend a little up the ankle, cover the same skin). Style should be identical light and fine-ink gouache shading of the reference, premium editorial. No additional accessories. Preserve original full-length image alignment; don't zoom, crop, rotate or reposition. Transparency outside the character. No props, floor, backdrop, cast shadow, text or grid.

</details>

## 验收记录

| 项目 | 结果 |
| --- | --- |
| 启动与运行 | 本地 HTTP 200，Chrome 实测无控制台异常和资源请求错误 |
| 预设与单品 | A/B 均切换三件衣物，桌面和窄屏各遍历 8 种组合，验证单类别选择、预设回选、选中样式与缩略图 |
| 身体一致性与对位 | 两种屏宽遍历时验证头、手臂、脚踝持续复用同一组节点。全部可见图层与同一画布边界重合，8 种合成图均做目视检查 |
| 布局与可达性 | Chrome 覆盖 1440×960、1280×720、853×768、768×1024、390×844、320×700，页面无横向溢出、人物未裁切。验证分类键盘导航和窄屏跳转 |
| 代码与素材 | `node --test` 的 4 项检查通过，覆盖预设、独立选衣、未知 ID 和素材透明通道、尺寸、锚点 |

验收截图见交付目录的 `WearMate-desktop-A.png`、`WearMate-desktop-B.png` 和 `WearMate-mobile.png`。视觉品质为本次 Chrome 截图与对位图的自验结果，未做独立美术评审、Safari 或真机测试。

## 当前边界与后续接入

- 阶段 0 的素材只适配 Mila 的固定比例和站姿。固定身体层包含可见的头脸、手臂与脚踝，被遮住的躯干和腿部需要在支持更多露肤版型时补绘。六件衣物按同一版型坐标精修，遮挡来自透明轮廓和层级。换体型、姿势或衣物版型时需要重新对位并检查袖口、腰线、裤脚或新增遮挡层。
- 阶段 1 可以从角色配置和基础图层接入新角色。阶段 2 可以从衣物目录接入由真实衣橱提供的记录。阶段 3 可以沿用锚点、透明精灵和层级约定导入可穿戴素材。阶段 4 可以将候选方案转成由服装 ID 组成的组合，继续复用选择与展示逻辑。
- 阶段 1–4 的数据入口目前是本地示例配置。照片处理、上传识别、自动对位、天气、推荐及持久化由后续阶段实现。主导航可以按后续信息架构增加「我的衣橱」「我的形象」「智能推荐」入口。当前唯一入口为穿搭工作台。
