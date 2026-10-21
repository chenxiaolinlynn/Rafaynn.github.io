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
    const CONFIG = KEY + '_config';
    const defaults = {accept:60, refuse:25, change:15, request:5, cooldown:10, queue:6, next:15, random:10, mode:5, pause:3};
    let config = {...defaults};
    try {
        const saved = JSON.parse(localStorage.getItem(CONFIG) || '{}');
        for (const k of Object.keys(defaults)) {
            const value = saved[k];
            if (Number.isFinite(value) && value >= 0 && value <= (k === 'request' ? 30 : k === 'cooldown' ? 1440 : 100)) config[k] = value;
        }
        if (config.accept + config.refuse + config.change !== 100 || config.next + config.random + config.mode > 100) config = {...defaults};
    } catch {}
    let incoming = null, queued = null, trackVersion = 0, pauseTimer = null, resumeTimer = null, switchTimer = null;
    let lastRequest = 0, requestSession = null, lastPauseVersion = -1;
    const historyKey = () => KEY + '_events_' + currentSession();
    const say = (text, system = false) => addMessage({id:Date.now()+Math.random(), sender:system?'system':identity().partner,
        type:system?'system':'normal', text:String(text).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])), timestamp:new Date(), status:'received', musicInteraction:true});
    function log(text) {
        say(text, true);
        const event = {at:Date.now(), text};
        if (state?.status === 'active') { (state.events ||= []).push(event); persist(); }
        try { const history=JSON.parse(localStorage.getItem(historyKey()) || '[]'); history.push(event); localStorage.setItem(historyKey(),JSON.stringify(history.slice(-100))); } catch {}
    }
    const active = () => state?.status === 'active' && state.session === currentSession();
    function clearPlaybackTimers() { clearTimeout(pauseTimer); clearTimeout(resumeTimer); clearTimeout(switchTimer); }

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
    const preferences = el('details'), prefTitle = el('summary', '音乐互动设置'); preferences.append(prefTitle);
    const inputs = {};
    const names = {accept:'接受邀请（%）', refuse:'拒绝邀请（%）', change:'要求换歌（%）', request:'主动邀请（%，最高 30）', cooldown:'邀请冷却（分钟）', queue:'未邀请时预订下一首（%）', next:'歌曲结束：换另一首（%）', random:'歌曲结束：随机选歌（%）', mode:'歌曲结束：改变模式（%）', pause:'歌曲开始：暂停互动（%）'};
    for (const [key, name] of Object.entries(names)) {
        const row=el('label', name), input=el('input'); input.type='number'; input.min='0'; input.max=key==='request'?'30':key==='cooldown'?'1440':'100'; input.step='1'; input.value=config[key]; input.setAttribute('aria-label',name); input.style.width='70px'; inputs[key]=input; row.append(input); preferences.append(row);
    }
    preferences.append(btn('保存音乐设置', () => {
        const values=Object.fromEntries(Object.entries(inputs).map(([k,n])=>[k,Number(n.value)]));
        if (Object.entries(values).some(([k,v])=>!Number.isFinite(v)||v<0||v>Number(inputs[k].max)||inputs[k].value.trim()==='') || values.accept+values.refuse+values.change!==100 || values.next+values.random+values.mode>100) {
            showNotification('邀请回应合计须为 100%；歌曲结束的三个概率合计不能超过 100%，请检查输入范围', 'warning'); return;
        }
        try { localStorage.setItem(CONFIG,JSON.stringify(values)); config=values; showNotification('音乐设置已保存','success'); }
        catch { showNotification('设置保存失败，请检查存储空间','error'); }
    }));
    panel.append(preferences);
    const requestPanel=el('dialog'); requestPanel.id='lt-request'; requestPanel.setAttribute('aria-label','对方的听歌邀请');
    const requestText=el('p'), requestActions=el('div'); requestPanel.append(el('h2','一起听歌'),requestText,requestActions); document.body.append(requestPanel);
    style.textContent += '#lt-request{width:min(420px,calc(100% - 28px));max-height:85dvh;overflow:auto;margin:auto;padding:24px;border:1px solid var(--border-color);border-radius:24px;background:var(--secondary-bg);color:var(--text-primary)}#lt-request::backdrop{background:rgba(0,0,0,.35)}#lt-request button{font:inherit;padding:12px 20px;margin:8px;border:0;border-radius:12px;background:var(--accent-color);color:var(--message-sent-text)}#lt-panel details{margin-top:20px}#lt-panel details label{justify-content:space-between;margin:12px 0}#lt-panel details input{background:var(--primary-bg);color:var(--text-primary);border:1px solid var(--border-color);border-radius:8px;padding:6px}';
    requestPanel.addEventListener('cancel', e => { e.preventDefault(); answerRequest(false); });

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
        if (state || incoming) { status.textContent = '请先处理当前邀请或关闭上次汇总'; return; }
        const track=api().current();
        if (!track?.url) { status.textContent = '歌单为空，请先添加歌曲'; return; }
        state = { id:'listen-'+crypto.randomUUID(), session:currentSession(), ...identity(), status:'inviting', tracks:[], events:[] };
        if (!persist()) { state=null; return; }
        render(); const id=state.id;
        acceptTimer=setTimeout(() => {
            if (state?.id!==id || state.session!==currentSession()) return;
            const roll=Math.random()*100, alternatives=api().list().filter(t=>t.url!==track.url);
            if (roll < config.accept || (roll >= config.accept+config.refuse && !alternatives.length)) {
                say(pick(['一起听呀。','放吧，我靠近一点。'])); begin(track);
            } else if (roll < config.accept+config.refuse) {
                say(pick(['这首现在不想听嘛。','待会儿再听好不好？']));
                log(identity().partner+'这次没答应'); state=null; persist(); render();
            } else {
                say('这首听腻啦，换一首嘛～'); state=null; persist(); render(); offer(pick(alternatives));
            }
        },1500+Math.random()*2500);
    }
    async function begin(track) {
        if (!active()) state={id:'listen-'+crypto.randomUUID(),session:currentSession(),...identity(),status:'active',tracks:[],events:[],startedAt:Date.now(),lastSeen:Date.now()};
        persist(); render();
        const success=await api().playUrl(track.url);
        if (active() && !success) status.textContent='已接受邀请，请点击播放重试或更换歌曲';
    }
    function offer(track) {
        if (!track || incoming || state?.status==='inviting' || state?.status==='ended') return;
        incoming={track,session:currentSession()};
        lastRequest=Date.now(); requestSession=currentSession();
        try { localStorage.setItem(KEY+'_request_'+requestSession,String(lastRequest)); } catch {}
        requestText.textContent=audio.paused ? `${identity().partner}想和你一起听《${track.title}》` : `${identity().partner}想邀请你切换到《${track.title}》`;
        requestActions.replaceChildren(btn(audio.paused?'一起听':'切过去',()=>answerRequest(true)),btn('稍后',()=>answerRequest(false)));
        if (panel.open) panel.close(); requestPanel.showModal();
    }
    function answerRequest(accept) {
        const request=incoming; incoming=null; requestPanel.close();
        if (!request || request.session!==currentSession()) return;
        if (accept) { log(`接受了${identity().partner}的听歌邀请 · ${request.track.title}`); begin(request.track); }
        else { log(`暂时拒绝了${identity().partner}的听歌邀请 · ${request.track.title}`); render(); }
    }
    function maybeMusicRequest() {
        if (!ready || !currentSession() || incoming || state?.status==='inviting' || state?.status==='ended') return;
        if (requestSession!==currentSession()) {
            requestSession=currentSession();
            try { lastRequest=Number(localStorage.getItem(KEY+'_request_'+requestSession)) || 0; } catch { lastRequest=0; }
        }
        if (Date.now()-lastRequest < config.cooldown*60000) return;
        const list=api()?.list().filter(t=>t.url); if (!list?.length) return;
        if (Math.random()*100 < config.request) offer(pick(list));
        else if (!queued && Math.random()*100 < config.queue) {
            queued={...pick(list),session:currentSession()};
            log(`${identity().partner}预订了下一首《${queued.title}》`);
        }
    }
    window.addEventListener('chat-message-added', e => {
        const m=e.detail;
        // One checkpoint for each ordinary partner reply; music's own replies never recurse.
        if (m && m.type==='normal' && m.sender!=='user' && m.sender!=='system' && !m.musicInteraction) maybeMusicRequest();
    });
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
    function trackStarted() {
        clearPlaybackTimers(); trackVersion++; lastPauseVersion=-1;
    }
    function maybePause() {
        if (!active() || lastPauseVersion===trackVersion) return;
        lastPauseVersion=trackVersion;
        if (Math.random()*100 >= config.pause) return;
        const version=trackVersion, id=state.id;
        pauseTimer=setTimeout(() => {
            if (!active() || state.id!==id || version!==trackVersion || audio.paused || audio.ended) return;
            audio.pause(); say(String(pick(cards()) || '宝宝，陪我说句话再继续听。'));
            resumeTimer=setTimeout(() => {
                if (active() && state.id===id && version===trackVersion && audio.paused) audio.play().catch(()=>showNotification('点击播放继续听歌','info'));
            },3500);
        },10000+Math.random()*15000);
    }
    function ended() {
        clearPlaybackTimers();
        const list=api().list().filter(t=>t.url), current=api().current();
        let target=null;
        if (active() && allowSwitch) {
            const roll=Math.random()*100;
            if (roll<config.next) target=pick(list.filter(t=>t.url!==current?.url));
            else if (roll<config.next+config.random) target=pick(list);
            else if (roll<config.next+config.random+config.mode) { api().cycleMode(); log(identity().partner+'换了播放模式'); }
        }
        // Explicit next-track reservations take priority, but still consume one end-of-song roll.
        if (queued?.session===currentSession()) { target=list.find(t=>t.url===queued.url) || target; queued=null; }
        if (!target) return false;
        const version=trackVersion, session=currentSession();
        switchTimer=setTimeout(() => {
            if (version!==trackVersion || session!==currentSession() || !audio.ended) return;
            api().playUrl(target.url);
        },300);
        return true;
    }
    window.musicTogetherOnEnded=ended;
    window.addEventListener('music-track-loaded',trackStarted);
    // A manual pause or resume supersedes a pending simulated pause/resume.
    window.addEventListener('music-user-playback',clearPlaybackTimers);
    function recordCard(record) {
        const card = el('div', undefined, 'lt-record'); card.append(el('h3', '♫ 本次一起听'));
        const pair = el('div', undefined, 'lt-people'); peopleView(pair, record); card.append(pair);
        const seconds = Math.max(0, Math.floor((record.endedAt - record.startedAt) / 1000));
        card.append(el('p', `一起听了 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒 · ${record.tracks.length} 首歌`));
        record.tracks.forEach((track, i) => card.append(el('p', `${i + 1}. ${track.title}`)));
        if (!record.tracks.length) card.append(el('p', '本次没有成功播放的歌曲'));
        (record.events || []).forEach(event => card.append(el('small', event.text),el('br')));
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
        clearTimeout(acceptTimer); clearPlaybackTimers(); queued=null;
        if (incoming) { incoming=null; requestPanel.close(); }
        if (state?.status === 'inviting') { state = null; persist(); render(); return; }
        if (state?.status !== 'active') return;
        state.status = 'ended'; state.endedAt = endedAt; state.reason = reason; persist(); render(); deliver();
    }
    audio.addEventListener('playing',maybePause);
    for (const event of ['playing', 'pause', 'loadedmetadata']) audio.addEventListener(event, () => { recordTrack(); updateSong(); });
    // Music initialization is called after the application's session and data load.
    window.addEventListener('music-together-ready', () => { ready = true; deliver(); });
    if (api()) ready = true;
    setInterval(() => {
        if (!ready) return;
        if (incoming && incoming.session!==currentSession()) { incoming=null; requestPanel.close(); }
        if (queued && queued.session!==currentSession()) queued=null;
        if (state && state.session !== currentSession() && state.status !== 'ended') finish('切换聊天，同听已结束', state.lastSeen || Date.now());
        if (state?.status === 'active') {
            state.lastSeen = Date.now(); updateTime(); recordTrack(); persist();

        } else if (state?.status === 'ended') deliver();
    }, 1000);
    const checkpoint = () => { if (state?.status === 'active') { state.lastSeen = Date.now(); persist(); } };
    window.addEventListener('pagehide', checkpoint); document.addEventListener('visibilitychange', checkpoint);
    panel.addEventListener('close', () => entry.focus());
})();
