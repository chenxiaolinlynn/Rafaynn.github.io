/* 本地模拟一起听：使用现有播放器，不连接真人或 AI。 */
(() => {
    'use strict';
    const KEY = 'CHAT_APP_V3_listenTogether';
    const PREF = 'CHAT_APP_V3_listenTogetherAllowSwitch';
    const audio = document.getElementById('audio');
    const player = document.getElementById('player');
    if (!audio || !player) return;
    const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
    const btn = (text, fn) => { const b = el('button', text); b.type = 'button'; b.addEventListener('click', fn); return b; };
    const currentSession = () => typeof SESSION_ID !== 'undefined' ? SESSION_ID : null;
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const interval = () => Date.now() + 180000 + Math.random() * 180000;
    const api = () => window.musicTogetherBridge;
    let state = null, acceptTimer = null, ready = false;
    let allowSwitch = true;
    try { state = JSON.parse(localStorage.getItem(KEY) || 'null'); allowSwitch = localStorage.getItem(PREF) !== 'false'; } catch {}
    // A previous page's active session ended at its last checkpoint, not at this load.
    if (state?.status === 'active') { state.status = 'ended'; state.endedAt = state.lastSeen || state.startedAt; state.reason = '页面关闭或刷新，同听已中断'; }
    if (state?.status === 'inviting') state = null;
    function persist() {
        try { if (state) localStorage.setItem(KEY, JSON.stringify(state)); else localStorage.removeItem(KEY); return true; }
        catch { status.textContent = '记录暂时无法保存，请检查浏览器存储空间'; return false; }
    }
    const style = el('style');
    style.textContent = `
#player:not(.collapsed){height:190px}#lt-entry{border:0;border-radius:12px;background:var(--message-received-bg);color:var(--accent-color);padding:8px;font:inherit;font-size:12px;cursor:pointer;touch-action:manipulation}
#lt-panel,#lt-summary{width:min(420px,calc(100% - 28px));max-height:85dvh;overflow:auto;margin:auto;padding:24px;border:1px solid var(--border-color);border-radius:24px;background:var(--secondary-bg);color:var(--text-primary)}
#lt-panel::backdrop,#lt-summary::backdrop{background:rgba(0,0,0,.35)}#lt-panel h2{font-size:20px;margin:0}#lt-panel header{display:flex;align-items:center;justify-content:space-between}#lt-panel button{font:inherit;border:0;border-radius:12px;padding:10px 14px;cursor:pointer;background:var(--message-received-bg);color:var(--text-primary)}#lt-panel .lt-primary{background:var(--accent-color);color:var(--message-sent-text)}
.lt-people{display:flex;align-items:center;justify-content:center;gap:20px;margin:24px 0 16px}.lt-person{text-align:center;font-size:13px}.lt-face{width:48px;height:48px;border-radius:50%;object-fit:cover;background:var(--message-received-bg);display:inline-flex;align-items:center;justify-content:center;font-size:24px}.lt-heart{color:var(--accent-color)}
#lt-time{text-align:center;font-size:28px;color:var(--accent-color);font-variant-numeric:tabular-nums}#lt-status,#lt-song{font-size:13px;text-align:center;line-height:1.7;overflow-wrap:anywhere;color:var(--text-secondary)}#lt-panel label{display:flex;align-items:center;gap:8px;margin:20px 0;font-size:13px}#lt-panel input{accent-color:var(--accent-color)}#lt-actions{display:flex;gap:10px;justify-content:center;margin-top:20px}
#chat-container .system-message:has(.lt-record){display:none}
#lt-summary .lt-record{border:0;padding:0;margin:0 auto}#lt-summary button{display:block;width:100%;margin-top:20px;padding:12px;border:0;border-radius:12px;font:inherit;background:var(--accent-color);color:var(--message-sent-text);cursor:pointer}
.lt-record{max-width:360px;margin:12px auto;padding:20px;border:1px solid var(--border-color);border-radius:20px;background:var(--secondary-bg);color:var(--text-primary);text-align:left}.lt-record h3{margin:0;text-align:center;color:var(--accent-color)}.lt-record p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7}.lt-record .lt-people{margin:12px 0}.lt-record small{color:var(--text-secondary)}
`;
    document.head.append(style);
    const panel = el('dialog'); panel.id = 'lt-panel'; panel.setAttribute('aria-labelledby', 'lt-title');
    const header = el('header'), title = el('h2', '一起听歌'); title.id = 'lt-title';
    header.append(title, btn('关闭', () => panel.close()));
    const people = el('div', undefined, 'lt-people'), time = el('div'); time.id = 'lt-time';
    const song = el('p'); song.id = 'lt-song'; const status = el('p'); status.id = 'lt-status';
    const label = el('label'), toggle = el('input'); toggle.type = 'checkbox'; toggle.checked = allowSwitch;
    label.append(toggle, document.createTextNode('允许对方切歌'));
    toggle.addEventListener('change', () => { allowSwitch = toggle.checked; try { localStorage.setItem(PREF, String(allowSwitch)); } catch {} });
    const actions = el('div'); actions.id = 'lt-actions';
    const recommendation = btn('', async () => {
        const url = recommendation.dataset.url;
        if (!state || state.status !== 'active' || state.session !== currentSession()) return;
        await api()?.playUrl(url); if (state) { delete state.recommended; persist(); } recommendation.hidden = true;
    }); recommendation.hidden = true;
    panel.append(header, people, time, song, status, label, recommendation, actions); document.body.append(panel);
    const summary = el('dialog'); summary.id = 'lt-summary'; summary.setAttribute('aria-label', '本次一起听');
    const summaryBody = el('div');
    summary.append(summaryBody, btn('完成', () => summary.close())); document.body.append(summary);
    summary.addEventListener('close', () => {
        if (state?.status === 'ended' && state.id === summary.dataset.recordId) {
            state = null; persist(); render();
        }
        summaryBody.replaceChildren(); entry.focus();
    });
    const entry = btn('♫ 邀请对方一起听', () => { render(); panel.showModal(); }); entry.id = 'lt-entry';
    // The existing player uses dragging; controls must not start a drag.
    entry.addEventListener('pointerdown', e => e.stopPropagation());
    entry.addEventListener('mousedown', e => e.stopPropagation());
    entry.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    player.querySelector('.full-view').append(entry);
    function avatar(id) { const src = document.querySelector(`#${id} img`)?.src || ''; return /^(https?:|data:image\/)/.test(src) ? src : ''; }
    function peopleView(target, record) {
        target.replaceChildren();
        for (const who of ['me', 'partner']) {
            if (who === 'partner') target.append(el('span', '♡', 'lt-heart'));
            const box = el('div', undefined, 'lt-person');
            const face = record[who + 'Avatar'] ? el('img', undefined, 'lt-face') : el('span', '♫', 'lt-face');
            if (face.tagName === 'IMG') { face.src = record[who + 'Avatar']; face.alt = record[who]; }
            box.append(face, el('div', record[who])); target.append(box);
        }
    }
    const identity = () => ({ me: settings.myName || '我', partner: settings.partnerName || '对方', meAvatar: avatar('my-avatar'), partnerAvatar: avatar('partner-avatar') });
    function render() {
        const active = state?.session === currentSession() && ['active', 'inviting'].includes(state.status);
        peopleView(people, active ? state : identity());
        actions.replaceChildren(); recommendation.hidden = true;
        if (!active) {
            time.textContent = '一起听，慢慢聊'; status.textContent = '邀请对方陪你听当前歌单';
            const invite = btn('邀请对方一起听', start); invite.className = 'lt-primary'; actions.append(invite);
            entry.textContent = '♫ 邀请对方一起听';
        } else if (state.status === 'inviting') {
            time.textContent = '等待接受…'; status.textContent = `正在邀请${state.partner}`;
            actions.append(btn('取消邀请', () => { clearTimeout(acceptTimer); state = null; persist(); render(); }));
            entry.textContent = '♫ 等待对方接受…';
        } else {
            status.textContent = `${state.partner}正在陪你一起听`;
            actions.append(btn('结束一起听', () => finish('本次一起听已结束')));
            updateTime();
            if (state.recommended) { recommendation.textContent = `播放推荐 · ${state.recommended.title}`; recommendation.dataset.url = state.recommended.url; recommendation.hidden = false; }
        }
        updateSong();
    }
    function start() {
        if (!ready || !currentSession() || !api()) { status.textContent = '播放器正在准备，请稍后重试'; return; }
        if (state) { status.textContent = '请先关闭上次一起听的汇总'; return; }
        if (!api().list().length) { status.textContent = '歌单为空，请先添加歌曲'; return; }
        state = { id: 'listen-' + crypto.randomUUID(), session: currentSession(), ...identity(), status: 'inviting', tracks: [] };
        if (!persist()) { state = null; return; }
        render(); const id = state.id;
        acceptTimer = setTimeout(() => {
            if (state?.id !== id || state.session !== currentSession()) return;
            state.status = 'active'; state.startedAt = Date.now(); state.lastSeen = state.startedAt; state.nextInteraction = interval();
            persist(); render(); recordTrack();
            if (audio.paused) status.textContent = `${state.partner}已接受邀请，点击播放器的播放按钮开始听歌`;
        }, 3000 + Math.random() * 5000);
    }
    function updateTime() {
        const seconds = Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
        const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        time.textContent = '已一起听 ' + text; entry.textContent = '♫ 一起听 · ' + text;
    }
    function updateSong() { const current = api()?.current(); song.textContent = current ? `${audio.paused ? '已暂停' : '正在播放'} · ${current.title}` : '暂无歌曲'; }
    function recordTrack() {
        if (state?.status !== 'active' || state.session !== currentSession() || audio.paused || audio.readyState < 2) return;
        const track = api()?.current();
        if (track?.url && !state.tracks.some(x => x.url === track.url)) { state.tracks.push({ title: track.title, url: track.url }); persist(); }
    }
    function cards() {
        try {
            const disabled = new Set(JSON.parse(localStorage.getItem('disabledReplyItems') || '[]'));
            (window.customReplyGroups || []).filter(x => x.disabled).forEach(g => (g.items || []).forEach(x => disabled.add(x)));
            return (typeof customReplies !== 'undefined' ? customReplies : []).filter(x => !disabled.has(x) && String(x).trim());
        } catch { return []; }
    }
    async function interact() {
        if (state?.status !== 'active' || state.session !== currentSession() || audio.paused) return;
        const current = api().current(), all = api().list().filter(x => x.url && x.url !== current?.url);
        const fresh = all.filter(x => !state.tracks.some(t => t.url === x.url));
        const pool = fresh.length ? fresh : all, replies = cards();
        const choices = [...(pool.length ? ['recommend'] : []), ...(pool.length && allowSwitch ? ['switch'] : []), ...(replies.length ? ['card'] : [])];
        const action = pick(choices); if (!action) return;
        if (action === 'card') {
            addMessage({ id: Date.now(), sender: 'partner', type: 'normal', text: String(pick(replies)), timestamp: new Date(), status: 'received' });
            return;
        }
        const target = pick(pool), partner = state.partner;
        if (action === 'recommend') {
            state.recommended = target; persist();
            recommendation.textContent = `播放推荐 · ${target.title}`; recommendation.dataset.url = target.url; recommendation.hidden = false;
            status.textContent = `${partner}推荐了《${target.title}》`;
            showNotification(`${partner}推荐《${target.title}》，打开一起听面板查看`, 'info');
        } else {
            const success = await api().playUrl(target.url);
            if (success) { status.textContent = `${partner}想和你听《${target.title}》`; showNotification(status.textContent, 'info'); }
        }
    }
    function recordCard(record) {
        const card = el('div', undefined, 'lt-record'); card.append(el('h3', '♫ 本次一起听'));
        const pair = el('div', undefined, 'lt-people'); peopleView(pair, record); card.append(pair);
        const seconds = Math.max(0, Math.floor((record.endedAt - record.startedAt) / 1000));
        card.append(el('p', `一起听了 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒 · ${record.tracks.length} 首歌`));
        record.tracks.forEach((track, i) => card.append(el('p', `${i + 1}. ${track.title}`)));
        if (!record.tracks.length) card.append(el('p', '本次没有成功播放的歌曲'));
        card.append(el('small', record.reason));
        return card;
    }
    function deliver() {
        if (!ready || state?.status !== 'ended' || summary.open) return;
        summary.dataset.recordId = state.id;
        summaryBody.replaceChildren(recordCard(state));
        if (panel.open) panel.close();
        summary.showModal();
    }
    function finish(reason, endedAt = Date.now()) {
        clearTimeout(acceptTimer);
        if (state?.status === 'inviting') { state = null; persist(); render(); return; }
        if (state?.status !== 'active') return;
        state.status = 'ended'; state.endedAt = endedAt; state.reason = reason; persist(); render(); deliver();
    }
    for (const event of ['playing', 'pause', 'loadedmetadata']) audio.addEventListener(event, () => { recordTrack(); updateSong(); });
    // Music initialization is called after the application's session and data load.
    window.addEventListener('music-together-ready', () => { ready = true; deliver(); });
    if (api()) ready = true;
    setInterval(() => {
        if (!ready) return;
        if (state && state.session !== currentSession() && state.status !== 'ended') finish('切换聊天，同听已结束', state.lastSeen || Date.now());
        if (state?.status === 'active') {
            state.lastSeen = Date.now(); updateTime(); recordTrack(); persist();
            if (Date.now() >= state.nextInteraction) { state.nextInteraction = interval(); persist(); interact(); }
        } else if (state?.status === 'ended') deliver();
    }, 1000);
    const checkpoint = () => { if (state?.status === 'active') { state.lastSeen = Date.now(); persist(); } };
    window.addEventListener('pagehide', checkpoint); document.addEventListener('visibilitychange', checkpoint);
    panel.addEventListener('close', () => entry.focus());
})();
