# Delixia 配方来源

本目录的 `recipe.mjs` 改编自 TriForMine / Delixia，固定提交为 `053256fc5939af05a490d70f95602762799105bd`。[上游项目与贡献者](https://github.com/TriForMine/Delixia/tree/053256fc5939af05a490d70f95602762799105bd)

上游的 `cooked_rice_recipe` 将一份生米加热 5000 毫秒，得到一份熟饭。`onigiri_recipe` 在料理板上组合一份熟饭和一份海苔，得到一个饭团。本地保留用量和时长，以锅承接加热动作，将时间改用秒表示，食材和成品使用本地字符串 ID。[上游配方注册表](https://github.com/TriForMine/Delixia/blob/053256fc5939af05a490d70f95602762799105bd/src/shared/recipes.ts)

上游的加工实现区分限时加工和即时合成。厨房根据这一区分在本地规则中实现锅与料理台，并由房主浏览器推进状态。[上游 RecipeService](https://github.com/TriForMine/Delixia/blob/053256fc5939af05a490d70f95602762799105bd/src/server/services/RecipeService.ts)

上述改编按 Apache License 2.0 提供，原仓库许可全文随本目录分发。[本地许可证](LICENSE) · [上游许可证](https://github.com/TriForMine/Delixia/blob/053256fc5939af05a490d70f95602762799105bd/LICENSE)
