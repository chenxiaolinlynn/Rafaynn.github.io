(() => {
 const ENDPOINT='netease-backend', TOKEN='netease-access-token';
 let generation=0;
 async function request(route, data={}) {
  const endpoint=(localStorage.getItem(ENDPOINT)||'https://rafaynn-netease.onrender.com'),token=sessionStorage.getItem(TOKEN);
  if(!endpoint||!token)throw Error('请先在网易云账号中填写后端地址和访问密钥');
  const response=await fetch(endpoint+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(data),signal:AbortSignal.timeout(90000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'网易云服务请求失败');return result;
 }
 const dialog=document.createElement('dialog');
 dialog.style.cssText='width:min(480px,90vw);max-height:80vh;overflow:auto;border:1px solid #eee;border-radius:24px;padding:24px;background:var(--bg-color,#fff);color:inherit';
 dialog.innerHTML='<h3>我的网易云</h3><p>连接你自己的网易云后端</p><label>后端地址<input id="ncm-endpoint" placeholder="https://你的后端域名" style="display:block;width:95%;margin:8px 0;padding:10px"></label><label>访问密钥<input id="ncm-token" type="password" autocomplete="off" style="display:block;width:95%;margin:8px 0;padding:10px"></label><p><button id="ncm-connect">连接账号</button> <button id="ncm-qr">扫码登录</button> <button id="ncm-logout">退出账号</button> <button id="ncm-close">关闭</button></p><p id="ncm-status" role="status"></p><img id="ncm-image" alt="网易云登录二维码" style="display:none;width:220px"><div id="ncm-lists"></div>';
 document.body.append(dialog);
 const find=id=>dialog.querySelector('#ncm-'+id),status=text=>find('status').textContent=text;
 function save(){const url=new URL(find('endpoint').value.trim());if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('后端必须使用 HTTPS');if(url.username||url.password||url.search||url.hash)throw Error('请填写纯后端地址');const token=find('token').value.trim();if(token.length<32)throw Error('访问密钥至少为32个字符');localStorage.setItem(ENDPOINT,url.href.replace(/\/$/,''));sessionStorage.setItem(TOKEN,token);}
 const run=fn=>async()=>{try{await fn();}catch(e){status(e.name==='TimeoutError'?'请求超时，请稍后重试':e.message);}};
 async function showLists(){const account=await request('/account');if(!account.loggedIn){status('尚未登录，请扫码');return;}status('已登录：'+account.name);find('image').style.display='none';const result=await request('/playlists');find('lists').replaceChildren();for(const item of result.items){const button=document.createElement('button');button.textContent='导入 · '+item.name;button.style.cssText='display:block;margin:8px 0;padding:10px';button.onclick=run(async()=>{status('正在读取歌单');const tracks=await request('/tracks',{id:item.id});const added=window.musicTogetherBridge.importSongs(tracks.items.map(t=>({title:t.name,sub:t.artist||'网易云音乐',url:'netease:'+t.id,isCustom:true})));status('已添加 '+added+' 首歌曲，重复歌曲已跳过');});find('lists').append(button);}}
 find('connect').onclick=run(async()=>{save();status('连接中，免费服务唤醒可能需要约一分钟');await showLists();});
 find('qr').onclick=run(async()=>{save();const g=++generation;status('生成二维码中');const result=await request('/qr');if(g!==generation)return;find('image').src=result.image;find('image').style.display='block';status('用网易云 App 扫码并确认');for(let i=0;i<90&&g===generation;i++){await new Promise(r=>setTimeout(r,2000));if(g!==generation)return;const r=await request('/check');if(g!==generation)return;if(r.code===803){await showLists();return;}if(r.code===800)throw Error('二维码已过期，请重新扫码');if(r.code===802)status('请在手机确认登录');}if(g===generation)status('二维码等待超时，请重试');});
 find('logout').onclick=run(async()=>{generation++;await request('/logout');sessionStorage.removeItem(TOKEN);find('token').value='';find('lists').replaceChildren();find('image').style.display='none';status('已退出网易云账号');});
 find('close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>generation++);
 window.NeteaseMusic={open(){find('endpoint').value=localStorage.getItem(ENDPOINT)||'https://rafaynn-netease.onrender.com';find('token').value=sessionStorage.getItem(TOKEN)||'';dialog.showModal();},async resolve(url){if(!url.startsWith('netease:'))return url;const id=url.slice(8);if(!/^\d+$/.test(id))throw Error('网易云歌曲 ID 无效');const r=await request('/play',{id});if(!r.url)throw Error('该歌曲暂无可用音源');if(r.trial&&typeof showNotification==='function')showNotification('当前歌曲为试听音源','info');return r.url;}};
})();
