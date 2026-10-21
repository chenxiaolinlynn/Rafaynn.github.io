/* 本地问卷：按当前会话保存，不向服务器发送数据。
   2026-10-21 改版：作答引擎移植 mochi 批量问卷逻辑——逐题作答（常规 30 秒一题、首答延迟 15 秒）、
   提前交卷概率（每节奏点 10%）、多选上限（最多 3 个）、文字题多卡拼接（1–5 条）；
   新增可选「最晚交卷」期限（到期强制交卷）。旧版 dueAt 数据加载时自动迁移为逐题进度。
   表单出题 / 历史复用 / 刷新恢复 / 聊天幂等同步等原有机制保持不变。 */
(() => {
    'use strict';
    const trigger = document.getElementById('survey-btn');
    if (!trigger) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'survey-dialog';
    dialog.setAttribute('aria-labelledby', 'survey-heading');
    document.body.append(dialog);
    const style = document.createElement('style');
    style.textContent = `
#survey-btn{background:var(--toolbar-btn-bg,var(--message-received-bg));color:var(--toolbar-btn-color,var(--text-secondary))}
#survey-dialog{box-sizing:border-box;width:min(600px,calc(100% - 32px));height:min(780px,90dvh);max-height:90dvh;margin:auto;padding:0 24px 28px;border:1px solid var(--border-color);border-radius:24px;background:var(--primary-bg);color:var(--text-primary);overflow:auto;font-family:inherit;font-size:15px;line-height:1.6}
#survey-dialog::backdrop{background:rgba(0,0,0,.35);backdrop-filter:blur(3px)}
#survey-dialog *{box-sizing:border-box}#survey-dialog [hidden]{display:none!important}
#survey-dialog header{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:40px 1fr 40px;align-items:center;margin:0 -24px 24px;padding:18px 20px;background:var(--secondary-bg);border-bottom:1px solid var(--border-color)}
#survey-dialog h2{font-size:18px;font-weight:500;text-align:center;margin:0;overflow-wrap:anywhere}
#survey-dialog button{font:inherit;cursor:pointer;border:0;background:transparent;color:var(--text-secondary);padding:10px 14px;border-radius:14px}
#survey-dialog button:focus-visible,#survey-dialog input:focus-visible,#survey-dialog textarea:focus-visible{outline:2px solid var(--accent-color);outline-offset:3px}
#survey-dialog .survey-back{font-size:26px;padding:0;width:40px;height:40px}
#survey-dialog .primary,#survey-dialog .survey-type[aria-pressed=true]{background:var(--accent-color);color:var(--message-sent-text)}
#survey-dialog .survey-new{display:block;width:100%;padding:23px;background:var(--secondary-bg);color:var(--accent-color);font-size:18px;border-radius:20px;box-shadow:0 2px 7px rgba(0,0,0,.04);border:1px solid var(--border-color)}
#survey-dialog .survey-section{margin:24px 0 14px;color:var(--text-secondary);font-size:13px;font-weight:400}
#survey-dialog article,#survey-dialog fieldset,#survey-dialog .survey-title-card{min-width:0;margin:0 0 16px;padding:22px;background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:20px;box-shadow:0 2px 6px rgba(0,0,0,.035)}
#survey-dialog .survey-history{position:relative;padding:0;overflow:hidden}
#survey-dialog .survey-open{display:block;text-align:left;width:100%;padding:22px 54px 22px 22px;color:var(--text-primary)}
#survey-dialog .survey-open strong{display:block;font-size:16px;font-weight:500;overflow-wrap:anywhere}
#survey-dialog .survey-trash{position:absolute;right:12px;top:17px;padding:8px;color:var(--text-secondary)}
#survey-dialog .survey-trash svg{width:18px;height:18px;display:block}
#survey-dialog p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;margin:10px 0 0}
#survey-dialog .survey-muted{color:var(--text-secondary);font-size:13px}
#survey-dialog .survey-preview{font-size:14px;color:var(--text-secondary)}#survey-dialog .survey-answer{color:var(--accent-color)}
#survey-dialog label{display:block;color:var(--text-secondary);font-size:13px}
#survey-dialog input:not([type=radio]):not([type=checkbox]),#survey-dialog textarea{display:block;width:100%;min-width:0;padding:12px 15px;border:1px solid var(--border-color);border-radius:15px;background:var(--primary-bg);color:var(--text-primary);font:inherit;font-size:16px;margin:8px 0 0}
#survey-dialog input::placeholder,#survey-dialog textarea::placeholder{color:var(--text-secondary);opacity:.55}
#survey-dialog textarea{resize:vertical;min-height:85px}
#survey-dialog .survey-question-head{display:flex;align-items:flex-start;gap:10px}
#survey-dialog .survey-number{color:var(--accent-color);padding-top:10px;font-size:17px}
#survey-dialog .survey-question-head textarea{background:transparent;border:0;margin:0;padding:8px 0;min-height:60px;resize:vertical;flex:1}
#survey-dialog .survey-remove{padding:6px;font-size:20px}
#survey-dialog .survey-types{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
#survey-dialog .survey-type{padding:5px 14px;background:var(--primary-bg);border-radius:99px;font-size:13px}
#survey-dialog .survey-option{display:flex;align-items:center;gap:10px;margin-top:10px}
#survey-dialog .survey-option input{margin:0!important;flex:1}#survey-dialog .survey-option span{color:var(--text-secondary);font-size:13px}
#survey-dialog .survey-add-option{color:var(--accent-color);padding:12px 0 0}
#survey-dialog .survey-add-question{width:100%;border:1px dashed var(--border-color);padding:15px;margin:0 0 20px}
#survey-dialog .survey-actions{display:flex;gap:12px;margin-top:20px}#survey-dialog .survey-actions>button{flex:1;padding:14px}
#survey-dialog .survey-choice{padding:13px;margin-top:10px;border:1px solid var(--border-color);border-radius:14px;font-size:15px;color:var(--text-primary);background:var(--primary-bg)}
#survey-dialog .survey-choice:has(input:checked){border-color:var(--accent-color)}#survey-dialog input[type=radio],#survey-dialog input[type=checkbox]{accent-color:var(--accent-color);margin-right:8px}
#survey-dialog legend{max-width:100%;overflow-wrap:anywhere;font-size:15px}#survey-dialog .survey-error{color:var(--text-primary);border-left:3px solid var(--accent-color);padding:12px}
#survey-dialog .survey-empty{text-align:center;color:var(--text-secondary);padding:45px 12px;font-size:14px}
@media(max-width:600px){#survey-dialog{width:100%;height:100dvh;max-height:100dvh;max-width:100%;border:0;border-radius:0;padding:0 18px max(24px,env(safe-area-inset-bottom))}#survey-dialog header{margin:0 -18px 20px;padding-top:max(14px,env(safe-area-inset-top))}#survey-dialog article,#survey-dialog fieldset,#survey-dialog .survey-title-card{padding:18px}#survey-dialog .survey-history{padding:0}}
`;
    style.textContent += `
.survey-chat-card{min-width:160px;max-width:290px;padding:12px 6px;color:inherit}.survey-chat-card small{display:block;letter-spacing:3px;opacity:.65;font-size:10px}.survey-chat-card h3{font-size:20px;margin:14px 0}.survey-chat-question{margin:10px 0;padding:10px;border-radius:12px;background:rgba(128,128,128,.08);white-space:normal;overflow-wrap:anywhere}.survey-chat-status{margin-top:16px;padding-top:12px;border-top:1px solid currentColor;font-size:12px;opacity:.8}
.message:has(.survey-chat-card){background:var(--secondary-bg)!important;color:var(--text-primary)!important;border:1px solid var(--border-color);border-radius:22px!important}
#survey-dialog select{display:block;width:100%;margin:8px 0 0;padding:12px 15px;border:1px solid var(--border-color);border-radius:15px;background:var(--primary-bg);color:var(--text-primary);font:inherit;font-size:16px}
`;
    document.head.append(style);
    let items = [], storageKey = '', view = '';
    const timers = new Map();
    // ===== 作答引擎参数（移植 mochi 批量问卷逻辑，可按手感调整）=====
    const SURVEY_FIRST_DELAY = 15000;  // 发出后先"装忙"，15 秒内不开始答
    const SURVEY_TICK = 30000;         // 常规节奏：每 30 秒答一题
    const SURVEY_STEP_MIN = 1200;      // 提前交卷/到期收尾时逐题间隔下限（毫秒）
    const SURVEY_STEP_MAX = 2800;      // 提前交卷/到期收尾时逐题间隔上限（毫秒）
    const SURVEY_EARLY_PROB = 10;      // 每个节奏点掷一次"提前交卷"的概率（%）
    const SURVEY_MULTI_MAX = 3;        // 多选最多选几个
    function el(tag, text, cls) {
        const node = document.createElement(tag);
        if (text !== undefined) node.textContent = text;
        if (cls) node.className = cls;
        return node;
    }
    function button(text, action, primary = false) {
        const node = el('button', text, primary ? 'primary' : '');
        node.type = 'button'; node.addEventListener('click', action); return node;
    }
    function frame(title, back = list) {
        view = '';
        dialog.replaceChildren();
        const header = el('header'), heading = el('h2', title); heading.id = 'survey-heading';
        const arrow = button('←', back); arrow.className = 'survey-back'; arrow.setAttribute('aria-label', back === list ? '返回问卷列表' : '关闭问卷');
        header.append(arrow, heading, el('span')); dialog.append(header); dialog.scrollTop = 0;
    }
    function error(message) {
        dialog.querySelector('.survey-error')?.remove();
        const node = el('p', message, 'survey-error'); node.setAttribute('role', 'alert'); dialog.append(node);
    }
    function save(next) {
        try { localStorage.setItem(storageKey, JSON.stringify(next)); items = next; return true; }
        catch { error('保存失败，浏览器存储空间可能不足。请保留当前内容后重试。'); return false; }
    }
    function actions(...nodes) { const row = el('div', undefined, 'survey-actions'); row.append(...nodes); dialog.append(row); }
    function list() {
        frame('测一测', () => dialog.close()); view = 'list';
        const newButton = button('＋ 新建问卷', create); newButton.className = 'survey-new'; dialog.append(newButton);
        dialog.append(el('h3', '历史问卷', 'survey-section'));
        if (!items.length) dialog.append(el('p', '还没有问卷，来创建第一份吧', 'survey-empty'));
        [...items].reverse().forEach(item => {
            const card = el('article', undefined, 'survey-history');
            const open = button('', () => item.progress || !item.responses.length ? pending(item) : results(item)); open.className = 'survey-open';
            open.append(el('strong', item.title), el('p', `${item.questions.length} 道题 · ${item.progress ? `对方正在回答 ${item.progress.answers.length}/${item.questions.length}` : item.responses.length ? '已回答' : '待邀请'}`, 'survey-muted'));
            const latest = item.responses[item.responses.length - 1];
            if (latest) item.questions.slice(0, 2).forEach((q, index) => {
                const preview = el('p', `${index + 1}. ${q.text}  `, 'survey-preview');
                const answer = latest.answers[index]; preview.append(el('span', Array.isArray(answer) ? answer.join('、') : answer, 'survey-answer')); open.append(preview);
            });
            const remove = button('', () => {
                frame('删除问卷'); dialog.append(el('p', `确定删除“${item.title}”及全部回答吗？`));
                actions(button('取消', list), button('确定删除', () => { if (save(items.filter(x => x.id !== item.id))) list(); }, true));
            });
            remove.className = 'survey-trash'; remove.setAttribute('aria-label', `删除问卷：${item.title}`);
            remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
            card.append(open, remove); dialog.append(card);
        });
    }
    function field(parent, caption, tag = 'input') {
        const label = el('label', caption), input = el(tag); label.append(input); parent.append(label); return input;
    }
    function create() {
        frame('测一测');
        const form = el('form'); dialog.append(form);
        const titleCard = el('div', undefined, 'survey-title-card'); form.append(titleCard);
        const title = field(titleCard, '问卷标题'); title.value = '测一测'; title.required = true; title.maxLength = 100;
        const cfgCard = el('div', undefined, 'survey-title-card'); form.append(cfgCard);
        const deadline = field(cfgCard, '最晚交卷（可选，到期自动交卷）', 'select');
        [['0', '不设期限'], ['1', '1 分钟内'], ['5', '5 分钟内'], ['15', '15 分钟内'], ['60', '60 分钟内']].forEach(([v, t]) => { const o = el('option', t); o.value = v; deadline.append(o); });
        const questionBox = el('div'); form.append(questionBox);
        const rows = [];
        function renumber() { rows.forEach((row, index) => { row.number.textContent = `${index + 1}.`; row.question.setAttribute('aria-label', `第${index + 1}题`); row.remove.hidden = rows.length === 1; }); }
        function add() {
            const box = el('article'), head = el('div', undefined, 'survey-question-head');
            const number = el('span', '', 'survey-number'), question = el('textarea'); question.placeholder = '输入问题…'; question.required = true; question.maxLength = 300; question.rows = 2;
            const row = { box, question, number, type: 'single', options: [] };
            const remove = button('×', () => { rows.splice(rows.indexOf(row), 1); box.remove(); renumber(); }); remove.className = 'survey-remove'; remove.setAttribute('aria-label', '移除题目'); row.remove = remove;
            head.append(number, question, remove); box.append(head);
            const types = el('div', undefined, 'survey-types'), optionsBox = el('div');
            const hint = el('p', '对方将从当前可用字卡中抽取回答', 'survey-muted'); hint.hidden = true;
            [['single','单选'],['multiple','多选'],['text','问字卡']].forEach(([value, text]) => {
                const tab = button(text, () => { row.type = value; optionsBox.hidden = value === 'text'; hint.hidden = value !== 'text'; row.options.forEach(x => x.input.required = value !== 'text'); [...types.children].forEach(node => node.setAttribute('aria-pressed', String(node === tab))); });
                tab.className = 'survey-type'; tab.setAttribute('aria-pressed', String(value === row.type)); types.append(tab);
            });
            const optionList = el('div'); optionsBox.append(optionList);
            function numberOptions() { row.options.forEach((option, i) => { const letter = String.fromCharCode(65 + i); option.label.textContent = letter; option.input.placeholder = `选项 ${letter}`; option.input.setAttribute('aria-label', `选项 ${letter}`); option.remove.hidden = row.options.length <= 2; }); }
            function addOption() {
                if (row.options.length >= 26) return;
                const line = el('div', undefined, 'survey-option'), label = el('span'), input = el('input'); input.required = row.type !== 'text'; input.maxLength = 200;
                const option = { input, label };
                const removeOption = button('×', () => { row.options.splice(row.options.indexOf(option), 1); line.remove(); numberOptions(); }); removeOption.setAttribute('aria-label', '删除选项'); option.remove = removeOption;
                line.append(label, input, removeOption); row.options.push(option); optionList.append(line); numberOptions();
            }
            const addOptionButton = button('＋ 添加选项', addOption); addOptionButton.className = 'survey-add-option'; optionsBox.append(addOptionButton);
            addOption(); addOption(); box.append(types, optionsBox, hint); rows.push(row); questionBox.append(box); renumber();
        }
        add();
        const addQuestion = button('＋ 添加一题', add); addQuestion.className = 'survey-add-question';
        const footer = el('div', undefined, 'survey-actions'), submit = el('button', '邀请对方回答', 'primary'); submit.type = 'submit';
        footer.append(button('取消', list), submit); form.append(addQuestion, footer);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const questions = rows.map(row => ({ text: row.question.value.trim(), type: row.type, options: row.type === 'text' ? [] : row.options.map(x => x.input.value.trim()) }));
            if (!title.value.trim() || !questions.length || questions.some(q => !q.text || (q.type !== 'text' && (q.options.some(x => !x) || new Set(q.options).size !== q.options.length)))) { error('请填写完整内容，选项不能留空或重复。'); return; }
            const item = { id: crypto.randomUUID(), title: title.value.trim(), questions, responses: [], deadlineMinutes: Number(deadline.value) || 0 };
            invite(item, true);
        });
    }
    function availableCards() {
        const all = typeof customReplies !== 'undefined' && Array.isArray(customReplies) ? customReplies : [];
        const disabled = new Set(JSON.parse(localStorage.getItem('disabledReplyItems') || '[]'));
        (window.customReplyGroups || []).filter(g => g.disabled).forEach(g => (g.items || []).forEach(x => disabled.add(x)));
        return all.filter(x => !disabled.has(x)).map(String).map(x => x.trim()).filter(Boolean);
    }
    async function invite(item, isNew = false) {
        let cards = [];
        try { if (item.questions.some(q => q.type === 'text')) cards = availableCards(); }
        catch { error('无法读取字卡库，请检查字卡设置。'); return; }
        if (item.questions.some(q => q.type === 'text') && !cards.length) { error('问字卡需要可用的字卡内容，请先添加字卡，或改为单选、多选。'); return; }
        if (item.progress) { error('对方正在回答这份问卷，等交卷后可再次邀请。'); return; }
        const config = typeof settings !== 'undefined' ? settings : {};
        if (typeof SESSION_ID === 'undefined' || !SESSION_ID) { error('聊天正在加载，请稍后再邀请。'); return; }
        const chat = { session: SESSION_ID, invitationId: 'survey-invite-' + crypto.randomUUID(), replyId: 'survey-answer-' + crypto.randomUUID(), sentAt: new Date().toISOString() };
        const now = Date.now();
        const next = { ...item, chat, partnerName: config.partnerName || '对方', cards, progress: { answers: [], nextAt: now + SURVEY_FIRST_DELAY, finishing: false, deadlineAt: item.deadlineMinutes ? now + item.deadlineMinutes * 60000 : 0 } };
        delete next.dueAt;
        if (save(isNew ? [...items, next] : items.map(x => x.id === item.id ? next : x))) {
            const key = storageKey;
            try { await syncChat(next); dialog.close(); }
            catch { error('问卷已保存，但聊天消息保存失败，重新打开问卷可重试。'); }
            schedule(next, key);
        }
    }
    function pending(item) {
        frame(item.title); view = item.id;
        dialog.append(el('p', item.progress ? `${item.partnerName || '对方'}正在回答 · 已答 ${item.progress.answers.length}/${item.questions.length} 题，交卷后会显示全部答案。` : '问卷已准备好，邀请对方来回答吧。', 'survey-muted'));
        item.questions.forEach((q, index) => {
            const card = el('article'); card.append(el('strong', `${index + 1}. ${q.text}`));
            q.options.forEach((option, i) => card.append(el('p', `${String.fromCharCode(65 + i)}. ${option}`, 'survey-muted'))); dialog.append(card);
        });
        actions(button('返回列表', list));
        if (!item.progress) actions(button('邀请对方回答', () => invite(item), true));
    }
    function pickMulti(options, random = Math.random) {
        // mochi 逻辑：多选有上限（默认最多 3 个），无放回抽 1..上限 个，至少选 1 个
        const max = Math.max(1, Math.min(SURVEY_MULTI_MAX, options.length));
        const n = 1 + Math.floor(random() * max);
        const pool = options.slice(); const out = [];
        while (out.length < n && pool.length) out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
        return out;
    }
    function chooseAnswer(q, cards, random = Math.random) {
        if (!q) return '';
        if (q.type === 'text') {
            // mochi 逻辑：从字卡池无放回抽 1–5 条拼成一句，而不是只抽一整句
            if (!cards.length) return '……';
            const pool = cards.slice();
            const n = 1 + Math.floor(random() * Math.min(5, pool.length));
            const parts = [];
            while (parts.length < n && pool.length) parts.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
            return parts.join(' ');
        }
        if (q.type === 'single') return [q.options[Math.floor(random() * q.options.length)]];
        return pickMulti(q.options, random);
    }
    function schedule(item, key) {
        if (!item) return;
        // 旧版数据迁移：整份一次等待（dueAt）转为逐题进度（progress），按原到期时间给出第一题
        if (item.dueAt && !item.progress) {
            try {
                const stored0 = JSON.parse(localStorage.getItem(key) || '[]');
                const cur0 = stored0.find(x => x.id === item.id);
                if (cur0 && cur0.dueAt && !cur0.progress) {
                    cur0.progress = { answers: [], nextAt: cur0.dueAt, finishing: false, deadlineAt: 0 };
                    delete cur0.dueAt;
                    localStorage.setItem(key, JSON.stringify(stored0));
                    if (storageKey === key) items = stored0;
                    item = cur0;
                }
            } catch { /* 迁移失败则按无进行中处理 */ }
        }
        if (!item.progress) return;
        const token = key + ':' + item.id;
        if (timers.has(token)) return;
        const step = async () => {
            // Keep ownership while asynchronous chat persistence is running.
            timers.set(token, null);
            try {
                const stored = JSON.parse(localStorage.getItem(key) || '[]');
                const current = stored.find(x => x.id === item.id);
                if (!current || !current.progress) return;
                const prog = current.progress;
                const total = current.questions.length;
                const now = Date.now();
                const deadlineHit = prog.deadlineAt > 0 && now >= prog.deadlineAt;
                if (prog.answers.length < total && !deadlineHit && now < (prog.nextAt || 0)) {
                    // 还没到下一题的时间：睡到下一题或期限（先到者）再醒
                    let wait = (prog.nextAt || 0) - now;
                    if (prog.deadlineAt > 0) wait = Math.min(wait, Math.max(0, prog.deadlineAt - now));
                    timers.set(token, setTimeout(step, Math.max(0, wait)));
                    return;
                }
                // A deadline completes all remaining questions at this wake-up.
                // Background tabs may wake late; they complete as soon as execution resumes.
                if (deadlineHit) {
                    while (prog.answers.length < total) {
                        prog.answers.push(chooseAnswer(current.questions[prog.answers.length], current.cards || []));
                    }
                }
                if (prog.answers.length < total) {
                    // mochi 逻辑：每个节奏点掷一次"提前交卷"，中了就进入收尾节奏
                    if (!prog.finishing && !deadlineHit && Math.random() * 100 < SURVEY_EARLY_PROB) prog.finishing = true;
                    prog.answers.push(chooseAnswer(current.questions[prog.answers.length], current.cards || []));
                    if (prog.answers.length < total) {
                        const gap = (prog.finishing || deadlineHit)
                            ? SURVEY_STEP_MIN + Math.floor(Math.random() * (SURVEY_STEP_MAX - SURVEY_STEP_MIN))
                            : SURVEY_TICK;
                        prog.nextAt = Date.now() + gap;
                        localStorage.setItem(key, JSON.stringify(stored));
                        if (storageKey === key) items = stored;
                        await syncChat(current); // 聊天里的问卷卡同步刷新"已答 n/N"
                        if (storageKey === key && dialog.open && view === current.id) pending(current);
                        else if (storageKey === key && dialog.open && view === 'list') list();
                        const wakeAt = prog.deadlineAt > 0 ? Math.min(prog.nextAt, prog.deadlineAt) : prog.nextAt;
                        timers.set(token, setTimeout(step, Math.max(0, wakeAt - Date.now())));
                        return;
                    }
                }
                // 交卷：落一份完整回答，沿用原有幂等同步发答案消息
                const updated = { ...current, progress: null, responses: [...current.responses, { time: new Date().toISOString(), sender: 'partner', chatId: current.chat?.invitationId, answers: prog.answers.slice() }] };
                delete updated.cards;
                const next = stored.map(x => x.id === updated.id ? updated : x);
                localStorage.setItem(key, JSON.stringify(next));
                await syncChat(updated);
                if (storageKey === key) {
                    items = next;
                    if (dialog.open && view === updated.id) results(updated);
                    else if (dialog.open && view === 'list') list();
                }
            } catch { if (storageKey === key && dialog.open) error('回答保存失败，请重新打开问卷重试。'); }
            finally { if (timers.get(token) === null) timers.delete(token); }
        };
        timers.set(token, setTimeout(step, 0));
    }
    function invitationMessage(item, answered) {
        const card = el('div', undefined, 'survey-chat-card');
        card.append(el('small', 'QUIZ'), el('h3', item.title));
        item.questions.forEach((q, index) => card.append(el('div', `${index + 1}. ${q.text}`, 'survey-chat-question')));
        card.append(el('div', answered ? '● 对方已回答' : item.progress ? `○ 正在回答 · 已答 ${item.progress.answers.length}/${item.questions.length} 题` : '○ 等待对方回答', 'survey-chat-status'));
        return { id: item.chat.invitationId, sender: 'user', type: 'survey-invitation', text: card.outerHTML, timestamp: new Date(item.chat.sentAt), status: answered ? 'read' : 'sent', favorited: false };
    }
    function answerMessage(item, response) {
        // Existing chat renderer accepts HTML: encode user content before passing it in.
        const text = response.answers.map((answer, index) => `${index + 1}. ${Array.isArray(answer) ? answer.join('、') : answer}`).join('\n');
        const safe = el('div', text);
        return { id: item.chat.replyId, sender: 'partner', type: 'survey-answer', text: safe.innerHTML, timestamp: new Date(response.time), status: 'received', favorited: false };
    }
    async function syncChat(item) {
        if (!item.chat) return;
        const response = item.responses.find(r => r.chatId === item.chat.invitationId);
        if (item.chat.completed) return;
        const invitation = invitationMessage(item, !!response);
        const targetKey = `${APP_PREFIX}${item.chat.session}_chatMessages`;
        if (typeof SESSION_ID !== 'undefined' && SESSION_ID === item.chat.session) {
            const previous = messages.find(m => m.id === invitation.id);
            if (previous) { previous.text = invitation.text; previous.status = invitation.status; }
            else if (!item.chat.invitationSent) addMessage(invitation);
            if (response && !messages.some(m => m.id === item.chat.replyId)) addMessage(answerMessage(item, response));
            renderMessages(true);
            await localforage.setItem(targetKey, messages);
        } else {
            const saved = await localforage.getItem(targetKey) || [];
            const previous = saved.find(m => m.id === invitation.id);
            if (previous) Object.assign(previous, invitation);
            else if (!item.chat.invitationSent) saved.push(invitation);
            if (response && !saved.some(m => m.id === item.chat.replyId)) saved.push(answerMessage(item, response));
            await localforage.setItem(targetKey, saved);
        }
        item.chat.invitationSent = true;
        if (response) item.chat.completed = true;
        const key = `chuanxun-surveys-v1:${item.chat.session}`;
        const stored = JSON.parse(localStorage.getItem(key) || '[]');
        const latest = stored.find(x => x.id === item.id);
        if (latest?.chat?.invitationId === item.chat.invitationId) {
            latest.chat = item.chat; localStorage.setItem(key, JSON.stringify(stored));
        }
    }
    async function restoreChats() {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key?.startsWith('chuanxun-surveys-v1:')) continue;
            try {
                const records = JSON.parse(localStorage.getItem(key) || '[]');
                for (const item of records) { await syncChat(item); schedule(item, key); }
            } catch (e) { console.warn('恢复问卷消息失败', e); }
        }
    }
    // Resume unfinished invitations after normal chat data has finished loading.
    const resumeTimer = setInterval(() => {
        const welcome = document.getElementById('welcome-animation');
        if (typeof SESSION_ID === 'undefined' || !SESSION_ID || (welcome && welcome.style.display !== 'none')) return;
        clearInterval(resumeTimer); restoreChats();
    }, 1000);
    function results(item) {
        frame(`${item.title} · 对方的回答`); view = item.id; dialog.append(el('p', `${item.partnerName || '对方'}已完成回答`, 'survey-muted'));
        item.questions.forEach((q, index) => {
            const box = el('article'); box.append(el('strong', `${index + 1}. ${q.text}`));
            if (q.type === 'text') item.responses.forEach((r, i) => box.append(el('p', `${i + 1}. ${r.answers[index]}`)));
            else { const answer = item.responses[item.responses.length - 1]?.answers[index] || []; q.options.forEach((option, i) => box.append(el('p', `${answer.includes(option) ? '✓ ' : ''}${String.fromCharCode(65 + i)}. ${option}`, answer.includes(option) ? 'survey-answer' : 'survey-muted'))); }
            if (!item.responses.length) box.append(el('p', '暂无回答', 'survey-muted')); dialog.append(box);
        }); actions(button('返回列表', list), button('再次邀请', () => invite(item), true));
    }
    trigger.addEventListener('click', () => {
        storageKey = `chuanxun-surveys-v1:${typeof SESSION_ID !== 'undefined' && SESSION_ID ? SESSION_ID : 'default'}`;
        dialog.showModal();
        try {
            const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (!Array.isArray(stored) || stored.some(x => !x || !Array.isArray(x.questions) || !Array.isArray(x.responses))) throw new Error('Invalid survey data');
            items = stored; list(); items.forEach(item => { syncChat(item).catch(e => console.warn('问卷消息保存失败', e)); schedule(item, storageKey); });
        } catch { frame('问卷调查'); error('无法读取已保存的问卷。请检查浏览器存储设置；原有数据未被覆盖。'); }
    });
    dialog.addEventListener('close', () => trigger.focus());
})();
