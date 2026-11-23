# WearMate · 四人本地预生成分身演示

**比赛版使用四张指定原照与四组预制分身。** 浏览器计算照片摘要并精确匹配，确认后进入穿搭工作台，可试穿 A/B 并独立替换上衣、裤子和鞋。

## 演示方法

在 `D:\wear` 运行 `node scripts/serve.mjs 4191`，打开 [创建分身](http://127.0.0.1:4191/create.html)。选择四张原 PNG 中的一张，填入身高（cm）和体重（kg），点击「创建分身」。核对预览后确认，进入工作台选择 A 或 B。

请使用原文件。改名不影响匹配，重新截图、裁切或压缩会改变 SHA-256 摘要。未登记图片显示「当前演示版本暂不支持该照片」。流程没有相近人物推荐或角色选择，准备状态由实际图层校验和加载驱动。

| 指定原文件 | 角色与外观 | 服装族 |
| --- | --- | --- |
| `262a936efb4d169dd8edf3da2c0e327e.png` | 短发女士，侧分短发、收敛下颌与闭唇微笑 | 合身 |
| `e69f4f1ad4309a0da783c73870caea41.png` | 微笑男士，侧梳黑发、较长脸型与露齿笑容 | 直身 |
| `211fd845a79c872882071c26a72a2c9b.png` | 戴眼镜男士，矩形眼镜、灰黑短发与成熟轮廓 | 直身 |
| `f236da97c124644f2a3977f01347a7ff.png` | 银发女士，短卷银发、眼周纹理与温和微笑 | 合身 |

[四人 A/B 实际换装对照](local-avatar-evidence/four-avatars-ab.png) · [确认后的穿搭工作台](local-avatar-evidence/workbench.png)

## 素材制作

- 开发阶段用 Codex 内置 ImageGen 做了四次参考图编辑。每次以指定原照提供外貌，以对应服装族的 1024×1536 定位图约束站姿和袖口。两位男士使用此前开发的直身肩腰几何及配套衣物。两位女士使用合身衣物的定位几何。四幅插画分别生成了头脸、发型、可见手臂和手部。
- 人工确定颈线、袖线后做局部平移、头层等比对位和袖口清边，再处理领口细缝。脚踝依据各服装族的几何按角色分别校色。每个角色有 3 张独立透明 WebP，共 12 张角色图层，画布统一为 560×1536，最终素材在 `D:\wear\assets\local-avatar\`。合身族沿用原衣物，直身族使用六件既有专配衣物及缩略图。两族都保持六件衣物独立。
- 目视检查可辨别四种脸、头发及表情。半身照中的遮挡部位、下身和站姿由插画推定。四人使用两套适配体型，未测量真实身体比例。

## 架构、隐私与后续边界

`src/create/profiles.mjs` 提供 `LocalAvatarProvider`。创建页调用 `resolve({ photo, heightCm, weightKg })`，工作台调用 `byId(id)` 恢复配置。通用接口输出角色配置、透明人物图层、对应衣物和可选的模板区域约束。原有渲染器、分类、A/B ID 和 Mila 素材保持原样。

确认时只保存角色 ID、身高和体重到当前标签页会话。刷新可恢复分身，重进表单可读回两项数值。数值不用于重绘预制体型。演示时照片和数值不发往服务器，也不持久保存原图。开发时原照曾输入内置 ImageGen；四张原 PNG 留在用户本机，没有加入项目静态资源、Git 或公开部署。项目运行只需本地 Node.js。

未来的 `AIAvatarProvider` 可实现相同接口。它仍需独立解决服务端生成、自动拆层、锚点定位、透明区校验、服装适配和失败回退。本轮没有接入实时或付费 API。

## 验收与参赛说明

- `node --test` 共 **16 项通过**。包括四个唯一登记项、12 张独立角色图层的内容摘要、尺寸和透明标志，以及未登记输入拒绝。
- Chrome 157 桌面 **1440×900** 逐一上传四张原文件，均匹配正确。实际走通预览、确认、A、B、单独换鞋、刷新恢复角色和表单读回原数值。银发角色还在 **390×844** 触控模拟上走通。换衣时固定身体层继续复用。
- 未登记照片只出现规定提示，无法确认。未确认分身时，Mila 仍能试穿 A/B。原照片的 HTTP 路径均返回 404。浏览器检查未发现外部请求或向服务器提交照片。银发角色首次合成的袖边颜色残留已修整。
- 参赛说明可表述为「四张指定半身照与四套预先制作并人工对位的 2D 分身一一登记。浏览器本地匹配原文件，确认后进入工作台试穿。身高和体重仅作为本次会话数据保存。」

<details>
<summary>实际 ImageGen 提示词模板</summary>

图 1 为对应服装族的定位图，图 2 为表中原照。四次均启用透明背景。

> Create a transparent 1024×1536 full-length 2D fashion avatar registration illustration. Image 1 supplies only the original wardrobe fitting geometry and the hand-painted gouache and fine colored-pencil rendering style. Image 2 is the sole identity reference: {case description}. Transfer the distinctive face shape, eye/nose/mouth spacing, authentic visible age and hair from image 2. Draw the whole body including visibly new skin and paintwork on the neck, both arms and hands appropriate to that person, not just a pasted face. Original geometry guides clothing compatibility: preserve the exact canvas, centering, head and neck fit locations, shoulder seams, collar and sleeve edges, relaxed front-facing pose with separable arms, shirt hem, pants, shoes, hand and foot locations from image 1. Keep its existing red or terracotta T-shirt, jeans and shoes exclusively as temporary guide clothes. Hair may retain its own silhouette. Do not carry over photo clothing, props or backgrounds. Retain only glasses when specified. No beautifying away age, no photographic or 3D textures and no caricature. Refined 2D painted editorial quality, natural adult head-to-body proportions. True RGBA alpha beyond the figure, no floor, shadow, scenery, writing or duplicate figure. Fixed registration of all limbs is essential.

+ - `woman-bob` — the adult woman with a face-framing chin-length straight dark bob and side part, gently tapered lower face, fine brows, dark eyes and a faint closed-mouth smile, fair warm skin; natural adult straight relaxed posture with a graceful build
 - `man-smile` — the youthful adult man with neatly side-parted swept black hair, a bright open smile showing upper teeth, long oval face, warm light-medium skin and natural moderately broad straight male build
 - `man-glasses` — the mature adult man with rectangular dark glasses, brushed-back short salt-and-pepper hair, longer and more angular face, natural settled expression, fair warm skin and a natural upright straight male build
 - `woman-silver` — the elderly woman with short voluminous softly curled silver-white hair, round-soft face, fine natural age lines around the eyes and cheeks, gentle open-mouth smile, light warm skin, mature natural non-exaggerated adult build

</details>
