import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";

function playableHtml():Plugin {
  return {
    name: "playable-html",
    transformIndexHtml: {
      order: "pre",
      handler: html => html.replace(/<script data-vite-entry="([^"]+)">[\s\S]*?<\/script>/, '<script type="module" src="$1"></script>'),
    },
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        const page = bundle["index.html"];
        if (page?.type !== "asset" || typeof page.source !== "string") this.error("缺少网页入口");
        const script = Object.values(bundle).find(output => output.type === "chunk" && output.isEntry);
        const css = Object.values(bundle).find(output => output.type === "asset" && output.fileName.endsWith(".css"));
        if (script?.type !== "chunk" || css?.type !== "asset") this.error("缺少游戏脚本或样式");
        const scriptTag = `<script type="module" crossorigin src="./${script.fileName}"></script>`;
        const cssTag = `<link rel="stylesheet" crossorigin href="./${css.fileName}">`;
        if (!page.source.includes(scriptTag) || !page.source.includes(cssTag)) this.error("无法内嵌网页资源");
        const kitchen = readFileSync(new URL("./plate/index.html",import.meta.url),"utf8");
        const loader = readFileSync(new URL("./src/standalone.js",import.meta.url),"utf8");
        const license = bundle[".vite/license.md"];
        if (license?.type !== "asset") this.error("缺少搬家玩法的第三方许可");
        const inlineData = (id:string, value:string) =>
          '<script type="application/json" id="'+id+'">'+JSON.stringify(value).replace(/</g,"\\u003c")+"</script>";
        page.source = page.source
          .replace("</body>", () => inlineData("moving-licenses",String(license.source)) +
            inlineData("kitchen-page",kitchen) + '<script type="module">' + loader + "</script></body>")
          .replace(cssTag, () => "<style>" + css.source + "</style>")
          .replace(scriptTag, () => '<script type="text/plain" id="moving-entry">' + script.code.replace(/<\/script/gi, "<\\/script") + "</script>");
        delete bundle[script.fileName];
        delete bundle[css.fileName];
        this.emitFile({type:"asset",fileName:"plate/index.html",source:kitchen});
      },
    },
    writeBundle(_, bundle) {
      const page=bundle["index.html"];
      if(page?.type==="asset")writeFileSync(new URL("./搬家日-网页版.html",import.meta.url),page.source);
    },
  };
}

export default defineConfig({
  plugins: [playableHtml()],
  base: "./",
  server: { host: process.env.HOST || "127.0.0.1", port: Number(process.env.PORT || 5173), strictPort:true },
  preview: { host: process.env.HOST || "127.0.0.1", port: Number(process.env.PORT || 5173), strictPort:true },
  // Matter is already bundled with the moving simulation.
  resolve: { alias: { phaser: fileURLToPath(new URL("./node_modules/phaser/dist/phaser-arcade-physics.min.js", import.meta.url)) } },
  build: {
    license: true, modulePreload: false, cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
