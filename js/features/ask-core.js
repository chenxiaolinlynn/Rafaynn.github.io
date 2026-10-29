/* =====================================================================
   AskCore · TA 询问核心引擎（单题询问）
   逻辑借鉴 mochi 站 ta-ask.js 前半段（TA 的询问）：定时 tick、六道闸、
   问题卡 ask-card、pending→answered 历史、选项 reply 映射、弹窗概率。
   注意：题库文本为本站自写示例（未照搬 mochi 预设题），接入时请替换
   为自己的题库；批量问卷（整套 DSL、逐题 30s tick）不在本模块内。
   归属：本站基于言序（mochi 老师）作品二改，署名见 README / 页脚。
   无 DOM 依赖；渲染、弹窗、通知、聊天发卡通过 init() 注入的宿主回调完成。
   ---------------------------------------------------------------------
   接入示例：
     AskCore.init({
       partnerId:  () => SESSION_ID,               // 按联系人隔离
       onAskCard:  card => renderAskCard(card),    // 出题卡回调（必须）
       onPopup:    card => openAnswerModal(card),  // 文本题弹窗回调，可不传
       onAnswered: (rec, reply) => {},             // 答完回调，可不传
       onChatOut:  text => addMessage('me', text), // 你的答案上屏，可不传
       onChatIn:   text => addMessage('ta', text), // TA 回复上屏，可不传
       customCards: () => myCardPool,              // 自定义字卡池（10% 混入用），可不传
       chatStyleReply: () => genReply(),           // 聊天风格回复（useChatReply 用），可不传
       isNight:    () => nightModeOn,              // 夜间勿扰判断，可不传
       nowMs:      () => Date.now(),               // 时钟注入（测试用），可不传
       rnd:        () => Math.random(),            // 随机注入（测试用），可不传
       store:      myStore                         // {get,set}，默认 localStorage/内存
     });
     AskCore.start();                 // 60 秒后首试，之后每 4 分钟 tick
     // 或宿主自己驱动：AskCore.tick();
     // 回答（文本题）：AskCore.answerCard(ts, '今天很好');
     // 回答（单选题）：AskCore.answerCard(ts, { option: '陪我聊聊天' });
     // 回答（多选题）：AskCore.answerCard(ts, { options: ['A', 'B'] });
   存储：键 chuanxun-ask-v1:<partnerId>，存 settings / questions /
   history / cards / lastAskAt / gateAt；时间一律毫秒时间戳。
   ===================================================================== */
(function (global) {
    'use strict';

    /* ---------------- 可调参数 ---------------- */
    const CFG = {
        TICK_MS: 240000,       // tick 间隔：4 分钟（沿用 mochi）
        FIRST_MS: 60000,       // 加载后首次尝试：60 秒
        PROB: 5,               // 默认出题概率 %（沿用 mochi）
        POPUP_PROB: 70,        // 文本题自动弹窗概率 %（沿用 mochi）
        COOL_MIN: 45,          // 自冷却：45 分钟（沿用 mochi）
        GATE_MIN: 60,          // 互动总闸：60 分钟（沿用 mochi，跨所有互动卡共用）
        DCF: 100,              // 动态概率闸 %，默认 100 即恒通过
        DCP_MUL: 1,            // 全局概率乘数（沿用 dcpEff，默认 1）
        POP_QUEUE_MAX: 4,      // 后台弹窗排队上限（沿用 mochi，只保留最新）
        MIX_PCT: 10,           // 有预设回复时被自定义字卡替换的概率 %（沿用 mochi）
        MIX_MAX: 5,            // 混入字卡最多张数
        DEFAULT_REPLIES: ['收到，我记下了。', '好，我知道了。', '嗯，你说的我记住了。', '好的，我放在心上了。']
    };

    /* 频率档：原频率 / 稍安静 / 安静 / 很安静（沿用 mochi IC_MODES） */
    const FREQ_MODES = {
        orig: { probMul: 1,   coolMul: 1,   gateMul: 1 },
        low1: { probMul: 0.6, coolMul: 1.5, gateMul: 1.5 },
        low2: { probMul: 0.4, coolMul: 2,   gateMul: 2 },
        low3: { probMul: 0.2, coolMul: 3,   gateMul: 3 }
    };
    const CATS = ['daily', 'care', 'interact', 'world'];

    /* 示例题库（本站自写，接入时替换；isPreset 题只能启停、不能删除） */
    const EXAMPLE_QUESTIONS = [
        { id: 'a_d1', text: '今天过得怎么样？', cat: 'daily', type: 'text', enabled: true, isPreset: true },
        { id: 'a_d2', text: '现在在做什么呢？', cat: 'daily', type: 'text', enabled: true, isPreset: true },
        { id: 'a_d3', text: '今天出门的时候，有没有一瞬间想起我？', cat: 'daily', type: 'text', enabled: true, isPreset: true },
        { id: 'a_d4', text: '如果可以把今天的心情装进一张字卡，你会写什么？', cat: 'daily', type: 'text', enabled: true, isPreset: true },
        { id: 'a_c1', text: '累不累呀？', cat: 'care', type: 'text', enabled: true, isPreset: true },
        { id: 'a_c2', text: '今天有没有好好吃饭？', cat: 'care', type: 'text', enabled: true, isPreset: true },
        { id: 'a_i1', text: '现在想收到我发的哪种字卡？', cat: 'interact', type: 'text', enabled: true, isPreset: true },
        { id: 'a_i2', text: '如果我现在就坐在你对面，你第一句会说什么？', cat: 'interact', type: 'text', enabled: true, isPreset: true },
        { id: 'a_w1', text: '今天有没有哪首歌，让你想起了我？', cat: 'world', type: 'text', enabled: true, isPreset: true },
        { id: 'a_w2', text: '现在窗外的光是什么样的？形容给我听听', cat: 'world', type: 'text', enabled: true, isPreset: true },
        { id: 'a_s1', text: '今晚想让我怎么陪你？', cat: 'interact', type: 'single', enabled: true, isPreset: true, options: [
            { t: '多发几张字卡', reply: '好，我挑好看的发，你等着' },
            { t: '陪我聊聊天', reply: '好，从哪说起都行' },
            { t: '安静待着就好', reply: '嗯，我就在这里，不吵你' },
            { t: '给我讲个故事', reply: '好，讲一个只有我们俩知道的故事' }
        ] },
        { id: 'a_s2', text: '现在最想让我做哪件事？', cat: 'care', type: 'single', enabled: true, isPreset: true, options: [
            { t: '夸夸我', reply: '你今天也很好，我一直都觉得' },
            { t: '哄哄我', reply: '过来，慢慢哄' },
            { t: '听我说说话', reply: '好，我在听，慢慢说' },
            { t: '什么都不用做', reply: '那我就这样待着，你也歇会' }
        ] },
        { id: 'a_m1', text: '今天想从我这里得到哪几种陪伴？（可多选）', cat: 'interact', type: 'multi', multiMax: 3, enabled: true, isPreset: true, options: [
            { t: '字卡', reply: '那我挑一张最合你心意的' },
            { t: '一句话', reply: '好，你想听什么类型的，我现编' },
            { t: '安静陪着', reply: '嗯，那我不发，就在' },
            { t: '一个表情包', reply: '找一张最像你心情的给你' }
        ] }
    ];

    /* ---------------- 宿主钩子与存储 ---------------- */
    const host = {
        partnerId: () => 'default',
        onAskCard: () => {},
        onPopup: null,
        onAnswered: () => {},
        onChatOut: () => {},
        onChatIn: () => {},
        customCards: () => [],
        chatStyleReply: null,
        isNight: () => false,
        nowMs: () => Date.now(),
        rnd: () => Math.random(),
        store: null
    };
    function now() { try { return host.nowMs(); } catch (e) { return Date.now(); } }
    function rnd() { try { return host.rnd(); } catch (e) { return Math.random(); } }
    function memStore() {
        const m = {};
        return { get: k => (k in m ? m[k] : null), set: (k, v) => { m[k] = v; } };
    }
    function defaultStore() {
        try {
            if (typeof localStorage !== 'undefined') {
                return { get: k => localStorage.getItem(k), set: (k, v) => localStorage.setItem(k, v) };
            }
        } catch (e) {}
        return memStore();
    }
    function store() { return host.store || (host.store = defaultStore()); }
    function key() { return 'chuanxun-ask-v1:' + String(host.partnerId()); }

    function blankState() {
        return {
            settings: { enabled: true, prob: CFG.PROB, popupProb: CFG.POPUP_PROB, useDefault: true, useChatReply: false, deadline: 0, freq: 'orig', catOff: {}, dcf: CFG.DCF, dcpMul: CFG.DCP_MUL },
            questions: EXAMPLE_QUESTIONS.map(q => Object.assign({}, q, { options: q.options ? q.options.map(o => Object.assign({}, o)) : undefined })),
            history: [],
            cards: {},
            lastAskAt: 0,
            gateAt: 0
        };
    }
    function load() {
        let s = null;
        try { s = JSON.parse(store().get(key()) || 'null'); } catch (e) { s = null; }
        if (!s || typeof s !== 'object') s = blankState();
        if (!s.settings || typeof s.settings !== 'object') s.settings = blankState().settings;
        if (!Array.isArray(s.questions)) s.questions = blankState().questions;
        if (!Array.isArray(s.history)) s.history = [];
        if (!s.cards || typeof s.cards !== 'object') s.cards = {};
        if (typeof s.lastAskAt !== 'number') s.lastAskAt = 0;
        if (typeof s.gateAt !== 'number') s.gateAt = 0;
        return s;
    }
    function save(s) { store().set(key(), JSON.stringify(s)); }

    /* ---------------- 频率档与门禁 ---------------- */
    function freqMode(s) { return FREQ_MODES[s.settings.freq] || FREQ_MODES.orig; }
    function effProb(s) {
        const m = freqMode(s);
        const n = Number(s.settings.prob);
        if (!isFinite(n)) return 0;
        const base = n * (Number(s.settings.dcpMul) || 1);
        let r = Math.round(base * m.probMul);
        if (r < 1 && n >= 1) r = 1;   // 沿用 mochi icProb 的保底：原始概率 ≥1 时有效概率至少 1%
        return Math.max(0, Math.min(100, r));
    }
    function effCoolMs(s) { return Math.max(1, Math.round(CFG.COOL_MIN * freqMode(s).coolMul)) * 60000; }
    function effGateMs(s) { return Math.round(CFG.GATE_MIN * freqMode(s).gateMul) * 60000; }
    function deadlinePassed(s) {
        const dl = Number(s.settings.deadline) || 0;
        return dl > 0 && now() > dl;
    }
    function gateInfo(s) {
        s = s || load();
        const gateWait = Math.max(0, s.gateAt + effGateMs(s) - now());
        const coolWait = Math.max(0, s.lastAskAt + effCoolMs(s) - now());
        return { gateOpen: !host.isNight() && gateWait <= 0, gateWaitMs: gateWait, coolWaitMs: coolWait, night: !!host.isNight() };
    }
    /* 宿主在任何互动卡发出时调用：互动总闸跨所有互动卡共用 */
    function markGate() { const s = load(); s.gateAt = now(); save(s); }

    /* ---------------- 出题 ---------------- */
    function pickQuestion(s) {
        const st = s.settings;
        const pool = s.questions.filter(q => q && q.enabled !== false && q.text &&
            (st.useDefault !== false || !q.isPreset) &&
            !(q.isPreset === true && st.catOff && st.catOff[q.cat]));
        if (!pool.length) return null;
        return pool[Math.floor(rnd() * pool.length)];
    }
    function pushCard(s, q) {
        let ts = now(); while (s.cards[ts]) ts++;
        const isPick = (q.type === 'single' || q.type === 'multi') && Array.isArray(q.options) && q.options.length;
        const card = {
            ts: ts, qid: q.id, text: q.text, cat: q.cat,
            type: isPick ? q.type : 'text',
            options: isPick ? q.options.map(o => Object.assign({}, o)) : null,
            multiMax: (isPick && q.type === 'multi' && q.multiMax >= 2) ? q.multiMax : 0,
            status: 'pending'
        };
        s.cards[ts] = card;
        s.history.push({ q: q.text, qid: q.id, a: '', reply: '', ts: ts, status: 'pending' });
        s.lastAskAt = ts;
        s.gateAt = ts;
        save(s);
        try { host.onAskCard(card); } catch (e) {}
        return card;
    }
    /* tick：按 mochi maybeTriggerTAAsk 的顺序过闸，返回 {fired, card?, why?} */
    function tick() {
        const s = load();
        const st = s.settings;
        if (st.enabled === false) return { fired: false, why: 'disabled' };
        if (deadlinePassed(s)) return { fired: false, why: 'deadline' };
        if (now() - (s.lastAskAt || 0) < effCoolMs(s)) return { fired: false, why: 'cool' };
        if (host.isNight()) return { fired: false, why: 'night' };
        if (now() - (s.gateAt || 0) < effGateMs(s)) return { fired: false, why: 'gate' };
        if (rnd() * 100 >= (Number(st.dcf) === undefined ? 100 : Number(st.dcf))) return { fired: false, why: 'dcf' };
        if (rnd() * 100 >= effProb(s)) return { fired: false, why: 'prob' };
        const q = pickQuestion(s);
        if (!q) return { fired: false, why: 'empty' };
        const card = pushCard(s, q);
        return { fired: true, card: card };
    }
    /* 手动触发：跳过概率/冷却/总闸，只检查截止时间与题库（沿用 triggerTaAskNow） */
    function triggerNow() {
        const s = load();
        if (deadlinePassed(s)) return { fired: false, why: 'deadline' };
        const q = pickQuestion(s);
        if (!q) return { fired: false, why: 'empty' };
        const card = pushCard(s, q);
        return { fired: true, card: card };
    }
    /* 文本题才 roll 弹窗；选项题不等弹窗，等用户点卡片（沿用 pushAsk） */
    function shouldPopup(card) {
        if (!card || card.type !== 'text') return false;
        const s = load();
        const p = (typeof s.settings.popupProb === 'number') ? s.settings.popupProb : CFG.POPUP_PROB;
        return rnd() * 100 < p;
    }
    /* 后台弹窗排队：最多攒 POP_QUEUE_MAX 条，只保留最新（沿用 _pendingPops） */
    const popQueue = [];
    function queuePopup(card) {
        if (!card) return false;
        popQueue.push({ ts: card.ts, card: card, t: now() });
        while (popQueue.length > CFG.POP_QUEUE_MAX) popQueue.shift();
        return true;
    }
    function flushPops() {
        if (!popQueue.length) return null;
        const item = popQueue[popQueue.length - 1];
        popQueue.length = 0;
        return item.card;
    }

    /* ---------------- 回答 ---------------- */
    function repliesOf(opt) {
        const r = opt && opt.reply;
        if (Array.isArray(r)) return r.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
        if (typeof r === 'string') return r.split(';').map(x => x.trim()).filter(Boolean);
        return [];
    }
    function pickReply(arr) {
        if (!arr.length) return '';
        return arr[Math.floor(rnd() * arr.length)];
    }
    function mixWithCards(preset) {
        let words = [];
        try { words = host.customCards() || []; } catch (e) { words = []; }
        words = words.filter(x => typeof x === 'string' && x.trim());
        if (!words.length) return preset;
        if (rnd() * 100 >= CFG.MIX_PCT) return preset;
        const n = 1 + Math.floor(rnd() * Math.min(CFG.MIX_MAX, words.length));
        const copy = words.slice(), out = [];
        while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
        return out.join(' ');
    }
    function defaultReply() {
        return CFG.DEFAULT_REPLIES[Math.floor(rnd() * CFG.DEFAULT_REPLIES.length)];
    }
    function answerCard(ts, input) {
        const s = load();
        const card = s.cards[ts];
        if (!card) return { ok: false, why: 'not-found' };
        if (card.status === 'answered') return { ok: false, why: 'answered' };
        if (deadlinePassed(s)) return { ok: false, why: 'deadline' };
        let answer = '', preset = '', raw = false;
        if (typeof input === 'string') {
            if (card.type !== 'text') return { ok: false, why: 'type-mismatch' };
            answer = input.trim();
            if (!answer) return { ok: false, why: 'empty-answer' };
            if (s.settings.useChatReply && host.chatStyleReply) {
                try { const cr = host.chatStyleReply(); if (cr) { preset = cr; raw = true; } } catch (e) {}
            }
            if (!preset) preset = defaultReply();
        } else if (input && typeof input === 'object' && typeof input.option === 'string') {
            if (card.type !== 'single') return { ok: false, why: 'type-mismatch' };
            const opt = (card.options || []).find(o => String(o.t) === input.option);
            if (!opt) return { ok: false, why: 'bad-option' };
            answer = input.option;
            if (s.settings.useChatReply && host.chatStyleReply) {
                try { const cr = host.chatStyleReply(); if (cr) { preset = cr; raw = true; } } catch (e) {}
            }
            if (!preset) preset = pickReply(repliesOf(opt));
        } else if (input && typeof input === 'object' && Array.isArray(input.options)) {
            if (card.type !== 'multi') return { ok: false, why: 'type-mismatch' };
            if (!input.options.length) return { ok: false, why: 'empty-answer' };
            if (card.multiMax >= 2 && input.options.length > card.multiMax) return { ok: false, why: 'over-cap' };
            const chosen = [];
            for (const t of input.options) {
                const opt = (card.options || []).find(o => String(o.t) === t);
                if (!opt) return { ok: false, why: 'bad-option' };
                chosen.push(opt);
            }
            answer = input.options.join('、');
            const all = [];
            chosen.forEach(o => repliesOf(o).forEach(r => all.push(r)));
            if (s.settings.useChatReply && host.chatStyleReply) {
                try { const cr=host.chatStyleReply(); if(cr){preset=cr;raw=true;} } catch(e) {}
            }
            if (!preset) preset = pickReply(all);
        } else {
            return { ok: false, why: 'bad-input' };
        }
        let reply;
        if (raw) reply = preset;
        else if (preset) reply = mixWithCards(preset);
        else {
            let words = [];
            try { words = host.customCards() || []; } catch (e) {}
            words = words.filter(x => typeof x === 'string' && x.trim());
            reply = words.length ? words[Math.floor(rnd() * words.length)] : defaultReply();
        }
        card.status = 'answered';
        card.answer = answer;
        card.reply = reply;
        const rec = s.history.slice().reverse().find(h => h.ts === ts && h.status === 'pending');
        if (rec) { rec.a = answer; rec.reply = reply; rec.status = 'answered'; }
        else s.history.push({ q: card.text, qid: card.qid, a: answer, reply: reply, ts: ts, status: 'answered' });
        save(s);
        try { host.onChatOut(answer); } catch (e) {}
        try { host.onChatIn(reply); } catch (e) {}
        try { host.onAnswered(rec || { q: card.text, a: answer, reply: reply, ts: ts, status: 'answered' }, reply); } catch (e) {}
        return { ok: true, reply: reply, record: rec || null };
    }

    /* ---------------- 题库管理 ---------------- */
    function addQuestion(q) {
        if (!q || !q.text) return { ok: false, why: 'no-text' };
        const s = load();
        const nq = {
            id: q.id || ('k_' + now() + '_' + Math.floor(rnd() * 9999)),
            text: q.text, cat: q.cat || 'daily',
            type: (q.type === 'single' || q.type === 'multi') ? q.type : 'text',
            options: (q.type === 'single' || q.type === 'multi') && Array.isArray(q.options) ? q.options.map(o => Object.assign({}, o)) : undefined,
            multiMax: q.type === 'multi' && q.multiMax >= 2 ? q.multiMax : 0,
            enabled: q.enabled !== false, isPreset: false, grp: q.grp || null
        };
        s.questions.push(nq);
        save(s);
        return { ok: true, question: nq };
    }
    function removeQuestion(id) {
        const s = load();
        const q = s.questions.find(x => x && x.id === id);
        if (!q) return { ok: false, why: 'not-found' };
        if (q.isPreset) return { ok: false, why: 'preset' };   // 预设只能启停、不能删除
        s.questions = s.questions.filter(x => x.id !== id);
        save(s);
        return { ok: true };
    }
    function setQuestionEnabled(id, on) {
        const s = load();
        const q = s.questions.find(x => x && x.id === id);
        if (!q) return { ok: false, why: 'not-found' };
        q.enabled = !!on;
        save(s);
        return { ok: true };
    }
    function setCatOff(cat, off) {
        const s = load();
        s.settings.catOff[cat] = !!off;
        save(s);
        return { ok: true };
    }
    /* 导入预设题库（如 mochi-ask-bank.js）：替换全部现有预设题，自建题保留；
       导入的题 isPreset=true，只能启停、不能删除 */
    function importBank(arr) {
        const s = load();
        s.questions = s.questions.filter(q => !q.isPreset);
        (Array.isArray(arr) ? arr : []).forEach(q => {
            if (!q || !q.text) return;
            s.questions.push({
                id: q.id, text: q.text, cat: q.cat || 'daily',
                type: (q.type === 'single' || q.type === 'multi') ? q.type : 'text',
                options: (q.type === 'single' || q.type === 'multi') && Array.isArray(q.options) ? q.options.map(o => Object.assign({}, o)) : undefined,
                multiMax: q.type === 'multi' && q.multiMax >= 2 ? q.multiMax : 0,
                enabled: q.enabled !== false, isPreset: true
            });
        });
        save(s);
        return s.questions.length;
    }
    function configure(patch) {
        const s = load();
        Object.assign(s.settings, patch || {});
        save(s);
        return s.settings;
    }
    function setDeadline(tsMs) {
        const s = load();
        s.settings.deadline = tsMs > 0 ? tsMs : 0;
        save(s);
        return s.settings.deadline;
    }

    /* ---------------- 调度 ---------------- */
    let timer1 = null, timer2 = null;
    function start() {
        stop();
        timer1 = setTimeout(function () { tick(); timer2 = setInterval(tick, CFG.TICK_MS); }, CFG.FIRST_MS);
    }
    function stop() {
        if (timer1) clearTimeout(timer1);
        if (timer2) clearInterval(timer2);
        timer1 = timer2 = null;
    }

    function init(opts) {
        opts = opts || {};
        Object.keys(opts).forEach(k => { if (opts[k] !== undefined) host[k] = opts[k]; });
        if (opts.store) host.store = opts.store;
        return true;
    }
    const api = {
        init: init, config: CFG, cats: CATS, freqModes: FREQ_MODES,
        start: start, stop: stop, tick: tick, triggerNow: triggerNow,
        shouldPopup: shouldPopup, queuePopup: queuePopup, flushPops: flushPops,
        answerCard: answerCard, markGate: markGate, gateInfo: () => gateInfo(),
        addQuestion: addQuestion, removeQuestion: removeQuestion,
        setQuestionEnabled: setQuestionEnabled, setCatOff: setCatOff,
        importBank: importBank,
        configure: configure, setDeadline: setDeadline,
        questions: () => load().questions, history: () => load().history,
        pendingCards: () => Object.keys(load().cards).filter(ts => load().cards[ts].status === 'pending').map(ts => load().cards[ts]),
        settings: () => load().settings,
        _load: load, _save: save, _effProb: (s) => effProb(s || load())
    };
    global.AskCore = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
