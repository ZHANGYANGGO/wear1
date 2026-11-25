# plate-mc-1 · 厨房营业

双击 [厨房营业-网页版.html](厨房营业-网页版.html) 开始经营。单人可离线游玩。双人由房主建房，搭档输入房间号加入。静态部署也可以使用[网页版压缩包](厨房营业-网页版.zip)，解压后的入口是 `index.html`。

游戏包含三张厨房地图、四道可选菜谱、逐日营业、设备采购和双人协作。[玩法与操作说明](plate/README.md)

## 开发与验证

使用 Node.js 22.12 或更高版本。在项目目录运行以下命令。

```sh
npm ci
npm test
npm run build
```

构建生成根目录的厨房单文件及 `plate/index.html`。运行 `npm run dev` 可预览厨房；运行 `npm run package:kitchen` 可重新打包 ZIP（需要 Python 3.8+）。浏览器验收使用 `node plate/tests/browser.mjs --offline`。
