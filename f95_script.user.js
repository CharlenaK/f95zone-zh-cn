// ==UserScript==
// @name         F95zone 汉化
// @namespace    https://github.com/f95zone-zh-cn
// @version      0.3.14
// @description  F95zone 定向翻译脚本 — 双引擎架构：XenForo SSR 选择器定位 + SAM SPA XHR拦截
// @author       f95zone-zh-cn
// @match        *://f95zone.to/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
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

    // ==================== 内置默认字典 ====================
    var DEFAULT_DICT = {
        "version": 46,
        "xenforo": {
            ".notice[data-notice-id=\"90\"] .notice-content": "我们始终尽力确保F95上共享的文件是安全的。所有附件都会经过扫描，上传者会使用至少1款（通常2款）杀毒软件扫描每个上传文件，我们也有多道程序来防止恶意软件被分享。然而，不幸的是我们有时仍会有所遗漏。最近修改版的 <em>Pervert Action: Timelapse</em> 和 <em>Milfania</em> 含有恶意软件。<a href=\"https://f95zone.to/threads/recent-malware-infected-games.207437/\">点击此处了解更多</a>。",
            ".notice[data-notice-id=\"116\"] .notice-content": "上传者申请现已开放！如果您有兴趣成为团队成员，<a href=\"https://f95zone.to/threads/uploader-applications-are-open.230363/\">点击此处了解更多</a>。如果您之前被拒绝或因不活跃而被移除，请随时重新申请。",
            ".uix_newIndicator": "新",
            ".p-nav-menuText": "菜单",
	    "[data-nav-id=\"forums\"] span": "论坛",
	    "[data-nav-id=\"nfTickets\"] span": "工单",
        "[data-nav-id=\"LatestUpdates\"] span": "最近更新",
	    "[data-nav-id=\"newPosts\"] span": "新帖",
	    "[data-nav-id=\"thtrending\"] span": "时下热门",
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
	    ".brmsTabHandler_0 span": "最新回复",
	    ".brmsTabHandler_1 span": "最新帖子",
	    ".brmsTabHandler_2 span": "最近更新",
	    ".brmsTabHandler_3 span": "最多浏览",
	    ".brmsTabHandler_4 span": "30天内最多浏览",
	    ".brmsTabHandler_5 span": "最多回复",
	    ".brmsTabHandler_6 span": "我的帖子",
	    ".brmsTabHandler_7 span": "6个月内最多浏览",
	    ".brmsTabHandler_8 span": "12个月内最多浏览",
	    ".brmsLayoutChange[data-layout=\"brmsTopTabs\"]": "顶部",
	    ".brmsLayoutChange[data-layout=\"brmsLeftTabs\"]": "左侧",
	    ".brmsLayoutChange[data-layout=\"brmsRightTabs\"]": "右侧",
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
				    ".reaction--1 .reaction-text": "点赞"
        },
        "xenforo_forum_names": {
            "_note": "论坛/分类/子论坛名称翻译。key 为元素 textContent 的精确匹配值。",
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
            "_note": "论坛板块描述翻译。key 为 .node-description 的 textContent 唯一前缀标识。匹配方式：textContent 是否以 key 开头。",
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
        "xenforo_time_phrases": {
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
            { "selector": "a[href=\"/online/\"]", "pattern": "^\\.\\.\\. and (\\d+) more\\.$", "replacement": "... 以及另外 $1 人。" },
            { "selector": ".block-footer-counter", "pattern": "^Total:\\s*([\\d,]+)\\s*\\(members:\\s*([\\d,]+),\\s*guests:\\s*([\\d,]+)\\)$", "replacement": "总计：$1（会员：$2，游客：$3）" },
            { "selector": ".brmsNumberEntry", "pattern": "^(\\d+)\\s*Entries$", "replacement": "$1 条" },
            { "selector": ".u-srOnly", "pattern": "^(.+) wrote on (.+)'s profile\\.$", "replacement": "$1 在 $2 的个人主页上留言。" },
            { "selector": "a[href^=\"/account/dpp-update\"] .button-text", "pattern": "^Showing (\\d+) posts per page$", "replacement": "每页显示 $1 条帖子" },
            { "selector": ".tabs--standalone .tabs-tab", "pattern": "^Discussion$", "replacement": "讨论" },
            { "selector": ".tabs--standalone .tabs-tab", "pattern": "^Reviews \\((\\d+)\\)$", "replacement": "评论 ($1)" }
        ],
        "xenforo_placeholders": {
            "textarea.js-editor[placeholder=\"Update your status…\"]": "更新你的状态…",
            "textarea.comment-input[placeholder=\"Write a comment…\"]": "写评论…",
            "#quickSearchTitle": "快速搜索…"
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
            "Views": "查看"
        },
        "xenforo_thread_list_separators": {
            "_note": "论坛版块内帖子列表分隔符翻译（Sticky threads / Normal threads）。匹配 .uix_threadListSeparator 的第一个文本节点，保留折叠按钮子元素。",
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
            "Like": "点赞"
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
	        ".nav_prev span": "上一页",
	        ".nav_next span": "下一页",
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
        "labels": {
            "_note": "引擎、状态、前缀等标签翻译。以 _ 开头的 key 会被跳过。",
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
            "VN": "视觉小说"
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
            "SiteRip": "站点搬运"
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
            "Start conversation": "发起私信"
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
            "_note": "游戏帖子主楼信息字段翻译。labels 匹配 .bbWrapper 内 <b> 标签的 textContent 精确值。",
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

        return cached;
    }

    function fetchRemoteDict(cached) {
        if (typeof GM_xmlhttpRequest === 'undefined') {
            log('GM_xmlhttpRequest 不可用，跳过 CDN 热更新');
            return;
        }
        GM_xmlhttpRequest({
            method: 'GET',
            url: CDN_DICT_URL,
            timeout: 5000,
            onload: function(resp) {
                try {
                    var remote = JSON.parse(resp.responseText);
                    var cacheVer = cached ? (cached.version || 0) : 0;
                    if (remote.version > cacheVer) {
                        log('字典来源: CDN 热更新 (v' + remote.version + ', 原 ' + (cacheVer || '无') + ')');
                        GM_setValue('f95_dict', remote);
                        // 原地更新全局 DICT，后续翻译轮次自动生效
                        Object.assign(DICT, remote);
                        log('  热更新已生效');
                    } else {
                        log('CDN 版本(v' + remote.version + ') 不高于缓存(v' + cacheVer + ')，跳过');
                    }
                } catch(e) {
                    log('CDN 字典解析失败: ' + e.message);
                }
            },
            onerror: function(e) {
                log('CDN 字典获取失败 (HTTP ' + (e.status || '?') + ')，继续使用缓存');
            },
            ontimeout: function() {
                log('CDN 字典请求超时 (5s)，继续使用缓存');
            }
        });
    }

    var DICT = loadDict();

    // ==================== 工具函数 ====================

    /** 使用 selector → translation 字典翻译 textContent，返回未匹配的 selector 列表 */
    function translateBySelector(selectorMap, root) {
        root = root || document;
        var unmatched = [];
        Object.keys(selectorMap).forEach(function(selector) {
            try {
                var els = root.querySelectorAll(selector);
                if (els.length === 0) {
                    unmatched.push({ selector: selector, reason: 'DOM元素未找到' });
                    return;
                }
                els.forEach(function(el) {
                    var oldText = el.textContent;
                    el.textContent = selectorMap[selector];
                    log('  ✓ [' + selector + '] "' + oldText + '" → "' + selectorMap[selector] + '"');
                });
            } catch(e) {
                unmatched.push({ selector: selector, reason: e.message });
            }
        });
        return unmatched;
    }

    /** 翻译 placeholder 属性，返回未匹配列表 */
    function translatePlaceholders(placeholderMap, root) {
        root = root || document;
        var unmatched = [];
        Object.keys(placeholderMap).forEach(function(selector) {
            try {
                var els = root.querySelectorAll(selector);
                if (els.length === 0) {
                    unmatched.push({ selector: selector, reason: 'DOM元素未找到' });
                    return;
                }
                els.forEach(function(el) {
                    var oldVal = el.getAttribute('placeholder');
                    el.setAttribute('placeholder', placeholderMap[selector]);
                    log('  ✓ [placeholder:' + selector + '] "' + oldVal + '" → "' + placeholderMap[selector] + '"');
                });
            } catch(e) {
                unmatched.push({ selector: selector, reason: e.message });
            }
        });
        return unmatched;
    }

    /** 按文本内容匹配并替换，返回未匹配的文本列表 */
    function translateByTextMatch(matchMap, selector, root) {
        root = root || document;
        var unmatched = [];
        try {
            root.querySelectorAll(selector).forEach(function(el) {
                var text = el.textContent.trim();
                if (matchMap[text]) {
                    el.textContent = matchMap[text];
                    log('  ✓ [textMatch:' + selector + '] "' + text + '" → "' + matchMap[text] + '"');
                } else {
                    unmatched.push(text);
                }
            });
        } catch(e) {
            log('  ✗ [textMatch:' + selector + '] 异常: ' + e.message);
        }
        return unmatched;
    }

    /** 按正则表达式匹配并替换文本（用于动态文本，如 "... and X more."、"Total: X (members: Y)"）。
     *  @param {Array<{selector:string, pattern:string, replacement:string}>} regexList
     *  @param {Document|Element} root
     *  @returns {Array} 未匹配的项目列表 */
    function translateByRegex(regexList, root) {
        root = root || document;
        if (!regexList || !regexList.length) return [];
        var unmatched = [];
        regexList.forEach(function(item) {
            try {
                var els = root.querySelectorAll(item.selector);
                if (els.length === 0) {
                    unmatched.push({ selector: item.selector, reason: 'DOM元素未找到' });
                    return;
                }
                els.forEach(function(el) {
                    if (el.dataset.f95RegexTranslated) return;
                    var oldText = el.textContent.trim();
                    var re = new RegExp(item.pattern);
                    var newText = oldText.replace(re, item.replacement);
                    if (newText !== oldText) {
                        el.textContent = newText;
                        el.dataset.f95RegexTranslated = '1';
                        log('  ✓ [regex:' + item.selector + '] "' + oldText + '" → "' + newText + '"');
                    }
                });
            } catch(e) {
                unmatched.push({ selector: item.selector, reason: e.message });
            }
        });
        return unmatched;
    }

    /** 翻译 label 元素（如 Completed、Abandoned、Collection 等）。返回未匹配的文本列表 */
    function translateLabels(root, labelsDict, selector) {
        root = root || document;
        selector = selector || '.label';
        if (!labelsDict || Object.keys(labelsDict).length === 0) return [];

        var unmatched = [];
        try {
            var els = root.querySelectorAll(selector);
            els.forEach(function(el) {
                if (el.dataset.f95LabelTranslated) return;
                var text = el.textContent.trim();
                // 跳过以 _ 开头的注释 key
                if (!text || text.charAt(0) === '_') return;
                if (labelsDict[text]) {
                    el.textContent = labelsDict[text];
                    el.dataset.f95LabelTranslated = '1';
                    log('  ✓ [Label] "' + text + '" → "' + labelsDict[text] + '"');
                } else {
                    unmatched.push(text);
                }
            });
        } catch(e) {
            log('  ✗ [Label] 异常: ' + e.message);
        }
        return unmatched;
    }

    /** 防抖函数 */
    function debounce(fn, delay) {
        var timer;
        return function() {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    /** 在 sam_tags 和 labels 中合并查找标签翻译（精确匹配 + 大小写不敏感回退） */
    function lookupTag(text, samTags, labelsDict) {
        if (!text || !text.trim()) return null;
        var key = text.trim();
        // 精确匹配
        if (samTags && samTags[key]) return samTags[key];
        if (labelsDict && labelsDict[key]) return labelsDict[key];
        // 大小写不敏感回退
        var lower = key.toLowerCase();
        if (samTags) {
            var tagKeys = Object.keys(samTags);
            for (var i = 0; i < tagKeys.length; i++) {
                if (tagKeys[i].toLowerCase() === lower) return samTags[tagKeys[i]];
            }
        }
        if (labelsDict) {
            var labelKeys = Object.keys(labelsDict).filter(function(k) { return k.charAt(0) !== '_'; });
            for (var j = 0; j < labelKeys.length; j++) {
                if (labelKeys[j].toLowerCase() === lower) return labelsDict[labelKeys[j]];
            }
        }
        return null;
    }

    // ==================== 页脚翻译（共享函数，两个引擎均调用） ====================
    function translateFooter(root) {
        root = root || document;

        // 1. 翻译快捷导航 / 用户菜单 / 底部链接文本（文本匹配，不受 href 变体影响）
        var linkMap = DICT.xenforo_footer_links || {};
        var linkKeys = Object.keys(linkMap).filter(function(k) { return k.charAt(0) !== '_'; });
        if (linkKeys.length) {
            // 扩展页脚链接 (uix_extendedFooter)
            root.querySelectorAll('.uix_extendedFooter .block-body a').forEach(function(el) {
                if (el.dataset.f95FooterLinkTranslated) return;
                var text = el.textContent.trim();
                if (linkMap[text]) {
                    el.textContent = linkMap[text];
                    el.dataset.f95FooterLinkTranslated = '1';
                    log('  [FooterLink] "' + text + '" → "' + linkMap[text] + '"');
                }
            });
            // 底部页脚链接 (.p-footer-row-opposite)，SAM 页面 href="#" 时回退
            root.querySelectorAll('.p-footer-row-opposite .p-footer-linkList a').forEach(function(el) {
                if (el.dataset.f95FooterBottomLinkTranslated) return;
                var text = el.textContent.trim();
                if (!text) return; // 跳过纯图标链接（Top、RSS）
                if (linkMap[text]) {
                    el.textContent = linkMap[text];
                    el.dataset.f95FooterBottomLinkTranslated = '1';
                    log('  [FooterBottomLink] "' + text + '" → "' + linkMap[text] + '"');
                }
            });
        }

        // 2. 翻译论坛统计 dt（讨论串/消息/会员/最新会员）
        var statsDtMap = DICT.xenforo_footer_stats_dt || {};
        var statsKeys = Object.keys(statsDtMap).filter(function(k) { return k.charAt(0) !== '_'; });
        if (statsKeys.length) {
            root.querySelectorAll('[data-widget-key="forum_overview_forum_statistics"] dt').forEach(function(el) {
                if (el.dataset.f95FooterStatsTranslated) return;
                var text = el.textContent.trim();
                if (statsDtMap[text]) {
                    el.textContent = statsDtMap[text];
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
                extraEl.textContent = footerExtraText;
                extraEl.dataset.f95FooterExtraTranslated = '1';
                log('  [FooterExtra] 已翻译');
            }
        }

        // 4. 翻译语言选择器链接（保留地球图标 <i>，兼容 XenForo href="/misc/language" 和 SAM href="#"）
        var langEl = root.querySelector('.p-footer-linkList a[href="/misc/language"]');
        if (!langEl) {
            // SAM 页面 href="#" 回退：查找带地球图标的 overlay 链接
            var overlayLinks = root.querySelectorAll('.p-footer-linkList a[data-xf-click="overlay"]');
            for (var i = 0; i < overlayLinks.length; i++) {
                if (overlayLinks[i].querySelector('i.fa-globe')) {
                    langEl = overlayLinks[i];
                    break;
                }
            }
        }
        if (langEl && !langEl.dataset.f95FooterLangTranslated) {
            var langIcon = langEl.querySelector('i.fa-globe');
            var langIconHTML = langIcon ? langIcon.outerHTML : '';
            var langText = langEl.textContent.trim();
            if (langText === 'English (US)') {
                langEl.innerHTML = langIconHTML + ' 英语（美国）';
                langEl.dataset.f95FooterLangTranslated = '1';
                log('  [FooterLang] 已翻译');
            }
        }

        // 5. 翻译页脚区域内的 tooltip（独立于 translateTooltips，SAM 引擎无该函数）
        var tooltipDict = DICT.xenforo_tooltips || {};
        var tooltipKeys = Object.keys(tooltipDict).filter(function(k) { return k.charAt(0) !== '_'; });
        if (tooltipKeys.length) {
            root.querySelectorAll('.p-footer [data-original-title], .p-footer [title]').forEach(function(el) {
                if (el.dataset.f95FooterTooltipTranslated) return;
                var origTitle = el.getAttribute('data-original-title');
                if (origTitle && tooltipDict[origTitle]) {
                    el.setAttribute('data-original-title', tooltipDict[origTitle]);
                    el.dataset.f95FooterTooltipTranslated = '1';
                    log('  [FooterTooltip] "' + origTitle + '" → "' + tooltipDict[origTitle] + '"');
                }
                var title = el.getAttribute('title');
                if (title && tooltipDict[title] && title !== origTitle) {
                    el.setAttribute('title', tooltipDict[title]);
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

        // 分离 notice-content 选择器（需要 innerHTML 保留 dismiss 链接）和普通选择器
        var noticeSelectors = {};  // selector -> HTML，用于 .notice-content 元素
        var normalSelectors = {};  // selector -> text，用于普通元素
        Object.keys(xenforoDict).forEach(function(key) {
            if (key.indexOf('.notice-content') !== -1) {
                noticeSelectors[key] = xenforoDict[key];
            } else {
                normalSelectors[key] = xenforoDict[key];
            }
        });

        var xenforoPassCount = 0;

        // ==================== 时间短语覆盖 (XF.phrases) ====================
        // 覆盖 XenForo 的 i18n 短语模板，使其原生渲染中文时间文本。
        // XF.phrases 在页面内联脚本中通过 jQuery.extend 填充，
        // 之后 XenForo 的定时器每 ~60s 会用这些模板刷新 <time> 元素的相对时间。

        var timePhrases = DICT.xenforo_time_phrases || {};

        function applyTimePhrases() {
            var keys = Object.keys(timePhrases).filter(function(k) { return k.charAt(0) !== '_'; });
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
        function _isSameDay(ts1, ts2) {
            var d1 = new Date(ts1), d2 = new Date(ts2);
            return d1.getFullYear() === d2.getFullYear() &&
                   d1.getMonth() === d2.getMonth() &&
                   d1.getDate() === d2.getDate();
        }
        function _toChineseTime(dt) {
            var d = new Date(dt);
            return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
                   _formatTimeNum(d.getHours()) + ':' + _formatTimeNum(d.getMinutes());
        }
        function _toChineseTimeShort(dt) {
            var d = new Date(dt);
            return _formatTimeNum(d.getHours()) + ':' + _formatTimeNum(d.getMinutes());
        }

        function refreshTimeElements(root) {
            root = root || document;
            var els = root.querySelectorAll ? root.querySelectorAll('time.u-dt') : [];
            if (root.nodeType === 1 && root.classList && root.classList.contains('u-dt')) {
                els = [root].concat(Array.prototype.slice.call(els));
            }
            if (!els.length) return 0;
            var now = Date.now();
            var count = 0;
            els.forEach(function(el) {
                var dt = el.getAttribute('datetime');
                if (!dt) return;
                var ts = new Date(dt).getTime();
                var diffSec = Math.floor((now - ts) / 1000);
                var diffMin = Math.floor(diffSec / 60);
                var diffHour = Math.floor(diffMin / 60);
                var newText;
                if (diffSec < 60) {
                    newText = '刚刚';
                } else if (diffMin < 60) {
                    newText = diffMin + ' 分钟前';
                } else if (diffHour < 6) {
                    newText = diffHour + ' 小时前';
                } else if (_isSameDay(ts, now)) {
                    newText = '今天 ' + _toChineseTimeShort(dt);
                } else {
                    newText = _toChineseTime(dt);
                }
                // 跳过已经是中文的元素（避免每次 DOM 变更都重复写入）
                if (el.textContent === newText) return;
                el.textContent = newText;
                el.setAttribute('title', _toChineseTime(dt));
                count++;
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
            var dds = root.querySelectorAll ? root.querySelectorAll('dl.pairs--justified dd') : [];
            if (root.nodeType === 1 && root.tagName === 'DD') {
                dds = [root].concat(Array.prototype.slice.call(dds));
            }
            if (!dds.length) return;
            dds.forEach(function(dd) {
                if (dd.dataset.f95JoinedTranslated) return;
                var text = dd.textContent.trim();
                var m = text.match(_JOINED_RE);
                if (!m) return;
                dd.textContent = m[3] + '年' + _MONTH_ABBR[m[1]] + '月' + parseInt(m[2], 10) + '日';
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

        function translateSpoilerTags(root) {
            root = root || document;
            var contents = root.querySelectorAll('.bbCodeBlock--spoiler .bbCodeBlock-content');
            if (!contents.length) return;
            var samTags = DICT.sam_tags || {};
            var labelsDict = DICT.labels || {};
            contents.forEach(function(el) {
                if (el.dataset.f95SpoilerTranslated) return;
                // 跳过含子元素的富文本 Spoiler（如 Developer Notes），仅处理纯文本标签（如 Genre）
                if (el.children.length > 0) return;
                var text = el.textContent.trim();
                if (!text) return;
                var parts = text.split(/\s*[,，]\s*/);
                var translated = parts.map(function(part) {
                    return lookupTag(part, samTags, labelsDict) || part.trim();
                });
                el.textContent = translated.join('、');
                el.dataset.f95SpoilerTranslated = '1';
                log('  [Spoiler标签] 已翻译 ' + parts.length + ' 个片段');
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
            var labelKeys = Object.keys(labels);

            var wrappers = root.querySelectorAll('.bbWrapper');
            wrappers.forEach(function(wrapper) {
                // 翻译 <b> 字段标签（以及 Censored/OS/Language 的值）
                if (labelKeys.length) {
                    var bTags = wrapper.querySelectorAll('b');
                    bTags.forEach(function(b) {
                        if (b.dataset.f95ThreadFieldTranslated) return;
                        var origText = b.textContent.trim();
                        if (!labels[origText]) return;

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
                                    if (valueDict[value]) {
                                        next.textContent = ': ' + valueDict[value];
                                        log('  [ThreadField] "' + origText + ': ' + value + '" → "' + valueDict[value] + '"');
                                    }
                                }
                            }
                        }

                        // 翻译字段标签文本
                        b.textContent = labels[origText];
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
                            span.textContent = downloadText;
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
            var keys = Object.keys(buttonDict).filter(function(k) { return k.charAt(0) !== '_'; });
            if (!keys.length) return;

            function normalize(text) {
                return text.trim().toLowerCase().replace(/:$/, '').trim();
            }

            var normalizedMap = {};
            keys.forEach(function(k) {
                normalizedMap[normalize(k)] = buttonDict[k];
            });

            var buttons = root.querySelectorAll('.button-text');
            buttons.forEach(function(btn) {
                if (btn.dataset.f95ButtonTranslated) return;
                // 取最内层 span 的文本（XenForo 按钮结构: .button-text > span > "Text"）
                var textEl = btn.querySelector('span') || btn;
                var text = textEl.textContent.trim();
                if (!text) return;
                var translation = normalizedMap[normalize(text)];
                if (translation) {
                    textEl.textContent = translation;
                    btn.dataset.f95ButtonTranslated = '1';
                    log('  [按钮] "' + text + '" → "' + translation + '"');
                }
            });

            // .tic--button 按钮（如 "Ignore forum"，文本直接在 <a> 内，无 .button-text 包装）
            root.querySelectorAll('.tic--button').forEach(function(btn) {
                if (btn.dataset.f95ButtonTranslated) return;
                if (btn.querySelector('.button-text')) return; // 已有 .button-text 子元素，上面已处理
                // 排除 structItem 内的 Ignore（由 translateStructItems 处理）
                if (btn.closest('.structItem-extraInfo')) return;
                var text = btn.textContent.trim();
                if (!text) return;
                var translation = normalizedMap[normalize(text)];
                if (translation) {
                    btn.textContent = translation;
                    btn.dataset.f95ButtonTranslated = '1';
                    log('  [tic按钮] "' + text + '" → "' + translation + '"');
                }
            });
        }

        function translateTooltips(root) {
            root = root || document;
            var tooltipDict = DICT.xenforo_tooltips || {};
            var keys = Object.keys(tooltipDict).filter(function(k) { return k.charAt(0) !== '_'; });
            if (!keys.length) return;

            var els = root.querySelectorAll('[data-original-title], [title]');
            els.forEach(function(el) {
                if (el.dataset.f95TooltipTranslated) return;

                // data-original-title（XenForo 主 tooltip 属性）
                var origTitle = el.getAttribute('data-original-title');
                if (origTitle && tooltipDict[origTitle]) {
                    el.setAttribute('data-original-title', tooltipDict[origTitle]);
                    el.dataset.f95TooltipTranslated = '1';
                    log('  [Tooltip] "' + origTitle + '" → "' + tooltipDict[origTitle] + '"');
                }

                // 常规 title 属性
                var title = el.getAttribute('title');
                if (title && tooltipDict[title] && title !== origTitle) {
                    el.setAttribute('title', tooltipDict[title]);
                    el.dataset.f95TooltipTranslated = '1';
                    log('  [Tooltip:title] "' + title + '" → "' + tooltipDict[title] + '"');
                }
            });
        }

        function translateForumNames(root) {
            root = root || document;
            var forumNames = DICT.xenforo_forum_names || {};
            var keys = Object.keys(forumNames).filter(function(k) { return k.charAt(0) !== '_'; });
            if (!keys.length) return;

            var selectors = [
                'a[data-shortcut="node-description"]',
                '.uix_categoryTitle',
                'a.subNodeLink',
                'h1.p-title-value',
                '.p-title-value',
                '.p-breadcrumbs span[itemprop="name"]'
            ];
            selectors.forEach(function(selector) {
                var els = root.querySelectorAll(selector);
                els.forEach(function(el) {
                    if (el.dataset.f95ForumTranslated) return;
                    var text = el.textContent.trim();
                    if (forumNames[text]) {
                        el.textContent = forumNames[text];
                        el.dataset.f95ForumTranslated = '1';
                        log('  [ForumName] "' + text + '" → "' + forumNames[text] + '"');
                    }
                });
            });
        }

        function translateNodeDescriptions(root) {
            root = root || document;
            var descMap = DICT.xenforo_node_descriptions || {};
            var keys = Object.keys(descMap).filter(function(k) { return k.charAt(0) !== '_'; });
            if (!keys.length) return;

            var descEls = root.querySelectorAll('.node-description, .p-description');
            if (!descEls.length) return;
            descEls.forEach(function(el) {
                if (el.dataset.f95DescTranslated) return;
                var text = el.textContent.replace(/\s+/g, ' ').trim();
                for (var i = 0; i < keys.length; i++) {
                    var normalizedKey = keys[i].replace(/\s+/g, ' ').trim();
                    if (text.indexOf(normalizedKey) === 0) {
                        el.innerHTML = descMap[keys[i]];
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
            var overlayTypes = Object.keys(overlaysDict).filter(function(k) { return k.charAt(0) !== '_'; });
            if (!overlayTypes.length) return;

            var overlays = root.querySelectorAll('.overlay');
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
                        if (cfg.title_pattern) {
                            var re = new RegExp(cfg.title_pattern);
                            var newTitle = titleText.replace(re, cfg.title_replacement);
                            titleEl.innerHTML = closer.outerHTML + ' ' + newTitle;
                        } else if (cfg.title) {
                            titleEl.innerHTML = closer.outerHTML + ' ' + cfg.title;
                        }
                    }

                    // 翻译链接文本
                    var linkMap = cfg.links || {};
                    overlay.querySelectorAll('.menu-linkRow').forEach(function(link) {
                        if (link.dataset.f95OverlayLinkTranslated) return;
                        var text = link.textContent.trim();
                        if (linkMap[text]) {
                            link.textContent = linkMap[text];
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
                            if (labelMap[text]) {
                                label.textContent = labelMap[text];
                                label.dataset.f95OverlayFormTranslated = '1';
                                log('  [Overlay:' + typeKey + ':label] "' + text + '" → "' + labelMap[text] + '"');
                            }
                        });

                        // 翻译 radio 选项文本
                        var radioMap = formCfg.radios || {};
                        overlay.querySelectorAll('.iconic-label').forEach(function(span) {
                            if (span.dataset.f95OverlayFormTranslated) return;
                            var text = span.textContent.trim();
                            if (radioMap[text]) {
                                span.textContent = radioMap[text];
                                span.dataset.f95OverlayFormTranslated = '1';
                                log('  [Overlay:' + typeKey + ':radio] "' + text + '" → "' + radioMap[text] + '"');
                            }
                        });

                        // 翻译说明文本（.inputChoices-explain）
                        var explainMap = formCfg.explanations || {};
                        overlay.querySelectorAll('.inputChoices-explain').forEach(function(dfn) {
                            if (dfn.dataset.f95OverlayFormTranslated) return;
                            var text = dfn.textContent.trim();
                            if (explainMap[text]) {
                                dfn.textContent = explainMap[text];
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
                            if (buttonMap[text]) {
                                span.textContent = buttonMap[text];
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
            var tooltips = root.querySelectorAll('.tooltip--member');
            if (!tooltips.length) return;

            var ttDict = DICT.xenforo_member_tooltip || {};
            var ttKeys = Object.keys(ttDict).filter(function(k) { return k.charAt(0) !== '_'; });
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
                            node.textContent = node.textContent.replace('From ', '来自于 ');
                            blurb.setAttribute('data-f95-from-done', '1');
                            log('  [MemberTooltip] "From " → "来自于 "');
                        }
                    }
                });

                // 2. 翻译 dt 元素 — 逐元素标记，避免竞态导致漏翻
                var dts = tooltip.querySelectorAll('dt:not([data-f95-mem-dt])');
                dts.forEach(function(dt) {
                    var text = dt.textContent.trim();
                    if (ttDict[text]) {
                        dt.textContent = ttDict[text];
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
                    if (ttDict[text]) {
                        if (span) {
                            span.textContent = ttDict[text];
                        } else {
                            link.textContent = ttDict[text];
                        }
                        link.setAttribute('data-f95-mem-btn', '1');
                        log('  [MemberTooltip:btn] "' + text + '" → "' + ttDict[text] + '"');
                    }
                });

                // 4. 翻译 "Last seen" 后面的活动状态文本
                //    结构: <dd><time>...</time> <span>·</span> Viewing thread <em><a>...</a></em></dd>
                var activityDict = DICT.xenforo_member_tooltip_activity || {};
                var activityKeys = Object.keys(activityDict).filter(function(k) { return k.charAt(0) !== '_'; });
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
                                    child.textContent = text.replace(key, activityDict[key]);
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
            var items = root.querySelectorAll('.structItem--thread');
            if (!items.length) return;

            log('--- 帖子列表条目翻译 (' + items.length + ' 条) ---');

            // 1. 状态徽章翻译（Locked → 已锁定, Redirect → 重定向, Sticky → 置顶, Poll → 投票）
            var statusDict = DICT.xenforo_thread_statuses || {};
            var statusKeys = Object.keys(statusDict).filter(function(k) { return k.charAt(0) !== '_'; });
            if (statusKeys.length) {
                root.querySelectorAll('.structItem-statuses .u-srOnly').forEach(function(span) {
                    if (span.dataset.f95StructStatus) return;
                    var text = span.textContent.trim();
                    if (statusDict[text]) {
                        span.textContent = statusDict[text];
                        span.dataset.f95StructStatus = '1';
                        log('  [StructStatus] "' + text + '" → "' + statusDict[text] + '"');
                    }
                });
            }

            // 2. 统计标签翻译（Replies → 回复, Views → 查看）
            var metaDict = DICT.xenforo_thread_meta_dt || {};
            var metaKeys = Object.keys(metaDict).filter(function(k) { return k.charAt(0) !== '_'; });
            if (metaKeys.length) {
                root.querySelectorAll('.structItem-cell--meta dt').forEach(function(dt) {
                    if (dt.dataset.f95StructMeta) return;
                    var text = dt.textContent.trim();
                    if (metaDict[text]) {
                        dt.textContent = metaDict[text];
                        dt.dataset.f95StructMeta = '1';
                        log('  [StructMeta] "' + text + '" → "' + metaDict[text] + '"');
                    }
                });
            }

            // 3. "Ignore" 按钮翻译
            root.querySelectorAll('.structItem-extraInfo .tic--button').forEach(function(btn) {
                if (btn.dataset.f95StructIgnore) return;
                if (btn.textContent.trim() === 'Ignore') {
                    btn.textContent = DICT.xenforo_thread_ignore || '忽略';
                    btn.dataset.f95StructIgnore = '1';
                    log('  [StructIgnore] "Ignore" → "' + (DICT.xenforo_thread_ignore || '忽略') + '"');
                }
            });

            // 4. "N/A" → "暂无"（无最新回复时）
            root.querySelectorAll('.structItem-cell--latest').forEach(function(cell) {
                if (cell.dataset.f95StructNA) return;
                var text = cell.textContent.trim();
                if (text === 'N/A') {
                    cell.textContent = DICT.xenforo_thread_na || '暂无';
                    cell.dataset.f95StructNA = '1';
                    log('  [StructNA] "N/A" → "' + (DICT.xenforo_thread_na || '暂无') + '"');
                }
            });

            // 5. "X star(s)" → "X 星"（评分 title 属性 + 屏幕阅读器文本）
            var starsSuffix = DICT.xenforo_thread_stars_suffix || ' 星';
            root.querySelectorAll('.structItem .ratingStars[title]').forEach(function(stars) {
                if (stars.dataset.f95StructStars) return;
                var title = stars.getAttribute('title');
                var newTitle = title.replace(/(\d+\.?\d*)\s+star\(s\)/i, '$1' + starsSuffix);
                if (newTitle !== title) {
                    stars.setAttribute('title', newTitle);
                    var srOnly = stars.querySelector('.u-srOnly');
                    if (srOnly) {
                        srOnly.textContent = srOnly.textContent.replace(/(\d+\.?\d*)\s+star\(s\)/i, '$1' + starsSuffix);
                    }
                    stars.dataset.f95StructStars = '1';
                    log('  [StructStars] "' + title + '" → "' + newTitle + '"');
                }
            });

            // 6. "X Votes" → "X 票"（评分投票数）
            var votesSuffix = DICT.xenforo_thread_votes_suffix || ' 票';
            root.querySelectorAll('.structItem .ratingStarsRow-text > div').forEach(function(el) {
                if (el.dataset.f95StructVotes) return;
                var text = el.textContent.trim();
                var m = text.match(/^(\d+)\s*Votes?$/);
                if (m) {
                    el.textContent = m[1] + votesSuffix;
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
            root.querySelectorAll('.filterBar-menuTrigger').forEach(function(el) {
                if (el.dataset.f95FilterTrigger) return;
                if (el.textContent.trim() === 'Filters') {
                    el.textContent = filterDict.trigger || '筛选';
                    el.dataset.f95FilterTrigger = '1';
                    log('  [FilterTrigger] "Filters" → "' + (filterDict.trigger || '筛选') + '"');
                }
            });

            // 2. "Show only:" 菜单标题（.menu-header 是 .js-filterMenuBody 的兄弟，非子元素）
            root.querySelectorAll('.filterBar .menu-header').forEach(function(el) {
                if (el.dataset.f95FilterHeader) return;
                if (el.textContent.trim() === 'Show only:') {
                    el.textContent = filterDict.show_only || '仅显示：';
                    el.dataset.f95FilterHeader = '1';
                    log('  [FilterHeader] "Show only:" → "' + (filterDict.show_only || '仅显示：') + '"');
                }
            });

            // 3. "Prefix:" 和 "Sort by:" 裸文本节点
            root.querySelectorAll('.js-filterMenuBody .menu-row--separated').forEach(function(row) {
                for (var i = 0; i < row.childNodes.length; i++) {
                    var child = row.childNodes[i];
                    if (child.nodeType !== 3 || child._f95FilterRow) continue;
                    var text = child.textContent.trim();
                    if (text === 'Prefix:') {
                        child.textContent = child.textContent.replace('Prefix:', filterDict.prefix_label || '前缀：');
                        child._f95FilterRow = true;
                        log('  [FilterRow] "Prefix:" → "' + (filterDict.prefix_label || '前缀：') + '"');
                    } else if (text === 'Sort by:') {
                        child.textContent = child.textContent.replace('Sort by:', filterDict.sort_by || '排序：');
                        child._f95FilterRow = true;
                        log('  [FilterRow] "Sort by:" → "' + (filterDict.sort_by || '排序：') + '"');
                    }
                }
            });

            // 4. <label> 元素翻译（Started by:, Last updated:）
            root.querySelectorAll('.js-filterMenuBody label').forEach(function(label) {
                if (label.dataset.f95FilterLabel) return;
                var text = label.textContent.trim();
                if (text === 'Started by:') {
                    label.textContent = filterDict.started_by || '作者：';
                    label.dataset.f95FilterLabel = '1';
                    log('  [FilterLabel] "Started by:" → "' + (filterDict.started_by || '作者：') + '"');
                } else if (text === 'Last updated:') {
                    label.textContent = filterDict.last_updated || '最近更新：';
                    label.dataset.f95FilterLabel = '1';
                    log('  [FilterLabel] "Last updated:" → "' + (filterDict.last_updated || '最近更新：') + '"');
                }
            });

            // 5. "Sort order" / "Sort direction" 屏幕阅读器文本
            root.querySelectorAll('.js-filterMenuBody .u-srOnly').forEach(function(sr) {
                if (sr.dataset.f95FilterSR) return;
                var text = sr.textContent.trim();
                if (text === 'Sort order') {
                    sr.textContent = filterDict.sort_order || '排序方式';
                    sr.dataset.f95FilterSR = '1';
                    log('  [FilterSR] "Sort order" → "' + (filterDict.sort_order || '排序方式') + '"');
                } else if (text === 'Sort direction') {
                    sr.textContent = filterDict.sort_direction || '排序方向';
                    sr.dataset.f95FilterSR = '1';
                    log('  [FilterSR] "Sort direction" → "' + (filterDict.sort_direction || '排序方向') + '"');
                }
            });

            // 6. <option> 文本翻译（Last updated / Sort by 下拉选项）
            var optionKeys = Object.keys(optionDict).filter(function(k) { return k.charAt(0) !== '_'; });
            if (optionKeys.length) {
                root.querySelectorAll('.js-filterMenuBody select option').forEach(function(opt) {
                    if (opt.dataset.f95FilterOption) return;
                    var text = opt.textContent.trim();
                    if (optionDict[text]) {
                        opt.textContent = optionDict[text];
                        opt.dataset.f95FilterOption = '1';
                        log('  [FilterOption] "' + text + '" → "' + optionDict[text] + '"');
                    }
                });
            }

            // 7. <optgroup> label 属性翻译（Prefix 分组: Other/Engine/Status）
            root.querySelectorAll('.js-filterMenuBody optgroup').forEach(function(group) {
                if (group.dataset.f95FilterOptgroup) return;
                var label = group.getAttribute('label');
                var optgroupMap = { 'Other': '其他', 'Engine': '引擎', 'Status': '状态' };
                if (label && optgroupMap[label]) {
                    group.setAttribute('label', optgroupMap[label]);
                    group.dataset.f95FilterOptgroup = '1';
                    log('  [FilterOptgroup] "' + label + '" → "' + optgroupMap[label] + '"');
                }
            });

            // 8. "Prefix…" placeholder
            root.querySelectorAll('.js-filterMenuBody .select2-search__field').forEach(function(input) {
                if (input.dataset.f95FilterPH) return;
                if (input.getAttribute('placeholder') === 'Prefix…') {
                    input.setAttribute('placeholder', filterDict.prefix_placeholder || '前缀…');
                    input.dataset.f95FilterPH = '1';
                    log('  [FilterPH] "Prefix…" → "' + (filterDict.prefix_placeholder || '前缀…') + '"');
                }
            });

            // 9. Select2 下拉 optgroup 标题（渲染在 .js-filterMenuBody 之外，动态出现）
            root.querySelectorAll('.select2-results__group').forEach(function(el) {
                if (el.dataset.f95FilterOptgroup) return;
                var text = el.textContent.trim();
                var optgroupMap = { 'Other': '其他', 'Engine': '引擎', 'Status': '状态' };
                if (optgroupMap[text]) {
                    el.textContent = optgroupMap[text];
                    el.dataset.f95FilterOptgroup = '1';
                    log('  [FilterSelect2Group] "' + text + '" → "' + optgroupMap[text] + '"');
                }
            });
        }

        function translate() {
            xenforoPassCount++;
            log('--- 第 ' + xenforoPassCount + ' 轮 XenForo 翻译 ---');

            // notice-content: 按 notice-id 精确匹配，innerHTML 替换（保留 dismiss 链接）
            var noticeSelectorKeys = Object.keys(noticeSelectors);
            if (noticeSelectorKeys.length > 0) {
                var noticeEls = document.querySelectorAll('.notice-content');
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
                            var dismissHTML = dismiss ? dismiss.outerHTML : '';
                            var oldHTML = el.innerHTML.substring(0, 80);
                            el.innerHTML = dismissHTML + translation;
                            log('  ✓ [.notice-content#' + (noticeId || '?') + '] innerHTML 替换 (保留dismiss链接)');
                            log('    原文(截断): ' + oldHTML);
                        } catch(e) {
                            log('  ✗ [.notice-content#' + (noticeId || '?') + '] 替换失败: ' + e.message);
                        }
                    });
                }
            }

            // 其他选择器: textContent 替换
            var unmatched = [];
            Object.keys(normalSelectors).forEach(function(selector) {
                try {
                    var els = document.querySelectorAll(selector);
                    if (els.length === 0) {
                        unmatched.push({ selector: selector, reason: '未找到' });
                        return;
                    }
                    els.forEach(function(el) {
                        var oldText = el.textContent.trim();
                        el.textContent = normalSelectors[selector];
                        log('  ✓ [' + selector + '] "' + oldText + '" → "' + normalSelectors[selector] + '"');
                    });
                } catch(e) {
                    unmatched.push({ selector: selector, reason: e.message });
                }
            });

            // Label 标签翻译（Completed、Abandoned、Collection 等）
            log('--- Label 标签翻译 (' + Object.keys(DICT.labels || {}).length + ' 条) ---');
            var labelUnmatched = translateLabels(document, DICT.labels, '.label');
            if (labelUnmatched.length > 0) {
                var uniqueLabels = labelUnmatched.filter(function(v, i, a) { return a.indexOf(v) === i; });
                if (uniqueLabels.length > 0) {
                    log('  未翻译的标签 (' + uniqueLabels.length + '):');
                    uniqueLabels.forEach(function(t) { log('    - "' + t + '"'); });
                }
            }

            // --- Spoiler 标签翻译（Genre 介绍框内的逗号分隔标签） ---
            translateSpoilerTags();

            // --- 游戏帖子主楼信息字段翻译（Overview, Thread Updated, Censored 等） ---
            translateThreadFields();

            // --- 按钮文本翻译 ---
            translateButtons();

            // --- Tooltip 翻译 ---
            translateTooltips();

            // --- 帖子列表条目翻译（状态徽章、统计标签、Ignore、评分等） ---
            translateStructItems();

            // --- Filter 筛选菜单翻译 ---
            translateFilterMenu();

            // --- 正则替换翻译（动态文本：... and X more.、Total: X (members: Y)） ---
            log('--- 正则替换翻译 (' + (DICT.xenforo_regex || []).length + ' 条) ---');
            var regexUnmatched = translateByRegex(DICT.xenforo_regex || []);
            if (regexUnmatched.length > 0) {
                log('  未匹配的正则项 (' + regexUnmatched.length + '):');
                regexUnmatched.forEach(function(item) {
                    log('    - ' + item.selector + ' (' + item.reason + ')');
                });
            }

            // --- Placeholder 翻译 ---
            log('--- Placeholder 翻译 (' + Object.keys(DICT.xenforo_placeholders || {}).length + ' 条) ---');
            var phUnmatched = translatePlaceholders(DICT.xenforo_placeholders || {});
            if (phUnmatched.length > 0) {
                log('  未匹配的 placeholder (' + phUnmatched.length + '):');
                phUnmatched.forEach(function(item) {
                    log('    - ' + item.selector + ' (' + item.reason + ')');
                });
            }

            // --- 版块统计 dt 文本翻译 (Threads/Messages) ---
            log('--- 版块统计翻译 (' + Object.keys(DICT.xenforo_node_stats_dt || {}).length + ' 条) ---');
            var statsDtUnmatched = translateByTextMatch(DICT.xenforo_node_stats_dt || {}, '.node-statsMeta dt, .node-stats dt');
            if (statsDtUnmatched.length > 0) {
                log('  未匹配的统计文本 (' + statsDtUnmatched.length + '):');
                statsDtUnmatched.forEach(function(t) { log('    - "' + t + '"'); });
            }

            // --- 帖子列表分隔符翻译 (Sticky threads / Normal threads) ---
            log('--- 帖子列表分隔符翻译 (' + Object.keys(DICT.xenforo_thread_list_separators || {}).filter(function(k) { return k.charAt(0) !== '_'; }).length + ' 条) ---');
            var separatorDict = DICT.xenforo_thread_list_separators || {};
            var sepKeys = Object.keys(separatorDict).filter(function(k) { return k.charAt(0) !== '_'; });
            if (sepKeys.length) {
                var sepUnmatched = [];
                document.querySelectorAll('.uix_threadListSeparator').forEach(function(el) {
                    if (el.dataset.f95ThreadSep) return;
                    var childNodes = el.childNodes;
                    for (var i = 0; i < childNodes.length; i++) {
                        if (childNodes[i].nodeType === Node.TEXT_NODE) {
                            var rawText = childNodes[i].textContent;
                            var trimmed = rawText.trim();
                            if (separatorDict[trimmed]) {
                                childNodes[i].textContent = rawText.replace(trimmed, separatorDict[trimmed]);
                                el.dataset.f95ThreadSep = '1';
                                log('  ✓ [uix_threadListSeparator] "' + trimmed + '" → "' + separatorDict[trimmed] + '"');
                            } else if (trimmed) {
                                sepUnmatched.push(trimmed);
                            }
                            break;
                        }
                    }
                });
                if (sepUnmatched.length > 0) {
                    log('  未匹配的分隔符文本 (' + sepUnmatched.length + '):');
                    sepUnmatched.forEach(function(t) { log('    - "' + t + '"'); });
                }
            }

            // --- dataList 表头翻译（Quick Search 结果等） ---
            log('--- dataList 表头翻译 (' + Object.keys(DICT.xenforo_dataList_headers || {}).filter(function(k) { return k.charAt(0) !== '_'; }).length + ' 条) ---');
            var headerUnmatched = translateByTextMatch(DICT.xenforo_dataList_headers || {}, '#quicksearch-result th.dataList-cell');
            if (headerUnmatched.length > 0) {
                log('  未匹配的表头文本 (' + headerUnmatched.length + '):');
                headerUnmatched.forEach(function(t) { log('    - "' + t + '"'); });
            }

            // --- 论坛名称翻译 ---
            log('--- 论坛名称翻译 (' + Object.keys(DICT.xenforo_forum_names || {}).filter(function(k) { return k.charAt(0) !== '_'; }).length + ' 条) ---');
            translateForumNames();

            // --- 板块描述翻译 ---
            log('--- 板块描述翻译 (' + Object.keys(DICT.xenforo_node_descriptions || {}).filter(function(k) { return k.charAt(0) !== '_'; }).length + ' 条) ---');
            translateNodeDescriptions();

            // --- XenForo overlay/pop-up 翻译 ---
            translateXenForoOverlays();

            // --- 个人资料弹窗翻译 ---
            translateMemberTooltip();

            // --- 页脚链接/统计翻译 ---
            log('--- 页脚翻译 ---');
            translateFooter();

            if (unmatched.length > 0) {
                log('  未匹配的选择器 (' + unmatched.length + '):');
                unmatched.forEach(function(item) {
                    log('    - ' + item.selector + ' (' + item.reason + ')');
                });
            }
        }

        // DOM 就绪后首次翻译
        function onReady() {
            logGroup('XenForo DOM 就绪，开始翻译', function() {
                translate();
                refreshTimeElements();
                translateJoinedDates();
            });

            // 监听动态加载的内容（下拉菜单、弹窗、懒加载通知等）
            var observer = new MutationObserver(debounce(function() {
                log('  [MutationObserver] 检测到DOM变化，重新翻译');
                translate();
                refreshTimeElements();
                translateJoinedDates();
            }, 200));

            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true});
                log('  MutationObserver 已启动');
            }

            // 定时刷新：XenForo 每 ~60s 会覆盖时间文本为英文，定时抢回
            setInterval(function() {
                refreshTimeElements();
                translateJoinedDates();
                translateMemberTooltip();
            }, 30000);
            log('  时间定时刷新已启动 (每30s)');
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onReady);
        } else {
            onReady();
        }
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
        if (DICT.sam_css_pseudo && DICT.sam_css_pseudo.length) {
            GM_addStyle(DICT.sam_css_pseudo.join('\n'));
            log('CSS 伪元素已注入 (' + DICT.sam_css_pseudo.length + ' 条):');
            DICT.sam_css_pseudo.forEach(function(css) {
                log('  ' + css);
            });
        }

        // ---- 2. XHR 拦截：翻译 JSON 中的 tags ----
        var samTags = DICT.sam_tags || {};
        var tagKeys = Object.keys(samTags);
        if (tagKeys.length) {
            var XHR = XMLHttpRequest.prototype;
            var origOpen = XHR.open;
            var origSend = XHR.send;

            XHR.open = function(method, url) {
                this._f95_url = url;
                return origOpen.apply(this, arguments);
            };

            XHR.send = function(body) {
                var xhr = this;
                if (xhr._f95_url && xhr._f95_url.indexOf('latest_data.php') !== -1) {
                    log('  XHR 拦截: ' + xhr._f95_url);
                    xhr.addEventListener('readystatechange', function() {
                        if (xhr.readyState === 4 && xhr.status === 200) {
                            logGroup('XHR 响应拦截 (latest_data.php)', function() {
                                try {
                                    var text = xhr.responseText;
                                    var replacedTags = [];
                                    for (var i = 0; i < tagKeys.length; i++) {
                                        var en = tagKeys[i];
                                        var zh = samTags[en];
                                        var escaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                        var re = new RegExp('"tag":"' + escaped + '"', 'g');
                                        var newText = text.replace(re, '"tag":"' + zh + '"');
                                        if (newText !== text) {
                                            replacedTags.push(en + ' → ' + zh);
                                            text = newText;
                                        }
                                    }

                                    // Label 标签翻译（JSON 级别替换）
                                    var labelsDict = DICT.labels || {};
                                    var labelKeys = Object.keys(labelsDict).filter(function(k) { return k.charAt(0) !== '_'; });
                                    var replacedLabels = [];
                                    for (var j = 0; j < labelKeys.length; j++) {
                                        var lbEn = labelKeys[j];
                                        var lbZh = labelsDict[lbEn];
                                        var lbEscaped = lbEn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                        var lbRe = new RegExp('"' + lbEscaped + '"', 'g');
                                        var lbNewText = text.replace(lbRe, '"' + lbZh + '"');
                                        if (lbNewText !== text) {
                                            replacedLabels.push(lbEn + ' → ' + lbZh);
                                            text = lbNewText;
                                        }
                                    }
                                    if (replacedLabels.length > 0) {
                                        log('已替换 ' + replacedLabels.length + ' 种 Label:');
                                        replacedLabels.forEach(function(t) { log('  ' + t); });
                                    }

                                    if (replacedTags.length > 0 || replacedLabels.length > 0) {
                                        log('已替换 ' + replacedTags.length + ' 种标签:');
                                        replacedTags.forEach(function(t) { log('  ' + t); });

                                        Object.defineProperty(xhr, 'responseText', {
                                            writable: true,
                                            value: text
                                        });
                                        try {
                                            Object.defineProperty(xhr, 'response', {
                                                writable: true,
                                                value: JSON.parse(text)
                                            });
                                        } catch(e) {}

                                        // 扫描未匹配的原始 tag（从响应中提取所有出现的 tag 值）
                                        var allTags = text.match(/"tag":"([^"]+)"/g) || [];
                                        var foundEn = {};
                                        allTags.forEach(function(m) {
                                            var name = m.replace(/"tag":"|"/g, '');
                                            foundEn[name] = true;
                                        });
                                        var untranslated = Object.keys(foundEn).filter(function(t) {
                                            return !samTags[t];
                                        });
                                        if (untranslated.length > 0) {
                                            log('⚠ 未翻译的标签 (' + untranslated.length + '):');
                                            untranslated.forEach(function(t) { log('  - "' + t + '"'); });
                                        }
                                    } else {
                                        log('  未匹配到任何标签/Label，无需替换');
                                    }
                                } catch(e) {
                                    log('✗ XHR 处理出错: ' + e.message);
                                }
                            });
                        }
                    });
                }
                return origSend.apply(this, arguments);
            };
            log('XHR 拦截器已安装 (监听 latest_data.php, ' + tagKeys.length + ' 种标签)');
        }

        // ---- 3. 静态 UI 翻译（DOM 就绪后） ----
        function translateSamStatic() {
            logGroup('SAM 静态 UI 翻译', function() {
                // --- 选择器翻译 ---
                var staticDict = DICT.sam_static || {};
                log('--- 选择器翻译 (' + Object.keys(staticDict).length + ' 条) ---');
                var unmatched = [];
                Object.keys(staticDict).forEach(function(selector) {
                    try {
                        var els = document.querySelectorAll(selector);
                        if (els.length === 0) {
                            unmatched.push({ selector: selector, reason: '未找到' });
                            return;
                        }
                        els.forEach(function(el) {
                            var translation = staticDict[selector];
                            if (translation.indexOf('<') !== -1) {
                                var oldHTML = el.innerHTML.substring(0, 80);
                                el.innerHTML = translation;
                                log('  ✓ [' + selector + '] innerHTML 替换');
                                log('    原文(截断): ' + oldHTML);
                            } else {
                                var oldText = el.textContent.trim();
                                el.textContent = translation;
                                log('  ✓ [' + selector + '] "' + oldText + '" → "' + translation + '"');
                            }
                        });
                    } catch(e) {
                        unmatched.push({ selector: selector, reason: e.message });
                    }
                });

                if (unmatched.length > 0) {
                    log('  未匹配的选择器 (' + unmatched.length + '):');
                    unmatched.forEach(function(item) {
                        log('    - ' + item.selector + ' (' + item.reason + ')');
                    });
                }

                // --- Placeholders ---
                log('--- Placeholder 翻译 (' + Object.keys(DICT.sam_placeholders || {}).length + ' 条) ---');
                var unmatchedPH = translatePlaceholders(DICT.sam_placeholders || {});
                if (unmatchedPH.length > 0) {
                    log('  未匹配的 placeholder (' + unmatchedPH.length + '):');
                    unmatchedPH.forEach(function(item) {
                        log('    - ' + item.selector + ' (' + item.reason + ')');
                    });
                }

                // --- Accordion toggle 文本匹配 ---
                var accordionMap = DICT.sam_accordion_match || {};
                log('--- Accordion 文本匹配 (' + Object.keys(accordionMap).length + ' 条) ---');
                var unmatchedAcc = translateByTextMatch(accordionMap, '.accordion-toggle');
                if (unmatchedAcc.length > 0) {
                    log('  未匹配的 accordion 文本 (' + unmatchedAcc.length + '):');
                    unmatchedAcc.forEach(function(t) { log('    - "' + t + '"'); });
                }

                // --- Toggle 按钮文本匹配 ---
                var toggleMap = DICT.sam_toggle_match || {};
                log('--- Toggle 文本匹配 (' + Object.keys(toggleMap).length + ' 条) ---');
                var unmatchedTog = translateByTextMatch(toggleMap, '.filter-search_type-creator, .filter-search_type-title, .filter-tag_type-or, .filter-tag_type-and');
                if (unmatchedTog.length > 0) {
                    log('  未匹配的 toggle 文本 (' + unmatchedTog.length + '):');
                    unmatchedTog.forEach(function(t) { log('    - "' + t + '"'); });
                }

                // --- Label 标签翻译（游戏卡片上的 Completed、Collection 等）---
                log('--- Label 标签翻译 (' + Object.keys(DICT.labels || {}).length + ' 条) ---');
                var labelUnmatched = translateLabels(document, DICT.labels, '.resource-tile_label-wrap [class*="label--"]');
                if (labelUnmatched.length > 0) {
                    var uniqueLabels = labelUnmatched.filter(function(v, i, a) { return a.indexOf(v) === i; });
                    if (uniqueLabels.length > 0) {
                        log('  未翻译的标签 (' + uniqueLabels.length + '):');
                        uniqueLabels.forEach(function(t) { log('    - "' + t + '"'); });
                    }
                }

                // --- Filter 按钮标签翻译（Category/Sorting 按钮 + Prefix 按钮）---
                log('--- Filter 按钮标签翻译 ---');
                var filterBtnUnmatched = translateLabels(document, DICT.labels, '.filter-block_button, .filter-block_button-label');
                if (filterBtnUnmatched.length > 0) {
                    var uniqueFilter = filterBtnUnmatched.filter(function(v, i, a) { return a.indexOf(v) === i; });
                    log('  未翻译的 Filter 按钮标签 (' + uniqueFilter.length + '):');
                    uniqueFilter.forEach(function(t) { log('    - "' + t + '"'); });
                }

                // --- 结果计数 "# Results" → "# 条结果" ---
                function translateInfoCount() {
                    var el = document.querySelector('#info-count');
                    if (!el) {
                        log('  ✗ [#info-count] 未找到');
                        return false;
                    }
                    var oldText = el.textContent;
                    if (oldText.indexOf('Results') === -1) return true; // 已翻译，无需操作
                    el.textContent = oldText.replace(
                        /([\d,]+)\s*Results/,
                        '$1 条结果'
                    );
                    log('  ✓ [#info-count] "' + oldText + '" → "' + el.textContent + '"');
                    return true;
                }
                translateInfoCount();
            });
        }

        function translateSamTooltips(root) {
            root = root || document;
            var tooltipDict = DICT.sam_tooltips || {};
            var keys = Object.keys(tooltipDict).filter(function(k) { return k.charAt(0) !== '_'; });
            if (!keys.length) return;
            root.querySelectorAll('[data-tooltip]').forEach(function(el) {
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
            root.querySelectorAll('.nav_prev span, .nav_next span').forEach(function(el) {
                if (el.dataset.f95PageTranslated) return;
                var text = el.textContent.trim();
                if (text === 'Prev') { el.textContent = '上一页'; el.dataset.f95PageTranslated = '1'; }
                else if (text === 'Next') { el.textContent = '下一页'; el.dataset.f95PageTranslated = '1'; }
            });
        }

        function translateHoverTags(root) {
            root = root || document;
            var samTags = DICT.sam_tags || {};
            var labelsDict = DICT.labels || {};
            var tagSpans = root.querySelectorAll('.resource-tile_tags span');
            if (!tagSpans.length) return;
            tagSpans.forEach(function(span) {
                if (span.dataset.f95HoverTranslated) return;
                var text = span.textContent.trim();
                var result = lookupTag(text, samTags, labelsDict);
                if (result) {
                    span.textContent = result;
                    span.dataset.f95HoverTranslated = '1';
                    log('  [Hover标签] "' + text + '" → "' + result + '"');
                }
            });
        }

        function translateSamSettings(root) {
            root = root || document;
            var panel = root.querySelector('#latest-page_options-panel');
            if (!panel) return;

            log('--- Settings 面板翻译 ---');

            // 1. 标题和按钮文本 (sam_settings 文本匹配)
            var settingsMap = DICT.sam_settings || {};
            translateByTextMatch(settingsMap, '.options-panel_item-title', panel);
            translateByTextMatch(settingsMap, '.options-panel_item-btns a', panel);

            // 2. 含图标/HTML 元素 (sam_static 条目，需保留 <i> 子元素)
            var staticDict = DICT.sam_static || {};
            var iconSelectors = [
                '#latest-page_options-panel h3',
                '#options-panel_item-btns-info',
                '#options-panel_save-load .options-save'
            ];
            iconSelectors.forEach(function(selector) {
                var translation = staticDict[selector];
                if (!translation) return;
                var el = root.querySelector(selector);
                if (!el) return;
                if (el.dataset.f95SamSettingsTranslated) {
                    // SAM 应用可能异步覆盖了文本，验证翻译是否仍然生效
                    var expectedText = translation.replace(/<[^>]*>/g, '').trim();
                    if (el.textContent.trim() === expectedText) return;
                    log('  ⚠ [' + selector + '] 翻译被覆盖，重新应用');
                }
                if (translation.indexOf('<') !== -1) {
                    el.innerHTML = translation;
                } else {
                    el.textContent = translation;
                }
                el.dataset.f95SamSettingsTranslated = '1';
                log('  ✓ [' + selector + '] Settings 面板已翻译');
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

            // ---- 4. 动态滑块文本监听 ----
            var sliderMap = DICT.sam_slider_map || {};
            var sliderTranslating = false;

            function translateSliderText(el) {
                if (sliderTranslating) return;
                var text = el.textContent.trim();

                // 固定文本映射
                if (sliderMap[text]) {
                    sliderTranslating = true;
                    el.textContent = sliderMap[text];
                    sliderTranslating = false;
                    log('  [滑块] "' + text + '" → "' + sliderMap[text] + '"');
                    return;
                }

                // Settings: Hover delay "100 ms" → "100 毫秒"
                if (el.id === 'options-panel_hover-delay_value') {
                    var msReplaced = text.replace(/(\d+)\s*ms/, '$1 毫秒');
                    if (msReplaced !== text) {
                        sliderTranslating = true;
                        el.textContent = msReplaced;
                        sliderTranslating = false;
                        log('  [滑块] "' + text + '" → "' + msReplaced + '"');
                    }
                    return;
                }

                // Settings: Items Per Page "90 Items" → "90 条"
                if (el.id === 'options-panel_rows_value') {
                    var itemsReplaced = text.replace(/(\d+)\s*Items/, '$1 条');
                    if (itemsReplaced !== text) {
                        sliderTranslating = true;
                        el.textContent = itemsReplaced;
                        sliderTranslating = false;
                        log('  [滑块] "' + text + '" → "' + itemsReplaced + '"');
                    }
                    return;
                }

                // 动态文本：< 180 days → < 180 天
                var replaced = text.replace(/(\d+)\s*days?/g, '$1 天');
                if (replaced !== text) {
                    sliderTranslating = true;
                    el.textContent = replaced;
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

            // MutationObserver 监听滑块文本变化
            var sliderObserver = new MutationObserver(function(mutations) {
                mutations.forEach(function(m) {
                    if (m.type === 'characterData') {
                        var parent = m.target.parentElement;
                        if (parent && parent.classList.contains('range-slider_value')) {
                            translateSliderText(parent);
                        }
                    } else if (m.type === 'childList') {
                        // 检查 target 自身是否为 .range-slider_value（querySelectorAll 不匹配自身）
                        if (m.target.classList && m.target.classList.contains('range-slider_value')) {
                            translateSliderText(m.target);
                        }
                        // 同时检查后代中是否有 .range-slider_value
                        if (m.target.querySelectorAll) {
                            m.target.querySelectorAll('.range-slider_value').forEach(translateSliderText);
                        }
                    }
                });
            });

            if (document.body) {
                sliderObserver.observe(document.body, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });
                log('  滑块 MutationObserver 已启动');
            }

            // ---- 5. Selectize 下拉标签 / 已选标签翻译 ----
            var tagSelectizeTranslating = false;
            var selectizeDebounceTimer = null;

            function translateSelectizeContent() {
                if (tagSelectizeTranslating) return;
                tagSelectizeTranslating = true;

                // a) 翻译下拉选项中的 tag-name
                document.querySelectorAll('.selectize-dropdown-content .tag-name').forEach(function(el) {
                    if (el.dataset.f95Translated) return;
                    translateTagSpan(el);
                });

                // b) 翻译已选标签区域（标签 + 排除标签）
                ['filter-tags-selected-wrap', 'filter-tags-exclude-selected-wrap'].forEach(function(cls) {
                    var wrap = document.querySelector('.' + cls);
                    if (!wrap) return;
                    wrap.querySelectorAll('.tag-name, [data-value]').forEach(function(el) {
                        if (el.dataset.f95Translated) return;
                        // selectize 选中项通常直接包含 tag 文本在某个 span 中
                        var tagSpan = el.querySelector('.tag-name') || el;
                        translateTagSpan(tagSpan);
                    });
                });

                tagSelectizeTranslating = false;
            }

            function translateTagSpan(el) {
                var text = el.textContent.trim();
                if (!text) return;

                // 精确匹配
                if (samTags[text]) {
                    el.textContent = samTags[text];
                    el.dataset.f95Translated = '1';
                    log('  [Selectize标签] "' + text + '" → "' + samTags[text] + '"');
                    return;
                }

                // 大小写不敏感匹配
                var lowerText = text.toLowerCase();
                for (var i = 0; i < tagKeys.length; i++) {
                    if (tagKeys[i].toLowerCase() === lowerText) {
                        el.textContent = samTags[tagKeys[i]];
                        el.dataset.f95Translated = '1';
                        log('  [Selectize标签:ci] "' + text + '" → "' + samTags[tagKeys[i]] + '"');
                        return;
                    }
                }
            }

            // 监听 body 下任意 .selectize-dropdown-content 的子节点变化
            var selectizeObserver = new MutationObserver(function(mutations) {
                var shouldTranslate = false;
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.type === 'childList' && m.addedNodes.length > 0) {
                        // 检查是否有 .option 或 .tag-name 被添加
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var node = m.addedNodes[j];
                            if (node.nodeType === 1) { // Element
                                if (node.classList && (
                                    node.classList.contains('option') ||
                                    node.classList.contains('selectize-dropdown-content') ||
                                    node.querySelector('.tag-name')
                                )) {
                                    shouldTranslate = true;
                                    break;
                                }
                                // 也检查被添加节点内部
                                if (node.querySelectorAll && (
                                    node.querySelector('.option') ||
                                    node.querySelector('.tag-name')
                                )) {
                                    shouldTranslate = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (shouldTranslate) break;
                }

                if (shouldTranslate) {
                    clearTimeout(selectizeDebounceTimer);
                    selectizeDebounceTimer = setTimeout(translateSelectizeContent, 100);
                }
            });

            if (document.body) {
                selectizeObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });
                log('  Selectize MutationObserver 已启动');
            }

            // ---- 6. #info-count 文本变化监听（AJAX 后重新翻译） ----
            var infoCountObserver = new MutationObserver(function() {
                var el = document.querySelector('#info-count');
                if (el && el.textContent.indexOf('Results') !== -1) {
                    var oldText = el.textContent;
                    el.textContent = oldText.replace(/([\d,]+)\s*Results/, '$1 条结果');
                    log('  [InfoCount] AJAX 覆盖检测: "' + oldText + '" → "' + el.textContent + '"');
                }
            });

            var infoEl = document.querySelector('#info-count');
            if (infoEl) {
                infoCountObserver.observe(infoEl, { childList: true, characterData: true, subtree: true });
                log('  InfoCount MutationObserver 已启动 (直接监听 #info-count)');
            } else if (document.body) {
                // #info-count 可能尚未创建，先监听 body
                infoCountObserver.observe(document.body, { childList: true, subtree: true });
                log('  InfoCount MutationObserver 已启动 (全局监听，等待 #info-count 创建)');
            }

            // ---- 7. Label 标签变化 + Hover 卡片标签的监听（AJAX 加载后翻译） ----
            var labelObserver = new MutationObserver(function(mutations) {
                var shouldTranslateLabels = false;
                var shouldTranslateHover = false;
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.type === 'childList' && m.addedNodes.length > 0) {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var node = m.addedNodes[j];
                            if (node.nodeType === 1 && node.querySelectorAll) {
                                if (node.querySelector('.resource-tile_label-wrap [class*="label--"]') ||
                                    (node.classList && node.classList.contains('resource-tile'))) {
                                    shouldTranslateLabels = true;
                                }
                                if (node.querySelector('.resource-tile_tags') ||
                                    (node.classList && node.classList.contains('resource-tile_tags'))) {
                                    shouldTranslateHover = true;
                                }
                            }
                        }
                    }
                }
                if (shouldTranslateLabels) {
                    translateLabels(document, DICT.labels, '.resource-tile_label-wrap [class*="label--"]');
                }
                if (shouldTranslateHover) {
                    translateHoverTags(document);
                }
            });

            if (document.body) {
                labelObserver.observe(document.body, { childList: true, subtree: true });
                log('  Label MutationObserver 已启动');
            }

            // ---- 8. 分页导航变化监听（AJAX 翻页后重新翻译 Prev/Next） ----
            var pageObserver = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.type === 'childList') {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var node = m.addedNodes[j];
                            if (node.nodeType === 1 && node.querySelectorAll) {
                                if (node.querySelector('.nav_prev') || node.querySelector('.nav_next') ||
                                    node.classList.contains('nav_prev') || node.classList.contains('nav_next')) {
                                    translateSamPagination(document);
                                    return;
                                }
                            }
                        }
                    }
                }
            });

            if (document.body) {
                pageObserver.observe(document.body, { childList: true, subtree: true });
                log('  分页 MutationObserver 已启动');
            }

            // ---- 9. Filter Prefix / Accordion 动态加载监听 ----
            var filterPrefixObserver = new MutationObserver(function(mutations) {
                var shouldTranslate = false;
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.type === 'childList' && m.addedNodes.length > 0) {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var node = m.addedNodes[j];
                            if (node.nodeType !== 1) continue;
                            if (node.querySelectorAll) {
                                if (node.querySelector('.accordion-toggle') ||
                                    node.querySelector('.filter-block_button')) {
                                    shouldTranslate = true;
                                    break;
                                }
                            }
                            if (node.classList && (
                                node.classList.contains('accordion-toggle') ||
                                node.classList.contains('filter-block_button'))) {
                                shouldTranslate = true;
                                break;
                            }
                        }
                    }
                    if (shouldTranslate) break;
                }
                if (shouldTranslate) {
                    log('  [FilterPrefixObserver] 检测到动态内容，重新翻译');
                    var accordionMap = DICT.sam_accordion_match || {};
                    translateByTextMatch(accordionMap, '.accordion-toggle');
                    translateLabels(document, DICT.labels, '.filter-block_button, .filter-block_button-label');
                    translatePlaceholders(DICT.sam_placeholders || {});
                    translateSamTooltips(document);
                }
            });

            if (document.body) {
                filterPrefixObserver.observe(document.body, { childList: true, subtree: true });
                log('  Filter Prefix MutationObserver 已启动');
            }

            // ---- 10. Settings 面板动态出现监听 ----
            var settingsObserver = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.type === 'childList') {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var node = m.addedNodes[j];
                            if (node.nodeType === 1 && (
                                (node.id === 'latest-page_options-panel') ||
                                (node.querySelectorAll && node.querySelector('#latest-page_options-panel'))
                            )) {
                                log('  [SettingsObserver] 检测到 Settings 面板插入');
                                translateSamSettings();
                                return;
                            }
                        }
                    }
                }
            });

            if (document.body) {
                settingsObserver.observe(document.body, { childList: true, subtree: true });
                log('  Settings MutationObserver 已启动');
            }

            // ---- 11. Settings info 文本覆盖监听（SAM 异步覆盖翻译文本后重新翻译） ----
            var settingsInfoObserver = new MutationObserver(function(mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.type === 'characterData') {
                        var parent = m.target.parentElement;
                        if (parent && parent.id === 'options-panel_item-btns-info') {
                            log('  [SettingsInfoObserver] 检测到 info 文本被覆盖');
                            translateSamSettings();
                            return;
                        }
                    } else if (m.type === 'childList') {
                        for (var j = 0; j < m.addedNodes.length; j++) {
                            var node = m.addedNodes[j];
                            if (node.nodeType === 3 && node.parentElement && node.parentElement.id === 'options-panel_item-btns-info') {
                                log('  [SettingsInfoObserver] 检测到 info 文本节点被替换');
                                translateSamSettings();
                                return;
                            }
                        }
                    }
                }
            });

            var infoEl = document.querySelector('#options-panel_item-btns-info');
            if (infoEl) {
                settingsInfoObserver.observe(infoEl, { characterData: true, childList: true, subtree: true });
                log('  Settings Info Observer 已启动 (直接监听 #options-panel_item-btns-info)');
            } else if (document.body) {
                // info 元素可能尚未创建，先监听 body 等待其出现
                var infoParentObserver = new MutationObserver(function(mutations) {
                    var el = document.querySelector('#options-panel_item-btns-info');
                    if (el) {
                        infoParentObserver.disconnect();
                        settingsInfoObserver.observe(el, { characterData: true, childList: true, subtree: true });
                        log('  Settings Info Observer 已启动 (延迟绑定)');
                    }
                });
                infoParentObserver.observe(document.body, { childList: true, subtree: true });
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onSamReady);
        } else {
            onSamReady();
        }
    }

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
