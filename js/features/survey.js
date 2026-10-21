/* 本地问卷：按当前会话保存，不向服务器发送数据。 */
(() => {
    'use strict';
    const trigger = document.getElementById('survey-btn');
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
    document.head.append(style);
    let items = [], storageKey = '';
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
        frame('测一测', () => dialog.close());
        const newButton = button('＋ 新建问卷', create); newButton.className = 'survey-new'; dialog.append(newButton);
        dialog.append(el('h3', '历史问卷', 'survey-section'));
        if (!items.length) dialog.append(el('p', '还没有问卷，来创建第一份吧', 'survey-empty'));
        [...items].reverse().forEach(item => {
            const card = el('article', undefined, 'survey-history');
            const open = button('', () => item.responses.length ? results(item) : fill(item)); open.className = 'survey-open';
            open.append(el('strong', item.title), el('p', `${item.questions.length} 道题 · ${item.responses.length ? '已回答' : '待回答'}`, 'survey-muted'));
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
            const hint = el('p', '填写时可自由输入文字回答', 'survey-muted'); hint.hidden = true;
            [['single','单选'],['multiple','多选'],['text','文字']].forEach(([value, text]) => {
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
        const footer = el('div', undefined, 'survey-actions'), submit = el('button', '完成创建', 'primary'); submit.type = 'submit';
        footer.append(button('取消', list), submit); form.append(addQuestion, footer);
        form.addEventListener('submit', event => {
            event.preventDefault();
            const questions = rows.map(row => ({ text: row.question.value.trim(), type: row.type, options: row.type === 'text' ? [] : row.options.map(x => x.input.value.trim()) }));
            if (!title.value.trim() || !questions.length || questions.some(q => !q.text || (q.type !== 'text' && (q.options.some(x => !x) || new Set(q.options).size !== q.options.length)))) { error('请填写完整内容，选项不能留空或重复。'); return; }
            if (save([...items, { id: crypto.randomUUID(), title: title.value.trim(), questions, responses: [] }])) list();
        });
    }
    function fill(item) {
        frame(item.title); const form = el('form'); dialog.append(form);
        dialog.append(el('p', '所有题目均为必填，可多次填写。', 'survey-muted'));
        const controls = item.questions.map((q, index) => {
            const box = el('fieldset'); box.append(el('legend', `${index + 1}. ${q.text}`)); form.append(box);
            if (q.type === 'text') { const input = field(box, '你的回答', 'textarea'); input.required = true; input.maxLength = 5000; return () => input.value.trim(); }
            const inputs = q.options.map(option => { const label = el('label', undefined, 'survey-choice'), input = el('input'); input.type = q.type === 'single' ? 'radio' : 'checkbox'; input.name = `question-${index}`; input.value = option; label.append(input, document.createTextNode(` ${option}`)); box.append(label); return input; });
            return () => inputs.filter(input => input.checked).map(input => input.value);
        });
        const submit = el('button', '提交回答', 'primary'); submit.type = 'submit'; const footer = el('div', undefined, 'survey-actions'); footer.append(button('取消', list), submit); form.append(footer);
        form.addEventListener('submit', event => {
            event.preventDefault(); const answers = controls.map(read => read());
            if (answers.some(a => !a.length)) { error('请回答全部题目后再提交。'); return; }
            const updated = { ...item, responses: [...item.responses, { time: new Date().toISOString(), answers }] };
            if (save(items.map(x => x.id === item.id ? updated : x))) results(updated);
        });
    }
    function results(item) {
        frame(`${item.title} · 结果`); dialog.append(el('p', `共 ${item.responses.length} 份回答`, 'survey-muted'));
        item.questions.forEach((q, index) => {
            const box = el('article'); box.append(el('strong', `${index + 1}. ${q.text}`));
            if (q.type === 'text') item.responses.forEach((r, i) => box.append(el('p', `${i + 1}. ${r.answers[index]}`)));
            else q.options.forEach(option => { const count = item.responses.filter(r => r.answers[index].includes(option)).length; box.append(el('p', `${option}：${count} 票（${item.responses.length ? Math.round(count / item.responses.length * 100) : 0}%）`)); });
            if (!item.responses.length) box.append(el('p', '暂无回答', 'survey-muted')); dialog.append(box);
        }); actions(button('返回列表', list), button('再次填写', () => fill(item), true));
    }
    trigger.addEventListener('click', () => {
        storageKey = `chuanxun-surveys-v1:${typeof SESSION_ID !== 'undefined' && SESSION_ID ? SESSION_ID : 'default'}`;
        dialog.showModal();
        try {
            const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
            if (!Array.isArray(stored) || stored.some(x => !x || !Array.isArray(x.questions) || !Array.isArray(x.responses))) throw new Error('Invalid survey data');
            items = stored; list();
        } catch { frame('问卷调查'); error('无法读取已保存的问卷。请检查浏览器存储设置；原有数据未被覆盖。'); }
    });
    dialog.addEventListener('close', () => trigger.focus());
})();
