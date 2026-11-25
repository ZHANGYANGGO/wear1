import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

let running = 0;
const maxRequest = 18 * 1024 * 1024;
const setup = '请在 wear-二维 目录按 README 安装 requirements-cartoon.txt，然后点击重新生成。';

export async function generateCartoon(request,response,root,port) {
  const fail = (status,error) => {
    if (!response.destroyed) response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify({error}));
  };
  const host = request.headers.host;
  if (![`localhost:${port}`,`127.0.0.1:${port}`].includes(host) ||
      (request.headers.origin && request.headers.origin !== 'http://'+host)) return fail(403,'请从本机工作台生成。');
  if (request.method !== 'POST') return fail(405,'卡通生成需要 POST。');
  const style = request.headers['x-cartoon-style'];
  if (!['anime','handdrawn'].includes(style)) return fail(400,'请选择可用画风。');
  if (process.env.WEARMATE_DISABLE_CARTOON === '1') return fail(503,'生成服务已关闭。请取消 WEARMATE_DISABLE_CARTOON 并重启二维工作台，再使用这张照片重试。');
  if (running >= 2) return fail(429,'当前正在生成其他头像，请稍后重试。');
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxRequest) return fail(413,'分析数据过大，请缩小照片后重试。');
      chunks.push(chunk);
    }
  } catch { return; }
  if (response.destroyed) return;
  if (running >= 2) return fail(429,'当前正在生成其他头像，请稍后重试。');
  const python = process.env.WEARMATE_CARTOON_PYTHON ?? path.join(root,'.runtime','cartoon-venv',
    ...(process.platform === 'win32' ? ['Scripts','python.exe'] : ['bin','python']));
  const worker = spawn(python,[path.join(root,'scripts','cartoon_head.py'),'--style',style],
    {cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'}});
  running++;
  response.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});
  const send = value => { if (!response.destroyed && !response.writableEnded) response.write(JSON.stringify(value)+'\n'); };
  send({phase:'preparing'});
  let complete = false, diagnostic = '';
  const finish = value => {
    if (complete) return;
    complete = true;
    send(value);
    if (!response.destroyed) response.end();
  };
  const timer = setTimeout(() => { finish({error:'本机推理超时。请关闭占用 CPU 的任务后重试。'});worker.kill(); },180000);
  response.on('close',() => { if (worker.exitCode === null) worker.kill(); });
  worker.on('error',() => finish({error:'无法启动本地卡通环境。'+setup}));
  worker.stdin.on('error',() => {});
  worker.stderr.on('data',chunk => { diagnostic=(diagnostic+chunk.toString()).slice(-2000); });
  const lines = createInterface({input:worker.stdout});
  lines.on('line',line => {
    try {
      const event=JSON.parse(line);
      if (event.error || event.result) finish(event);
      else if (event.phase) send(event);
    } catch { finish({error:'推理输出无法读取。'+setup});worker.kill(); }
  });
  worker.on('close',() => {
    clearTimeout(timer); running--;lines.close();
    if (!complete && !response.destroyed) {
      console.error('Cartoon worker:',diagnostic);
      finish({error:'本机推理进程已退出。'+setup});
    }
  });
  worker.stdin.end(Buffer.concat(chunks));
}
