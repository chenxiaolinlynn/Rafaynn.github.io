/* 红包转账：复用心愿市集的钱包与账本，在聊天中发送可持久化的领取卡片。 */
(() => {
    'use strict';
    const trigger = document.getElementById('red-envelope-btn');
    const H = window.HeartMarket;
    if (!trigger || !H) return;

    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const session = () => typeof SESSION_ID !== 'undefined' && SESSION_ID ? String(SESSION_ID) : '';
    const partner = () => settings.partnerName || '对方';
    const mine = () => settings.myName || '我';
    const toast = (text, type = 'info') => typeof showNotification === 'function' ? showNotification(text, type) : alert(text);
    const money = fen => (Number(fen || 0) / 100).toFixed(2);
    const makeId = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

    const covers = {heart:'♡',flower:'✿',star:'☆',envelope:'✉'};
    function card(tx) {
        const label = {pending:'等待领取',received:'已领取',returned:'已退回',expired:'已过期 · 已退款'}[tx.status];
        const actions = tx.side==='in' && tx.status==='pending' ? `<button data-rp-action="received" data-rp-id="${tx.id}">领取</button><button data-rp-action="returned" data-rp-id="${tx.id}">退回</button>` : '';
        return `<div class="re-chat-card"><div class="re-card-icon">${covers[tx.cover]||'✉'}</div><div class="re-card-main"><small>红包</small><strong>¥${money(tx.fen)}</strong><p>${esc(tx.note)}</p><span>${label}</span>${actions}</div></div>`;
    }
    let syncing = false;
    async function sync() {
        const welcome = document.getElementById('welcome-animation');
        if(syncing||!session()||(welcome&&welcome.style.display!=='none'))return;
        syncing=true;
        try {
            H.transfers.tick();
            const sid=session();
            for(const tx of H.transfers.list().filter(x=>x.session===sid)){
                let msg=messages.find(x=>x.id===tx.messageId),dirty=false;
                if(!msg&&!tx.delivered){
                    addMessage({id:tx.messageId,sender:tx.side==='in'?tx.partnerName:'user',type:'red-envelope',text:card(tx),timestamp:new Date(tx.createdAt),status:'sent',favorited:false});
                    msg=messages.find(x=>x.id===tx.messageId);dirty=true;
                }
                if(msg&&(!tx.synced||!tx.delivered)){msg.text=card(tx);dirty=true;}
                const feedbackDue=tx.feedbackAt&&Date.now()>=tx.feedbackAt&&!tx.feedbackSent;
                if(feedbackDue){
                    const who=tx.side==='out'?tx.partnerName:mine();
                    const text=tx.status==='received'?`${who}领取了红包`:tx.status==='expired'?'红包已过期，金额已退回':`${who}退回了红包`;
                    if(!messages.some(m=>m.id===tx.feedbackId))addMessage({id:tx.feedbackId,sender:'system',type:'system',text:esc(text),timestamp:new Date(tx.feedbackAt)});
                    if(tx.replyText&&!messages.some(m=>m.id===tx.replyId))addMessage({id:tx.replyId,sender:tx.partnerName,type:'red-envelope-reply',text:esc(tx.replyText),timestamp:new Date(tx.feedbackAt),status:'received'});
                    dirty=true;
                }
                if(dirty){renderMessages(true);await localforage.setItem(`${APP_PREFIX}${sid}_chatMessages`,messages);H.transfers.update(tx.id,{delivered:true,synced:true,...(feedbackDue?{feedbackSent:true}:{})});}
            }
        } finally {syncing=false;}
    }
    document.addEventListener('click',e=>{
        const b=e.target.closest('[data-rp-action]');if(!b)return;
        const tx=H.transfers.list().find(x=>x.id===Number(b.dataset.rpId));
        if(!tx||tx.side!=='in'||tx.session!==session())return;
        try{H.transfers.settle(tx.id,b.dataset.rpAction);sync().catch(()=>toast('记录保存失败，请稍后重试'));}catch(err){toast(err.message);}
    });

    const style = document.createElement('style');
    style.textContent = `
#red-envelope-btn{background:var(--toolbar-btn-bg,var(--message-received-bg));color:var(--toolbar-btn-color,var(--text-secondary))}
#re-dialog{max-height:90dvh;overflow:auto;width:min(92vw,420px);border:1px solid var(--border-color);border-radius:22px;padding:0;background:var(--secondary-bg);color:var(--text-primary);box-shadow:0 24px 70px rgba(0,0,0,.24)}#re-dialog::backdrop{background:rgba(0,0,0,.35);backdrop-filter:blur(3px)}
.re-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border-color)}.re-head h2{font-size:19px;margin:0}.re-close{border:0;background:transparent;color:var(--text-secondary);font-size:25px;cursor:pointer}
.re-form{display:grid;gap:14px;padding:20px}.re-balance{text-align:center;color:var(--text-secondary);font-size:13px}.re-amount{display:flex;align-items:center;gap:10px;border:1px solid var(--border-color);border-radius:16px;padding:14px;background:var(--primary-bg)}.re-amount span{font-size:22px}.re-amount input{width:100%;border:0;outline:0;background:transparent;color:var(--text-primary);font:inherit;font-size:30px}.re-form textarea{resize:none;border:1px solid var(--border-color);border-radius:14px;padding:12px;background:var(--primary-bg);color:var(--text-primary);font:inherit}.re-submit{border:0;border-radius:14px;padding:13px;background:var(--accent-color);color:var(--message-sent-text);font:inherit;cursor:pointer}
.re-presets{display:flex;gap:8px;flex-wrap:wrap}.re-presets button,.re-card-main button{border:1px solid var(--border-color);border-radius:10px;background:var(--primary-bg);color:var(--accent-color);padding:8px;cursor:pointer}.re-form select{padding:10px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);border-radius:10px}.re-form details{font-size:13px}.re-form details label{display:block;margin:12px 0}.re-chat-card{min-width:205px;max-width:270px;display:flex;align-items:center;gap:13px;padding:8px 4px;text-align:left;color:inherit}.re-card-icon{width:48px;height:48px;border-radius:14px;background:var(--accent-color);color:var(--message-sent-text);display:flex;align-items:center;justify-content:center;font-size:22px;flex:none}.re-card-main{min-width:0}.re-card-main small,.re-card-main span{display:block;font-size:11px;opacity:.65}.re-card-main strong{display:block;font-size:22px;margin:2px 0}.re-card-main p{margin:3px 0 7px;white-space:pre-wrap;overflow-wrap:anywhere}.message:has(.re-chat-card){background:var(--secondary-bg)!important;color:var(--text-primary)!important;border:1px solid var(--border-color);border-radius:20px!important}
`;
    document.head.append(style);

    const dialog = document.createElement('dialog');
    dialog.id = 're-dialog';
    dialog.setAttribute('aria-label', '红包转账');
    dialog.innerHTML = `<div class="re-head"><h2>红包转账</h2><button class="re-close" type="button" aria-label="关闭">×</button></div><form class="re-form"><div class="re-balance"></div><div class="re-presets"><button type="button" data-amount="5.20">¥5.20</button><button type="button" data-amount="13.14">¥13.14</button><button type="button" data-amount="52">¥52</button><button type="button" data-amount="520">¥520</button><button type="button" data-random>随机金额</button></div><label class="re-amount"><span>¥</span><input aria-label="红包金额" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required></label><textarea name="note" maxlength="40" rows="3" placeholder="给红包写句话">给你一个红包</textarea><label>红包封面<select name="cover"><option value="heart">♡ 心意</option><option value="flower">✿ 花朵</option><option value="star">☆ 星星</option><option value="envelope">✉ 信封</option></select></label><details><summary>红包互动设置</summary><label><input type="checkbox" name="autoOn"> 对方可以主动发红包（每天最多 5 次）</label><label>主动概率（%）<input type="number" name="autoPct" min="0" max="100"></label><label>感谢回复概率（%）<input type="number" name="replyPct" min="0" max="100"></label><label>感谢回复<select name="replyMode"><option value="0">预设谢谢池</option><option value="1">普通字卡</option><option value="2">混合</option></select></label><button type="button" data-save-settings>保存互动设置</button><p>待领取红包每分钟检查一次，8% 概率补领；24 小时后自动退款。</p></details><button class="re-submit" type="submit">转给${esc(partner())}</button></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form');
    const renderBalance = () => { dialog.querySelector('.re-balance').textContent = `${mine()}的心意币余额 ¥${money(H.wallet.get().myBalance)}`; dialog.querySelector('.re-submit').textContent = `转给${partner()}`; };
    dialog.querySelector('.re-close').onclick = () => dialog.close();
    trigger.onclick = () => { renderBalance(); form.reset(); form.autoOn.checked=H.config.rpAutoOn;form.autoPct.value=H.config.rpAutoPct;form.replyPct.value=H.config.rpReplyPct;form.replyMode.value=H.config.rpReplyMode; form.note.value = '给你一个红包'; dialog.showModal(); setTimeout(() => form.amount.focus(), 50); };
    form.querySelectorAll('[data-amount]').forEach(b=>b.onclick=()=>form.amount.value=b.dataset.amount);
    form.querySelector('[data-random]').onclick=()=>form.amount.value=money(H.transfers.random('out'));
    form.querySelector('[data-save-settings]').onclick=()=>{
        const a=Number(form.autoPct.value),r=Number(form.replyPct.value);
        if(![a,r].every(x=>Number.isFinite(x)&&x>=0&&x<=100))return toast('概率请输入 0–100');
        H.settings.save({rpAutoOn:form.autoOn.checked,rpAutoPct:a,rpReplyPct:r,rpReplyMode:Number(form.replyMode.value)});toast('设置已保存');
    };
    let sending = false;
    form.onsubmit = async e => {
        e.preventDefault();
        if (sending || !session()) return;
        const raw = form.amount.value.trim();
        const fen = Math.round(Number(raw) * 100);
        if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(fen) || fen <= 0) return toast('请输入正确的红包金额，最多两位小数', 'warning');
        sending = true; form.querySelector('.re-submit').disabled = true;
        try {
            const id = makeId();
            H.transfers.send({id,messageId:id,session:session(),partnerName:partner(),side:'out',cover:form.cover.value,fen,note:form.note.value.trim().slice(0,40)||'给你一个红包',createdAt:Date.now(),claimAt:Date.now()+2500+Math.floor(Math.random()*2500),claimed:false,delivered:false,synced:false});
            dialog.close(); toast('红包已发出', 'success');
            await sync();
        } catch (error) { toast(error.message || '红包发送失败', 'error'); }
        finally { sending = false; form.querySelector('.re-submit').disabled = false; }
    };
    setInterval(() => sync().catch(() => {}), 1000);
})();
