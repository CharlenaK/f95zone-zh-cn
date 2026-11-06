#!/usr/bin/env node
/**
 * 以 f95_dict.json 为唯一数据源，校验并同步脚本内置的 DEFAULT_DICT。
 *
 *   node tools/sync-dict.mjs            # 校验后写入脚本
 *   node tools/sync-dict.mjs --check    # 只校验（CI / 提交前用）
 *   node tools/sync-dict.mjs --validate # 只做字典质量检查
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dictPath = join(root, 'f95_dict.json');
const scriptPath = join(root, 'f95_script.user.js');

const dictText = readFileSync(dictPath, 'utf8');
const dict = JSON.parse(dictText);
const script = readFileSync(scriptPath, 'utf8');

// ==================== 校验 ====================

const errors = [];
const warnings = [];

function fail(message) {
    errors.push(message);
}

function warn(message) {
    warnings.push(message);
}

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function checkStringMap(name, obj, required = false) {
    if (obj === undefined) {
        if (required) fail(`${name}: 缺失`);
        return;
    }
    if (!isPlainObject(obj)) {
        fail(`${name}: 应为对象`);
        return;
    }
    const keys = Object.keys(obj);
    if (!keys.length && required) fail(`${name}: 不能为空`);
    keys.forEach((key) => {
        const value = obj[key];
        if (!key.trim()) fail(`${name}: 存在空键`);
        if (typeof value !== 'string') fail(`${name}.${key}: 译文应为字符串`);
        else if (!value.trim() && !key.startsWith('_')) fail(`${name}.${key}: 译文为空`);
    });
}

function checkStringArray(name, arr, required = false) {
    if (arr === undefined) {
        if (required) fail(`${name}: 缺失`);
        return;
    }
    if (!Array.isArray(arr)) {
        fail(`${name}: 应为数组`);
        return;
    }
    arr.forEach((item, i) => {
        if (typeof item !== 'string' || !item.trim()) fail(`${name}[${i}]: 应为非空字符串`);
    });
}

/**
 * 扫描器：定位 JSON 文本中的重复键。
 * JSON.parse 会静默保留最后一个重复键，必须单独检查。
 */
function findDuplicateKeys(text) {
    let i = 0;
    const dups = [];
    const path = [];

    function ws() {
        while (i < text.length && /\s/.test(text[i])) i++;
    }

    function str() {
        const start = i;
        i++;
        while (i < text.length) {
            const c = text[i];
            if (c === '\\') { i += 2; continue; }
            if (c === '"') {
                i++;
                return JSON.parse(text.slice(start, i));
            }
            i++;
        }
        throw new Error('未闭合的字符串');
    }

    function value() {
        ws();
        const c = text[i];
        if (c === '{') return object();
        if (c === '[') return array();
        if (c === '"') return str();
        while (i < text.length && !/[,}\]]/.test(text[i])) i++;
    }

    function object() {
        i++;
        const keys = new Set();
        ws();
        if (text[i] === '}') { i++; return; }
        for (;;) {
            ws();
            if (text[i] !== '"') throw new Error(`期望对象键 @${i}`);
            const key = str();
            if (keys.has(key)) dups.push(path.concat(key).join('.') || key);
            keys.add(key);
            ws();
            if (text[i] !== ':') throw new Error(`期望冒号 @${i}`);
            i++;
            path.push(key);
            value();
            path.pop();
            ws();
            if (text[i] === ',') { i++; continue; }
            if (text[i] === '}') { i++; return; }
            throw new Error(`对象结构异常 @${i}`);
        }
    }

    function array() {
        i++;
        path.push('[]');
        ws();
        if (text[i] === ']') { i++; path.pop(); return; }
        for (;;) {
            value();
            ws();
            if (text[i] === ',') { i++; continue; }
            if (text[i] === ']') { i++; path.pop(); return; }
            throw new Error(`数组结构异常 @${i}`);
        }
    }

    value();
    ws();
    if (i !== text.length) throw new Error(`JSON 尾部存在多余内容 @${i}`);
    return dups;
}

const DANGEROUS_HTML = /<\s*(script|iframe|img|object|embed|svg|form|input|link|meta|video|audio)\b/i;
const EVENT_HANDLER = /\son[a-z]+\s*=/i;
const JAVASCRIPT_URL = /javascript\s*:/i;

function scanUnsafeStrings(value, path, skipKeys) {
    if (typeof value === 'string') {
        if (DANGEROUS_HTML.test(value) || EVENT_HANDLER.test(value) || JAVASCRIPT_URL.test(value)) {
            fail(`${path}: 含不允许的 HTML/URL（script/img/on*/javascript:），请改用白名单内的行内标签`);
        }
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, i) => scanUnsafeStrings(item, `${path}[${i}]`, skipKeys));
        return;
    }
    if (isPlainObject(value)) {
        Object.keys(value).forEach((key) => {
            if (key.startsWith('_') || skipKeys.has(key)) return;
            scanUnsafeStrings(value[key], path ? `${path}.${key}` : key, skipKeys);
        });
    }
}

function validateDict() {
    // 1) 重复键
    let dups = [];
    try {
        dups = findDuplicateKeys(dictText);
    } catch (e) {
        fail(`重复键扫描失败: ${e.message}`);
    }
    dups.forEach((d) => fail(`重复键: ${d}`));

    // 2) 基本结构
    if (!Number.isInteger(dict.version) || dict.version <= 0) {
        fail('version: 应为正整数');
    }
    if (!isPlainObject(dict.xenforo)) {
        fail('xenforo: 缺失或不是对象');
    } else {
        checkStringMap('xenforo', dict.xenforo, true);
        Object.keys(dict.xenforo).forEach((selector) => {
            if (!selector.trim()) fail('xenforo: 存在空选择器');
        });
    }

    [
        'xenforo_time_phrases', 'xenforo_forum_names', 'xenforo_node_descriptions',
        'xenforo_buttons', 'xenforo_placeholders', 'xenforo_node_stats_dt',
        'xenforo_thread_statuses', 'xenforo_thread_meta_dt',
        'xenforo_thread_list_separators', 'xenforo_tooltips',
        'xenforo_dataList_headers', 'xenforo_footer_links',
        'xenforo_footer_stats_dt', 'xenforo_member_tooltip',
        'xenforo_member_tooltip_activity', 'labels', 'sam_static',
        'sam_placeholders', 'sam_accordion_match', 'sam_toggle_match',
        'sam_tags', 'sam_tooltips', 'sam_settings', 'sam_slider_map',
        'sam_result_text', 'reaction_texts', 'ui_strings',
        'xenforo_filter_optgroups', 'xenforo_ui_text', 'xenforo_ui_attrs'
    ].forEach((name) => checkStringMap(name, dict[name]));

    [
        'xenforo_filter_menu', 'xenforo_filter_options', 'thread_fields',
        'xenforo_overlays', 'f95_modules'
    ].forEach((name) => {
        if (dict[name] !== undefined && !isPlainObject(dict[name])) {
            fail(`${name}: 应为对象`);
        }
    });

    ['xenforo_thread_ignore', 'xenforo_thread_na', 'xenforo_thread_votes_suffix',
        'xenforo_thread_stars_suffix', 'xenforo_footer_extra'].forEach((name) => {
        if (dict[name] !== undefined && typeof dict[name] !== 'string') {
            fail(`${name}: 应为字符串`);
        }
    });

    checkStringArray('sam_css_pseudo', dict.sam_css_pseudo);

    if (dict.xenforo_regex !== undefined) {
        if (!Array.isArray(dict.xenforo_regex)) {
            fail('xenforo_regex: 应为数组');
        } else {
            dict.xenforo_regex.forEach((item, i) => {
                if (!isPlainObject(item)) { fail(`xenforo_regex[${i}]: 应为对象`); return; }
                ['selector', 'pattern', 'replacement'].forEach((key) => {
                    if (typeof item[key] !== 'string' || !item[key]) {
                        fail(`xenforo_regex[${i}].${key}: 应为非空字符串`);
                    }
                });
                if (typeof item.pattern === 'string') {
                    try { new RegExp(item.pattern); }
                    catch (e) { fail(`xenforo_regex[${i}].pattern: 正则无效 — ${e.message}`); }
                }
            });
        }
    }

    if (dict.xenforo_attr_regex !== undefined) {
        if (!Array.isArray(dict.xenforo_attr_regex)) {
            fail('xenforo_attr_regex: 应为数组');
        } else {
            dict.xenforo_attr_regex.forEach((item, i) => {
                if (!isPlainObject(item)) { fail(`xenforo_attr_regex[${i}]: 应为对象`); return; }
                ['selector', 'attr', 'pattern', 'replacement'].forEach((key) => {
                    if (typeof item[key] !== 'string' || !item[key]) {
                        fail(`xenforo_attr_regex[${i}].${key}: 应为非空字符串`);
                    }
                });
                if (typeof item.pattern === 'string') {
                    try { new RegExp(item.pattern); }
                    catch (e) { fail(`xenforo_attr_regex[${i}].pattern: 正则无效 — ${e.message}`); }
                }
            });
        }
    }

    if (dict.xenforo_scoped_text !== undefined) {
        if (!Array.isArray(dict.xenforo_scoped_text)) {
            fail('xenforo_scoped_text: 应为数组');
        } else {
            dict.xenforo_scoped_text.forEach((item, i) => {
                if (!isPlainObject(item)) { fail(`xenforo_scoped_text[${i}]: 应为对象`); return; }
                if (typeof item.selector !== 'string' || !item.selector) {
                    fail(`xenforo_scoped_text[${i}].selector: 应为非空字符串`);
                }
                if (!isPlainObject(item.map)) {
                    fail(`xenforo_scoped_text[${i}].map: 应为对象`);
                } else {
                    checkStringMap(`xenforo_scoped_text[${i}].map`, item.map, true);
                }
            });
        }
    }

    if (dict.thread_fields !== undefined) {
        checkStringMap('thread_fields.labels', dict.thread_fields.labels, true);
        ['censored_values', 'os_values', 'language_values'].forEach((key) => {
            checkStringMap(`thread_fields.${key}`, dict.thread_fields[key]);
        });
        if (dict.thread_fields.download !== undefined && typeof dict.thread_fields.download !== 'string') {
            fail('thread_fields.download: 应为字符串');
        }
    }

    if (dict.f95_modules !== undefined) {
        ['nav', 'stats_tabs', 'thread_tools_groups', 'thread_meta', 'trending'].forEach((key) => {
            checkStringMap(`f95_modules.${key}`, dict.f95_modules[key]);
        });
    }

    // 3) 危险 HTML / 事件属性（跳过 CSS 与正则 pattern）
    scanUnsafeStrings(dict, '', new Set(['pattern', 'sam_css_pseudo']));

    // 4) 统计信息
    const groupCount = Object.keys(dict).filter((k) => !k.startsWith('_')).length;
    const selectorCount = isPlainObject(dict.xenforo) ? Object.keys(dict.xenforo).length : 0;
    console.log(`字典 v${dict.version}: ${groupCount} 个顶层分组，xenforo ${selectorCount} 条选择器`);

    if (warnings.length) {
        console.log(`\n⚠ ${warnings.length} 条警告:`);
        warnings.forEach((w) => console.log('  - ' + w));
    }
    if (errors.length) {
        console.error(`\n✗ ${errors.length} 个错误:`);
        errors.forEach((e) => console.error('  - ' + e));
        return false;
    }
    console.log('✓ 字典校验通过');
    return true;
}

if (!validateDict()) {
    process.exit(2);
}
if (process.argv.includes('--validate')) {
    process.exit(0);
}

// ==================== 同步 ====================

const blockRe = /^    var DEFAULT_DICT = (\{[\s\S]*?\n    \});/m;
const match = script.match(blockRe);
if (!match) {
    console.error('未找到 DEFAULT_DICT 块，脚本格式可能已变化。');
    process.exit(2);
}

let embedded = null;
try {
    embedded = JSON.parse(match[1]);
} catch (e) {
    console.error('内置 DEFAULT_DICT 不是合法 JSON：' + e.message);
    process.exit(2);
}

const equal = JSON.stringify(embedded) === JSON.stringify(dict);
if (process.argv.includes('--check')) {
    if (!equal) {
        console.error('✗ f95_dict.json 与脚本内置 DEFAULT_DICT 不一致，请运行 node tools/sync-dict.mjs');
        process.exit(1);
    }
    console.log(`✓ 字典已同步（version ${dict.version}）`);
    process.exit(0);
}

const json = JSON.stringify(dict, null, 4);
const lines = json.split('\n');
const indented = lines[0] + '\n' + lines.slice(1).map((line) => '    ' + line).join('\n');
const replacement = `    var DEFAULT_DICT = ${indented};`;
// 用函数形式替换：字典字符串里可能包含 $1 等字符，直接传字符串会被当作替换模式
const next = script.replace(blockRe, () => replacement);

if (next === script) {
    console.log(`已是最新（version ${dict.version}）`);
} else {
    writeFileSync(scriptPath, next, 'utf8');
    console.log(`✓ 已同步 DEFAULT_DICT（version ${dict.version}）`);
}
