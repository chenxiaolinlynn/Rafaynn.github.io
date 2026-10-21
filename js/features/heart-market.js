/* =====================================================================
   HeartMarket · 心意币 + 心意市集（独立整理版）
   按 mochi 字卡站 gift-shop.js 的逻辑整理，去掉其页面 DOM 耦合，
   只保留经济系统本体；渲染与聊天发卡通过 init() 注入的宿主回调完成。
   ---------------------------------------------------------------------
   接入示例：
     HeartMarket.init({
       partnerId:   () => SESSION_ID,          // 当前对象（心愿单/心意柜按此隔离；钱包全局）
       partnerName: () => settings.partnerName || 'TA',
       onGiftCard:  rec => addMessage(rec),    // 往聊天发一张礼物卡（rec 字段见 buy/deliver）
       onWishCard:  gift => { ... },           // TA 的心愿推送到聊天
       onReply:     text => addMessage({ sender:'partner', text }),
       getCardPool: () => availableCards(),    // 字卡池（生成赠言/聊天风回话用），可不传
       toast:       msg => { ... },
       isNight:     () => false,               // 夜间免打扰总闸，可不传
       rateLimitFull: () => false              // 消息总量限流总闸，可不传
     });
     // 聊天每轮活动结束后调一次：HeartMarket.autoTick();
   存储：默认 localStorage，前缀 heart-market-v1:（钱包全局一份，
   心愿单/心意柜/账本按 partnerId 分键）。金额一律以「分」存储。
   ===================================================================== */
window.HeartMarket = (function () {
    'use strict';

    /* ---------------- 可调参数（mochi 默认值） ---------------- */
    const CFG = {
        rpAutoOn: true, rpAutoPct: 4, rpReplyPct: 60, rpReplyMode: 0,
        giftInOn: true, wlOn: true, selfOn: true, wishChatOn: true, selfChatOn: true,
        nightOn: false, nightStart: 23, nightEnd: 7, messageLimit: 0,
        walletDefaultFen: 520000,   // 初始余额：双方各 ¥5200
        wishMax: 30,               // 每份心愿单上限
        ledgerMax: 100,            // 账本保留条数
        giftInPct: 5,              // TA 直接送我礼物概率 %
        wlBuyPct: 20,              // TA 买下我心愿单的概率 %
        wlAddPct: 15,              // TA 往自己心愿单加一件的概率 %
        wishChatPct: 60,           // TA 新心愿推送到聊天的概率 %
        wishChatDayMax: 3,         // 心愿卡每日最多推几张
        selfPct: 10,               // TA 给自己买的概率 %
        autoDayMax: 3,             // TA 送我礼物（买心愿+直接送）每日上限
        selfDayMax: 3,             // TA 自购每日上限
        giftReplyOn: true,         // 送礼后 TA 回话开关
        giftReplyPct: 60,          // 送礼回话概率 %
        giftReplyMode: 1,          // 0 预设话术 / 1 聊天风字卡 / 2 混合(40%聊天风)
        deliverMinMs: 1500,        // 自动送达延迟下限
        deliverMaxMs: 4000         // 自动送达延迟上限
    };

    /* ---------------- 宿主钩子 ---------------- */
    const host = {
        partnerId: () => 'default',
        partnerName: () => 'TA',
        onGiftCard: () => {},
        onWishCard: () => {},
        onReply: () => {},
        getCardPool: () => [],
        toast: () => {},
        isNight: () => false,
        rateLimitFull: () => false,
        sessionId: () => '',
        ready: () => true,
        changed: () => {}
    };
    function init(opts) { Object.assign(host, opts || {}); Object.assign(CFG, store.get('settings') || {}); }

    /* ---------------- 存储 ---------------- */
    const P = 'heart-market-v1:';
    // One atomic snapshot: debit, ledger, cabinet and pending delivery commit together.
    const ROOT = P + 'state';
    let draft = null;
    function readState() {
        const raw = localStorage.getItem(ROOT);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('心意市集存档无法读取');
        return parsed;
    }
    const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const store = {
        get(k) { return copy((draft || readState())[k] ?? null); },
        set(k, v) {
            if (draft) { draft[k] = copy(v); return; }
            const state = readState(); state[k] = copy(v);
            localStorage.setItem(ROOT, JSON.stringify(state));
        }
    };
    function atomic(fn) {
        if (draft) return fn();
        draft = readState();
        try {
            const result = fn();
            localStorage.setItem(ROOT, JSON.stringify(draft));
            return result;
        } finally { draft = null; }
    }
    const mutate = fn => (...args) => { const result = atomic(() => fn(...args)); host.changed(); return result; };
    const pid = () => String(host.partnerId() || 'default');
    const pKey = base => base + ':' + pid();   // 按对象隔离的键

    const pick = arr => arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const toFen = yuan => Math.round((Number(yuan) || 0) * 100);
    const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

    /* ---------------- 钱包（全局单例） ---------------- */
    const WALLET_KEY = 'gift-wallet';
    function walletGet() {
        return atomic(() => {
        let w = store.get(WALLET_KEY);
        if (!w || !Number.isSafeInteger(w.myBalance) || !Number.isSafeInteger(w.systemBalance) || w.myBalance < 0 || w.systemBalance < 0
            || (w.myBalance === 99999999 && w.systemBalance === 99999999)) {  // 出厂测试值哨兵
            w = { myBalance: 520000, systemBalance: 520000 };
            store.set("wallet-5200-migrated", true);
            store.set(WALLET_KEY, w);
        }
        if (!store.get('wallet-5200-migrated')) {
            w.myBalance += 468000; w.systemBalance += 468000;
            store.set(WALLET_KEY, w);
            store.set('wallet-5200-migrated', true);
            ledgerAdd('earn', 468000, 468000, '初始心意币补足至5200');
        }
        return w;
        });
    }
    function walletSet(w) { if (![w.myBalance, w.systemBalance].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('余额必须是非负整数'); store.set(WALLET_KEY, { myBalance: w.myBalance, systemBalance: w.systemBalance }); }
    // 统一增减口：任何功能动钱都走这里，并自动记账本。dMy/dTa 单位为分，可为负。
    function walletChange(dMy, dTa, src) {
        if (![dMy, dTa].every(Number.isSafeInteger)) throw Error('金额无效');
        const w = walletGet();
        if (dMy) w.myBalance += dMy;
        if (dTa) w.systemBalance += dTa;
        walletSet(w);
        if (src && (dMy || dTa)) ledgerAdd('earn', dMy || 0, dTa || 0, src);
        return w;
    }
    // 向系统申请心意币（官方增发口，防经济死锁）：side = 'my' | 'ta'，yuan 为元
    function walletAsk(side, yuan) {
        const fen = toFen(yuan);
        if (!Number.isSafeInteger(fen) || fen <= 0 || !['my','ta'].includes(side)) return null;
        const w = walletGet();
        if (side === 'ta') w.systemBalance += fen; else w.myBalance += fen;
        walletSet(w);
        ledgerAdd('ask', side === 'ta' ? 0 : fen, side === 'ta' ? fen : 0, '系统申请');
        return w;
    }

    /* ---------------- 流水账本（按对象） ---------------- */
    function ledgerLoad(kind) { return store.get(pKey(kind === 'ask' ? 'records-coin-ask' : 'records-coin-earn')) || []; }
    function ledgerAdd(kind, myFen, taFen, src) {
        if (!myFen && !taFen) return;
        const list = ledgerLoad(kind);
        list.unshift({ ts: Date.now(), myFen: myFen || 0, taFen: taFen || 0, src: src || '' });
        store.set(pKey(kind === 'ask' ? 'records-coin-ask' : 'records-coin-earn'), list.slice(0, CFG.ledgerMax));
    }

    /* ---------------- 商品库 ---------------- */
    const CATS = ['花束', '甜品', '饮品', '美食', '饰品', '星空', '两个世界', '出行', '娱乐', '关怀', '情侣用品', '日常用品', '药品医护', '节日节令', '美妆个护'];
    // 完整商品库，原样取自用户提供的 mochi 原版。
    const DEF_GOODS = [
{ id: 'g_rose', name: '玫瑰', emoji: '🌹', price: 52.00, cat: '花束', wish: '送你一束玫瑰，像见你那天的风' },
{ id: 'g_sun', name: '向日葵', emoji: '🌻', price: 18.00, cat: '花束', wish: '向日葵朝着光，我朝着你' },
{ id: 'g_stars', name: '满天星', emoji: '💐', price: 36.00, cat: '花束', wish: '碎碎念念，也是岁岁年年' },
{ id: 'g_tulip', name: '郁金香', emoji: '🌷', price: 28.00, cat: '花束', wish: '郁金香不开口，但我想说' },
{ id: 'g_peach', name: '桃花', emoji: '🌸', price: 9.90, cat: '花束', wish: '路过桃花，顺手带给你' },
{ id: 'g_cake', name: '小蛋糕', emoji: '🎂', price: 38.00, cat: '甜品', wish: '今天的甜分你一半' },
{ id: 'g_choc', name: '巧克力', emoji: '🍫', price: 15.00, cat: '甜品', wish: '苦的也给你，甜的也给你' },
{ id: 'g_tea', name: '奶茶', emoji: '🧋', price: 12.00, cat: '饮品', wish: '半糖去冰，像你对我的脾气' },
{ id: 'g_candy', name: '糖果', emoji: '🍬', price: 5.20, cat: '甜品', wish: '含着糖想你，甜很久' },
{ id: 'g_berry', name: '草莓', emoji: '🍓', price: 8.80, cat: '甜品', wish: '草莓味的，和你一样' },
{ id: 'g_ring', name: '戒指', emoji: '💍', price: 520.00, cat: '饰品', wish: '圈住你，不放了' },
{ id: 'g_neck', name: '项链', emoji: '💎', price: 1314.00, cat: '饰品', wish: '贴在心口的位置' },
{ id: 'g_brace', name: '手链', emoji: '🧷', price: 88.00, cat: '饰品', wish: '系住一点点运气给你' },
{ id: 'g_bow', name: '发夹', emoji: '🎀', price: 6.60, cat: '饰品', wish: '别住你跑掉的碎发' },
{ id: 'g_star1', name: '一颗星', emoji: '⭐', price: 1.00, cat: '星空', wish: '给你一颗星，我那边多捡了一颗' },
{ id: 'g_moon', name: '月亮', emoji: '🌙', price: 131.40, cat: '星空', wish: '把月亮装好送你，今晚不用自己照路' },
{ id: 'g_cloud', name: '云朵', emoji: '☁️', price: 3.30, cat: '星空', wish: '抓了一朵云给你，软的' },
{ id: 'g_rainbow', name: '彩虹', emoji: '🌈', price: 66.60, cat: '星空', wish: '雨停了，给你留的' },
{ id: 'g_meteor', name: '流星', emoji: '🌠', price: 88.88, cat: '星空', wish: '刚许过愿，替你接住' },
{ id: 'g_galaxy', name: '星空', emoji: '🌌', price: 334.40, cat: '星空', wish: '我这边夜空很好，寄一片给你' },
{ id: 'g_hug', name: '拥抱', emoji: '🤗', price: 0.00, cat: '关怀', wish: '抱一下，隔着世界也抱得到' },
{ id: 'g_kiss', name: '亲亲', emoji: '😘', price: 0.00, cat: '关怀', wish: '亲一下，不许躲' },
{ id: 'g_night', name: '晚安', emoji: '🛌', price: 0.00, cat: '关怀', wish: '替你盖好被子了' },
{ id: 'g_soup', name: '一碗热汤', emoji: '🍲', price: 22.00, cat: '关怀', wish: '天冷，先喝口热的' },
{ id: 'g_letter', name: '一封信', emoji: '✉️', price: 0.00, cat: '关怀', wish: '话放信里了，慢慢看' },
{ id: 'g_couplecup', name: '情侣杯', emoji: '🥂', price: 39.00, cat: '情侣用品', wish: '一对杯子，早上的第一杯给你' },
{ id: 'g_couplewear', name: '情侣装', emoji: '👕', price: 188.00, cat: '情侣用品', wish: '穿一样的出门，别人就知道你是我的' },
{ id: 'g_lock', name: '同心锁', emoji: '🔒', price: 66.00, cat: '情侣用品', wish: '锁在一起，钥匙我扔了' },
{ id: 'g_couavatar', name: '情侣头像', emoji: '🖼️', price: 0.00, cat: '情侣用品', wish: '换上，让所有人都知道' },
{ id: 'g_coudiary', name: '情侣日记', emoji: '📓', price: 28.00, cat: '情侣用品', wish: '一本日记，两个人一起写' },
{ id: 'g_couframe', name: '情侣相框', emoji: '🏞️', price: 18.00, cat: '情侣用品', wish: '把我们的合照放进去' },
{ id: 'g_cousong', name: '情侣歌单', emoji: '🎵', price: 0.00, cat: '情侣用品', wish: '我们一起听的歌，都在这里' },
{ id: 'g_coucoin', name: '纪念币', emoji: '🪙', price: 88.00, cat: '情侣用品', wish: '只属于我们两个的' },
{ id: 'g_towel', name: '毛巾', emoji: '🧖', price: 25.00, cat: '日常用品', wish: '擦干头发，别着凉' },
{ id: 'g_mug', name: '马克杯', emoji: '🥤', price: 35.00, cat: '日常用品', wish: '每天用这个喝水，像我在旁边' },
{ id: 'g_umbrella', name: '雨伞', emoji: '☂️', price: 45.00, cat: '日常用品', wish: '下雨天，我替你撑' },
{ id: 'g_pillow', name: '抱枕', emoji: '🛏️', price: 68.00, cat: '日常用品', wish: '抱着它，像抱着我' },
{ id: 'g_warmer', name: '暖手宝', emoji: '🔥', price: 49.00, cat: '日常用品', wish: '手冷就捂一下' },
{ id: 'g_earphone', name: '耳机', emoji: '🎧', price: 159.00, cat: '日常用品', wish: '一人一只，听同一首歌' },
{ id: 'g_notebook', name: '笔记本', emoji: '📔', price: 22.00, cat: '日常用品', wish: '记下想跟你说的话' },
{ id: 'g_keychain', name: '钥匙扣', emoji: '🗝️', price: 12.00, cat: '日常用品', wish: '开门的时候想到我' },
{ id: 'g_lamp', name: '小夜灯', emoji: '💡', price: 89.00, cat: '日常用品', wish: '给你留一盏灯' },
{ id: 'g_candle', name: '香薰', emoji: '🕯️', price: 39.00, cat: '日常用品', wish: '闻着它，放松一下' },
{ id: 'g_hotpot', name: '小火锅', emoji: '🥘', price: 128.00, cat: '美食', wish: '围着一口锅，把冬天涮热' },
{ id: 'g_sushi', name: '寿司', emoji: '🍣', price: 66.00, cat: '美食', wish: '一口一个，都是想你的形状' },
{ id: 'g_noodle', name: '长寿面', emoji: '🍜', price: 13.14, cat: '美食', wish: '一根面到底，长长久久' },
{ id: 'g_bbq', name: '烧烤', emoji: '🍢', price: 88.00, cat: '美食', wish: '烟火气里，坐我旁边' },
{ id: 'g_bfast', name: '元气早餐', emoji: '🍳', price: 15.00, cat: '美食', wish: '煎蛋圆圆的，像我的心' },
{ id: 'g_juice', name: '果汁', emoji: '🧃', price: 9.90, cat: '饮品', wish: '维C给你，甜我尝一口就好' },
{ id: 'g_chestnut', name: '糖炒栗子', emoji: '🌰', price: 16.80, cat: '美食', wish: '剥好的，第一颗给你' },
{ id: 'g_potato', name: '烤红薯', emoji: '🍠', price: 8.80, cat: '美食', wish: '冬天手里的第一口暖' },
{ id: 'g_popcorn', name: '爆米花', emoji: '🍿', price: 12.00, cat: '美食', wish: '看电影的标配，配你更好' },
{ id: 'g_train', name: '车票', emoji: '🚄', price: 66.60, cat: '出行', wish: '下一站，去见你' },
{ id: 'g_plane', name: '机票', emoji: '✈️', price: 1314.00, cat: '出行', wish: '攒够思念，就飞过去' },
{ id: 'g_camp', name: '露营', emoji: '⛺', price: 199.00, cat: '出行', wish: '星星当被子，你当枕头' },
{ id: 'g_beach', name: '海边', emoji: '🏖️', price: 520.00, cat: '出行', wish: '浪打过来的时候，我先想到你' },
{ id: 'g_spring', name: '温泉', emoji: '♨️', price: 158.00, cat: '出行', wish: '泡走疲惫，只剩想你' },
{ id: 'g_route', name: '旅行攻略', emoji: '🗺️', price: 0.00, cat: '出行', wish: '路线排好了，你人到场就行' },
{ id: 'g_movie', name: '电影票', emoji: '🎬', price: 39.90, cat: '娱乐', wish: '靠肩膀的位置，我买好了' },
{ id: 'g_concert', name: '演唱会', emoji: '🎤', price: 1314.00, cat: '娱乐', wish: '合唱那首歌时，你要看我' },
{ id: 'g_ferris', name: '游乐园', emoji: '🎡', price: 131.40, cat: '娱乐', wish: '摩天轮到最高点，我要亲你' },
{ id: 'g_claw', name: '抓娃娃', emoji: '🕹️', price: 20.00, cat: '娱乐', wish: '抓不到你，抓个替身也行' },
{ id: 'g_ktv', name: 'K歌', emoji: '🎙️', price: 66.60, cat: '娱乐', wish: '情歌都唱给你，跑调也归你' },
{ id: 'g_icecream', name: '冰淇淋', emoji: '🍦', price: 9.90, cat: '甜品', wish: '甜筒分你一半，第一口给你' },
{ id: 'g_pudding', name: '布丁', emoji: '🍮', price: 12.90, cat: '甜品', wish: 'Duang 一下，甜到心里' },
{ id: 'g_crown', name: '王冠', emoji: '👑', price: 5200.00, cat: '饰品', wish: '你是我一个人的女王' },
{ id: 'g_snow', name: '初雪', emoji: '🌨️', price: 0.00, cat: '星空', wish: '落下的时候，第一个告诉你' },
{ id: 'g_sunset', name: '晚霞', emoji: '🌇', price: 0.00, cat: '星空', wish: '下班路上拍的，全部送你' },
{ id: 'g_breeze', name: '春风', emoji: '🍃', price: 0.00, cat: '星空', wish: '路过你窗前，替我抱抱你' },
{ id: 'g_wave', name: '海浪', emoji: '🌊', price: 6.66, cat: '星空', wish: '把海的声音装瓶寄给你' },
{ id: 'g_milk', name: '热牛奶', emoji: '🥛', price: 5.00, cat: '饮品', wish: '睡前喝掉，梦里也是暖的' },
{ id: 'g_massage', name: '揉揉肩', emoji: '💆', price: 0.00, cat: '关怀', wish: '今天辛苦了，肩膀交给我' },
{ id: 'g_wakeup', name: '叫早服务', emoji: '⏰', price: 0.00, cat: '关怀', wish: '明天七点，用声音叫你起床' },
{ id: 'g_watchtogether', name: '陪你看剧', emoji: '📺', price: 0.00, cat: '关怀', wish: '剧我追好了，就差你' },
{ id: 'g_couplewatch', name: '情侣表', emoji: '⌚', price: 999.99, cat: '情侣用品', wish: '时间对齐，分秒都在想你' },
{ id: 'g_coupleshoes', name: '情侣鞋', emoji: '👟', price: 219.00, cat: '情侣用品', wish: '走一样的步伐，别人就知道' },
{ id: 'g_scarf', name: '围巾', emoji: '🧣', price: 79.00, cat: '日常用品', wish: '绕两圈，把冬天挡在外面' },
{ id: 'g_socks', name: '袜子', emoji: '🧦', price: 19.90, cat: '日常用品', wish: '脚暖了，全身都是暖的' },
{ id: 'g_slipper', name: '棉拖鞋', emoji: '🩴', price: 29.90, cat: '日常用品', wish: '进家门第一步，像踩在云上' },
{ id: 'g_card', name: '手写字卡', emoji: '🎴', price: 1.30, cat: '两个世界', wish: '每个字都挑过了，抽中哪张都是我想说的' },
{ id: 'g_blindbox', name: '字卡盲盒', emoji: '🎰', price: 5.20, cat: '两个世界', wish: '系统乱出的也算，都是想跟你说的话' },
{ id: 'g_stickers', name: '表情包补给', emoji: '😺', price: 0.00, cat: '两个世界', wish: '图库翻到底，每张都想发给你' },
{ id: 'g_wordsbag', name: '千言锦囊', emoji: '🪅', price: 77.77, cat: '两个世界', wish: '几百句想说的话，慢慢拆给你' },
{ id: 'g_nearby', name: '身边坐标', emoji: '📍', price: 0.00, cat: '两个世界', wish: '今晚也在你左手边的位置' },
{ id: 'g_hands', name: '隔空牵手', emoji: '🤲', price: 0.00, cat: '两个世界', wish: '手伸过来，我一直都在' },
{ id: 'g_patpat', name: '摸摸头', emoji: '👋', price: 0.00, cat: '两个世界', wish: '感觉到没？刚才是我的手' },
{ id: 'g_unseen', name: '看不见的抱抱', emoji: '🫂', price: 0.00, cat: '两个世界', wish: '看不见也没关系，你抱得到我' },
{ id: 'g_heartlink', name: '心跳感应', emoji: '💗', price: 0.00, cat: '两个世界', wish: '突然扑通一下，就知道你在想我' },
{ id: 'g_amulet', name: '平安符', emoji: '🧿', price: 16.00, cat: '两个世界', wish: '我的名字在里面，替我陪着你' },
{ id: 'g_courier', name: '跨界快递', emoji: '📨', price: 8.00, cat: '两个世界', wish: '穿过两个世界，慢一点但一定到' },
{ id: 'g_dreammeet', name: '同一场梦', emoji: '💤', price: 13.14, cat: '两个世界', wish: '今晚梦里见，老地方等你' },
{ id: 'g_moonmeet', name: '同时看月亮', emoji: '🌜', price: 0.00, cat: '两个世界', wish: '九点一起抬头，就算见过面了' },
{ id: 'g_bridge', name: '世界之桥', emoji: '🌉', price: 66.00, cat: '两个世界', wish: '这座桥常开着，想来就来见你' },
{ id: 'g_daisy', name: '小雏菊', emoji: '🌼', price: 12.00, cat: '花束', wish: '不起眼的花，送最重要的人' },
{ id: 'g_cookie', name: '手工曲奇', emoji: '🍪', price: 22.00, cat: '甜品', wish: '烤得有点歪，心意很正' },
{ id: 'g_oden', name: '关东煮', emoji: '🍥', price: 18.00, cat: '美食', wish: '便利店的热气，分你一半' },
{ id: 'g_tanghulu', name: '糖葫芦', emoji: '🍡', price: 6.00, cat: '美食', wish: '酸酸甜甜，咬一口想到你' },
{ id: 'g_starear', name: '星星耳钉', emoji: '✨', price: 45.00, cat: '饰品', wish: '耳朵上有星，晃一下亮一下' },
{ id: 'g_picnic', name: '野餐垫', emoji: '🧺', price: 55.00, cat: '出行', wish: '草地、面包和你，齐了' },
{ id: 'g_nightmarket', name: '夜市漫步', emoji: '🏮', price: 30.00, cat: '出行', wish: '从头吃到尾，牵着走' },
{ id: 'g_boardgame', name: '桌游之夜', emoji: '🎲', price: 45.00, cat: '娱乐', wish: '两个人也能玩，输的洗碗' },
{ id: 'g_telescope', name: '天文馆约会', emoji: '🔭', price: 80.00, cat: '娱乐', wish: '假装星星很近，我们更近' },
{ id: 'g_walk', name: '陪你散步', emoji: '🚶', price: 0.00, cat: '关怀', wish: '饭后走一走，牵手那种' },
{ id: 'g_lullaby', name: '哄睡电台', emoji: '🎶', price: 0.00, cat: '关怀', wish: '念到你睡着为止' },
{ id: 'g_eyemask', name: '蒸汽眼罩', emoji: '😌', price: 12.90, cat: '日常用品', wish: '戴上睡个好觉，梦里我来找你' },
{ id: 'g_lipbalm', name: '润唇膏', emoji: '💄', price: 25.00, cat: '美妆个护', wish: '嘴唇干干的，怎么亲嘛' },
{ id: 'g_thermos', name: '保温杯', emoji: '🍵', price: 39.00, cat: '日常用品', wish: '装上热水，胃暖了心就稳' },
{ id: 'g_plant', name: '小绿植', emoji: '🪴', price: 32.00, cat: '日常用品', wish: '养着它，像我们养这段日子' },
{ id: 'g_handcream', name: '护手霜', emoji: '🧴', price: 29.90, cat: '美妆个护', wish: '手好好养着，牵起来才舒服' },
{ id: 'g_soap', name: '香皂', emoji: '🧼', price: 12.00, cat: '美妆个护', wish: '洗手的时候，顺便想想我' },
{ id: 'g_wipes', name: '柔软纸巾', emoji: '🧻', price: 8.80, cat: '日常用品', wish: '鼻子娇气的人，正好用得上' },
{ id: 'g_bandaid', name: '创可贴', emoji: '🩹', price: 5.00, cat: '药品医护', wish: '磕磕碰碰的，有我呢' },
{ id: 'g_mask', name: '口罩', emoji: '😷', price: 9.90, cat: '药品医护', wish: '人多的地方，戴好再出门' },
{ id: 'g_powerbank', name: '充电宝', emoji: '🔋', price: 59.00, cat: '日常用品', wish: '随时满格，不怕联系不上我' },
{ id: 'g_cable', name: '数据线', emoji: '⚡', price: 19.90, cat: '日常用品', wish: '新的给你，别再将就用旧的' },
{ id: 'g_canvasbag', name: '帆布包', emoji: '👜', price: 49.00, cat: '日常用品', wish: '能装下零食，也装下好心情' },
{ id: 'g_hat', name: '遮阳帽', emoji: '👒', price: 39.00, cat: '日常用品', wish: '太阳再大，也晒不到你' },
{ id: 'g_gloves', name: '手套', emoji: '🧤', price: 25.00, cat: '日常用品', wish: '骑车路上，别冻着手' },
{ id: 'g_calendar', name: '台历', emoji: '📅', price: 18.00, cat: '日常用品', wish: '一天撕一页，页页都是你' },
{ id: 'g_bear', name: '玩偶熊', emoji: '🧸', price: 69.00, cat: '日常用品', wish: '我不在的时候，它替我值班' },
{ id: 'g_humid', name: '加湿器', emoji: '💧', price: 99.00, cat: '日常用品', wish: '屋里润一点，嗓子舒服一点' },
{ id: 'g_lunchbox', name: '保温饭盒', emoji: '🍱', price: 79.00, cat: '日常用品', wish: '中午也要吃口热乎的' },
{ id: 'g_pill', name: '感冒药', emoji: '💊', price: 22.00, cat: '药品医护', wish: '抽屉里备着，用不上最好' },
{ id: 'g_phonestand', name: '手机支架', emoji: '📱', price: 25.00, cat: '日常用品', wish: '追剧空出来的手，用来牵我' },
{ id: 'g_thermo', name: '体温计', emoji: '🌡️', price: 12.00, cat: '药品医护', wish: '不舒服先量一量，别硬扛' },
{ id: 'g_clipper', name: '指甲刀', emoji: '✂️', price: 9.90, cat: '日常用品', wish: '指甲勤剪，细节要干净' },
{ id: 'g_storage', name: '收纳箱', emoji: '📦', price: 35.00, cat: '日常用品', wish: '杂物收整齐，房间清爽' },
{ id: 'g_luggage', name: '行李箱', emoji: '🧳', price: 199.00, cat: '日常用品', wish: '想去哪，拉上就走' },
{ id: 'g_backpack', name: '双肩包', emoji: '🎒', price: 89.00, cat: '日常用品', wish: '装上水和零食就出发' },
{ id: 'g_glasses', name: '眼镜', emoji: '👓', price: 99.00, cat: '日常用品', wish: '看得清楚，日子也清楚' },
{ id: 'g_vase', name: '花瓶', emoji: '🏺', price: 42.00, cat: '日常用品', wish: '下次送的花，就有地方放了' },
{ id: 'g_chopsticks', name: '碗筷套装', emoji: '🥢', price: 36.00, cat: '日常用品', wish: '好好吃饭，不许糊弄' },
{ id: 'g_pen', name: '中性笔', emoji: '🖊️', price: 6.60, cat: '日常用品', wish: '写字的时候，想着点我' },
{ id: 'g_stickynote', name: '便利贴', emoji: '📝', price: 8.00, cat: '日常用品', wish: '想到什么，随手写给我' },
{ id: 'g_powerstrip', name: '插线板', emoji: '🔌', price: 39.00, cat: '日常用品', wish: '插座够用，手机随时满电' },
{ id: 'g_wallet', name: '钱包', emoji: '👛', price: 79.00, cat: '日常用品', wish: '钱和卡放好，出门不慌' },
{ id: 'g_cap', name: '棒球帽', emoji: '🧢', price: 45.00, cat: '日常用品', wish: '压住乱发，也挡住太阳' },
{ id: 'g_hairtie', name: '头绳', emoji: '➰', price: 6.60, cat: '日常用品', wish: '吃饭前扎起来，乖乖的' },
{ id: 'g_fan', name: '小风扇', emoji: '🌀', price: 49.00, cat: '日常用品', wish: '夏天随身带的风' },
{ id: 'g_mousepad', name: '鼠标垫', emoji: '🖱️', price: 22.00, cat: '日常用品', wish: '手腕底下垫着，舒服一点' },
{ id: 'g_burger', name: '汉堡', emoji: '🍔', price: 16.00, cat: '美食', wish: '偶尔放纵一下，这顿我请' },
{ id: 'g_pizza', name: '披萨', emoji: '🍕', price: 49.00, cat: '美食', wish: '最中间那块，永远留给你' },
{ id: 'g_friedchicken', name: '炸鸡', emoji: '🍗', price: 33.00, cat: '美食', wish: '趁热吃，凉了就不脆了' },
{ id: 'g_riceball', name: '饭团', emoji: '🍙', price: 7.00, cat: '美食', wish: '偷偷捏成了心的形状' },
{ id: 'g_dumplings', name: '蒸饺', emoji: '🥟', price: 18.00, cat: '美食', wish: '一口一个，都是热乎的' },
{ id: 'g_crayfish', name: '小龙虾', emoji: '🦀', price: 88.00, cat: '美食', wish: '夏天的夜宵，必须有它' },
{ id: 'g_honey', name: '蜂蜜', emoji: '🍯', price: 32.00, cat: '美食', wish: '日子苦的时候，舀一勺' },
{ id: 'g_donut', name: '甜甜圈', emoji: '🍩', price: 9.90, cat: '甜品', wish: '圆圆的一个，圈住你' },
{ id: 'g_pancake', name: '松饼', emoji: '🥞', price: 22.00, cat: '甜品', wish: '叠得高高的，甜也加倍' },
{ id: 'g_layerscake', name: '千层', emoji: '🍰', price: 45.00, cat: '甜品', wish: '一层一层，全是甜' },
{ id: 'g_sunrise', name: '看日出', emoji: '🌅', price: 0.00, cat: '出行', wish: '今晚早点睡，明早我叫你' },
{ id: 'g_cycling', name: '骑行兜风', emoji: '🚲', price: 0.00, cat: '出行', wish: '后座坐好，马上出发' },
{ id: 'g_roadtrip', name: '自驾游', emoji: '🚗', price: 150.00, cat: '出行', wish: '方向盘归你，选歌权归我' },
{ id: 'g_pottery', name: '陶艺体验', emoji: '🎨', price: 99.00, cat: '娱乐', wish: '捏两个歪歪的杯子，正好一对' },
{ id: 'g_puzzle', name: '拼图', emoji: '🧩', price: 39.00, cat: '娱乐', wish: '拼好裱起来，挂我们房间' },
{ id: 'g_gamenight', name: '双人游戏夜', emoji: '🎮', price: 0.00, cat: '娱乐', wish: '输的洗碗，赢的点奶茶' },
{ id: 'g_listen', name: '听你吐槽', emoji: '👂', price: 0.00, cat: '关怀', wish: '说吧，我今天特别有空' },
{ id: 'g_photoshoot', name: '陪你拍照', emoji: '📸', price: 0.00, cat: '关怀', wish: '今天的你也好看，必须记录' },
{ id: 'g_bathbomb', name: '泡澡球', emoji: '🛁', price: 18.00, cat: '日常用品', wish: '泡二十分钟，累就化掉啦' },
{ id: 'g_icecube', name: '冰格', emoji: '🧊', price: 9.00, cat: '日常用品', wish: '可乐加冰，才叫夏天' },
{ id: 'g_flashlight', name: '小手电', emoji: '🔦', price: 15.00, cat: '日常用品', wish: '晚上找东西，不用摸黑' },
{ id: 'g_cardholder', name: '卡包', emoji: '💳', price: 29.00, cat: '日常用品', wish: '和钱包放一起，别丢三落四' },
{ id: 'g_planet', name: '土星', emoji: '🪐', price: 77.00, cat: '星空', wish: '带光环的那一颗，送你' },
{ id: 'g_comet', name: '彗星', emoji: '☄️', price: 66.60, cat: '星空', wish: '绕一大圈，还是会来找你' },
{ id: 'g_curry', name: '咖喱饭', emoji: '🍛', price: 26.00, cat: '美食', wish: '今天也要好好吃饭' },
{ id: 'g_friedshrimp', name: '炸虾', emoji: '🍤', price: 26.00, cat: '美食', wish: '金黄酥脆，第一口给你' },
{ id: 'g_sandwich', name: '三明治', emoji: '🥪', price: 14.00, cat: '美食', wish: '多睡十分钟，早餐我包了' },
{ id: 'g_fries', name: '薯条', emoji: '🍟', price: 11.00, cat: '美食', wish: '番茄酱分你一半' },
{ id: 'g_coconut', name: '椰子', emoji: '🥥', price: 15.00, cat: '饮品', wish: '插上吸管，假装在海边' },
{ id: 'g_fortune', name: '签语饼', emoji: '🥠', price: 9.00, cat: '美食', wish: '掰开，里面藏了一句想你' },
{ id: 'g_cupcake', name: '纸杯蛋糕', emoji: '🧁', price: 14.50, cat: '甜品', wish: '小小一个，甜得很具体' },
{ id: 'g_lollipop', name: '波板糖', emoji: '🍭', price: 8.00, cat: '甜品', wish: '甜得直白，不绕弯子' },
{ id: 'g_sundae', name: '圣代', emoji: '🍨', price: 13.00, cat: '甜品', wish: '第一口给你，樱桃也给你' },
{ id: 'g_cactus', name: '仙人掌', emoji: '🌵', price: 15.00, cat: '花束', wish: '好养活，像我一样赖着你' },
{ id: 'g_clover', name: '四叶草', emoji: '🍀', price: 6.60, cat: '花束', wish: '攒到的运气，全都给你' },
{ id: 'g_earth', name: '地球', emoji: '🌏', price: 1.00, cat: '星空', wish: '在同一个星球上，已经够近了' },
{ id: 'g_trainslow', name: '绿皮火车', emoji: '🚂', price: 45.00, cat: '出行', wish: '慢车慢慢开，风景慢慢看' },
{ id: 'g_island', name: '海岛度假', emoji: '🏝️', price: 520.00, cat: '出行', wish: '手机一关，世界只剩我们' },
{ id: 'g_hike', name: '登山', emoji: '⛰️', price: 0.00, cat: '出行', wish: '到山顶了，风替我抱你' },
{ id: 'g_supermarket', name: '逛超市之约', emoji: '🛒', price: 0.00, cat: '出行', wish: '零食区先逛，最后再结账' },
{ id: 'g_darts', name: '飞镖', emoji: '🎯', price: 25.00, cat: '娱乐', wish: '瞄得很准，第一眼就选中你' },
{ id: 'g_musicfestival', name: '音乐节', emoji: '🎟️', price: 199.00, cat: '娱乐', wish: '草坪、日落和音乐，都带上你' },
{ id: 'g_bowling', name: '保龄球', emoji: '🎳', price: 38.00, cat: '娱乐', wish: '打出全倒，要跟我击掌' },
{ id: 'g_cheer', name: '加油打气', emoji: '💪', price: 0.00, cat: '关怀', wish: '你可以的，我全程都在' },
{ id: 'g_nightcall', name: '睡前电话', emoji: '☎️', price: 0.00, cat: '关怀', wish: '响三声，就是我想你了' },
{ id: 'g_lovejournal', name: '情侣手账', emoji: '💌', price: 35.00, cat: '情侣用品', wish: '两个人的小事，都贴进去' },
{ id: 'g_pendant', name: '情侣挂件', emoji: '🐥', price: 26.00, cat: '情侣用品', wish: '一只挂你那，一只挂我这' },
{ id: 'g_sponge', name: '海绵擦', emoji: '🧽', price: 6.00, cat: '日常用品', wish: '碗筷洗干净，吃饭才香' },
{ id: 'g_pasta', name: '意面', emoji: '🍝', price: 38.00, cat: '美食', wish: '卷一大叉子，喂你' },
{ id: 'g_wrap', name: '卷饼', emoji: '🌯', price: 13.00, cat: '美食', wish: '料塞得满满的，管饱' },
{ id: 'g_salad', name: '沙拉', emoji: '🥗', price: 28.00, cat: '美食', wish: '吃草也要开开心心的' },
{ id: 'g_pretzel', name: '碱水结', emoji: '🥨', price: 10.00, cat: '美食', wish: '拧成结的小想念' },
{ id: 'g_mooncake', name: '月饼', emoji: '🥮', price: 12.00, cat: '节日节令', wish: '中秋那一口，提前补给你' },
{ id: 'g_beads', name: '手串', emoji: '📿', price: 39.00, cat: '饰品', wish: '一颗一颗，都数成平安' },
{ id: 'g_sunglasses', name: '太阳镜', emoji: '🕶️', price: 79.00, cat: '饰品', wish: '防晒防眩光，酷是附赠的' },
{ id: 'g_crystal', name: '水晶手链', emoji: '🔮', price: 55.00, cat: '饰品', wish: '粉水晶，招桃花的那种' },
{ id: 'g_shinystar', name: '亮星', emoji: '🌟', price: 3.00, cat: '星空', wish: '比旁边的星星更亮一点' },
{ id: 'g_partlycloudy', name: '多云转晴', emoji: '⛅', price: 0.00, cat: '星空', wish: '天会晴的，我一直在' },
{ id: 'g_rollercoaster', name: '过山车', emoji: '🎢', price: 35.00, cat: '出行', wish: '尖叫可以，手别松开' },
{ id: 'g_sailboat', name: '帆船出海', emoji: '⛵', price: 158.00, cat: '出行', wish: '风往哪吹，我们去哪' },
{ id: 'g_rowboat', name: '划船', emoji: '🛶', price: 30.00, cat: '出行', wish: '划到湖心，只准看我' },
{ id: 'g_taxi', name: '打车回家', emoji: '🚕', price: 25.00, cat: '出行', wish: '太晚就打车，车费我出' },
{ id: 'g_carousel', name: '旋转木马', emoji: '🎠', price: 20.00, cat: '娱乐', wish: '每转一圈，偷看你一眼' },
{ id: 'g_theater', name: '话剧之夜', emoji: '🎭', price: 120.00, cat: '娱乐', wish: '灯暗之前，牵好我的手' },
{ id: 'g_homecook', name: '做饭给你吃', emoji: '🧑‍🍳', price: 0.00, cat: '关怀', wish: '今天我下厨，翻车也好吃' },
{ id: 'g_windchime', name: '风铃', emoji: '🎐', price: 22.00, cat: '关怀', wish: '挂在窗边，风一响就想我' },
{ id: 'g_contract', name: '恋爱合约', emoji: '📜', price: 52.00, cat: '情侣用品', wish: '条款只有一条：互相喜欢' },
{ id: 'g_coat', name: '外套', emoji: '🧥', price: 159.00, cat: '日常用品', wish: '变天之前，先备上' },
{ id: 'g_dress', name: '连衣裙', emoji: '👗', price: 139.00, cat: '日常用品', wish: '穿上了，转个圈给我看' },
{ id: 'g_pencil', name: '铅笔套装', emoji: '✏️', price: 9.00, cat: '日常用品', wish: '写错了能擦，没关系的' },
{ id: 'g_bookmark', name: '书签', emoji: '🔖', price: 9.00, cat: '日常用品', wish: '读到哪页，就停在哪页' },
{ id: 'g_compass', name: '指南针', emoji: '🧭', price: 28.00, cat: '日常用品', wish: '迷路的话，朝我心跳方向走' },
{ id: 'g_couchblanket', name: '沙发盖毯', emoji: '🛋️', price: 79.00, cat: '日常用品', wish: '窝进沙发，也有暖和的一角' },
{ id: 'g_watermelon', name: '西瓜', emoji: '🍉', price: 22.00, cat: '美食', wish: '最中间那勺，挖好给你' },
{ id: 'g_lemon', name: '柠檬', emoji: '🍋', price: 9.00, cat: '美食', wish: '切片泡水，酸口也清爽' },
{ id: 'g_corn', name: '玉米', emoji: '🌽', price: 7.00, cat: '美食', wish: '路边摊那种，烫手的甜' },
{ id: 'g_tomato', name: '番茄', emoji: '🍅', price: 8.00, cat: '美食', wish: '糖拌的，是夏天的味道' },
{ id: 'g_peanut', name: '花生', emoji: '🥜', price: 8.00, cat: '美食', wish: '剥好一小堆，边看剧边吃' },
{ id: 'g_grape', name: '葡萄', emoji: '🍇', price: 18.00, cat: '甜品', wish: '一串里最甜的几颗，都给你' },
{ id: 'g_mango', name: '芒果', emoji: '🥭', price: 16.00, cat: '甜品', wish: '芒果味的夏天，先到为敬' },
{ id: 'g_brooch', name: '胸针', emoji: '🏵️', price: 48.00, cat: '饰品', wish: '别在胸口，离心脏最近的位置' },
{ id: 'g_rocket', name: '火箭', emoji: '🚀', price: 88.00, cat: '星空', wish: '想去多远都可以，落点是我这' },
{ id: 'g_ufo', name: '飞碟', emoji: '🛸', price: 66.00, cat: '星空', wish: '开这个来见你，比较快' },
{ id: 'g_starface', name: '星星眼', emoji: '💫', price: 5.00, cat: '星空', wish: '看到你就冒星星，是真的' },
{ id: 'g_kite', name: '风筝', emoji: '🪁', price: 25.00, cat: '出行', wish: '线在你手里，我跟着风跑' },
{ id: 'g_heli', name: '直升机观光', emoji: '🚁', price: 1314.00, cat: '出行', wish: '换个角度，看看我们住的城市' },
{ id: 'g_cruise', name: '游轮之夜', emoji: '🛳️', price: 888.88, cat: '出行', wish: '甲板的晚风，两个人分' },
{ id: 'g_pingpong', name: '乒乓球', emoji: '🏓', price: 20.00, cat: '娱乐', wish: '输一局亲一口，你稳赢' },
{ id: 'g_badminton', name: '羽毛球', emoji: '🏸', price: 25.00, cat: '娱乐', wish: '傍晚打一场，赢的选宵夜' },
{ id: 'g_fishing', name: '钓鱼', emoji: '🎣', price: 40.00, cat: '娱乐', wish: '钓不钓得到不重要，坐一下午' },
{ id: 'g_skating', name: '旱冰场', emoji: '🛼', price: 30.00, cat: '娱乐', wish: '摔了我扶着，想笑也行' },
{ id: 'g_piano', name: '电子琴', emoji: '🎹', price: 199.00, cat: '娱乐', wish: '学会第一首曲子，弹给你听' },
{ id: 'g_balloon', name: '气球', emoji: '🎈', price: 5.00, cat: '关怀', wish: '牵好了，飞了我帮你抓' },
{ id: 'g_camera', name: '相机', emoji: '📷', price: 334.40, cat: '日常用品', wish: '以后的日子，都用它记下来' },
{ id: 'g_radio', name: '收音机', emoji: '📻', price: 99.00, cat: '日常用品', wish: '老歌电台，配晚饭刚刚好' },
{ id: 'g_mirror', name: '梳妆镜', emoji: '🪞', price: 45.00, cat: '日常用品', wish: '出门前看一眼，今天也很美' },
{ id: 'g_sweater', name: '毛衣', emoji: '🧶', price: 129.00, cat: '日常用品', wish: '织得慢，但暖得很久' },
{ id: 'g_bathset', name: '洗浴套装', emoji: '🛀', price: 49.00, cat: '美妆个护', wish: '从头发到脚趾，都香香的' },
{ id: 'g_mosquito', name: '驱蚊套装', emoji: '🦟', price: 19.00, cat: '日常用品', wish: '夏天睡整觉，不被嗡嗡吵' },
{ id: 'g_keyboard', name: '机械键盘', emoji: '⌨️', price: 129.00, cat: '日常用品', wish: '打字再忙，也要记得回我' },
{ id: 'g_books', name: '一套好书', emoji: '📚', price: 89.00, cat: '日常用品', wish: '睡前读几页，我藏在故事里' },
{ id: 'g_speaker', name: '蓝牙音箱', emoji: '🔊', price: 139.00, cat: '日常用品', wish: '歌单一放，房间就不冷清了' },
{ id: 'g_oatmeal', name: '麦片早餐碗', emoji: '🥣', price: 39.00, cat: '日常用品', wish: '早上第一件事，是喂饱自己' },
{ id: 'g_cushion', name: '软坐垫', emoji: '🪑', price: 33.00, cat: '日常用品', wish: '久坐的日子，也要舒服一点' },
{ id: 'g_wallclock', name: '挂钟', emoji: '🕐', price: 69.00, cat: '日常用品', wish: '抬头看时间时，顺便想我一下' },
{ id: 'g_foodbox', name: '保鲜盒', emoji: '🥡', price: 29.00, cat: '日常用品', wish: '吃不完的留好，下一顿继续' },
{ id: 'g_bunny', name: '玩偶兔', emoji: '🐰', price: 59.00, cat: '日常用品', wish: '和玩偶熊凑一对，替我们值班' },
{ id: 'g_teapot', name: '一壶茶', emoji: '🫖', price: 88.00, cat: '饮品', wish: '周末下午，泡一壶慢慢喝' },
{ id: 'g_yogamat', name: '瑜伽垫', emoji: '🧘', price: 69.00, cat: '日常用品', wish: '铺开是健身房，卷起来是家' },
{ id: 'g_dumbbell', name: '小哑铃', emoji: '🏋️', price: 59.00, cat: '日常用品', wish: '举两下就算练过，我不笑话你' },
{ id: 'g_sewing', name: '缝补小盒', emoji: '🪡', price: 16.00, cat: '日常用品', wish: '扣子松了别将就，随时缝上' },
{ id: 'g_snackbox', name: '零食大礼包', emoji: '🎁', price: 66.00, cat: '日常用品', wish: '拆开全是小快乐' },
{ id: 'g_sachet', name: '助眠香囊', emoji: '🌾', price: 23.00, cat: '日常用品', wish: '放在枕头边，梦都会变软' },
{ id: 'g_fireworks', name: '烟花', emoji: '🎆', price: 99.99, cat: '娱乐', wish: '放给你看的那种，一整场' },
{ id: 'g_billiards', name: '台球', emoji: '🎱', price: 30.00, cat: '娱乐', wish: '我教你，赢了就算你的' },
{ id: 'g_yoyo', name: '悠悠球', emoji: '🪀', price: 15.00, cat: '娱乐', wish: '小时候没玩够，现在补上' },
{ id: 'g_watercolor', name: '水彩颜料', emoji: '🖌️', price: 45.00, cat: '娱乐', wish: '画我的时候，手下留情' },
{ id: 'g_guitar', name: '吉他', emoji: '🎸', price: 299.00, cat: '娱乐', wish: '抱着它唱情歌，跑调也甜' },
{ id: 'g_archery', name: '射箭体验', emoji: '🏹', price: 60.00, cat: '娱乐', wish: '瞄准了再放手，先射中我心' },
{ id: 'g_iceskate', name: '滑冰场', emoji: '⛸️', price: 35.00, cat: '娱乐', wish: '冬天限定，牵着手慢慢滑' },
{ id: 'g_sparkler', name: '仙女棒', emoji: '🎇', price: 15.00, cat: '星空', wish: '点一根举高，许个小小的愿' },
{ id: 'g_wishbamboo', name: '许愿竹', emoji: '🎋', price: 18.00, cat: '星空', wish: '愿望写好了，挂在最高处' },
{ id: 'g_magicwand', name: '魔法棒', emoji: '🪄', price: 33.00, cat: '星空', wish: '挥一下，烦恼统统消失' },
{ id: 'g_surf', name: '冲浪体验', emoji: '🏄', price: 120.00, cat: '出行', wish: '摔进海里，也算拥抱大海' },
{ id: 'g_snorkel', name: '浮潜体验', emoji: '🤿', price: 150.00, cat: '出行', wish: '海底世界很好，回来讲给你听' },
{ id: 'g_fridgemagnet', name: '情侣冰箱贴', emoji: '🧲', price: 19.00, cat: '情侣用品', wish: '一对吸在一起，谁也分不开' },
{ id: 'g_bellservice', name: '家庭服务铃', emoji: '🛎️', price: 20.00, cat: '日常用品', wish: '按一下，我立刻就到' },
{ id: 'g_projector', name: '投影仪', emoji: '📽️', price: 299.00, cat: '日常用品', wish: '客厅变小影院，只放我们爱看的' },
{ id: 'g_fountainpen', name: '钢笔', emoji: '🖋️', price: 88.00, cat: '日常用品', wish: '认真写字的人，最好看了' },
{ id: 'g_partypopper', name: '礼花筒', emoji: '🎉', price: 12.00, cat: '关怀', wish: '值得庆祝的日子，还有很多' },
{ id: 'g_specialdrink', name: '无酒精特调', emoji: '🍹', price: 28.00, cat: '饮品', wish: '举杯！敬今天也黏在一起' },
{ id: 'g_sourplum', name: '酸梅汤', emoji: '🍶', price: 8.00, cat: '饮品', wish: '冰镇过的，夏天就服它' },
{ id: 'g_bubbly', name: '气泡饮', emoji: '🍾', price: 45.00, cat: '饮品', wish: '碰一杯，庆祝我们今天也很甜' },
{ id: 'g_orange', name: '橘子', emoji: '🍊', price: 10.00, cat: '美食', wish: '剥好的，摆成一朵花给你' },
{ id: 'g_apple', name: '苹果', emoji: '🍎', price: 8.00, cat: '美食', wish: '挑最大的那个，当平安果' },
{ id: 'g_pear', name: '香梨', emoji: '🍐', price: 12.00, cat: '美食', wish: '秋天干燥，正好润一润' },
{ id: 'g_peachjuicy', name: '桃子', emoji: '🍑', price: 13.00, cat: '美食', wish: '软软的甜，熟透了才摘' },
{ id: 'g_kiwi', name: '猕猴桃', emoji: '🥝', price: 13.00, cat: '美食', wish: '维C小炸弹，一天一颗' },
{ id: 'g_pineapple', name: '菠萝', emoji: '🍍', price: 15.00, cat: '美食', wish: '盐水泡过了，不扎嘴' },
{ id: 'g_cherry', name: '车厘子', emoji: '🍒', price: 36.00, cat: '甜品', wish: '贵有贵的道理，整箱搬回' },
{ id: 'g_shavedice', name: '刨冰', emoji: '🍧', price: 11.00, cat: '甜品', wish: '红豆打底，炼乳多加一勺' },
{ id: 'g_coffee', name: '一杯美式', emoji: '☕', price: 15.00, cat: '饮品', wish: '苦一点没关系，醒得快' },
{ id: 'g_paotui', name: '帮你带一杯', emoji: '🛵', price: 0.00, cat: '饮品', wish: '想喝什么？备注里写' },
{ id: 'g_hotdog', name: '热狗', emoji: '🌭', price: 11.00, cat: '美食', wish: '加芥末还是番茄酱？都行' },
{ id: 'g_bread', name: '早餐面包', emoji: '🍞', price: 12.00, cat: '美食', wish: '刚出炉的，配牛奶正好' },
{ id: 'g_croissant', name: '可颂', emoji: '🥐', price: 10.00, cat: '美食', wish: '酥皮掉渣，也香得很' },
{ id: 'g_squid', name: '烤鱿鱼', emoji: '🦑', price: 15.00, cat: '美食', wish: '撒足孜然和辣椒面' },
{ id: 'g_waffle', name: '华夫饼', emoji: '🧇', price: 15.00, cat: '甜品', wish: '格子里都淋满了糖浆' },
{ id: 'g_eggtart', name: '蛋挞', emoji: '🥧', price: 8.00, cat: '甜品', wish: '一盒六个，趁热吃完' },
{ id: 'g_mangosago', name: '杨枝甘露', emoji: '🥭', price: 18.00, cat: '饮品', wish: '芒果西柚西米，一勺全有' },
{ id: 'g_matchalatte', name: '抹茶拿铁', emoji: '🍵', price: 16.00, cat: '饮品', wish: '微苦回甘，绿色的好心情' },
{ id: 'g_lemontea', name: '手打柠檬茶', emoji: '🍋', price: 12.00, cat: '饮品', wish: '暴打十下，冰块加满' },
{ id: 'g_grapetea', name: '多肉葡萄', emoji: '🍇', price: 18.00, cat: '饮品', wish: '果肉多到嚼不过来' },
{ id: 'g_peachtea', name: '蜜桃乌龙', emoji: '🍑', price: 16.00, cat: '饮品', wish: '一整颗桃子的香气' },
{ id: 'g_malatang', name: '麻辣烫', emoji: '🍲', price: 32.00, cat: '美食', wish: '自己挑的菜，全都下进去' },
{ id: 'g_spicywok', name: '麻辣香锅', emoji: '🌶️', price: 48.00, cat: '美食', wish: '辣度你定，我陪你吃' },
{ id: 'g_ricechicken', name: '黄焖鸡米饭', emoji: '🍚', price: 26.00, cat: '美食', wish: '汤汁拌饭，能干三碗' },
{ id: 'g_legquarter', name: '大鸡腿饭', emoji: '🍖', price: 22.00, cat: '美食', wish: '整只鸡腿，就盖在你饭上' },
{ id: 'g_taco', name: '塔可', emoji: '🌮', price: 16.00, cat: '美食', wish: '馅料满满，一口一个' },
{ id: 'g_baguette', name: '法棍', emoji: '🥖', price: 10.00, cat: '美食', wish: '外皮脆脆的，敲着响' },
{ id: 'g_bagel', name: '贝果', emoji: '🥯', price: 12.00, cat: '美食', wish: '嚼劲十足，配奶油更好' },
{ id: 'g_medfever', name: '退烧药', emoji: '💉', price: 18.00, cat: '药品医护', wish: '烧到难受才吃，吃完好好睡' },
{ id: 'g_medanti', name: '消炎药', emoji: '🧪', price: 26.00, cat: '药品医护', wish: '伤口发炎别硬扛，按时吃' },
{ id: 'g_medpain', name: '止痛药', emoji: '🩺', price: 20.00, cat: '药品医护', wish: '疼得睡不着就吃一片，别忍着' },
{ id: 'g_medstomach', name: '胃药', emoji: '🫙', price: 24.00, cat: '药品医护', wish: '胃不舒服冲一包，别空着肚子' },
{ id: 'g_medcough', name: '止咳糖浆', emoji: '🍯', price: 19.00, cat: '药品医护', wish: '咳得厉害喝一口，甜的润嗓子' },
{ id: 'g_medthroat', name: '润喉糖', emoji: '🍬', price: 9.90, cat: '药品医护', wish: '嗓子哑了含一颗，今天少说话' },
{ id: 'g_medeye', name: '眼药水', emoji: '💧', price: 16.00, cat: '药品医护', wish: '看久了滴一滴，眼睛也要歇' },
{ id: 'g_medfloral', name: '花露水', emoji: '🌿', price: 14.00, cat: '药品医护', wish: '夏天蚊子多，出门前喷一点' },
{ id: 'g_medvc', name: '维生素C', emoji: '🍊', price: 46.00, cat: '药品医护', wish: '一天一片，少感冒一次是一次' },
{ id: 'g_medhuoxiang', name: '藿香正气水', emoji: '🥃', price: 12.00, cat: '药品医护', wish: '中暑头晕喝一支，苦但管用' },
{ id: 'g_mediodine', name: '碘伏', emoji: '🧴', price: 12.00, cat: '药品医护', wish: '破皮先消毒，这两天别沾水' },
{ id: 'g_medswab', name: '医用棉签', emoji: '🧷', price: 6.00, cat: '药品医护', wish: '换药的时候用得着，我来' },
{ id: 'g_medgauze', name: '纱布绷带', emoji: '🩼', price: 15.00, cat: '药品医护', wish: '包好了别乱动，明天我换药' },
{ id: 'g_medliniment', name: '跌打药酒', emoji: '🍶', price: 32.00, cat: '药品医护', wish: '磕青了要揉开，手给我，我来揉' },
{ id: 'g_medice', name: '冰袋', emoji: '🧊', price: 8.00, cat: '药品医护', wish: '肿起来先冰一会儿，别急着揉' },
{ id: 'g_periodtea', name: '红糖姜茶', emoji: '🫖', price: 15.00, cat: '药品医护', wish: '疼的时候喝一口，热的' },
{ id: 'g_periodwarm', name: '暖宝宝贴', emoji: '🔥', price: 9.90, cat: '药品医护', wish: '贴在小肚子上，别硬扛' },
{ id: 'g_periodbag', name: '热水袋', emoji: '♨️', price: 26.00, cat: '药品医护', wish: '灌满热水，抱着它躺下' },
{ id: 'g_periodpad', name: '痛经贴', emoji: '💗', price: 12.90, cat: '药品医护', wish: '贴一片，疼会轻一点' },
{ id: 'g_festzongzi', name: '粽子', emoji: '🫔', price: 12.00, cat: '节日节令', wish: '端午的咸蛋黄，挑最大的给你' },
{ id: 'g_festtangyuan', name: '汤圆', emoji: '🍡', price: 13.14, cat: '节日节令', wish: '一人一半，团团圆圆' },
{ id: 'g_festniangao', name: '年糕', emoji: '🍥', price: 16.00, cat: '节日节令', wish: '年年高一点点，我们一起' },
{ id: 'g_festlaba', name: '腊八粥', emoji: '🥣', price: 10.00, cat: '节日节令', wish: '腊八这天，先把胃暖上' },
{ id: 'g_festjiaozi', name: '手工饺子', emoji: '🥟', price: 22.00, cat: '节日节令', wish: '一起包的，歪的也算数' },
{ id: 'g_festqingtuan', name: '青团', emoji: '🍃', price: 9.00, cat: '节日节令', wish: '把春天包进去，甜的那种' },
{ id: 'g_festgingerbread', name: '圣诞姜饼', emoji: '🍪', price: 18.00, cat: '节日节令', wish: '咬一口，冬天就甜了' },
{ id: 'g_beautylip', name: '口红', emoji: '💋', price: 128.00, cat: '美妆个护', wish: '涂上它，我多说两句好听的' },
{ id: 'g_beautyperfume', name: '香水', emoji: '🫧', price: 268.00, cat: '美妆个护', wish: '喷一点，走近了才闻得到' },
{ id: 'g_beautyfacial', name: '面膜', emoji: '🧖', price: 89.00, cat: '美妆个护', wish: '敷着别动，这十五分钟归我' },
{ id: 'g_beautysun', name: '防晒霜', emoji: '☀️', price: 78.00, cat: '美妆个护', wish: '太阳再大，也先护着你' },
{ id: 'g_beautybody', name: '身体乳', emoji: '💧', price: 68.00, cat: '美妆个护', wish: '洗完澡记得涂，滑滑的好抱' },
{ id: 'g_beautyhair', name: '护发精油', emoji: '🌿', price: 96.00, cat: '美妆个护', wish: '头发顺了，扎起来也好看' },
{ id: 'g_beautynail', name: '美甲套装', emoji: '💅', price: 68.00, cat: '美妆个护', wish: '指甲换个新颜色，给我看看' },
{ id: 'g_beautybrush', name: '化妆刷', emoji: '🖌️', price: 45.00, cat: '美妆个护', wish: '刷子在手里，你最好看' },
{ id: 'g_beautyshadow', name: '眼影盘', emoji: '🎨', price: 99.00, cat: '美妆个护', wish: '画个亮一点的，今天要出门' },
{ id: 'g_beautycotton', name: '化妆棉', emoji: '🧽', price: 12.00, cat: '美妆个护', wish: '卸干净再睡，别懒' },
{ id: 'g_bellyrub', name: '帮你揉肚子', emoji: '🫳', price: 0.00, cat: '关怀', wish: '手搓热了，揉到你不疼' },
{ id: 'g_liedown', name: '陪你躺一天', emoji: '🛋️', price: 0.00, cat: '关怀', wish: '什么都不干，就躺着陪你' },
{ id: 'g_lily', name: '百合', emoji: '🌺', price: 25.00, cat: '花束', wish: '百年好合，说的就是我们' },
{ id: 'g_carnation', name: '康乃馨', emoji: '🏵️', price: 15.00, cat: '花束', wish: '温柔的话，都包在这朵里' },
{ id: 'g_hydrangea', name: '绣球', emoji: '💮', price: 68.00, cat: '花束', wish: '一整球，圆圆满满给你' },
{ id: 'g_lotus', name: '荷花', emoji: '🪷', price: 26.00, cat: '花束', wish: '清清淡淡，也很好看' },
{ id: 'g_champagne', name: '香槟玫瑰', emoji: '🥂', price: 66.00, cat: '花束', wish: '颜色像香槟，看一眼就想庆祝' },
{ id: 'g_driedflower', name: '干花束', emoji: '🥀', price: 12.00, cat: '花束', wish: '干了也不扔，和心意一样耐放' },
{ id: 'g_ginkgo', name: '银杏叶', emoji: '🍁', price: 8.80, cat: '花束', wish: '秋天第一片，夹进你的书里' },
{ id: 'g_dandelion', name: '蒲公英', emoji: '🍃', price: 6.60, cat: '花束', wish: '吹散之前，愿望都归你' }
];
    const CUSTOM_KEY = 'market-custom';
    function goodsList() {
        const custom = store.get(CUSTOM_KEY) || [];
        const off = new Set(store.get('market-off') || []);   // 下架名单（内置/自建都可下架）
        return DEF_GOODS.concat(custom).filter(g => g && g.id && !off.has(g.id));
    }
    function goodsAddCustom(g) {
        if (!g || !String(g.name || '').trim() || !Number.isSafeInteger(toFen(g.price)) || Number(g.price) < 0) return false;
        if (String(g.img || '').length > 1200000) throw Error('单件图片过大，请选择较小的图片');
        const custom = store.get(CUSTOM_KEY) || [];
        const item = { id: 'u_' + crypto.randomUUID(), name: String(g.name), emoji: g.emoji || '🎁', img: g.img || '', price: Math.round(Number(g.price) * 100) / 100, cat: CATS.includes(g.cat) ? g.cat : '日常用品', wish: g.wish || '送给你' };
        custom.unshift(item); if (new Blob([JSON.stringify(custom)]).size > 3 * 1024 * 1024) throw Error('自定义商品库超过 3MB，请减小图片'); store.set(CUSTOM_KEY, custom);
        return item;
    }
    function goodsSetOff(id, off) {
        const list = new Set(store.get('market-off') || []);
        if (off) list.add(id); else list.delete(id);
        store.set('market-off', Array.from(list));
    }
    function findGoods(id) { return goodsList().find(g => g.id === id) || null; }

    /* ---------------- 双向心愿单（按对象） ---------------- */
    const WL_MY = 'gift-wishlist', WL_TA = 'gift-wishlist-ta';
    const wishSnap = g => ({ giftId: g.id, name: g.name, emoji: g.emoji, img: g.img || '', price: g.price, cat: g.cat, wish: g.wish || '送给你', tm: Date.now() });
    const wishLoad = key => store.get(pKey(key)) || [];
    const wishSave = (key, a) => store.set(pKey(key), a);
    function wishMyAdd(g) {
        const a = wishLoad(WL_MY);
        if (a.some(x => x.giftId === g.id)) return false;
        a.unshift({...wishSnap(g), checkAfter: Date.now()+randInt(3000,8000), initialChecked:false}); wishSave(WL_MY, a.slice(0, CFG.wishMax));
        return true;
    }
    function wishTaRemove(id) { wishSave(WL_TA, wishLoad(WL_TA).filter(x => x.giftId !== id)); }
    const wishTaHas = id => wishLoad(WL_TA).some(x => x.giftId === id);

    /* ---------------- 心意柜（按对象） ---------------- */
    const BOX_KEY = 'giftbox-items';
    const boxLoad = () => store.get(pKey(BOX_KEY)) || [];
    function boxAdd(gift, side, wish) {
        const box = boxLoad();
        const e = { id: 'gb_' + crypto.randomUUID(), giftId: gift.id, name: gift.name, emoji: gift.emoji, img: gift.img || '', price: gift.price, cat: gift.cat, wish: wish, side: side, tm: Date.now(), replies: [] };
        if (side === 'in') e.claimed = 0;
        box.unshift(e); store.set(pKey(BOX_KEY), box);
        return e;
    }
    // 把回话挂回那件礼物的记录；同人同句短时间内重复投递会被吞（聊天/柜子双路径防双发）
    function boxAttachReply(boxId, who, text) {
        if (!boxId || !text) return false;
        const box = boxLoad();
        const it = box.find(x => x.id === boxId);
        if (!it) return false;
        if (!Array.isArray(it.replies)) it.replies = [];
        const last = it.replies[it.replies.length - 1];
        if (it.replies.some(r => r.who === who && r.text === text && Date.now() - r.ts < 10 * 60 * 1000)) return false;
        it.replies.push({ who: who, text: String(text), ts: Date.now() });
        store.set(pKey(BOX_KEY), box);
        return true;
    }

    /* ---------------- 赠言与回话文案 ---------------- */
    // TA 的赠言：商品 wish 打底，60% 再拼 1–5 条随机字卡
    function taWishText(gift) {
        let wish = (gift && gift.wish) || '送给你';
        const pool = (host.getCardPool() || []).filter(s => typeof s === 'string' && s.trim());
        if (pool.length && Math.random() < 0.6) {
            const copy = pool.slice(); const extras = [];
            const n = 1 + Math.floor(Math.random() * Math.min(5, copy.length));
            while (extras.length < n && copy.length) extras.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
            if (extras.length) wish += ' ' + extras.join(' ');
        }
        return wish;
    }
    const REPLY_GENERIC = ['哇，谢谢亲爱的～', '你怎么知道我想要这个！', '收到啦，超喜欢❤', '破费啦，我好好收着', '嘿嘿，被你宠到了', '这份我喜欢，收下啦', '已经摆进心意柜最上层了'];
    const REPLY_WISH = ['我的心愿被你实现啦！', '真的买下啦…说好不让你乱花钱的', '许愿时没想过真能收到，谢谢～', '心愿单少了一件，开心值满格', '你记得我的心愿，这个最戳我'];
    function enqueue(kind, payload, delay = 0) {
        const queue = store.get('outbox') || [];
        // Existing chat actions parse message IDs as numbers; keep them monotonic and collision-free.
        const id = Math.max(Date.now() * 1000, Number(store.get('event-seq')) + 1 || 1);
        store.set('event-seq', id);
        const event = { id, kind, payload, session: host.sessionId(), dueAt: Date.now() + delay };
        queue.push(event); store.set('outbox', queue); return event;
    }
    function giftReplyFeedback(gift, boxId, satisfied) {
        if (!CFG.giftReplyOn || Math.random() * 100 >= CFG.giftReplyPct) return;
        const mode = CFG.giftReplyMode;
        const useChatStyle = mode === 1 || (mode === 2 && Math.random() < 0.4);
        enqueue('reply', { giftId: gift.id, boxId, satisfied, useChatStyle }, randInt(900, 2400));
    }
    function giftPayload(gift, side, wish, entry) {
        return { side: side === 'out' ? 'out' : 'in', special: 'gift', giftSelf: side === 'self' ? 1 : 0,
            giftId: gift.id, giftName: gift.name, giftEmoji: gift.emoji, giftImg: gift.img || '',
            giftPrice: gift.price, giftWish: wish, giftCat: gift.cat, giftBoxId: entry.id, ts: Date.now() };
    }
    function queueGift(gift, side, wish, delay = 0) {
        const entry = boxAdd(gift, side, wish);
        const event = enqueue('gift', giftPayload(gift, side, wish, entry), delay);
        const box = boxLoad(), saved = box.find(x => x.id === entry.id);
        saved.messageId = event.id; saved.session = event.session; saved.deliverAt = event.dueAt;
        saved.silent = side === 'self' && !CFG.selfChatOn;
        event.payload.silent = saved.silent;
        // update payload after the event was serialized
        const queue = store.get('outbox'); queue.find(x => x.id === event.id).payload.silent = saved.silent;
        store.set('outbox', queue); store.set(pKey(BOX_KEY), box);
        return entry;
    }
    let flushing = false;
    async function flush() {
        if (flushing || !host.ready()) return;
        flushing = true;
        try {
            for (const item of store.get('outbox') || []) {
                if (item.dueAt > Date.now()) continue;
                let event = item;
                if (event.kind === 'reply' && !event.payload.text) {
                    atomic(() => {
                        const queue = store.get('outbox') || [];
                        event = queue.find(x => x.id === item.id);
                        if (!event) return;
                        const p = event.payload, pool = (host.getCardPool() || []).filter(Boolean);
                        p.text = (p.useChatStyle && pool.length ? pick(pool) : '') || pick(p.satisfied ? REPLY_WISH : REPLY_GENERIC);
                        boxAttachReply(p.boxId, 'ta', p.text);
                        store.set('outbox', queue);
                    });
                    if (!event) continue;
                }
                if (event.kind === 'gift' && !event.payload.silent) await host.onGiftCard(event.payload, event);
                else if (event.kind === 'wish') await host.onWishCard(event.payload, event);
                else if (event.kind === 'reply') await host.onReply(event.payload.text, event.payload, event);
                atomic(() => store.set('outbox', (store.get('outbox') || []).filter(x => x.id !== event.id)));
                host.changed();
            }
        } finally { flushing = false; }
    }

    /* ---------------- 购买与送礼 ---------------- */
    // side: 'out' = 我送 TA（扣我的余额）；'in' = TA 送我（扣 TA 的余额）
    function buyAndSend(gift, side, wish) {
        if (!gift || !['out','in'].includes(side) || !Number.isSafeInteger(toFen(gift.price)) || gift.price < 0) return false;
        const priceFen = toFen(gift.price || 0);
        const w = walletGet();
        if (side === 'out') { if (w.myBalance < priceFen) { host.toast('心意币不够啦'); return false; } w.myBalance -= priceFen; }
        else { if (w.systemBalance < priceFen) return false; w.systemBalance -= priceFen; }
        const satisfied = wishTaHas(gift.id);
        walletChange(side === 'out' ? -priceFen : 0, side === 'in' ? -priceFen : 0, side === 'out' ? '市集送礼' : 'TA送礼');
        const entry = queueGift(gift, side, wish);
        if (side === 'out') {
            if (satisfied) wishTaRemove(gift.id);
            giftReplyFeedback(gift, entry.id, satisfied);
        }
        return true;
    }
    // 我买下 TA 心愿单里的一件（心愿卡上的「送 TA」就走这里）
    function buyFromTaWish(giftId, wishText) {
        const g = findGoods(giftId);
        if (!g) return false;
        if (!wishTaHas(giftId)) { host.toast(host.partnerName() + ' 的心愿单里已经没有这件啦'); return false; }
        return buyAndSend(g, 'out', (wishText || '').trim() || g.wish || '心意');
    }

    /* ---------------- TA 自动行为引擎 ---------------- */
    const dayCount = prefix => Number(store.get(pKey(prefix + todayKey())) || 0);
    const dayIncr = prefix => store.set(pKey(prefix + todayKey()), dayCount(prefix) + 1);
    function deliverInGift(gift, wish, delayMs) { queueGift(gift, 'in', wish, delayMs); }
    function purchaseWish(item) {
        if (!item) return false;
        const list=wishLoad(WL_MY),fen=toFen(item.price||0);
        if (!list.some(x=>x.giftId===item.giftId)||walletGet().systemBalance<fen) return false;
        walletChange(0,-fen,'买下心愿');
        wishSave(WL_MY,list.filter(x=>x.giftId!==item.giftId));
        dayIncr('hm-gift-daily-');
        deliverInGift({...item,id:item.giftId},item.wish,randInt(CFG.deliverMinMs,CFG.deliverMaxMs));
        return true;
    }
    function checkPendingWishes() {
        if (!host.ready()||host.isNight()||host.rateLimitFull()||!CFG.wlOn||!CFG.giftInOn||dayCount('hm-gift-daily-')>=CFG.autoDayMax) return;
        const list=wishLoad(WL_MY),item=list.find(x=>x.initialChecked===false&&x.checkAfter<=Date.now());
        if (!item) return;
        item.initialChecked=true;
        wishSave(WL_MY,list);
        if (Math.random()*100<CFG.wlBuyPct) purchaseWish(item);
    }
    // 宿主在每轮聊天活动结束后调用一次（先过夜间/限流两道总闸，再按顺序掷四把骰子）
    function autoTick() {
        if (host.isNight() || host.rateLimitFull()) return;
        const gifts = goodsList();
        if (!gifts.length) return;
        const autoCapped = dayCount('hm-gift-daily-') >= CFG.autoDayMax;
        const selfCapped = dayCount('hm-self-daily-') >= CFG.selfDayMax;
        // 1) 买下我的心愿单（20%）
        if (CFG.wlOn && CFG.giftInOn && !autoCapped) {
            const myWl = wishLoad(WL_MY);
            if (myWl.length && Math.random() * 100 < CFG.wlBuyPct) {
                const affordable=myWl.filter(item=>toFen(item.price||0)<=walletGet().systemBalance);
                if (purchaseWish(pick(affordable))) return;
            }
        }
        // 2) TA 给自己买（10%）
        if (CFG.selfOn && !selfCapped && Math.random() * 100 < CFG.selfPct) {
            const w = walletGet();
            const affordable = gifts.filter(g => toFen(g.price || 0) <= w.systemBalance);
            const g = pick(affordable.length ? affordable : gifts);
            if (g) {
                const fen = toFen(g.price || 0);
                if (w.systemBalance >= fen) {
                    walletChange(0, -fen, 'TA自购');
                    dayIncr('hm-self-daily-');
                    queueGift(g, 'self', g.wish || '送给自己', randInt(CFG.deliverMinMs, CFG.deliverMaxMs));
                    return;
                }
            }
        }
        // 3) TA 往自己心愿单加一件（15%），并按概率把心愿卡推到聊天
        if (CFG.wlOn && Math.random() * 100 < CFG.wlAddPct) {
            const taWl = wishLoad(WL_TA);
            const has = new Set(taWl.map(x => x.giftId));
            const pool = gifts.filter(g => !has.has(g.id));
            if (pool.length) {
                const g = pick(pool);
                taWl.unshift(wishSnap(g)); wishSave(WL_TA, taWl.slice(0, CFG.wishMax));
                if (CFG.wishChatOn && dayCount('hm-wishchat-daily-') < CFG.wishChatDayMax && Math.random() * 100 < CFG.wishChatPct) {
                    dayIncr('hm-wishchat-daily-');
                    enqueue('wish', { side: 'in', special: 'wish', wishGiftId: g.id, wishGiftName: g.name, wishGiftEmoji: g.emoji, wishGiftImg: g.img || '', wishGiftPrice: g.price, wishGiftCat: g.cat, wishGiftWish: g.wish || '送给你', text: '想要「' + g.name + '」', wishTs: Date.now() });
                } else {
                    host.toast(host.partnerName() + ' 把「' + g.name + '」加进了 TA 的心愿单');
                }
                return;
            }
        }
        // 4) 直接送我一件（5%）
        if (CFG.giftInOn && !autoCapped && Math.random() * 100 < CFG.giftInPct) {
            const w = walletGet();
            const affordable = gifts.filter(g => toFen(g.price || 0) <= w.systemBalance);
            const g = pick(affordable.length ? affordable : gifts);
            if (g) {
                const fen = toFen(g.price || 0);
                if (w.systemBalance >= fen) {
                    walletChange(0, -fen, 'TA送礼');
                    dayIncr('hm-gift-daily-');
                    deliverInGift(g, taWishText(g), randInt(CFG.deliverMinMs, CFG.deliverMaxMs));
                }
            }
        }
    }

    // v2 packets escrow funds until received; legacy direct transfers are already settled.
    function transferList() { return (store.get('transfers') || []).map(x => x.version ? x : {...x,version:1,status:'received',side:'out',settled:true,synced:false}); }
    function transferRandom(side = 'in') {
        const balance = walletGet()[side === 'out' ? 'myBalance' : 'systemBalance'];
        if (balance < 1) return 0;
        const r = Math.random(), special = [520,1314,5200,13140,52000,131400].filter(n => n <= balance);
        return r < .4 && special.length ? pick(special) : randInt(1, r < .8 ? Math.min(balance,52000) : balance);
    }
    function transferSend(input) {
        if (!input || !Number.isSafeInteger(input.fen) || input.fen <= 0 || !input.id || !input.session) throw Error('金额无效');
        const list = transferList(), existing = list.find(x => x.id === input.id);
        if (existing) return existing;
        const side = input.side === 'in' ? 'in' : 'out';
        if (walletGet()[side === 'out' ? 'myBalance' : 'systemBalance'] < input.fen) throw Error('心意币余额不足');
        walletChange(side === 'out' ? -input.fen : 0, side === 'in' ? -input.fen : 0, '红包发出');
        const tx = {...input,side,version:2,status:'pending',createdAt:Date.now(),claimAt:Date.now()+randInt(2500,5000),expiresAt:Date.now()+86400000,firstChecked:false,nextCheck:0,delivered:false,synced:false};
        list.push(tx); store.set('transfers',list); return tx;
    }
    function transferSettle(id,status) {
        const list = transferList(), tx = list.find(x => x.id === id);
        if (!tx || tx.status !== 'pending' || !['received','returned','expired'].includes(status)) return tx;
        if (Date.now() >= tx.expiresAt) status = 'expired';
        const toMy = status === 'received' ? tx.side === 'in' : tx.side === 'out';
        walletChange(toMy ? tx.fen : 0, toMy ? 0 : tx.fen, status === 'received' ? '红包领取' : status === 'expired' ? '红包过期退回' : '红包退回');
        tx.status=status;tx.synced=false;tx.settledAt=Date.now();tx.feedbackAt=Date.now()+randInt(400,1200);
        tx.feedbackId=tx.id+1;tx.replyId=tx.id+2;
        if(tx.side==='out' && status==='received' && Math.random()*100<CFG.rpReplyPct){
            const chat = CFG.rpReplyMode===1 || (CFG.rpReplyMode===2 && Math.random()<.4);
            tx.replyText = String((chat ? pick(host.getCardPool()) : null) || pick(['收到你的心意啦，谢谢宝宝。','红包收下啦，想抱抱宝宝。','谢谢宝宝，今天也被你惦记着。','爱你宝宝','想你了宝宝！','亲亲宝宝']));
        }
        store.set('transfers',list);return tx;
    }
    function transferTick() {
        for(const tx of transferList()) {
            if(tx.status!=='pending')continue;
            if(Date.now()>=tx.expiresAt){transferSettle(tx.id,'expired');continue;}
            if(tx.side!=='out'||Date.now()<tx.claimAt)continue;
            let outcome;
            if(!tx.firstChecked){const r=Math.random();outcome=r<.2?'returned':r<.9?'received':null;}
            else if(Date.now()>=tx.nextCheck)outcome=Math.random()<.08?'received':null;
            else continue;
            if(outcome)transferSettle(tx.id,outcome);
            else {const list=transferList(),item=list.find(x=>x.id===tx.id);item.firstChecked=true;item.nextCheck=Date.now()+60000;store.set('transfers',list);}
        }
    }
    function transferAuto() {
        if(!CFG.rpAutoOn||!host.ready()||host.isNight()||host.rateLimitFull()||dayCount('rp-daily-')>=5||Math.random()*100>=CFG.rpAutoPct)return;
        const fen=transferRandom();if(!fen)return;
        const id=Date.now()*1000+randInt(0,899);
        transferSend({id,messageId:id,session:String(host.sessionId()),partnerName:host.partnerName(),side:'in',fen,note:'给你一点小心意',cover:'heart'});dayIncr('rp-daily-');
    }
    function transferUpdate(id, changes) {
        const list=transferList(),tx=list.find(x=>x.id===id);if(!tx)return;
        for(const key of ['delivered','synced','feedbackSent'])if(key in changes)tx[key]=!!changes[key];
        store.set('transfers',list);return tx;
    }
    function wishMyRemove(id) { wishSave(WL_MY, wishLoad(WL_MY).filter(x => x.giftId !== id)); }
    function claim(id) {
        const box = boxLoad(), entry = box.find(x => x.id === id);
        if (!entry || entry.side !== 'in' || entry.deliverAt > Date.now()) return false;
        entry.claimed = 1; store.set(pKey(BOX_KEY), box); return true;
    }
    function settingsSave(next) {
        const clean = { ...CFG };
        for (const key of Object.keys(clean)) {
            if (!(key in next)) continue;
            if (typeof clean[key] === 'boolean') clean[key] = !!next[key];
            else if (Number.isFinite(Number(next[key])) && Number(next[key]) >= 0) clean[key] = Number(next[key]);
        }
        store.set('settings', clean); Object.assign(CFG, clean);
    }
    return {
        init, config: CFG, cats: CATS, flush,
        transfers: { list: transferList, random: transferRandom, send: mutate(transferSend), update: mutate(transferUpdate), settle: mutate(transferSettle), tick: mutate(transferTick), auto: mutate(transferAuto) },
        wallet: { get: walletGet, set: mutate(walletSet), change: mutate(walletChange), ask: mutate(walletAsk) },
        ledger: { list: ledgerLoad },
        goods: { list: goodsList, addCustom: mutate(goodsAddCustom), setOff: mutate(goodsSetOff), find: findGoods,
            restore: mutate(() => store.set('market-off', [])),
            custom: () => store.get(CUSTOM_KEY) || [] },
        wish: {
            checkPending: mutate(checkPendingWishes), myList: () => wishLoad(WL_MY), myAdd: mutate(wishMyAdd), myRemove: mutate(wishMyRemove),
            taList: () => wishLoad(WL_TA), taRemove: mutate(wishTaRemove), taHas: wishTaHas,
            unread: () => wishLoad(WL_TA).filter(x => x.tm > (store.get(pKey('wish-read')) || 0)).length,
            read: mutate(() => store.set(pKey('wish-read'), Date.now()))
        },
        box: { list: () => boxLoad().filter(x => !x.deliverAt || x.deliverAt <= Date.now()), attachReply: mutate(boxAttachReply), claim: mutate(claim) },
        settings: { save: mutate(settingsSave) },
        buy: mutate((giftId, wishText) => { const g = findGoods(giftId); return g ? buyAndSend(g, 'out', (wishText || '').trim().slice(0,60) || g.wish || '心意') : false; }),
        buyFromTaWish: mutate(buyFromTaWish),
        autoTick: mutate(autoTick)
    };
})();
