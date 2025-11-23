async function loadModels(){
  try{
    const res=await fetch('models.json?_='+Date.now(),{cache:'no-store'});
    if(!res.ok) return [];
    return await res.json();
  }catch{ return []; }
}
const pending={ deletes:new Set(), edits:new Map() };
let selectMode=false;
function getToken(){ return localStorage.getItem('admin.token') || document.getElementById('token').value.trim(); }
function getRepo(){ return localStorage.getItem('admin.repo') || document.getElementById('repo').value.trim(); }
function persistConfig(){
  const t=document.getElementById('token').value.trim();
  const r=document.getElementById('repo').value.trim();
  if(t) localStorage.setItem('admin.token', t);
  if(r) localStorage.setItem('admin.repo', r);
  const cfg=document.getElementById('admin-config');
  if(localStorage.getItem('admin.token') && localStorage.getItem('admin.repo') && cfg) cfg.classList.add('hidden');
}
function initConfig(){
  const cfg=document.getElementById('admin-config');
  const hasT=!!localStorage.getItem('admin.token');
  const hasR=!!localStorage.getItem('admin.repo');
  if(hasT && hasR && cfg) cfg.classList.add('hidden');
  const syncFixed=document.getElementById('sync-btn-fixed');
  if(syncFixed){ syncFixed.addEventListener('click', dispatchSync); }
  const dm=document.getElementById('delete-mode-btn');
  const dc=document.getElementById('delete-confirm-btn');
  const dx=document.getElementById('delete-cancel-btn');
  const ap=document.getElementById('apply-btn-fixed');
  if(dm) dm.addEventListener('click', enterDeleteMode);
  if(dc) dc.addEventListener('click', ()=>{ if(!dc.disabled) confirmDelete(); });
  if(dx) dx.addEventListener('click', exitDeleteMode);
  if(ap) ap.addEventListener('click', dispatchApply);
  updateActionButtons();
}
function render(list){
  const root=document.getElementById('admin-cards');
  root.innerHTML='';
  for(const m of list){
    const card=document.createElement('div');
    card.className='card'+(selectMode?' select-mode':'');
    const thumb=document.createElement('div');
    thumb.className='thumb';
    const img=document.createElement('img');
    img.src=`images/${m.id}.jpg`;
    img.alt=m.name;
    thumb.appendChild(img);
    const title=document.createElement('div');
    title.className='title';
    title.textContent=m.name;
    const tags=document.createElement('div');
    tags.className='tags';
    for(const t of m.tags||[]){
      const s=document.createElement('span');
      s.className='tag';
      s.textContent=t;
      tags.appendChild(s);
    }
    const actions=document.createElement('div');
    actions.className='actions';
    const editBtn=document.createElement('button');
    editBtn.className='btn btn-secondary';
    editBtn.textContent='編輯';
    editBtn.addEventListener('click',()=>openEdit(m));
    actions.appendChild(editBtn);
    card.appendChild(thumb); card.appendChild(title); card.appendChild(tags); card.appendChild(actions);
    if(selectMode){
      if(pending.deletes.has(m.id)) card.classList.add('selected');
      card.addEventListener('click',(e)=>{
        if(actions.contains(e.target)) return;
        const sel=pending.deletes.has(m.id);
        if(sel){ pending.deletes.delete(m.id); card.classList.remove('selected'); }
        else { pending.deletes.add(m.id); card.classList.add('selected'); }
        updateActionButtons();
      });
    }
    root.appendChild(card);
  }
}
async function dispatchDelete(m){
  const pat=getToken();
  const repo=getRepo();
  if(!pat||!repo){ alert('請先輸入 GitHub PAT 與 owner/repo'); return; }
  pending.deletes.add(m.id);
  alert('已加入刪除清單，請點「送出變更」統一同步');
}
function openEdit(m){
  const modal=document.createElement('div');
  modal.className='lightbox show';
  const box=document.createElement('div');
  box.className='card';
  box.style.maxWidth='520px';
  box.style.width='90vw';
  const title=document.createElement('div');
  title.className='title';
  title.textContent='編輯模型';
  const nameInput=document.createElement('input');
  nameInput.value=m.name||'';
  nameInput.style.margin='12px';
  nameInput.placeholder='名稱';
  const tagsInput=document.createElement('input');
  tagsInput.value=(m.tags||[]).join(', ');
  tagsInput.style.margin='12px';
  tagsInput.placeholder='標籤（以逗號分隔）';
  const actions=document.createElement('div');
  actions.className='actions';
  const save=document.createElement('button');
  save.className='btn btn-secondary';
  save.textContent='儲存';
  save.addEventListener('click',()=>dispatchEdit(m.id,nameInput.value,tagsInput.value,modal));
  const cancel=document.createElement('button');
  cancel.className='btn btn-danger';
  cancel.textContent='取消';
  cancel.addEventListener('click',()=>{ document.body.removeChild(modal); });
  actions.appendChild(save); actions.appendChild(cancel);
  box.appendChild(title); box.appendChild(nameInput); box.appendChild(tagsInput); box.appendChild(actions);
  modal.innerHTML='';
  modal.appendChild(box);
  modal.addEventListener('click',(e)=>{ if(e.target===modal) document.body.removeChild(modal); });
  document.body.appendChild(modal);
}
async function dispatchEdit(id,name,tags,modal){
  const pat=getToken();
  const repo=getRepo();
  if(!pat||!repo){ alert('請先輸入 GitHub PAT 與 owner/repo'); return; }
  pending.edits.set(id,{id,name,tags});
  if(modal) document.body.removeChild(modal);
  alert('已加入編輯變更，請點「送出變更」統一同步');
  updateActionButtons();
}
function confirmAndDelete(m){ pending.deletes.add(m.id); alert('已加入刪除清單'); }
async function dispatchSync(){
  persistConfig();
  const pat=getToken();
  const repo=getRepo();
  if(!pat||!repo){ alert('請先輸入 GitHub PAT 與 owner/repo'); return; }
  const url=`https://api.github.com/repos/${repo}/actions/workflows/telegram-sync.yml/dispatches`;
  const body={ref:'main'};
  try{
    const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+pat,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify(body)});
    if(res.ok){ alert('已觸發同步'); }
    else { const txt=await res.text(); alert('觸發失敗：'+res.status+'\n'+txt); }
  }catch(e){ alert('網路錯誤：'+e); }
}
function enterDeleteMode(){ selectMode=true; pending.deletes.clear(); toggleDeleteUI(true); loadModels().then(render); }
function exitDeleteMode(){ selectMode=false; pending.deletes.clear(); toggleDeleteUI(false); loadModels().then(render); }
function toggleDeleteUI(on){
  const dm=document.getElementById('delete-mode-btn');
  const dc=document.getElementById('delete-confirm-btn');
  const dx=document.getElementById('delete-cancel-btn');
  if(on){ dm && dm.classList.add('hidden'); dc && dc.classList.remove('hidden'); dx && dx.classList.remove('hidden'); }
  else { dm && dm.classList.remove('hidden'); dc && dc.classList.add('hidden'); dx && dx.classList.add('hidden'); }
  updateActionButtons();
}
async function confirmDelete(){
  persistConfig();
  const pat=getToken();
  const repo=getRepo();
  if(pending.deletes.size===0){ alert('尚未選取任何模型'); return; }
  const count = pending.deletes.size;
  const proceed = confirm(`確定刪除 ${count} 筆模型？此操作將移除網站檔案與頻道貼文。`);
  if(!proceed) return;
  if(!pat||!repo){ alert('請先輸入 GitHub PAT 與 owner/repo'); return; }
  const url=`https://api.github.com/repos/${repo}/actions/workflows/admin-apply.yml/dispatches`;
  const ops={deletes:Array.from(pending.deletes),edits:[]};
  const body={ref:'main',inputs:{ops:JSON.stringify(ops)}};
  try{
    const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+pat,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify(body)});
    if(res.ok){ exitDeleteMode(); alert('已送出批次刪除與同步'); }
    else { const txt=await res.text(); alert('送出失敗：'+res.status+'\n'+txt); }
  }catch(e){ alert('網路錯誤：'+e); }
}
async function dispatchApply(){
  persistConfig();
  const pat=getToken();
  const repo=getRepo();
  if(!pat||!repo){ alert('請先輸入 GitHub PAT 與 owner/repo'); return; }
  const url=`https://api.github.com/repos/${repo}/actions/workflows/admin-apply.yml/dispatches`;
  const ops={deletes:Array.from(pending.deletes),edits:Array.from(pending.edits.values())};
  const body={ref:'main',inputs:{ops:JSON.stringify(ops)}};
  try{
    const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+pat,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify(body)});
    if(res.ok){ pending.deletes.clear(); pending.edits.clear(); alert('已送出統一變更與同步'); }
    else { const txt=await res.text(); alert('送出失敗：'+res.status+'\n'+txt); }
  }catch(e){ alert('網路錯誤：'+e); }
  updateActionButtons();
}

function updateActionButtons(){
  const ap=document.getElementById('apply-btn-fixed');
  const dc=document.getElementById('delete-confirm-btn');
  if(ap) ap.disabled = pending.edits.size===0;
  if(dc) dc.disabled = pending.deletes.size===0;
}
function setupLogin(){
  const lock=document.getElementById('admin-lock');
  const input=document.getElementById('admin-pass');
  const btn=document.getElementById('admin-login');
  btn.addEventListener('click',()=>{
    const ok=input.value.trim()==='06248255';
    const body=document.getElementById('admin-body');
    if(ok){ lock.style.display='none'; body.classList.remove('hidden'); initConfig(); persistConfig(); loadModels().then(render); } else { input.value=''; }
  });
  input.addEventListener('keydown',(e)=>{ if(e.key==='Enter') btn.click(); });
}
setupLogin();
