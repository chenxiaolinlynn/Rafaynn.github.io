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

    function card(tx) {
        return `<div class="re-chat-card" data-red-envelope="${esc(tx.id)}">
            <div class="re-card-icon"><i class="fas fa-envelope"></i></div>
            <div class="re-card-main"><small>红包转账</small><strong>¥${money(tx.fen)}</strong><p>${esc(tx.note || '给你一个红包')}</p><span>${tx.claimed ? `${esc(tx.partnerName)}已领取` : '等待对方领取'}</span></div>
        </div>`;
    }

    let syncing = false;
    async function sync() {
        const welcome = document.getElementById('welcome-animation');
        if (syncing || !session() || (welcome && welcome.style.display !== 'none')) return;
        syncing = true;
        try {
            for (let tx of H.transfers.list().filter(x => x.session === session())) {
                if (!tx.claimed && tx.claimAt <= Date.now()) tx = H.transfers.update(tx.id, {claimed:true, synced:false});
                let msg = messages.find(x => x.id === tx.messageId);
                if (!msg && !tx.delivered) {
                    addMessage({id:tx.messageId,sender:'user',type:'red-envelope',text:card(tx),timestamp:new Date(tx.createdAt),status:'sent',favorited:false});
                    msg = messages.find(x => x.id === tx.messageId);
                }
                if (msg && (!tx.delivered || !tx.synced)) {
                    msg.text = card(tx); renderMessages(true);
                    await localforage.setItem(`${APP_PREFIX}${tx.session}_chatMessages`, messages);
                    H.transfers.update(tx.id, {delivered:true,synced:true});
                }
            }
        } finally { syncing = false; }
    }

    const style = document.createElement('style');
    style.textContent = `
#red-envelope-btn{background:var(--toolbar-btn-bg,var(--message-received-bg));color:var(--toolbar-btn-color,var(--text-secondary))}
#re-dialog{width:min(92vw,420px);border:1px solid var(--border-color);border-radius:22px;padding:0;background:var(--secondary-bg);color:var(--text-primary);box-shadow:0 24px 70px rgba(0,0,0,.24)}#re-dialog::backdrop{background:rgba(0,0,0,.35);backdrop-filter:blur(3px)}
.re-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--border-color)}.re-head h2{font-size:19px;margin:0}.re-close{border:0;background:transparent;color:var(--text-secondary);font-size:25px;cursor:pointer}
.re-form{display:grid;gap:14px;padding:20px}.re-balance{text-align:center;color:var(--text-secondary);font-size:13px}.re-amount{display:flex;align-items:center;gap:10px;border:1px solid var(--border-color);border-radius:16px;padding:14px;background:var(--primary-bg)}.re-amount span{font-size:22px}.re-amount input{width:100%;border:0;outline:0;background:transparent;color:var(--text-primary);font:inherit;font-size:30px}.re-form textarea{resize:none;border:1px solid var(--border-color);border-radius:14px;padding:12px;background:var(--primary-bg);color:var(--text-primary);font:inherit}.re-submit{border:0;border-radius:14px;padding:13px;background:var(--accent-color);color:var(--message-sent-text);font:inherit;cursor:pointer}
.re-chat-card{min-width:205px;max-width:270px;display:flex;align-items:center;gap:13px;padding:8px 4px;text-align:left;color:inherit}.re-card-icon{width:48px;height:48px;border-radius:14px;background:var(--accent-color);color:var(--message-sent-text);display:flex;align-items:center;justify-content:center;font-size:22px;flex:none}.re-card-main{min-width:0}.re-card-main small,.re-card-main span{display:block;font-size:11px;opacity:.65}.re-card-main strong{display:block;font-size:22px;margin:2px 0}.re-card-main p{margin:3px 0 7px;white-space:pre-wrap;overflow-wrap:anywhere}.message:has(.re-chat-card){background:var(--secondary-bg)!important;color:var(--text-primary)!important;border:1px solid var(--border-color);border-radius:20px!important}
`;
    document.head.append(style);

    const dialog = document.createElement('dialog');
    dialog.id = 're-dialog';
    dialog.setAttribute('aria-label', '红包转账');
    dialog.innerHTML = `<div class="re-head"><h2>红包转账</h2><button class="re-close" type="button" aria-label="关闭">×</button></div><form class="re-form"><div class="re-balance"></div><label class="re-amount"><span>¥</span><input aria-label="红包金额" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required></label><textarea name="note" maxlength="40" rows="3" placeholder="给红包写句话">给你一个红包</textarea><button class="re-submit" type="submit">转给${esc(partner())}</button></form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form');
    const renderBalance = () => { dialog.querySelector('.re-balance').textContent = `${mine()}的心意币余额 ¥${money(H.wallet.get().myBalance)}`; dialog.querySelector('.re-submit').textContent = `转给${partner()}`; };
    dialog.querySelector('.re-close').onclick = () => dialog.close();
    trigger.onclick = () => { renderBalance(); form.reset(); form.note.value = '给你一个红包'; dialog.showModal(); setTimeout(() => form.amount.focus(), 50); };
    let sending = false;
    form.onsubmit = async e => {
        e.preventDefault();
        if (sending || !session()) return;
        const raw = form.amount.value.trim();
        const fen = Math.round(Number(raw) * 100);
        if (!/^\d+(\.\d{1,2})?$/.test(raw) || !Number.isSafeInteger(fen) || fen <= 0) return toast('请输入正确的红包金额，最多两位小数', 'warning');
        sending = true; form.querySelector('button').disabled = true;
        try {
            const id = makeId();
            H.transfers.send({id,messageId:id,session:session(),partnerName:partner(),fen,note:form.note.value.trim().slice(0,40)||'给你一个红包',createdAt:Date.now(),claimAt:Date.now()+2500+Math.floor(Math.random()*2500),claimed:false,delivered:false,synced:false});
            dialog.close(); toast('红包已发出', 'success');
            await sync();
        } catch (error) { toast(error.message || '红包发送失败', 'error'); }
        finally { sending = false; form.querySelector('button').disabled = false; }
    };
    setInterval(() => sync().catch(() => {}), 1000);
})();
