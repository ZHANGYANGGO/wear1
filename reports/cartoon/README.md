# 照片转卡通头层验收

在[上传照片生成](http://127.0.0.1:4375/create.html)选择单人照，等待人物提取完成，点「生成或查看卡通头像」。生成后可叠加五官点、切换两种衣领，检查满意后保存。已有人物可从人物库打开「查看或更新照片分析」。本机 CPU 已实际产出动漫和手绘两种结果。首次安装、日常启动和单图命令见[工作台 README](../../README.md)。

## 实际效果

[同一照片修正前后的人脸与衣领放大图](head-neck-comparison.jpg) · [三张原照、两种画风与同一人物的实际试穿](styles-and-fit.jpg) · [旧版验收图](styles-and-fit-v1.jpg) · [生成页面](workbench.png) · [五官与下巴定位](generated-points.png) · [每次推理的误差和颈部接合数据](results.json)

旧版让 DCT-Net 重绘整张脸，并以鼻尖位移小于原脸宽的 35% 作为校准放行条件。正面微笑样片出现眼形和嘴宽变化，转头样片的下巴下方残留一块深色照片颈皮。试领又在固定位置叠加另一块颈部。旧图末列反复展示同一位内置人物，无法用来判断前三位照片角色的实际穿衣效果。

新版将模型笔触按原照五官对齐，眼镜、瞳孔、嘴角和牙缘沿用照片的空间位置。独立头层沿下颌收边，试领和换装时用同一条下颌曲线生成颈部。合身版和直身版各自采样原模板裸露颈部的明暗，再配到该人物的肤色。被衣物遮住的颈肩形状仍由模板估计。

| 输入 | 重点检查 |
|---|---|
| A 的第一张照片，正面微笑 | 放大双眼、鼻翼、笑容宽度和牙缘，再对照下巴到圆领之间的皮肤。 |
| A 的第二张照片，转头发言 | 比较视线和张口程度，检查近侧下颌、耳垂与颈侧的连续性。 |
| B 的照片，长发、眼镜 | 检查镜框、脸颊和嘴角，比较头发遮挡下的颈肩与两种衣领。 |

输入 A 是公开示例集中的两张独立照片，输入 B 是 Pexels 的公开人像。脚本直接上传各自的摄影原图并从网页执行生成。用于验证补拍关联的额外素材来自工作台 Iris 参考图。[A 第一张](https://github.com/ageitgey/face_recognition/blob/master/examples/obama.jpg) · [A 第二张](https://github.com/ageitgey/face_recognition/blob/master/examples/obama2.jpg) · [B 照片](https://www.pexels.com/photo/woman-wearing-black-framed-eyeglasses-1239291/)

实际推理耗时、前后遮挡像素数和每套模板的下颌重叠像素数保存在[验收数据](results.json)。从人物库选择照片角色、确认模板到试穿的手机页面见[人物库实测](../personal-body/mobile.png)。

## 推理与校准

- 实际运行 DCT-Net 的四个官方冻结图。独立 Python 3.12 环境使用 OpenVINO 的 TensorFlow 前端在 CPU 上执行原图。按作者的 288 × 288 五点参考做相似变换，单独执行头部分支，再将结果放回图层坐标。外围图负责补足对齐框外的发束，两支输出在重叠区衔接。[上游对齐与回映](https://github.com/menyifang/DCT-Net/blob/main/source/cartoonize.py) · [上游多风格 SDK 示例](https://github.com/menyifang/DCT-Net/blob/main/run_sdk.py) · [本地权重说明](../../models/README.md)
- 网页复用前景、类别图与 478 个原照点。人脸内部以原照为坐标，按三角网格对齐模型色调，保留照片上五官的局部边缘。在最终可见头图上重新检测 478 个点；用眼、鼻、嘴与下巴等 16 个点计算相对于原脸宽的偏移。第 90 百分位超过 3.5% 或最大偏移超过 6% 时，返回校准错误。点位误差衡量的是几何偏移，画风、肤色和本人相似度仍需看原照对比。
- 头层单独保留下颌、耳和发束。两套模板各保存自己的头部等比变换和带纹理的颈肩层。浏览器验收同时检查下颌中段的多列有效重叠像素，以及下巴至衣领的皮肤覆盖。验收图最后一列从对应人物的实际试穿页面采集。
- 实际运行了 photo2cartoon 的官方 ONNX 生成器，用一张额外照片做同图对照。输入沿用本项目的点位和遮罩做眼线校正、方形扩框与白底归一化。作者的 Face ID Loss 属于上游训练方法，本项目采用已训练权重。该项目说明其公开模型的训练样本主要为亚洲年轻女性，其画风与工作台也有差异。[同图三种模型输出](photo2cartoon-comparison.png) · [输入样片](https://www.pexels.com/photo/woman-wearing-black-spaghetti-strap-top-415829/) · [作者说明](https://github.com/minivision-ai/photo2cartoon) · [官方 ONNX 推理](https://github.com/minivision-ai/photo2cartoon/blob/master/test_onnx.py)

## 浏览器验收与复跑

真实浏览器逐一生成、确认、刷新并通过人物 ID 读取六个结果。检查透明度、衣物类清除、卡通点位、衣领前后遮挡、换源后的旧结果清理、取消生成与保留已确认角色。另起一个指向空权重目录的本机服务，验证错误提示，恢复权重并模拟一次连接中断，再用同一份分析重试。补拍测试验证实际生成结果指向补拍图。

从 `wear-二维` 根目录运行。自动化使用 Pillow 与 Playwright。`--browser` 可换为本机 Chromium 路径。脚本首次取公开样片，已有缓存时复用。每次运行使用独立浏览器会话。

```powershell
node --test tests/*.test.mjs
python scripts/verify-cartoon.py --browser "$env:LOCALAPPDATA/ms-playwright/chromium-1134/chrome-win/chrome.exe"
python scripts/verify-extraction.py --browser "$env:LOCALAPPDATA/ms-playwright/chromium-1134/chrome-win/chrome.exe"
```

可选模型对照使用 `.runtime/photo2cartoon.onnx`，SHA-256 为 `542914cb8580cb733c7e914d22cc24ddabbbb207516d74ffc793f2a1b6c3eeb3`。将官方文件与编号 415829 的照片放到下列位置后即可复跑。[作者提供的 ONNX 下载](https://drive.google.com/file/d/1PhwKDUhiq8p-UqrfHCqj257QnqBWD523/view) · [实际使用的样片尺寸](https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=900)

```powershell
.\.runtime\cartoon-venv\Scripts\python.exe scripts/compare_photo2cartoon.py --model .runtime/photo2cartoon.onnx --photo .runtime/longhair.jpg --out reports/cartoon/photo2cartoon-comparison.png
```

## 下一部分的读取接口

卡通结果和照片分析、人物、模块选择在同一 IndexedDB 事务中提交。重新上传照片或修改补拍来源后，确认时会清理与新来源不符的旧头层。每个已确认的人物都有稳定 ID。

```js
import { getAnalysis, getCartoon, getTarget } from './src/people/store.mjs';

const id = await getTarget('cartoon');
const head = id && await getCartoon(id);
if (head) {
  const analysis = await getAnalysis(id);
  const source = analysis[head.sourceId];
  const bitmap = await createImageBitmap(head.assets.head);
  // bitmap 与 head.landmarks 使用同一个局部像素坐标系。
  // source.original 是此头层实际使用的主照片或补拍照片。
  bitmap.close();
}
```

| 字段 | 用途 |
|---|---|
| `sourceId / sourceHash / style / weights` | 主图或补拍、原文件 SHA-256、实际画风、头部和外围权重 SHA-256。 |
| `assets.head / alpha / parts / frontHair` | 透明 RGBA 头层、连续 alpha、语义类别、盖在衣物上方的发束遮罩。后三个是灰度 PNG，遮罩强度取灰度值。类别沿用第一部分编号。 |
| `size / landmarks / features` | 头层尺寸、生成图重新测量的 478 个点，以及双眼、嘴唇、下巴和脸型的索引。 |
| `neck / neckObservation / hairClipped` | 头层中的颈部接点、可见颈部或仅下巴的状态、是否观察到发尾被原照底边截断。 |
| `mapping` | `layerToOriented` 把图层像素映射回对应的归正照片。`layerToAligned` 和 `alignedToLayer` 对应模型头框。`layerToFittedTemplate` 对应 560 × 1536 试领模板。六元组为行优先，X=ax+by+c，Y=dx+ey+f。风格化改变五官时，试妆应使用生成图的点位。 |
| `assets.neckJoin / assets.straightNeckJoin` | 合身、直身各自的 RGBA 颈肩层。`mapping.placements[templateId]` 给出对应头部变换和颈肩层左上角。 |

[当前实测元数据](example-v2/head.json) · [透明头层](example-v2/head.png) · [合身版颈肩](example-v2/neckJoin.png) · [直身版颈肩](example-v2/straightNeckJoin.png) · [保留用于兼容性测试的旧头层](example/head.json)
