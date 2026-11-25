import { spawn } from 'node:child_process';
import path from 'node:path';

const limit = 10 * 1024 * 1024;
let running = 0;
function reply(response,status,payload) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify(payload));
}

export async function analyzePhoto(request,response,root,port) {
  const host = request.headers.host;
  if (![`127.0.0.1:${port}`,`localhost:${port}`].includes(host)
      || (request.headers.origin && request.headers.origin !== 'http://' + host)) {
    return reply(response,403,{error:'请从本机工作台提交照片。'});
  }
  if (request.method !== 'POST') return reply(response,405,{error:'照片分析需要 POST。'});
  if (process.env.WEARMATE_DISABLE_ANALYSIS === '1') return reply(response,503,{error:'照片分析服务已关闭。'});
  if (!['primary','supplement'].includes(request.headers['x-photo-source'])) return reply(response,400,{error:'照片来源无效。'});
  if (running >= 2) return reply(response,429,{error:'当前正在分析其他照片，请稍后重试。'});
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > limit) return reply(response,413,{error:'每张照片最多 10 MB。'});
      chunks.push(chunk);
    }
  } catch { return; }
  if (response.destroyed) return;
  if (running >= 2) return reply(response,429,{error:'分析繁忙，请稍后重试。'});
  const python = process.env.WEARMATE_ANALYSIS_PYTHON ?? path.join(root,'.runtime','venv',
    ...(process.platform === 'win32' ? ['Scripts','python.exe'] : ['bin','python']));
  const worker = spawn(python,[path.join(root,'scripts','analyze_photo.py'),request.headers['x-photo-source']],
    {cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'}});
  running++;
  const timer = setTimeout(() => { reply(response,504,{error:'分析超时，请重新选择照片。'}); worker.kill(); },90000);
  response.once('close',() => { if (worker.exitCode === null) worker.kill(); });
  worker.on('error',() => reply(response,503,{error:'照片分析环境未就绪，请按 README 安装本地依赖。'}));
  worker.stdin.on('error',() => {});
  const output = [];
  let bytes = 0, diagnostic = '';
  worker.stdout.on('data',chunk => {
    bytes += chunk.length;
    if (bytes > 30*1024*1024) worker.kill();
    else output.push(chunk);
  });
  worker.stderr.on('data',chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2400); });
  worker.on('close',code => {
    clearTimeout(timer); running--;
    if (response.destroyed || response.writableEnded) return;
    if (code === 0) {
      try {
        const result = JSON.parse(Buffer.concat(output).toString('utf8'));
        return reply(response,result.error ? 422 : 200,result);
      } catch { /* Report a worker failure below. */ }
    }
    console.error('照片分析进程退出',code,diagnostic);
    reply(response,503,{error:'照片分析未能完成，请检查本机服务窗口中的模型或环境错误。'});
  });
  worker.stdin.end(Buffer.concat(chunks));
}

