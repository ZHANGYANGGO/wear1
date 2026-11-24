import {build} from "esbuild";
import {readFile,writeFile,readdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const dir=fileURLToPath(new URL(".",import.meta.url));
export async function bundlePage(entry=path.join(dir,"main.mjs")){
  const [code,html,css,source,license]=await Promise.all([
    build({entryPoints:[entry],bundle:true,format:"iife",target:"es2022",minify:true,write:false,metafile:true,legalComments:"inline"}),
    readFile(path.join(dir,"shell.html"),"utf8"),readFile(path.join(dir,"shop.css"),"utf8"),
    readFile(path.join(dir,"upstream/README.md"),"utf8"),readFile(path.join(dir,"upstream/LICENSE"),"utf8"),
  ]);
  const packages=new Set();
  for(const name of Object.keys(code.metafile.inputs)){
    const parts=name.split(/[/\\]node_modules[/\\]|^node_modules[/\\]/).at(-1).split(/[/\\]/);
    if(name.includes("node_modules"))packages.add(parts[0].startsWith("@")?parts.slice(0,2).join("/"):parts[0]);
  }
  const notices=[source,license];
  for(const pkg of [...packages].sort()){
    const folder=path.join(dir,"../node_modules",pkg),files=await readdir(folder);
    const file=files.find(f=>/^licen[sc]e(\..*)?$/i.test(f));
    if(file)notices.push(pkg+"\n"+await readFile(path.join(folder,file),"utf8"));
  }
  const embedded=JSON.stringify(notices).replace(/</g,"\\u003c");
  return html.replace("/*APP_STYLE*/",()=>css).replace("/*APP_SCRIPT*/",()=>code.outputFiles[0].text.replace(/<\/script/gi,"<\\/script"))
    .replace("</body>",()=>'<script type="application/json" id="licenses">'+embedded+'</script></body>');
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  await writeFile(path.join(dir,"index.html"),await bundlePage());
  console.log("plate/index.html 已生成");
}
