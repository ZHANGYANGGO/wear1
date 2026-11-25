# WearMate 面部原貌、美颜与试妆验收

从创建页生成并确认身体，进入工作台，选“完善面部外观与妆容”。默认保留原貌。可以只上传正脸，也可以在模板脸上直接试妆。确认造型后在同一标签页换装。衣橱的“面部造型与导出”可返回当前人台并分别下载原貌、当前造型。

下列检验页、三视图和人物 GLB 由“复跑”一节的命令生成，保存在当前电脑的 `.private/module4-review` 目录。新下载工程时可使用自己的三张照片生成这些文件。[本机检验页](../../.private/module4-review/review.html) · [原貌 GLB](../../.private/module4-review/original.glb) · [造型 GLB](../../.private/module4-review/styled.glb)

## 第一部分　原貌

以包含模块三实现的 `wear-mc-2` 本地工作区为起点。实施前的源码、资产和验收结果快照保存在 `.private/module4-baseline/module3.zip`。SHA-256 为 `551e6081a2253dade9f25fe99483c4c741821c14a2ecef0fc505e129206aec04`。

浏览器在本机运行人脸关键点和人像分区模型。面部参考点来自现有模板的正交渲染，共 468 点，登记到实际三角形表面。拟合时为每张照片估计缩放、平移和旋转，按朝向选择可见点，用两张照片共同更新受限幅的中性脸型参数。单正脸沿用模板深度。侧照增加鼻尖、唇部和下巴的深度约束。局部变形也应用到眉、眼与牙齿，头顶基准保持固定。镜像可在输入处指定。

肤色来自可见脸颊区域。原貌贴图把分区后的照片按对应三角形映射到 512 × 512 局部纹理，再将边缘过渡到采样肤色。原身体保留 14,517 个顶点。分割出的头发像素、逐行宽度和侧照厚度用于构造独立发型网格。后脑轮廓、隐蔽发际线和背面颜色用模板与可见头发补全。宽松卷发在侧后方仍可能偏厚，眼球、牙齿与部分眉形保留模板特征。

### 独立留出角度

同一段本地实拍视频取三个不同角度。第 1 帧用作正脸，第 3 帧用作补充侧脸，第 10 帧仅在两版脸型冻结后用于验收。这里的帧号对应本机 `frame-01.jpg`、`frame-03.jpg`、`frame-10.jpg`。三种模型分别用眼角、鼻梁和上脸点估计留出视角的相机，在同一组可见鼻尖、下巴和下颌点上评分。

| 几何 | 参与评分的可见点 | 平均二维投影距离 / 留出照片脸框宽度 |
|---|---:|---:|
| 原模板 | 6 | 6.97% |
| 仅正脸 | 6 | 6.04% |
| 正脸与侧脸 | 6 | 5.37% |

该几何对照覆盖 1 人。另有 2 张本机正脸样片用于肤色采样和纹理合成检查。照片的光线、原有妆容和遮挡会影响估计，当前样片的肤色范围有限。真人相似度留给使用者查看原图、灰模与三视图后判断。[灰模对照](../../.private/module4-review/geometry.png) · [逐点评分与样片记录](../../.private/module4-review/acceptance.json)

原貌部分使用本地人像分区识别头发、衣物和配饰，对遮挡位置的几何观测降权。对每张照片单独估计张嘴、微笑带来的口周不确定性。镜片、镜架的识别质量取决于分区模型，透明镜片遮挡尚未专项验证。[单图与双图贴图对照](../../.private/module4-review/texture-comparison.png)

## 第二部分　可调美颜与试妆

原貌网格参数、基础纹理、美颜强度、妆容配置分别保存，确认时随同一个人台 ID 写入浏览器会话。推荐卡与滑杆共享磨皮、匀肤、提亮、下颌轻收四个值。磨皮采用保边邻域平均并保护唇、眼、眉、鼻翼。下颌每次从原顶点计算。口红、腮红、眼影和眼线绑定到同一套面部区域；导出时使用内嵌图像与标准材质。切换妆容无需重复人脸检测。取消编辑保留上次确认结果。

浏览器实际走过推荐、手调、切妆、单换口红、按住看原貌、卸妆和重置操作，覆盖侧照输入错误、快速替换照片，以及衣橱换装后返回编辑。回到同一人台后，手选色号和下颌强度仍在。试穿了上衣，以及上衣、牛仔裤与鞋的完整搭配。长发与高领服装组合尚缺实拍验证。[妆前妆后三视图](../../.private/module4-review/review.png) · [试衣截图](../../.private/module4-review/wardrobe-outfit.png)

### GLB 与身体复测

两份 GLB 均在新的无会话浏览器上下文中，用通用 Three.js GLTFLoader 在网络断开后独立解析、渲染。两个文件均包含独立头发、面部贴图与完整人体。复测使用模块三原有躯干闭环；示例输入为快速人台，身高 170 cm、体重 65 kg。

| 单位 cm | 身体基线 | 原貌导出 | 造型导出 |
|---|---:|---:|---:|
| 身高（人体头顶） | 170.00 | 170.00 | 170.00 |
| 胸围 | 93.00 | 93.00 | 93.00 |
| 腰围 | 72.15 | 72.15 | 72.15 |
| 臀围 | 100.56 | 100.56 | 100.56 |

此样例发顶距地约 170.38 cm，颈部以下顶点最大位移为 0 mm。下颌轻收强度 20 时，两份导出文件下颌区域最大顶点差约 1.43 mm。导出贴图的唇、眼线和脸颊取样均有变化。[离线原貌](../../.private/module4-review/offline-original.png) · [离线造型](../../.private/module4-review/offline-styled.png) · [复测值](../../.private/module4-review/measurements.json)

## 复跑

原貌实现可从[照片分析](../../src/face/observations.mjs)、[脸型拟合](../../src/face/geometry.mjs)与[头发网格](../../src/face/hair.mjs)查起。美颜、试妆及导出通过[纹理合成](../../src/face/atlas.mjs)、[编辑器](../../src/face/editor.mjs)和[三维查看器](../../src/3d/viewer.mjs)接入现有人台。

在含 `package.json` 的目录执行。浏览器测试使用 Python Playwright、Chromium 和 Pillow。真实样片、脸部图像和生成的人像保存在本机 `.private/`。新工作区可用 `--photos` 指定含同一人 `front.jpg`、`side.jpg` 和 `held.jpg` 的目录。`--browser` 可以指定已安装的 Chromium。

```powershell
npm.cmd test
node scripts/serve.mjs 4294
```

另开终端运行浏览器验收与网格检查。

```powershell
python scripts/verify-face.py
node scripts/measure-face.mjs
```

## 来源与运行范围

使用项目现有的 Three.js、MediaPipe Tasks Vision 和 MakeHuman 人体模板。新增两项 Google 官方模型，均下载到本地，权重未修改。官方文档所链接的两张模型卡标注 Apache-2.0。[人脸模型卡](https://huggingface.co/litert-community/MediaPipe-FaceLandmarker) · [分区模型卡](https://huggingface.co/litert-community/MediaPipe-ImageSegmenter-Selfie-Multiclass) · [许可证文本](../../docs/licenses/Apache-2.0.txt)

| 运行资产 | 版本 | SHA-256 |
|---|---|---|
| [Face Landmarker](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) | float16 / 1 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| [Selfie Multiclass](https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite) | float32 / 1 | `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0` |

局部脸型基、顶点对应、纹理烘焙、发型网格和妆区合成均在本项目实现。HRN/MV-HRN、MICA、NextFace、eos、GPUPixel、face-beautifier、MPFB2 与 OpenMakeupSDK 用作方案参考，本次没有运行其推理模型，也没有引入其权重或妆容素材。

