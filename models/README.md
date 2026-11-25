# 本地照片分析与生成模型

Node 仅在收到照片分析请求后启动 Python。此目录中的权重通过项目文件直接加载。服务不会向浏览器提供模型文件，也不会把照片写到服务器目录。

| 文件 | 用途 | SHA-256 |
|---|---|---|
| face-landmarker.task | 478 点面部检测 | 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff |
| pose-lite.task | 识别身体可见范围、协助定位远景头部 | 59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a |
| selfie-multiclass.tflite | 背景、头发、身体皮肤、脸部皮肤、衣物、配饰 | c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0 |
| modnet.onnx | photographic portrait matting，连续透明度 | 07c308cf0fc7e6e8b2065a12ed7fc07e1de8febb7dc7839d7b7f15dd66584df9 |

前三个文件从本项目先前使用的 Google MediaPipe 模型复制。上游提供各模型的说明与使用条款。[Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) · [Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) · [Image Segmenter](https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter)

二维卡通生成使用 `dct-net/` 中的四个文件。每种画风分别执行头部图和外围图。下载与启动时按 [固定 SHA-256 清单](../scripts/download_cartoon.py) 校验文件。绘制算法来自 Men 等人的 DCT-Net (SIGGRAPH 2022)。[作者仓库](https://github.com/menyifang/DCT-Net) · [动漫权重](https://www.modelscope.cn/models/damo/cv_unet_person-image-cartoon_compound-models) · [手绘权重](https://www.modelscope.cn/models/damo/cv_unet_person-image-cartoon-handdrawn_compound-models)

MODNet 采用 Zhanghan Ke 等人的摄影人像预训练模型。项目使用官方列出的 ONNX 版本，文件取自提供相同模型与 SHA-256 的镜像。[作者仓库与许可](https://github.com/ZHKKKe/MODNet) · [官方 ONNX 说明](https://github.com/ZHKKKe/MODNet/blob/master/onnx/README.md) · [实际下载与摘要](https://huggingface.co/DavG25/modnet-pretrained-models)

