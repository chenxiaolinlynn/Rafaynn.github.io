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
#survey-dialog{box-sizing:border-box;width:min(560px,calc(100% - 24px));max-height:85dvh;margin:auto;padding:24px;border:1px solid var(--border-color);border-radius:22px;background:var(--secondary-bg);color:var(--text-primary);overflow:auto}
#survey-dialog::backdrop{background:rgba(0,0,0,.35)}
#survey-dialog *{box-sizing:border-box}#survey-dialog h2{font-size:20px;margin:0}#survey-dialog header,#survey-dialog .survey-actions{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:18px}#survey-dialog .survey-actions{margin-top:18px;flex-wrap:wrap;justify-content:flex-start}
#survey-dialog button{padding:9px 14px;border-radius:12px;border:1px solid var(--border-color);background:var(--primary-bg);color:var(--text-primary);cursor:pointer;font:inherit}
#survey-dialog button.primary{background:var(--accent-color);color:var(--message-sent-text);border-color:transparent}
#survey-dialog input:not([type=radio]):not([type=checkbox]),#survey-dialog textarea,#survey-dialog select{display:block;width:100%;padding:10px;margin:7px 0 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--primary-bg);color:var(--text-primary);font:inherit}
#survey-dialog textarea{min-height:80px;resize:vertical}#survey-dialog fieldset,#survey-dialog article{min-width:0;border:1px solid var(--border-color);border-radius:14px;padding:14px;margin:14px 0}#survey-dialog label{display:block;margin:8px 0}#survey-dialog p{white-space:pre-wrap;overflow-wrap:anywhere}#survey-dialog .survey-muted{font-size:12px;color:var(--text-secondary)}#survey-dialog .survey-error{color:#c44}#survey-dialog legend{max-width:100%;overflow-wrap:anywhere}#survey-dialog button:focus-visible{outline:2px solid var(--accent-color);outline-offset:2px}`;
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
    function frame(title) {
        dialog.replaceChildren();
        const header = el('header'), heading = el('h2', title); heading.id = 'survey-heading';
        header.append(heading, button('关闭', () => dialog.close())); dialog.append(header);
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
        frame('问卷调查');
        dialog.append(el('p', '问卷和回答保存在此浏览器中，按聊天会话区分。', 'survey-muted'));
        actions(button('＋ 创建问卷', create, true));
        if (!items.length) dialog.append(el('p', '还没有问卷，创建第一份吧。'));
        items.forEach(item => {
            const card = el('article'); card.append(el('strong', item.title), el('p', `${item.questions.length} 道题 · ${item.responses.length} 份回答`, 'survey-muted'));
            card.append(button('填写', () => fill(item)), button('查看结果', () => results(item)), button('删除', () => {
                frame('删除问卷'); dialog.append(el('p', `确定删除“${item.title}”及全部回答吗？`));
                actions(button('取消', list), button('确定删除', () => { if (save(items.filter(x => x.id !== item.id))) list(); }));
            })); dialog.append(card);
        });
    }
    function field(parent, caption, tag = 'input') {
        const label = el('label', caption), input = el(tag); label.append(input); parent.append(label); return input;
    }
    function create() {
        frame('创建问卷');
        const form = el('form'); dialog.append(form);
        const title = field(form, '问卷标题'); title.required = true; title.maxLength = 100;
        const questionBox = el('div'); form.append(questionBox);
        const rows = [];
        function add() {
            const box = el('fieldset');
            const question = field(box, '题目'); question.required = true; question.maxLength = 300;
            const type = field(box, '题型', 'select');
            [['text','文字回答'],['single','单选题'],['multiple','多选题']].forEach(([value, text]) => { const option = el('option', text); option.value = value; type.append(option); });
            const options = field(box, '选项（每行一个，至少两个）', 'textarea'); options.parentElement.hidden = true;
            type.addEventListener('change', () => { options.parentElement.hidden = type.value === 'text'; options.required = type.value !== 'text'; });
            const row = { box, question, type, options }; rows.push(row);
            box.append(button('移除题目', () => { rows.splice(rows.indexOf(row), 1); box.remove(); })); questionBox.append(box);
        }
        add();
        const submit = el('button', '保存问卷', 'primary'); submit.type = 'submit';
        form.append(button('＋ 添加题目', add), submit, button('返回', list));
        form.addEventListener('submit', event => {
            event.preventDefault();
            const questions = rows.map(row => ({ text: row.question.value.trim(), type: row.type.value, options: row.type.value === 'text' ? [] : [...new Set(row.options.value.split('\n').map(x => x.trim()).filter(Boolean))] }));
            if (!title.value.trim() || !questions.length || questions.some(q => !q.text || (q.type !== 'text' && q.options.length < 2))) { error('请填写标题和至少一道题；选择题需要至少两个不同的选项。'); return; }
            if (save([...items, { id: crypto.randomUUID(), title: title.value.trim(), questions, responses: [] }])) list();
        });
    }
    function fill(item) {
        frame(item.title); const form = el('form'); dialog.append(form);
        dialog.append(el('p', '所有题目均为必填，可多次填写。', 'survey-muted'));
        const controls = item.questions.map((q, index) => {
            const box = el('fieldset'); box.append(el('legend', `${index + 1}. ${q.text}`)); form.append(box);
            if (q.type === 'text') { const input = field(box, '你的回答', 'textarea'); input.required = true; input.maxLength = 5000; return () => input.value.trim(); }
            const inputs = q.options.map(option => { const label = el('label'), input = el('input'); input.type = q.type === 'single' ? 'radio' : 'checkbox'; input.name = `question-${index}`; input.value = option; label.append(input, document.createTextNode(` ${option}`)); box.append(label); return input; });
            return () => inputs.filter(input => input.checked).map(input => input.value);
        });
        const submit = el('button', '提交回答', 'primary'); submit.type = 'submit'; form.append(submit, button('返回', list));
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
        }); actions(button('返回问卷列表', list));
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
