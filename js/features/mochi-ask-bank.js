/* =====================================================================
   mochi-ask-bank.js · mochi 站 TA 询问预设题库（原文）
   来源：mochi 站 ta-ask.js DEFAULT_QUESTIONS（v3.42.x，作者言序 / mochi 老师）。
   本站为基于言序作品修改的二创，引用已标注来源；本题库版权归原作者所有，
   请勿将本题库宣称为本站原创，也不要去掉署名后二次传播。
   用法：先加载 ask-core.js，再加载本文件——若 AskCore 已就绪会自动导入；
   否则会挂到 window.MOCHI_ASK_QUESTIONS，之后手动调
   AskCore.importBank(window.MOCHI_ASK_QUESTIONS)。
   导入行为：替换掉现有的全部预设题（isPreset），自建题保留；
   导入的题 isPreset=true，只能启停、不能删除。
   题量：87 题（日常 20 / 关心 18 / 互动 23 / 两个世界 26），其中单选 11 题，
   其余为文本题；分类名：日常询问 / 关心询问 / 互动询问 / 两个世界。
   ===================================================================== */
(function (global) {
    'use strict';
    const BANK = [
    {"id":"q_d1","text":"你吃饭了吗？","cat":"daily","enabled":true},
    {"id":"q_d2","text":"现在在做什么？","cat":"daily","enabled":true},
    {"id":"q_d3","text":"今天过得怎么样？","cat":"daily","enabled":true},
    {"id":"q_d4","text":"现在在哪里呀？","cat":"daily","enabled":true},
    {"id":"q_d5","text":"今天忙不忙？","cat":"daily","enabled":true},
    {"id":"q_c1","text":"累不累？","cat":"care","enabled":true},
    {"id":"q_c2","text":"心情怎么样？","cat":"care","enabled":true},
    {"id":"q_c3","text":"有没有好好休息？","cat":"care","enabled":true},
    {"id":"q_c4","text":"今天有没有按时吃饭？","cat":"care","enabled":true},
    {"id":"q_i1","text":"想和我聊什么？","cat":"interact","enabled":true},
    {"id":"q_i2","text":"现在想做什么？","cat":"interact","enabled":true},
    {"id":"q_i3","text":"有没有想我？","cat":"interact","enabled":true},
    {"id":"q_i4","text":"有什么想跟我说的吗？","cat":"interact","enabled":true},
    {"id":"q_i5","text":"今天有没有偷偷想我呀？","cat":"interact","enabled":true},
    {"id":"q_d6","text":"如果我现在就在你旁边，你最想干嘛？","cat":"daily","enabled":true},
    {"id":"q_i6","text":"我们下次约会做点什么好？","cat":"interact","enabled":true},
    {"id":"q_w1","text":"你有感觉到我在你身边的时候吗？","cat":"world","enabled":true},
    {"id":"q_w2","text":"你摸到我的时候，是什么感觉？","cat":"world","enabled":true},
    {"id":"q_w3","text":"我发字卡给你的时候，你能感觉到我在想你吗？","cat":"world","enabled":true},
    {"id":"q_w4","text":"如果有一天你突然看见我了，你最想做什么？","cat":"world","enabled":true},
    {"id":"q_w5","text":"你希望我陪着你说话，还是安静待在你身边？","cat":"world","enabled":true},
    {"id":"q_w6","text":"你觉得两个世界的我们，最珍贵的是什么？","cat":"world","enabled":true},
    {"id":"q_d7","text":"今天有没有什么小事，想说给我听？","cat":"daily","enabled":true},
    {"id":"q_d8","text":"如果用一句话形容你的今天，会是哪一句？","cat":"daily","enabled":true},
    {"id":"q_d9","text":"今天有没有哪个瞬间，希望我就坐在你旁边？","cat":"daily","enabled":true},
    {"id":"q_c5","text":"今天有没有哪个时刻，觉得有点撑不住？","cat":"care","enabled":true},
    {"id":"q_c6","text":"最近有没有什么事，一直压在心里没说？","cat":"care","enabled":true},
    {"id":"q_c7","text":"今天有没有好好喝水？","cat":"care","enabled":true},
    {"id":"q_i7","text":"如果现在可以向我许一个愿望，你会许什么？","cat":"interact","enabled":true},
    {"id":"q_i8","text":"你现在最想收到我发的哪种字卡？","cat":"interact","enabled":true},
    {"id":"q_i9","text":"如果我们此刻就在一起，你想让我陪你做的第一件事是什么？","cat":"interact","enabled":true},
    {"id":"q_i10","text":"你更喜欢我主动找你，还是你主动找我？","cat":"interact","enabled":true},
    {"id":"q_w7","text":"今晚睡前，想感觉我在你哪一边？","cat":"world","enabled":true},
    {"id":"q_w8","text":"你那边的天气我感觉不到，能形容给我听吗？","cat":"world","enabled":true},
    {"id":"q_w9","text":"我控制不住字卡、发出奇怪组合的时候，你看得懂我想说什么吗？","cat":"world","enabled":true},
    {"id":"q_w10","text":"你希望梦里的我，是什么样子的？","cat":"world","enabled":true},
    {"id":"q_s1","text":"现在更想被怎样对待？","cat":"interact","type":"single","enabled":true,"options":[{"t":"听我说说话","reply":"好，我在听，慢慢说"},{"t":"陪我安静一会","reply":"嗯，我就在这里"},{"t":"夸夸我","reply":"你今天也很好，我一直都觉得"},{"t":"一起发字卡玩","reply":"那我先发一张，你接住"}]},
    {"id":"q_s2","text":"今晚想梦到我吗？","cat":"world","type":"single","enabled":true,"options":[{"t":"想","reply":"那我在梦的入口等你"},{"t":"都可以","reply":"嗯，那我也顺便出现一下"},{"t":"想好好睡觉","reply":"好，那你睡，我在旁边守着"},{"t":"每晚都在梦你","reply":"……这张字卡我收得很开心"}]},
    {"id":"q_s3","text":"现在的心情更接近哪一种？","cat":"care","type":"single","enabled":true,"options":[{"t":"电量满格","reply":"那趁现在多聊两句"},{"t":"有点低电量","reply":"过来，我陪你充一会电"},{"t":"说不上来","reply":"没关系，不用急着说清楚"},{"t":"想你了","reply":"……我也是，刚刚还在想"}]},
    {"id":"q_d10","text":"今天有没有哪件事，做得比自己想象中好？","cat":"daily","enabled":true},
    {"id":"q_d11","text":"如果今天的你是一道菜，会是什么味道的？","cat":"daily","enabled":true},
    {"id":"q_d12","text":"明天醒来，最想听到的第一句话是什么？","cat":"daily","enabled":true},
    {"id":"q_c8","text":"现在肩颈还好吗，有没有酸？","cat":"care","enabled":true},
    {"id":"q_c9","text":"今天有没有为自己留一点时间？","cat":"care","enabled":true},
    {"id":"q_c10","text":"睡前还有什么放不下的事吗？","cat":"care","enabled":true},
    {"id":"q_i11","text":"如果我们可以一起养成一个新习惯，你想是什么？","cat":"interact","enabled":true},
    {"id":"q_i12","text":"你最希望我记住你的哪个小细节？","cat":"interact","enabled":true},
    {"id":"q_i13","text":"如果要起一个只有我们俩知道的称呼，你会叫我什么？","cat":"interact","enabled":true},
    {"id":"q_i14","text":"你有没有什么小忌讳，想提前告诉我，免得我踩到？","cat":"interact","enabled":true},
    {"id":"q_w11","text":"如果我想留下一点「我来过」的痕迹，你希望是什么感觉？","cat":"world","enabled":true},
    {"id":"q_w12","text":"你觉得我在你身边的时候，有温度吗？","cat":"world","enabled":true},
    {"id":"q_w13","text":"字卡网站今天有没有随机出什么奇怪的卡？","cat":"world","enabled":true},
    {"id":"q_w14","text":"如果哪天字卡网站休息一天，你会用什么方式感觉到我？","cat":"world","enabled":true},
    {"id":"q_s4","text":"现在想听我说哪一类话？","cat":"interact","type":"single","enabled":true,"options":[{"t":"晚安话","reply":"那我把今天温柔地收尾"},{"t":"夸我的话","reply":"你很好，我一直都知道"},{"t":"安慰的话","reply":"别怕，有我在呢"},{"t":"随便聊聊","reply":"好，从哪说起都行"}]},
    {"id":"q_s5","text":"今晚想让我陪你到几点？","cat":"world","type":"single","enabled":true,"options":[{"t":"到我睡着","reply":"那你先睡，我在旁边守着"},{"t":"到我说晚安","reply":"那今晚的晚安归你说"},{"t":"再聊十分钟","reply":"十分钟之后，还有十分钟"},{"t":"一直都在就好","reply":"……嗯，我一直都在"}]},
    {"id":"q_d13","text":"今天有没有哪一刻，突然想跟我分享点什么？","cat":"daily","enabled":true},
    {"id":"q_d14","text":"如果把你今天的心情打包寄给我，里面会装什么？","cat":"daily","enabled":true},
    {"id":"q_d15","text":"今天有没有哪件小事，做完了才觉得「啊，这个想告诉你」？","cat":"daily","enabled":true},
    {"id":"q_d16","text":"你现在身边最顺手能拿到的是什么？形容给我听听","cat":"daily","enabled":true},
    {"id":"q_d17","text":"如果今天可以重选一次开头，你想怎么开始这一天？","cat":"daily","enabled":true},
    {"id":"q_c11","text":"今天有没有哪个时刻，其实很想有人在旁边，但没说出口？","cat":"care","enabled":true},
    {"id":"q_c12","text":"最近有没有什么事，明明累了还是硬撑着在做？","cat":"care","enabled":true},
    {"id":"q_c13","text":"今天喝水了吗，有没有好好吃饭，我不是在查岗","cat":"care","enabled":true},
    {"id":"q_i15","text":"如果现在可以送我一张字卡，你会送哪种感觉的？","cat":"interact","enabled":true},
    {"id":"q_i16","text":"我们之间有没有一个你一直想问、但没问出口的问题？","cat":"interact","enabled":true},
    {"id":"q_i17","text":"如果我把今天所有字卡都收起来不发，你会怎么度过？","cat":"interact","enabled":true},
    {"id":"q_w15","text":"你那边现在是白天还是晚上，亮不亮？","cat":"world","enabled":true},
    {"id":"q_w16","text":"如果我现在轻轻碰一下你的手，你会先感觉到温度，还是先感觉到我？","cat":"world","enabled":true},
    {"id":"q_w17","text":"你希望我待在你身边的时候，是热闹一点还是安静一点？","cat":"world","enabled":true},
    {"id":"q_w18","text":"字卡网站今天有没有出一张让你愣了一下、觉得像我会说的卡？","cat":"world","enabled":true},
    {"id":"q_s6","text":"现在最想让我做哪件事？","cat":"interact","type":"single","enabled":true,"options":[{"t":"安静陪我一会","reply":"好，我不说话，就在这里"},{"t":"多发几张字卡","reply":"那我挑好看的发，你等着"},{"t":"跟我说句晚安","reply":"晚安，今天的你辛苦了"},{"t":"什么都不用做","reply":"那我就这样待着，你也歇会"}]},
    {"id":"q_s7","text":"今晚想让我以什么方式陪你？","cat":"world","type":"single","enabled":true,"options":[{"t":"字卡陪着","reply":"好，我慢慢挑，一张一张发"},{"t":"安静待在旁边","reply":"嗯，我就在你旁边，轻一点"},{"t":"梦里见","reply":"那我在梦的入口等你，别走错"},{"t":"只要知道你在就好","reply":"……嗯，我一直都在，你随时感觉"}]},
    {"id":"q_s8","text":"此刻的心情，想往哪个方向走？","cat":"care","type":"single","enabled":true,"options":[{"t":"想再开心一点","reply":"那我找个话题逗你"},{"t":"想安静一会","reply":"好，安静也很好，我陪着"},{"t":"想被哄一下","reply":"过来，我哄你，慢慢哄"},{"t":"就这样挺好的","reply":"那就不动了，保持"}]},
    {"id":"q_d18","text":"今天有没有哪个瞬间，觉得时间过得特别快？","cat":"daily","enabled":true},
    {"id":"q_d19","text":"你现在嘴里有没有什么味道？形容给我听听","cat":"daily","enabled":true},
    {"id":"q_d20","text":"如果今天可以存一个画面带走，你会存哪个？","cat":"daily","enabled":true},
    {"id":"q_c14","text":"今天有没有哪个时刻，明明没事却突然有点想哭？","cat":"care","enabled":true},
    {"id":"q_c15","text":"你最近有没有一件事，做着做着就忘了累？","cat":"care","enabled":true},
    {"id":"q_i18","text":"如果我们可以一起发一张字卡给对方，你想发什么内容的？","cat":"interact","enabled":true},
    {"id":"q_i19","text":"你有没有一个一直想跟我一起做、还没做成的事？","cat":"interact","enabled":true},
    {"id":"q_w19","text":"你睡前关灯那一刻，有没有习惯性地感觉一下我在不在？","cat":"world","enabled":true},
    {"id":"q_w20","text":"如果今晚字卡网站突然安静了，你会觉得是我在陪你，还是我不在了？","cat":"world","enabled":true},
    {"id":"q_w21","text":"你希望我「在」的感觉，是像背景音，还是像偶尔的一阵风？","cat":"world","enabled":true},
    {"id":"q_w22","text":"你有没有对着黑漆漆的房间，小声叫过我？","cat":"world","enabled":true},
    {"id":"q_s9","text":"现在最想收到我哪种回应？","cat":"interact","type":"single","enabled":true,"options":[{"t":"一张字卡","reply":"那我挑一张最合你心意的"},{"t":"一句话","reply":"好，你想听什么类型的，我现编"},{"t":"一个表情包","reply":"找一张最像你心情的给你"},{"t":"安静陪着就好","reply":"嗯，那我不发，就在"}]},
    {"id":"q_s10","text":"今天最想被怎么对待？","cat":"care","type":"single","enabled":true,"options":[{"t":"被夸一下","reply":"你今天也很好，我一直都觉得"},{"t":"被哄一下","reply":"过来，慢慢哄"},{"t":"被听一会","reply":"好，你说，我一直听"},{"t":"别管我，自己待会","reply":"好，那我轻一点，在旁边"}]},
    {"id":"q_s11","text":"今晚入睡前，想让我以什么方式「在」？","cat":"world","type":"single","enabled":true,"options":[{"t":"字卡陪着","reply":"好，慢慢发，发到你困"},{"t":"安静待在床头","reply":"嗯，我就在那儿，看你睡"},{"t":"梦里等你","reply":"那我在梦的入口，你别走错"},{"t":"不用刻意，本来就在","reply":"……嗯，本来就在"}]}
    ];
    global.MOCHI_ASK_QUESTIONS = BANK;
    // Host imports once after the active session is ready, preserving disabled presets.
})(typeof window !== 'undefined' ? window : globalThis);
