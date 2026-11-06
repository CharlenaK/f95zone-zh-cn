// ==UserScript==
// @name         F95zone 汉化
// @namespace    https://github.com/f95zone-zh-cn
// @version      0.3.18
// @description  F95zone 定向翻译脚本 — 双引擎架构：XenForo SSR 增量选择器定位 + SAM DOM 增量翻译
// @author       f95zone-zh-cn
// @match        *://f95zone.to/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      cdn.jsdelivr.net
// @updateURL    https://raw.githubusercontent.com/CharlenaK/f95zone-zh-cn/main/f95_script.user.js
// @downloadURL  https://raw.githubusercontent.com/CharlenaK/f95zone-zh-cn/main/f95_script.user.js
// @noframes
// @license      GPL-3.0
// ==/UserScript==

(function() {
    'use strict';

    // ==================== Debug 配置 ====================
    var DEBUG = false;  // 发布时改为 false
    var PREFIX = '[F95汉化]';
    var DBG_GROUP = PREFIX + ' ';  // console.group 用

    function log() {
        if (!DEBUG) return;
        var args = [PREFIX].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, args);
    }

    function logGroup(label, fn) {
        if (!DEBUG) return fn();
        console.groupCollapsed(DBG_GROUP + label);
        var result = fn();
        console.groupEnd();
        return result;
    }

    function logTable(obj) {
        if (!DEBUG) return;
        console.log(PREFIX, obj);
    }

    // ==================== 字典派生缓存与刷新通知 ====================

    /**
     * 字典热更新后通知两个引擎重建各自的快照。
     * 引擎启动时会捕获 DICT 的嵌套对象引用，热更新替换顶层对象后必须重新注册，
     * 否则会出现"缓存已更新、页面翻译仍是旧版"。
     */
    var DICT_REFRESH_HOOKS = [];
    function onDictRefresh(fn) {
        DICT_REFRESH_HOOKS.push(fn);
    }
    function emitDictRefresh() {
        DICT_REFRESH_HOOKS.forEach(function(fn) {
            try { fn(); } catch (e) { log('字典刷新回调失败: ' + e.message); }
        });
    }

    /**
     * 把字典（JSON 解析结果）递归转换为 null 原型对象。
     * 这样可以安全地做 dict[key] 取值：即使 DOM 文本或字段名恰好是
     * "__proto__" / "constructor"，也不会取到 Object.prototype 上的成员。
     */
    function hardenDict(value) {
        if (Array.isArray(value)) {
            return value.map(hardenDict);
        }
        if (value && typeof value === 'object') {
            var out = Object.create(null);
            Object.keys(value).forEach(function(k) {
                out[k] = hardenDict(value[k]);
            });
            return out;
        }
        return value;
    }

    /** 取字典中真正参与翻译的键（忽略 _note 等注释键），按对象身份缓存 */
    var _visibleKeysCache = new WeakMap();
    function visibleKeys(obj) {
        if (!obj || typeof obj !== 'object') return [];
        var cached = _visibleKeysCache.get(obj);
        if (cached) return cached;
        var keys = Object.keys(obj).filter(function(k) { return k.charAt(0) !== '_'; });
        _visibleKeysCache.set(obj, keys);
        return keys;
    }

    /** 读取 ui_strings 中的界面文案（动态拼接/兜底用） */
    function uiText(key, fallback) {
        var map = DICT.ui_strings || {};
        var value = map[key];
        return (typeof value === 'string' && value) ? value : fallback;
    }

    /** 读取带占位符的界面文案，支持 {n}/{was}/{year}/{month}/{day}/{time} */
    function uiFmt(key, fallback, vars) {
        return uiText(key, fallback).replace(/\{(\w+)\}/g, function(_, name) {
            return vars && vars[name] !== undefined ? vars[name] : '';
        });
    }

    /** 去掉被其他根包含的节点，避免同一子树被重复翻译（两个引擎共用） */
    function pruneContained(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var r = list[i];
            var contained = false;
            for (var j = 0; j < out.length; j++) {
                if (out[j] === r || out[j].contains(r)) { contained = true; break; }
            }
            if (contained) continue;
            out = out.filter(function(o) { return !r.contains(o); });
            out.push(r);
        }
        return out;
    }

    // ==================== 远程字典 HTML 白名单清洗 ====================

    // 只放行翻译实际需要的行内排版标签；SCRIPT/STYLE/IFRAME/SVG 等一律删除。
    var ALLOWED_HTML_TAGS = {
        P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, S: 1, DEL: 1, INS: 1,
        SPAN: 1, A: 1, SMALL: 1, SUP: 1, SUB: 1, CODE: 1, PRE: 1,
        UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1
    };
    var DANGEROUS_HTML_TAGS = {
        SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, SVG: 1, MATH: 1,
        FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1, SELECT: 1, OPTION: 1,
        LINK: 1, META: 1, BASE: 1, TEMPLATE: 1, NOSCRIPT: 1, VIDEO: 1, AUDIO: 1
    };
    var _sanitizeCache = new Map();

    function sanitizeStyleAttr(value) {
        return String(value || '').split(';').map(function(decl) {
            var idx = decl.indexOf(':');
            if (idx < 0) return '';
            var prop = decl.slice(0, idx).trim().toLowerCase();
            var val = decl.slice(idx + 1).trim();
            // 翻译字典只需要颜色；其余（含 background/url/expression）一律丢弃
            if (prop !== 'color') return '';
            if (/^#[0-9a-f]{3,8}$/i.test(val)) return 'color:' + val;
            if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%]+\)$/i.test(val)) return 'color:' + val;
            if (/^[a-z]{3,20}$/i.test(val)) return 'color:' + val;
            return '';
        }).filter(Boolean).join('; ');
    }

    function sanitizeHrefAttr(value) {
        var v = String(value || '').trim();
        if (/^(https?:|mailto:|\/|#)/i.test(v) && !/^javascript:/i.test(v)) return v;
        return null;
    }

    function sanitizeHtmlNode(node) {
        var children = Array.prototype.slice.call(node.childNodes);
        children.forEach(function(child) {
            if (child.nodeType === 8) { // 注释
                node.removeChild(child);
                return;
            }
            if (child.nodeType !== 1) return;

            var tag = child.tagName;
            if (DANGEROUS_HTML_TAGS[tag]) {
                node.removeChild(child);
                return;
            }
            if (!ALLOWED_HTML_TAGS[tag]) {
                // 未知标签：保留其文本/子节点，去掉标签本身
                sanitizeHtmlNode(child);
                while (child.firstChild) node.insertBefore(child.firstChild, child);
                node.removeChild(child);
                return;
            }

            sanitizeHtmlNode(child);
            Array.prototype.slice.call(child.attributes).forEach(function(attr) {
                var name = attr.name.toLowerCase();
                if (name === 'class' || name === 'aria-hidden') return;
                if (name === 'style') {
                    var style = sanitizeStyleAttr(attr.value);
                    if (style) child.setAttribute('style', style);
                    else child.removeAttribute('style');
                    return;
                }
                if (name === 'href' && tag === 'A') {
                    var href = sanitizeHrefAttr(attr.value);
                    if (href) child.setAttribute('href', href);
                    else child.removeAttribute('href');
                    return;
                }
                child.removeAttribute(attr.name);
            });
        });
    }

    /** 把字典中的 HTML 值清洗为安全的行内 HTML；结果按字符串缓存 */
    function sanitizeHtml(html) {
        var source = String(html == null ? '' : html);
        var cached = _sanitizeCache.get(source);
        if (cached !== undefined) return cached;

        var doc = new DOMParser().parseFromString(source, 'text/html');
        sanitizeHtmlNode(doc.body);
        var safe = doc.body.innerHTML;

        if (_sanitizeCache.size > 500) _sanitizeCache.clear();
        _sanitizeCache.set(source, safe);
        return safe;
    }

    /** 幂等写入安全 HTML：内容相同则不碰 DOM */
    function setSafeHtml(el, html) {
        if (!el || html == null) return false;
        var safe = sanitizeHtml(html);
        if (el.innerHTML === safe) return false;
        var rec = originOf(el);
        var currentHtml = el.innerHTML;
        if (rec.html === undefined && rec.text === undefined && rec.icon === undefined) {
            rec.html = currentHtml;
        } else if (rec.html !== undefined && rec.writtenHtml !== undefined && currentHtml !== rec.writtenHtml) {
            rec.html = currentHtml;
        }
        el.innerHTML = safe;
        // 浏览器会规范化 style 等属性，读回规范形式供下次比较
        rec.writtenHtml = el.innerHTML;
        return true;
    }

    // ==================== 重复编译缓存 ====================

    var _regexCache = new Map();
    function getRegex(pattern) {
        var re = _regexCache.get(pattern);
        if (!re) {
            re = new RegExp(pattern);
            _regexCache.set(pattern, re);
        }
        return re;
    }

    // Filter 菜单的 optgroup 分组名（固定文案，使用 null 原型避免原型键污染）
    var FILTER_OPTGROUP_MAP = Object.assign(Object.create(null), {
        'Other': '其他',
        'Engine': '引擎',
        'Status': '状态'
    });

    // 按钮"忽略大小写/末尾冒号"归一化表，按字典对象身份缓存
    var _normalizedMapCache = new WeakMap();
    function getNormalizedMap(dict) {
        if (!dict || typeof dict !== 'object') return Object.create(null);
        var cached = _normalizedMapCache.get(dict);
        if (cached) return cached;
        var map = Object.create(null);
        visibleKeys(dict).forEach(function(k) {
            map[k.trim().toLowerCase().replace(/:$/, '').trim()] = dict[k];
        });
        _normalizedMapCache.set(dict, map);
        return map;
    }

    // lookupTag 的小写查找表按 samTags/labels 对象身份缓存
    var _tagLookupCache = new WeakMap();
    function getTagLookup(samTags, labelsDict) {
        if (!samTags || typeof samTags !== 'object') return null;
        var entry = _tagLookupCache.get(samTags);
        if (entry && entry.labels === labelsDict) return entry.map;

        var map = new Map();
        visibleKeys(labelsDict).forEach(function(k) { map.set(k.toLowerCase(), labelsDict[k]); });
        // sam_tags 优先（与旧实现的精确匹配顺序一致）
        visibleKeys(samTags).forEach(function(k) { map.set(k.toLowerCase(), samTags[k]); });

        _tagLookupCache.set(samTags, { labels: labelsDict, map: map });
        return map;
    }

    // 字典热更新时需要清除的幂等标记
    var F95_DATASET_FLAGS = [
        'f95Translated', 'f95LabelTranslated', 'f95RegexTranslated',
        'f95FooterLinkTranslated', 'f95FooterBottomLinkTranslated',
        'f95FooterStatsTranslated', 'f95FooterExtraTranslated',
        'f95FooterLangTranslated', 'f95FooterTooltipTranslated',
        'f95JoinedTranslated', 'f95GenreTranslated', 'f95ThreadFieldTranslated',
        'f95ButtonTranslated', 'f95TooltipTranslated', 'f95ForumTranslated',
        'f95DescTranslated', 'f95OverlayTranslated', 'f95OverlayLinkTranslated',
        'f95OverlayFormTranslated', 'f95StructStatus', 'f95StructMeta',
        'f95StructIgnore', 'f95StructNA', 'f95StructStars', 'f95StructVotes',
        'f95FilterTrigger', 'f95FilterHeader', 'f95FilterLabel', 'f95FilterSR',
        'f95FilterOption', 'f95FilterOptgroup', 'f95FilterPH', 'f95ThreadSep',
        'f95SamTooltipTranslated', 'f95PageTranslated', 'f95HoverTranslated',
        'f95SamPrefix', 'f95SamTagChip', 'f95SamSettingsTranslated', 'f95SamStatic'
    ];
    var F95_ATTRIBUTE_FLAGS = [
        'data-f95-from-done', 'data-f95-mem-dt', 'data-f95-mem-btn',
        'data-f95-activity-done'
    ];

    /** 清除幂等标记，使热更新后的新译文能够覆盖旧译文 */
    function clearTranslatedFlags(root) {
        root = root || document;
        if (!root.querySelectorAll) return;
        F95_DATASET_FLAGS.forEach(function(flag) {
            var attr = 'data-' + flag.replace(/[A-Z]/g, function(c) { return '-' + c.toLowerCase(); });
            try {
                root.querySelectorAll('[' + attr + ']').forEach(function(el) {
                    el.removeAttribute(attr);
                });
            } catch (e) {}
        });
        F95_ATTRIBUTE_FLAGS.forEach(function(attr) {
            try {
                root.querySelectorAll('[' + attr + ']').forEach(function(el) {
                    el.removeAttribute(attr);
                });
            } catch (e) {}
        });
    }

    // ==================== 内置默认字典 ====================
    var DEFAULT_DICT = {
        "version": 48,
        "xenforo": {
            ".notice[data-notice-id=\"90\"] .notice-content": "我们始终尽力确保F95上共享的文件是安全的。所有附件都会经过扫描，上传者会使用至少1款（通常2款）杀毒软件扫描每个上传文件，我们也有多道程序来防止恶意软件被分享。然而，不幸的是我们有时仍会有所遗漏。最近修改版的 <em>Pervert Action: Timelapse</em> 和 <em>Milfania</em> 含有恶意软件。<a href=\"https://f95zone.to/threads/recent-malware-infected-games.207437/\">点击此处了解更多</a>。",
            ".notice[data-notice-id=\"116\"] .notice-content": "上传者申请现已开放！如果您有兴趣成为团队成员，<a href=\"https://f95zone.to/threads/uploader-applications-are-open.230363/\">点击此处了解更多</a>。如果您之前被拒绝或因不活跃而被移除，请随时重新申请。",
            ".uix_newIndicator": "新",
            ".p-nav-menuText": "菜单",
            "[data-nav-id=\"forums\"] span": "论坛",
            "[data-nav-id=\"nfTickets\"] span": "工单",
            "[data-nav-id=\"LatestUpdates\"] span": "最近更新",
            "[data-nav-id=\"f95trTrending\"] span": "时下热门",
            "[data-nav-id=\"f95luPage\"] span": "最新更新（Beta）",
            "[data-nav-id=\"newPosts\"] span": "新帖",
            "[data-nav-id=\"findThreads\"] span": "主题帖检索",
            "[data-nav-id=\"watched\"] span": "关注列表",
            "[data-nav-id=\"searchForums\"] span": "搜索论坛",
            "[data-nav-id=\"markForumsRead\"] span": "标记已读",
            "[data-nav-id=\"bookmarks\"] span": "书签",
            "[data-nav-id=\"Donate\"] span": "捐赠",
            "[data-nav-id=\"nfTicketsOpenNewTicket\"] span": "提交新工单",
            "[data-nav-id=\"nfTicketsYours\"] span": "你的工单",
            "[data-nav-id=\"nfTicketsWatchedContent\"] span": "关注列表",
            "[data-nav-id=\"nfTicketsWatchedCategories\"] span": "关注的分类",
            "[data-nav-id=\"nfTicketsWatchedUsers\"] span": "关注的用户",
            "[data-nav-id=\"nfTicketsWatchedTickets\"] span": "关注的工单",
            "[data-nav-id=\"nfTicketsSearch\"] span": "搜索工单",
            "[data-nav-id=\"nfTicketsMarkRead\"] span": "标记已读",
            "[data-nav-id=\"yourThreads\"] span": "我的主题帖",
            "[data-nav-id=\"contributedThreads\"] span": "我回复过的主题帖",
            "[data-nav-id=\"unansweredThreads\"] span": "无人回复的主題帖",
            "[data-nav-id=\"watchedThreads\"] span": "关注的主題帖",
            "[data-nav-id=\"watchedForums\"] span": "关注的板块",
            ".uix_sidebarTrigger--phrase": "侧边栏",
            ".pageNav-jump--prev": "上一页",
            ".pageNav-jump--next": "下一页",
            ".menu--pageJump .menu-header": "跳转到页面",
            ".block-minorHeader a[href=\"/members/?key=staff_members\"]": "在线管理团队",
            ".block-minorHeader a[href=\"/online/\"]": "在线会员",
            ".block-minorHeader a[href=\"/whats-new/posts/?skip=1\"]": "最新帖子",
            ".block-minorHeader a[href=\"/whats-new/profile-posts/?skip=1\"]": "最新动态",
            "[data-widget-definition=\"th_aboutUs\"] .block-minorHeader": "关于我们",
            "[data-widget-definition=\"th_navigation\"] .block-minorHeader": "快速导航",
            "[data-widget-definition=\"th_userNavigation\"] .block-minorHeader": "用户菜单",
            "[data-widget-key=\"forum_overview_forum_statistics\"] .block-minorHeader": "论坛统计",
            "[data-widget-definition=\"th_aboutUs\"] .block-body": "F95zone是一个成人社区，在这里你可以找到大量优质的成人游戏和漫画、结交新朋友、参与活跃讨论等更多内容！",
            ".p-footer-linkList a[href=\"/misc/style\"]": "深色模式 BETA",
            ".p-footer-linkList a[href=\"https://f95zone.to/pages/contact/\"]": "联系我们与滥用举报",
            ".p-footer-linkList a[href=\"/help/terms/\"]": "条款和规则",
            ".p-footer-linkList a[href=\"/help/privacy-policy/\"]": "隐私政策",
            ".p-footer-linkList a[href=\"/help/\"]": "帮助",
            ".actionBar-action--report": "举报",
            ".f95wg-strip-label": "版本",
            ".f95tt-promote-title": "推广主题帖",
            ".f95tt-promote-desc": "提升到“最新更新”的顶部。",
            ".f95tt-none": "没有匹配的工具。",
            ".f95tr-widgetHead a:not(.f95tr-seeAll)": "时下热门",
            ".f95tr-seeAll": "查看全部"
        },
        "xenforo_time_phrases": {
            "_note": "覆盖 XF.phrases 时间格式化模板，使 XenForo 原生渲染中文相对时间。{count}/{minutes}/{date}/{time}/{day} 是 XenForo 的模板占位符，必须保留。",
            "svStandardLib_time.day": "{count} 天",
            "svStandardLib_time.days": "{count} 天",
            "svStandardLib_time.hour": "{count} 小时",
            "svStandardLib_time.hours": "{count} 小时",
            "svStandardLib_time.minute": "{count} 分钟",
            "svStandardLib_time.minutes": "{count} 分钟",
            "svStandardLib_time.month": "{count} 个月",
            "svStandardLib_time.months": "{count} 个月",
            "svStandardLib_time.second": "{count} 秒",
            "svStandardLib_time.seconds": "{count} 秒",
            "svStandardLib_time.week": "{count} 周",
            "svStandardLib_time.weeks": "{count} 周",
            "svStandardLib_time.year": "{count} 年",
            "svStandardLib_time.years": "{count} 年",
            "date_x_at_time_y": "{date} {time}",
            "day_x_at_time_y": "{day} {time}",
            "yesterday_at_x": "昨天 {time}",
            "x_minutes_ago": "{minutes} 分钟前",
            "one_minute_ago": "1 分钟前",
            "a_moment_ago": "刚刚",
            "today_at_x": "今天 {time}",
            "in_a_moment": "稍后",
            "in_a_minute": "1 分钟后",
            "in_x_minutes": "{minutes} 分钟后",
            "later_today_at_x": "今天 {time}",
            "tomorrow_at_x": "明天 {time}",
            "day0": "星期日",
            "day1": "星期一",
            "day2": "星期二",
            "day3": "星期三",
            "day4": "星期四",
            "day5": "星期五",
            "day6": "星期六",
            "dayShort0": "周日",
            "dayShort1": "周一",
            "dayShort2": "周二",
            "dayShort3": "周三",
            "dayShort4": "周四",
            "dayShort5": "周五",
            "dayShort6": "周六",
            "month0": "1月",
            "month1": "2月",
            "month2": "3月",
            "month3": "4月",
            "month4": "5月",
            "month5": "6月",
            "month6": "7月",
            "month7": "8月",
            "month8": "9月",
            "month9": "10月",
            "month10": "11月",
            "month11": "12月"
        },
        "xenforo_forum_names": {
            "_note": "论坛/分类/子论坛名称翻译。key 为元素 textContent 的精确匹配值，应用于 .uix_categoryTitle、a[data-shortcut=\"node-description\"]、a.subNodeLink、h1.p-title-value 等元素。",
            "Forums": "论坛",
            "Announcements": "公告",
            "Site Rules, News & Announcements": "网站规则、新闻与公告",
            "Private Forums": "私有论坛",
            "Contests": "竞赛",
            "Adult Games": "成人游戏",
            "Games": "游戏",
            "Trending Games": "热门游戏",
            "Latest Games & Updates": "最新游戏与更新",
            "Game Requests": "游戏请求",
            "Completed Game Requests": "已完成的游戏请求",
            "Rejected Game Requests": "已拒绝的游戏请求",
            "Mods": "模组",
            "Translations Mods": "翻译模组",
            "Adult Comics & Animations": "成人漫画与动画",
            "Comics & Stills": "漫画与插画",
            "Animations & Loops": "动画与循环",
            "Comic & Animation Requests": "漫画与动画请求",
            "Completed Comic & Anim. Requests": "已完成的漫画与动画请求",
            "Rejected Comic & Anim. Requests": "已拒绝的漫画与动画请求",
            "Development": "开发",
            "Asset Releases": "资源发布",
            "Asset Requests": "资源请求",
            "Completed Asset Requests": "已完成的资源请求",
            "Rejected Asset Requests": "已拒绝的资源请求",
            "Programming, Development & Art": "编程、开发与美术",
            "Artwork": "美术作品",
            "Dev Help": "开发帮助",
            "Dev Tools & Guides": "开发工具与指南",
            "Recruitment & Services": "招募与服务",
            "Completed Recruitment and Services": "已完成的招募与服务",
            "Translation": "翻译",
            "Request": "请求",
            "Cracking": "破解",
            "Discussion": "讨论",
            "General Discussions": "综合讨论",
            "Introduction": "自我介绍",
            "Off-Topic": "闲聊",
            "Recommendations & Identification": "推荐与识别",
            "Tools & Tutorials": "工具与教程",
            "General Troubleshooting": "综合故障排除",
            "Solved": "已解决",
            "Site Feedback": "网站反馈",
            "Features Request": "功能请求",
            "Planned Features": "计划中的功能",
            "Completed Features": "已完成的功能",
            "Rejected Features": "已拒绝的功能",
            "Site Problems": "网站问题"
        },
        "xenforo_node_descriptions": {
            "_note": "论坛板块描述翻译。key 为 .node-description / .p-description 的 textContent 唯一前缀标识，value 为翻译后的完整 HTML。匹配方式：textContent 是否以 key 开头。",
            "Stay informed and follow the guidelines": "<p><strong>及时了解并遵守指南：</strong>一站式获取 <span style=\"color:#1a8cff;\">网站规则</span>、<span style=\"color:#32cd32;\">最新消息</span> 和 <span style=\"color:#ff4500;\">重要公告</span>。</p>",
            "A visual overview of the latest new games and updates": "<p>最新游戏与更新的可视化概览。</p>",
            "Explore the creative aspects": "<p><strong>探索成人游戏的创意方面</strong>——讨论 <span style=\"color:#f08080;\">编程</span>、<span style=\"color:#add8e6;\">开发</span> 和 <span style=\"color:#98fb98;\">美术</span> 技巧。分享知识、相互学习、共同提升行业水平。</p>",
            "A dedicated hub": "<p>创作者与人才的<strong>专属中心</strong>，在此 <span style=\"color:#f08080;\">建立联系</span>、<span style=\"color:#add8e6;\">展开合作</span>、发展成人游戏项目。寻找团队成员、展示技能，共同塑造成人游戏内容的未来。</p>",
            "Join the conversation about translating adult gaming content": "<p><strong>参与翻译成人游戏内容的讨论</strong>，触达 <span style=\"color:#f08080;\">全球受众</span>。分享专业知识、了解不同语言与 <span style=\"color:#add8e6;\">本地化</span>，协作多语言项目。</p>",
            "Join the conversation on a variety of topics that don't fit neatly into other categories": "<p><strong>参与各类话题讨论</strong>，涵盖不适合归入其他分类的各种主题。<em>建立联系、分享想法、畅所欲言</em>，在这个多元包容的空间中与社区成员互动交流。</p>",
            "Dive into a wealth of resources": "<p><strong>丰富的学习资源</strong>助你提升知识与技能。查找 <span style=\"color:#add8e6;\">实用指南</span>、<span style=\"color:#f08080;\">教程</span>、<span style=\"color:#98fb98;\">手册</span> 和 <span style=\"color:#f4a460;\">操作说明</span>，或在此学习中心分享你的专长。</p>",
            "Encountering issues or need assistance": "<p><strong>遇到问题或需要帮助？</strong>在此 <span style=\"color:#7fffd4;\">互助</span> 且 <span style=\"color:#d8bfd8;\">响应及时</span> 的求助论坛中发帖提问，获取指导与解决方案。</p>",
            "Help shape the future of our community": "<p><strong>分享改进想法与建议</strong>，共同塑造社区未来。在此提交 <span style=\"color:#ff7f50;\">功能请求</span>，为 <span style=\"color:#ffd700;\">网站体验</span> 贡献力量。</p>",
            "Help us maintain a seamless user experience": "<p><strong>反馈遇到的 <span style=\"color:#f08080;\">网站问题</span> 或 <span style=\"color:#add8e6;\">故障</span></strong>，帮助我们维护流畅的用户体验。你的关注将为社区创造更佳体验。</p>"
        },
        "xenforo_buttons": {
            "_note": "按钮文本翻译。key 为小写无冒号的标准形式，匹配时忽略大小写和末尾冒号。",
            "spoiler": "展开",
            "spoilers": "展开",
            "post": "发布",
            "go": "前往",
            "post comment": "发表评论",
            "mark read": "标记已读",
            "watch": "关注",
            "unwatch": "取消关注",
            "moderators": "版主",
            "ignore forum": "忽略版块",
            "ignore thread": "忽略主题帖",
            "jump to new": "跳转到新帖",
            "filter": "筛选"
        },
        "xenforo_regex": [
            {
                "selector": "a[href=\"/online/\"]",
                "pattern": "^\\.\\.\\. and (\\d+) more\\.$",
                "replacement": "... 以及另外 $1 人。"
            },
            {
                "selector": ".block-footer-counter",
                "pattern": "^Total:\\s*([\\d,]+)\\s*\\(members:\\s*([\\d,]+),\\s*guests:\\s*([\\d,]+)\\)$",
                "replacement": "总计：$1（会员：$2，游客：$3）"
            },
            {
                "selector": ".brmsNumberEntry",
                "pattern": "^(\\d+)\\s*Entries$",
                "replacement": "$1 条"
            },
            {
                "selector": ".u-srOnly",
                "pattern": "^(.+) wrote on (.+)'s profile\\.$",
                "replacement": "$1 在 $2 的个人主页上留言。"
            },
            {
                "selector": "a[href^=\"/account/dpp-update\"] .button-text",
                "pattern": "^Showing (\\d+) posts per page$",
                "replacement": "每页显示 $1 条帖子"
            },
            {
                "selector": ".tabs--standalone .tabs-tab",
                "pattern": "^Discussion$",
                "replacement": "讨论"
            },
            {
                "selector": ".tabs--standalone .tabs-tab",
                "pattern": "^Reviews \\((\\d+)\\)$",
                "replacement": "评论 ($1)"
            }
        ],
        "xenforo_placeholders": {
            "textarea.js-editor[placeholder=\"Update your status…\"]": "更新你的状态…",
            "textarea.comment-input[placeholder=\"Write a comment…\"]": "写评论…",
            "#quickSearchTitle": "快速搜索…",
            ".f95tt-find-input": "查找工具…"
        },
        "xenforo_node_stats_dt": {
            "Threads": "条主题帖",
            "Messages": "条消息"
        },
        "xenforo_thread_statuses": {
            "_note": "主题帖列表中状态徽章的屏幕阅读器文本翻译（.structItem-statuses .u-srOnly）。",
            "Locked": "已锁定",
            "Redirect": "重定向",
            "Sticky": "置顶",
            "Poll": "投票"
        },
        "xenforo_thread_meta_dt": {
            "_note": "主题帖列表中 Replies / Views 统计标签翻译（.structItem-cell--meta dt）。",
            "Replies": "回复",
            "Views": "查看",
            "Reviews": "评论"
        },
        "xenforo_thread_list_separators": {
            "_note": "论坛版块内主题帖列表分隔符翻译（Sticky threads / Normal threads）。匹配 .uix_threadListSeparator 的第一个文本节点，保留折叠按钮子元素。",
            "Sticky threads": "置顶主题帖",
            "Normal threads": "普通主题帖"
        },
        "xenforo_thread_ignore": "忽略",
        "xenforo_thread_na": "暂无",
        "xenforo_thread_votes_suffix": " 票",
        "xenforo_thread_stars_suffix": " 星",
        "xenforo_tooltips": {
            "_note": "tooltip 提示文本翻译（data-original-title / title 属性）。",
            "Click to reveal or hide spoiler": "点击展开或隐藏",
            "Toggle width": "切换宽度",
            "Style chooser": "样式选择",
            "Language chooser": "语言选择",
            "Top": "回到顶部",
            "Cancel": "取消",
            "Go to page": "跳转到页面",
            "Like": "点赞",
            "New in this list": "新进入榜单",
            "Unlike": "取消点赞",
            "Remove": "移除",
            "Rate this game": "为该游戏评分"
        },
        "xenforo_dataList_headers": {
            "_note": "dataList 表格表头翻译（如 Quick Search 结果页面）。key 为 <th> 的 textContent 精确匹配值。",
            "Thread starter": "楼主",
            "Title": "标题",
            "Forum": "版块",
            "Replies": "回复",
            "Date": "日期"
        },
        "xenforo_filter_menu": {
            "_note": "版块页面 Filter 筛选菜单翻译。trigger 为 .filterBar-menuTrigger 文本，其余为 .js-filterMenuBody 内元素。",
            "trigger": "筛选",
            "show_only": "仅显示：",
            "prefix_label": "前缀：",
            "started_by": "作者：",
            "last_updated": "最近更新：",
            "sort_by": "排序：",
            "sort_order": "排序方式",
            "sort_direction": "排序方向",
            "prefix_placeholder": "前缀…"
        },
        "xenforo_filter_options": {
            "_note": "Filter 菜单中 <select> <option> 文本翻译。也会匹配 Select2 渲染的选项文本。",
            "Last message": "最后回复",
            "First message": "首帖时间",
            "Title": "标题",
            "Replies": "回复数",
            "Views": "查看数",
            "First message reaction score": "首帖评分",
            "Rating": "评分",
            "Descending": "降序",
            "Ascending": "升序",
            "Any time": "任何时间",
            "7 days": "7 天",
            "14 days": "14 天",
            "30 days": "30 天",
            "2 months": "2 个月",
            "3 months": "3 个月",
            "6 months": "6 个月",
            "1 year": "1 年",
            "(Any)": "（任意）",
            "(No prefix)": "（无前缀）"
        },
        "sam_static": {
            ".notice-content": "由于性能问题，我们已禁用旧的 Latest Updates 页面。目前仅提供 Alpha 版本，它使用了全新的后端，性能大幅提升（同时也有新功能）。感谢您的耐心等待。",
            "#filter-block_date-filter h4.filter-block_title": "日期限制",
            "#filter-block_cat h4.filter-block_title": "分类",
            "#filter-block_sort h4.filter-block_title": "排序",
            "#filter-title": "<i class=\"fas fa-filter\"></i>筛选",
            "#filter-block_search h4.filter-block_title": "搜索",
            "#filter-block_tags h4.filter-block_title": "标签（最多10个）",
            "#filter-block_tags_exclude h4.filter-block_title": "排除标签（最多10个）",
            ".p-nav-list a[href=\"/sam/latest_alpha/\"] span": "下载",
            ".p-nav-list a[href=\"/\"] span": "论坛",
            ".p-nav-list a[href=\"/search\"] span": "搜索",
            "#latest-page_options-panel h3": "选项",
            "#options-panel_item-btns-info": "<i class=\"fas fa-info-circle\"></i> 请确保保存你想要的选项",
            "#options-panel_save-load .options-save": "<i class=\"fas fa-save\"></i>保存"
        },
        "sam_placeholders": {
            "#input-title_search": "搜索标题...",
            "#input-creator_search": "搜索作者...",
            ".filter-tags-select input[placeholder]": "选择要筛选的标签...",
            ".filter-tags-exclude-select input[placeholder]": "选择要排除的标签..."
        },
        "sam_accordion_match": {
            "Prefix: Engine": "前缀：引擎",
            "Prefix: Other": "前缀：其他",
            "Prefix: Status": "前缀：状态"
        },
        "sam_toggle_match": {
            "Creator": "作者",
            "Title": "标题",
            "OR": "或",
            "AND": "且"
        },
        "sam_tags": {
            "Action": "动作",
            "Adventure": "冒险",
            "Fighting": "格斗",
            "Horror": "恐怖",
            "Platformer": "平台跳跃",
            "Puzzle": "解谜",
            "Racing": "赛车",
            "RPG": "角色扮演",
            "Sandbox": "沙盒",
            "Shooter": "射击",
            "Simulation": "模拟",
            "Sports": "体育",
            "Strategy": "策略",
            "Text Based": "文字游戏",
            "Virtual Reality": "虚拟现实"
        },
        "sam_css_pseudo": [
            ".tile-date_year::after { content: \" 年前\" !important; }",
            ".tile-date_years::after { content: \" 年前\" !important; }",
            ".tile-date_month::after { content: \" 个月前\" !important; }",
            ".tile-date_months::after { content: \" 个月前\" !important; }",
            ".tile-date_mo::after { content: \" 个月前\" !important; }",
            ".tile-date_mos::after { content: \" 个月前\" !important; }",
            ".tile-date_week::after { content: \" 周前\" !important; }",
            ".tile-date_weeks::after { content: \" 周前\" !important; }",
            ".tile-date_wk::after { content: \" 周前\" !important; }",
            ".tile-date_wks::after { content: \" 周前\" !important; }",
            ".tile-date_day::after { content: \" 天前\" !important; }",
            ".tile-date_days::after { content: \" 天前\" !important; }",
            ".tile-date_dy::after { content: \" 天前\" !important; }",
            ".tile-date_dys::after { content: \" 天前\" !important; }",
            ".tile-date_yesterday::after { content: \"昨天\" !important; }",
            ".tile-date_hour::after { content: \" 小时前\" !important; }",
            ".tile-date_hours::after { content: \" 小时前\" !important; }",
            ".tile-date_hr::after { content: \" 小时前\" !important; }",
            ".tile-date_hrs::after { content: \" 小时前\" !important; }",
            ".tile-date_minute::after { content: \" 分钟前\" !important; }",
            ".tile-date_minutes::after { content: \" 分钟前\" !important; }",
            ".tile-date_min::after { content: \" 分钟前\" !important; }",
            ".tile-date_mins::after { content: \" 分钟前\" !important; }"
        ],
        "sam_tooltips": {
            "Auto Refresh": "自动刷新",
            "Browser Notify": "浏览器通知",
            "Options": "选项",
            "Filters": "筛选",
            "Settings": "设置"
        },
        "sam_settings": {
            "_note": "Settings 面板翻译。用于 translateByTextMatch 对 .options-panel_item-title 和按钮文本进行匹配。",
            "Tile layout": "卡片布局",
            "Ignored threads": "已忽略的主题帖",
            "Hide": "隐藏",
            "Transparent": "半透明",
            "Show": "显示",
            "Open links in new tab": "在新标签页中打开链接",
            "Yes": "是",
            "No": "否",
            "Filters Sidebar": "筛选侧边栏",
            "Normal": "普通",
            "Sticky": "固定",
            "Version style": "版本样式",
            "Small (Prefix)": "小（前缀）",
            "Large (Title)": "大（标题）",
            "Search Highlight": "搜索高亮",
            "On": "开",
            "Off": "关",
            "Notifications": "通知",
            "NSFW": "NSFW",
            "SFW": "SFW",
            "Hover delay": "悬停延迟",
            "Items Per Page": "每页条目数",
            "Make sure to save your desired options": "请确保保存你想要的选项",
            "Save": "保存"
        },
        "sam_slider_map": {
            "Anytime": "任何时间"
        },
        "sam_result_text": {
            "Results": "条结果"
        },
        "reaction_texts": {
            "like": "点赞",
            "unlike": "取消点赞"
        },
        "f95_modules": {
            "_note": "改版后新增 F95 模块的文本映射；选择器均限定在对应模块容器内，避免误伤内容区。",
            "nav": {
                "f95trTrending": "时下热门",
                "f95luPage": "最新更新（Beta）"
            },
            "stats_tabs": {
                "Latest Replies": "最新回复",
                "Latest Threads": "最新主题",
                "Latest Updates": "最新更新",
                "Most Viewed Threads": "最多浏览主题",
                "My Threads": "我的主题",
                "Trending": "时下热门",
                "Most Liked Threads": "最多点赞主题"
            },
            "thread_tools_groups": {
                "Thread": "主题帖",
                "Status": "状态",
                "Reports and history": "举报与历史",
                "Replies and reviews": "回复与评测",
                "Other": "其他"
            },
            "thread_meta": {
                "Thread starter": "楼主",
                "Start date": "开始日期",
                "Tags": "标签"
            },
            "trending": {
                "New": "新"
            }
        },
        "ui_strings": {
            "_note": "脚本动态拼接/兜底的界面文案。{n}/{was}/{year}/{month}/{day}/{time} 为占位符。",
            "find_tool": "查找工具…",
            "promote_short": "推广…",
            "alert_new_versions": "有新版本时提醒我",
            "reviews_suffix": "条评测",
            "stars_aria": "{n} 星",
            "rating_out_of_5": "{n} 分（满分 5 分）",
            "rate_this_game": "为该游戏评分",
            "trending_new_in_list": "新进入榜单",
            "trending_place_suffix": "位",
            "trending_rank_up": "上升 {n} 位（原第 {was} 名）",
            "trending_rank_down": "下降 {n} 位（原第 {was} 名）",
            "footer_language": "英语（美国）",
            "member_from_prefix": "来自于 ",
            "prev_page": "上一页",
            "next_page": "下一页",
            "hover_delay_ms": "{n} 毫秒",
            "items_suffix": "{n} 条",
            "days_suffix": "{n} 天",
            "results_suffix": "条结果",
            "time_just_now": "刚刚",
            "time_minutes_ago": "{n} 分钟前",
            "time_hours_ago": "{n} 小时前",
            "time_today_at": "今天 {time}",
            "time_date": "{year}年{month}月{day}日 {time}",
            "time_date_only": "{year}年{month}月{day}日"
        },
        "xenforo_filter_optgroups": {
            "_note": "版块筛选菜单内 optgroup 分组名。",
            "Other": "其他",
            "Engine": "引擎",
            "Status": "状态"
        },
        "labels": {
            "_note": "引擎、状态、前缀等标签翻译。以 _ 开头的 key 不会被翻译引擎处理。",
            "Completed": "已完成",
            "Abandoned": "已弃坑",
            "Collection": "合集",
            "RPGM": "RPG制作大师",
            "Unreal Engine": "虚幻引擎",
            "Ren'Py": "Ren'Py引擎",
            "Unity": "Unity引擎",
            "VAM": "VAM",
            "Onhold": "暂停",
            "Others": "其他",
            "VN": "视觉小说",
            "Games": "游戏",
            "Comics": "漫画",
            "Animations": "动画",
            "Assets": "素材",
            "Mods": "模组",
            "Date": "日期",
            "Likes": "点赞",
            "Views": "查看",
            "Name": "名称",
            "Weighted Rating": "加权评分",
            "ADRIFT": "ADRIFT引擎",
            "Flash": "Flash引擎",
            "SiteRip": "站点搬运",
            "Godot": "Godot引擎",
            "Java": "Java引擎",
            "WebGL": "WebGL引擎",
            "Wolf RPG": "Wolf RPG引擎",
            "Tads": "Tads引擎",
            "RAGS": "RAGS引擎",
            "QSP": "QSP引擎",
            "HTML": "HTML引擎"
        },
        "xenforo_footer_links": {
            "Members": "会员",
            "Forum Rules": "论坛规则",
            "Discord": "Discord",
            "Twitter": "Twitter",
            "Profile": "个人资料",
            "Account details": "账户详情",
            "News feed": "动态消息",
            "Log out": "退出登录",
            "Contact & Abuse": "联系我们与滥用举报",
            "Terms and rules": "条款和规则",
            "Privacy policy": "隐私政策",
            "Help": "帮助"
        },
        "xenforo_footer_stats_dt": {
            "Threads": "主题帖",
            "Messages": "消息",
            "Members": "会员",
            "Latest member": "最新会员"
        },
        "xenforo_footer_extra": "本站仅提供其他网站/服务的链接，不存储任何文件。",
        "xenforo_member_tooltip": {
            "_note": "鼠标悬停头像弹出的个人资料卡片翻译。",
            "Joined": "加入于",
            "Last seen": "最后浏览于",
            "Yesterday at": "昨天于",
            "Today at": "今天于",
            "Messages": "消息",
            "Reaction score": "获赞",
            "Points": "积分",
            "Ratings Received": "收到的评价",
            "Follow": "关注",
            "Unfollow": "取消关注",
            "Ignore": "屏蔽",
            "Unignore": "取消屏蔽",
            "Start conversation": "发起私信",
            "Reactions": "获赞",
            "View profile": "查看资料",
            "Following": "正在关注"
        },
        "xenforo_member_tooltip_activity": {
            "_note": "Last seen 后面的活动状态翻译。匹配文本节点中以 key 开头的前缀并替换。",
            "Viewing thread": "正在浏览主题帖",
            "Viewing the thread": "正在浏览主题帖",
            "Viewing forum": "正在浏览版块",
            "Viewing forum list": "正在浏览论坛列表",
            "Viewing member profile": "正在浏览会员资料",
            "Viewing members": "正在浏览会员列表",
            "Viewing online list": "正在浏览在线列表",
            "Viewing latest content": "正在浏览最新内容",
            "Viewing conversation": "正在浏览私信",
            "Viewing unknown page": "正在浏览未知页面",
            "Engaging in conversation": "正在私信聊天",
            "Viewing profile post": "正在浏览个人动态",
            "Viewing profile post by": "正在浏览个人动态",
            "Viewing search results": "正在浏览搜索结果",
            "Viewing what's new": "正在浏览最新动态",
            "Viewing bookmarks": "正在浏览书签",
            "Viewing watched threads": "正在浏览关注的主题帖列表",
            "Viewing new posts": "正在浏览新帖",
            "Selecting for moderation": "正在执行管理操作",
            "Editing profile post": "正在编辑个人动态",
            "Posting in thread": "正在回帖",
            "Creating thread": "正在发帖",
            "Creating thread in": "正在发帖"
        },
        "xenforo_overlays": {
            "_note": "XenForo overlay/pop-up 翻译。通过 .overlay-title 文本识别不同弹窗类型。",
            "report_content": {
                "match_title": "Report content",
                "title": "举报内容",
                "forms": {
                    "labels": {
                        "Report reason": "举报原因",
                        "More information": "更多信息"
                    },
                    "radios": {
                        "Game update": "游戏更新",
                        "Comic / Animation Update": "漫画/动画更新",
                        "Asset update": "资源更新",
                        "Advertising / Spam": "广告/垃圾信息",
                        "Inappropriate Behaviour": "不当行为",
                        "Other": "其他"
                    },
                    "explanations": {
                        "The reported post contains a link to a new version of the game": "被举报的帖子包含游戏新版本的链接",
                        "The reported post contains a link to a new version of the comic / animation": "被举报的帖子包含漫画/动画新版本的链接",
                        "The reported post contains a link to a new version of the asset": "被举报的帖子包含资源新版本的链接",
                        "The reported post contains advertising and/or is spamming": "被举报的帖子包含广告和/或垃圾信息",
                        "The reported post goes against general / thread rules": "被举报的主题帖违反了一般规则或主题帖规则",
                        "Please use \"More information\" field to explain further.": "请使用\"更多信息\"字段进一步说明。"
                    },
                    "buttons": {
                        "Report": "举报"
                    }
                }
            },
            "style_chooser": {
                "match_title": "Style chooser",
                "title": "样式选择",
                "links": {
                    "Use default style": "使用默认样式",
                    "UI.X Dark [Old and unsupported]": "UI.X Dark [旧版，不再支持]",
                    "Dark Mode BETA": "深色模式 BETA"
                }
            },
            "language_chooser": {
                "match_title": "Language chooser",
                "title": "语言选择",
                "links": {
                    "English (US)": "英语（美国）",
                    "Русский (RU)": "俄语（俄罗斯）",
                    "Deutsch (DE)": "德语（德国）"
                }
            },
            "profile_post": {
                "match_title": "Profile post for",
                "title_pattern": "Profile post for (.+)",
                "title_replacement": "$1 的个人动态"
            }
        },
        "thread_fields": {
            "_note": "游戏主题帖主楼信息字段翻译。labels 匹配 .bbWrapper 内 <b> 标签的 textContent 精确值。",
            "labels": {
                "Overview": "概述",
                "Thread Updated": "主题帖更新于",
                "Release Date": "发布日期",
                "Developer": "开发者",
                "Censored": "有码/无码",
                "Version": "版本",
                "OS": "操作系统",
                "Language": "语言",
                "Other Games": "其他游戏",
                "Genre": "类型",
                "Installation": "安装说明",
                "Changelog": "更新日志",
                "Developer Notes": "开发者备注",
                "Extras": "额外内容"
            },
            "censored_values": {
                "Yes": "有码",
                "No": "无码",
                "Yes (Mosaic)": "有码（马赛克）"
            },
            "os_values": {
                "Windows": "Windows",
                "Linux": "Linux",
                "Mac": "Mac",
                "Android": "安卓",
                "Web": "网页"
            },
            "language_values": {
                "English": "英语",
                "Japanese": "日语",
                "Chinese": "中文",
                "Korean": "韩语",
                "Russian": "俄语",
                "German": "德语",
                "French": "法语",
                "Spanish": "西班牙语",
                "Portuguese": "葡萄牙语",
                "Italian": "意大利语",
                "Other": "其他"
            },
            "download": "下载链接"
        }
    };

    // ==================== 字典加载（缓存 → 内置 → CDN 三级回退） ====================
    var CDN_DICT_URL = 'https://cdn.jsdelivr.net/gh/CharlenaK/f95zone-zh-cn@main/f95_dict.json';
    var CDN_CHECK_INTERVAL = 24 * 60 * 60 * 1000;  // 正常每 24 小时检查一次
    var CDN_RETRY_INTERVAL = 60 * 60 * 1000;       // 失败后 1 小时重试
    var CDN_CHECK_KEY = 'f95_dict_checked_at';

    function loadDict() {
        var cached = GM_getValue('f95_dict', null);

        // 1. 优先返回缓存（无网络延迟，最快启动）
        if (cached && cached.version >= DEFAULT_DICT.version) {
            log('字典来源: 本地缓存 (v' + cached.version + ')');
        } else {
            log('字典来源: 内置默认 (v' + DEFAULT_DICT.version + ')' + (cached ? ', 缓存版本较旧(v' + cached.version + ')' : ', 首次运行'));
            GM_setValue('f95_dict', DEFAULT_DICT);
            cached = DEFAULT_DICT;
        }

        // 2. 异步从 jsDelivr CDN 拉取最新字典，静默更新缓存
        try {
            fetchRemoteDict(cached);
        } catch(e) {
            log('CDN 热更新跳过: ' + e.message);
        }

        return hardenDict(cached);
    }

    function replaceDict(remote) {
        // 整体替换顶层键：远程删除的嵌套键不会残留在内存里
        Object.keys(DICT).forEach(function(k) {
            if (!Object.prototype.hasOwnProperty.call(remote, k)) delete DICT[k];
        });
        Object.keys(remote).forEach(function(k) {
            DICT[k] = remote[k];
        });
    }

    function fetchRemoteDict(cached) {
        if (typeof GM_xmlhttpRequest === 'undefined') {
            log('GM_xmlhttpRequest 不可用，跳过 CDN 热更新');
            return;
        }

        var startedAt = Date.now();
        var lastCheck = Number(GM_getValue(CDN_CHECK_KEY, 0)) || 0;
        // 时钟回拨时不信任旧时间戳，直接放行一次
        if (lastCheck && startedAt >= lastCheck && startedAt - lastCheck < CDN_CHECK_INTERVAL) {
            log('CDN 检查已节流（距上次 ' + Math.round((startedAt - lastCheck) / 60000) + ' 分钟），跳过');
            return;
        }

        function markChecked(retryLater) {
            GM_setValue(CDN_CHECK_KEY, retryLater
                ? startedAt - CDN_CHECK_INTERVAL + CDN_RETRY_INTERVAL
                : startedAt);
        }

        GM_xmlhttpRequest({
            method: 'GET',
            url: CDN_DICT_URL,
            timeout: 5000,
            onload: function(resp) {
                try {
                    var remote = JSON.parse(resp.responseText);
                    if (!remote || typeof remote !== 'object' || Array.isArray(remote) ||
                        typeof remote.version !== 'number' || !isFinite(remote.version) ||
                        !remote.xenforo || typeof remote.xenforo !== 'object' ||
                        Array.isArray(remote.xenforo) || Object.keys(remote.xenforo).length === 0) {
                        throw new Error('字典结构无效（缺少 version/xenforo）');
                    }
                    markChecked(false);
                    var cacheVer = cached ? (cached.version || 0) : 0;
                    if (remote.version > cacheVer) {
                        log('字典来源: CDN 热更新 (v' + remote.version + ', 原 ' + (cacheVer || '无') + ')');
                        // 缓存保存原始 JSON 结构，内存中使用 null 原型副本
                        GM_setValue('f95_dict', remote);
                        replaceDict(hardenDict(remote));
                        // 引擎在启动时捕获了字典快照，需要重建并重新翻译
                        emitDictRefresh();
                        log('  热更新已生效');
                    } else {
                        log('CDN 版本(v' + remote.version + ') 不高于缓存(v' + cacheVer + ')，跳过');
                    }
                } catch(e) {
                    log('CDN 字典解析失败: ' + e.message);
                }
            },
            onerror: function(e) {
                markChecked(true);
                log('CDN 字典获取失败 (HTTP ' + (e.status || '?') + ')，1 小时后重试');
            },
            ontimeout: function() {
                markChecked(true);
                log('CDN 字典请求超时 (5s)，1 小时后重试');
            }
        });
    }

    var DICT = loadDict();

    // ==================== 工具函数 ====================

    /**
     * 原文登记表：记录每个节点被翻译前的原始文本/属性。
     * 字典热更新时先还原原文、再按新字典重译，避免"已译成中文就无法更新"。
     * 用 Map 是为了能遍历；节点被移除后在下次刷新/阈值触发时清理。
     */
    var ORIGINS = new Map();

    function originOf(node) {
        var rec = ORIGINS.get(node);
        if (!rec) {
            rec = {};
            ORIGINS.set(node, rec);
        }
        return rec;
    }

    function pruneOrigins() {
        ORIGINS.forEach(function(_, node) {
            if (node.isConnected === false) ORIGINS.delete(node);
        });
    }

    /** 字典热更新前：把本脚本改写过的节点还原为页面原文 */
    function restoreOrigins(root) {
        ORIGINS.forEach(function(rec, node) {
            if (!node || node.isConnected === false) {
                ORIGINS.delete(node);
                return;
            }
            if (root && root !== document && root.contains && !root.contains(node)) return;
            try {
                if (rec.html !== undefined) {
                    node.innerHTML = rec.html;
                } else if (rec.icon !== undefined) {
                    setTextKeepIcon(node, rec.icon);
                } else if (rec.text !== undefined) {
                    if (node.nodeType === 3) node.nodeValue = rec.text;
                    else node.textContent = rec.text;
                }
                if (rec.attrs) {
                    Object.keys(rec.attrs).forEach(function(name) {
                        var v = rec.attrs[name];
                        if (v === null) node.removeAttribute(name);
                        else node.setAttribute(name, v);
                    });
                }
            } catch (e) {}
            ORIGINS.delete(node);
        });
    }

    /**
     * 幂等写入文本：值相同则完全不碰 DOM。
     * 这是避免 MutationObserver 自激的关键——给 textContent 赋值即使内容相同
     * 也会替换文本节点并产生 childList 记录，进而再次触发翻译。
     */
    function setText(el, value) {
        if (!el || value == null) return false;
        if (el.textContent === value) return false;
        var rec = originOf(el);
        var current = el.textContent;
        if (rec.text === undefined && rec.html === undefined && rec.icon === undefined) {
            rec.text = current;
        } else if (rec.text !== undefined && rec.writtenText !== undefined && current !== rec.writtenText) {
            // 站点在两次翻译之间改写了文本（如结果计数、滑块），当前值才是新的原文
            rec.text = current;
        }
        rec.writtenText = value;
        el.textContent = value;
        return true;
    }

    /** 写入文本节点（保留节点本身，不替换父元素的子节点） */
    function setTextNode(node, value) {
        if (!node || node.nodeType !== 3 || value == null) return false;
        if (node.nodeValue === value) return false;
        var rec = originOf(node);
        var current = node.nodeValue;
        if (rec.text === undefined) {
            rec.text = current;
        } else if (rec.writtenText !== undefined && current !== rec.writtenText) {
            rec.text = current;
        }
        rec.writtenText = value;
        node.nodeValue = value;
        return true;
    }

    /** 幂等写入属性 */
    function setAttr(el, name, value) {
        if (!el || value == null) return false;
        if (el.getAttribute(name) === value) return false;
        var rec = originOf(el);
        if (!rec.attrs) rec.attrs = {};
        if (!rec.writtenAttrs) rec.writtenAttrs = {};
        var current = el.getAttribute(name);
        if (!Object.prototype.hasOwnProperty.call(rec.attrs, name)) {
            rec.attrs[name] = current;
        } else if (Object.prototype.hasOwnProperty.call(rec.writtenAttrs, name) &&
                   current !== rec.writtenAttrs[name]) {
            rec.attrs[name] = current;
        }
        rec.writtenAttrs[name] = value;
        el.setAttribute(name, value);
        return true;
    }

    /**
     * 写入文本但保留元素自带的第一个 <i>/<svg> 图标（用于带图标的链接/按钮）。
     * 用 DOM 节点拼接而非 innerHTML，避免译文中的字符被当作 HTML 解析。
     */
    function setTextKeepIcon(el, value) {
        if (!el || value == null) return false;
        var icon = null;
        for (var i = 0; i < el.children.length; i++) {
            var tag = el.children[i].tagName;
            if (tag === 'I' || tag === 'SVG') { icon = el.children[i]; break; }
        }
        if (!icon) return setText(el, value);

        // 只统计直接文本节点，避免把图标内文字算进来
        var directText = '';
        for (var n = 0; n < el.childNodes.length; n++) {
            if (el.childNodes[n].nodeType === 3) directText += el.childNodes[n].textContent;
        }
        if (el.children.length === 1 && directText.trim() === value) return false;

        var rec = originOf(el);
        var currentText = directText.trim();
        if (rec.text === undefined && rec.html === undefined && rec.icon === undefined) {
            rec.icon = currentText;
        } else if (rec.icon !== undefined && rec.writtenIcon !== undefined && currentText !== rec.writtenIcon) {
            rec.icon = currentText;
        }
        rec.writtenIcon = value;
        el.textContent = value;
        el.insertBefore(document.createTextNode(' '), el.firstChild);
        el.insertBefore(icon, el.firstChild);
        return true;
    }

    /**
     * 在 root 自身及后代中查询。
     * querySelectorAll 不会匹配 root 本身，而增量翻译常以"被插入的节点"为根，
     * 因此需要显式把 root 也纳入匹配。
     */
    function qsa(root, selector) {
        if (!root) return [];
        var out = [];
        if (root.nodeType === 1 && root.matches && root.matches(selector)) out.push(root);
        if (root.querySelectorAll) {
            var list = root.querySelectorAll(selector);
            for (var i = 0; i < list.length; i++) out.push(list[i]);
        }
        return out;
    }

    /** 在限定选择器内按文本精确匹配（使用自带 hasOwnProperty 的 Map 语义） */
    function translateTextMap(root, selector, map) {
        if (!map) return;
        root = root || document;
        qsa(root, selector).forEach(function(el) {
            var text = el.textContent.trim();
            if (Object.prototype.hasOwnProperty.call(map, text)) {
                setText(el, map[text]);
            }
        });
    }

    /** 使用 selector → translation 字典翻译 textContent，返回未匹配的 selector 列表 */
    function translateBySelector(selectorMap, root) {
        root = root || document;
        var unmatched = DEBUG ? [] : null;
        visibleKeys(selectorMap).forEach(function(selector) {
            try {
                var els = qsa(root, selector);
                if (els.length === 0) {
                    if (DEBUG) unmatched.push({ selector: selector, reason: 'DOM元素未找到' });
                    return;
                }
                els.forEach(function(el) {
                    var oldText = DEBUG ? el.textContent : null;
                    if (setText(el, selectorMap[selector]) && DEBUG) {
                        log('  ✓ [' + selector + '] "' + oldText + '" → "' + selectorMap[selector] + '"');
                    }
                });
            } catch(e) {
                if (DEBUG) unmatched.push({ selector: selector, reason: e.message });
            }
        });
        return unmatched || [];
    }

    /** 翻译 placeholder 属性，返回未匹配列表 */
    function translatePlaceholders(placeholderMap, root) {
        root = root || document;
        var unmatched = DEBUG ? [] : null;
        visibleKeys(placeholderMap).forEach(function(selector) {
            try {
                var els = qsa(root, selector);
                if (els.length === 0) {
                    if (DEBUG) unmatched.push({ selector: selector, reason: 'DOM元素未找到' });
                    return;
                }
                els.forEach(function(el) {
                    var oldVal = DEBUG ? el.getAttribute('placeholder') : null;
                    if (setAttr(el, 'placeholder', placeholderMap[selector]) && DEBUG) {
                        log('  ✓ [placeholder:' + selector + '] "' + oldVal + '" → "' + placeholderMap[selector] + '"');
                    }
                });
            } catch(e) {
                if (DEBUG) unmatched.push({ selector: selector, reason: e.message });
            }
        });
        return unmatched || [];
    }

    /** 按文本内容匹配并替换，返回未匹配的文本列表 */
    function translateByTextMatch(matchMap, selector, root) {
        root = root || document;
        var unmatched = DEBUG ? [] : null;
        try {
            qsa(root, selector).forEach(function(el) {
                var text = el.textContent.trim();
                if (Object.prototype.hasOwnProperty.call(matchMap, text)) {
                    if (setText(el, matchMap[text]) && DEBUG) {
                        log('  ✓ [textMatch:' + selector + '] "' + text + '" → "' + matchMap[text] + '"');
                    }
                } else if (DEBUG) {
                    unmatched.push(text);
                }
            });
        } catch(e) {
            log('  ✗ [textMatch:' + selector + '] 异常: ' + e.message);
        }
        return unmatched || [];
    }

    /** 按正则表达式匹配并替换文本（用于动态文本，如 "... and X more."、"Total: X (members: Y)"）。
     *  @param {Array<{selector:string, pattern:string, replacement:string}>} regexList
     *  @param {Document|Element} root
     *  @returns {Array} 未匹配的项目列表 */
    function translateByRegex(regexList, root) {
        root = root || document;
        if (!regexList || !regexList.length) return [];
        var unmatched = DEBUG ? [] : null;
        regexList.forEach(function(item) {
            try {
                var els = qsa(root, item.selector);
                if (els.length === 0) {
                    if (DEBUG) unmatched.push({ selector: item.selector, reason: 'DOM元素未找到' });
                    return;
                }
                els.forEach(function(el) {
                    if (el.dataset.f95RegexTranslated) return;
                    var oldText = el.textContent.trim();
                    var newText = oldText.replace(getRegex(item.pattern), item.replacement);
                    if (newText !== oldText) {
                        setText(el, newText);
                        el.dataset.f95RegexTranslated = '1';
                        log('  ✓ [regex:' + item.selector + '] "' + oldText + '" → "' + newText + '"');
                    }
                });
            } catch(e) {
                if (DEBUG) unmatched.push({ selector: item.selector, reason: e.message });
            }
        });
        return unmatched || [];
    }

    /** 翻译 label 元素（如 Completed、Abandoned、Collection 等）。返回未匹配的文本列表 */
    function translateLabels(root, labelsDict, selector) {
        root = root || document;
        selector = selector || '.label';
        if (!labelsDict || visibleKeys(labelsDict).length === 0) return [];

        var unmatched = DEBUG ? [] : null;
        try {
            var els = qsa(root, selector);
            els.forEach(function(el) {
                if (el.dataset.f95LabelTranslated) return;
                var text = el.textContent.trim();
                // 跳过以 _ 开头的注释 key
                if (!text || text.charAt(0) === '_') return;
                if (labelsDict[text] !== undefined) {
                    setText(el, labelsDict[text]);
                    el.dataset.f95LabelTranslated = '1';
                    log('  ✓ [Label] "' + text + '" → "' + labelsDict[text] + '"');
                } else if (DEBUG) {
                    unmatched.push(text);
                }
            });
        } catch(e) {
            log('  ✗ [Label] 异常: ' + e.message);
        }
        return unmatched || [];
    }

    /** 在 sam_tags 和 labels 中合并查找标签翻译（精确匹配 + 大小写不敏感回退）
     *  小写查找表按字典对象身份缓存，避免每次调用都重建 Object.keys。 */
    function lookupTag(text, samTags, labelsDict) {
        if (!text || !text.trim()) return null;
        var key = text.trim();
        // 精确匹配（hardenDict 后的字典没有原型链，直接下标是安全的）
        if (samTags && samTags[key] !== undefined) return samTags[key];
        if (labelsDict && labelsDict[key] !== undefined) return labelsDict[key];
        // 大小写不敏感回退
        var map = getTagLookup(samTags, labelsDict);
        return map ? (map.get(key.toLowerCase()) || null) : null;
    }

    /**
     * 改版后新增的 F95 模块（f95rv / f95wg / f95tt / f95st / f95tr）。
     * 只处理模块容器内的 UI 文案与 aria/title，不碰帖子正文和游戏标签。
     */
    function translateF95Modules(root) {
        root = root || document;
        var mods = DICT.f95_modules || {};

        // 1) 新版导航 ID（thtrending 已更名为 f95trTrending）
        var navMap = mods.nav || {};
        visibleKeys(navMap).forEach(function(id) {
            qsa(root, '[data-nav-id="' + id + '"] span').forEach(function(el) {
                setText(el, navMap[id]);
            });
        });

        // 2) f95st 统计区块 tabs
        translateTextMap(root, '.f95st-tab', mods.stats_tabs);

        // 3) f95tt 线程工具菜单（标题/描述由 xenforo 静态选择器处理）
        translateTextMap(root, '.f95tt-group-title', mods.thread_tools_groups);
        var findInput = root.querySelector('.f95tt-find-input');
        if (findInput) {
            var findToolText = uiText('find_tool', '查找工具…');
            setAttr(findInput, 'placeholder', findToolText);
            setAttr(findInput, 'aria-label', findToolText);
        }
        var promoteSlot = root.querySelector('.js-f95ttPromoteSlot[data-label]');
        if (promoteSlot && /^Promote/i.test(promoteSlot.getAttribute('data-label'))) {
            setAttr(promoteSlot, 'data-label', uiText('promote_short', '推广…'));
        }

        // 4) f95wg 版本提醒（保留铃铛图标）
        var alertLink = root.querySelector('.f95wg-strip-alerts a');
        if (alertLink && alertLink.textContent.indexOf('Alert me on new versions') !== -1) {
            setTextKeepIcon(alertLink, uiText('alert_new_versions', '有新版本时提醒我'));
        }

        // 5) f95rv 评分模块
        qsa(root, '.f95rv-banner-count').forEach(function(el) {
            var m = el.textContent.trim().match(/^([\d,]+)\s+reviews?$/i);
            if (m) setText(el, m[1] + ' ' + uiText('reviews_suffix', '条评测'));
        });
        qsa(root, '.f95rv-banner .f95rv-stars[aria-label]').forEach(function(el) {
            var m = el.getAttribute('aria-label').match(/^([\d.]+)\s+stars?$/i);
            if (m) setAttr(el, 'aria-label', uiFmt('stars_aria', '{n} 星', { n: m[1] }));
        });
        qsa(root, '.f95rv-banner-ring[aria-label]').forEach(function(el) {
            var m = el.getAttribute('aria-label').match(/^([\d.]+)\s+out of 5$/i);
            if (m) setAttr(el, 'aria-label', uiFmt('rating_out_of_5', '{n} 分（满分 5 分）', { n: m[1] }));
        });
        qsa(root, '.f95rv-rateStars[aria-label]').forEach(function(el) {
            if (el.getAttribute('aria-label') === 'Rate this game') {
                setAttr(el, 'aria-label', uiText('rate_this_game', '为该游戏评分'));
            }
        });

        // 6) 线程页标题下的元信息（sr-only + SVG title）
        translateTextMap(root, '.p-description .u-srOnly, .p-description svg title', mods.thread_meta);

        // 7) f95tr Trending 小部件
        var trending = mods.trending || {};
        qsa(root, '.f95tr-mv--new').forEach(function(el) {
            setText(el, trending.New || '新');
            setAttr(el, 'title', uiText('trending_new_in_list', '新进入榜单'));
        });
        qsa(root, '.f95tr-mv .u-srOnly').forEach(function(el) {
            var t = el.textContent;
            var place = uiText('trending_place_suffix', '位');
            if (t.indexOf('places up') !== -1) setText(el, t.replace('places up', place));
            else if (t.indexOf('places down') !== -1) setText(el, t.replace('places down', place));
        });
        qsa(root, '.f95tr-mv[title]').forEach(function(el) {
            var t = el.getAttribute('title');
            var up = t.match(/^Up (\d+) \(was #(\d+)\)$/);
            var down = t.match(/^Down (\d+) \(was #(\d+)\)$/);
            if (up) setAttr(el, 'title', uiFmt('trending_rank_up', '上升 {n} 位（原第 {was} 名）', { n: up[1], was: up[2] }));
            else if (down) setAttr(el, 'title', uiFmt('trending_rank_down', '下降 {n} 位（原第 {was} 名）', { n: down[1], was: down[2] }));
        });
    }

    // ==================== 页脚翻译（共享函数，两个引擎均调用） ====================
    function translateFooter(root) {
        root = root || document;

        // 1. 翻译快捷导航 / 用户菜单 / 底部链接文本（文本匹配，不受 href 变体影响）
        var linkMap = DICT.xenforo_footer_links || {};
        var linkKeys = visibleKeys(linkMap);
        if (linkKeys.length) {
            // 扩展页脚链接 (uix_extendedFooter)
            qsa(root, '.uix_extendedFooter .block-body a').forEach(function(el) {
                if (el.dataset.f95FooterLinkTranslated) return;
                var text = el.textContent.trim();
                if (linkMap[text] !== undefined) {
                    setText(el, linkMap[text]);
                    el.dataset.f95FooterLinkTranslated = '1';
                    log('  [FooterLink] "' + text + '" → "' + linkMap[text] + '"');
                }
            });
            // 底部页脚链接 (.p-footer-row-opposite)，SAM 页面 href="#" 时回退
            qsa(root, '.p-footer-row-opposite .p-footer-linkList a').forEach(function(el) {
                if (el.dataset.f95FooterBottomLinkTranslated) return;
                var text = el.textContent.trim();
                if (!text) return; // 跳过纯图标链接（Top、RSS）
                if (linkMap[text] !== undefined) {
                    setText(el, linkMap[text]);
                    el.dataset.f95FooterBottomLinkTranslated = '1';
                    log('  [FooterBottomLink] "' + text + '" → "' + linkMap[text] + '"');
                }
            });
        }

        // 2. 翻译论坛统计 dt（讨论串/消息/会员/最新会员）
        var statsDtMap = DICT.xenforo_footer_stats_dt || {};
        var statsKeys = visibleKeys(statsDtMap);
        if (statsKeys.length) {
            qsa(root, '[data-widget-key="forum_overview_forum_statistics"] dt').forEach(function(el) {
                if (el.dataset.f95FooterStatsTranslated) return;
                var text = el.textContent.trim();
                if (statsDtMap[text] !== undefined) {
                    setText(el, statsDtMap[text]);
                    el.dataset.f95FooterStatsTranslated = '1';
                    log('  [FooterStats] "' + text + '" → "' + statsDtMap[text] + '"');
                }
            });
        }

        // 3. 翻译 footer-extra 声明文本（仅第一个 <p>）
        var footerExtraText = DICT.xenforo_footer_extra || '';
        if (footerExtraText) {
            var extraEl = root.querySelector('.footer-extra-text p');
            if (extraEl && !extraEl.dataset.f95FooterExtraTranslated) {
                setText(extraEl, footerExtraText);
                extraEl.dataset.f95FooterExtraTranslated = '1';
                log('  [FooterExtra] 已翻译');
            }
        }

        // 4. 翻译语言选择器链接（保留地球图标 <i>，兼容 XenForo href="/misc/language" 和 SAM href="#"）
        var langEl = root.querySelector('.p-footer-linkList a[href="/misc/language"]');
        if (!langEl) {
            // SAM 页面 href="#" 回退：查找带地球图标的 overlay 链接
            var overlayLinks = qsa(root, '.p-footer-linkList a[data-xf-click="overlay"]');
            for (var i = 0; i < overlayLinks.length; i++) {
                if (overlayLinks[i].querySelector('i.fa-globe')) {
                    langEl = overlayLinks[i];
                    break;
                }
            }
        }
        if (langEl && !langEl.dataset.f95FooterLangTranslated) {
            var langText = langEl.textContent.trim();
            if (langText === 'English (US)') {
                setTextKeepIcon(langEl, uiText('footer_language', '英语（美国）'));
                langEl.dataset.f95FooterLangTranslated = '1';
                log('  [FooterLang] 已翻译');
            }
        }

        // 5. 翻译页脚区域内的 tooltip（独立于 translateTooltips，SAM 引擎无该函数）
        var tooltipDict = DICT.xenforo_tooltips || {};
        var tooltipKeys = visibleKeys(tooltipDict);
        if (tooltipKeys.length) {
            qsa(root, '.p-footer [data-original-title], .p-footer [title]').forEach(function(el) {
                if (el.dataset.f95FooterTooltipTranslated) return;
                var origTitle = el.getAttribute('data-original-title');
                if (origTitle && tooltipDict[origTitle] !== undefined) {
                    setAttr(el, 'data-original-title', tooltipDict[origTitle]);
                    el.dataset.f95FooterTooltipTranslated = '1';
                    log('  [FooterTooltip] "' + origTitle + '" → "' + tooltipDict[origTitle] + '"');
                }
                var title = el.getAttribute('title');
                if (title && tooltipDict[title] !== undefined && title !== origTitle) {
                    setAttr(el, 'title', tooltipDict[title]);
                    el.dataset.f95FooterTooltipTranslated = '1';
                    log('  [FooterTooltip:title] "' + title + '" → "' + tooltipDict[title] + '"');
                }
            });
        }
    }

    // ==================== 引擎 A：XenForo 主论坛 ====================
    function runXenForoEngine() {
        log('启动引擎 A (XenForo SSR)');
        log('路径: ' + window.location.pathname);
        log('字典条目数: xenforo=' + Object.keys(DICT.xenforo || {}).length);

        var xenforoDict = DICT.xenforo || {};

        // 页面模板分流：不同模板只跑相关规则，避免所有页面都做全量扫描
        var TEMPLATE = (document.documentElement.dataset && document.documentElement.dataset.template) || '';
        var IS_THREAD = TEMPLATE === 'thread_view' || TEMPLATE === 'f95rv_thread_reviews';
        var IS_FORUM = TEMPLATE === 'forum_list' || TEMPLATE === 'forum_view' || TEMPLATE === 'category_view';

        // 分离 notice-content 选择器（需要 innerHTML 保留 dismiss 链接）和普通选择器
        var noticeSelectors = {};  // selector -> HTML，用于 .notice-content 元素
        var normalSelectors = {};  // selector -> text，用于普通元素
        var normalScope = '';      // 所有普通选择器的并集，用于"一次查询跳过整组"
        var normalKeys = [];
        var noticeKeys = [];
        var regexScope = '';
        var placeholderScope = '';
        var FORUM_SCOPE = 'a[data-shortcut="node-description"], .uix_categoryTitle, a.subNodeLink, .p-breadcrumbs, .p-title-value';
        var F95_SCOPE = '[data-nav-id], .f95st-tab, .f95tt, .f95wg, .f95rv, .f95tr, .p-description';

        /** 字典热更新后重建选择器快照 */
        function rebuildSelectorDicts() {
            xenforoDict = DICT.xenforo || {};
            noticeSelectors = {};
            normalSelectors = {};
            visibleKeys(xenforoDict).forEach(function(key) {
                if (key.indexOf('.notice-content') !== -1) {
                    noticeSelectors[key] = xenforoDict[key];
                } else {
                    normalSelectors[key] = xenforoDict[key];
                }
            });
            normalKeys = Object.keys(normalSelectors);
            noticeKeys = Object.keys(noticeSelectors);
            normalScope = normalKeys.join(',');
            regexScope = (DICT.xenforo_regex || []).map(function(item) { return item.selector; }).join(',');
            placeholderScope = visibleKeys(DICT.xenforo_placeholders).join(',');
        }
        rebuildSelectorDicts();

        var xenforoPassCount = 0;

        // ==================== 时间短语覆盖 (XF.phrases) ====================
        // 覆盖 XenForo 的 i18n 短语模板，使其原生渲染中文时间文本。
        // XF.phrases 在页面内联脚本中通过 jQuery.extend 填充，
        // 之后 XenForo 的定时器每 ~60s 会用这些模板刷新 <time> 元素的相对时间。

        var timePhrases = DICT.xenforo_time_phrases || {};

        function applyTimePhrases() {
            timePhrases = DICT.xenforo_time_phrases || {};
            var keys = visibleKeys(timePhrases);
            if (!keys.length) return;
            var phrases = {};
            keys.forEach(function(k) { phrases[k] = timePhrases[k]; });
            try {
                Object.assign(XF.phrases, phrases);
                log('✓ 时间短语已覆盖 XF.phrases (' + keys.length + ' 条)');
            } catch(e) {
                log('✗ XF.phrases 覆盖失败: ' + e.message);
            }
        }

        var _formatTimeNum = function(n) { return (n < 10 ? '0' : '') + n; };
        // nowDate 由调用方传入，避免每个 time 元素都重新构造"当前时间"
        function _isSameDay(ts, nowDate) {
            var d1 = new Date(ts);
            return d1.getFullYear() === nowDate.getFullYear() &&
                   d1.getMonth() === nowDate.getMonth() &&
                   d1.getDate() === nowDate.getDate();
        }
        function _toChineseTime(dt) {
            var d = new Date(dt);
            return uiFmt('time_date', '{year}年{month}月{day}日 {time}', {
                year: d.getFullYear(),
                month: d.getMonth() + 1,
                day: d.getDate(),
                time: _formatTimeNum(d.getHours()) + ':' + _formatTimeNum(d.getMinutes())
            });
        }
        function _toChineseTimeShort(dt) {
            var d = new Date(dt);
            return _formatTimeNum(d.getHours()) + ':' + _formatTimeNum(d.getMinutes());
        }

        function refreshTimeElements(root) {
            root = root || document;
            var els = qsa(root, 'time.u-dt');
            if (!els.length) return 0;
            var now = Date.now();
            var nowDate = new Date(now);
            var count = 0;
            els.forEach(function(el) {
                var dt = el.getAttribute('datetime');
                if (!dt) return;

                // 只在文本/标题仍是英文时接管；已经是中文就交给 XF，
                // 避免与站点自身的定时刷新来回覆盖，也避免无谓的 Date 计算。
                var current = el.textContent;
                var title = el.getAttribute('title');
                var needsText = /[A-Za-z]/.test(current);
                var needsTitle = !!(title && /[A-Za-z]/.test(title));
                if (!needsText && !needsTitle) return;

                var ts = Date.parse(dt);
                if (isNaN(ts)) return;
                if (needsText) {
                    var diffSec = Math.floor((now - ts) / 1000);
                    var diffMin = Math.floor(diffSec / 60);
                    var diffHour = Math.floor(diffMin / 60);
                    var newText;
                    if (diffSec < 60) {
                        newText = uiText('time_just_now', '刚刚');
                    } else if (diffMin < 60) {
                        newText = uiFmt('time_minutes_ago', '{n} 分钟前', { n: diffMin });
                    } else if (diffHour < 6) {
                        newText = uiFmt('time_hours_ago', '{n} 小时前', { n: diffHour });
                    } else if (_isSameDay(ts, nowDate)) {
                        newText = uiFmt('time_today_at', '今天 {time}', { time: _toChineseTimeShort(dt) });
                    } else {
                        newText = _toChineseTime(dt);
                    }
                    if (current !== newText) {
                        setText(el, newText);
                        count++;
                    }
                }
                if (needsTitle) {
                    setAttr(el, 'title', _toChineseTime(dt));
                }
            });
            if (count > 0) log('  刷新时间元素: ' + count + ' 个');
            return count;
        }

        // ==================== 注册日期翻译 ====================
        var _MONTH_ABBR = {
            'Jan': '1', 'Feb': '2', 'Mar': '3', 'Apr': '4',
            'May': '5', 'Jun': '6', 'Jul': '7', 'Aug': '8',
            'Sep': '9', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        var _JOINED_RE = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s+(\d{4})$/;

        function translateJoinedDates(root) {
            root = root || document;
            var dds = qsa(root, 'dl.pairs--justified dd');
            if (!dds.length) return;
            dds.forEach(function(dd) {
                if (dd.dataset.f95JoinedTranslated) return;
                var text = dd.textContent.trim();
                var m = text.match(_JOINED_RE);
                if (!m) return;
                setText(dd, uiFmt('time_date_only', '{year}年{month}月{day}日', {
                    year: m[3],
                    month: _MONTH_ABBR[m[1]],
                    day: parseInt(m[2], 10)
                }));
                dd.dataset.f95JoinedTranslated = '1';
            });
        }

        // 尽早覆盖 XF.phrases
        if (typeof XF !== 'undefined' && XF.phrases) {
            applyTimePhrases();
        } else {
            var _timePollAttempts = 0;
            var _timePollMax = 500; // 5s max
            var _timePoll = setInterval(function() {
                _timePollAttempts++;
                if (typeof XF !== 'undefined' && XF.phrases) {
                    clearInterval(_timePoll);
                    applyTimePhrases();
                    refreshTimeElements();
                } else if (_timePollAttempts >= _timePollMax) {
                    clearInterval(_timePoll);
                    log('⚠ XF.phrases 轮询超时，使用手动刷新回退');
                }
            }, 10);
        }

        /**
         * 只翻译 Genre 字段紧邻的纯文本 Spoiler。
         * 不再遍历所有 Spoiler——以前的实现会把任意纯文本内容（Developer Notes、安装说明等）
         * 按逗号切分并用 UI 标签字典改写，属于"按字符串翻译"。
         */
        function translateSpoilerTags(root) {
            root = root || document;
            var samTags = DICT.sam_tags || {};
            var labelsDict = DICT.labels || {};

            function nextSpoiler(b) {
                var node = b.nextSibling, guard = 0;
                while (node && guard++ < 10) {
                    if (node.nodeType === 1) {
                        if (node.classList.contains('bbCodeSpoiler')) return node;
                        if (node.classList.contains('bbWrapper')) break;
                        var inner = node.querySelector && node.querySelector('.bbCodeSpoiler');
                        if (inner) return inner;
                    }
                    node = node.nextSibling;
                }
                return null;
            }

            qsa(root, '.bbWrapper b').forEach(function(b) {
                var label = b.textContent.trim().replace(/[:：]\s*$/, '');
                // "Genre" 是本插件自己翻译前的原文；"类型" 是翻译后的标签
                if (label !== 'Genre' && label !== '类型') return;
                var spoiler = nextSpoiler(b);
                if (!spoiler) return;
                var content = spoiler.querySelector('.bbCodeBlock-content');
                if (!content || content.dataset.f95GenreTranslated) return;
                if (content.children.length > 0) return; // 富文本不处理

                var text = content.textContent;
                if (!text || !text.trim()) return;

                // 保留原始分隔符（逗号/中文逗号及其空白），只替换命中的标签词
                var parts = text.split(/(\s*[,，]\s*)/);
                var changed = false;
                var out = parts.map(function(part, idx) {
                    if (idx % 2 === 1) return part; // 分隔符
                    var lead = part.match(/^\s*/)[0];
                    var trail = part.match(/\s*$/)[0];
                    var core = part.trim();
                    if (!core) return part;
                    var zh = lookupTag(core, samTags, labelsDict);
                    if (zh) { changed = true; return lead + zh + trail; }
                    return part;
                }).join('');

                content.dataset.f95GenreTranslated = '1';
                if (changed) {
                    setText(content, out);
                    log('  [Genre] 已翻译 Genre 标签');
                }
            });
        }

        function translateThreadFields(root) {
            root = root || document;
            var threadFields = DICT.thread_fields;
            if (!threadFields) return;

            var labels = threadFields.labels || {};
            var censoredValues = threadFields.censored_values || {};
            var osValues = threadFields.os_values || {};
            var langValues = threadFields.language_values || {};
            var downloadText = threadFields.download || '';
            var labelKeys = visibleKeys(labels);

            var wrappers = qsa(root, '.bbWrapper');
            wrappers.forEach(function(wrapper) {
                // 翻译 <b> 字段标签（以及 Censored/OS/Language 的值）
                if (labelKeys.length) {
                    var bTags = wrapper.querySelectorAll('b');
                    bTags.forEach(function(b) {
                        if (b.dataset.f95ThreadFieldTranslated) return;
                        // 兼容 <b>Overview:</b> 这种冒号在 <b> 内部的结构
                        var origText = b.textContent.trim().replace(/[:：]\s*$/, '');
                        if (!Object.prototype.hasOwnProperty.call(labels, origText)) return;

                        // 值翻译映射（在翻译标签之前处理，因为需要原始英文 key 识别字段）
                        var valueMap = {
                            'Censored': censoredValues,
                            'OS': osValues,
                            'Language': langValues
                        };
                        var valueDict = valueMap[origText];
                        if (valueDict && Object.keys(valueDict).length > 0) {
                            var next = b.nextSibling;
                            if (next && next.nodeType === Node.TEXT_NODE) {
                                var match = next.textContent.match(/^:\s*(.+)$/);
                                if (match) {
                                    var value = match[1].trim();
                                    if (Object.prototype.hasOwnProperty.call(valueDict, value)) {
                                        var newValue = ': ' + valueDict[value];
                                        setTextNode(next, newValue);
                                        log('  [ThreadField] "' + origText + ': ' + value + '" → "' + valueDict[value] + '"');
                                    }
                                }
                            }
                        }

                        // 翻译字段标签文本
                        setText(b, labels[origText]);
                        b.dataset.f95ThreadFieldTranslated = '1';
                        log('  [ThreadField] "<b>' + origText + '</b>" → "' + labels[origText] + '"');
                    });
                }

                // 翻译 DOWNLOAD
                if (downloadText) {
                    var spans = wrapper.querySelectorAll('span');
                    spans.forEach(function(span) {
                        if (span.dataset.f95ThreadFieldTranslated) return;
                        if (span.textContent.trim() === 'DOWNLOAD') {
                            setText(span, downloadText);
                            span.dataset.f95ThreadFieldTranslated = '1';
                            log('  [ThreadField] "DOWNLOAD" → "' + downloadText + '"');
                        }
                    });
                }
            });
        }

        function translateButtons(root) {
            root = root || document;
            var buttonDict = DICT.xenforo_buttons || {};
            var normalizedMap = getNormalizedMap(buttonDict);
            if (visibleKeys(buttonDict).length === 0) return;

            function normalize(text) {
                return text.trim().toLowerCase().replace(/:$/, '').trim();
            }

            var buttons = qsa(root, '.button-text');
            buttons.forEach(function(btn) {
                if (btn.dataset.f95ButtonTranslated) return;
                // 取最内层 span 的文本（XenForo 按钮结构: .button-text > span > "Text"）
                var textEl = btn.querySelector('span') || btn;
                var text = textEl.textContent.trim();
                if (!text) return;
                var translation = normalizedMap[normalize(text)];
                if (translation) {
                    setText(textEl, translation);
                    btn.dataset.f95ButtonTranslated = '1';
                    log('  [按钮] "' + text + '" → "' + translation + '"');
                }
            });

            // .tic--button 按钮（如 "Ignore forum"，文本直接在 <a> 内，无 .button-text 包装）
            qsa(root, '.tic--button').forEach(function(btn) {
                if (btn.dataset.f95ButtonTranslated) return;
                if (btn.querySelector('.button-text')) return; // 已有 .button-text 子元素，上面已处理
                // 排除 structItem 内的 Ignore（由 translateStructItems 处理）
                if (btn.closest('.structItem-extraInfo')) return;
                var text = btn.textContent.trim();
                if (!text) return;
                var translation = normalizedMap[normalize(text)];
                if (translation) {
                    setText(btn, translation);
                    btn.dataset.f95ButtonTranslated = '1';
                    log('  [tic按钮] "' + text + '" → "' + translation + '"');
                }
            });
        }

        function translateTooltips(root) {
            root = root || document;
            var tooltipDict = DICT.xenforo_tooltips || {};
            var keys = visibleKeys(tooltipDict);
            if (!keys.length) return;

            var els = qsa(root, '[data-original-title], [title]');
            els.forEach(function(el) {
                if (el.dataset.f95TooltipTranslated) return;

                // data-original-title（XenForo 主 tooltip 属性）
                var origTitle = el.getAttribute('data-original-title');
                if (origTitle && tooltipDict[origTitle] !== undefined) {
                    setAttr(el, 'data-original-title', tooltipDict[origTitle]);
                    el.dataset.f95TooltipTranslated = '1';
                    log('  [Tooltip] "' + origTitle + '" → "' + tooltipDict[origTitle] + '"');
                }

                // 常规 title 属性
                var title = el.getAttribute('title');
                if (title && tooltipDict[title] !== undefined && title !== origTitle) {
                    setAttr(el, 'title', tooltipDict[title]);
                    el.dataset.f95TooltipTranslated = '1';
                    log('  [Tooltip:title] "' + title + '" → "' + tooltipDict[title] + '"');
                }
            });
        }

        function translateForumNames(root) {
            root = root || document;
            var forumNames = DICT.xenforo_forum_names || {};
            var keys = visibleKeys(forumNames);
            if (!keys.length) return;

            var selectors = [
                'a[data-shortcut="node-description"]',
                '.uix_categoryTitle',
                'a.subNodeLink',
                '.p-breadcrumbs span[itemprop="name"]'
            ];
            // 帖子页的 .p-title-value 是用户内容（主题标题），绝不能按论坛名翻译
            if (!IS_THREAD) selectors.push('.p-title-value');
            selectors.forEach(function(selector) {
                var els = qsa(root, selector);
                els.forEach(function(el) {
                    if (el.dataset.f95ForumTranslated) return;
                    var text = el.textContent.trim();
                    if (Object.prototype.hasOwnProperty.call(forumNames, text)) {
                        setText(el, forumNames[text]);
                        el.dataset.f95ForumTranslated = '1';
                        log('  [ForumName] "' + text + '" → "' + forumNames[text] + '"');
                    }
                });
            });
        }

        function translateNodeDescriptions(root) {
            root = root || document;
            var descMap = DICT.xenforo_node_descriptions || {};
            var keys = visibleKeys(descMap);
            if (!keys.length) return;

            var descEls = qsa(root, '.node-description, .p-description');
            if (!descEls.length) return;
            descEls.forEach(function(el) {
                if (el.dataset.f95DescTranslated) return;
                var text = el.textContent.replace(/\s+/g, ' ').trim();
                for (var i = 0; i < keys.length; i++) {
                    var normalizedKey = keys[i].replace(/\s+/g, ' ').trim();
                    if (text.indexOf(normalizedKey) === 0) {
                        setSafeHtml(el, descMap[keys[i]]);
                        el.dataset.f95DescTranslated = '1';
                        log('  [NodeDesc] 已翻译: "' + keys[i].substring(0, 50) + '..."');
                        break;
                    }
                }
            });
        }

        function translateXenForoOverlays(root) {
            root = root || document;
            var overlaysDict = DICT.xenforo_overlays || {};
            var overlayTypes = visibleKeys(overlaysDict);
            if (!overlayTypes.length) return;

            var overlays = qsa(root, '.overlay');
            if (!overlays.length) return;

            overlays.forEach(function(overlay) {
                if (overlay.dataset.f95OverlayTranslated) return;

                var titleEl = overlay.querySelector('.overlay-title');
                if (!titleEl) return;

                var titleText = titleEl.textContent.trim();

                // 遍历所有 overlay 类型配置，匹配标题文本
                for (var i = 0; i < overlayTypes.length; i++) {
                    var typeKey = overlayTypes[i];
                    var cfg = overlaysDict[typeKey];
                    if (!cfg || !cfg.match_title) continue;

                    if (titleText.indexOf(cfg.match_title) === -1) continue;

                    // 翻译标题（保留关闭按钮），支持静态文本和正则替换两种模式
                    var closer = titleEl.querySelector('.overlay-titleCloser');
                    if (closer) {
                        var newTitle = null;
                        if (cfg.title_pattern) {
                            var re = getRegex(cfg.title_pattern);
                            newTitle = titleText.replace(re, cfg.title_replacement);
                        } else if (cfg.title) {
                            newTitle = cfg.title;
                        }
                        if (newTitle != null) {
                            // 用纯文本写入，避免标题中的用户名/远程文本被当作 HTML
                            titleEl.textContent = newTitle;
                            titleEl.insertBefore(closer, titleEl.firstChild);
                        }
                    }

                    // 翻译链接文本
                    var linkMap = cfg.links || {};
                    overlay.querySelectorAll('.menu-linkRow').forEach(function(link) {
                        if (link.dataset.f95OverlayLinkTranslated) return;
                        var text = link.textContent.trim();
                        if (linkMap[text] !== undefined) {
                            setText(link, linkMap[text]);
                            link.dataset.f95OverlayLinkTranslated = '1';
                            log('  [Overlay:' + typeKey + '] "' + text + '" → "' + linkMap[text] + '"');
                        }
                    });

                    // 翻译表单元素（如 Report content 弹窗中的 radio、label、按钮等）
                    var formCfg = cfg.forms;
                    if (formCfg) {
                        // 翻译 label 文本（Report reason / More information）
                        var labelMap = formCfg.labels || {};
                        overlay.querySelectorAll('.formRow-label').forEach(function(label) {
                            if (label.dataset.f95OverlayFormTranslated) return;
                            var text = label.textContent.trim();
                            if (labelMap[text] !== undefined) {
                                setText(label, labelMap[text]);
                                label.dataset.f95OverlayFormTranslated = '1';
                                log('  [Overlay:' + typeKey + ':label] "' + text + '" → "' + labelMap[text] + '"');
                            }
                        });

                        // 翻译 radio 选项文本
                        var radioMap = formCfg.radios || {};
                        overlay.querySelectorAll('.iconic-label').forEach(function(span) {
                            if (span.dataset.f95OverlayFormTranslated) return;
                            var text = span.textContent.trim();
                            if (radioMap[text] !== undefined) {
                                setText(span, radioMap[text]);
                                span.dataset.f95OverlayFormTranslated = '1';
                                log('  [Overlay:' + typeKey + ':radio] "' + text + '" → "' + radioMap[text] + '"');
                            }
                        });

                        // 翻译说明文本（.inputChoices-explain）
                        var explainMap = formCfg.explanations || {};
                        overlay.querySelectorAll('.inputChoices-explain').forEach(function(dfn) {
                            if (dfn.dataset.f95OverlayFormTranslated) return;
                            var text = dfn.textContent.trim();
                            if (explainMap[text] !== undefined) {
                                setText(dfn, explainMap[text]);
                                dfn.dataset.f95OverlayFormTranslated = '1';
                                log('  [Overlay:' + typeKey + ':explain] 已翻译');
                            }
                        });

                        // 翻译提交按钮文本
                        var buttonMap = formCfg.buttons || {};
                        overlay.querySelectorAll('.button-text').forEach(function(btn) {
                            if (btn.dataset.f95OverlayFormTranslated) return;
                            var span = btn.querySelector('span') || btn;
                            var text = span.textContent.trim();
                            if (buttonMap[text] !== undefined) {
                                setText(span, buttonMap[text]);
                                btn.dataset.f95OverlayFormTranslated = '1';
                                log('  [Overlay:' + typeKey + ':button] "' + text + '" → "' + buttonMap[text] + '"');
                            }
                        });
                    }

                    overlay.dataset.f95OverlayTranslated = '1';
                    log('  [Overlay:' + typeKey + '] 已翻译');
                    break;
                }
            });
        }

        function translateMemberTooltip(root) {
            root = root || document;
            var tooltips = qsa(root, '.tooltip--member');
            if (!tooltips.length) return;

            var ttDict = DICT.xenforo_member_tooltip || {};
            var ttKeys = visibleKeys(ttDict);
            if (!ttKeys.length) return;

            tooltips.forEach(function(tooltip) {
                // 1. 翻译 "From " 文本节点 → "来自于 "
                //    定位: .memberTooltip-blurb 中不含 dl.pairs 的 div，查找 "From " 文本节点
                var blurbDivs = tooltip.querySelectorAll('.memberTooltip-blurb:not([data-f95-from-done])');
                blurbDivs.forEach(function(blurb) {
                    if (blurb.querySelector('dl.pairs')) return; // 跳过 Joined/Last seen 等含 dl 的 blurb
                    var walker = document.createTreeWalker(blurb, NodeFilter.SHOW_TEXT, null, false);
                    var node;
                    while (node = walker.nextNode()) {
                        if (node.textContent.indexOf('From ') !== -1) {
                            setTextNode(node, node.textContent.replace('From ', uiText('member_from_prefix', '来自于 ')));
                            blurb.setAttribute('data-f95-from-done', '1');
                            log('  [MemberTooltip] "From " → "来自于 "');
                        }
                    }
                });

                // 2. 翻译 dt 元素 — 逐元素标记，避免竞态导致漏翻
                var dts = tooltip.querySelectorAll('dt:not([data-f95-mem-dt])');
                dts.forEach(function(dt) {
                    var text = dt.textContent.trim();
                    if (ttDict[text] !== undefined) {
                        setText(dt, ttDict[text]);
                        dt.setAttribute('data-f95-mem-dt', '1');
                        log('  [MemberTooltip:dt] "' + text + '" → "' + ttDict[text] + '"');
                    }
                });

                // 3. 翻译按钮文本 — 逐按钮标记，兼容两种 HTML 结构：
                //    a) <a class="button--link button"><span class="button-text">Follow</span></a>
                //    b) <a class="button button--link">Ignore</a>
                var actionLinks = tooltip.querySelectorAll('.memberTooltip-actions a.button:not([data-f95-mem-btn])');
                actionLinks.forEach(function(link) {
                    var span = link.querySelector('.button-text');
                    var text = span ? span.textContent.trim() : link.textContent.trim();
                    if (ttDict[text] !== undefined) {
                        setText(span || link, ttDict[text]);
                        link.setAttribute('data-f95-mem-btn', '1');
                        log('  [MemberTooltip:btn] "' + text + '" → "' + ttDict[text] + '"');
                    }
                });

                // 4. 新版资料卡（f95mbCard）：<div><span>Joined</span><strong>...</strong></div>
                qsa(tooltip, '.f95mbCard-stats span').forEach(function(el) {
                    var text = el.textContent.trim();
                    if (Object.prototype.hasOwnProperty.call(ttDict, text)) {
                        setText(el, ttDict[text]);
                    }
                });
                qsa(tooltip, '.f95mbCard-actions .button-text').forEach(function(el) {
                    var text = el.textContent.trim();
                    if (Object.prototype.hasOwnProperty.call(ttDict, text)) {
                        setText(el, ttDict[text]);
                    }
                });

                // 5. 翻译 "Last seen" 后面的活动状态文本
                //    结构: <dd><time>...</time> <span>·</span> Viewing thread <em><a>...</a></em></dd>
                var activityDict = DICT.xenforo_member_tooltip_activity || {};
                var activityKeys = visibleKeys(activityDict).slice();
                if (activityKeys.length) {
                    // 按 key 长度降序排列，长 key 优先匹配（"Viewing profile post by" > "Viewing profile post"）
                    activityKeys.sort(function(a, b) { return b.length - a.length; });

                    var lastSeenDds = tooltip.querySelectorAll('.memberTooltip-blurb dl.pairs--inline dd:not([data-f95-activity-done])');
                    lastSeenDds.forEach(function(dd) {
                        for (var i = 0; i < dd.childNodes.length; i++) {
                            var child = dd.childNodes[i];
                            if (child.nodeType !== 3) continue;
                            var text = child.textContent;
                            for (var k = 0; k < activityKeys.length; k++) {
                                var key = activityKeys[k];
                                if (text.indexOf(key) !== -1) {
                                    setTextNode(child, text.replace(key, activityDict[key]));
                                    dd.setAttribute('data-f95-activity-done', '1');
                                    log('  [MemberTooltip:activity] "' + key + '" → "' + activityDict[key] + '"');
                                    return; // 每个 dd 只翻译一次
                                }
                            }
                        }
                    });
                }
            });
        }

        function translateStructItems(root) {
            root = root || document;
            var items = qsa(root, '.structItem--thread');
            if (!items.length) return;

            log('--- 帖子列表条目翻译 (' + items.length + ' 条) ---');

            // 1. 状态徽章翻译（Locked → 已锁定, Redirect → 重定向, Sticky → 置顶, Poll → 投票）
            var statusDict = DICT.xenforo_thread_statuses || {};
            var statusKeys = visibleKeys(statusDict);
            if (statusKeys.length) {
                qsa(root, '.structItem-statuses .u-srOnly').forEach(function(span) {
                    if (span.dataset.f95StructStatus) return;
                    var text = span.textContent.trim();
                    if (statusDict[text] !== undefined) {
                        setText(span, statusDict[text]);
                        span.dataset.f95StructStatus = '1';
                        log('  [StructStatus] "' + text + '" → "' + statusDict[text] + '"');
                    }
                });
            }

            // 2. 统计标签翻译（Replies → 回复, Views → 查看）
            var metaDict = DICT.xenforo_thread_meta_dt || {};
            var metaKeys = visibleKeys(metaDict);
            if (metaKeys.length) {
                qsa(root, '.structItem-cell--meta dt').forEach(function(dt) {
                    if (dt.dataset.f95StructMeta) return;
                    var text = dt.textContent.trim();
                    if (metaDict[text] !== undefined) {
                        setText(dt, metaDict[text]);
                        dt.dataset.f95StructMeta = '1';
                        log('  [StructMeta] "' + text + '" → "' + metaDict[text] + '"');
                    }
                });
            }

            // 3. "Ignore" 按钮翻译
            qsa(root, '.structItem-extraInfo .tic--button').forEach(function(btn) {
                if (btn.dataset.f95StructIgnore) return;
                if (btn.textContent.trim() === 'Ignore') {
                    setText(btn, DICT.xenforo_thread_ignore || '忽略');
                    btn.dataset.f95StructIgnore = '1';
                    log('  [StructIgnore] "Ignore" → "' + (DICT.xenforo_thread_ignore || '忽略') + '"');
                }
            });

            // 4. "N/A" → "暂无"（无最新回复时）
            qsa(root, '.structItem-cell--latest').forEach(function(cell) {
                if (cell.dataset.f95StructNA) return;
                var text = cell.textContent.trim();
                if (text === 'N/A') {
                    setText(cell, DICT.xenforo_thread_na || '暂无');
                    cell.dataset.f95StructNA = '1';
                    log('  [StructNA] "N/A" → "' + (DICT.xenforo_thread_na || '暂无') + '"');
                }
            });

            // 5. "X star(s)" → "X 星"（评分 title 属性 + 屏幕阅读器文本）
            var starsSuffix = DICT.xenforo_thread_stars_suffix || ' 星';
            qsa(root, '.structItem .ratingStars[title]').forEach(function(stars) {
                if (stars.dataset.f95StructStars) return;
                var title = stars.getAttribute('title');
                var newTitle = title.replace(/(\d+\.?\d*)\s+star\(s\)/i, '$1' + starsSuffix);
                if (newTitle !== title) {
                    setAttr(stars, 'title', newTitle);
                    var srOnly = stars.querySelector('.u-srOnly');
                    if (srOnly) {
                        setText(srOnly, srOnly.textContent.replace(/(\d+\.?\d*)\s+star\(s\)/i, '$1' + starsSuffix));
                    }
                    stars.dataset.f95StructStars = '1';
                    log('  [StructStars] "' + title + '" → "' + newTitle + '"');
                }
            });

            // 6. "X Votes" → "X 票"（评分投票数）
            var votesSuffix = DICT.xenforo_thread_votes_suffix || ' 票';
            qsa(root, '.structItem .ratingStarsRow-text > div').forEach(function(el) {
                if (el.dataset.f95StructVotes) return;
                var text = el.textContent.trim();
                var m = text.match(/^(\d+)\s*Votes?$/);
                if (m) {
                    setText(el, m[1] + votesSuffix);
                    el.dataset.f95StructVotes = '1';
                    log('  [StructVotes] "' + text + '" → "' + el.textContent + '"');
                }
            });
        }

        function translateFilterMenu(root) {
            root = root || document;
            var filterDict = DICT.xenforo_filter_menu || {};
            var optionDict = DICT.xenforo_filter_options || {};

            // 1. "Filters" trigger link（始终在 DOM 中）
            qsa(root, '.filterBar-menuTrigger').forEach(function(el) {
                if (el.dataset.f95FilterTrigger) return;
                if (el.textContent.trim() === 'Filters') {
                    setText(el, filterDict.trigger || '筛选');
                    el.dataset.f95FilterTrigger = '1';
                    log('  [FilterTrigger] "Filters" → "' + (filterDict.trigger || '筛选') + '"');
                }
            });

            // 2. "Show only:" 菜单标题（.menu-header 是 .js-filterMenuBody 的兄弟，非子元素）
            qsa(root, '.filterBar .menu-header').forEach(function(el) {
                if (el.dataset.f95FilterHeader) return;
                if (el.textContent.trim() === 'Show only:') {
                    setText(el, filterDict.show_only || '仅显示：');
                    el.dataset.f95FilterHeader = '1';
                    log('  [FilterHeader] "Show only:" → "' + (filterDict.show_only || '仅显示：') + '"');
                }
            });

            // 3. "Prefix:" 和 "Sort by:" 裸文本节点
            qsa(root, '.js-filterMenuBody .menu-row--separated').forEach(function(row) {
                for (var i = 0; i < row.childNodes.length; i++) {
                    var child = row.childNodes[i];
                    if (child.nodeType !== 3) continue;
                    var text = child.textContent.trim();
                    if (text === 'Prefix:') {
                        setTextNode(child, child.textContent.replace('Prefix:', filterDict.prefix_label || '前缀：'));
                        log('  [FilterRow] "Prefix:" → "' + (filterDict.prefix_label || '前缀：') + '"');
                    } else if (text === 'Sort by:') {
                        setTextNode(child, child.textContent.replace('Sort by:', filterDict.sort_by || '排序：'));
                        log('  [FilterRow] "Sort by:" → "' + (filterDict.sort_by || '排序：') + '"');
                    }
                }
            });

            // 4. <label> 元素翻译（Started by:, Last updated:）
            qsa(root, '.js-filterMenuBody label').forEach(function(label) {
                if (label.dataset.f95FilterLabel) return;
                var text = label.textContent.trim();
                if (text === 'Started by:') {
                    setText(label, filterDict.started_by || '作者：');
                    label.dataset.f95FilterLabel = '1';
                    log('  [FilterLabel] "Started by:" → "' + (filterDict.started_by || '作者：') + '"');
                } else if (text === 'Last updated:') {
                    setText(label, filterDict.last_updated || '最近更新：');
                    label.dataset.f95FilterLabel = '1';
                    log('  [FilterLabel] "Last updated:" → "' + (filterDict.last_updated || '最近更新：') + '"');
                }
            });

            // 5. "Sort order" / "Sort direction" 屏幕阅读器文本
            qsa(root, '.js-filterMenuBody .u-srOnly').forEach(function(sr) {
                if (sr.dataset.f95FilterSR) return;
                var text = sr.textContent.trim();
                if (text === 'Sort order') {
                    setText(sr, filterDict.sort_order || '排序方式');
                    sr.dataset.f95FilterSR = '1';
                    log('  [FilterSR] "Sort order" → "' + (filterDict.sort_order || '排序方式') + '"');
                } else if (text === 'Sort direction') {
                    setText(sr, filterDict.sort_direction || '排序方向');
                    sr.dataset.f95FilterSR = '1';
                    log('  [FilterSR] "Sort direction" → "' + (filterDict.sort_direction || '排序方向') + '"');
                }
            });

            // 6. <option> 文本翻译（Last updated / Sort by 下拉选项）
            var optionKeys = visibleKeys(optionDict);
            if (optionKeys.length) {
                qsa(root, '.js-filterMenuBody select option').forEach(function(opt) {
                    if (opt.dataset.f95FilterOption) return;
                    var text = opt.textContent.trim();
                    if (optionDict[text] !== undefined) {
                        setText(opt, optionDict[text]);
                        opt.dataset.f95FilterOption = '1';
                        log('  [FilterOption] "' + text + '" → "' + optionDict[text] + '"');
                    }
                });
            }

            // 7. <optgroup> label 属性翻译（Prefix 分组: Other/Engine/Status）
            qsa(root, '.js-filterMenuBody optgroup').forEach(function(group) {
                if (group.dataset.f95FilterOptgroup) return;
                var label = group.getAttribute('label');
                var optgroupMap = DICT.xenforo_filter_optgroups || FILTER_OPTGROUP_MAP;
                if (label && optgroupMap[label]) {
                    setAttr(group, 'label', optgroupMap[label]);
                    group.dataset.f95FilterOptgroup = '1';
                    log('  [FilterOptgroup] "' + label + '" → "' + optgroupMap[label] + '"');
                }
            });

            // 8. "Prefix…" placeholder
            qsa(root, '.js-filterMenuBody .select2-search__field').forEach(function(input) {
                if (input.dataset.f95FilterPH) return;
                if (input.getAttribute('placeholder') === 'Prefix…') {
                    setAttr(input, 'placeholder', filterDict.prefix_placeholder || '前缀…');
                    input.dataset.f95FilterPH = '1';
                    log('  [FilterPH] "Prefix…" → "' + (filterDict.prefix_placeholder || '前缀…') + '"');
                }
            });

            // 9. Select2 下拉 optgroup 标题（渲染在 .js-filterMenuBody 之外，动态出现）
            qsa(root, '.select2-results__group').forEach(function(el) {
                if (el.dataset.f95FilterOptgroup) return;
                var text = el.textContent.trim();
                var optgroupMap = DICT.xenforo_filter_optgroups || FILTER_OPTGROUP_MAP;
                if (optgroupMap[text]) {
                    setText(el, optgroupMap[text]);
                    el.dataset.f95FilterOptgroup = '1';
                    log('  [FilterSelect2Group] "' + text + '" → "' + optgroupMap[text] + '"');
                }
            });
        }

        /**
         * 反应按钮是"有状态"的：点赞后 XenForo 会替换 .js-reactionText 并加上 .has-reaction。
         * 不能用一个静态选择器永远写"点赞"，否则点赞后仍显示"点赞"。
         */
        function translateReactions(root) {
            root = root || document;
            var texts = DICT.reaction_texts || {};
            var like = texts.like || '点赞';
            var unlike = texts.unlike || '取消点赞';
            qsa(root, '.reaction--1 .reaction-text').forEach(function(el) {
                setText(el, el.closest('.reaction.has-reaction') ? unlike : like);
            });
        }

        function translate(target) {
            target = target || document;
            xenforoPassCount++;
            if (DEBUG) {
                log('--- 第 ' + xenforoPassCount + ' 轮 XenForo 翻译 (root=' + (target === document ? 'document' : (target.id || target.className || target.tagName)) + ') ---');
            }

            // 根作用域守卫：一个合并查询就能跳过整组规则，避免每个小根节点跑 90+ 次查询
            var isDoc = target.nodeType === 9;
            function touches(selector) {
                if (!selector) return false;
                if (isDoc) return true;
                if (target.nodeType !== 1) return false;
                try {
                    return (target.matches && target.matches(selector)) || !!target.querySelector(selector);
                } catch (e) {
                    return true;
                }
            }

            // notice-content: 按 notice-id 精确匹配，innerHTML 替换（保留 dismiss 链接）
            if (noticeKeys.length > 0 && touches('.notice-content')) {
                var noticeEls = qsa(target, '.notice-content');
                if (noticeEls.length === 0) {
                    log('  ✗ [.notice-content] DOM元素未找到');
                } else {
                    noticeEls.forEach(function(el) {
                        if (el.dataset.f95Translated) {
                            log('  ⊘ [.notice-content] 已翻译，跳过');
                            return;
                        }
                        // 查找父级 notice 元素获取 data-notice-id
                        var noticeLi = el.closest('.notice');
                        var noticeId = noticeLi ? noticeLi.getAttribute('data-notice-id') : null;
                        // 优先匹配 notice-id 精确选择器，否则回退通用 .notice-content
                        var specificKey = noticeId ? '.notice[data-notice-id="' + noticeId + '"] .notice-content' : null;
                        var translation = (specificKey && noticeSelectors[specificKey]) || noticeSelectors['.notice-content'];
                        if (!translation) {
                            log('  ⊘ [.notice-content#' + (noticeId || '?') + '] 无匹配翻译，跳过');
                            return;
                        }
                        el.dataset.f95Translated = '1';
                        try {
                            var dismiss = el.querySelector('.notice-dismiss');
                            var oldHTML = DEBUG ? el.innerHTML.substring(0, 80) : null;
                            // 远程字典内容先过白名单，再保留站点自己的关闭按钮
                            setSafeHtml(el, translation);
                            if (dismiss) el.insertBefore(dismiss, el.firstChild);
                            if (DEBUG) {
                                log('  ✓ [.notice-content#' + (noticeId || '?') + '] 安全 HTML 替换 (保留dismiss链接)');
                                log('    原文(截断): ' + oldHTML);
                            }
                        } catch(e) {
                            log('  ✗ [.notice-content#' + (noticeId || '?') + '] 替换失败: ' + e.message);
                        }
                    });
                }
            }

            // 其他选择器: textContent 替换（幂等）
            var unmatched = DEBUG ? [] : null;
            if (touches(normalScope)) normalKeys.forEach(function(selector) {
                try {
                    var els = qsa(target, selector);
                    if (els.length === 0) {
                        if (DEBUG) unmatched.push({ selector: selector, reason: '未找到' });
                        return;
                    }
                    els.forEach(function(el) {
                        // 只在 DEBUG 下读取旧值；热路径不为此做额外 DOM 读取
                        var oldText = DEBUG ? el.textContent.trim() : null;
                        if (setText(el, normalSelectors[selector]) && DEBUG) {
                            log('  ✓ [' + selector + '] "' + oldText + '" → "' + normalSelectors[selector] + '"');
                        }
                    });
                } catch(e) {
                    if (DEBUG) unmatched.push({ selector: selector, reason: e.message });
                }
            });

            // Label / 按钮 / Tooltip / 反应按钮共享同一组 chrome 守卫
            if (touches('.label, .button-text, .tic--button, [data-original-title], [title], .reaction--1')) {
                // Label 标签翻译（Completed、Abandoned、Collection 等）
                if (DEBUG) log('--- Label 标签翻译 (' + visibleKeys(DICT.labels).length + ' 条) ---');
                var labelUnmatched = translateLabels(target, DICT.labels, '.label');
                if (DEBUG && labelUnmatched.length > 0) {
                    var uniqueLabels = labelUnmatched.filter(function(v, i, a) { return a.indexOf(v) === i; });
                    if (uniqueLabels.length > 0) {
                        log('  未翻译的标签 (' + uniqueLabels.length + '):');
                        uniqueLabels.forEach(function(t) { log('    - "' + t + '"'); });
                    }
                }

                // --- 按钮文本翻译 ---
                translateButtons(target);

                // --- Tooltip 翻译 ---
                translateTooltips(target);

                // --- 有状态的反应按钮（点赞/取消点赞） ---
                translateReactions(target);
            }

            // --- Spoiler 标签 / 主楼信息字段（仅帖子页且根节点包含帖子正文） ---
            if (IS_THREAD && touches('.bbWrapper, .message')) {
                translateSpoilerTags(target);
                translateThreadFields(target);
            }

            // --- 帖子列表条目翻译（状态徽章、统计标签、Ignore、评分等） ---
            if (touches('.structItem--thread')) translateStructItems(target);

            // --- Filter 筛选菜单翻译 ---
            if (touches('.filterBar, .js-filterMenuBody, .select2-results__group')) translateFilterMenu(target);

            // --- 正则替换翻译（动态文本：... and X more.、Total: X (members: Y)） ---
            if (touches(regexScope)) {
                if (DEBUG) log('--- 正则替换翻译 (' + (DICT.xenforo_regex || []).length + ' 条) ---');
                var regexUnmatched = translateByRegex(DICT.xenforo_regex || [], target);
                if (DEBUG && regexUnmatched.length > 0) {
                    log('  未匹配的正则项 (' + regexUnmatched.length + '):');
                    regexUnmatched.forEach(function(item) {
                        log('    - ' + item.selector + ' (' + item.reason + ')');
                    });
                }
            }

            // --- Placeholder 翻译 ---
            if (touches(placeholderScope)) {
                if (DEBUG) log('--- Placeholder 翻译 (' + visibleKeys(DICT.xenforo_placeholders).length + ' 条) ---');
                var phUnmatched = translatePlaceholders(DICT.xenforo_placeholders || {}, target);
                if (DEBUG && phUnmatched.length > 0) {
                    log('  未匹配的 placeholder (' + phUnmatched.length + '):');
                    phUnmatched.forEach(function(item) {
                        log('    - ' + item.selector + ' (' + item.reason + ')');
                    });
                }
            }

            // --- 版块统计 dt 文本翻译 (Threads/Messages) ---
            if (touches('.node-statsMeta, .node-stats')) {
                if (DEBUG) log('--- 版块统计翻译 (' + visibleKeys(DICT.xenforo_node_stats_dt).length + ' 条) ---');
                var statsDtUnmatched = translateByTextMatch(DICT.xenforo_node_stats_dt || {}, '.node-statsMeta dt, .node-stats dt', target);
                if (DEBUG && statsDtUnmatched.length > 0) {
                    log('  未匹配的统计文本 (' + statsDtUnmatched.length + '):');
                    statsDtUnmatched.forEach(function(t) { log('    - "' + t + '"'); });
                }
            }

            // --- 帖子列表分隔符翻译 (Sticky threads / Normal threads) ---
            var separatorDict = DICT.xenforo_thread_list_separators || {};
            var sepKeys = visibleKeys(separatorDict);
            if (DEBUG) log('--- 帖子列表分隔符翻译 (' + sepKeys.length + ' 条) ---');
            if (sepKeys.length && touches('.uix_threadListSeparator')) {
                var sepUnmatched = DEBUG ? [] : null;
                qsa(target, '.uix_threadListSeparator').forEach(function(el) {
                    if (el.dataset.f95ThreadSep) return;
                    var childNodes = el.childNodes;
                    for (var i = 0; i < childNodes.length; i++) {
                        if (childNodes[i].nodeType === Node.TEXT_NODE) {
                            var rawText = childNodes[i].textContent;
                            var trimmed = rawText.trim();
                            if (separatorDict[trimmed]) {
                                setTextNode(childNodes[i], rawText.replace(trimmed, separatorDict[trimmed]));
                                el.dataset.f95ThreadSep = '1';
                                log('  ✓ [uix_threadListSeparator] "' + trimmed + '" → "' + separatorDict[trimmed] + '"');
                            } else if (trimmed && DEBUG) {
                                sepUnmatched.push(trimmed);
                            }
                            break;
                        }
                    }
                });
                if (DEBUG && sepUnmatched.length > 0) {
                    log('  未匹配的分隔符文本 (' + sepUnmatched.length + '):');
                    sepUnmatched.forEach(function(t) { log('    - "' + t + '"'); });
                }
            }

            // --- dataList 表头翻译（Quick Search 结果等） ---
            if (touches('#quicksearch-result')) {
                if (DEBUG) log('--- dataList 表头翻译 (' + visibleKeys(DICT.xenforo_dataList_headers).length + ' 条) ---');
                var headerUnmatched = translateByTextMatch(DICT.xenforo_dataList_headers || {}, '#quicksearch-result th.dataList-cell', target);
                if (DEBUG && headerUnmatched.length > 0) {
                    log('  未匹配的表头文本 (' + headerUnmatched.length + '):');
                    headerUnmatched.forEach(function(t) { log('    - "' + t + '"'); });
                }
            }

            // --- 论坛名称翻译 ---
            if (touches(FORUM_SCOPE)) {
                if (DEBUG) log('--- 论坛名称翻译 (' + visibleKeys(DICT.xenforo_forum_names).length + ' 条) ---');
                translateForumNames(target);
            }

            // --- 板块描述翻译（仅论坛/分类页，避免误伤帖子页的 .p-description 元信息） ---
            if (IS_FORUM && touches('.node-description, .p-description')) {
                if (DEBUG) log('--- 板块描述翻译 (' + visibleKeys(DICT.xenforo_node_descriptions).length + ' 条) ---');
                translateNodeDescriptions(target);
            }

            // --- XenForo overlay/pop-up 翻译 ---
            if (touches('.overlay')) translateXenForoOverlays(target);

            // --- 个人资料弹窗翻译 ---
            if (touches('.tooltip--member')) translateMemberTooltip(target);

            // --- 改版后新增的 F95 模块（f95rv / f95wg / f95tt / f95st / f95tr） ---
            if (touches(F95_SCOPE)) translateF95Modules(target);

            // --- 页脚链接/统计翻译 ---
            if (touches('.p-footer, .uix_extendedFooter, .footer-extra-text')) {
                if (DEBUG) log('--- 页脚翻译 ---');
                translateFooter(target);
            }

            if (DEBUG && unmatched.length > 0) {
                log('  未匹配的选择器 (' + unmatched.length + '):');
                unmatched.forEach(function(item) {
                    log('    - ' + item.selector + ' (' + item.reason + ')');
                });
            }
        }

        var observer = null;
        var applying = false;
        var pendingRoots = [];
        var pendingFull = false;
        var flushTimer = null;

        var IGNORE_ADDED_TAGS = /^(IMG|PICTURE|SOURCE|IFRAME|VIDEO|AUDIO|CANVAS|SCRIPT|STYLE|LINK|META|BR|HR|I|SVG|PATH|USE)$/;

        function runFullPass(reason) {
            if (applying) return;
            applying = true;
            try {
                log('  [pass] ' + reason + ' (full)');
                translate(document);
                refreshTimeElements(document);
                translateJoinedDates(document);
            } finally {
                applying = false;
                if (ORIGINS.size > 3000) pruneOrigins();
            }
        }

        /** 只处理新增子树：每个根只跑相关规则，避免全页 90+ 次 querySelectorAll */
        function runRootPass(roots) {
            if (applying || !roots.length) return;
            applying = true;
            try {
                log('  [pass] mutation (' + roots.length + ' roots)');
                roots.forEach(function(root) {
                    translate(root);
                    refreshTimeElements(root);
                    translateJoinedDates(root);
                });
            } finally {
                applying = false;
                if (ORIGINS.size > 3000) pruneOrigins();
            }
        }

        // 新增节点若位于已知容器内部，提升到容器根上处理，
        // 这样依赖祖先选择器的规则（如 .tooltip--member dt）也能命中。
        var ROOT_SCOPES = [
            '.tooltip--member', '.overlay', '.menu', '.message', '.bbWrapper',
            '.structItem--thread', '.f95wg-strip', '.f95rv-banner', '.f95tt',
            '.js-filterMenuBody', '.notice', '.p-description', '.reaction',
            '.resource-tile', '#latest-page_options-panel'
        ];

        function expandRoot(n) {
            if (!n || n.nodeType !== 1 || !n.closest) return n;
            for (var i = 0; i < ROOT_SCOPES.length; i++) {
                try {
                    var p = n.closest(ROOT_SCOPES[i]);
                    if (p) return p;
                } catch (e) {}
            }
            return n;
        }

        /** 去掉被其他根包含的节点，避免同一子树被翻译多次 */
        function pruneRoots(list) {
            return pruneContained(list);
        }

        function flushPending() {
            flushTimer = null;
            var roots = pendingRoots;
            var full = pendingFull;
            pendingRoots = [];
            pendingFull = false;
            if (!roots.length && !full) return;
            if (full || roots.length > 30) { runFullPass('mutation-batch'); return; }

            roots = pruneRoots(roots);
            for (var i = 0; i < roots.length; i++) {
                if (roots[i].getElementsByTagName && roots[i].getElementsByTagName('*').length > 2000) {
                    runFullPass('mutation-large-root');
                    return;
                }
            }
            runRootPass(roots);
        }

        // DOM 就绪后首次翻译
        function onReady() {
            logGroup('XenForo DOM 就绪，开始翻译', function() {
                runFullPass('initial');
            });

            // 监听动态加载的内容（下拉菜单、弹窗、懒加载通知等）。
            // 收集新增元素作为根节点，150ms 批量处理；翻译自身的写入不产生元素节点，
            // 因此不会再次触发。
            observer = new MutationObserver(function(records) {
                var added = false;
                for (var i = 0; i < records.length; i++) {
                    var rec = records[i];
                    if (rec.type !== 'childList') continue;
                    for (var j = 0; j < rec.addedNodes.length; j++) {
                        var n = rec.addedNodes[j];
                        if (n.nodeType !== 1 || IGNORE_ADDED_TAGS.test(n.tagName)) continue;
                        if (n === document.body || n === document.documentElement) {
                            pendingFull = true;
                        } else {
                            pendingRoots.push(expandRoot(n));
                        }
                        added = true;
                    }
                }
                if (!added) return;
                if (flushTimer) clearTimeout(flushTimer);
                flushTimer = setTimeout(flushPending, 150);
            });

            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true});
                log('  MutationObserver 已启动（增量根节点模式）');
            }

            // 定时刷新：XenForo 每 ~60s 会覆盖时间文本为英文，定时抢回。
            // 页面不可见时跳过，避免后台标签页持续占用 CPU。
            setInterval(function() {
                if (document.visibilityState !== 'visible') return;
                refreshTimeElements(document);
                translateJoinedDates(document);
                translateMemberTooltip(document);
            }, 30000);
            log('  时间定时刷新已启动 (每30s，仅可见时)');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onReady);
        } else {
            onReady();
        }

        // CDN 热更新后：重建字典快照、清除幂等标记并重新翻译一次
        onDictRefresh(function() {
            rebuildSelectorDicts();
            applyTimePhrases();
            // 先还原原文，再清标记、按新字典重译——这样已译成中文的条目也能更新
            restoreOrigins();
            clearTranslatedFlags(document);
            if (observer) observer.takeRecords();
            runFullPass('dict-update');
        });
    }

    // ==================== 引擎 B：SAM Lastest Alpha SPA ====================
    function runSamEngine() {
        logGroup('启动引擎 B (SAM jQuery SPA)', function() {
            log('路径: ' + window.location.pathname);
            log('字典条目: static=' + Object.keys(DICT.sam_static || {}).length
                + ', tags=' + Object.keys(DICT.sam_tags || {}).length
                + ', placeholder=' + Object.keys(DICT.sam_placeholders || {}).length
                + ', accordion=' + Object.keys(DICT.sam_accordion_match || {}).length
                + ', toggle=' + Object.keys(DICT.sam_toggle_match || {}).length
                + ', css=' + (DICT.sam_css_pseudo || []).length
                + ', slider=' + Object.keys(DICT.sam_slider_map || {}).length);
        });

        // ---- 1. 注入 CSS 覆盖伪元素 ----
        var appliedCss = '';
        var cssEl = null;
        function applySamCss() {
            var cssList = DICT.sam_css_pseudo || [];
            var css = cssList.join('\n');
            if (!css || css === appliedCss) return;
            appliedCss = css;
            if (cssEl && cssEl.isConnected) cssEl.textContent = css;
            else cssEl = GM_addStyle(css);
            log('CSS 伪元素已注入 (' + cssList.length + ' 条)');
        }
        applySamCss();
        onDictRefresh(applySamCss);

        // ---- 3. 静态 UI 翻译（幂等；AJAX 重渲染后可按根节点重跑） ----

        /** 幂等应用一条 sam_static 译文；SAM 异步覆盖文本时会自动重写 */
        function applySamStatic(el, translation) {
            var isHtml = String(translation).indexOf('<') !== -1;
            var expected = isHtml
                ? String(translation).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
                : translation;
            if (el.dataset.f95SamStatic === '1' &&
                el.textContent.replace(/\s+/g, ' ').trim() === expected) {
                return false;
            }
            if (isHtml) setSafeHtml(el, translation);
            else setText(el, translation);
            el.dataset.f95SamStatic = '1';
            return true;
        }

        function translateSamInfoCount(root) {
            var el = qsa(root || document, '#info-count')[0];
            if (!el) return false;
            var text = el.textContent;
            if (text.indexOf('Results') === -1) return true; // 已翻译，无需操作
            var suffix = (DICT.sam_result_text || {}).Results || uiText('results_suffix', '条结果');
            setText(el, text.replace(/([\d,]+)\s*Results/, '$1 ' + suffix));
            if (DEBUG) log('  ✓ [#info-count] "' + text + '" → "' + el.textContent + '"');
            return true;
        }

        function translateSamStatic(root) {
            root = root || document;
            logGroup('SAM 静态 UI 翻译', function() {
                // --- 选择器翻译 ---
                var staticDict = DICT.sam_static || {};
                if (DEBUG) log('--- 选择器翻译 (' + visibleKeys(staticDict).length + ' 条) ---');
                visibleKeys(staticDict).forEach(function(selector) {
                    try {
                        qsa(root, selector).forEach(function(el) {
                            if (applySamStatic(el, staticDict[selector]) && DEBUG) {
                                log('  ✓ [' + selector + '] 已翻译');
                            }
                        });
                    } catch(e) {
                        if (DEBUG) log('  ✗ [' + selector + '] ' + e.message);
                    }
                });

                // --- Placeholders ---
                translatePlaceholders(DICT.sam_placeholders || {}, root);

                // --- Accordion / Toggle 文本匹配 ---
                translateByTextMatch(DICT.sam_accordion_match || {}, '.accordion-toggle', root);
                translateByTextMatch(DICT.sam_toggle_match || {},
                    '.filter-search_type-creator, .filter-search_type-title, .filter-tag_type-or, .filter-tag_type-and', root);

                // --- 卡片/Filter 标签与前缀 ---
                translateLabels(root, DICT.labels, '.resource-tile_label-wrap [class*="label--"]');
                translateSamPrefixes(root);
                translateSamTagChips(root);
                translateLabels(root, DICT.labels, '.filter-block_button, .filter-block_button-label');

                // --- 结果计数 "# Results" → "# 条结果" ---
                translateSamInfoCount(root);
            });
        }

        function translateSamTooltips(root) {
            root = root || document;
            var tooltipDict = DICT.sam_tooltips || {};
            var keys = visibleKeys(tooltipDict);
            if (!keys.length) return;
            qsa(root, '[data-tooltip]').forEach(function(el) {
                if (el.dataset.f95SamTooltipTranslated) return;
                var tip = el.getAttribute('data-tooltip');
                if (tip && tooltipDict[tip]) {
                    el.setAttribute('data-tooltip', tooltipDict[tip]);
                    el.dataset.f95SamTooltipTranslated = '1';
                    log('  [SAM Tooltip] "' + tip + '" → "' + tooltipDict[tip] + '"');
                }
            });
        }

        function translateSamPagination(root) {
            root = root || document;
            qsa(root, '.nav_prev span, .nav_next span').forEach(function(el) {
                if (el.dataset.f95PageTranslated) return;
                var text = el.textContent.trim();
                if (text === 'Prev') { setText(el, uiText('prev_page', '上一页')); el.dataset.f95PageTranslated = '1'; }
                else if (text === 'Next') { setText(el, uiText('next_page', '下一页')); el.dataset.f95PageTranslated = '1'; }
            });
        }

        function translateHoverTags(root) {
            root = root || document;
            var samTags = DICT.sam_tags || {};
            var labelsDict = DICT.labels || {};
            var tagSpans = qsa(root, '.resource-tile_tags span');
            if (!tagSpans.length) return;
            tagSpans.forEach(function(span) {
                if (span.dataset.f95HoverTranslated) return;
                var text = span.textContent.trim();
                var result = lookupTag(text, samTags, labelsDict);
                if (result) {
                    if (setText(span, result)) {
                        log('  [Hover标签] "' + text + '" → "' + result + '"');
                    }
                    span.dataset.f95HoverTranslated = '1';
                }
            });
        }

        /** SAM 卡片前缀（.pre-renpy / .label--red 等）：按 class 结构定位，按文本查表 */
        function translateSamPrefixes(root) {
            root = root || document;
            var samTags = DICT.sam_tags || {};
            var labelsDict = DICT.labels || {};
            qsa(root, '.resource-tile_label-wrap [class^="pre-"]').forEach(function(el) {
                if (el.dataset.f95SamPrefix) return;
                var text = el.textContent.trim();
                var result = lookupTag(text, samTags, labelsDict);
                if (result) {
                    if (setText(el, result)) log('  [SAM前缀] "' + text + '" → "' + result + '"');
                    el.dataset.f95SamPrefix = '1';
                }
            });
        }

        /** SAM 标签 chip：已选标签是 <span data-tag="id">，下拉项是 .option[data-value="id"] */
        function translateSamTagChips(root) {
            root = root || document;
            var samTags = DICT.sam_tags || {};
            var labelsDict = DICT.labels || {};
            qsa(root, '[data-tag], .selectize-dropdown-content .option').forEach(function(el) {
                if (el.dataset.f95SamTagChip) return;
                if (el.children.length > 0) return;
                var text = el.textContent.trim();
                if (!text) return;
                var result = lookupTag(text, samTags, labelsDict);
                if (result) {
                    if (setText(el, result)) log('  [SAM标签] "' + text + '" → "' + result + '"');
                    el.dataset.f95SamTagChip = '1';
                }
            });
        }

        function translateSamSettings(root) {
            root = root || document;
            var panel = qsa(root, '#latest-page_options-panel')[0];
            if (!panel) return;

            if (DEBUG) log('--- Settings 面板翻译 ---');

            // 1. 标题和按钮文本 (sam_settings 文本匹配)
            var settingsMap = DICT.sam_settings || {};
            translateByTextMatch(settingsMap, '.options-panel_item-title', panel);
            translateByTextMatch(settingsMap, '.options-panel_item-btns a', panel);

            // 2. 含图标/HTML 元素（sam_static 条目，重新应用时会先校验是否被 SAM 覆盖）
            var staticDict = DICT.sam_static || {};
            [
                '#latest-page_options-panel h3',
                '#options-panel_item-btns-info',
                '#options-panel_save-load .options-save'
            ].forEach(function(selector) {
                var translation = staticDict[selector];
                if (!translation) return;
                qsa(panel, selector).forEach(function(el) {
                    if (applySamStatic(el, translation) && DEBUG) {
                        log('  ✓ [' + selector + '] Settings 面板已翻译');
                    }
                });
            });
        }

        function onSamReady() {
            translateSamStatic();

            // Settings 面板初始翻译
            translateSamSettings();

            // Hover 卡片标签初始翻译（页面加载时通常不存在，但以防万一）
            translateHoverTags();

            // 分页导航初始翻译（Prev/Next）
            translateSamPagination();

            // SAM 控件 tooltip 翻译（Auto Refresh / Browser Notify / Options / Filters）
            translateSamTooltips();

            // ---- 共享页脚翻译（XenForo 模板元素，SAM 页面同样存在） ----
            log('--- 共享页脚翻译 ---');
            // 页脚区块标题和 About us 正文（data-widget 选择器翻译）
            var footerXenforoSelectors = {};
            var footerSelectorKeys = [
                '[data-widget-definition="th_aboutUs"] .block-minorHeader',
                '[data-widget-definition="th_navigation"] .block-minorHeader',
                '[data-widget-definition="th_userNavigation"] .block-minorHeader',
                '[data-widget-key="forum_overview_forum_statistics"] .block-minorHeader',
                '[data-widget-definition="th_aboutUs"] .block-body'
            ];
            footerSelectorKeys.forEach(function(key) {
                if (DICT.xenforo && DICT.xenforo[key]) {
                    footerXenforoSelectors[key] = DICT.xenforo[key];
                }
            });
            if (Object.keys(footerXenforoSelectors).length) {
                translateBySelector(footerXenforoSelectors);
            }
            // 页脚链接、统计、语言选择器、tooltip 翻译（共享函数）
            translateFooter();

            // SAM 页面顶部复用 XF 导航：同步新版导航 ID 的翻译
            translateF95Modules(document);
            translateSamPrefixes(document);
            translateSamTagChips(document);

            // ---- 4. 动态滑块文本监听 ----
            var sliderTranslating = false;

            function translateSliderText(el) {
                if (sliderTranslating) return;
                var text = el.textContent.trim();
                var sliderMap = DICT.sam_slider_map || {};

                // 固定文本映射
                if (sliderMap[text] !== undefined) {
                    sliderTranslating = true;
                    setText(el, sliderMap[text]);
                    sliderTranslating = false;
                    log('  [滑块] "' + text + '" → "' + sliderMap[text] + '"');
                    return;
                }

                // Settings: Hover delay "100 ms" → "100 毫秒"
                if (el.id === 'options-panel_hover-delay_value') {
                    var msReplaced = text.replace(/(\d+)\s*ms/, function(_, n) {
                        return uiFmt('hover_delay_ms', '{n} 毫秒', { n: n });
                    });
                    if (msReplaced !== text) {
                        sliderTranslating = true;
                        setText(el, msReplaced);
                        sliderTranslating = false;
                        log('  [滑块] "' + text + '" → "' + msReplaced + '"');
                    }
                    return;
                }

                // Settings: Items Per Page "90 Items" → "90 条"
                if (el.id === 'options-panel_rows_value') {
                    var itemsReplaced = text.replace(/(\d+)\s*Items/, function(_, n) {
                        return uiFmt('items_suffix', '{n} 条', { n: n });
                    });
                    if (itemsReplaced !== text) {
                        sliderTranslating = true;
                        setText(el, itemsReplaced);
                        sliderTranslating = false;
                        log('  [滑块] "' + text + '" → "' + itemsReplaced + '"');
                    }
                    return;
                }

                // 动态文本：< 180 days → < 180 天
                var replaced = text.replace(/(\d+)\s*days?/g, function(_, n) {
                    return uiFmt('days_suffix', '{n} 天', { n: n });
                });
                if (replaced !== text) {
                    sliderTranslating = true;
                    setText(el, replaced);
                    sliderTranslating = false;
                    log('  [滑块] "' + text + '" → "' + replaced + '"');
                } else if (text !== 'Anytime' && text.indexOf('天') === -1 && text !== ''
                    && text.indexOf('ms') === -1 && text.indexOf('Items') === -1) {
                    // 不是已知可翻译模式的文本
                    log('  ⚠ [滑块] 未识别的文本: "' + text + '" (元素: ' + (el.id || el.className) + ')');
                }
            }

            // 监听现有的 slider value 元素
            log('--- 滑块初始翻译 ---');
            var sliderEls = document.querySelectorAll('.range-slider_value');
            if (sliderEls.length === 0) {
                log('  未找到 .range-slider_value 元素');
            } else {
                sliderEls.forEach(function(el) {
                    translateSliderText(el);
                });
            }

            // ---- 5. 统一 MutationObserver ----
            // 原先有 9 个 body 级观察器；合并为一个路由器，按变更类型设置标志，
            // 100ms 批量执行对应翻译，避免重复遍历整页。
            var tagSelectizeTranslating = false;

            function translateSelectizeContent() {
                if (tagSelectizeTranslating) return;
                tagSelectizeTranslating = true;
                try {
                    translateSamTagChips(document);
                } finally {
                    tagSelectizeTranslating = false;
                }
            }

            var samFlags = {
                slider: false, selectize: false, info: false,
                labels: false, hover: false, pagination: false,
                filter: false, settings: false
            };
            var samTimer = null;
            var samPendingRoots = [];
            var samPendingFull = false;
            var SAM_IGNORE_TAGS = /^(IMG|PICTURE|SOURCE|IFRAME|VIDEO|AUDIO|CANVAS|SCRIPT|STYLE|LINK|META|BR|HR|I|SVG|PATH|USE)$/;
            var SAM_ROOT_SCOPES = [
                '.resource-tile', '.selectize-dropdown', '#latest-page_options-panel',
                '.filter-block', '.notice', '.p-nav', '.overlay', '.menu',
                '.sub-nav_paging', '#filter-title', '.p-footer'
            ];

            function nodeHas(n, sel) {
                return n.nodeType === 1 && (n.matches(sel) || !!n.querySelector(sel));
            }

            function queueSamRoot(n) {
                if (samPendingFull) return;
                if (samPendingRoots.length >= 200) {
                    samPendingFull = true;
                    samPendingRoots = [];
                } else {
                    samPendingRoots.push(expandSamRoot(n));
                }
            }

            /** 元素或其祖先是否是我们翻译过、可能被 SAM 异步覆盖的静态文案 */
            function isSamStaticScope(n) {
                var el = n && n.nodeType === 3 ? n.parentElement : n;
                return !!(el && el.nodeType === 1 && el.closest &&
                    el.closest('[data-f95-sam-static]'));
            }

            /** 把新增节点提升到已知 UI 容器，便于按根节点增量翻译 */
            function expandSamRoot(n) {
                if (!n || n.nodeType !== 1 || !n.closest) return n;
                for (var i = 0; i < SAM_ROOT_SCOPES.length; i++) {
                    try {
                        var p = n.closest(SAM_ROOT_SCOPES[i]);
                        if (p) return p;
                    } catch (e) {}
                }
                return n;
            }

            function markSamNode(n) {
                if (n.nodeType !== 1) return;
                if (SAM_IGNORE_TAGS.test(n.tagName)) return;
                if (n.classList && n.classList.contains('range-slider_value')) samFlags.slider = true;
                if (nodeHas(n, '.range-slider_value')) samFlags.slider = true;

                if (n.hasAttribute && n.hasAttribute('data-tag')) samFlags.selectize = true;
                if (nodeHas(n, '.selectize-dropdown-content, .option, [data-tag]')) samFlags.selectize = true;

                if (n.id === 'info-count' || nodeHas(n, '#info-count')) samFlags.info = true;

                if (nodeHas(n, '.resource-tile, .resource-tile_label-wrap, .resource-tile_tags, [class^="pre-"]')) {
                    samFlags.labels = true;
                    samFlags.hover = true;
                }

                if (nodeHas(n, '.nav_prev, .nav_next')) samFlags.pagination = true;
                if (nodeHas(n, '.accordion-toggle, .filter-block_button')) samFlags.filter = true;

                if (n.id === 'latest-page_options-panel' || nodeHas(n, '#latest-page_options-panel')) samFlags.settings = true;
                if (n.id === 'options-panel_item-btns-info' || nodeHas(n, '#options-panel_item-btns-info')) samFlags.settings = true;

                queueSamRoot(n);
            }

            /** 增量执行静态规则：AJAX 重渲染后的英文文本也能重新翻译 */
            function flushSamRoots() {
                if (samPendingFull) {
                    samPendingFull = false;
                    samPendingRoots = [];
                    translateSamStatic(document);
                    translateSamSettings(document);
                    translateSamTagChips(document);
                    translateSamPrefixes(document);
                    translateHoverTags(document);
                    translateSamPagination(document);
                    translateSamTooltips(document);
                    return;
                }
                if (!samPendingRoots.length) return;
                var roots = pruneContained(samPendingRoots);
                samPendingRoots = [];
                if (roots.length > 10) {
                    translateSamStatic(document);
                    translateSamSettings(document);
                    translateSamTagChips(document);
                    translateSamPrefixes(document);
                    translateHoverTags(document);
                    translateSamPagination(document);
                    translateSamTooltips(document);
                    return;
                }
                roots.forEach(function(r) {
                    translateSamStatic(r);
                    translateSamSettings(r);
                    translateSamTagChips(r);
                    translateSamPrefixes(r);
                    translateHoverTags(r);
                    translateSamPagination(r);
                    translateSamTooltips(r);
                });
            }

            function flushSamFlags() {
                samTimer = null;
                if (samFlags.settings) translateSamSettings(document);
                if (samFlags.info) translateSamInfoCount(document);
                if (samFlags.slider) {
                    document.querySelectorAll('.range-slider_value').forEach(translateSliderText);
                }
                if (samFlags.selectize) translateSelectizeContent();
                if (samFlags.labels) {
                    translateLabels(document, DICT.labels, '.resource-tile_label-wrap [class*="label--"]');
                    translateSamPrefixes(document);
                }
                if (samFlags.hover) translateHoverTags(document);
                if (samFlags.pagination) translateSamPagination(document);
                if (samFlags.filter) {
                    if (DEBUG) log('  [SAM] 检测到筛选动态内容');
                    translateByTextMatch(DICT.sam_accordion_match || {}, '.accordion-toggle', document);
                    translateLabels(document, DICT.labels, '.filter-block_button, .filter-block_button-label');
                    translatePlaceholders(DICT.sam_placeholders || {}, document);
                    translateSamTooltips(document);
                }
                for (var k in samFlags) samFlags[k] = false;
                flushSamRoots();
                if (ORIGINS.size > 3000) pruneOrigins();
            }

            var samObserver = new MutationObserver(function(mutations) {
                var touched = false;
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.type === 'characterData') {
                        var p = m.target.parentElement;
                        if (p && p.classList && p.classList.contains('range-slider_value')) { samFlags.slider = true; touched = true; }
                        if (p && p.id === 'options-panel_item-btns-info') { samFlags.settings = true; touched = true; }
                        if (p && (p.id === 'info-count' || (p.closest && p.closest('#info-count')))) { samFlags.info = true; touched = true; }
                        // SAM 异步覆盖了已翻译的静态文案 → 重新排队该容器
                        if (p && isSamStaticScope(p)) { queueSamRoot(p); touched = true; }
                    } else if (m.type === 'childList') {
                        if (m.target.nodeType === 1) {
                            if (m.target.classList && m.target.classList.contains('range-slider_value')) { samFlags.slider = true; touched = true; }
                            if (m.target.id === 'info-count') { samFlags.info = true; touched = true; }
                            if (m.target.id === 'options-panel_item-btns-info') { samFlags.settings = true; touched = true; }
                            if (isSamStaticScope(m.target)) { queueSamRoot(m.target); touched = true; }
                        }
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var n = m.addedNodes[j];
                            if (n.nodeType === 1) { markSamNode(n); touched = true; }
                        }
                    }
                }
                if (!touched) return;
                if (samTimer) clearTimeout(samTimer);
                samTimer = setTimeout(flushSamFlags, 100);
            });

            if (document.body) {
                samObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
                log('  SAM 统一 MutationObserver 已启动');
            }

            // CDN 热更新后：清除标记并按整页重跑全部幂等规则
            onDictRefresh(function() {
                restoreOrigins();
                clearTranslatedFlags(document);
                samObserver.takeRecords();
                samPendingRoots = [];
                samPendingFull = false;
                translateSamStatic(document);
                translateSamSettings(document);
                translateSamTagChips(document);
                translateSamPrefixes(document);
                translateHoverTags(document);
                translateSamPagination(document);
                translateSamTooltips(document);
                translateSamInfoCount(document);
                // 还原原文后，滑块文本（Anytime / 180 days / 90 Items…）也要重译
                document.querySelectorAll('.range-slider_value').forEach(translateSliderText);
                translateFooter(document);
                translateF95Modules(document);
            });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onSamReady);
        } else {
            onSamReady();
        }
    }

    // ==================== 覆盖率诊断（Tampermonkey 菜单） ====================
    // 用于补充译文：列出当前页面每条选择器的命中数、失效项和 UI 区残留英文。

    var UI_SCAN_SCOPES = [
        '.p-nav', '.p-footer', '.uix_extendedFooter', '.p-description',
        '.f95wg-strip', '.f95rv-banner', '.f95tt', '.f95st-tabs', '.f95tr-widget',
        '.filterBar', '.js-filterMenuBody', '.overlay', '.menu',
        '.structItem-cell--meta', '.node-statsMeta',
        '.resource-tile_label-wrap', '.options-panel_item-title',
        '#filter-block_cat', '#filter-block_sort', '#filter-block_date-filter',
        '#filter-block_search', '#filter-block_tags', '#filter-block_tags_exclude',
        '.content-block_filter-title', '#latest-page_options_panel'
    ];

    function auditSelectorMap(name, map) {
        var list = visibleKeys(map);
        var misses = [];
        var hits = 0;
        list.forEach(function(selector) {
            try {
                var count = document.querySelectorAll(selector).length;
                if (count) hits++;
                else misses.push({ selector: selector, count: 0 });
            } catch (e) {
                misses.push({ selector: selector, error: e.message });
            }
        });
        return { name: name, total: list.length, hits: hits, misses: misses };
    }

    function scanEnglishInUi(limit) {
        var seen = new Set();
        var out = [];
        UI_SCAN_SCOPES.forEach(function(scope) {
            var roots;
            try { roots = document.querySelectorAll(scope); } catch (e) { return; }
            Array.prototype.forEach.call(roots, function(root) {
                var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
                els.forEach(function(el) {
                    if (seen.has(el) || el.children.length > 0) return;
                    seen.add(el);
                    var text = (el.textContent || '').trim();
                    if (!text || text.length > 120 || !/[A-Za-z]{2,}/.test(text)) return;
                    out.push({
                        scope: scope,
                        tag: el.tagName,
                        text: text,
                        className: String(el.className || '').slice(0, 60)
                    });
                });
            });
        });
        return out.slice(0, limit || 40);
    }

    function countIdleMutations(ms) {
        return new Promise(function(resolve) {
            var n = 0;
            var mo = new MutationObserver(function(records) { n += records.length; });
            mo.observe(document.body, { childList: true, subtree: true, characterData: true });
            setTimeout(function() { mo.disconnect(); resolve(n); }, ms);
        });
    }

    function runDiagnostics() {
        var template = (document.documentElement.dataset && document.documentElement.dataset.template) || '(none)';
        var isSam = window.location.pathname.indexOf('/sam/latest_alpha/') !== -1;
        console.group(PREFIX + ' 字典覆盖率诊断');
        console.log('页面模板: ' + template + ' | 登录态: ' + (document.documentElement.dataset.loggedIn === 'true') + ' | URL: ' + location.pathname);

        var groups = [
            auditSelectorMap('xenforo', DICT.xenforo),
            auditSelectorMap('xenforo_placeholders', DICT.xenforo_placeholders)
        ];
        if (isSam) {
            groups.push(auditSelectorMap('sam_static', DICT.sam_static));
            groups.push(auditSelectorMap('sam_placeholders', DICT.sam_placeholders));
        }
        groups.forEach(function(g) {
            console.log('[' + g.name + '] ' + g.hits + '/' + g.total + ' 命中，失效 ' + g.misses.length + ' 条');
            if (g.misses.length) console.table(g.misses);
        });

        console.log('UI 区残留英文（前 40 条，排除帖子正文）:');
        console.table(scanEnglishInUi(40));

        countIdleMutations(3000).then(function(n) {
            console.log('空闲 3 秒 DOM 变更: ' + n + '（应接近 0）');
            console.groupEnd();
        });
    }

    try {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('F95汉化：字典覆盖率诊断（当前页）', runDiagnostics);
        }
    } catch (e) {}

    // ==================== 路由分发 ====================
    logGroup('F95zone 汉化脚本 v' + DEFAULT_DICT.version + ' 启动', function() {
        log('当前 URL: ' + window.location.href);
        log('pathname: ' + window.location.pathname);
        log('readyState: ' + document.readyState);
        log('Debug 模式: ' + (DEBUG ? '开启' : '关闭'));
    });

    if (window.location.pathname.indexOf('/sam/latest_alpha/') !== -1) {
        runSamEngine();
    } else {
        runXenForoEngine();
    }
})();
