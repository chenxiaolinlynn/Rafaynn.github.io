/* 心意市集：将 HeartMarket 引擎接入当前单对象聊天。 */
(() => {
    'use strict';
    const trigger = document.getElementById('heart-market-btn');
    if (!trigger || !window.HeartMarket) return;
    const H = window.HeartMarket;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = fen => '¥' + (Number(fen || 0) / 100).toFixed(2);
    const partner = () => settings.partnerName || '对方';
    const mine = () => settings.myName || '我';
    const session = () => typeof SESSION_ID !== 'undefined' ? SESSION_ID : 'default';
    function cardPool() {
        try {
            const disabled = new Set(JSON.parse(localStorage.getItem('disabledReplyItems') || '[]'));
            (window.customReplyGroups || []).filter(g => g.disabled).forEach(g => (g.items || []).forEach(x => disabled.add(x)));
            return (Array.isArray(customReplies) ? customReplies : []).filter(x => !disabled.has(x) && String(x).trim());
        } catch { return []; }
    }
    const toast = text => typeof showNotification === 'function' ? showNotification(text, 'info') : alert(text);
    async function putMessage(html, sender, type, event) {
        const id = event?.id || 'hm-' + crypto.randomUUID();
        if (messages.some(x => String(x.id) === String(id))) return;
        addMessage({ id, sender, type, text: html, timestamp: new Date(), status: sender === 'user' ? 'sent' : 'received', favorited: false });
        renderMessages(true);
        await localforage.setItem(`${APP_PREFIX}${session()}_chatMessages`, messages);
    }
    function giftCard(g) {
        const who = g.giftSelf ? `${partner()}送给自己` : g.side === 'out' ? `${mine()}送给${partner()}` : `${partner()}送给${mine()}`;
        return `<div class="hm-chat-card"><small>GIFT</small><div class="hm-chat-media">${g.giftImg ? `<img src="${esc(g.giftImg)}" alt="">` : esc(g.giftEmoji || '🎁')}</div><strong>${esc(g.giftName)}</strong><p>${esc(g.giftWish || '')}</p><span>${esc(who)} · ¥${Number(g.giftPrice || 0).toFixed(2)}</span></div>`;
    }
    function wishCard(g) {
        return `<div class="hm-chat-card"><small>WISH</small><div class="hm-chat-media">${g.wishGiftImg ? `<img src="${esc(g.wishGiftImg)}" alt="">` : esc(g.wishGiftEmoji || '☆')}</div><strong>${esc(g.wishGiftName)}</strong><p>${esc(g.wishGiftWish || '')}</p><span>${esc(partner())}加入了心愿单 · ¥${Number(g.wishGiftPrice || 0).toFixed(2)}</span></div>`;
    }
    H.init({
        partnerId: session, sessionId: session, partnerName: partner, getCardPool: cardPool, toast,
        ready: () => typeof messages !== 'undefined' && !!session(),
        isNight: () => {
            const c = H.config, h = new Date().getHours();
            return !!c.nightOn && (c.nightStart > c.nightEnd ? h >= c.nightStart || h < c.nightEnd : h >= c.nightStart && h < c.nightEnd);
        },
        rateLimitFull: () => {
            const limit = Number(H.config.messageLimit) || 0;
            if (!limit) return false;
            const today = new Date().toDateString();
            return messages.filter(x => new Date(x.timestamp).toDateString() === today).length >= limit;
        },
        onGiftCard: (gift, event) => putMessage(giftCard(gift), gift.side === 'out' ? 'user' : partner(), 'heart-gift', event),
        onWishCard: (wish, event) => putMessage(wishCard(wish), partner(), 'heart-wish', event),
        onReply: (text, meta, event) => putMessage(esc(text), partner(), 'normal', event),
        changed: () => { badge(); if (dialog.open) render(active); }
    });

    const style = document.createElement('style');
    style.textContent = `
#heart-market-btn{position:relative;background:var(--toolbar-btn-bg,var(--message-received-bg));color:var(--toolbar-btn-color,var(--text-secondary))}
#hm-dialog{box-sizing:border-box;width:min(720px,calc(100% - 28px));height:min(820px,92dvh);max-height:92dvh;margin:auto;padding:0;border:1px solid var(--border-color);border-radius:24px;background:var(--primary-bg);color:var(--text-primary);font:inherit;overflow:hidden}
#hm-dialog::backdrop{background:rgba(0,0,0,.38);backdrop-filter:blur(3px)}#hm-dialog *{box-sizing:border-box}#hm-dialog button,#hm-dialog input,#hm-dialog textarea,#hm-dialog select{font:inherit}
#hm-dialog header{padding:16px 20px 10px;background:var(--secondary-bg);border-bottom:1px solid var(--border-color)}.hm-head{display:flex;align-items:center;justify-content:space-between}.hm-head h2{margin:0;font-size:19px}.hm-close{border:0;background:transparent;color:var(--text-secondary);font-size:25px;cursor:pointer}
.hm-wallet{display:flex;justify-content:center;gap:20px;margin:8px 0 2px;color:var(--text-secondary);font-size:13px}.hm-tabs{display:flex;gap:6px;overflow:auto;padding:10px 14px;background:var(--secondary-bg);border-bottom:1px solid var(--border-color)}.hm-tabs button{flex:1;min-width:max-content;border:0;border-radius:99px;padding:8px 12px;background:transparent;color:var(--text-secondary);cursor:pointer}.hm-tabs button.active{background:var(--accent-color);color:var(--message-sent-text)}
.hm-body{height:calc(100% - 136px);overflow:auto;padding:18px}.hm-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.hm-field,.hm-toolbar input,.hm-toolbar select{min-width:0;border:1px solid var(--border-color);background:var(--secondary-bg);color:var(--text-primary);border-radius:12px;padding:10px 12px}.hm-toolbar input{flex:1}
.hm-action{border:0;border-radius:12px;padding:10px 14px;background:var(--accent-color);color:var(--message-sent-text);cursor:pointer}.hm-secondary{background:var(--secondary-bg);color:var(--text-primary);border:1px solid var(--border-color)}
.hm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(135px,1fr));gap:12px}.hm-good{position:relative;text-align:left;border:1px solid var(--border-color);border-radius:18px;padding:16px;background:var(--secondary-bg);color:var(--text-primary);min-height:148px;cursor:pointer}.hm-good:hover{border-color:var(--accent-color)}.hm-media{display:flex;align-items:center;justify-content:center;height:54px;font-size:38px}.hm-media img{width:54px;height:54px;border-radius:14px;object-fit:cover}.hm-good strong{display:block;margin-top:8px}.hm-good small{display:block;color:var(--text-secondary);margin-top:4px}.hm-price{color:var(--accent-color);margin-top:5px}
.hm-list{display:grid;gap:10px}.hm-row{display:grid;grid-template-columns:48px 1fr auto;gap:12px;align-items:center;padding:14px;border:1px solid var(--border-color);border-radius:16px;background:var(--secondary-bg)}.hm-row .hm-media{height:44px;font-size:30px}.hm-row p{margin:3px 0;color:var(--text-secondary);font-size:13px;white-space:pre-wrap}.hm-row-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.hm-empty{text-align:center;color:var(--text-secondary);padding:50px 10px}.hm-form{display:grid;gap:12px}.hm-form label{display:grid;gap:6px;color:var(--text-secondary);font-size:13px}.hm-form input,.hm-form textarea,.hm-form select{width:100%}.hm-section{margin:20px 0 10px;color:var(--text-secondary);font-size:14px}.hm-badge{position:absolute;min-width:16px;height:16px;padding:0 4px;border-radius:9px;background:var(--accent-color);color:#fff;font-size:10px;line-height:16px;transform:translate(8px,-10px)}
.hm-chat-card{min-width:190px;max-width:270px;padding:10px 5px;text-align:center;color:inherit}.hm-chat-card small{display:block;letter-spacing:3px;opacity:.6;font-size:10px}.hm-chat-media{font-size:46px;margin:12px 0}.hm-chat-media img{width:70px;height:70px;border-radius:16px;object-fit:cover}.hm-chat-card strong{display:block;font-size:18px}.hm-chat-card p{white-space:pre-wrap;margin:8px 0}.hm-chat-card span{font-size:12px;opacity:.7}.message:has(.hm-chat-card){background:var(--secondary-bg)!important;color:var(--text-primary)!important;border:1px solid var(--border-color);border-radius:22px!important}
@media(max-width:600px){#hm-dialog{width:100%;height:100dvh;max-height:100dvh;border:0;border-radius:0}.hm-body{padding:14px}.hm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hm-row{grid-template-columns:42px 1fr}.hm-row-actions{grid-column:1/-1}.hm-tabs button{flex:0 0 auto}}
`;
    document.head.append(style);
    const dialog = document.createElement('dialog');
    dialog.id = 'hm-dialog'; dialog.setAttribute('aria-label', '心意市集');
    dialog.innerHTML = '<header><div class="hm-head"><h2>心意市集</h2><button class="hm-close" aria-label="关闭">×</button></div><div class="hm-wallet"></div></header><nav class="hm-tabs"></nav><main class="hm-body"></main>';
    document.body.append(dialog);
    const body = dialog.querySelector('.hm-body'), wallet = dialog.querySelector('.hm-wallet'), tabs = dialog.querySelector('.hm-tabs');
    dialog.querySelector('.hm-close').onclick = () => dialog.close();
    let active = 'market', category = '全部', query = '', wishSide = 'ta', boxSide = 'in';
    const tabDefs = [['market','市集'],['wish','心愿单'],['box','心意柜'],['ledger','账本'],['settings','设置']];
    function badge() {
        let node = trigger.querySelector('.hm-badge'), count = H.wish.unread();
        if (!node && count) { node = document.createElement('span'); node.className = 'hm-badge'; trigger.append(node); }
        if (node) { node.textContent = count > 9 ? '9+' : count; node.hidden = !count; }
    }
    function render(tab = active) {
        active = tab; const w = H.wallet.get();
        wallet.innerHTML = `<span>${esc(mine())} ${money(w.myBalance)}</span><span>${esc(partner())} ${money(w.systemBalance)}</span>`;
        tabs.innerHTML = tabDefs.map(([id,name]) => `<button data-tab="${id}" class="${id===tab?'active':''}">${name}${id==='wish'&&H.wish.unread()?' · '+H.wish.unread():''}</button>`).join('');
        tabs.querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.tab === 'wish') H.wish.read(); render(b.dataset.tab); });
        body.replaceChildren();
        ({ market: marketView, wish: wishView, box: boxView, ledger: ledgerView, settings: settingsView }[tab])();
        badge();
    }
    const media = g => `<div class="hm-media">${g.img ? `<img src="${esc(g.img)}" alt="">` : esc(g.emoji || '🎁')}</div>`;
    function marketView() {
        const tools = document.createElement('div'), grid = document.createElement('div');
        tools.className='hm-toolbar'; grid.className='hm-grid';
        tools.innerHTML = `<input aria-label="搜索商品" placeholder="搜索商品" value="${esc(query)}"><select aria-label="商品分类"><option>全部</option>${H.cats.map(x=>`<option${x===category?' selected':''}>${esc(x)}</option>`).join('')}</select><button class="hm-action hm-secondary">＋ 自定义</button>`;
        body.append(tools,grid);
        const draw = () => {
            const list = H.goods.list().filter(g => (category==='全部'||g.cat===category) && (!query||(`${g.name} ${g.cat}`).toLowerCase().includes(query.toLowerCase())));
            grid.innerHTML = list.map(g => `<button class="hm-good" data-id="${esc(g.id)}">${media(g)}<strong>${esc(g.name)}</strong><small>${esc(g.cat)}</small><div class="hm-price">¥${Number(g.price).toFixed(2)}</div></button>`).join('') || '<div class="hm-empty">没有找到商品</div>';
            grid.querySelectorAll('[data-id]').forEach(b => b.onclick = () => buyView(H.goods.find(b.dataset.id)));
        };
        tools.querySelector('input').oninput=e=>{query=e.target.value;draw();}; tools.querySelector('select').onchange=e=>{category=e.target.value;draw();}; tools.querySelector('button').onclick=customView; draw();
    }
    function buyView(g) {
        body.innerHTML = `<div class="hm-form">${media(g)}<h3>${esc(g.name)} · ¥${Number(g.price).toFixed(2)}</h3><label>赠言<textarea class="hm-field" maxlength="60" rows="4">${esc(g.wish||'')}</textarea></label><button class="hm-action">送给${esc(partner())}</button><button class="hm-action hm-secondary">加入我的心愿单</button><button class="hm-action hm-secondary">返回</button></div>`;
        const [send, addWish, back] = body.querySelectorAll('button');
        send.onclick=()=>{send.disabled=true;try{if(H.buy(g.id,body.querySelector('textarea').value)){H.flush();toast(`已送出「${g.name}」`);render('box');}else send.disabled=false;}catch(e){toast(e.message);send.disabled=false;}};
        addWish.onclick=()=>{if(H.wish.myAdd(g))toast(`已把「${g.name}」加入心愿单`);else toast('这件已经在心愿单里');};
        back.onclick=()=>render('market');
    }
    function customView() {
        body.innerHTML = `<form class="hm-form"><h3>添加自定义商品</h3><label>名称<input class="hm-field" name="giftName" maxlength="40" required></label><label>价格（元）<input class="hm-field" name="price" type="number" min="0" step="0.01" required></label><label>分类<select class="hm-field" name="cat">${H.cats.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label><label>Emoji<input class="hm-field" name="emoji" maxlength="8" value="🎁"></label><label>赠言<textarea class="hm-field" name="wish" maxlength="60">送给你</textarea></label><label>图片（可选）<input class="hm-field" name="image" type="file" accept="image/*"></label><button class="hm-action">保存商品</button><button type="button" class="hm-action hm-secondary">返回</button></form>`;
        const form=body.querySelector('form');
        form.onsubmit=async e=>{e.preventDefault();let img='',file=form.image.files[0];if(file){if(file.size>900000){toast('图片过大，请选择 900KB 以内的图片');return;}img=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(file);});}try{H.goods.addCustom({name:form.giftName.value,price:form.price.value,cat:form.cat.value,emoji:form.emoji.value,img,wish:form.wish.value});render('market');}catch(err){toast(err.message);}};
        form.querySelector('[type=button]').onclick=()=>render('market');
    }
    function row(item, actions='') { return `<div class="hm-row">${media(item)}<div><strong>${esc(item.name)}</strong><p>${esc(item.wish||'')}</p><span class="hm-price">¥${Number(item.price||0).toFixed(2)}</span></div><div class="hm-row-actions">${actions}</div></div>`; }
    function wishView() {
        const toggle=document.createElement('div'), list=document.createElement('div');toggle.className='hm-toolbar';list.className='hm-list';
        toggle.innerHTML=`<button class="hm-action ${wishSide==='my'?'':'hm-secondary'}" data-side="my">我的心愿</button><button class="hm-action ${wishSide==='ta'?'':'hm-secondary'}" data-side="ta">${esc(partner())}的心愿</button>`;body.append(toggle,list);
        toggle.querySelectorAll('button').forEach(b=>b.onclick=()=>{wishSide=b.dataset.side;render('wish');});
        const items=wishSide==='my'?H.wish.myList():H.wish.taList();
        list.innerHTML=items.map(x=>row({...x,id:x.giftId},wishSide==='my'?`<button class="hm-action hm-secondary" data-del="${esc(x.giftId)}">移除</button>`:`<button class="hm-action" data-buy="${esc(x.giftId)}">送给${esc(partner())}</button>`)).join('')||`<div class="hm-empty">${wishSide==='my'?'你还没有许愿':partner()+'还没有许愿'}</div>`;
        list.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{H.wish.myRemove(b.dataset.del);render('wish');});list.querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{if(H.buyFromTaWish(b.dataset.buy,'')){H.flush();render('box');}});
        if(wishSide==='my'){const add=document.createElement('button');add.className='hm-action';add.textContent='从市集添加心愿';add.onclick=()=>render('market');body.prepend(add);}
    }
    function boxView() {
        const toggle=document.createElement('div'),list=document.createElement('div');toggle.className='hm-toolbar';list.className='hm-list';
        [['in','收到'],['out','送出'],['self',partner()+'自购']].forEach(([id,name])=>{const b=document.createElement('button');b.className='hm-action '+(boxSide===id?'':'hm-secondary');b.textContent=name;b.onclick=()=>{boxSide=id;render('box');};toggle.append(b);});body.append(toggle,list);
        const items=H.box.list().filter(x=>x.side===boxSide);list.innerHTML=items.map(x=>row(x,x.side==='in'&&!x.claimed?`<button class="hm-action" data-claim="${esc(x.id)}">领取</button>`:'')).join('')||'<div class="hm-empty">这里还没有礼物</div>';
        list.querySelectorAll('[data-claim]').forEach(b=>b.onclick=()=>{H.box.claim(b.dataset.claim);render('box');});
    }
    function ledgerView() {
        const all=[...H.ledger.list('earn'),...H.ledger.list('ask')].sort((a,b)=>b.ts-a.ts);
        body.innerHTML=`<button class="hm-action">申请心意币</button><h3 class="hm-section">收支流水</h3><div class="hm-list">${all.map(x=>`<div class="hm-row"><div>♡</div><div><strong>${esc(x.src)}</strong><p>${new Date(x.ts).toLocaleString()}</p></div><div>${x.myFen?`${esc(mine())} ${x.myFen>0?'+':''}${money(x.myFen)}`:''}<br>${x.taFen?`${esc(partner())} ${x.taFen>0?'+':''}${money(x.taFen)}`:''}</div></div>`).join('')||'<div class="hm-empty">还没有流水</div>'}</div>`;
        body.querySelector('button').onclick=askView;
    }
    function askView() {
        body.innerHTML=`<form class="hm-form"><h3>申请心意币</h3><label>到账方<select class="hm-field" name="side"><option value="my">${esc(mine())}</option><option value="ta">${esc(partner())}</option></select></label><label>金额（元）<input class="hm-field" name="amount" type="number" min="0.01" step="0.01" required></label><button class="hm-action">立即到账</button><button type="button" class="hm-action hm-secondary">返回</button></form>`;
        const form=body.querySelector('form');form.onsubmit=e=>{e.preventDefault();if(H.wallet.ask(form.side.value,form.amount.value)){toast('心意币已到账');render('ledger');}};form.querySelector('[type=button]').onclick=()=>render('ledger');
    }
    function settingsView() {
        const c=H.config, fields=[['giftInPct','直接送我礼物概率（%）'],['wlBuyPct','买下我的心愿概率（%）'],['selfPct','给自己买概率（%）'],['wlAddPct','添加心愿概率（%）'],['wishChatPct','心愿卡发到聊天概率（%）'],['giftReplyPct','送礼回话概率（%）']];
        const switches=[['giftInOn','允许对方送我礼物'],['wlOn','启用双向心愿单'],['selfOn','允许对方给自己买'],['wishChatOn','对方心愿可发到聊天'],['selfChatOn','对方自购可发到聊天'],['giftReplyOn','我送礼后对方可回话'],['nightOn','夜间免打扰（23:00–07:00）']];
        body.innerHTML=`<form class="hm-form"><h3>自动互动设置</h3>${switches.map(([k,n])=>`<label><input name="${k}" type="checkbox" ${c[k]?'checked':''}> ${n}</label>`).join('')}${fields.map(([k,n])=>`<label>${n}<input class="hm-field" name="${k}" type="number" min="0" max="100" value="${c[k]}"></label>`).join('')}<label>送礼回复方式<select class="hm-field" name="giftReplyMode"><option value="0" ${c.giftReplyMode===0?'selected':''}>系统预设话术</option><option value="1" ${c.giftReplyMode===1?'selected':''}>像正常聊天一样回复</option><option value="2" ${c.giftReplyMode===2?'selected':''}>混合</option></select></label><button class="hm-action">保存设置</button></form>`;
        const form=body.querySelector('form');form.onsubmit=e=>{e.preventDefault();const next={giftReplyMode:form.giftReplyMode.value};switches.forEach(([k])=>next[k]=form[k].checked);fields.forEach(([k])=>next[k]=form[k].value);H.settings.save(next);toast('设置已保存');render('settings');};
    }
    trigger.onclick=()=>{render('market');dialog.showModal();};dialog.addEventListener('close',()=>trigger.focus());
    badge();H.flush();setInterval(()=>H.flush(),1000);
    let lastPartner=null, autoTimer=null, chatBaselineReady=false;
    const baselineTimer=setInterval(()=>{
        const welcome=document.getElementById('welcome-animation');
        if ((welcome && welcome.style.display !== 'none') || typeof SESSION_ID === 'undefined' || !SESSION_ID) return;
        lastPartner=[...messages].reverse().find(x=>x.sender!=='user'&&x.type==='normal')?.id||null;
        chatBaselineReady=true;clearInterval(baselineTimer);
    },500);
    setInterval(()=>{
        if(!chatBaselineReady)return;
        const latest=[...messages].reverse().find(x=>x.sender!=='user'&&x.type==='normal');
        if(!latest||String(latest.id)===String(lastPartner))return;
        lastPartner=latest.id;clearTimeout(autoTimer);
        autoTimer=setTimeout(()=>{H.autoTick();H.flush();},2500);
    },1000);
})();
