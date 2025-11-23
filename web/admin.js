async function loadModels(){
  try{
    const res=await fetch('models.json?_='+Date.now(),{cache:'no-store'});
    if(!res.ok) return [];
    return await res.json();
  }catch{ return []; }
}
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
}
function render(list){
  const root=document.getElementById('admin-cards');
  root.innerHTML='';
  for(const m of list){
    const card=document.createElement('div');
    card.className='card';
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
    const delBtn=document.createElement('button');
    delBtn.className='btn btn-danger';
    delBtn.textContent='刪除';
    delBtn.addEventListener('click',()=>confirmAndDelete(m));
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(thumb); card.appendChild(title); card.appendChild(tags); card.appendChild(actions);
    root.appendChild(card);
  }
}
async function dispatchDelete(m){
  const pat=getToken();
  const repo=getRepo();
  if(!pat||!repo){ alert('請先輸入 GitHub PAT 與 owner/repo'); return; }
  const url=`https://api.github.com/repos/${repo}/actions/workflows/admin-delete.yml/dispatches`;
  const body={ref:'main',inputs:{id:m.id,name:''}};
  try{
    const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+pat,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify(body)});
    if(res.ok){ alert('已送出刪除請求'); }
    else { const txt=await res.text(); alert('刪除請求失敗：'+res.status+'\n'+txt); }
  }catch(e){ alert('網路錯誤：'+e); }
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
  const url=`https://api.github.com/repos/${repo}/actions/workflows/admin-edit.yml/dispatches`;
  const body={ref:'main',inputs:{id,name,tags}};
  try{
    const res=await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+pat,'Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify(body)});
    if(res.ok){ if(modal) document.body.removeChild(modal); alert('已送出編輯請求'); }
    else { const txt=await res.text(); alert('編輯請求失敗：'+res.status+'\n'+txt); }
  }catch(e){ alert('網路錯誤：'+e); }
}

function confirmAndDelete(m){
  const modal=document.createElement('div');
  modal.className='lightbox show';
  const box=document.createElement('div');
  box.className='card';
  box.style.maxWidth='520px';
  box.style.width='90vw';
  const title=document.createElement('div');
  title.className='title';
  title.textContent='確認刪除';
  const info=document.createElement('div');
  info.style.padding='0 14px 10px';
  info.style.color='#c7ccdd';
  info.textContent=`將刪除：「${m.name}」及其檔案與頻道貼文。`;
  const tip=document.createElement('div');
  tip.style.padding='0 14px';
  tip.style.color='#aab0c0';
  tip.textContent='為避免誤刪，請輸入上方名稱以確認：';
  const input=document.createElement('input');
  input.style.margin='12px';
  input.placeholder='請輸入完整名稱';
  const actions=document.createElement('div');
  actions.className='actions';
  const ok=document.createElement('button');
  ok.className='btn btn-danger';
  ok.textContent='確定刪除';
  ok.addEventListener('click',async()=>{
    if(input.value.trim()!==String(m.name).trim()){ alert('名稱不相符，已取消'); return; }
    ok.disabled=true;
    await dispatchDelete(m);
    document.body.removeChild(modal);
  });
  const cancel=document.createElement('button');
  cancel.className='btn btn-secondary';
  cancel.textContent='取消';
  cancel.addEventListener('click',()=>{ document.body.removeChild(modal); });
  actions.appendChild(ok); actions.appendChild(cancel);
  box.appendChild(title); box.appendChild(info); box.appendChild(tip); box.appendChild(input); box.appendChild(actions);
  modal.innerHTML=''; modal.appendChild(box);
  modal.addEventListener('click',(e)=>{ if(e.target===modal) document.body.removeChild(modal); });
  document.body.appendChild(modal);
}

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