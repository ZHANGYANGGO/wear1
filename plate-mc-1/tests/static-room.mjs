import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {chromium} from "playwright-core";
import {signalingFixture} from "./signaling.mjs";

const live=process.argv.includes("--public");
const signal=signalingFixture();
const disk=process.argv.includes("--file");
const builtPage=pathToFileURL(path.resolve("dist/index.html")).href;
const root=disk?builtPage:"https://static.example.test/moving/";
function roomCode(href){
  const url=new URL(href);
  return (disk?new URLSearchParams(url.hash.slice(1)):url.searchParams).get("room");
}
const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH || [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe","/usr/bin/chromium",
].find(existsSync),args:["--disable-background-timer-throttling","--disable-renderer-backgrounding"]});
const errors=[];
async function open(url){
  const context=await browser.newContext();
  if(!live)await signal(context);
  if(!disk)await context.route(root+"**",async route=>{
    const name=new URL(route.request().url()).pathname.slice("/moving/".length) || "index.html";
    assert.match(name,/^(index\.html|assets\/[\w.-]+\.(js|css))$/);
    const types={".js":"application/javascript",".css":"text/css",".html":"text/html; charset=utf-8"};
    await route.fulfill({body:await readFile(path.join("dist",name)),contentType:types[path.extname(name)]});
  });
  const page=await context.newPage();
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",msg=>{if(live && msg.type()==="error")console.log(msg.text().split("?")[0]);});
  await page.goto(url);
  return page;
}
async function members(page,n){
  await page.waitForFunction(n=>!document.querySelector("#online").hidden &&
    document.querySelector("#members").textContent.includes(n+" / 2"),n,{timeout:30000});
  assert.ok(roomCode(page.url()));
}
async function checkOfflineLaunch(){
  const offline=await browser.newContext({offline:true});
  for(const url of [pathToFileURL(path.resolve("index.html")).href,builtPage]){
    const page=await offline.newPage(),failures=[];
    page.on("requestfailed",r=>failures.push(r.url()));
    page.on("pageerror",e=>failures.push(e.message));
    await page.goto(url,{waitUntil:"commit"});
    await page.waitForSelector("#stage canvas");
    assert.equal(page.url(),builtPage);
    assert.equal(await page.locator(".workspace").evaluate(e=>getComputedStyle(e).display),"grid");
    await page.locator('[data-command="new"]').click();await page.locator('[data-command="start"]').click();
    await page.keyboard.press("f");
    await page.waitForFunction(()=>document.querySelector("#tool-state").textContent.includes("已垫"));
    await page.reload();
    await page.waitForFunction(()=>document.querySelector("#tool-state").textContent.includes("已垫"));
    assert.deepEqual(failures,[]);await page.close();
  }
  await offline.close();
  console.log("PASS offline file launch, styled map, interaction and reload through both entries");
}
async function checkRoom(){
  const host=await open(root+"?order=short");
  await host.locator("#multi").click();await host.locator("#create").click();
  try{await members(host,1);}catch(e){throw Error("建房失败 "+await host.locator("#network-msg").textContent(),{cause:e});}
  const guest=await open(disk?root:host.url());
  if(disk){
    assert.equal(await host.locator("#invite").innerText(),"复制房间号");
    await guest.locator("#multi").click();
    await guest.locator("#code").fill(roomCode(host.url()));await guest.locator("#join").click();
  }
  try{await Promise.all([members(host,2),members(guest,2)]);}
  catch(e){throw Error("搭档加入失败 "+await guest.locator("#network-msg").textContent()+" "+errors.join(", "),{cause:e});}
  const third=await open(host.url());await third.waitForFunction(()=>document.querySelector("#network-msg").textContent.includes("已有两名"));
  await third.close();
  const duplicate=await host.context().newPage();await duplicate.goto(root);
  await duplicate.locator("#multi").click();await duplicate.locator("#resume-room").click();
  await duplicate.waitForFunction(()=>document.querySelector("#network-msg").textContent.includes("另一个标签页"));
  await duplicate.close();
  await guest.locator('[data-command="start"]').click();
  await host.waitForSelector("#dispatch",{state:"hidden"});
  await host.keyboard.press("f");
  await guest.waitForFunction(()=>document.querySelector("#tool-state").textContent.includes("已垫"));
  await host.reload();
  await members(host,2);await members(guest,2);
  await guest.reload();await members(guest,2);
  await guest.waitForFunction(()=>document.querySelector("#tool-state").textContent.includes("已垫"));
  await Promise.all([host,guest].map(p=>p.waitForSelector('[data-command="retry"]',{timeout:20000})));
  await guest.locator('[data-command="retry"]').click();
  await host.waitForSelector('[data-command="start"]');
  assert.equal(await host.locator("#wallet").innerText(),"0");
  const ownerContext=host.context(),invite=host.url();
  await host.close();
  const reopened=await ownerContext.newPage();
  await reopened.goto(root);await reopened.locator("#multi").click();
  await reopened.locator("#resume-room").click();await members(reopened,2);
  assert.equal(roomCode(reopened.url()),roomCode(invite));
  await guest.locator('[data-command="start"]').click();
  await reopened.waitForSelector("#dispatch",{state:"hidden"});
  assert.deepEqual(errors,[]);
  console.log("PASS "+(disk?"local file and room code":"static subdirectory and invitation")+", capacity, guest command, host/guest refresh, deadline, retry and reopening host tab; signaling="+(live?"public":"fixture"));
}
try{
  await checkOfflineLaunch();
  if(!process.argv.includes("--offline"))await checkRoom();
}finally{await browser.close();}

