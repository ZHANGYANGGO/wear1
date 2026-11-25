# 二维人物提取验收

打开 [穿搭工作台](http://127.0.0.1:4375/)。两条入口均来自首页。程序、模型和浏览器存储位于本机；验收脚本使用独立的浏览器上下文。

## 操作与结果

| 场景 | 实际检验 |
|---|---|
| 使用内置模型 | 在单独端口设置 `WEARMATE_DISABLE_ANALYSIS=1`。逐一选择七人、查看预览、确认进入衣橱、试穿深蓝短袖衬衫，核对试穿图层与人物 ID。浏览器对分析 API 和模型文件的请求数为 0。 |
| 上传近照和长发照 | 头像提取到 478 个脸部点，完整身体标为未观测。长发样片在基础分割外缘有明显硬边；精细抠图保留了鬓发和肩头细丝，在深底上部分浅色发缘仍可见。色样取自实际分区像素。 |
| 远景和补拍 | 海边运动员的左右手脚在同一张前景中。Iris 全身图可先保存轮廓，再从人物库补充正脸。脚本比较补拍前后主图前景的 SHA-256，并检查刷新后主图、补拍和人物 ID 的关联。 |
| 手机方向与缩放 | 同一照片制成带 EXIF 6 标签的横置 JPEG。归正后尺寸为 900 × 600，将眼、唇和下巴叠回原图。另用 1800 × 1200 输入验证 1440 × 960 处理图的 1.25 倍回映和眼角位置。 |
| 输入错误 | 对双人拼图、纯色无人图、严重遮脸图和损坏文件，分别验证多人、无人脸、遮挡、解码错误。补拍失败可重选；原全身图可继续预览。 |
| 取消、抢先返回、刷新 | 保存 A 后上传 B 再取消。连续选择照片，另将旧分析的返回故意延迟到新预览出现以后。检查姓名、尺寸和当前人物 ID。 |
| 历史人物 | 建立带人物、原图、试妆结果和模块选择的 v1 数据库。通过真实网页升级并补做分析，检查原 ID、创建时间、模块选择和试妆结果。 |
| 手机预览 | 在 390 像素宽视口检查页面宽度；在各对照图中检查画布尺寸，竖向人物从头至脚可见。 |

[网页截图对照](comparison.jpg) · [数值与错误分类](results.json) · [手机页面](mobile.png)。[长发原图](longhair-original.png) · [基础分割](longhair-basic.png) · [深底精细抠图](longhair-dark.png) · [浅底精细抠图](longhair-light.png) · [分区](longhair-regions.png) · [点位](longhair-points.png)。[远景运动员](athlete-full.png) · [全身轮廓](full-dark.png) · [补拍点位](supplement-points.png) · [手机方向](phone-points.png)。

## 样例来源与复跑

- 头像取自 MediaPipe 提供的肖像样片。脚本生成近照 PNG，并将同一张图片用于构造双人拼图与遮挡反例。[肖像原图](https://storage.googleapis.com/mediapipe-assets/portrait.jpg)
- 远景全身照取自 MediaPipe 的姿态测试样片。[运动员原图](https://storage.googleapis.com/mediapipe-assets/pose.jpg)
- 披肩长发使用 Pexels 编号 733872。旋转照由同一照片和 EXIF 方向标签生成。[长发照片来源](https://www.pexels.com/photo/woman-wearing-black-spaghetti-strap-top-733872/)
- 双照片关联测试使用项目内 `assets/stage1a/iris-reference.webp`。补拍样片是从同一张图裁出的人脸，用于隔离人物身份、裁切和存储误差。实际使用时可上传独立拍摄的清晰正脸。系统由用户确认两张图是否为同一人。

服务启动后从 `wear-二维` 运行以下命令。浏览器验收所用 Python 需装有 Pillow 和 Playwright。首次运行会将公开样片缓存到 `.runtime/`；也可把原图按脚本中列出的名称预先放入该目录。

```powershell
node --test tests/*.test.mjs
python scripts/verify-extraction.py --browser "$env:LOCALAPPDATA/ms-playwright/chromium-1134/chrome-win/chrome.exe"
```

其他机器可指定自己的 Chromium 可执行文件，或安装 Playwright Chromium 后省略 `--browser`。本机运行通过 34 项 Node 测试，并使用下列命令与第一步迁移基线比较素材、试穿图层、角色渲染和天气搭配。临时结果写入 `.runtime/migration-check/`。

```powershell
python scripts/verify-migration.py target --url http://127.0.0.1:4375 --output .runtime/migration-check --browser "$env:LOCALAPPDATA/ms-playwright/chromium-1134/chrome-win/chrome.exe"
```

## 下一部分读取接口

通过同源 ES 模块 `src/people/store.mjs` 读取。主照片与补拍分别拥有完整的数据和坐标。人脸很小且尚未补拍时，`faceSourceId` 为 `null`；仍可使用主图的前景。

```js
import { getAnalysis, getTarget } from './src/people/store.mjs';

const personId = await getTarget('library');
const analysis = personId && await getAnalysis(personId);
if (analysis) {
  const { primary, faceSourceId } = analysis;
  const foreground = await createImageBitmap(primary.assets.foreground);
  const face = faceSourceId ? analysis[faceSourceId] : null;
  // primary 始终提供主照片的全身或局部轮廓。
  // face.landmarks 中的点属于 face.original 对应的归正图。
  foreground.close();
}
```

| 字段 | 含义 |
|---|---|
| `schemaVersion / personId / updatedAt` | 分析结构版本 1、稳定人物 ID、毫秒时间戳。内置或尚未分析的旧人物，`getAnalysis` 返回 `undefined`。 |
| `primary / supplement` | 主照片记录与可选补拍记录。每个记录的 `sourceId` 对应该字段名。 |
| `original / assets` | 原始文件 Blob。派生 Blob 均为 PNG。`foreground` 为 RGBA，`alpha` 为 0–255 连续灰度，`semantic` 为灰度类别编号。 |
| `classes` | 按类别编号排列：0 背景、1 头发、2 身体皮肤、3 面部皮肤、4 衣物、5 其他或配饰。类别图使用像素原值，不应按彩色预览的色板反推类别。 |
| `bodyObservation / needsSupplement` | 是否观测到身体（通过骨盆可见性判断）；主图是否建议补拍正脸。头部近照仍保留实际观测到的颈肩像素。 |
| `landmarks / features` | 原始方向归正后的二维像素点数组，缺少人脸时为 `null`。脸型、眼、唇和下巴使用点索引。左右眼按被摄者自身方向命名。 |
| `samples.skin / samples.hair` | 分区内高透明度前景像素的中位 RGB 与取样像素数。缺少依据时为 `null`。 |
| `geometry` | 编码图尺寸 `encodedSize`、EXIF 标签 `orientation`、归正尺寸 `orientedSize`、输出图尺寸 `rasterSize`。处理图长边最多 1440 像素。 |

变换均为行优先六元组 `[a,b,c,d,e,f]`，定义为 `X=a*x+b*y+c`，`Y=d*x+e*y+f`。`encodedToOriented` 将原始编码图坐标归正；`rasterToOriented` 将遮罩像素坐标映射到归正原图。`headCropRaster` 为处理图上的 `[left,top,right,bottom]`，右与下边界不含。`headUnitToOriented` 将该头部裁图中的单位坐标映射到归正原图。补拍点位须叠在补拍原图上，不能直接套到主图。人物、两张图的分析与当前模块选择由同一 IndexedDB 事务写入。

