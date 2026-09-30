// @vitest-environment node
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createRequire } from 'node:module';
import { accessSync, constants, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRequire = createRequire(path.resolve(process.cwd(), '../api/package.json'));
const puppeteer = apiRequire('puppeteer');
const HOST='127.0.0.1', WEB_PORT=4340, API_PORT=4341;
const WEB_ORIGIN=`http://${HOST}:${WEB_PORT}`, API_ORIGIN=`http://${HOST}:${API_PORT}`;
const CONTRACT_ID='contract-482';
const user={id:'student-482',type:'aluno',name:'Aluno Evidencia 482',email:'aluno.482@example.com'};
const current={id:'template-current',planId:'plan-1',mesocycleNumber:2,weekNumber:4,weekStartDate:'2026-09-28T00:00:00.000Z',releasedAt:'2026-09-27T10:00:00.000Z',plan:{id:'plan-1',name:'Plano Performance com nome longo para validar responsividade'},workoutDays:[{id:'day-1',dayOfWeek:2,workoutDate:'2026-09-30T00:00:00.000Z',sessionDurationMin:60,location:'Academia principal',method:'Forca',status:'planned'}]};
const old={...current,id:'template-old',weekNumber:2,weekStartDate:'2026-09-07T00:00:00.000Z',releasedAt:'2026-09-06T10:00:00.000Z',workoutDays:[]};
const future={...current,id:'template-future',weekNumber:5,weekStartDate:'2026-10-05T00:00:00.000Z',releasedAt:'2026-09-29T10:00:00.000Z'};
const detail={...current,trainingMethod:'Forca e resistencia',trainingDivision:'A/B',studentGoal:'Condicionamento',observation1:'Executar com tecnica controlada.',workoutDays:[{...current.workoutDays[0],restTime:60,targetHrMin:'120',targetHrMax:'150',targetSpeedMin:null,targetSpeedMax:null,detailNotes:'Mantenha a postura.',complementNotes:'Hidrate-se.',generalGuidelines:'Pare se sentir dor.',exercises:[{id:'ex-1',section:'Principal',system:'Series',sets:4,reps:10,intervalSec:60,load:20,exerciseNotes:'Movimento controlado',exercise:{name:'Agachamento livre'}}]}]};

let mode='list', failOnce=true;
function identity(){let e={};try{if(process.env.GITHUB_EVENT_PATH)e=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));}catch{} return {headSha:e?.pull_request?.head?.sha||process.env.GITHUB_SHA||'unknown',baseSha:e?.pull_request?.base?.sha||null,mergePreviewSha:process.env.GITHUB_SHA||null};}
function chromeExecutable(){for(const c of [process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean)){try{accessSync(c,constants.X_OK);return c;}catch{}} throw new Error('Chrome/Chromium not found');}
function respond(res,status,payload){res.writeHead(status,{'Access-Control-Allow-Origin':WEB_ORIGIN,'Access-Control-Allow-Headers':'Authorization, Content-Type, X-Contract-Id','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json; charset=utf-8'});res.end(payload===undefined?'':JSON.stringify(payload));}
async function startApi(){const requests=[];const server=http.createServer((req,res)=>{const u=new URL(req.url||'/',API_ORIGIN);requests.push({method:req.method,path:u.pathname,contractId:req.headers['x-contract-id']||null});if(req.method==='OPTIONS')return respond(res,204);if(u.pathname==='/api/v1/auth/me')return respond(res,200,{data:user});if(u.pathname==='/api/v1/student/me/summary')return respond(res,200,{success:true,data:{name:user.name,hasPendingProfileReview:false,nextProfileReviewAt:null,recentNotifications:[]}});if(u.pathname==='/api/v1/student/me/workouts'&&req.method==='GET'){if(mode==='error'&&failOnce){failOnce=false;return respond(res,500,{message:'temporary'});}const payload=mode==='empty'?[]:[old,current,future];if(mode==='loading')return setTimeout(()=>respond(res,200,{success:true,data:payload}),700);return respond(res,200,{success:true,data:payload});}if(u.pathname==='/api/v1/student/me/workouts/template-current')return respond(res,200,{success:true,data:detail});return respond(res,404,{message:'unexpected',path:u.pathname});});await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(API_PORT,HOST,resolve)});return{server,requests};}
async function startVite(){const prev=process.env.VITE_API_URL;process.env.VITE_API_URL=API_ORIGIN;const {createServer}=await import('vite');const server=await createServer({root:process.cwd(),logLevel:'error',server:{host:HOST,port:WEB_PORT,strictPort:true}});await server.listen();return{server,prev};}
async function stopApi(server){if(!server)return;server.closeAllConnections?.();await new Promise(r=>server.close(r));}
async function stopVite(v){if(!v)return;await v.server.close();if(v.prev===undefined)delete process.env.VITE_API_URL;else process.env.VITE_API_URL=v.prev;}
async function setSession(page){await page.goto(`${WEB_ORIGIN}/login`,{waitUntil:'domcontentloaded'});await page.evaluate((u,c)=>{localStorage.setItem('token','issue-482-browser-token');localStorage.setItem('user',JSON.stringify(u));localStorage.setItem('studentContractId',c);},user,CONTRACT_ID);}
async function shot(page){const b=await page.screenshot({fullPage:true});return{bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
async function waitText(page,text){await page.waitForFunction(t=>document.body?.innerText.includes(t),{timeout:12000},text);}
async function layout(page){return page.evaluate(()=>({pathname:location.pathname,innerWidth,innerHeight,scrollWidth:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth),buttons:[...document.querySelectorAll('a,button')].filter(el=>el.getClientRects().length>0).map(el=>{const r=el.getBoundingClientRect();return{text:(el.textContent||'').trim(),left:r.left,right:r.right}})}));}
async function assertNoOverflow(page){const l=await layout(page);expect(l.scrollWidth).toBeLessThanOrEqual(l.innerWidth+1);for(const b of l.buttons){expect(b.left,b.text).toBeGreaterThanOrEqual(-1);expect(b.right,b.text).toBeLessThanOrEqual(l.innerWidth+1);}return l;}
async function clickText(page,text){await page.evaluate(t=>{const n=[...document.querySelectorAll('a,button')].find(x=>(x.textContent||'').trim()===t);if(!n)throw new Error('not found '+t);n.click();},text);}

const suite=process.env.GITHUB_ACTIONS==='true'?describe:describe.skip;
suite('Issue #482 / PR #484 - evidencia browser Meus Treinos',()=>{
 it('valida home, loading, lista/historico, vazio, erro/retry e detalhe em desktop/mobile',async()=>{
  const id=identity();let api,vite,browser;const scenarios=[];
  try{
   api=await startApi();vite=await startVite();browser=await puppeteer.launch({executablePath:chromeExecutable(),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
   const page=await browser.newPage();await setSession(page);
   for(const viewport of [{name:'desktop-1366x768',width:1366,height:768,isMobile:false},{name:'mobile-390x844',width:390,height:844,isMobile:true,hasTouch:true}]){
    await page.setViewport(viewport);
    mode='list';await page.goto(`${WEB_ORIGIN}/inicio?contractId=${CONTRACT_ID}`,{waitUntil:'domcontentloaded'});await waitText(page,'Ver meus treinos');const home=await assertNoOverflow(page);await clickText(page,'Ver meus treinos');await waitText(page,'Atual e próximos');await waitText(page,'Histórico');const list=await assertNoOverflow(page);expect(location?.pathname).not.toBeDefined;
    const listShot=await shot(page);await clickText(page,'Ver detalhes');await waitText(page,'Agachamento livre');await waitText(page,'somente leitura');const detailLayout=await assertNoOverflow(page);const detailShot=await shot(page);
    mode='empty';await page.goto(`${WEB_ORIGIN}/student/workouts?contractId=${CONTRACT_ID}`,{waitUntil:'domcontentloaded'});await waitText(page,'Nenhum treino liberado');const emptyLayout=await assertNoOverflow(page);
    mode='error';failOnce=true;await page.goto(`${WEB_ORIGIN}/student/workouts?contractId=${CONTRACT_ID}`,{waitUntil:'domcontentloaded'});await waitText(page,'Não foi possível carregar seus treinos');await clickText(page,'Tentar novamente');await waitText(page,'Atual e próximos');const retryLayout=await assertNoOverflow(page);
    mode='loading';const nav=page.goto(`${WEB_ORIGIN}/student/workouts?contractId=${CONTRACT_ID}`,{waitUntil:'domcontentloaded'});await waitText(page,'Carregando seus treinos...');const loadingLayout=await assertNoOverflow(page);await nav;await waitText(page,'Atual e próximos');
    scenarios.push({viewport,home,list,detail:detailLayout,empty:emptyLayout,retry:retryLayout,loading:loadingLayout,screenshots:{list:listShot,detail:detailShot},accessibility:await page.accessibility.snapshot({interestingOnly:false})});
   }
   expect(api.requests.filter(r=>r.path.startsWith('/api/v1/student/me/workouts')).every(r=>r.contractId===CONTRACT_ID)).toBe(true);
   const evidence={kind:'issue-482-pr-484-browser-evidence',result:'PASS',identity:id,browser:await browser.version(),viewports:scenarios,verified:['home-entry','loading','list-current-upcoming','history','empty','retryable-error','detail-readonly','sessions-exercises','no-horizontal-overflow','desktop-1366x768','mobile-390x844','x-contract-id','accessibility-tree-captured'],apiRequests:api.requests};
   console.log(`BROWSER_EVIDENCE_482 ${JSON.stringify(evidence)}`);console.log(`BROWSER_EVIDENCE_482 PASS head=${id.headSha}`);
  }finally{await browser?.close().catch(()=>{});await stopVite(vite).catch(()=>{});await stopApi(api?.server).catch(()=>{});}
 },100000);
});