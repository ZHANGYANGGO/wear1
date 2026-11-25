# WearMate 二维工作台

双击 [启动二维工作台.cmd](启动二维工作台.cmd)，打开 [穿搭工作台](http://127.0.0.1:4375/)。运行需要 Node.js 20 或更高版本，项目使用 Node 内置模块和本地静态素材。在当前目录也可以执行：

```powershell
node scripts/serve.mjs 4375
```

| 入口 | 使用方式 |
|---|---|
| [穿搭工作台](http://127.0.0.1:4375/) | 首次进入显示短发女士。可换装、叠穿外套、穿脱连衣裙、保存与恢复搭配。 |
| [人物与造型](http://127.0.0.1:4375/people.html) | 选择 7 个内置人物，或给自己的卡通头层选择身体模板。确认全身角色后即可进入试穿和衣橱。各造型模块独立记住选用的人物。 |
| [上传照片生成](http://127.0.0.1:4375/create.html) | 提取透明人物后可生成手绘或动漫头层，在原图旁核对五官、长发与衣领。远景可补正脸。确认后保存到同一人物。 |
| [我的衣橱](http://127.0.0.1:4375/wardrobe.html) | 查看商品原图和插画，按角色查看适配情况、导入或编辑单品并试穿。 |
| [今日穿搭](http://127.0.0.1:4375/?view=today) | 短发女士使用专属衣橱生成推荐。可使用 Open-Meteo 实时天气，或选温和、炎热、寒冷、下雨场景。 |
| [角色对照](http://127.0.0.1:4375/stage1a.html) | 在 Mila、Nia、Iris 三人间切换，比较两套搭配与单品。 |

### 用自己的照片换装

1. 在「上传照片生成」选择单人照片，完成分析后点击「生成卡通头层」并确认保存。已有头层可直接在「人物与造型」选择对应的照片人物。
2. 在人物库预览合身版或直身版。可勾选「查看全身画布上的五官对位」检查眼、唇和脸部轮廓。点击「确认使用此模板」。从「照片转卡通」模块进入时，先点「预览全身」。
3. 点「进入此人物的衣橱」。通用衣橱首次为空时，点「导入示例衣橱」，打开单品详情试穿。两套模板各有 6 件基础衣物和 11 件已适配的衣橱单品，细高跟显示待适配。短发女士另有自己的 9 件专属单品。
4. 在试穿台替换上衣、下装和鞋，叠穿或脱下外套。穿上连衣裙会暂时隐藏上衣与下装，点「切回上衣与裤子」可恢复。给穿搭命名并保存后，可从该人物的「已保存穿搭」载入。切换人物或模板会保留仍可用的搭配。

全身角色使用照片的卡通脸、发型及可见眼镜，身体比例和姿态来自确认的模板。重新生成头层后，需要为更新后的头层再次确认模板。同一浏览器内，通用衣橱的入库单品共享，个人外貌、当前穿搭和命名搭配按人物独立保存。

如果人物是用旧版生成的，在「人物与造型」选中该人物，点「用已存照片更新旧版头脸和颈部」，重新生成、保存，并再次确认身体模板。可以直接使用当时已保存的照片。

查看[同一张原照修正前后的五官和领口放大图](reports/cartoon/head-neck-comparison.jpg)，或查看[换领口、叠穿外套和模板对位实测](reports/personal-body/README.md)。

## 本机照片分析环境

当前工作区已配置 Python 环境。迁到另一台电脑时，先安装 64 位 Python 3.12，再在此目录运行以下命令。4 个推理权重随 `models/` 提供。内置人物只需 Node 和现有试穿素材。

```powershell
python -m venv .runtime/venv
.\.runtime\venv\Scripts\python.exe -m pip install -r requirements-analysis.txt
node scripts/serve.mjs 4375
```

首页选择「使用内置模型」可预览七人，点「确认并进入衣橱」试穿。首页选择「上传照片生成」会开启本机分析，依次检查原图、基础分割、深浅底精细抠图、部位和面部点位，再确认保存。人物库的「查看或更新照片分析」可重新查看或为旧照片补做分析。身高和体重选填。运行环境可通过 `WEARMATE_ANALYSIS_PYTHON` 指定；设置 `WEARMATE_DISABLE_ANALYSIS=1` 可单独停用分析功能。

## 本机卡通生成

在当前电脑直接启动工作台，上传照片后选择「生成或查看卡通头像」，选手绘或动漫，再点「生成卡通头层」。可以查看原照片、透明人物、卡通预览，叠加点位或切换衣领。确认保存后，刷新或重新进入人物库都能载入结果。

**首次安装**。Windows VS Code PowerShell 终端进入 `wear-二维` 目录。完成上面的照片分析环境安装后，为卡通推理创建独立的 64 位 Python 3.12 环境。OpenVINO 在 CPU 上直接执行上游的 TensorFlow 冻结图。

```powershell
python -m venv .runtime/cartoon-venv
.\.runtime\cartoon-venv\Scripts\python.exe -m pip install -r requirements-cartoon.txt
python scripts/download_cartoon.py
```

**日常启动**。双击 `启动二维工作台.cmd`，或执行以下命令。已有的四个 DCT-Net 权重直接从磁盘加载。

```powershell
node scripts/serve.mjs 4375
```

**单图验证**。下例用项目自带参考人物的清晰头部裁图生成一次手绘结果。也可以把 `--photo` 参数改为自己的单人照片路径。输出目录包括透明头层、前发遮罩、颈肩衔接层和坐标 JSON。

```powershell
.\.runtime\cartoon-venv\Scripts\python.exe -c "from PIL import Image; Image.open('assets/stage1a/iris-reference.webp').crop((235,8,395,168)).resize((480,480)).save('.runtime/cartoon-input.png')"
.\.runtime\cartoon-venv\Scripts\python.exe scripts/cartoon_head.py --photo .runtime/cartoon-input.png --style handdrawn --out .runtime/cartoon-output
```

模型缺失或损坏时重新运行 `python scripts/download_cartoon.py`。本机服务中断时重新启动工作台，保留当前浏览器页面并重试。可用 `WEARMATE_CARTOON_PYTHON` 指定解释器，`WEARMATE_CARTOON_MODEL_DIR` 指定权重目录，`WEARMATE_DISABLE_CARTOON=1` 单独关闭卡通服务。已有分析和预制角色均可独立使用。

[三张照片的六组生成结果](reports/cartoon/styles-and-fit.jpg) · [卡通生成验收、样例来源与图层接口](reports/cartoon/README.md)

## 数据与素材

原穿搭工作台、衣橱、天气和已保存搭配沿用既有存储键。同一浏览器、站点地址和端口会读回该站点的数据。其他端口的已有记录遵循浏览器的站点隔离规则。

新人物数据存入 IndexedDB 数据库 `wearmate.2d.people`（版本 2，会自动升级旧库）。原图保存在浏览器本机。上传入口支持可解码的 JPEG、PNG、WebP，单张最多 10 MB，宽高至少 128 像素，总面积最多 1600 万像素。

| 数据 | 主键 | 内容 |
|---|---|---|
| 内置人物 | 原有角色 ID | 读取原人物和衣物图层。 |
| `people` | `photo-<UUID>` | 用户照片人物的名称、来源、宽高、创建时间、可选身材记录和已确认的身体模板 ID。 |
| `images` | 人物 ID | 该照片人物的原图 Blob。建立人物时与选中记录在同一事务写入。 |
| `analyses` | 人物 ID | 主照片与补拍的原图、透明前景、灰度 alpha、类别图、点位、色样和变换。由 `getAnalysis(personId)` 读取。 |
| `targets` | 模块名 | 人物库、美颜、试妆、卡通和体型各自的选择。首次访问模块时可沿用人物库的选择。 |
| `results` | 人物 ID 与模块名 | 效果参数、可选结果图 Blob 和更新时间。新模块通过 `saveResult` 写入，页面通过 `getResult` 读取。 |

`getFitting(personId)` 读取同一结果库中的 `[personId, 'fitting']`。其 `body` 保存模板、头层版本、独立透明图层、鞋面所用脚背和五官几何。`geometry.layerToCanvas` 按行存储六个仿射系数；`geometry.landmarks` 为 560 × 1536 画布上的 478 个点，`features` 给出眼、唇、轮廓等索引。模板预览、试穿和点位叠画使用相同的角色坐标。

照片分析结果的读取示例、坐标约定、复跑命令和实测对照图见[人物提取验收](reports/extraction/README.md)。模型来源和文件摘要见[模型清单](models/README.md)。

运行素材位于 `assets/`。12 张衣橱商品原图来自本机资料，放在 `.local-wardrobe-references/`，由本机服务逐件提供。迁移到另一台机器时需一并复制该目录才能查看商品原图。素材制备母稿位于 `artwork/`。

运行 `node --test` 可复测二维逻辑与素材。项目直接提供 HTML 和 ES 模块，无需打包。完整的原版对照、浏览器结果和复跑说明见[迁移验收报告](reports/migration/README.md)。阶段零的原始需求保存在[历史说明](README.stage-0.md)。
