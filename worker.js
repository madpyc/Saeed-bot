
// Saeed — Electronics Tutor Bot (Cloudflare Worker; Full Suite, Ready)
// Includes: Telegram bot + Admin Web UI (/admin) + Quiz + Progress APIs.
// Bindings: AI, CHAT_KV, DB (D1). Secrets: TELEGRAM_BOT_TOKEN, SETUP_TOKEN
// Optional: TELEGRAM_WEBHOOK_SECRET, HUGGINGFACE_API_KEY, OPENAI_API_KEY
// Vars: BOT_NAME, MAX_TAAROF, ALLOW_OPENAI_SPEND, OAI_VISION_MODE, ALLOW_FLUX_NON_COMMERCIAL

const CF = { text: "@cf/meta/llama-3.1-8b-instruct", vl: "@cf/qwen/qwen2-vl-7b-instruct", img: "@cf/stabilityai/stable-diffusion-xl-base-1.0" };
const HF = { text: "China-NCTIEDA/ChipExpert-8B-Instruct", vl: "Qwen/Qwen2-VL-7B-Instruct", compClassifier: "qipchip31/electronic-components-model", img: "stabilityai/stable-diffusion-xl-base-1.0", fluxDev: "black-forest-labs/FLUX.1-dev" };

const UI_INDEX = `<!doctype html><html lang="fa"><meta charset="utf-8"><meta name=viewport content="width=device-width,initial-scale=1">
<title>سعید - داشبورد</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto;max-width:960px;margin:20px auto;padding:0 12px;direction:rtl;background:#0b1220;color:#e7edf6}
h1,h2{margin:.5rem 0} section{background:#111a2e;border:1px solid #1c2742;border-radius:14px;padding:14px;margin:12px 0}
table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #223056;padding:8px;text-align:right}
.badge{display:inline-block;background:#1e2a4a;padding:4px 8px;border-radius:999px;font-size:.8rem}
small{opacity:.8} button{background:#1e2a4a;color:#fff;border:0;border-radius:10px;padding:8px 12px;cursor:pointer}
</style>
<body>
<h1>📊 داشبورد سعید</h1>
<section>
  <button id=refresh>↻ بروزرسانی</button>
  <span class=badge id=summary></span>
</section>
<section>
  <h2>کاربران</h2>
  <table id=usersTbl><thead><tr><th>کاربر</th><th>تاپیک</th><th>آخرین فعالیت</th><th>تعداد پیام</th><th>میانگین نمره</th></tr></thead><tbody></tbody></table>
  <small>این صفحه باز است (بدون رمز) بنا به درخواست شما.</small>
</section>
<section>
  <h2>آخرین پیام‌ها</h2>
  <table id=msgsTbl><thead><tr><th>کاربر</th><th>نقش</th><th>متن</th><th>زمان</th></tr></thead><tbody></tbody></table>
</section>
<script>
async function load(){
  const p = await fetch('/api/progress').then(r=>r.json());
  document.getElementById('summary').textContent = \`کاربر: \${p.users} | موضوع‌ها: \${p.threads} | پیام‌ها: \${p.messages} | میانگین نمره: \${p.avg_score ?? '-'}\`;
  const ut = document.querySelector('#usersTbl tbody'); ut.innerHTML='';
  for (const u of p.user_rows){
    const tr = document.createElement('tr');
    tr.innerHTML = \`<td>\${u.username || u.tg_user_id}</td><td>\${u.topic ?? '-'}</td><td>\${u.last_at ?? '-'}</td><td>\${u.msgs}</td><td>\${u.score ?? '-'}</td>\`;
    ut.appendChild(tr);
  }
  const mt = document.querySelector('#msgsTbl tbody'); mt.innerHTML='';
  for (const m of p.last_messages){
    const tr = document.createElement('tr');
    tr.innerHTML = \`<td>\${m.username || m.tg_user_id}</td><td>\${m.role}</td><td>\${(m.content||'').slice(0,120)}</td><td>\${m.created_at}</td>\`;
    mt.appendChild(tr);
  }
}
document.getElementById('refresh').onclick = load;
load();
</script>`;

async function serveUI(req) {
  const url = new URL(req.url);
  if (url.pathname === "/" || url.pathname === "/admin") {
    return new Response(UI_INDEX, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return new Response("Not found", { status: 404 });
}

const REPLY_KEYBOARD = { keyboard: [[{text:"مدار ساده"},{text:"معرفی قطعه (عکس)"}],[{text:"پوستر آموزشی"},{text:"شروع موضوع جدید"}],[{text:"امتحان کوچک"}]], resize_keyboard:true };
const TAAROF_POSITIVE=new Set(["ممنون","مرسی","خیلی ممنون","تشکر","قربان شما","قربانت","فدات","دمت گرم","خواهش میکنم","خواهش","دمت‌گرم"]);
const GREETINGS=new Set(["سلام","سلام سعید","درود","سلام استاد","سلام معلم"]);
const TAAROF_REPLY="خواهش می‌کنم 🌟"; const GREETING_REPLY="سلام! من سعیدم، معلم الکترونیک. از منو پایین می‌تونی شروع کنی 🙂";
const TOO_MUCH_TAAROF="مرسی از محبتت! 😊 بریم سراغ خودِ الکترونیک که عقب نمونیم."; const NOT_ELECTRONICS_REPLY="من فقط به سؤال‌های الکترونیک پاسخ می‌دم."; const ELECTRONICS_HINT="مثلاً بپرس: «چطور LED را با باتری ۹ ولت امن روشن کنم؟» یا «مقاومت چی کار می‌کنه؟»";

function norm(s){return (s||"").replace(/\s+/g," ").trim();}
function isGreeting(s){const t=norm(s);return GREETINGS.has(t)||/^سلام/.test(t);}
function isTaarof(s){const t=norm(s);return [...TAAROF_POSITIVE].some(x=>t.includes(x));}
function kidsTone(s){const t=(s||"").replace(/\s+/g," ").trim();return t.length<=900?t:t.slice(0,880)+"…";}
function inferTopicFrom(text){ if(/led/i.test(text))return"مدار LED"; if(/مقاومت|ohm|resistor/i.test(text))return"مقاومت و قانون اهم"; if(/خازن|capacitor/i.test(text))return"خازن‌ها"; if(/ترانزیستور|bjt|mosfet/i.test(text))return"ترانزیستور"; if(/آردوینو|arduino/i.test(text))return"شروع با آردوینو"; return"سؤال عمومی الکترونیک"; }
function splitTextForTelegram(s,max=3500){const txt=s.replace(/\s+/g," ").trim(); if(txt.length<=max)return[txt]; const out=[]; let st=0; while(st<txt.length){let en=Math.min(st+max,txt.length); let cut=txt.lastIndexOf("۔",en); if(cut<st)cut=txt.lastIndexOf(".",en); if(cut<st)cut=txt.lastIndexOf("!",en); if(cut<st)cut=txt.lastIndexOf("؟",en); if(cut<st)cut=txt.lastIndexOf(" ",en); if(cut<st)cut=en; out.push(txt.slice(st,cut).trim()); st=cut;} return out; }

async function tg(env,method,body){const url=`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`; const r=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}); return r.json();}
async function sendText(env,chat_id,text,extra){return tg(env,"sendMessage",{chat_id,text,reply_markup:REPLY_KEYBOARD,...(extra||{})});}
async function sendAction(env,chat_id,action){try{await tg(env,"sendChatAction",{chat_id,action});}catch{}}
async function getFileUrl(env,fileId){const meta=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`).then(r=>r.json()); const path=meta?.result?.file_path; return path?`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${path}`:null;}

async function guardUpdate(env,update_id){const k=`upd:${update_id}`;const ex=await env.CHAT_KV.get(k);if(ex)return false;await env.CHAT_KV.put(k,"1",{expirationTtl:300});return true;}
async function getCurrentThreadId(env,chatId){const v=await env.CHAT_KV.get(`thread:${chatId}`);return v?Number(v):null;}
async function setCurrentThreadId(env,chatId,threadId){await env.CHAT_KV.put(`thread:${chatId}`,String(threadId));}
async function incTaarof(env,chatId,max){const k=`taarof:${chatId}`;const c=Number((await env.CHAT_KV.get(k))||"0")+1;await env.CHAT_KV.put(k,String(c),{expirationTtl:3600});return c>=max;}
async function resetTaarof(env,chatId){await env.CHAT_KV.delete(`taarof:${chatId}`);}

async function ensureSchema(env){
  await env.DB.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, tg_user_id INTEGER UNIQUE, username TEXT);
  CREATE TABLE IF NOT EXISTS threads (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT, topic TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, thread_id INTEGER, role TEXT, content TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS quizzes (id INTEGER PRIMARY KEY, question TEXT, options TEXT, answer TEXT);
  CREATE TABLE IF NOT EXISTS quiz_attempts (id INTEGER PRIMARY KEY, user_id INTEGER, quiz_id INTEGER, correct INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  const cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM quizzes").first();
  if (!cnt || !cnt.c){
    const qs = [
      {q:"کدام گزینه منبع جریان مستقیم (DC) است؟", o:["باتری","برق شهر","ژنراتور سنکرون"], a:"باتری"},
      {q:"برای محدود کردن جریان LED از چه قطعه‌ای استفاده می‌کنیم؟", o:["دیود زنر","مقاومت","سلف"], a:"مقاومت"},
      {q:"واحد اندازه گیری مقاومت چیست؟", o:["ولت","اهم","آمپر"], a:"اهم"}
    ];
    for (const it of qs){
      await env.DB.prepare("INSERT INTO quizzes (question, options, answer) VALUES (?,?,?)").bind(it.q, JSON.stringify(it.o), it.a).run();
    }
  }
}
async function ensureUser(env,tg_user_id,username){await ensureSchema(env);const u=await env.DB.prepare("SELECT id FROM users WHERE tg_user_id=?").bind(tg_user_id).first();if(u&&u.id)return u.id;const ins=await env.DB.prepare("INSERT INTO users (tg_user_id, username) VALUES (?,?)").bind(tg_user_id,username||null).run();return ins.lastRowId;}
async function createThread(env,user_id,title,topic){const ins=await env.DB.prepare("INSERT INTO threads (user_id, title, topic) VALUES (?,?,?)").bind(user_id,title,topic).run();return ins.lastRowId;}
async function updateThreadTouch(env,thread_id){await env.DB.prepare("UPDATE threads SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(thread_id).run();}
async function appendMessage(env,thread_id,role,content){await env.DB.prepare("INSERT INTO messages (thread_id, role, content) VALUES (?,?,?)").bind(thread_id,role,content).run();await updateThreadTouch(env,thread_id);}
async function getRecentContext(env,thread_id,limit){const rows=await env.DB.prepare("SELECT role, content FROM messages WHERE thread_id=? ORDER BY id DESC LIMIT ?").bind(thread_id,limit||10).all();const list=(rows&&rows.results)?rows.results:[];return list.reverse();}

function systemPrompt(env){const name=env.BOT_NAME||"سعید";return `${name} یک معلم الکترونیک ایرانی برای بچه‌های ۸ تا ۱۳ سال است.
- لحن: ساده، صمیمی، کوتاه، مثال‌محور.
- فقط الکترونیک؛ اگر نامرتبط بود، برگردان به موضوع و نمونه سؤال بده.
- ایمنی اولویت دارد؛ دربارهٔ برق شهر هشدار بده.
- تعارفات را کوتاه جواب بده و در تکرار زیاد، مکالمه را به موضوع برگردان.`;}
function buildPrompt(env,ctxPairs,userText){const sys=systemPrompt(env);const hist=ctxPairs.map(m=>`${m.role==="user"?"دانش‌آموز":"معلم"}: ${m.content}`).join("\n");return `${sys}\n\nگفتگو تا اینجا:\n${hist}\n\nسؤال دانش‌آموز:\n${userText}\n\nپاسخ را ساده و مرحله‌به‌مرحله بده.`;}
function needsDeepAnalysis(t){t=(t||"").toLowerCase();return /(تحلیل|آنالیز|simulate|شبیه|opamp|mosfet|bjt)/i.test(t)||t.length>220;}

async function cfText(env,p){const r=await env.AI.run(CF.text,{messages:[{role:"system",content:systemPrompt(env)},{role:"user",content:p}]});return r?.response||r?.result||"";}
async function cfVL(env,u,q){const r=await env.AI.run(CF.vl,{messages:[{role:"system",content:systemPrompt(env)},{role:"user",content:[{type:"input_text",text:q},{type:"input_image",image_url:u}]}]});return r?.response||r?.result||"";}
async function cfImg(env,p){const r=await env.AI.run(CF.img,{prompt:p}); if (r instanceof ArrayBuffer) return new Uint8Array(r); if (r?.image instanceof ArrayBuffer) return new Uint8Array(r.image); throw new Error("NO_IMAGE");}

async function hfText(env,p){
  if(!env.HUGGINGFACE_API_KEY)throw new Error("HF_MISSING");
  const r=await fetch(`https://api-inference.huggingface.co/models/${HF.text}`,{
    method:"POST",
    headers:{"Authorization":`Bearer ${env.HUGGINGFACE_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({inputs:p,parameters:{max_new_tokens:400,temperature:0.3,return_full_text:false},options:{wait_for_model:true}})
  });
  const ct=r.headers.get("content-type")||"";
  if(ct.includes("json")){
    const j=await r.json().catch(()=>({}));
    if(Array.isArray(j)) return j[0]?.generated_text||"";
    return j?.generated_text||j?.answer||"";
  }
  return await r.text();
}
async function hfVL(env,u,q){
  if(!env.HUGGINGFACE_API_KEY)throw new Error("HF_MISSING");
  const r=await fetch(`https://api-inference.huggingface.co/models/${HF.vl}`,{
    method:"POST",
    headers:{"Authorization":`Bearer ${env.HUGGINGFACE_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({inputs:[{role:"user",content:[{type:"image_url",image_url:u},{type:"text",text:q}]}]})
  });
  const j=await r.json().catch(()=>({}));
  if(Array.isArray(j)) return j[0]?.generated_text||"";
  return j?.generated_text||j?.answer||"";
}
async function hfImg(env,p,flux){
  if(!env.HUGGINGFACE_API_KEY)throw new Error("HF_MISSING");
  const model=flux?HF.fluxDev:HF.img;
  const r=await fetch(`https://api-inference.huggingface.co/models/${model}`,{
    method:"POST",headers:{"Authorization":`Bearer ${env.HUGGINGFACE_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({inputs:p})
  });
  return new Uint8Array(await r.arrayBuffer());
}
async function toBase64FromUrl(url){
  const buf=await fetch(url).then(r=>r.arrayBuffer());
  const bytes=new Uint8Array(buf);
  const chunk=0x8000; let binary="";
  for(let i=0;i<bytes.length;i+=chunk){binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));}
  return btoa(binary);
}
async function openaiText(env,p){
  if(!env.OPENAI_API_KEY||String(env.ALLOW_OPENAI_SPEND||"").toLowerCase()!=="true")throw new Error("OAI_DISABLED");
  const r=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({model:"gpt-4o-mini",messages:[{role:"system",content:systemPrompt(env)},{role:"user",content:p}],temperature:0.2})
  });
  const j=await r.json().catch(()=>({}));
  return j?.choices?.[0]?.message?.content||"";
}
async function openaiVL(env,u,q){
  if(!env.OPENAI_API_KEY||String(env.ALLOW_OPENAI_SPEND||"").toLowerCase()!=="true")throw new Error("OAI_DISABLED");
  const b64=await toBase64FromUrl(u);
  const body={model:"gpt-4o-mini",messages:[{role:"user",content:[{type:"text",text:q||"این قطعه چیه و چه کاربردی داره؟ کوتاه بگو."},{type:"input_image",image_url:{url:`data:image/jpeg;base64,${b64}`}}]}]};
  const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  return j?.choices?.[0]?.message?.content||"";
}

async function classifyElectronics(env,txt){
  try{
    const r=await env.AI.run(CF.text,{messages:[{role:"system",content:"Reply ONLY YES or NO."},{role:"user",content:`فقط YES یا NO. آیا این متن درباره الکترونیک/مدار/قطعه/اندازه‌گیری/آردوینو است؟
"""${txt}"""`}],temperature:0,max_tokens:3});
    const raw=String(r?.response||r?.result||"").trim().toUpperCase();
    if(raw.startsWith("YES"))return true;
    if(raw.startsWith("NO"))return false;
    return true;
  }catch{return true;}
}

async function routeText(env,p,deep){
  try{const r=await cfText(env,p); if(r?.trim()) return r;}catch{}
  try{const r=await hfText(env,p); if(r?.trim()) return r;}catch{}
  if(deep){ try{const r=await openaiText(env,p); if(r?.trim()) return r;}catch{} }
  return "بیاین قدم‌به‌قدم پیش بریم: 1) منبع تغذیه‌ات چیه؟ 2) ولتاژ چند ولت؟ 3) چه قطعاتی داری؟";
}
async function routeVL(env,u,q,deep){
  const mode=String(env.OAI_VISION_MODE||"fallback").toLowerCase();
  const allowOAI=String(env.ALLOW_OPENAI_SPEND||"").toLowerCase()==="true";
  if(mode==="force"&&allowOAI){ try{const r=await openaiVL(env,u,q); if(r?.trim()) return r;}catch{} }
  try{const r=await cfVL(env,u,q||"این قطعه چیه؟"); if(r?.trim()) return r;}catch{}
  try{const r=await hfVL(env,u,q||"این قطعه چیه؟"); if(r?.trim()) return r;}catch{}
  if(allowOAI){
    try{const r=await openaiVL(env,u,q); if(r?.trim()) return r;}catch{}
    if(deep){ try{const r=await openaiText(env,`کاربر عکس فرستاده و می‌پرسد: «${q}». آموزشی کوتاه و ایمن بده.`); if(r?.trim()) return r;}catch{} }
  }
  return "فعلاً نتونستم عکس رو تحلیل کنم. دوباره عکس رو بفرست یا سؤال رو متنی بپرس.";
}
async function routeImg(env,p,flux){
  try{ return await cfImg(env,p); }catch{}
  try{ return await hfImg(env,p,flux); }catch{}
  return new Uint8Array();
}

async function handleStart(env,chatId){await sendText(env,chatId,"خوش اومدی! من سعیدم. از منو یکی رو انتخاب کن یا مستقیم سؤال بپرس 🙂");}
async function handleMenu(env,chatId,text){
  if(text==="مدار ساده"){await sendText(env,chatId,"بگو می‌خوای چی بسازی: «روشن‌کردن LED»، «آلارم ساده»، «فن با باتری» …");return true;}
  if(text==="معرفی قطعه (عکس)"){await sendText(env,chatId,"از قطعه عکس بگیر و همین‌جا بفرست. حدسم رو می‌گم و توضیح می‌دم.");return true;}
  if(text==="پوستر آموزشی"){await sendText(env,chatId,"بنویس: «/پوستر یا /poster ...» یا موضوع دلخواهت رو بگو.");return true;}
  if(text==="شروع موضوع جدید"){await sendText(env,chatId,"باشه! موضوع جدید رو با یک جمله بگو (مثلاً: «می‌خوام مدار LED با باتری درست کنم»).");await setCurrentThreadId(env,chatId,0);return true;}
  if(text==="امتحان کوچک"){await startQuickQuiz(env,chatId);return true;}
  return false;
}

async function startQuickQuiz(env, chatId){
  await ensureSchema(env);
  const qs = await env.DB.prepare("SELECT id, question, options, answer FROM quizzes ORDER BY id LIMIT 3").all();
  const items = qs?.results || [];
  if (!items.length) { await sendText(env, chatId, "در حال حاضر سؤالی ندارم!"); return; }
  let txt = "امتحان کوچک 🎯\n";
  items.forEach((q,i)=>{
    const opts = JSON.parse(q.options);
    txt += `\n${i+1}) ${q.question}\n A) ${opts[0]}  B) ${opts[1]}  C) ${opts[2]}`;
  });
  txt += "\n\nجواب‌هات رو مثل «ABC» یا «123» بفرست (سه حرف/عدد پشت‌سرهم).";
  await sendText(env, chatId, txt);
  await env.CHAT_KV.put(`quiz:last`, JSON.stringify(items.map(q=>q.id)), {expirationTtl:1800});
}
async function gradeQuickQuiz(env, userId, answerText){
  const idsRaw = await env.CHAT_KV.get(`quiz:last`);
  if (!idsRaw) return null;
  const ids = JSON.parse(idsRaw);
  const map = { "A":0,"B":1,"C":2,"۱":0,"۲":1,"۳":2,"1":0,"2":1,"3":2,"ا":0,"ب":1,"پ":2,"الف":0,"ب":1,"ت":2 };
  const picks = Array.from(answerText.toUpperCase().replace(/\s+/g,"")).filter(ch=>map[ch]!=null).slice(0,ids.length);
  if (picks.length < ids.length) return null;
  let score = 0;
  for (let i=0;i<ids.length;i++){
    const q = await env.DB.prepare("SELECT id, answer, options FROM quizzes WHERE id=?").bind(ids[i]).first();
    const arr = JSON.parse(q.options);
    const correctIndex = arr.indexOf(q.answer);
    const ok = (map[picks[i]] === correctIndex) ? 1 : 0;
    score += ok;
    await env.DB.prepare("INSERT INTO quiz_attempts (user_id, quiz_id, correct) VALUES (?,?,?)").bind(userId, ids[i], ok).run();
  }
  const pct = Math.round((score/ids.length)*100);
  return `نتیجه امتحان کوچک: ${score}/${ids.length} (٪${pct}) 🎉`;
}

async function handleText(env,msg){
  const chatId=msg.chat.id, userId=msg.from?.id, username=msg.from?.username, text=(msg.text||"").trim();
  try{
    if(/^\/diag\b/.test(text)){const flags={hasAI:!!env.AI,hasKV:!!env.CHAT_KV,hasDB:!!env.DB,hasHFKey:!!env.HUGGINGFACE_API_KEY,hasOAIKey:!!env.OPENAI_API_KEY,allowOAI:String(env.ALLOW_OPENAI_SPEND||"").toLowerCase(),oaiVisionMode:String(env.OAI_VISION_MODE||"fallback")};await sendText(env,chatId,"⚙️ تنظیمات:\n"+JSON.stringify(flags,null,2));return;}
    if(/^\/start\b/.test(text))return handleStart(env,chatId);
    if(await handleMenu(env,chatId,text))return;
    if(isGreeting(text))return sendText(env,chatId,GREETING_REPLY);
    if(isTaarof(text)){const too=await incTaarof(env,chatId,Number(env.MAX_TAAROF||"3"));if(too)return sendText(env,chatId,TOO_MUCH_TAAROF+"\n"+ELECTRONICS_HINT);return sendText(env,chatId,TAAROF_REPLY);}

    if(/^\/(poster|پوستر|نقاشی)\b/i.test(text)){
      await sendAction(env,chatId,"upload_photo");
      const prompt=text.replace(/^\/(poster|پوستر|نقاشی)\s*/i,"").trim()||"پوستر آموزشی ساده درباره قانون اهم برای بچه‌ها";
      const flux=(String(env.ALLOW_FLUX_NON_COMMERCIAL||"").toLowerCase()==="true");
      const bytes=await routeImg(env,prompt+" , simple, flat illustration, readable labels, high contrast",flux);
      if(!bytes.length)return sendText(env,chatId,"فعلاً تولید تصویر ممکن نشد.");
      const form=new FormData(); form.append("chat_id", String(chatId)); form.append("caption", "اینم پوستر آموزشی 👇"); form.append("photo", new Blob([bytes]), "poster.png");
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`, { method:"POST", body: form });
      return;
    }

    await sendAction(env,chatId,"typing");

    if (/^[ABCabcالفبپت123]+$/.test(text.replace(/\s+/g,""))) {
      const uid = await ensureUser(env,userId,username);
      const res = await gradeQuickQuiz(env, uid, text);
      if (res) { await sendText(env, chatId, res); return; }
    }

    const isElec=await classifyElectronics(env,text); if(!isElec) return sendText(env,chatId,`${NOT_ELECTRONICS_REPLY}\n${ELECTRONICS_HINT}`);

    const uid=await ensureUser(env,userId,username);
    let threadId=await getCurrentThreadId(env,chatId);
    if(!threadId||threadId===0){const topic=inferTopicFrom(text);threadId=await createThread(env,uid,topic,topic);await setCurrentThreadId(env,chatId,threadId);await resetTaarof(env,chatId);}
    await appendMessage(env,threadId,"user",text);

    const ctx=await getRecentContext(env,threadId,10); const prompt=buildPrompt(env,ctx,text); const deep=needsDeepAnalysis(text);
    let answer=await routeText(env,prompt,deep); if(!answer) answer="فعلاً مطمئن نیستم؛ لطفاً سؤال را ساده‌تر بپرس.";
    const finalText=kidsTone(answer); await appendMessage(env,threadId,"assistant",finalText);
    const parts=splitTextForTelegram(finalText); for(let i=0;i<parts.length;i++){const label=parts.length>1?`(${i+1}/${parts.length}) `:""; await sendText(env,chatId,label+parts[i]);}
  }catch(e){console.error("handleText",e);await sendText(env,chatId,"اوه! مشکلی پیش اومد. دوباره امتحان کن یا کوتاه‌تر بپرس.");}
}

async function handlePhoto(env,msg){
  const chatId=msg.chat.id, userId=msg.from?.id, username=msg.from?.username, caption=msg.caption||"", fileId=msg.photo?.[msg.photo.length-1]?.file_id;
  try{
    if(!fileId) return sendText(env,chatId,"عکس به‌درستی نیامد.");
    await sendAction(env,chatId,"upload_photo");
    const url=await getFileUrl(env,fileId); if(!url) return sendText(env,chatId,"به فایل دسترسی پیدا نکردم.");
    await sendAction(env,chatId,"typing");
    const deep=needsDeepAnalysis(caption||"");
    const extra=await routeVL(env,url,caption||"این قطعه چیه و کجا استفاده میشه؟",deep);
    const uid=await ensureUser(env,userId,username);
    let threadId=await getCurrentThreadId(env,chatId); if(!threadId||threadId===0){const topic="شناسایی قطعه"; threadId=await createThread(env,uid,topic,topic); await setCurrentThreadId(env,chatId,threadId);}
    await appendMessage(env,threadId,"user",caption||"(عکس)"); await appendMessage(env,threadId,"assistant",kidsTone(extra));
    await sendText(env,chatId,kidsTone(extra));
  }catch(e){console.error("handlePhoto",e);await sendText(env,chatId,"نتونستم عکس رو تحلیل کنم.");}
}

async function apiProgress(env){
  await ensureSchema(env);
  const users = await env.DB.prepare("SELECT COUNT(*) AS c FROM users").first();
  const threads = await env.DB.prepare("SELECT COUNT(*) AS c FROM threads").first();
  const messages = await env.DB.prepare("SELECT COUNT(*) AS c FROM messages").first();
  const avg = await env.DB.prepare("SELECT ROUND(AVG(correct)*100,0) AS s FROM quiz_attempts").first();

  const userRows = await env.DB.prepare(`
    SELECT u.tg_user_id, u.username,
      (SELECT topic FROM threads t WHERE t.user_id=u.id ORDER BY updated_at DESC LIMIT 1) AS topic,
      (SELECT created_at FROM messages m JOIN threads t2 ON m.thread_id=t2.id WHERE t2.user_id=u.id ORDER BY m.id DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages m JOIN threads t2 ON m.thread_id=t2.id WHERE t2.user_id=u.id) AS msgs,
      (SELECT ROUND(AVG(correct)*100,0) FROM quiz_attempts qa WHERE qa.user_id=u.id) AS score
    FROM users u ORDER BY last_at DESC NULLS LAST LIMIT 200
  `).all();

  const lastMsgs = await env.DB.prepare(`
    SELECT u.tg_user_id, u.username, m.role, m.content, m.created_at
    FROM messages m
    JOIN threads t ON m.thread_id=t.id
    JOIN users u ON t.user_id=u.id
    ORDER BY m.id DESC
    LIMIT 50
  `).all();

  return new Response(JSON.stringify({
    users: users?.c||0, threads: threads?.c||0, messages: messages?.c||0,
    avg_score: avg?.s||null,
    user_rows: userRows?.results||[],
    last_messages: lastMsgs?.results||[]
  }), {headers:{"content-type":"application/json"}});
}

function baseUrlFromReq(req){const u=new URL(req.url);return `${u.protocol}//${u.host}/`; }
function verifyWebhookSecret(req, env){const sec=env.TELEGRAM_WEBHOOK_SECRET; if(!sec) return true; return req.headers.get("X-Telegram-Bot-Api-Secret-Token")===sec; }
async function setupWebhook(env, req){
  const url=new URL(req.url); const sec=url.searchParams.get("sec");
  if(!sec||sec!==env.SETUP_TOKEN) return new Response(JSON.stringify({ok:false,error:"unauthorized"}),{status:401,headers:{"content-type":"application/json"}});
  const webhookUrl=baseUrlFromReq(req);
  const resp=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url:webhookUrl,secret_token:env.TELEGRAM_WEBHOOK_SECRET||undefined,drop_pending_updates:true,allowed_updates:["message","edited_message"]})}).then(r=>r.json()).catch(e=>({ok:false,error:String(e)}));
  return new Response(JSON.stringify({ok:true,webhookUrl,tg:resp}),{headers:{"content-type":"application/json"}});
}
async function getMe(env){const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`).then(r=>r.json()); return new Response(JSON.stringify(r),{headers:{"content-type":"application/json"}});}

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      if (req.method === "GET") {
        if (url.pathname === "/") return serveUI(req);
        if (url.pathname === "/admin") return serveUI(req);
        if (url.pathname === "/api/progress") return apiProgress(env);
        if (url.pathname === "/setup-webhook") return setupWebhook(env, req);
        if (url.pathname === "/me") return getMe(env);
        if (url.pathname === "/health") return new Response("OK");
        return new Response("Not found", { status: 404 });
      }
      if (req.method !== "POST") return new Response("Method Not Allowed", { status:405 });
      if (!verifyWebhookSecret(req, env)) return new Response("Unauthorized", { status:401 });

      const update = await req.json().catch(()=>null);
      if (!update) return new Response("bad json", { status:400 });
      if (!(await guardUpdate(env, update.update_id))) return new Response("dup", { status:200 });

      const msg = update.message || update.edited_message;
      if (!msg) return new Response("no message", { status:200 });

      if (msg.text) { await handleText(env, msg); return new Response("ok"); }
      if (msg.photo) { await handlePhoto(env, msg); return new Response("ok"); }

      await sendText(env, msg.chat.id, "پیام متنی یا عکس بفرست تا کمک کنم.");
      return new Response("ok");
    } catch (e){
      console.error("fetch root error:", e);
      return new Response("internal error", { status:200 });
    }
  }
};
