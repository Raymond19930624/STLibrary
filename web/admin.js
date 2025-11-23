async function loadModels(){
  const res=await fetch('models.json?_='+Date.now(),{cache:'no-store'});
  return await res.json();
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
    const btn=document.createElement('button');
    btn.className='btn';
    btn.textContent='刪除';
    btn.addEventListener('click',()=>dispatchDelete(m));
    actions.appendChild(btn);
    card.appendChild(thumb); card.appendChild(title); card.appendChild(tags); card.appendChild(actions);
    root.appendChild(card);
  }
}
async function dispatchDelete(m){
  const pat=document.getElementById('token').value.trim();
  const repo=document.getElementById('repo').value.trim();
  if(!pat||!repo) return;
  const url=`https://api.github.com/repos/${repo}/actions/workflows/admin-delete.yml/dispatches`;
  const body={ref:'main',inputs:{id:m.id,name:''}};
  await fetch(url,{method:'POST',headers:{'Authorization':'Bearer '+pat,'Accept':'application/vnd.github+json'},body:JSON.stringify(body)});
  alert('已送出刪除請求');
}
function setupLogin(){
  const lock=document.getElementById('admin-lock');
  const input=document.getElementById('admin-pass');
  const btn=document.getElementById('admin-login');
  btn.addEventListener('click',()=>{
    const ok=input.value.trim()==='06248255';
    const body=document.getElementById('admin-body');
    if(ok){ lock.style.display='none'; body.classList.remove('hidden'); loadModels().then(render); } else { input.value=''; }
  });
  input.addEventListener('keydown',(e)=>{ if(e.key==='Enter') btn.click(); });
}
setupLogin();