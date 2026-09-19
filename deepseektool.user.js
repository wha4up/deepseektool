// ==UserScript==
// @name         DeepSeek 功能增强工具箱
// @namespace    https://github.com/Chuc-Jie/deepseektool
// @version      4.9.2
// @description  一站式管理：代码块折叠、表格优化导出、自动折叠AI思考过程、对话文件夹分组。所有设置即时生效，选择器全面加固。
// @tag          工具
// @tag          优化
// @tag          DeepSeek
// @author       友野YouyEr
// @icon         https://fe-static.deepseek.com/chat/favicon.svg
// @match        https://chat.deepseek.com/*
// @match        https://www.deepseek.com/*
// @match        https://deepseek.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ==================== 存储键与全局变量 ====================
    const STORAGE_FOLD_THRESHOLD = 'deepseek_fold_threshold';
    const STORAGE_PREVIEW_LINES = 'deepseek_fold_preview_lines';
    const STORAGE_TABLE_BUTTONS_ENABLED = 'deepseek_table_buttons_enabled';
    const STORAGE_TABLE_BUTTONS_ALWAYS = 'deepseek_table_buttons_always';  // 导出按钮恒定显示（默认关）
    const STORAGE_EXPORT_KEEP_CITES = 'deepseek_export_keep_cites';        // 导出保留引用角标（默认保留）
    const STORAGE_TABLE_THEME_MODE = 'deepseek_table_theme_mode';
    const STORAGE_TABLE_WIDTH_MODE = 'deepseek_table_width_mode';
    const STORAGE_WIDE_SCREEN = 'deepseek_wide_screen';
    const STORAGE_FOLDER_MANAGER = 'deepseek_folder_manager_enabled';   // 对话文件夹管理总开关（默认关）
    const STORAGE_FOLDER_DATA = 'deepseek_folder_manager_data_v2';      // 文件夹+归属数据（新键，不与旧独立脚本互相干扰）
    const STORAGE_CTRL_ENTER = 'deepseek_ctrl_enter';                   // 发送快捷键：Ctrl+Enter（默认关）
    const STORAGE_PIN_COLLAPSED = 'deepseek_pin_group_collapsed';       // 原生「置顶」分组折叠态（默认展开）
    const STORAGE_PIN_COLLAPSIBLE = 'deepseek_pin_group_collapsible';   // 原生「置顶」分组折叠能力开关（默认关，opt-in）
    const STORAGE_SHOW_CTRL_ENTER_BTN = 'deepseek_show_ctrl_enter_btn'; // 页面「快捷键修改」按钮（默认显示）
    const STORAGE_THINK_PREVIEW_HEIGHT = 'deepseek_think_preview_height'; // 预览窗口最高高度（px）
    // 思维链显示方式（三态，一个键）：preview = 定高预览窗口 / hidden = 只显示标题行 / native = 交还原生
    const STORAGE_THINK_DISPLAY = 'deepseek_think_display_mode';
    // 窗口定高的完整表达式：下限 80px（再矮就看不出在滚内容）与上限 500px（这窗口只用于「概览 + 表示
    // 还在跑」，不是阅读器；完整查看点标题行走原生展开）都交给 CSS 渲染；JS 只做输入夹取（80–500，见
    // createNumberSetting 的调用参数），不随视口变化。CSS 与内联双路共用这一份字面量。
    const MAX_THINK_PREVIEW_PX = 500;
    const THINK_PREVIEW_MAX_H = `clamp(80px, var(--ds-think-preview-height, 200px), ${MAX_THINK_PREVIEW_PX}px)`;
    const STORAGE_THINK_PREVIEW_MIN = 'deepseek_think_preview_min';       // 预览最小高度阈值：正文低于它不套预览（0 = 禁用）

    let foldThreshold = GM_getValue(STORAGE_FOLD_THRESHOLD, 20);
    let previewLines = GM_getValue(STORAGE_PREVIEW_LINES, 0);
    let enablePreviewLines = previewLines > 0;
    let tableButtonsEnabled = GM_getValue(STORAGE_TABLE_BUTTONS_ENABLED, true);
    let tableButtonsAlways = GM_getValue(STORAGE_TABLE_BUTTONS_ALWAYS, false);  // 导出按钮恒定常显（默认关）
    let keepExportCites = GM_getValue(STORAGE_EXPORT_KEEP_CITES, true);         // 导出保留引用（默认保留）
    let tableThemeMode = GM_getValue(STORAGE_TABLE_THEME_MODE, 'auto');
    let tableWidthMode = GM_getValue(STORAGE_TABLE_WIDTH_MODE, 'equal');
    let wideScreen = GM_getValue(STORAGE_WIDE_SCREEN, false);
    let folderManagerEnabled = GM_getValue(STORAGE_FOLDER_MANAGER, false);  // 对话文件夹管理（默认关，opt-in）
    let ctrlEnterEnabled = GM_getValue(STORAGE_CTRL_ENTER, false);          // Ctrl+Enter 发送（默认关，opt-in）
    let pinGroupCollapsible = GM_getValue(STORAGE_PIN_COLLAPSIBLE, false);  // 置顶分组可折叠（默认关，opt-in）
    let showCtrlEnterBtn = GM_getValue(STORAGE_SHOW_CTRL_ENTER_BTN, true);   // 页面快捷键修改按钮（默认显示）
    // 一个键 + 一个默认值（单位一度改成 dvh 又改回 px；存储里遗留的 *_dvh 键不再读写，无害）
    let thinkPreviewHeight = GM_getValue(STORAGE_THINK_PREVIEW_HEIGHT, 200); // 预览窗口最高高度（px；0 按 CSS 下限 80px 处理）
    // 显示方式默认值：高度为 0 视为「交还原生」，否则「定高预览窗口」
    let thinkDisplayMode = GM_getValue(STORAGE_THINK_DISPLAY, thinkPreviewHeight > 0 ? 'preview' : 'native');
    let thinkPreviewMinHeight = GM_getValue(STORAGE_THINK_PREVIEW_MIN, 300); // 预览最小高度阈值（px）：正文低于它不显示预览窗口

    const btnTextFold = '折叠';
    const btnTextUnfold = '展开';

    // ==================== SVG 图标 (代码块折叠) ====================
    const ICON_CHEVRON_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" fill="currentColor"><path d="M297.4 470.6C309.9 483.1 330.2 483.1 342.7 470.6L534.7 278.6C547.2 266.1 547.2 245.8 534.7 233.3C522.2 220.8 501.9 220.8 489.4 233.3L320 402.7L150.6 233.4C138.1 220.9 117.8 220.9 105.3 233.4C92.8 245.9 92.8 266.2 105.3 278.7L297.3 470.7z"/></svg>`;
    const ICON_CHEVRON_UP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="20" height="20" fill="currentColor"><path d="M297.4 169.4C309.9 156.9 330.2 156.9 342.7 169.4L534.7 361.4C547.2 373.9 547.2 394.2 534.7 406.7C522.2 419.2 501.9 419.2 489.4 406.7L320 237.3L150.6 406.6C138.1 419.1 117.8 419.1 105.3 406.6C92.8 394.1 92.8 373.8 105.3 361.3L297.3 169.3z"/></svg>`;

    // 回车键图标（用于「快捷键修改」按钮）
    const ICON_ENTER_KEY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="16" height="16" style="width:16px;height:16px;flex:0 0 auto;"><g fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"><path d="M44 44V4H24v16H4v24z"/><path d="m21 28l-4 4l4 4"/><path d="M34 23v9H17"/></g></svg>`;

    // ==================== 通用 Toast ====================
    function showToast(message, duration = 2000) {
        const existingToast = document.getElementById('ds-fold-toast');
        if (existingToast) existingToast.remove();
        const toast = document.createElement('div');
        toast.id = 'ds-fold-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); color: white;
            padding: 10px 20px; border-radius: 8px; font-size: 14px;
            font-family: system-ui, -apple-system, sans-serif; z-index: 10001;
            opacity: 0; transition: opacity 0.2s; pointer-events: none; white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.style.opacity = '1', 10);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 200); }, duration);
    }

    // ==================== 发送快捷键：Ctrl+Enter 发送 / Enter 换行（可开关，默认关） ====================
    // 来自社区 PR（wha4up）并在 v4.7.0 复核。DeepSeek 原生为“Enter 发送、Shift+Enter 换行”；
    // 开启后：纯 Enter → stopPropagation 让官方改用“仅换行”；Ctrl/Cmd+Enter → 以不带修饰的 Enter 事件
    // 再次触发，让官方按 Enter(发送/换行)处理，从而在打字区按【Ctrl+Enter】等效发送。
    let _supressNextEnter = false;
    document.addEventListener('keydown', (e) => {
        if (!ctrlEnterEnabled) return;
        if (e.target && e.target.tagName !== 'TEXTAREA') return;
        // 中文输入法选字时的 Enter（isComposing / keyCode 229）是确认候选词，必须放行
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key !== 'Enter') return;
        // Ctrl/Cmd+Shift+Enter 属「切换发送模式」，不参与发送/换行（同节点捕获阶段拦不住另一个监听器）
        if (e.shiftKey && (e.ctrlKey || e.metaKey)) return;
        if (_supressNextEnter) { _supressNextEnter = false; return; }
        if (e.ctrlKey || e.metaKey) {
            // Ctrl/Cmd+Enter → 视同 Enter（发送/换行取决于表单当前语义），不携带 ctrl/meta
            e.preventDefault();
            e.stopPropagation();
            _supressNextEnter = true;
            e.target.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
                bubbles: true, cancelable: true, composed: true,
                ctrlKey: false, metaKey: false, shiftKey: false,
            }));
        } else if (!e.shiftKey) {
            // 开启模式下把“纯 Enter”改视为换行，不再发送
            e.stopPropagation();
        }
        // Shift+Enter 保持原生语义（换行）不做拦截
    }, true);
    // ==================== 统一控制面板 ====================
    function openControlPanel() {
        const existingOverlay = document.getElementById('ds-control-panel-overlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ds-control-panel-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.45); backdrop-filter: blur(6px);
            z-index: 10001; display: flex; align-items: center; justify-content: center;
        `;

        const panel = document.createElement('div');
        panel.className = 'ds-panel';

        /* ===== 左侧导航 ===== */
        const sidebar = document.createElement('aside');
        sidebar.className = 'ds-p-sidebar';

        const NAV_ITEMS = [
            { key: 'fold', icon: 'code-tags', label: '代码块折叠' },
            { key: 'table', icon: 'table-large', label: '表格优化导出' },
            { key: 'thinking', icon: 'brain', label: 'AI 思考预览' },
            { key: 'wide', icon: 'monitor', label: '宽屏模式' },
            { key: 'chat', icon: 'send', label: '聊天增强' },
            { key: 'folder', icon: 'folder-outline', label: '对话文件夹' },
        ];
        const NAV_EXTRA = [
            { key: 'help', icon: 'help-circle-outline', label: '帮助中心' },
            { key: 'about', icon: 'information-outline', label: '关于' },
        ];

        // iconify 图标：左侧导航 / logo（深蓝底固定亮色）；右侧标题需随主题取色
        const ICON_HOST = 'https://api.iconify.design/mdi:';
        const isPanelDark = () => document.body.classList.contains('dark');
        const mdiNavUrl = (name) => ICON_HOST + name + '.svg?color=%23e6eaf2';
        const mdiHeadUrl = (name) => ICON_HOST + name + '.svg?color=' + (isPanelDark() ? '%23e4e4e8' : '%231e293b');
        function makeIconImg(name, cls, url) {
            const im = document.createElement('img');
            im.className = cls; im.src = url(name); im.alt = '';
            im.draggable = false;
            return im;
        }

        // 外链卡片（帮助/关于页）：整卡可点跳外链，target=_blank
        function createLinkCard(title, desc, href, iconName) {
            const a = document.createElement('a');
            a.className = 'ds-link-card';
            a.href = href;
            a.target = '_blank';
            a.rel = 'noopener';
            a.appendChild(makeIconImg(iconName, 'ds-link-card-ic', mdiHeadUrl));
            const tx = document.createElement('span');
            tx.className = 'ds-link-card-tx';
            const t = document.createElement('span');
            t.className = 'ds-link-card-title';
            t.textContent = title;
            tx.appendChild(t);
            if (desc) {
                const d = document.createElement('span');
                d.className = 'ds-link-card-desc';
                d.textContent = desc;
                tx.appendChild(d);
            }
            a.appendChild(tx);
            return a;
        }
        function createLinkCardGrid(cards) {
            const g = document.createElement('div');
            g.className = 'ds-link-grid';
            cards.forEach(c => g.appendChild(c));
            return g;
        }

        const logo = document.createElement('div');
        logo.className = 'ds-p-logo';
        const logoIc = document.createElement('span');
        logoIc.className = 'ds-p-logo-ic';
        logoIc.appendChild(makeIconImg('cog', 'ds-p-logo-ic-img', mdiNavUrl));
        const logoTx = document.createElement('div');
        logoTx.className = 'ds-p-logo-tx';
        logoTx.innerHTML = '<div class="ds-p-logo-t">脚本设置</div><div class="ds-p-logo-s">DeepSeek 功能增强工具箱</div>';
        logo.appendChild(logoIc);
        logo.appendChild(logoTx);
        sidebar.appendChild(logo);

        const navBtns = [];
        function renderNav(items) {
            items.forEach(item => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ds-p-nav';
                btn.dataset.target = item.key;
                const ind = document.createElement('span');
                ind.className = 'ds-p-nav-ind';
                const bd = document.createElement('span');
                bd.className = 'ds-p-nav-bd';
                bd.appendChild(makeIconImg(item.icon, 'ds-p-nav-ic', mdiNavUrl));
                const lab = document.createElement('span');
                lab.className = 'ds-p-nav-label';
                lab.textContent = item.label;
                bd.appendChild(lab);
                btn.appendChild(ind);
                btn.appendChild(bd);
                sidebar.appendChild(btn);
                navBtns.push(btn);
            });
        }
        renderNav(NAV_ITEMS);
        const navDivider = document.createElement('div');
        navDivider.className = 'ds-p-nav-divider';
        sidebar.appendChild(navDivider);
        renderNav(NAV_EXTRA);
        panel.appendChild(sidebar);

        /* ===== 右侧主区 ===== */
        const main = document.createElement('div');
        main.className = 'ds-p-main';

        const topbar = document.createElement('div');
        topbar.className = 'ds-p-topbar';
        const closeX = document.createElement('button');
        closeX.type = 'button';
        closeX.className = 'ds-p-close';
        closeX.textContent = '✕';
        closeX.setAttribute('aria-label', '关闭设置');
        closeX.addEventListener('click', () => overlay.remove());
        topbar.appendChild(closeX);
        main.appendChild(topbar);

        const scroll = document.createElement('div');
        scroll.className = 'ds-p-scroll';

        /* ===== 分区定义（控件工厂返回完整行式 .ds-setting-item） ===== */
        const sections = [
            { key: 'fold', icon: 'code-tags', title: '代码块折叠', sub: '长代码自动收起，随手展开', build: () => [
                createNumberSetting('自动折叠阈值', '代码行数超过该值时自动折叠（0 = 禁用）', '行', foldThreshold, value => {
                    foldThreshold = value;
                    GM_setValue(STORAGE_FOLD_THRESHOLD, value);
                    safeRun(reapplyFoldToAllCodeBlocks, '代码块折叠重应用');
                    showToast(`折叠阈值已更新为 ${value === 0 ? '关闭' : value}`);
                }),
                createNumberSetting('折叠预览行数', '折叠后显示的行数（0 = 完全隐藏）', '行', previewLines, value => {
                    previewLines = value;
                    enablePreviewLines = value > 0;
                    GM_setValue(STORAGE_PREVIEW_LINES, value);
                    safeRun(reapplyFoldToAllCodeBlocks, '代码块折叠重应用');
                    showToast(`预览行数已更新为 ${value === 0 ? '关闭（完全隐藏）' : value}`);
                }),
            ] },
            { key: 'table', icon: 'table-large', title: '表格优化导出', sub: '宽度修复 · 主题配色 · PNG / CSV / Markdown 导出', build: () => [
                createToggleSetting('表格导出按钮', '悬停表格时在右下角显示 PNG / CSV / Markdown 导出按钮；点 × 可临时隐藏（移出表格后恢复）', tableButtonsEnabled, checked => {
                    tableButtonsEnabled = checked;
                    GM_setValue(STORAGE_TABLE_BUTTONS_ENABLED, checked);
                    toggleTableButtons(checked);
                    showToast(`表格导出按钮已${checked ? '开启' : '关闭'}`);
                }),
                createToggleSetting('持续显示导出按钮', '无需悬停，表格上的导出按钮始终可见（需上一项开启）', tableButtonsAlways, checked => {
                    tableButtonsAlways = checked;
                    GM_setValue(STORAGE_TABLE_BUTTONS_ALWAYS, checked);
                    setTableButtonsAlways(checked);
                    showToast(`导出按钮已改为${checked ? '常显' : '悬停显示'}`);
                }),
                createToggleSetting('导出保留引用链接', 'Markdown / CSV 导出保留表格引用角标（还原成「数字 + 地址」）；关闭则去掉（图片导出不含）', keepExportCites, checked => {
                    keepExportCites = checked;
                    GM_setValue(STORAGE_EXPORT_KEEP_CITES, checked);
                    showToast(`导出已${checked ? '保留' : '不保留'}引用链接`);
                }),
                createSelectSetting('表格主题适配', '自动：半透明叠加色通用 · 双模式：浅色/深色各自优化', [
                    { value: 'auto', label: '自动适应（透明叠加）' },
                    { value: 'dual', label: '双模式（浅色 / 深色）' },
                ], tableThemeMode, value => {
                    tableThemeMode = value;
                    GM_setValue(STORAGE_TABLE_THEME_MODE, value);
                    applyTableThemeClass(value);
                    showToast(`表格主题已切换为${value === 'auto' ? '自动适应' : '双模式'}`);
                }),
                createSelectSetting('表格列宽策略', '均分：等宽 · 自适应：按内容比例 · 均分+保护：等宽且不低于 80px', [
                    { value: 'equal', label: '均分列宽' },
                    { value: 'auto', label: '自适应（内容比例）' },
                    { value: 'equal-minwidth', label: '均分 + 最小宽度保护' },
                ], tableWidthMode, value => {
                    tableWidthMode = value;
                    GM_setValue(STORAGE_TABLE_WIDTH_MODE, value);
                    document.querySelectorAll('.ds-markdown table').forEach(t => applyTableStyles(t));
                    showToast('列宽策略已切换');
                }),
            ] },
            { key: 'thinking', icon: 'brain', title: 'AI 思考折叠', sub: '思维链显示方式 · 只显示标题行 / 预览窗口 / 原生', build: () => {
                const inPreview = thinkDisplayMode === 'preview';
                // 切开关就地刷新（重开面板会「关掉再弹出」，很跳）：两个开关互斥 + 两个数字项置灰
                const rows = [];
                const sync = () => {
                    const off = thinkDisplayMode !== 'preview';
                    rows.forEach(row => {
                        const box = row.querySelector('input');
                        const mode = row.dataset.dsThinkMode;
                        if (mode) { if (box) box.checked = (thinkDisplayMode === mode); return; }
                        row.classList.toggle('dsDisabled', off);
                        row.setAttribute('aria-disabled', String(off));
                        if (box) box.disabled = off;
                    });
                };
                const modeRow = (label, desc, mode) => {
                    const row = createToggleSetting(label, desc, thinkDisplayMode === mode, checked => {
                        setThinkDisplayMode(checked ? mode : 'native');
                        sync();
                    });
                    row.dataset.dsThinkMode = mode;
                    rows.push(row);
                    return row;
                };
                rows.push(modeRow('只显示标题行', '正文完全隐藏，只留标题行（含「思考中 / 已思考」文案）；点标题行仍可展开', 'hidden'));
                rows.push(modeRow('定高预览窗口', '思维链收进定高窗口（可滚动查看），点标题行完全展开', 'preview'));
                rows.push(createNumberSetting('预览最小高度阈值', '思维链总高超过该值时显示预览窗口（0 = 任何长度都显示）', 'px', thinkPreviewMinHeight, value => {
                    thinkPreviewMinHeight = value;
                    GM_setValue(STORAGE_THINK_PREVIEW_MIN, value);
                    safeRun(applyThinkPreviewHeight, '思考预览定高重应用');
                    showToast(`预览最小高度阈值已更新为 ${value}px`);
                }, 0, !inPreview));
                rows.push(createNumberSetting('思考预览最高高度', `预览窗口的最高高度（有效范围 80–${MAX_THINK_PREVIEW_PX}px）`, 'px', thinkPreviewHeight, value => {
                    thinkPreviewHeight = value;
                    GM_setValue(STORAGE_THINK_PREVIEW_HEIGHT, value);
                    safeRun(applyThinkPreviewHeight, '思考预览定高重应用');
                    showToast(`思考预览最高高度已更新为 ${value}px`);
                }, MAX_THINK_PREVIEW_PX, !inPreview, 80));
                return rows;
            } },
            { key: 'wide', icon: 'monitor', title: '宽屏模式', sub: '消息区扩展至全宽，减少左右留白', build: () => [
                createToggleSetting('启用宽屏布局', '消息区扩展至全宽，减少左右留白', wideScreen, checked => {
                    wideScreen = checked;
                    GM_setValue(STORAGE_WIDE_SCREEN, checked);
                    applyWideScreen(checked);
                    showToast(`宽屏模式已${checked ? '开启' : '关闭'}`);
                }),
            ] },
            { key: 'chat', icon: 'send', title: '聊天发送', sub: '回车发送与快捷键', build: () => [
                // 与输入框切换按钮复用同一个设置入口 setCtrlEnterMode，不重复实现（避免逻辑分叉）
                createToggleSetting('Ctrl+Enter 发送', '改为 Ctrl+Enter 发送、Enter 换行；关闭时恢复官方（Enter 发送 / Shift+Enter 换行）', ctrlEnterEnabled, setCtrlEnterMode),
                createToggleSetting('输入框显示切换按钮', '在发送按钮上显示切换入口：点击即切换发送模式（也可用 Ctrl+Shift+Enter），并能一眼看出当前处于哪种模式；输入框有内容时自动隐藏', showCtrlEnterBtn, checked => {
                    showCtrlEnterBtn = checked;
                    GM_setValue(STORAGE_SHOW_CTRL_ENTER_BTN, checked);
                    syncCtrlEnterBtn();
                    showToast(`输入框切换按钮已${checked ? '显示' : '隐藏'}`);
                }),
            ] },
            { key: 'folder', icon: 'folder-outline', title: '对话文件夹', sub: '左侧历史栏分组管理（可选模块）', build: () => [
                createToggleSetting('启用文件夹分组', '在左侧对话历史栏加入「文件夹」分组面板，可通过会话 ⋯ 菜单移入/移出；关闭即整体移除（含已应用的分组/标签）', folderManagerEnabled, checked => {
                    folderManagerEnabled = checked;
                    GM_setValue(STORAGE_FOLDER_MANAGER, checked);
                    folderEnabledChanged(checked);
                }),
                createToggleSetting('置顶分组可折叠', '点击原生「置顶」分组标题可收起/展开该组会话（需先开启上方文件夹分组）', pinGroupCollapsible, checked => {
                    pinGroupCollapsible = checked;
                    GM_setValue(STORAGE_PIN_COLLAPSIBLE, checked);
                    folderUnit.setPinCollapsible(checked);
                    showToast(checked ? '置顶分组折叠已开启' : '置顶分组折叠已关闭');
                }, !folderManagerEnabled),
            ] },
            {
                key: 'help', icon: 'help-circle-outline', title: '帮助中心', sub: '前置条件 · 使用小贴士',
                build: () => [
                    createInfoIntro('前置安装条件', '请先安装以下任一用户脚本管理器，再在 DeepSeek 对话页打开本面板：'),
                    createLinkCardGrid([
                        createLinkCard('Tampermonkey（油猴）', '全球最流行的用户脚本管理器', 'https://www.tampermonkey.net/', 'shield-check-outline'),
                        createLinkCard('ScriptCat（脚本猫）', '国产脚本管理器 · 中文界面友好 · 推荐', 'https://scriptcat.org/zh-CN', 'web'),
                    ]),
                    createInfoIntro('打开方法', '点击浏览器工具栏 Tampermonkey / ScriptCat 图标 → 本脚本 →「脚本设置」'),
                    createInfoIntro('立即生效 · 自动保存', '改动设置即时生效、无需刷新；配置自动保存，下次打开页面保持。'),
                    createInfoIntro('功能失效排查', 'DeepSeek 大版本迭代可能导致个别功能失效；如遇异常欢迎反馈适配。'),
                ],
            },
            {
                key: 'about', icon: 'information-outline', title: '关于', sub: '版本 · 许可 · 相关链接 · 致谢',
                build: () => [
                    createInfoIntro('版本', 'DeepSeek 功能增强工具箱 v4.9.2'),
                    createInfoIntro('许可', 'MIT License · 完全开源，可自由使用与修改'),
                    createLinkCardGrid([
                        createLinkCard('GitHub 脚本仓库', '源码 · 更新日志 · Issues', 'https://github.com/Chuc-Jie/deepseektool', 'github'),
                        createLinkCard('ScriptCat 主页', '安装页 · 评论区', 'https://scriptcat.org/zh-CN', 'web'),
                    ]),
                    createInfoIntro('致谢', '感谢每一位反馈与建议的用户。'),
                ],
            },
        ];
        const pages = [];
        sections.forEach(sec => {
            const page = document.createElement('section');
            page.className = 'ds-p-page';
            page.dataset.page = sec.key;
            const head = document.createElement('div');
            const titleEl = document.createElement('h2');
            titleEl.appendChild(makeIconImg(sec.icon, 'ds-p-hic', mdiHeadUrl));
            const titleSpan = document.createElement('span');
            titleSpan.className = 'ds-p-title-text';
            titleSpan.textContent = sec.title;
            titleEl.appendChild(titleSpan);
            const subEl = document.createElement('div');
            subEl.className = 'ds-p-sub';
            subEl.textContent = sec.sub;
            head.appendChild(titleEl);
            head.appendChild(subEl);
            page.appendChild(head);
            // 分区内容统一包进白底卡片（antd List 质感），设置行/说明块的横向内边距由卡片统一承接
            const card = document.createElement('div');
            card.className = 'ds-p-card';
            sec.build().forEach(item => card.appendChild(item));
            page.appendChild(card);
            scroll.appendChild(page);
            pages.push(page);
        });
        main.appendChild(scroll);

        // 底部操作条
        const footer = document.createElement('div');
        footer.className = 'ds-p-footer';
        footer.innerHTML = `
            <span class="ds-p-reset" id="ds-panel-reset">恢复默认设置</span>
            <button type="button" class="ds-p-btn" id="ds-panel-close-btn">关闭面板</button>
        `;
        main.appendChild(footer);
        panel.appendChild(main);

        /* ===== 分区切换 ===== */
        function showPage(key) {
            pages.forEach(p => p.classList.toggle('active', p.dataset.page === key));
            navBtns.forEach(b => b.classList.toggle('active', b.dataset.target === key));
        }
        navBtns.forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.target)));
        showPage('fold');   // 默认展开第一分区

        footer.querySelector('#ds-panel-close-btn').addEventListener('click', () => overlay.remove());
        footer.querySelector('#ds-panel-reset').addEventListener('click', () => {
            if (confirm('确定恢复所有设置为默认值？')) {
                foldThreshold = 20; GM_setValue(STORAGE_FOLD_THRESHOLD, 20);
                previewLines = 0; enablePreviewLines = false; GM_setValue(STORAGE_PREVIEW_LINES, 0);
                tableButtonsEnabled = true; GM_setValue(STORAGE_TABLE_BUTTONS_ENABLED, true);
                tableThemeMode = 'auto'; GM_setValue(STORAGE_TABLE_THEME_MODE, 'auto');
                tableWidthMode = 'equal'; GM_setValue(STORAGE_TABLE_WIDTH_MODE, 'equal');
                keepExportCites = true; GM_setValue(STORAGE_EXPORT_KEEP_CITES, true);
                wideScreen = false; GM_setValue(STORAGE_WIDE_SCREEN, false);
                ctrlEnterEnabled = false; GM_setValue(STORAGE_CTRL_ENTER, false);
                showCtrlEnterBtn = true; GM_setValue(STORAGE_SHOW_CTRL_ENTER_BTN, true);
                thinkPreviewHeight = 200; GM_setValue(STORAGE_THINK_PREVIEW_HEIGHT, 200);
                thinkPreviewMinHeight = 300; GM_setValue(STORAGE_THINK_PREVIEW_MIN, 300);
                thinkDisplayMode = 'preview'; GM_setValue(STORAGE_THINK_DISPLAY, 'preview');
                tableButtonsAlways = false; GM_setValue(STORAGE_TABLE_BUTTONS_ALWAYS, false); setTableButtonsAlways(false);
                pinGroupCollapsible = false; GM_setValue(STORAGE_PIN_COLLAPSIBLE, false);
                if (folderManagerEnabled) {           // 默认关闭 → 恢复默认需停用并整体清理
                    folderManagerEnabled = false;
                    GM_setValue(STORAGE_FOLDER_MANAGER, false);
                    folderUnit.off();
                }
                applyTableThemeClass('auto');
                applyWideScreen(false);
                // 各步独立隔离：任一失败也要把「已恢复默认设置」提示发出、面板照常重开
                safeRun(reapplyFoldToAllCodeBlocks, '代码块折叠重应用');
                toggleTableButtons(true);
                safeRun(applyThinkPreviewHeight, '思考预览定高重应用');   // 内部 refreshThinkPreviews 会把预览整轮重套（含清理）
                safeRun(syncCtrlEnterBtn, '快捷键按钮同步');
                safeRun(() => document.querySelectorAll('.ds-markdown table').forEach(t => applyTableStyles(t)), '表格样式重应用');
                showToast('已恢复默认设置');
                overlay.remove();
                setTimeout(() => openControlPanel(), 300);
            }
        });

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.remove();
            // 点击面板外部关闭所有下拉
            if (!e.target.closest('.ds-custom-select')) {
                document.querySelectorAll('.ds-custom-select-dropdown').forEach(d => d.style.display = 'none');
            }
        });
    }

    // 控件工厂

    // 行式设置项外壳：label + 描述 在左、控件在右
    function createSettingRow(labelText, description, controlEl, disabled) {
        const item = document.createElement('div');
        item.className = 'ds-setting-item';
        if (disabled) {
            item.classList.add('dsDisabled');
            item.setAttribute('aria-disabled', 'true');
        }
        const labelBlock = document.createElement('div');
        labelBlock.className = 'ds-setting-label';
        const t = document.createElement('div');
        t.className = 'ds-setting-title';
        t.textContent = labelText;
        labelBlock.appendChild(t);
        if (description) {
            const d = document.createElement('small');
            d.textContent = description;
            labelBlock.appendChild(d);
        }
        const ctrl = document.createElement('div');
        ctrl.className = 'ds-setting-ctrl';
        ctrl.appendChild(controlEl);
        item.appendChild(labelBlock);
        item.appendChild(ctrl);
        return item;
    }

    // maxPositive：>0 时的输入上限；disabled：置灰（依赖的开关没开时用）；minPositive：输入下限（默认 0）
    function createNumberSetting(labelText, description, unit, currentValue, onChange, maxPositive, disabled, minPositive) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:6px; align-items:center;';
        const input = document.createElement('input');
        input.type = 'number'; input.value = currentValue; input.step = 1;
        input.min = minPositive || 0;
        if (maxPositive) input.max = maxPositive;
        input.className = 'ds-panel-input';
        if (disabled) input.disabled = true;   // 与开关项一致：置灰的同时真的不可编辑
        input.addEventListener('change', () => {
            let val = parseInt(input.value, 10);
            if (isNaN(val) || val < 0) val = 0;
            if (minPositive && val < minPositive) val = minPositive;
            if (val > 0 && maxPositive) val = Math.min(val, maxPositive);
            input.value = val;
            onChange(val);
        });
        wrap.appendChild(input);
        if (unit) {
            const u = document.createElement('span');
            u.className = 'ds-panel-unit';
            u.textContent = unit;
            wrap.appendChild(u);
        }
        return createSettingRow(labelText, description, wrap, disabled);
    }

    function createToggleSetting(labelText, description, checked, onToggle, disabled) {
        const label = document.createElement('label');
        label.className = 'ds-switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        if (checked) input.checked = true;
        if (disabled) input.disabled = true;
        const slider = document.createElement('span');
        slider.className = 'ds-slider';
        label.appendChild(input);
        label.appendChild(slider);
        if (!disabled) input.addEventListener('change', () => onToggle(input.checked));
        return createSettingRow(labelText, description, label, disabled);
    }

    function createSelectSetting(labelText, description, options, selectedValue, onChange) {
        const container = document.createElement('div');
        container.className = 'ds-custom-select';
        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'ds-custom-select-trigger';
        const dropdown = document.createElement('div');
        dropdown.className = 'ds-custom-select-dropdown';
        dropdown.style.display = 'none';
        let selectedLabel = '';
        options.forEach(opt => {
            const item = document.createElement('div');
            item.className = 'ds-custom-select-option';
            item.textContent = opt.label;
            item.dataset.value = opt.value;
            if (opt.value === selectedValue) {
                item.classList.add('active');
                selectedLabel = opt.label;
            }
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                // 更新选中态
                dropdown.querySelectorAll('.ds-custom-select-option').forEach(o => o.classList.remove('active'));
                item.classList.add('active');
                trigger.textContent = opt.label;
                dropdown.style.display = 'none';
                onChange(opt.value);
            });
            dropdown.appendChild(item);
        });
        trigger.textContent = selectedLabel;

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            // 关闭所有其他下拉
            document.querySelectorAll('.ds-custom-select-dropdown').forEach(d => d.style.display = 'none');
            dropdown.style.display = 'block';
        });

        container.appendChild(trigger);
        container.appendChild(dropdown);
        return createSettingRow(labelText, description, container);
    }

    // 说明性字（帮助/关于页）：竖向小标题 + 描述段，供 build() 返回
    function createInfoIntro(labelText, text) {
        const block = document.createElement('div');
        block.className = 'ds-info';
        const h = document.createElement('div');
        h.className = 'ds-info-title';
        h.textContent = labelText;
        const p = document.createElement('div');
        p.className = 'ds-info-body';
        p.textContent = text;
        block.appendChild(h);
        block.appendChild(p);
        return block;
    }

    // 设置变动后的刷新函数
    function reapplyFoldToAllCodeBlocks() {
        document.querySelectorAll('pre').forEach(pre => {
            pre.removeAttribute('data-fold-processed');
            if (pre.dataset.origDisplay) {
                pre.style.display = pre.dataset.origDisplay;
                delete pre.dataset.origDisplay;
            }
            if (pre.dataset.origMaxHeight) {
                pre.style.maxHeight = pre.dataset.origMaxHeight;
                pre.style.overflow = pre.dataset.origOverflow || '';
                delete pre.dataset.origMaxHeight;
                delete pre.dataset.origOverflow;
            }
            pre.classList.remove('ds-fold-preview');
            const btn = pre.parentElement?.querySelector('.ds-fold-btn');
            if (btn) btn.remove();
            addFoldButtonToCodeBlock(pre);
        });
    }

    // 导出按钮开关：启用 → 给已有表格补挂按钮容器；关闭 → 全部移除
    function toggleTableButtons(enabled) {
        document.querySelectorAll('.ds-markdown table').forEach(table => {
            table.removeAttribute(EXPORT_BTN_ATTR);
            table.classList.remove(DISMISS_CLASS);   // 一并撤掉「暂时隐藏」，否则重开后首次悬停仍是空的
            const box = table.querySelector('.table-internal-buttons');
            if (box) box.remove();
            if (enabled) attachTableExportButtons(table);
        });
    }

    function applyTableThemeClass(mode) {
        const html = document.documentElement;
        html.classList.remove('ds-table-auto', 'ds-table-dual');
        html.classList.add(mode === 'auto' ? 'ds-table-auto' : 'ds-table-dual');
    }

    function applyWideScreen(on) {
        document.documentElement.classList.toggle('ds-wide-screen', on);
    }

    // 导出按钮「恒显」开关：开启后表内按钮不再需要点击即可见（纯 CSS 开关）
    function setTableButtonsAlways(on) {
        document.documentElement.classList.toggle('ds-export-always', !!on);
    }

    // ==================== 菜单命令 ====================
    GM_registerMenuCommand('脚本设置', openControlPanel);

    // ==================== 全局样式 ====================
    GM_addStyle(`
        /* 代码块折叠 */
        .ds-fold-btn {
            background: transparent; border: none; border-radius: 12px;
            font-size: 13px; padding: 4px 8px; cursor: pointer;
            transition: all 0.2s; font-family: system-ui, sans-serif;
            user-select: none; display: inline-flex; align-items: center; gap: 2px;
            opacity: 0.7;
        }
        .ds-fold-btn:hover { background: rgba(128,128,128,0.2); opacity: 1; }
        .ds-fold-btn .fold-icon { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; }
        .ds-fold-btn svg { width: 20px; height: 20px; display: block; }
        /* 折叠预览定位容器；底部渐变遮罩（仅代码块折叠使用，替换原「 ... 」文字提示） */
        .ds-fold-preview {
            position: relative; overflow: hidden;
        }
        /* （原来同选择器拆成两块：一块设渐变、一块设定位 —— 合并，语义不变） */
        .ds-fold-preview::after {
            --dsl-fold-bg: var(--dsl-code-block-banner-background-color, var(--dsw-alias-markdown-code-block-banner, #f6f8fa));
            content: ""; position: absolute; bottom: 0; left: 0; right: 0; height: 48px;
            background: linear-gradient(to bottom, transparent 0%, var(--dsl-fold-bg) 100%);
            pointer-events: none; z-index: 1;
        }
        body.dark .ds-fold-preview::after {
            --dsl-fold-bg: var(--dsl-code-block-banner-background-color, var(--dsw-alias-markdown-code-block-banner, #1e1e2d));
        }
        /* ===== 思考区域「定高滚动预览窗口」：默认态（CSS 夹断），流式生成时自动生效。
           分段结构下表头容器由 JS 整根移出滚动容器（见 splitThinkHeaderBand），越头几何上不可能。
           窗口**不画边框、不加圆角** —— 夹断只靠高度差表达（少一圈视觉噪音，更贴近原生观感）。 */
        .ds-think-preview {
            display: block !important;       /* 避免内容盒为 display:contents/inline 而无盒子，导致 max-height/overflow 失效 */
            position: relative !important;   /* 保留定位参照：删掉会改锚点 */
            min-height: 0 !important;        /* 思考区若是 flex 子项，默认 min-height:auto 会撑破 max-height */
            max-height: ${THINK_PREVIEW_MAX_H} !important;   /* 下限 80px / 上限 500px 由这个表达式兜住 */
            overflow-y: auto !important;
            overflow-x: hidden !important;
            box-sizing: border-box;
        }
        /* 预览窗口定位包裹层：滚动容器外包一层相对定位容器（表头带会被搬进这一层，见 splitThinkHeaderBand）。
           wrap 本身不参与布局，高度由内部滚动容器撑开；保留 position: relative —— 它同时是表头带的包含块，
           去掉会改变表头带在「页面用绝对定位排它」时的参照。 */
        .ds-think-preview-wrap {
            position: relative;
        }
        /* wrap 插进「思考内容盒 → 正文」之间后，页面自己那条「上一个块 + 正文」的关系型间距规则
           （相邻兄弟 / :has() 之类）就不再匹配了：实测正文 margin-top 由 10px 变 0，预览态下这段间距
           整段消失（原生间距 10px、预览 0px，消息高度账也正好差这 10px）。按实测原值补回 —— 流式期间
           正文还没生成时也照样生效（正文一出现就吃到这条），wrap 拆掉后本规则自然失效、不留残留。
           页面若改了间距，改这一个数即可。 */
        .ds-think-preview-wrap + .ds-assistant-message-main-content { margin-top: 10px !important; }
        /* 防止内部 flex 子项（默认 min-height:auto）被内容撑破外层 max-height。
           **标题行必须排除**：页面给标题文字的自然值是 min-height:auto，一并压成 0 会让标题行在夹断态
           矮 6px（实测 行高 34 → 28、文字 min-height auto → 0px；展开后恢复原高 → 文字看起来"轻微下移"）。
           标题行只有一行高，本来就不可能撑破 80–500px 的夹断，排除它不损失防护。
           注：pinHeadRowHeight 写的是 .ds-think-preview-headrow 上的内联 min-height（非 !important），会被上面
           那条压住 —— 要等表头带被 splitThinkHeaderBand 移出滚动容器后才生效，这正是我们要的顺序。 */
        .ds-think-preview > * { min-height: 0 !important; }
        .ds-think-preview > .ds-think-preview-head { min-height: auto !important; }
        /* 分段结构下「纯表头容器」被 JS 整根移出滚动容器、放在包裹层里（真 React 节点，原生点击/悬停/
           文案更新全保留）；它不参与滚动 → 不需要 sticky，也不需要背景/投影去「遮」内容 */

        /* ===== 「快捷键修改」按钮：独立圆形按钮叠在发送按钮上（输入框无内容时） =====
           不复制发送按钮 className，避免继承 disabled 半透明/pointer-events 问题；
           不透明主题背景盖住底层 disabled 发送按钮的方形边缘；模式区分用图标点亮。 */
        #ds-ctrl-enter-btn {
            position: absolute; z-index: 1024;
            width: 36px; height: 36px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; box-sizing: border-box;
            background-color: #ffffff;
            border: 1px solid rgba(0,0,0,0.10);
            box-shadow: 0 1px 3px rgba(0,0,0,0.12);
            transition: background-color 0.15s;
            color: #111;
        }
        body.dark #ds-ctrl-enter-btn { background-color: #2a2a2a; border-color: rgba(255,255,255,0.10); color: #e5e5e5; }
        #ds-ctrl-enter-btn:hover { filter: brightness(1.03); }
        #ds-ctrl-enter-btn svg { transition: opacity 0.15s; }
        #ds-ctrl-enter-btn.ds-ctrl-enter-off svg { opacity: 0.45; }
        #ds-ctrl-enter-btn.ds-ctrl-enter-on svg { opacity: 1; }
        /* 图标描边跟随主题文字色（覆盖图标内联的白色描边） */
        #ds-ctrl-enter-btn svg g { stroke: currentColor !important; }
        /* 切换发送模式微动画：按钮短暂放大脉冲，强化「切换成功」视觉反馈 */
        #ds-ctrl-enter-btn.ds-ctrl-enter-pulse { animation: ds-ctrl-enter-pulse 0.28s ease; }
        @keyframes ds-ctrl-enter-pulse {
            0% { transform: scale(1); }
            40% { transform: scale(1.18); }
            100% { transform: scale(1); }
        }
        /* 切换按钮的提示：用浏览器原生 title（见 updateCtrlEnterBtnUI）——自绘提示要挂 body + 算坐标
           （按钮自身 ::after 会被输入区容器裁掉），约 27 行只为观感，不划算。
           表格导出按钮的 tooltip 是原版就有的纯 CSS 实现（.internal-export-btn::after），按既有规则不动。 */

        /* ===== 设置面板 — 左右布局（深浅双主题） ===== */
        .ds-panel {
            width: min(920px, 94vw); height: min(640px, 84vh);
            display: flex; overflow: hidden;
            border-radius: 8px;
            box-shadow: 0 12px 40px rgba(0,0,0,.18), 0 4px 12px rgba(0,0,0,.08);
            font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
            /* 浅色默认值 */
            --dsp-content-bg: #f7f8fa;
            --dsp-topbar-bg: #ffffff;
            --dsp-title: #0f172a;
            --dsp-text: #1e293b;
            --dsp-sub: #64748b;
            --dsp-line: #f0f0f0;
            --dsp-ctrl-bg: #ffffff;
            --dsp-ctrl-border: #d9d9d9;
            --dsp-accent: #1677ff;
            --dsp-accent-deep: #0958d9;
            --dsp-accent-soft: rgba(22,119,255,.08);
            --dsp-switch-off: #cbd5e1;
            --dsp-scroll-thumb: rgba(100,116,139,.3);
            --dsp-scroll-thumb-hover: rgba(100,116,139,.52);
            --dsp-opt-hover: rgba(22,119,255,.06);
            --dsp-opt-active: rgba(22,119,255,.12);
            color: var(--dsp-text);
        }
        body.dark .ds-panel {
            --dsp-content-bg: #1a1a24;
            --dsp-topbar-bg: #1e1e2d;
            --dsp-title: #f1f2f6;
            --dsp-text: #e4e4e8;
            --dsp-sub: rgba(255,255,255,.46);
            --dsp-line: rgba(255,255,255,.08);
            --dsp-ctrl-bg: rgba(255,255,255,.06);
            --dsp-ctrl-border: rgba(255,255,255,.14);
            --dsp-accent-soft: rgba(22,119,255,.24);
            --dsp-switch-off: rgba(255,255,255,.22);
            --dsp-scroll-thumb: rgba(255,255,255,.16);
            --dsp-scroll-thumb-hover: rgba(255,255,255,.3);
            --dsp-opt-hover: rgba(22,119,255,.16);
            --dsp-opt-active: rgba(22,119,255,.3);
        }
        .ds-panel *, .ds-panel *::before, .ds-panel *::after { box-sizing: border-box; }

        /* 左导航 — 深蓝渐变（两主题一致） */
        .ds-p-sidebar {
            width: 224px; flex-shrink: 0;
            background: linear-gradient(180deg, #1b2437 0%, #0f1622 100%);
            display: flex; flex-direction: column; gap: 2px;
            padding: 18px 12px 16px 8px;
            overflow-y: auto; user-select: none; -webkit-user-select: none;
            scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent;
        }
        .ds-p-sidebar::-webkit-scrollbar { width: 5px; }
        .ds-p-sidebar::-webkit-scrollbar-track { background: transparent; }
        .ds-p-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.14); border-radius: 4px; }
        .ds-p-logo {
            display: flex; align-items: center; gap: 10px;
            padding: 2px 10px 18px 12px; color: #fff;
        }
        .ds-p-logo-ic { width: 22px; height: 22px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
        .ds-p-logo-ic-img { width: 22px; height: 22px; display: block; }
        .ds-p-logo-t { font-size: 15px; font-weight: 700; letter-spacing: .2px; }
        .ds-p-logo-s { font-size: 11px; color: rgba(255,255,255,.42); margin-top: 2px; }
        .ds-p-nav {
            display: flex; align-items: center; width: 100%;
            padding: 0; border: none; background: transparent; cursor: pointer;
            font-family: inherit; text-align: left; outline: none;
        }
        .ds-p-nav-ind {
            flex-shrink: 0; width: 3px; height: 24px; border-radius: 3px;
            margin: 0 8px 0 4px; background: transparent;
            transition: background .2s ease;
        }
        .ds-p-nav-bd {
            flex: 1; display: flex; align-items: center; gap: 10px;
            padding: 9px 12px 9px 4px; border-radius: 6px;
            color: rgba(255,255,255,.62); font-size: 14px; font-weight: 500;
            transition: background .18s ease, color .18s ease;
        }
        .ds-p-nav-ic { width: 18px; height: 18px; display: block; flex: none; }
        .ds-p-nav-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
        .ds-p-nav-divider { height: 1px; background: rgba(255,255,255,.08); margin: 8px 10px 10px 16px; flex-shrink: 0; }
        .ds-p-nav:hover .ds-p-nav-bd { background: rgba(255,255,255,.06); color: #fff; }
        .ds-p-nav.active .ds-p-nav-ind { background: #4096ff; }
        .ds-p-nav.active .ds-p-nav-bd { background: rgba(22,119,255,.26); color: #fff; }

        /* 右主区 */
        .ds-p-main { flex: 1; min-width: 0; display: flex; flex-direction: column; background: var(--dsp-content-bg); }
        .ds-p-topbar {
            flex-shrink: 0; height: 48px;
            display: flex; align-items: center; justify-content: flex-end;
            padding: 0 16px; background: var(--dsp-topbar-bg);
            border-bottom: 1px solid var(--dsp-line);
        }
        .ds-p-close {
            border: none; background: transparent; cursor: pointer;
            color: var(--dsp-sub); font-size: 18px; line-height: 1;
            padding: 6px 8px; border-radius: 6px; transition: background .15s, color .15s;
        }
        .ds-p-close:hover { background: var(--dsp-accent-soft); color: var(--dsp-text); }
        .ds-p-scroll { flex: 1; overflow-y: auto; padding: 24px 24px 24px; scrollbar-width: thin; scrollbar-color: transparent transparent; }
        .ds-p-scroll:hover { scrollbar-color: var(--dsp-scroll-thumb) transparent; }
        .ds-p-scroll::-webkit-scrollbar { width: 8px; }
        .ds-p-scroll::-webkit-scrollbar-track { background: transparent; }
        .ds-p-scroll::-webkit-scrollbar-thumb {
            background: var(--dsp-scroll-thumb); border-radius: 999px;
            border: 2px solid transparent; background-clip: padding-box;
            transition: background .15s;
        }
        .ds-p-scroll:hover::-webkit-scrollbar-thumb { background: var(--dsp-scroll-thumb-hover); background-clip: padding-box; border-color: transparent; }

        /* 分区页 */
        .ds-p-page { display: none; }
        .ds-p-page.active { display: block; animation: dsFadeUp .28s ease forwards; }
        @keyframes dsFadeUp {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .ds-p-page h2 {
            margin: 0 0 4px; font-size: 20px; font-weight: 700;
            display: flex; align-items: center; gap: 9px;
            color: var(--dsp-title); letter-spacing: -.2px;
            user-select: none; -webkit-user-select: none;
        }
        .ds-p-hic { width: 24px; height: 24px; flex: none; }
        /* 帮助/关于：说明字块 */
        .ds-info { padding: 12px 0; }
        .ds-info + .ds-info { border-top: 1px solid var(--dsp-line); }
        .ds-info-title { font-size: 13px; font-weight: 600; color: var(--dsp-text); margin-bottom: 4px; user-select: none; -webkit-user-select: none; }
        .ds-info-body { font-size: 13px; color: var(--dsp-sub); line-height: 1.7; user-select: text; }
        /* 帮助/关于：外链卡片组 */
        .ds-link-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin: 6px 0 2px; }
        .ds-link-card {
            display: flex; align-items: center; gap: 11px;
            padding: 12px 14px; border-radius: 8px; text-decoration: none;
            background: var(--dsp-ctrl-bg); border: 1px solid var(--dsp-ctrl-border);
            transition: border-color .15s, box-shadow .15s, transform .15s;
        }
        .ds-link-card:hover { border-color: var(--dsp-accent); box-shadow: 0 0 0 3px var(--dsp-accent-soft); transform: translateY(-1px); }
        .ds-link-card-ic { width: 24px; height: 24px; flex: none; }
        .ds-link-card-tx { min-width: 0; display: flex; flex-direction: column; }
        .ds-link-card-title { font-size: 14px; font-weight: 600; color: var(--dsp-text); line-height: 1.3; }
        .ds-link-card-desc { font-size: 12px; color: var(--dsp-sub); margin-top: 2px; line-height: 1.45; }
        .ds-p-sub {
            font-size: 13px; color: var(--dsp-sub);
            padding-bottom: 0; margin-bottom: 16px;
            user-select: text;
        }
        /* 分区内容卡片（antd Card/List 质感：白底承载内容行，分隔线收进卡内，与 #f7f8fa 页底形成层次） */
        .ds-p-card {
            background: var(--dsp-ctrl-bg);
            border: 1px solid var(--dsp-line);
            border-radius: 8px;
            padding: 2px 16px;
        }

        /* 行式设置项 */
        .ds-setting-item {
            display: flex; align-items: center; justify-content: space-between;
            gap: 20px; padding: 14px 0;
            border-bottom: 1px solid var(--dsp-line);
        }
        .ds-setting-item:last-child { border-bottom: none; }
        .ds-setting-label { min-width: 0; }
        .ds-setting-title { font-size: 14px; font-weight: 600; color: var(--dsp-text); user-select: none; -webkit-user-select: none; }
        .ds-setting-label small {
            display: block; margin-top: 3px; font-size: 12px; font-weight: 400;
            color: var(--dsp-sub); line-height: 1.55; user-select: text;
        }
        .ds-setting-ctrl { flex-shrink: 0; margin-left: 12px; }

        /* Switch（参考 slider 风格） */
        .ds-switch { position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; flex-shrink: 0; }
        .ds-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
        .ds-slider {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background: var(--dsp-switch-off); transition: background .2s ease; border-radius: 24px;
        }
        .ds-slider::before {
            content: ""; position: absolute; height: 18px; width: 18px;
            left: 3px; bottom: 3px; background: #fff; transition: transform .2s ease;
            border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,.22);
        }
        .ds-switch input:checked + .ds-slider { background: var(--dsp-accent); }
        .ds-switch input:checked + .ds-slider::before { transform: translateX(20px); }
        .ds-switch input:focus-visible + .ds-slider { outline: 2px solid var(--dsp-accent); outline-offset: 2px; }
        /* 依赖项未开启 → 子开关置灰不可点（Ant Design disabled 语义：降透明度 + not-allowed） */
        .ds-setting-item.dsDisabled { opacity: .5; }
        .ds-setting-item.dsDisabled .ds-setting-title,
        .ds-setting-item.dsDisabled small { cursor: not-allowed; }
        .ds-switch input:disabled + .ds-slider { cursor: not-allowed; }

        /* 数字输入 / 单位 */
        .ds-setting-ctrl input[type="number"] {
            width: 96px; padding: 7px 10px;
            border: 1px solid var(--dsp-ctrl-border); border-radius: 6px;
            background: var(--dsp-ctrl-bg); color: var(--dsp-text);
            font-size: 14px; font-family: inherit; outline: none;
            transition: border-color .15s, box-shadow .15s;
        }
        .ds-setting-ctrl input[type="number"]:focus {
            border-color: var(--dsp-accent);
            box-shadow: 0 0 0 3px var(--dsp-accent-soft);
        }
        .ds-panel-unit { font-size: 13px; color: var(--dsp-sub); }

        /* 自定义下拉（深浅自适应） */
        .ds-custom-select { position: relative; min-width: 178px; }
        .ds-custom-select-trigger {
            width: 100%; padding: 8px 30px 8px 12px;
            border: 1px solid var(--dsp-ctrl-border); border-radius: 6px;
            background: var(--dsp-ctrl-bg); color: var(--dsp-text);
            font-size: 14px; font-family: inherit; cursor: pointer;
            text-align: left; outline: none; transition: border-color .15s, box-shadow .15s;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394a3b8' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
            background-repeat: no-repeat; background-position: right 11px center;
            -webkit-appearance: none; appearance: none;
        }
        .ds-custom-select-trigger:focus { border-color: var(--dsp-accent); box-shadow: 0 0 0 3px var(--dsp-accent-soft); }
        .ds-custom-select-dropdown {
            position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10002;
            background: var(--dsp-ctrl-bg); border: 1px solid var(--dsp-ctrl-border);
            border-radius: 8px; overflow: hidden;
            box-shadow: 0 6px 16px rgba(0,0,0,.12);
            max-height: 210px; overflow-y: auto;
        }
        .ds-custom-select-option {
            padding: 9px 12px; font-size: 14px; cursor: pointer;
            color: var(--dsp-text); transition: background .1s;
        }
        .ds-custom-select-option:hover { background: var(--dsp-opt-hover); }
        .ds-custom-select-option.active { background: var(--dsp-opt-active); font-weight: 600; }

        /* 底部操作条 */
        .ds-p-footer {
            flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
            padding: 12px 24px; border-top: 1px solid var(--dsp-line);
            background: var(--dsp-topbar-bg);
        }
        .ds-p-reset {
            font-size: 12.5px; color: var(--dsp-sub); cursor: pointer;
            user-select: none; -webkit-user-select: none; transition: color .15s;
        }
        .ds-p-reset:hover { color: var(--dsp-accent); }
        .ds-p-btn {
            padding: 8px 22px; border: none; border-radius: 6px;
            background: var(--dsp-accent); color: #fff;
            font-size: 14px; font-weight: 600; font-family: inherit; cursor: pointer;
            transition: background .15s;
        }
        .ds-p-btn:hover { background: var(--dsp-accent-deep); }

        /* 响应式：窄屏导航转横排、设置项纵向 */
        @media (max-width: 640px) {
            .ds-panel { flex-direction: column; height: 92vh; }
            .ds-p-sidebar { width: 100%; flex-direction: row; flex-wrap: wrap; padding: 10px 10px 6px; overflow-y: visible; max-height: 150px; }
            .ds-p-logo { display: none; }
            .ds-p-nav { width: auto; flex: 1 0 calc(50% - 8px); }
            .ds-p-nav-bd { padding: 7px 10px; }
            .ds-p-nav-ind { display: none; }
            .ds-p-scroll { padding: 16px 16px 16px; }
            .ds-p-card { padding: 2px 12px; }
            .ds-setting-item { flex-direction: column; align-items: flex-start; gap: 10px; }
            .ds-setting-ctrl { margin-left: 0; width: 100%; }
            .ds-custom-select { min-width: 100%; }
            .ds-setting-ctrl input[type="number"] { width: 100%; }
        }

        /* 宽屏模式 — 增大消息区最大宽度，左右留白自动均分 */
        html.ds-wide-screen [class*="ds-virtual-list-items"][style*="--message-list-max-width"] {
            --message-list-max-width: 1000px !important;
        }

        /* 表格样式 — 公共布局（不涉及颜色，所有模式共用） */
        .ds-markdown table {
            opacity: 0;  /* 初始透明，JS 完成处理后再显示，消除闪烁 */
            transition: opacity 0.12s ease-in;
            table-layout: fixed;
            width: 100% !important; border-collapse: separate !important;
            border-spacing: 0 !important; margin: 1em 0 !important;
            border-radius: 12px !important; overflow: hidden !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05) !important; position: relative;
        }
        .ds-markdown th, .ds-markdown td {
            padding: 12px 16px !important;
            vertical-align: top !important; font-size: 14px !important; line-height: 1.5 !important;
        }
        .ds-markdown th {
            font-weight: 600 !important; letter-spacing: 0.02em !important;
        }
        .ds-markdown tbody tr { transition: background-color 0.2s !important; }

        /* === Plan A：透明叠加色（自动适应浅色/深色） === */
        html.ds-table-auto .ds-markdown th,
        html.ds-table-auto .ds-markdown td {
            border: 1px solid rgba(128,128,128,0.2) !important;
        }
        html.ds-table-auto .ds-markdown th {
            background: rgba(128,128,128,0.08) !important;
            border-bottom: 1px solid rgba(128,128,128,0.2) !important;
        }
        html.ds-table-auto .ds-markdown tbody tr:nth-child(even) {
            background-color: rgba(128,128,128,0.04) !important;
        }
        html.ds-table-auto .ds-markdown tbody tr:hover {
            background-color: rgba(79,70,229,0.06) !important;
        }

        /* === Plan B 浅色模式 === */
        html.ds-table-dual body:not(.dark) .ds-markdown th,
        html.ds-table-dual body:not(.dark) .ds-markdown td {
            border: 1px solid #e5e7eb !important;
        }
        html.ds-table-dual body:not(.dark) .ds-markdown th {
            background: #f3f4f6 !important;
            border-bottom: 1px solid #e5e7eb !important; color: #1f2937 !important;
        }
        html.ds-table-dual body:not(.dark) .ds-markdown tbody tr:nth-child(even) {
            background-color: #fafafa !important;
        }
        html.ds-table-dual body:not(.dark) .ds-markdown tbody tr:hover {
            background-color: #eff6ff !important;
        }

        /* === Plan B 深色模式 === */
        html.ds-table-dual body.dark .ds-markdown th,
        html.ds-table-dual body.dark .ds-markdown td {
            border: 1px solid #2d2d3d !important;
        }
        html.ds-table-dual body.dark .ds-markdown th {
            background: #1e1e2d !important;
            border-bottom: 1px solid #2d2d3d !important; color: #e4e4e8 !important;
        }
        html.ds-table-dual body.dark .ds-markdown tbody tr:nth-child(even) {
            background-color: rgba(255,255,255,0.03) !important;
        }
        html.ds-table-dual body.dark .ds-markdown tbody tr:hover {
            background-color: rgba(79,70,229,0.1) !important;
        }

        /* 导出按钮 — 原版形态：嵌在表格右下角，悬停即显示（触显纯 CSS）。两处刻意选择：
           ① 不放开表格自身的 overflow:hidden —— 放开后 12px 圆角会被表头底色顶成方角；
           ② 「×」= 加 ds-export-dismissed 当场隐藏，mouseleave 撤类名恢复（不落盘）。
           祖先 .ds-scroll-area 的裁剪由 processAllTables 置 overflow-x:visible 消掉。 */
        .table-internal-buttons {
            position: absolute; bottom: 12px; right: 12px;
            display: flex; flex-direction: column; gap: 8px; z-index: 10;
            opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s;
            pointer-events: none;
        }
        .ds-markdown table:hover .table-internal-buttons { opacity: 1; visibility: visible; pointer-events: auto; }
        html.ds-export-always .table-internal-buttons {
            opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;
        }
        /* display:none 才能压过上面所有显隐规则（含恒显） */
        table.ds-export-dismissed .table-internal-buttons { display: none !important; }
        .internal-export-btn {
            width: 32px; height: 32px; border-radius: 8px;
            cursor: pointer; display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1); transition: all 0.2s; font-size: 16px;
            position: relative; flex: 0 0 auto; padding: 0; line-height: 1;
        }
        .internal-export-btn:active { transform: scale(0.98); }
        .internal-export-btn .export-btn-ic { width: 16px; height: 16px; display: block; pointer-events: none; }
        .internal-export-btn::after {
            content: attr(data-tooltip); position: absolute; right: 40px; top: 50%;
            transform: translateY(-50%); font-size: 12px; padding: 4px 8px; border-radius: 6px;
            white-space: nowrap; opacity: 0; visibility: hidden; transition: 0.1s;
            pointer-events: none;
        }
        .internal-export-btn:hover::after { opacity: 1; visibility: visible; }

        /* 导出按钮 — Plan A 自动 */
        html.ds-table-auto .internal-export-btn {
            background: rgba(128,128,128,0.12); border: 1px solid rgba(128,128,128,0.24);
        }
        html.ds-table-auto .internal-export-btn:hover {
            background: rgba(128,128,128,0.2); border-color: rgba(128,128,128,0.36);
        }
        html.ds-table-auto .internal-export-btn::after {
            background: rgba(0,0,0,0.82); color: white;
        }

        /* 导出按钮 — Plan B 浅色 */
        html.ds-table-dual body:not(.dark) .internal-export-btn {
            background: rgba(255,255,255,0.95); border: 1px solid #e2e8f0;
        }
        html.ds-table-dual body:not(.dark) .internal-export-btn:hover {
            background: #fff; border-color: #cbd5e1;
        }
        html.ds-table-dual body:not(.dark) .internal-export-btn::after {
            background: #1f2937; color: white;
        }

        /* 导出按钮 — Plan B 深色 */
        html.ds-table-dual body.dark .internal-export-btn {
            background: rgba(45,45,58,0.95); border: 1px solid #3d3d4a;
        }
        html.ds-table-dual body.dark .internal-export-btn:hover {
            background: #3d3d4a; border-color: #5d5d6a;
        }
        html.ds-table-dual body.dark .internal-export-btn::after {
            background: #e4e4e8; color: #1a1a22;
        }
    `);

    // ==================== 代码块折叠逻辑 ====================
    const processedAttr = 'data-fold-processed';

    function getLineCount(preEl) {
        const text = preEl.innerText || preEl.textContent || '';
        let lines = text.split('\n');
        if (lines.length && lines[lines.length-1] === '') lines.pop();
        return lines.length;
    }

    function getLineHeight(preEl) {
        const style = window.getComputedStyle(preEl);
        let lh = style.lineHeight;
        if (lh === 'normal') lh = parseFloat(style.fontSize) * 1.2 + 'px';
        return parseFloat(lh);
    }

    function shouldUsePreviewMode(preEl) {
        if (!enablePreviewLines) return false;
        return getLineCount(preEl) > previewLines;
    }

    function collapseBlock(preEl, btn) {
        if (shouldUsePreviewMode(preEl)) {
            const lh = getLineHeight(preEl);
            const maxH = (previewLines > 0 ? previewLines : 5) * lh;
            if (!preEl.dataset.origMaxHeight) {
                preEl.dataset.origMaxHeight = preEl.style.maxHeight || '';
                preEl.dataset.origOverflow = preEl.style.overflow || '';
            }
            preEl.style.maxHeight = maxH + 'px';
            preEl.style.overflow = 'hidden';
            preEl.classList.add('ds-fold-preview');
        } else {
            if (!preEl.dataset.origDisplay) {
                preEl.dataset.origDisplay = window.getComputedStyle(preEl).display;
            }
            preEl.style.display = 'none';
            preEl.classList.remove('ds-fold-preview');
        }
        const iconDiv = btn.querySelector('.fold-icon');
        if (iconDiv) iconDiv.innerHTML = ICON_CHEVRON_DOWN;   // 折叠态：下箭头 = 「点击展开」
        btn.querySelector('span').textContent = btnTextUnfold;
        btn.setAttribute('aria-label', '展开代码块');
    }

    function expandBlock(preEl, btn) {
        if (preEl.dataset.origMaxHeight !== undefined) {
            preEl.style.maxHeight = preEl.dataset.origMaxHeight || '';
            preEl.style.overflow = preEl.dataset.origOverflow || '';
            preEl.classList.remove('ds-fold-preview');
        }
        if (preEl.dataset.origDisplay !== undefined) {
            preEl.style.display = preEl.dataset.origDisplay || '';
        } else {
            preEl.style.display = '';
        }
        const iconDiv = btn.querySelector('.fold-icon');
        if (iconDiv) iconDiv.innerHTML = ICON_CHEVRON_UP;   // 展开态：上箭头 = 「点击折叠」
        btn.querySelector('span').textContent = btnTextFold;
        btn.setAttribute('aria-label', '折叠代码块');
    }

    function findButtonContainer(preEl) {
        const codeBlock = preEl.closest('.md-code-block');
        if (!codeBlock) return null;
        // 优先通过 .code-info-button-text（"复制"/"下载"文字）定位按钮容器
        const textSpan = codeBlock.querySelector('.code-info-button-text');
        if (textSpan) {
            const btn = textSpan.closest('[role="button"], .ds-button');
            if (btn && btn.parentElement) return btn.parentElement;
        }
        // 兼容旧版 .ds-text-button
        const oldBtn = codeBlock.querySelector('.ds-text-button');
        if (oldBtn) return oldBtn.parentElement;
        // 最后尝试已知的哈希容器名
        const hashContainer = codeBlock.querySelector('.efa13877');
        if (hashContainer) return hashContainer;
        // 语义兜底：哈希类失效时，取块内第一个按钮，校验其文字含「复制/下载」后才认作按钮容器
        const semanticBtn = codeBlock.querySelector('[role="button"], .ds-button');
        if (semanticBtn && semanticBtn.parentElement &&
            /复制|下载|Copy|Download/i.test(semanticBtn.textContent || '')) {
            return semanticBtn.parentElement;
        }
        return null;
    }

    function createFoldButton(preEl) {
        if (!preEl.dataset.origDisplay) preEl.dataset.origDisplay = window.getComputedStyle(preEl).display;
        const shouldAutoFold = foldThreshold > 0 && getLineCount(preEl) > foldThreshold;
        let isFolded = false;
        if (shouldAutoFold) {
            if (shouldUsePreviewMode(preEl)) {
                const lh = getLineHeight(preEl);
                const maxH = lh * previewLines;
                if (!preEl.dataset.origMaxHeight) {
                    preEl.dataset.origMaxHeight = preEl.style.maxHeight || '';
                    preEl.dataset.origOverflow = preEl.style.overflow || '';
                }
                preEl.style.maxHeight = maxH + 'px';
                preEl.style.overflow = 'hidden';
                preEl.classList.add('ds-fold-preview');
            } else {
                preEl.style.display = 'none';
                preEl.classList.remove('ds-fold-preview');
            }
            isFolded = true;
        }

        const btn = document.createElement('button');
        btn.className = 'ds-fold-btn';
        const iconDiv = document.createElement('div');
        iconDiv.className = 'fold-icon';
        iconDiv.innerHTML = isFolded ? ICON_CHEVRON_DOWN : ICON_CHEVRON_UP;   // 折叠态⌄（点击展开）/ 展开态⌃（点击折叠）
        const textSpan = document.createElement('span');
        textSpan.textContent = isFolded ? btnTextUnfold : btnTextFold;
        btn.appendChild(iconDiv);
        btn.appendChild(textSpan);
        btn.setAttribute('aria-label', isFolded ? '展开代码块' : '折叠代码块');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            let currentlyFolded;
            if (preEl.dataset.origMaxHeight !== undefined && preEl.style.maxHeight && preEl.style.maxHeight !== 'none') {
                currentlyFolded = true;
            } else if (preEl.style.display === 'none') {
                currentlyFolded = true;
            } else {
                currentlyFolded = false;
            }
            // 原地折叠/展开：让按钮的视口位置不变。块高一收一展差几千 px，浏览器滚动锚定还会自己挑候选去补
            //（常挑到块内已被裁掉的行）→「页面自己滚一段」。锚按钮而非块顶：按钮被钉在顶部那态下，锚块顶会把
            // 整块推出视野；只补这一帧、不逐帧跟随（逐帧会与页面/浏览器自身的补偿互相打架）。
            const anchorTop = btn.getBoundingClientRect().top;
            const vl = preEl.closest && preEl.closest('.ds-virtual-list');
            // 必须确认它真的在滚：类名在、但滚动的是页面时，写错元素等于没补
            const scroller = (vl && vl.scrollHeight > vl.clientHeight) ? vl : document.scrollingElement;
            if (currentlyFolded) expandBlock(preEl, btn);
            else collapseBlock(preEl, btn);
            const dy = btn.getBoundingClientRect().top - anchorTop;
            if (scroller && Math.abs(dy) > 1) scroller.scrollTop += dy;
        });
        return btn;
    }

    function addFoldButtonToCodeBlock(preEl) {
        if (preEl.hasAttribute(processedAttr)) return;
        const targetContainer = findButtonContainer(preEl);
        if (targetContainer) {
            if (targetContainer.querySelector('.ds-fold-btn')) {
                preEl.setAttribute(processedAttr, 'true');
                return;
            }
            targetContainer.appendChild(createFoldButton(preEl));
        } else {
            const wrapper = document.createElement('div');
            wrapper.className = 'ds-fold-btn-wrapper';
            wrapper.style.textAlign = 'right';
            wrapper.style.marginBottom = '6px';
            wrapper.appendChild(createFoldButton(preEl));
            preEl.parentNode.insertBefore(wrapper, preEl);
        }
        preEl.setAttribute(processedAttr, 'true');
    }

    function processAllExistingCodeBlocks() {
        document.querySelectorAll('pre').forEach(block => {
            if (!block.hasAttribute(processedAttr)) addFoldButtonToCodeBlock(block);
        });
    }

    function cleanupLegacyWrappers() {
        document.querySelectorAll('.ds-fold-btn-wrapper').forEach(w => w.remove());
    }

    function deduplicateButtons() {
        // 通过按钮文字或类名找到按钮容器，去重其中的折叠按钮
        const seen = new Set();
        // 新版按钮：.code-info-button-text
        document.querySelectorAll('.code-info-button-text').forEach(span => {
            const btn = span.closest('[role="button"], .ds-button');
            if (!btn) return;
            const container = btn.parentElement;
            if (!container || seen.has(container)) return;
            seen.add(container);
            const btns = container.querySelectorAll('.ds-fold-btn');
            if (btns.length > 1) for (let i = 1; i < btns.length; i++) btns[i].remove();
        });
        // 旧版按钮：.ds-text-button
        document.querySelectorAll('.ds-text-button').forEach(btn => {
            const container = btn.parentElement;
            if (!container || seen.has(container)) return;
            seen.add(container);
            const btns = container.querySelectorAll('.ds-fold-btn');
            if (btns.length > 1) for (let i = 1; i < btns.length; i++) btns[i].remove();
        });
    }



    // ==================== 表格优化逻辑 ====================
    // 根据内容文本长度计算列宽百分比（采样表头+前5行）
    function calcColumnWeights(table, colCount) {
        const weights = new Array(colCount).fill(0);
        const rows = table.querySelectorAll('tr');
        const limit = Math.min(rows.length, 6);
        for (let r = 0; r < limit; r++) {
            const cells = rows[r].cells;
            for (let c = 0; c < Math.min(cells.length, colCount); c++) {
                const len = (cells[c].textContent || '').length;
                if (len > weights[c]) weights[c] = len;
            }
        }
        for (let c = 0; c < colCount; c++) {
            if (weights[c] < 1) weights[c] = 1;
        }
        const total = weights.reduce((a, b) => a + b, 0);
        return weights.map(w => ((w / total) * 100).toFixed(2) + '%');
    }

    function applyTableStyles(table) {
        // maxWidth 约束：所有模式统一，表格宽度不得超过容器
        const vc = document.querySelector('.ds-virtual-list-visible-items');
        let maxW;
        if (vc) {
            maxW = vc.clientWidth + 'px';
            table.style.maxWidth = maxW;
            vc.style.overflowX = 'visible';
            vc.style.maxWidth = '100%';
        } else {
            maxW = '100%';
            table.style.maxWidth = maxW;
        }

        // 列宽策略
        if (tableWidthMode === 'auto') {
            // 自适应模式：根据内容比例分配列宽，严格限制在 maxWidth 内
            table.style.tableLayout = 'fixed';
            table.style.width = maxW;
            const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
            if (headerRow && headerRow.cells.length) {
                const pcts = calcColumnWeights(table, headerRow.cells.length);
                for (let i = 0; i < pcts.length; i++) {
                    headerRow.cells[i].style.width = pcts[i];
                    headerRow.cells[i].style.minWidth = '';
                }
            }
        } else if (tableWidthMode === 'equal-minwidth') {
            table.style.width = '100%';
            const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
            const colCount = headerRow ? headerRow.cells.length : 1;
            // 计算可用容器宽度
            const containerWidth = vc ? vc.clientWidth : (table.parentElement ? table.parentElement.clientWidth : window.innerWidth);
            if (colCount * 80 > containerWidth) {
                // 总最小宽度超出容器 → 自动切换自适应模式（内容比例分配）
                table.style.tableLayout = 'fixed';
                table.style.width = maxW;
                if (headerRow) {
                    const pcts = calcColumnWeights(table, colCount);
                    for (let i = 0; i < pcts.length; i++) {
                        headerRow.cells[i].style.width = pcts[i];
                        headerRow.cells[i].style.minWidth = '';
                    }
                }
                if (!table.dataset.dsWidthWarned) {
                    table.dataset.dsWidthWarned = '1';
                    showToast(`列数较多（${colCount}列），已自动切换为自适应列宽`, 3000);
                }
            } else {
                table.style.tableLayout = 'fixed';
                const per = (100 / colCount).toFixed(2) + '%';
                for (let i = 0; i < colCount; i++) {
                    headerRow.cells[i].style.width = per;
                    headerRow.cells[i].style.minWidth = '80px';
                }
            }
        } else {
            // equal
            table.style.width = '100%';
            table.style.tableLayout = 'fixed';
            const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
            if (headerRow && headerRow.cells.length) {
                const per = (100 / headerRow.cells.length).toFixed(2) + '%';
                for (let i = 0; i < headerRow.cells.length; i++) {
                    headerRow.cells[i].style.width = per;
                    headerRow.cells[i].style.minWidth = '';
                }
            }
        }

        if (getComputedStyle(table).position !== 'relative') table.style.position = 'relative';

        table.querySelectorAll('th,td').forEach(cell => {
            cell.style.whiteSpace = 'normal';
            cell.style.overflowWrap = 'anywhere';
            cell.style.wordBreak = 'break-word';
        });

        // 仅处理直接包裹表格的 .ds-scroll-area 容器，避免破坏祖先布局
        const scrollArea = table.closest('.ds-scroll-area');
        if (scrollArea) {
            scrollArea.style.overflowX = 'visible';
        }

        // 所有处理完成，显示表格
        table.style.opacity = '1';
    }

    // 深拷贝表格并清洗脚本注入的内联样式/辅助节点，供 PNG/CSV/MD 复用。
    // **必须摘掉表内的导出按钮容器**：导出 iframe 里定位祖先那条样式被跳过，容器会落到视口右下角、印进图里。
    function getCleanTableClone(table) {
        const clone = table.cloneNode(true);
        clone.style.opacity = '1';
        const btnBox = clone.querySelector('.table-internal-buttons');
        if (btnBox) btnBox.remove();
        // 清洗 applyTableStyles 注入的内联样式；克隆脱离文档，属性与类名无需清理（角标只 PNG 剥）
        clone.style.tableLayout = '';
        clone.style.width = '';
        clone.style.maxWidth = '';
        clone.style.position = '';
        clone.querySelectorAll('th,td').forEach(cell => {
            cell.style.width = '';
            cell.style.whiteSpace = '';
            cell.style.overflowWrap = '';
            cell.style.wordBreak = '';
        });
        return clone;
    }

    async function exportTableAsPNG(table) {
        if (!window.html2canvas) { alert('html2canvas 未加载'); return; }
        let iframe = null;
        try {
            // 深拷贝表格并清洗注入样式（PNG/CSV/MD 共用导出主体）
            const clone = getCleanTableClone(table);
            // 引用角标 / 外链图标一律不画进 PNG（坐标按原页面算，脱离页面会飘到别的列）；只在这里剥，CSV/MD 按开关保留
            clone.querySelectorAll('a, span, sup, i, em').forEach(el => {
                if (exportDecoText(el, false) !== null) el.remove();
            });

            // 收集页面上表格相关样式（全局注入 + DeepSeek 变量）
            const styles = collectTableStyles();

            // 构建隔离 iframe
            iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;';
            iframe.srcdoc = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>${styles}</style></head>
<body style="margin:16px;">${clone.outerHTML}</body></html>`;

            document.body.appendChild(iframe);

            // 等待 iframe 加载完成
            await new Promise((resolve, reject) => {
                iframe.onload = resolve;
                iframe.onerror = reject;
                setTimeout(resolve, 3000); // 超时保护
            });

            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            const iframeTable = iframeDoc.querySelector('table');
            if (!iframeTable) throw new Error('iframe 中未找到表格元素');

            const canvas = await html2canvas(iframeTable, {
                scale: 3,   // 提升 PNG 导出分辨率（v4.7.0）
                backgroundColor: '#ffffff',
                logging: false,
            });

            // 导出
            canvas.toBlob(blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.download = `table_${Date.now()}.png`;
                    a.href = url;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 100);
                } else {
                    // toBlob 返回 null，回退 dataURL
                    try {
                        const dataUrl = canvas.toDataURL('image/png');
                        fetch(dataUrl).then(r => r.blob()).then(blob => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.download = `table_${Date.now()}.png`;
                            a.href = url;
                            a.click();
                            setTimeout(() => URL.revokeObjectURL(url), 100);
                        }).catch(() => alert('导出PNG失败：无法生成图片数据'));
                    } catch (_) {
                        alert('导出PNG失败：canvas 被污染，无法导出');
                    }
                }
            }, 'image/png');

        } catch (e) {
            console.error('PNG导出异常:', e);
            alert('导出PNG失败：' + (e.message || '未知错误'));
        } finally {
            if (iframe) setTimeout(() => iframe.remove(), 200);
        }
    }

    // 收集页面上表格所需的样式，注入 iframe
    function collectTableStyles() {
        let css = '';

        const isDark = document.body.classList.contains('dark');
        const mode = tableThemeMode;

        // 从页面提取表格相关样式（.ds-markdown 表格部分，含脚本注入的规则）
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules || []) {
                    const txt = rule.cssText;
                    if (txt.includes('table') || txt.includes('th') || txt.includes('td') ||
                        txt.includes('.ds-markdown') || txt.includes('.md-code-block')) {
                        // 跳过脚本自己注入的布局与导出按钮样式（后者不该出现在导出内容里）
                        if (txt.includes('table-layout: fixed') || txt.includes('table-internal-buttons')) continue;
                        css += txt + '\n';
                    }
                }
            } catch (_) {
                // 跨域样式表无法读取，忽略
            }
        }

        // 基础表格样式（兜底，根据当前主题模式选择配色）
        const bodyBg = getComputedStyle(document.body).backgroundColor || '#ffffff';
        css += /*css*/`
            body { background: ${bodyBg}; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
            table {
                width: 100%; border-collapse: separate; border-spacing: 0;
                margin: 1em 0; border-radius: 12px; overflow: hidden;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            }
            th, td {
                padding: 12px 16px; vertical-align: top;
                font-size: 14px; line-height: 1.5;
                white-space: normal; word-wrap: break-word;
            }
            th { font-weight: 600; }
            /* 单元格内联代码的兜底样式（PNG iframe 导出图里的 code） */
            table code {
                background: rgba(128,128,128,0.1); padding: 2px 4px;
                border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.9em;
            }
            ${mode === 'auto' ? /* 自动透明叠加 */`
                th, td { border: 1px solid rgba(128,128,128,0.2); }
                th { background: rgba(128,128,128,0.08); border-bottom: 1px solid rgba(128,128,128,0.2); }
                tbody tr:nth-child(even) { background-color: rgba(128,128,128,0.04); }
            ` : isDark ? /* 双模式 — 深色 */`
                th, td { border: 1px solid #2d2d3d; }
                th { background: #1e1e2d; border-bottom: 1px solid #2d2d3d; color: #e4e4e8; }
                tbody tr:nth-child(even) { background-color: rgba(255,255,255,0.03); }
            ` : /* 双模式 — 浅色 */`
                th, td { border: 1px solid #e5e7eb; }
                th { background: #f3f4f6; border-bottom: 1px solid #e5e7eb; color: #1f2937; }
                tbody tr:nth-child(even) { background-color: #fafafa; }
            `}
        `;

        return css;
    }

    function exportTableAsCSV(table) {
        const clone = getCleanTableClone(table);   // 基于清洗克隆，避免读取页面注入样式/按钮
        const rows = [];
        const thead = clone.querySelector('thead');
        if (thead) thead.querySelectorAll('tr').forEach(tr => {
            const rd = []; tr.querySelectorAll('th').forEach(th => rd.push(getCellText(th)));
            if (rd.length) rows.push(rd);
        });
        const tbody = clone.querySelector('tbody');
        if (tbody) tbody.querySelectorAll('tr').forEach(tr => {
            const rd = []; tr.querySelectorAll('td').forEach(td => rd.push(getCellText(td)));
            if (rd.length) rows.push(rd);
        });
        else clone.querySelectorAll('tr').forEach(tr => {
            const rd = []; tr.querySelectorAll('td,th').forEach(c => rd.push(getCellText(c)));
            if (rd.length) rows.push(rd);
        });
        if (!rows.length) { alert('无数据'); return; }
        const csv = rows.map(r => r.map(c => {
            if (c.includes(',') || c.includes('"') || c.includes('\n')) c = '"' + c.replace(/"/g,'""') + '"';
            return c;
        }).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `table_${Date.now()}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 100);
    }

    // 导出按钮的统一入口：兜住异常并给出反馈；PNG 导出是 async，同步 try/catch 兜不住 rejected promise。
    function runTableExport(fn, table, label) {
        const onErr = e => {
            console.error('[dst] ' + label + '导出异常:', e);
            alert(label + '导出失败：' + (e && e.message ? e.message : e));
        };
        try {
            const r = fn(table);
            if (r && typeof r.catch === 'function') r.catch(onErr);
        } catch (e) { onErr(e); }
    }

    // 导出为 Markdown 表格并复制到剪贴板（📝）
    function exportTableAsMD(table) {
        const clone = getCleanTableClone(table);
        const rows = [];
        const thead = clone.querySelector('thead');
        if (thead) thead.querySelectorAll('tr').forEach(tr => {
            const rd = []; tr.querySelectorAll('th').forEach(th => rd.push(getCellTextForMarkdown(th)));
            if (rd.length) rows.push(rd);
        });
        // 有表头时追加分隔行
        if (rows.length) rows.push(rows[0].map(() => '---'));
        const tbody = clone.querySelector('tbody');
        if (tbody) tbody.querySelectorAll('tr').forEach(tr => {
            const rd = []; tr.querySelectorAll('td').forEach(td => rd.push(getCellTextForMarkdown(td)));
            if (rd.length) rows.push(rd);
        });
        else clone.querySelectorAll('tr').forEach((tr, idx) => {
            const rd = []; tr.querySelectorAll('td,th').forEach(c => rd.push(getCellTextForMarkdown(c)));
            if (!rd.length) return;
            if (idx === 0 && rows.length === 0) rows.push(rd.map(() => '---')); // 无表头：首行后补分隔
            rows.push(rd);
        });
        if (!rows.length) { alert('无数据'); return; }
        const md = rows.map(r => '| ' + r.join(' | ') + ' |').join('\n');
        // 非安全上下文 / 沙盒下 navigator.clipboard 不可用或被拒 → 回退隐藏 textarea + execCommand('copy')
        copyTextWithFallback(md, '表格已复制为 Markdown');
    }

    // 通用剪贴板写入：Clipboard API → 隐藏 textarea 兜底（不可用或被拒时），都失败才报错
    function copyTextWithFallback(text, successMsg) {
        const fallback = () => {
            const ta = document.createElement('textarea');
            ta.value = text; ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
            document.body.appendChild(ta);
            ta.select(); ta.setSelectionRange(0, ta.value.length);
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        };
        const done = () => showToast(successMsg);
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(text).then(done).catch(() => {
                // 兜底自身也可能抛（execCommand 在个别环境会异常）→ 包住，避免变成未处理的 rejection
                let ok = false;
                try { ok = fallback(); } catch (e) { console.error('[dst] 剪贴板兜底写入异常:', e); }
                if (ok) done(); else alert('导出失败：剪贴板写入被拒绝');
            });
        } else {
            if (fallback()) done(); else alert('导出失败：当前环境不支持剪贴板写入');
        }
    }

    // 单元格链接补地址：MD 出 [文字](地址)、CSV 出「文字 (地址)」；裸 URL（文字===地址）不重复书写
    function linkText(a, forMarkdown) {
        const href = a.getAttribute('href') || '', label = a.textContent.trim();
        if (!href || label === href) return label;
        return forMarkdown ? `[${label}](${href})` : `${label} (${href})`;
    }

    // 引用角标（`<a href=…>`，文字形如「-9」）与外链图标（只有短横、且前面已有正文）都不是正文；返回
    // null=非装饰 / ''=丢弃 / 字符串=保留时替换成的文本（判据取自实测导出文件）。
    // **外链图标就是「纯短横的 span」，这里故意不要求 href/类名** —— 宁可极少见地误删正文里的短横，
    // 也不让图标回到 PNG（这是需求，不是疏漏，别"顺手收紧"）。
    function exportDecoText(el, forMarkdown) {
        const t = (el.textContent || '').trim(), href = el.getAttribute ? el.getAttribute('href') : null;
        const isCite = !!href && /^[-–—]\s*\d{1,3}$/.test(t);
        const prev = el.previousSibling;
        const isIcon = !isCite && /^[-–—]+$/.test(t) && !!prev && !!(prev.textContent || '').trim();
        if (!isCite && !isIcon) return null;
        if (isIcon || !keepExportCites) return '';
        const label = t.replace(/^[-–—\s]+/, '');
        return forMarkdown ? `[${label}](${href})` : `${label} (${href})`;
    }

    // 提取带 Markdown 行内语法（`code` / **加粗** / *斜体*）的单元格文本，并对管道符做转义；
    // 单元格内的 <br> 因会破坏表格“一行一格”结构，这里折叠为普通空格（与 CSV 的换行保留策略不同）
    function getCellTextForMarkdown(cell) {
        let text = '';
        cell.childNodes.forEach(n => {
            if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
            else if (n.nodeName === 'BR') text += '\n';
            else if (n.nodeType === Node.ELEMENT_NODE) {
                const deco = exportDecoText(n, true);
                if (deco !== null) text += deco;
                else if (n.tagName === 'CODE') text += '`' + n.textContent + '`';
                else if (n.tagName === 'STRONG' || n.tagName === 'B') text += '**' + n.textContent + '**';
                else if (n.tagName === 'EM' || n.tagName === 'I') text += '*' + n.textContent + '*';
                else if (n.tagName === 'A') text += linkText(n, true);
                else text += getCellTextForMarkdown(n);
            }
        });
        return text.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, ' ').trim()
            .replace(/\|/g, '\\|');
    }

    function getCellText(cell) {
        let t = '';
        cell.childNodes.forEach(n => {
            if (n.nodeType === Node.TEXT_NODE) t += n.textContent;
            else if (n.nodeName === 'BR') t += '\n';
            else if (n.nodeType === Node.ELEMENT_NODE) {
                const deco = exportDecoText(n, false);
                t += (deco !== null) ? deco : ((n.tagName === 'A') ? linkText(n, false) : getCellText(n));
            }
        });
        // 保留 <br> 产生的换行，压缩其他空白字符
        t = t.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').trim();
        return t;
    }

    // ==================== 表格导出按钮：表内嵌 + 悬停显示 ====================
    // 触显全在样式表里，这里只造按钮：没有定位/跟随/防抖/点击判定，所以比 body 级浮层少六十多行。
    const EXPORT_BTN_ATTR = 'data-ds-export-buttons';
    const DISMISS_CLASS = 'ds-export-dismissed';

    // 「×」= 本次悬停内让开：点它隐藏，mouseleave 委托撤类名即恢复（mouseleave 不冒泡，靠捕获阶段拿）
    function dismissTableExportBox(table) { table.classList.add(DISMISS_CLASS); }
    document.addEventListener('mouseleave', (e) => {
        const t = e.target;
        if (t && t.tagName === 'TABLE' && t.classList.contains(DISMISS_CLASS)) t.classList.remove(DISMISS_CLASS);
    }, true);

    function attachTableExportButtons(table) {
        if (!tableButtonsEnabled || !table) return;
        if (table.getAttribute(EXPORT_BTN_ATTR) === 'true') return;
        table.setAttribute(EXPORT_BTN_ATTR, 'true');
        const box = document.createElement('div');
        box.className = 'table-internal-buttons';
        // 通用钮：icon 传 null 走纯文字形态（「×」即用它）；图标走 iconify，加载失败回落文字
        const makeBtn = (glyph, icon, tooltip, run) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'internal-export-btn';
            b.setAttribute('data-tooltip', tooltip);
            b.textContent = glyph;
            if (icon) {
                const im = document.createElement('img');
                im.className = 'export-btn-ic';
                im.alt = '';
                im.draggable = false;
                im.src = 'https://api.iconify.design/mdi:' + icon + '.svg?color=%235b6472';
                im.addEventListener('error', () => { b.innerHTML = ''; b.textContent = glyph; });
                b.textContent = '';
                b.appendChild(im);
            }
            b.addEventListener('click', e => {
                e.stopPropagation(); e.preventDefault();
                if (!table.isConnected) { console.warn('[dst] 表格已脱离文档，导出取消'); return; }
                run(table);
            });
            return b;
        };
        box.appendChild(makeBtn('📸', 'image-outline', '导出为 PNG', t => runTableExport(exportTableAsPNG, t, 'PNG')));
        box.appendChild(makeBtn('📄', 'file-delimited-outline', '导出为 CSV', t => runTableExport(exportTableAsCSV, t, 'CSV')));
        box.appendChild(makeBtn('📝', 'language-markdown', '导出为 Markdown', t => runTableExport(exportTableAsMD, t, 'Markdown')));
        box.appendChild(makeBtn('×', null, '暂时隐藏（移出表格后恢复）', dismissTableExportBox));
        table.appendChild(box);
    }

    // 表格指纹追踪：记录每个表格的稳定计数，连续 2 次指纹不变即视为稳定
    const _tableFingerprints = new WeakMap();  // table → { fp, count, firstSeen }

    const STABLE_COUNT_NEEDED = 2;    // 连续稳定次数阈值
    const MAX_WAIT_MS = 5000;         // 最长等待时间，超时强制应用
    const TABLE_DEBOUNCE_MS = 200;    // Observer 批处理间隔

    function getTableFingerprint(table) {
        const rows = table.querySelectorAll('tr').length;
        const cells = table.querySelectorAll('td,th').length;
        return rows + ':' + cells;
    }

    function processAllTables() {
        let anyUnstable = false;
        const now = Date.now();

        document.querySelectorAll('.ds-markdown').forEach(container => {
            container.style.overflowX = 'visible';
            container.style.maxWidth = '100%';
            container.querySelectorAll('table').forEach(table => {
                const fp = getTableFingerprint(table);
                const state = _tableFingerprints.get(table);

                if (!state) {
                    // 首次见到：立即应用并标记完成
                    _tableFingerprints.set(table, { fp, count: STABLE_COUNT_NEEDED, firstSeen: now, done: true });
                    applyTableStyles(table);
                    attachTableExportButtons(table);
                    return;
                }

                if (state.done) {
                    // 已稳定应用过，指纹未变则跳过
                    if (fp === state.fp) return;
                    // 指纹变了（流式输出新增行/列），重置重新等待
                    state.fp = fp;
                    state.count = 0;
                    state.done = false;
                    anyUnstable = true;
                    return;
                }

                if (fp !== state.fp) {
                    // 指纹变化：重置计数，重新等待稳定
                    state.fp = fp;
                    state.count = 0;
                    anyUnstable = true;
                    return;
                }

                // 指纹相同：增加稳定计数
                state.count++;
                const timedOut = (now - state.firstSeen) > MAX_WAIT_MS;
                if (state.count >= STABLE_COUNT_NEEDED || timedOut) {
                    // 达到稳定阈值或超时兜底：应用样式并标记完成
                    state.count = STABLE_COUNT_NEEDED;
                    state.done = true;
                    if (timedOut) state.firstSeen = now;   // 重置计时，防止永久超时
                    applyTableStyles(table);
                    attachTableExportButtons(table);
                } else {
                    anyUnstable = true;
                }
            });
        });

        if (anyUnstable) {
            scheduleTableProcess();
        }
    }

    let _tableDebounceTimer = null;
    function scheduleTableProcess() {
        clearTimeout(_tableDebounceTimer);
        // 异步执行必须隔离：抛错会静默中断本轮全部表格处理且没有 [dst] 日志
        _tableDebounceTimer = setTimeout(() => safeRun(processAllTables, '表格刷新'), TABLE_DEBOUNCE_MS);
    }

    // ==================== AI 思考区域「定高滚动预览窗口」 ====================
    // 只做视觉态（定高夹断 + 滚动），不折叠、不模拟点击；原版那套「自动折叠 + 模拟点击」已整体移除。

    // 从标题行向上找「它自己那一段」的 .ds-think-content。**必须限定在同一条消息内**：越过消息边界会
    // 命中别的块的正文（表现为「点 A 块却撤掉 B 块的夹断 + 页面位移」）。收起态正文不在 DOM 里 → null。
    function findThinkContent(titleBar) {
        const msg = titleBar.closest ? titleBar.closest('.ds-message') : null;
        const stopAt = msg || document.body;
        let parent = titleBar.parentElement;
        while (parent && parent !== stopAt) {
            const tc = parent.querySelector('.ds-think-content');
            if (tc) return tc;
            parent = parent.parentElement;
        }
        // 兜底：先限定在「标题行自己所属的统一容器」里找，避免落到同一条消息内**另一个**思考块的正文
        const owner = findThinkWrapper(titleBar);
        const segs = owner ? owner.querySelectorAll('.ds-think-content') : null;
        if (segs && segs.length) return segs[0];
        return msg ? msg.querySelector('.ds-think-content') : null;
    }

    let _thinkCaptureAdded = false;

    // 给思考内容加 CSS 夹断（max-height + overflow-y:auto）：视觉态、非折叠动作，流式生成时自动生效。
    const THINK_FOLLOW_TOLERANCE = 24;        // 距底部多少 px 内视为「跟随最新」状态
    const _thinkPreviewState = new WeakMap(); // 思考内容盒（不含标题行）-> { enabled, following, scrollHooked }

    // 取真正在滚的元素：虚拟列表存在**且确实在滚**才用它，否则退回文档 —— 类名在、但实际滚的是页面时，
    // 写错元素等于没跟/没补。
    function thinkScrollHost() {
        const vl = document.querySelector('.ds-virtual-list');
        return (vl && vl.scrollHeight > vl.clientHeight) ? vl : document.scrollingElement;
    }

    // 语义查找思考标题行（不依赖打包哈希类）：遍历叶子 div，取含「已思考」或「正在思考」的最深元素。
    // 两种文案都要认 —— 流式期是「正在思考」，只认「已思考」等于哈希类失效时**正在生成中的块全部失联**。
    function findThinkTitleBarBySemantic(container) {
        if (!container || !container.getElementsByTagName) return null;
        let best = null;
        const all = container.getElementsByTagName('div');
        for (let i = 0; i < all.length; i++) {
            const el = all[i];
            if (el.children && el.children.length) continue; // 只取叶子 div
            const t = (el.textContent || '').trim();
            if (!t.includes('已思考') && !t.includes('正在思考')) continue;
            best = el; // 取文档顺序最靠后的叶子 div（实测即最内层的文案节点）
        }
        return best;
    }

    // 查找「统一思考容器」：一次思考 = 标题行 + 多个交替的 [思考文本段 .ds-think-content] + [工具调用区]，
    // 它们共用一个父容器。预览必须作用在这层，否则每个思考段/工具区会被各自夹断成多个窗口。
    function findThinkWrapper(tc) {
        let node = tc.parentElement;
        while (node && node !== document.body) {
            // 跳过自建包裹层（必须 continue）：回退结构下它包住含标题行的整块，会被误判成统一容器 → 内叠
            if (node.classList && node.classList.contains('ds-think-preview-wrap')) {
                node = node.parentElement;
                continue;
            }
            // 只查 node 自身子树（不可放宽到「整条消息」）：那会命中别的思考块的标题行，在错误祖先层误判。
            if (node.querySelector) {
                if (node.querySelector('div[class*="_5ab5d64"]')) return node;
                if (findThinkTitleBarBySemantic(node)) return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    // 预览窗口夹在哪一层：**优先**「思考内容盒」（统一容器的直接子级里、含全部思考段与工具调用区、
    // 不含标题行的那层）；不满足时退回整块统一容器 —— 一次思考只能有一个窗口，绝不能每个搜索段各框一个。
    function findThinkContentBox(tc) {
        // 已有预览窗口直接复用：分离表头后标题行已移出滚动容器，再走 findThinkWrapper 会误判到更外层
        const existing = tc.closest && tc.closest('.ds-think-preview');
        if (existing) return existing;
        const wrap = findThinkWrapper(tc);
        if (!wrap) return tc;
        let node = tc;
        while (node.parentElement && node.parentElement !== wrap) node = node.parentElement;
        // 归一化：自建包裹层里真正的内容盒是「包含 tc 的那个子元素」。函数必须幂等 —— 同一结构任意次
        // 调用都要返回同一元素，否则会无限内叠。
        if (node.classList && node.classList.contains('ds-think-preview-wrap')) {
            node = [...node.children].find(c => c.contains(tc)) || node;
        }
        const titleBar = wrap.querySelector('div[class*="_5ab5d64"]') || findThinkTitleBarBySemantic(wrap);
        // 结构不典型（该层把标题行也包含进来）→ 无法分离，退回整块容器
        if (titleBar && node.contains(titleBar)) return wrap;
        // 覆盖度校验：内容盒必须包含该思考块的全部内容段，否则退回整块容器（保证「一次思考 = 一个窗口」）。
        if (node.querySelectorAll('.ds-think-content').length !== wrap.querySelectorAll('.ds-think-content').length) {
            return wrap;
        }
        return node;
    }

    // 元素内部自带的「已思考」标题行。**只查自身子树** —— 放宽到消息级会把别的思考块的标题行误判成表头带。
    function findThinkHeadInside(tc) {
        if (!tc.querySelector) return null;
        return tc.querySelector('div[class*="_5ab5d64"]') || findThinkTitleBarBySemantic(tc);
    }

    // 「展开补偿」的锚点 ＝ **我们真正搬动的那个节点**：表头带（`ds-think-preview-headrow`）。
    // 夹断生效时它已被 splitThinkHeaderBand 移出内容盒，所以 findThinkHeadInside(unit) 查不到（它只查自身
    // 子树）；退回内容盒当锚点，就会把「表头带归位」的高度差也算成位移 → 每次展开凭空补一下。结构里没有独立
    // 表头带（标题行与内容同层）时才退回标题行本身 —— 判据取自同一 headrow 标记（splitThinkHeaderBand
    // 另需它是「内容盒的直接子级」才搬）。
    function thinkShiftAnchor(unit) {
        const wrap = unit.parentElement;
        const head = (wrap && wrap.classList.contains('ds-think-preview-wrap') ? findThinkHeadInside(wrap) : null) ||
            findThinkHeadInside(unit);
        if (!head) return unit;
        const row = head.parentElement;
        return (row && row.classList.contains('ds-think-preview-headrow')) ? row : head;
    }

    // ==================== 分离表头带 ====================
    // 把「纯表头容器」整根移出滚动容器放进包裹层：内容与滚动条被几何限制在表头以下，「内容越过表头 /
    // 滚动条压住表头」两个死结从结构上消失。幂等，只搬带 headrow 标记的直接子级。
    function splitThinkHeaderBand(tc) {
        const head = findThinkHeadInside(tc);
        const row = head && head.parentElement;
        if (!row || !row.classList.contains('ds-think-preview-headrow')) return;
        const wrap = tc.parentElement;
        if (!wrap || !wrap.classList.contains('ds-think-preview-wrap')) return;
        if (row.parentElement === wrap) return;   // 已分离
        if (row.parentElement !== tc) return;     // 只搬「容器直接子级」的表头带，其余结构不动
        wrap.insertBefore(row, tc);
    }

    // 分离的逆操作：把表头带放回滚动容器首位。**必须在拆包裹层之前调用** ——
    // wrap.remove() 会把还留在里面的 React 节点一起销毁，页面后续更新该思考块时会崩。
    function restoreThinkHeaderBand(tc) {
        const wrap = tc.parentElement;
        if (!wrap || !wrap.classList.contains('ds-think-preview-wrap')) return;
        // 每个 child 都插到 tc.firstChild，倒序才能还原兄弟顺序；跳过非元素节点（页面自己也可能往这层
        // 塞过东西，访问 classList 会抛错并连带中断整轮 refresh）。
        [...wrap.children].reverse().forEach(child => {
            if (child === tc) return;
            if (!child.classList) return;
            child.classList.remove('ds-think-preview-headrow');
            tc.insertBefore(child, tc.firstChild);
        });
    }

    // 在滚动容器外包一层相对定位层（表头带会被搬进它里面，见 splitThinkHeaderBand）。幂等。
    // tc 已脱离文档时返回 null —— 否则 insertBefore 会抛 DOMException，调用方需据此放弃本轮。
    function ensureThinkPreviewWrap(tc) {
        let wrap = tc.parentElement;
        if (wrap && wrap.classList.contains('ds-think-preview-wrap')) return wrap;
        const parent = tc.parentElement;
        if (!parent) return null;
        wrap = document.createElement('div');
        wrap.className = 'ds-think-preview-wrap';
        parent.insertBefore(wrap, tc);
        wrap.appendChild(tc);
        return wrap;
    }

    // 拆除包裹层，恢复 wrapper 原父级结构（removeThinkPreview / 收起态清理时调用）
    function unwrapThinkPreviewWrap(tc) {
        restoreThinkHeaderBand(tc);   // 先把分离出去的表头带放回去，再拆 —— 否则它会随 wrap 一起被销毁
        const parent = tc.parentElement;
        if (parent && parent.classList.contains('ds-think-preview-wrap')) {
            const grand = parent.parentElement;
            if (grand) grand.insertBefore(tc, parent);
            parent.remove();
        }
    }

    // 该块是否还留着我们的痕迹（夹断 class 或包裹层）：用于「该清就清」的判定
    function hasThinkPreviewResidue(wrapper) {
        return wrapper.classList.contains('ds-think-preview') ||
            !!(wrapper.parentElement && wrapper.parentElement.classList.contains('ds-think-preview-wrap'));
    }

    // 是否「页面原生收起」（收起态只剩表头高度）。**必须实测几何** —— 收起后我们的标记往往还在，查标记
    // 会误判成「展开」→ 点击被脚本接管、原生 toggle 被阻断，表现为「收起来之后再也点不开」。
    function isThinkCollapsedLive(tc) {
        const head = findThinkHeadInside(tc);
        const boxH = tc.getBoundingClientRect().height;
        if (!head) return boxH <= 0;
        return (boxH - head.getBoundingClientRect().height) <= 12;
    }

    // 是否「真的在夹断」（内容高于定高）：决定点击是「脚本接管展开」还是「交还原生」的判据。
    function isThinkPreviewClamped(tc) {
        return !!(tc && tc.scrollHeight > tc.clientHeight + 1);
    }

    // 是否「真的不可见」：自身或任一祖先被 display:none / visibility:hidden / opacity:0 藏起来。
    // **必须沿祖先链查** —— 页面收起正文是把外层容器设为 opacity:0，段落自身仍是 1。
    function isNodeHidden(el, root) {
        let n = el;
        while (n && n.nodeType === Node.ELEMENT_NODE) {
            const cs = getComputedStyle(n);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
            if (n === root) break;
            n = n.parentElement;
        }
        return false;
    }

    // 页面是否已把正文藏起来（它自己认为「已收起」）：只要页面认为已收起，这一击就必须交还原生去展开。
    function isThinkBodyHidden(tc) {
        if (!tc || !tc.querySelectorAll || !tc.nodeType) return true;
        const segs = tc.querySelectorAll('.ds-think-content');
        if (!segs.length) return true;   // 连段落都没有 → 收起态
        for (let i = 0; i < segs.length; i++) {
            if (!isNodeHidden(segs[i], tc)) return false;
        }
        return true;
    }

    // 是否「交还原生」（两个开关都没开）：已套上的会被撤掉。
    function isThinkPreviewOff() {
        return thinkDisplayMode === 'native';
    }

    // 是否「只显示标题行」：正文压成 0；标题行分不出来的结构由 enforceThinkPreviewInline 自行回退
    function isThinkHiddenMode() {
        return thinkDisplayMode === 'hidden';
    }

    // 切换显示方式：落盘 → 重套（内部会刷新/重建）→ 提示。面板两个开关都走这一处
    function setThinkDisplayMode(mode) {
        thinkDisplayMode = mode;
        GM_setValue(STORAGE_THINK_DISPLAY, mode);
        safeRun(applyThinkPreviewHeight, '思考预览定高重应用');   // 失败也要把下面的提示发出去，否则开关点了像没生效
        showToast('思维链显示方式：' + (mode === 'preview' ? '定高预览窗口' : mode === 'hidden' ? '只显示标题行' : '原生'));
    }

    // 正文总高 ≤ 阈值时不套窗口（阈值 0 = 不设）。用 scrollHeight：夹断生效时它仍是正文真实总高。
    function isThinkTooShortForPreview(tc) {
        const min = thinkPreviewMinHeight > 0 ? thinkPreviewMinHeight : 0;
        if (!min) return false;
        return (tc.scrollHeight || 0) <= min;
    }

    // 应用思考预览定高：写 CSS 变量（CSS/内联双路读它）→ 刷新已套的窗口 → 重建被关掉过的窗口。
    function applyThinkPreviewHeight() {
        const off = isThinkPreviewOff();
        // 所有窗口会同时改高：锚点必须取「用户正看着的那个窗口」（锚在视口外的窗口上等于没补）；
        // 视口里没有窗口时退到视口中心元素兜底。
        const vh = window.innerHeight;
        let anchor = null;
        document.querySelectorAll('.ds-think-preview').forEach(el => {
            const r = el.getBoundingClientRect();
            if (!anchor && r.bottom > 0 && r.top < vh) anchor = el;
        });
        anchor = anchor || document.elementFromPoint(Math.floor(window.innerWidth / 2), Math.floor(vh / 2));
        const beforeTop = anchor ? anchor.getBoundingClientRect().top : 0;
        // 关闭时变量仍写一个安全值（200px），避免 CSS 里 var() 回退到 0 把内容压没
        document.documentElement.style.setProperty('--ds-think-preview-height',
            (off ? 200 : Math.max(1, thinkPreviewHeight)) + 'px');
        // 已套的窗口：关闭 / 低于阈值 → 撤掉；否则按新高度重新夹断
        document.querySelectorAll('.ds-think-preview').forEach(wrapper => {
            const state = _thinkPreviewState.get(wrapper) || {};
            if (off || (!isThinkHiddenMode() && isThinkTooShortForPreview(wrapper))) { softenThinkPreview(wrapper, state); return; }
            if (state.enabled) enforceThinkPreviewInline(wrapper, state);
        });
        // 0 → 非 0 时上面的选择器已经捞不到窗口（class 早被撤掉），必须整轮重扫才能重建
        refreshThinkPreviews();
        // 把所有窗口的高度变化在锚点上补掉 → 视口里看到的内容原地不动
        if (anchor && anchor.isConnected) {
            const dy = anchor.getBoundingClientRect().top - beforeTop;
            if (Math.abs(dy) > 1) {
                const scroller = thinkScrollHost();
                if (scroller) scroller.scrollTop += dy;
            }
        }
    }

    // 标题行「自然高度」：一旦我们把表头带搬出内容盒，页面会用**另一种更紧凑的结构**重渲染标题行
    //（实测同一页面对比：原生 = 图标16 + 文字span34 + 图标14 → 行高 34；夹断态 = 两个 div(28/24) → 行高 28）。
    // 展开后恢复原高 → 视觉上就是「标题行内的文字轻微下移」。做法：在**表头带被移出内容盒之前**（即本函数
    // 首次执行时）记下它的自然高度，
    // 夹断期间用内联 min-height 顶住；取历史最大值（流式期间会量到偏矮的临时值），夹断结束由
    // clearThinkHeadMarks 撤掉。不写死像素值 —— 主题/字号变化时自校准。
    const _headRowNaturalH = new WeakMap();
    function pinHeadRowHeight(row) {
        if (!row || !row.getBoundingClientRect) return;
        const h = Math.round(row.getBoundingClientRect().height);
        if (h >= 20 && h > (_headRowNaturalH.get(row) || 0)) _headRowNaturalH.set(row, h);
        const nat = _headRowNaturalH.get(row);
        if (nat) row.style.minHeight = nat + 'px';
    }

    // 内联夹断做双保险，防页面动态/高特异性样式覆盖导致「撑破」；定高写 var() 以便变量一变浏览器自己重算。
    function enforceThinkPreviewInline(tc, state) {
        if (!state.enabled) return;
        // 「只显示标题行」只有在标题行确实已被移出容器（findThinkHeadInside 为空）时才敢压成 0；分不出来的结构照旧走窗口
        const hide = isThinkHiddenMode() && !findThinkHeadInside(tc);
        tc.style.setProperty('max-height', hide ? '0px' : THINK_PREVIEW_MAX_H, 'important');
        tc.style.setProperty('overflow-y', hide ? 'hidden' : 'auto', 'important');
        tc.style.setProperty('overflow-x', 'hidden', 'important');
        // 包裹层必须已在（enableThinkPreview 先建后夹）：没有它说明这轮预览没建立起来 → 不标记表头。
        const wrap = tc.parentElement;
        if (!wrap || !wrap.classList || !wrap.classList.contains('ds-think-preview-wrap')) return;
        // 标记标题行与「纯表头容器」（splitThinkHeaderBand 的唯一判据）；每轮重做 —— 虚拟列表重建会丢 class。
        const head = findThinkHeadInside(tc);
        if (!head) return;
        head.classList.add('ds-think-preview-head');
        const row = head.parentElement;
        if (row && row !== tc) {
            // 父级只比标题行高 ≤12px（容 padding）才算纯表头容器；还包着正文就不能搬（会把正文一起移出去）
            const headerOnly = (row.getBoundingClientRect().height - head.getBoundingClientRect().height) <= 12;
            row.classList.toggle('ds-think-preview-headrow', headerOnly);
            if (headerOnly) pinHeadRowHeight(row);   // 顶住「夹断态标题行被渲染得更紧凑」的 6px
        }
    }

    // 启用预览窗口：加夹断 class + 包一层定位层（表头带会被搬进它里面，见 splitThinkHeaderBand）
    function enableThinkPreview(tc, state) {
        // 虚拟列表滚动重建时 class 可能被清掉而 state 仍在，此时必须允许重新启用
        if (state.enabled && tc.classList.contains('ds-think-preview')) return;
        state.enabled = true;
        state.following = true;
        tc.classList.add('ds-think-preview');
        // 先建包裹层（表头带要搬进去）；tc 已脱离文档时建不了 → 立即回退为「不处理」。
        if (!ensureThinkPreviewWrap(tc)) {
            tc.classList.remove('ds-think-preview');
            state.enabled = false;
            return;
        }
        enforceThinkPreviewInline(tc, state);  // 夹断 + 标记纯表头容器（下面的分离依赖这个标记）
        splitThinkHeaderBand(tc);              // 分离表头带：移出滚动容器，内容/滚动条被几何限制在表头以下
        enforceThinkPreviewInline(tc, state);  // 分离后重算：「只显示标题行」要等标题行真的移出来才敢压成 0
        if (!state.scrollHooked) {
            state.scrollHooked = true;
            tc.addEventListener('scroll', () => {
                // 用户上滑阅读 → 暂停自动跟最新；滚回底部 → 恢复
                state.following = (tc.scrollTop + tc.clientHeight >= tc.scrollHeight - THINK_FOLLOW_TOLERANCE);
            }, { passive: true });
        }
    }

    // 摘掉表头带标记（-head / -headrow）：残留会干扰下一轮重算；扫子树，不依赖 findThinkHeadInside 命中。
    // 同时撤掉 pinHeadRowHeight 写的内联 min-height（夹断结束就该把标题行完全交还页面）。
    function clearThinkHeadMarks(tc) {
        const unpin = row => { row.classList.remove('ds-think-preview-headrow'); row.style.removeProperty('min-height'); };
        const head = findThinkHeadInside(tc) ||
            (tc.querySelector && tc.querySelector('.ds-think-preview-head'));
        if (head) {
            head.classList.remove('ds-think-preview-head');
            if (head.parentElement) unpin(head.parentElement);
        }
        tc.querySelectorAll('.ds-think-preview-headrow').forEach(unpin);
    }

    // 释放预览：摘夹断、清内联与表头标记。**默认不搬 DOM**（不传 hard）—— 搬节点会打断页面自身的
    // 收起/展开（点不动），所以轻量清理只撤夹断（表头带留在包裹层里）；hard=true 才完整拆除（拆 wrap + 表头带归位）。
    function softenThinkPreview(tc, state, hard) {
        tc.classList.remove('ds-think-preview');
        tc.style.removeProperty('max-height');
        tc.style.removeProperty('overflow-y');
        tc.style.removeProperty('overflow-x');
        clearThinkHeadMarks(tc);
        const wrap = tc.parentElement;
        if (hard && wrap && wrap.classList.contains('ds-think-preview-wrap')) unwrapThinkPreviewWrap(tc);
        if (state) state.enabled = false;
    }

    // 完整拆除（去夹断 → 原生全展开；或折叠前的清理）：只在「原生 toggle 已被我们阻断」时用
    function removeThinkPreview(tc, state) { softenThinkPreview(tc, state, true); }

    // 自动跟最新：流式时预览窗口自动滚到最底部，跟随思考输出
    function followThinkPreview(tc, state) {
        if (!state.enabled || !state.following || isThinkHiddenMode()) return;   // 隐藏模式没有滚动条，不必跟随
        tc.scrollTop = tc.scrollHeight;
    }

    // 用户手动展开过的块：页面不会自己跟随（它那次「展开」被我们拦下了）→ 这里只把最新一行滚进视野。
    // **判据必须是「用户意图」，不能用「最新一行离底部多远」**：手动展开后最新一行必然远在视口下方（超长块
    // 动辄上万 px），距离判据会把它当成「用户已上滚」→ 永远不跟；而我们不动、距离就永远不缩小，无法自愈。
    // 意图靠**滚动方向**识别：本功能只往下写 scrollTop，所以 scrollTop 变小只可能是用户自己上滚 → 停跟；
    // 滚回底部 → 恢复。已完成生成的块也不跟（没有「最新一行」要追，跟了就是展开瞬间被莫名推一下）。
    function followManagedThink(wrapper) {
        if (!wrapper || isThinkPreviewOff()) return;
        if (isThinkCollapsedLive(wrapper) || isThinkBodyHidden(wrapper)) return;   // 已收起 / 正文不显示 → 不跟
        const head = findThinkHeadInside(wrapper);
        if (head && head.textContent.includes('已思考')) return;                  // 已完成 → 不跟
        const scroller = thinkScrollHost();
        if (!scroller) return;
        const state = _thinkPreviewState.get(wrapper) || {};
        if (!state.managedHooked) {
            state.managedHooked = true;
            state.managedFollowing = true;
            let last = scroller.scrollTop;
            scroller.addEventListener('scroll', () => {
                if (scroller.scrollTop < last - 1) state.managedFollowing = false;
                else if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - THINK_FOLLOW_TOLERANCE) state.managedFollowing = true;
                last = scroller.scrollTop;
            }, { passive: true });
            _thinkPreviewState.set(wrapper, state);
        }
        if (!state.managedFollowing) return;
        let node = wrapper;
        while (node.lastElementChild) node = node.lastElementChild;   // 最新一行
        const gap = node.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
        if (gap > 0) scroller.scrollTop += gap;
    }

    // 统一刷新入口（MutationObserver 驱动、已节流）：以「统一容器」为单位去重，一次思考只作用一次。
    function refreshThinkPreviews() {
        const wrappers = new Set();
        document.querySelectorAll('.ds-think-content').forEach(tc => {
            // 排除代码块内的文本（避免脚本源码中的「已思考」文字误匹配）
            if (tc.closest('pre, .md-code-block')) return;
            const wrapper = findThinkContentBox(tc);   // 单位元素：优先思考内容盒；结构不典型时退回整块容器
            if (wrapper) wrappers.add(wrapper);
        });
        wrappers.forEach(wrapper => {
            const msg = wrapper.closest('.ds-message');
            if (isUserManaged(msg)) {        // 用户已接管（点过标题行）：不再套窗口，只做轻量跟随
                followManagedThink(wrapper);
                return;
            }
            // 已收起 / 功能关闭 → 撤视觉 + 把结构还回去。结构必须还 —— 残留包裹层会干扰页面自身的重渲染
            // 与点击处理（实测：收起后再点标题行打不开思考区）。
            // 隐藏模式下「0 高夹断」会让几何判据失真 → 改用「页面自己是否把正文藏起来」判断收起态
            const pageCollapsed = isThinkHiddenMode() ? isThinkBodyHidden(wrapper) : isThinkCollapsedLive(wrapper);
            if (pageCollapsed || isThinkPreviewOff()) {
                if (hasThinkPreviewResidue(wrapper)) {
                    softenThinkPreview(wrapper, _thinkPreviewState.get(wrapper) || {});   // 先摘视觉
                }
                unwrapThinkPreviewWrap(wrapper);   // 再拆结构（表头带归位 + 拆 wrap）
                return;
            }
            if (!isThinkHiddenMode() && isThinkTooShortForPreview(wrapper)) {
                // 正文不足「预览最小高度」阈值：不套预览（已套上的轻量撤掉），整块原生展示
                if (hasThinkPreviewResidue(wrapper)) {
                    softenThinkPreview(wrapper, _thinkPreviewState.get(wrapper) || {});
                }
                return;
            }

            const state = _thinkPreviewState.get(wrapper) || {};
            // class 丢失（虚拟列表重建清掉了我们加的样式）也要重新启用预览
            if (!wrapper.classList.contains('ds-think-preview')) {
                enableThinkPreview(wrapper, state);
            }
            // 只维持 UI（跟随滚动 / 重申内联夹断）
            followThinkPreview(wrapper, state);
            if (state.enabled) enforceThinkPreviewInline(wrapper, state); // 防 DeepSeek 动态样式覆盖导致「撑破」
            _thinkPreviewState.set(wrapper, state);
        });
    }

    let _thinkRefreshTimer = null;
    let _lastThinkRefreshAt = 0;
    // 刷新调度＝节流 + 尾调用：纯防抖在流式高频 mutation 下会被无限顺延（内容已溢出、视口却停在顶部，
    // 直到输出停顿才一次性刷新）。节流（≥150ms 立即跑）保证流式期间定期跟随，尾调用保最终必跑一次。
    function scheduleThinkPreviewRefresh() {
        const now = Date.now();
        if (now - _lastThinkRefreshAt >= 150) {
            _lastThinkRefreshAt = now;
            safeRun(refreshThinkPreviews, '思考预览刷新');   // 与尾调用分支一致：单轮抛错不拖垮同批的快捷键按钮/文件夹刷新
            return;
        }
        if (_thinkRefreshTimer) return; // 已有尾调用在途，合并
        _thinkRefreshTimer = setTimeout(() => {
            _thinkRefreshTimer = null;
            _lastThinkRefreshAt = Date.now();
            safeRun(refreshThinkPreviews, '思考预览刷新');
        }, 150);
    }

    // 标题行兜底判据（哈希类失效时）。必须严格：目标在 .ds-think-content 内不算；只认文本以「已思考」或
    // 「正在思考」开头且 ≤20 字的元素 —— 大容器文本会含整段思考内容。
    function isThinkTitleBarHit(target) {
        if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;
        if (target.closest && target.closest('.ds-think-content')) return null;
        let node = target;
        for (let i = 0; node && node !== document.body && i < 3; i++) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const t = (node.textContent || '').trim();
                if ((t.startsWith('已思考') || t.startsWith('正在思考')) && t.length <= 20) return node;
            }
            node = node.parentElement;
        }
        return null;
    }

    // 点思考标题/箭头（capture）：不拦截，走原生收起/展开；脚本只标记「用户已接管」并拆掉预览结构。
    // 签名集合必须有一份不依赖元素身份的记录 —— 页面重渲染会连 data-ds-user-managed 一起丢。
    const _userManagedKeys = new Set();

    // 消息签名 = 对话路径 + 消息序号（会话内只往后追加，序号稳定）。**必须带对话标识**，否则上个对话点过
    // 的序号会让新对话同序号消息被误判「已接管」。不用文本：AI 消息开头就是思考内容，流式期间一直在变。
    function msgSignature(msg) {
        if (!msg || !msg.nodeType) return '';
        const all = document.querySelectorAll('.ds-message');
        const i = Array.prototype.indexOf.call(all, msg);
        if (i < 0) return '';   // 不在列表里（重渲染/脱离文档）不给签名：'' 视为「未接管」，避免多条消息共用同一个键
        return location.pathname + '#' + i;
    }

    // 该消息是否已被用户接管（点过思考标题行）
    function isUserManaged(msg) {
        if (!msg) return false;
        if (msg.hasAttribute('data-ds-user-managed')) return true;
        const sig = msgSignature(msg);
        return !!sig && _userManagedKeys.has(sig);
    }

    function markUserManaged(msg) {
        if (!msg) return;
        msg.setAttribute('data-ds-user-managed', 'true');
        const sig = msgSignature(msg);
        if (sig) _userManagedKeys.add(sig);   // 拿不到签名时只靠 DOM 属性：重渲染后可能丢，但不会误伤别的消息
    }

    // 放行给原生时用：页面的折叠处理器会对被点元素调 scrollIntoView/scrollTo（常带 smooth），页面会突然
    // 跳一段。只屏蔽这一瞬（约 2 帧）的程序化滚动，不影响用户滚轮与我们的 scrollTop 补偿。可重入保护：
    // 连点时第二次会把已是 noop 的值当「原生方法」保存 → 全局方法被写坏，故用计数器保证进出平衡。
    let _scrollShieldRefs = 0;
    let _scrollShieldNative = null;
    function shieldProgrammaticScroll(frames) {
        if (_scrollShieldRefs === 0) {
            _scrollShieldNative = {
                siv: Element.prototype.scrollIntoView,
                estc: Element.prototype.scrollTo,
                wstc: window.scrollTo,
                wstb: window.scrollBy,
            };
        }
        _scrollShieldRefs++;
        const noop = function () {};
        Element.prototype.scrollIntoView = noop;
        if (_scrollShieldNative.estc) Element.prototype.scrollTo = noop;
        window.scrollTo = noop;
        window.scrollBy = noop;
        let left = frames || 2;
        const restore = () => {
            if (--left > 0) { requestAnimationFrame(restore); return; }
            if (--_scrollShieldRefs > 0) return;   // 仍有屏蔽在途：保持 noop，由最后一次负责还原
            Element.prototype.scrollIntoView = _scrollShieldNative.siv;
            if (_scrollShieldNative.estc) Element.prototype.scrollTo = _scrollShieldNative.estc;
            window.scrollTo = _scrollShieldNative.wstc;
            window.scrollBy = _scrollShieldNative.wstb;
        };
        requestAnimationFrame(restore);
        setTimeout(restore, 120);   // 后台标签页 rAF 被暂停时的兜底（restore 按 left/refs 判重，重复调用无害）
    }

    function setupThinkInteractionGuard() {
        if (_thinkCaptureAdded) return;
        _thinkCaptureAdded = true;
        document.addEventListener('click', function dsThinkCapture(e) {
            const clickable = e.target.closest && (e.target.closest('[class*="_5ab5d64"], [class*="c2b72bb8"]') || isThinkTitleBarHit(e.target));
            if (!clickable) return;
            // 双重记录：DOM 属性（快）+ 会话内签名（重渲染不会丢，这是「收起后点不开」的真正修复）。
            // **必须放在清理之后** —— 先标记中途抛错会让该消息被永久判定「已接管」，此后无法自救。
            const msg = clickable.closest('.ds-message');
            const tc = findThinkContent(clickable);
            const unit = tc && findThinkContentBox(tc);
            const state = unit ? _thinkPreviewState.get(unit) : null;
            // 预览只是脚本的视觉态，页面认为这块是「展开」：原生那一击会把它收起（很反直觉），所以预览显示
            // 时这一击由脚本接管（撤预览 = 完全展开）；接管条件是「确实在夹断 + 页面认为展开」，否则放行。
            const takeOver = !!(unit && state && state.enabled &&
                !isThinkBodyHidden(unit) && isThinkPreviewClamped(unit));
            if (takeOver) {
                // 接管：原生 toggle 被阻断，展开与视口补偿全由脚本完成 —— 页面没有东西要滚，不必屏蔽。
                e.preventDefault();
                e.stopPropagation();
            } else {
                // 放行给原生：立刻屏蔽它紧随其后的程序化滚动（scrollIntoView/scrollTo 常带 smooth → 页面突然跳一段）。
                // **不要**在这里自己做滚动补偿 —— 会与页面/浏览器自身的补偿互相打架。
                shieldProgrammaticScroll(2);
            }
            // 放行路径的清理必须轻量 + 同步：只摘样式/class、不搬 DOM（搬 DOM 会打断原生 toggle；延后又会撞动画）。
            if (unit && state) {
                // 撤夹断会把「表头带」移回内容盒 → 下方内容整体位移，这里把它补回来，观感「原地展开」。
                // 锚点取**我们真正搬动的那个节点**（表头带），理由见 thinkShiftAnchor。
                const anchor = thinkShiftAnchor(unit);
                const beforeTop = anchor.getBoundingClientRect().top;
                try {
                    if (takeOver) {
                        // 接管路径：原生 toggle 已被阻断 → 完整拆除（夹断/包裹层/表头带归位一次到位）。
                        removeThinkPreview(unit, state);
                    } else {
                        // 放行路径：原生收起/展开照常执行，动画期间绝不能搬 DOM —— 只摘样式。
                        softenThinkPreview(unit, state);
                    }
                    if (takeOver) {
                        const afterTop = anchor.getBoundingClientRect().top;
                        const scroller = thinkScrollHost();
                        if (scroller && Math.abs(afterTop - beforeTop) > 1) scroller.scrollTop += (afterTop - beforeTop);
                    }
                } catch (err) {
                    // 清理失败（重渲染 / 节点被替换）不能让用户陷入「撤不掉、点也没反应」→ 兜底再试一次轻量清理。
                    console.error('[dst] 思考标题行点击清理异常，回退为轻量清理:', err);
                    try { softenThinkPreview(unit, state); }
                    catch (e2) { console.error('[dst] 思考预览兜底清理亦失败（已交还页面）:', e2); }   // 兜底也失败正是"点了没反应"的真凶，必须留痕
                }
            }
            // 关闭态的点击纯属原生操作：不记接管 —— 否则之后再把高度调回 >0，这些块会「莫名没有窗口」
            if (!isThinkPreviewOff()) markUserManaged(msg);
        }, true);
    }

    // 初始化：把已存在的思考区统一套上预览窗口（预览是默认态）；历史思考区不做自动折叠，交原生操作。
    function setupInitialThinkContents() {
        setupThinkInteractionGuard();
        const wrappers = new Set();
        document.querySelectorAll('.ds-think-content').forEach(tc => {
            if (tc.closest('pre, .md-code-block')) return;
            const wrapper = findThinkContentBox(tc);
            if (wrapper) wrappers.add(wrapper);
        });
        wrappers.forEach(wrapper => {
            const msg = wrapper.closest('.ds-message');
            if (isUserManaged(msg)) return;
            if (isThinkPreviewOff()) return;   // 交还原生 → 不干预
            const pageCollapsed = isThinkHiddenMode() ? isThinkBodyHidden(wrapper) : isThinkCollapsedLive(wrapper);
            if (pageCollapsed || (!isThinkHiddenMode() && isThinkTooShortForPreview(wrapper))) return;
            const state = _thinkPreviewState.get(wrapper) || {};
            enableThinkPreview(wrapper, state);
            _thinkPreviewState.set(wrapper, state);
        });
    }

    // ==================== 对话文件夹管理（并入自独立脚本，folderManagerEnabled 关闭时完全不注入） ====================
    // 封装为独立子闭包 folderUnit，与原脚本最大兼容、不污染外层命名空间；不自持 observer，
    // 启停/持续扫描由外层统一开关与 observeDOM 驱动（见 init / observeDOM / openControlPanel）。
    const folderUnit = (() => {

        /* ==================== 存储（沿用主脚本独立键 v2；v0.9.2 起数据结构含 expanded 展开态） ==================== */
        // 数据被判定损坏时冻结写入：宁可本次不保存，也不能把坏值覆盖写回（那会让用户整理的分组
        // 永久丢失）。首次使用（无值/null）不置位；**解析失败或形状不符**才置位（见下方 catch）。
        let _folderDataCorrupted = false;
        function loadData() {
            const raw = GM_getValue(STORAGE_FOLDER_DATA, 'null');
            if (raw == null || raw === '' || raw === 'null') {
                return { folders: [], links: {}, expanded: {}, collapsed: false };   // 首次使用
            }
            try {
                const d = JSON.parse(raw);
                if (d && Array.isArray(d.folders) && d.links) {
                    if (!d.expanded || typeof d.expanded !== 'object') d.expanded = {};
                    if (typeof d.collapsed !== 'boolean') d.collapsed = false;   // 面板整体折叠态（v4.7.0 新增）
                    // 条目形状只记不改：缺 id 的旧数据**不能**判成「损坏」冻结（那会把正常保存也一起停掉），
                    // 但留一条线索，便于排查后续「改名/移动无效」这类怪现象。
                    const bad = d.folders.filter(f => !f || typeof f.id !== 'string').length;
                    if (bad) console.error('[dst] 文件夹数据有 ' + bad + ' 个条目缺少 id，相关操作可能异常');
                    return d;
                }
                throw new Error('数据形状不符（folders/links 缺失）');
            } catch (e) {
                // **绝不能静默当成「空数据」**：那会让用户整理好的分组凭空消失，而随后任意一次
                // 建夹/移动会话都会触发 saveData 把坏值覆盖写回，造成不可逆丢失。
                console.error('[dst] 文件夹数据解析失败（已冻结写入以防覆盖）:', e, '原始长度=' + String(raw).length);
                try { showToast('文件夹数据读取失败，已暂停保存以免覆盖，请检查脚本管理器中的存储'); }
                catch (e2) { console.error('[dst] 文件夹数据失败提示发送失败:', e2); }
                _folderDataCorrupted = true;
                return { folders: [], links: {}, expanded: {}, collapsed: false };
            }
        }
        let data = loadData();
        let _saveFrozenWarned = false;
        function saveData() {
            if (_folderDataCorrupted) {
                // 冻结后每次写入都被拒 —— 必须留痕：否则用户以为改动已保存，刷新后才发现全没了
                console.error('[dst] 文件夹数据处于损坏冻结态，本次保存已跳过（改动不会保留）');
                if (!_saveFrozenWarned) {
                    _saveFrozenWarned = true;   // 只在第一次提醒，避免每次操作弹一次
                    try { showToast('文件夹数据未保存：读取失败后已暂停保存，请检查脚本管理器中的存储'); }
                    catch (e2) { console.error('[dst] 文件夹冻结提示发送失败:', e2); }
                }
                return;
            }
            GM_setValue(STORAGE_FOLDER_DATA, JSON.stringify(data));
        }
        let pinGroupCollapsed = !!GM_getValue(STORAGE_PIN_COLLAPSED, false);   // 原生「置顶」分组折叠态

        const genId = () => 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const sessionIdOf = (a) => {
            const m = (a.getAttribute('href') || '').match(/\/s\/([^/?#]+)/);
            return m ? m[1] : null;
        };
        const folderNameOf = (fid) => (data.folders.find((x) => x.id === fid) || {}).name || '';
        const nativeNodeFor = (sid) => document.querySelector(`a[href$="/s/${sid}"]`);

        const PALETTE = ['#7aa2ff', '#ff9e7a', '#7affb0', '#ffd27a', '#d27aff', '#7affe0', '#ff7ab0', '#a0ff7a'];
        const folderColor = (id) => {
            let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
            return PALETTE[h % PALETTE.length];
        };
        function shadeHex(hex, amt) {
            const n = parseInt(hex.slice(1), 16);
            let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
            if (amt < 0) { const f = 1 + amt; r *= f; g *= f; b *= f; }
            else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
            return `rgb(${r | 0},${g | 0},${b | 0})`;
        }
        function parseRGB(s) {
            const m = s.match(/(\d+)\D+(\d+)\D+(\d+)/);
            return m ? { r: +m[1], g: +m[2], b: +m[3] } : null;
        }

        /* ---------- 主题（保留原脚本逻辑：随官网深/浅色） ---------- */
        function isDark() {
            const m = document.documentElement.getAttribute('data-mode');
            if (m !== null && m !== '') return m !== 'light';
            const bg = getComputedStyle(document.body).backgroundColor;
            const c = parseRGB(bg);
            if (c) return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) < 140;
            return !window.matchMedia('(prefers-color-scheme: light)').matches;
        }
        function applyTheme() {
            const dark = isDark();
            const r = document.documentElement.style;
            const v = dark
                ? {
                    '--ds-text': '#e8eaed', '--ds-sub': '#9aa0a6',
                    '--ds-hover': 'rgba(255,255,255,.08)', '--ds-active-bg': 'rgba(122,162,255,.18)',
                    '--ds-accent': '#7aa2ff', '--ds-divider': 'rgba(255,255,255,.12)',
                    '--ds-border': 'rgba(255,255,255,.14)',
                }
                : {
                    '--ds-text': '#0f1115', '--ds-sub': '#81858c',
                    '--ds-hover': 'rgba(0,0,0,.05)', '--ds-active-bg': 'rgba(56,108,255,.12)',
                    '--ds-accent': '#3a6cff', '--ds-divider': 'rgba(0,0,0,.10)',
                    '--ds-border': 'rgba(0,0,0,.14)',
                };
            for (const k in v) r.setProperty(k, v[k]);
        }

        /* ---------- 动态样式（v0.9.2 树形样式；on 注入 / off 移除） ---------- */
        const FOLDER_CSS_ID = 'ds-folder-css';
        const FOLDER_CSS = `
        #dsFolderPanel{
            font-size:14px; color:var(--ds-text); font-family:inherit;
            margin:2px 0 4px; padding:2px 8px 8px 0;  /* 对齐原生「分组头→首行」节奏（原生间距 0）；仅兜底挂载（无置顶分组）时由 JS 临时补 22px 让开悬浮「多选」按钮带 */
            background:transparent; border:none; box-shadow:none; border-radius:0;
            user-select:none;
        }
        /* 原生「选择对话」（多选）模式：文件夹树不参与批量选择 → 整区隐藏，让位给原生批量选择 */
        #dsFolderPanel.dsSelectModeHidden{display:none;}

        /* 原生「置顶」分组标题可折叠：点击切换。
           箭头与「文件夹」标题完全一致（同款 chevron、同色 --ds-sub、收起旋转 -90°），用 mask 绘制而非
           往 React 管理的标题里塞节点；hover 也复用文件夹标题的 --ds-hover 底色。
           语义：展开 = 朝下 v，折叠 = 朝右 >（基础图形为朝下 chevron，折叠态 rotate(-90°) 即得朝右）。 */
        .ds-pin-head{cursor:pointer; border-radius:6px; transition:background .15s ease;}
        .ds-pin-head:hover{background:var(--ds-hover);}
        .ds-pin-head::after{content:""; display:inline-block; width:15px; height:15px; margin-left:6px;
            vertical-align:middle; background-color:var(--ds-sub); transition:transform .15s ease;
            -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 6 8 10.5 12.5 6' fill='none' stroke='black' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E") center / 15px 15px no-repeat;
            mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.5 6 8 10.5 12.5 6' fill='none' stroke='black' stroke-width='1.6' stroke-linejoin='round'/%3E%3C/svg%3E") center / 15px 15px no-repeat;}
        .ds-pin-head.dsPinCollapsed::after{transform:rotate(-90deg);}
        #dsFolderPanel .dsfh{display:flex; align-items:center; justify-content:space-between; margin:2px 0 6px; padding-left:10px;}
        #dsFolderPanel .dsfh .dsHeadTitle{display:flex; align-items:center; gap:6px; cursor:pointer; padding:3px 8px 3px 5px; margin-left:-5px; border-radius:6px; user-select:none;}
        #dsFolderPanel .dsfh .dsHeadTitle:hover{background:var(--ds-hover);}
        #dsFolderPanel .dsHeadCaret{width:15px;height:15px;flex:0 0 auto;color:var(--ds-sub);transition:transform .15s ease;}
        #dsFolderPanel.collapsed .dsHeadCaret{transform:rotate(-90deg);}   /* 展开=朝下 v，折叠=朝右 > */
        #dsFolderPanel .dsfh b{font-weight:500; font-size:12px; color:var(--ds-sub); letter-spacing:.4px;}
        #dsFolderPanel .dsNew{background:transparent; color:var(--ds-sub);
            border:1px solid var(--ds-divider); border-radius:100px;
            padding:3px 10px; cursor:pointer; font-size:12px; font-weight:500;}
        #dsFolderPanel .dsNew:hover{background:var(--ds-hover); color:var(--ds-text);}
        /* 去掉区内自设 300px 独立滚动：让整个文件夹区随原生会话历史一起滚，内部不再单独出滚动条 */
        #dsFolderPanel .dsList{display:flex; flex-direction:column; gap:2px;}
        #dsFolderPanel.collapsed .dsList{display:none;}   /* 面板整体折叠（点标题收起） */
        #dsFolderPanel.collapsed .dsNew{display:none;}    /* 折叠态也不展示「＋ 新建」，只留标题行可展开 */
        #dsFolderPanel.collapsed .dsfh{margin-bottom:0;}  /* 收起后挤掉与列表的间隙，仅留标题行 */
        #dsFolderPanel.collapsed .dsHeadTitle{margin-right:0;}  /* 标题占满整行便于再点开 */
        #dsFolderPanel .dsItem{display:flex; align-items:center; gap:8px; padding:7px 10px; border-radius:8px;
            min-height:35px; box-sizing:border-box;
            cursor:pointer; color:var(--ds-text);}
        #dsFolderPanel .dsItem:hover{background:var(--ds-hover);}
        #dsFolderPanel .dsItem .dsName{flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500;}
        #dsFolderPanel .dsItem .dsCount{opacity:.5; font-size:12px; font-weight:600; margin-left:6px; flex:0 0 auto;}
        #dsFolderPanel .dsItem .dsOps{display:flex; gap:6px; flex:0 0 auto; visibility:hidden; margin-left:auto;}
        #dsFolderPanel .dsItem:hover .dsOps{visibility:visible;}
        #dsFolderPanel .dsOps button{background:none; border:none; color:var(--ds-sub); cursor:pointer; font-size:12px; padding:2px 4px; border-radius:5px;}
        #dsFolderPanel .dsOps button:hover{background:var(--ds-hover); color:var(--ds-text);}
        #dsFolderPanel .dsEmpty{opacity:.5; font-size:12.5px; padding:6px 10px;}

        /* v0.9.0+ 树形文件夹：箭头 / 会话内嵌行 */
        #dsFolderPanel .dsCaret{width:20px; height:20px; flex:0 0 auto; background:none; border:none;
            padding:0; margin:0; cursor:pointer; color:var(--ds-sub); border-radius:5px; display:flex; align-items:center; justify-content:center;}
        #dsFolderPanel .dsCaret:hover{background:var(--ds-hover); color:var(--ds-text);}
        #dsFolderPanel .dsFoldBody{display:flex; flex-direction:column;}
        #dsFolderPanel .dsConvRow{display:flex; align-items:center; gap:8px; padding:7px 10px 7px 30px; border-radius:8px;
            min-height:32px; box-sizing:border-box; cursor:pointer; color:var(--ds-text); font-size:13px; position:relative;}
        #dsFolderPanel .dsConvRow:hover{background:var(--ds-hover);}
        #dsFolderPanel .dsConvRow.on{color:var(--ds-accent);}
        #dsFolderPanel .dsConvBar{display:none; position:absolute; left:18px; top:50%; transform:translateY(-50%);
            width:3px; height:15px; border-radius:2px; background:var(--ds-accent); pointer-events:none;}
        #dsFolderPanel .dsConvRow.on .dsConvBar{display:block;}
        #dsFolderPanel .dsConvTitle{flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
        #dsFolderPanel .dsOut{background:none; border:1px solid var(--ds-divider); color:var(--ds-sub);
            border-radius:7px; padding:2px 9px; cursor:pointer; font-size:12px; flex:0 0 auto;}
        #dsFolderPanel .dsOut:hover{color:#ff8585; border-color:#ff8585;}

        /* 自绘标题 tooltip：配色/圆角/字号/内边距对齐官网 .ds-tooltip（实测 rgb(44,44,46) / #fff / 12px / 4px 8px / radius 10px） */
        .dsFolderTip{position:fixed; z-index:3000; background:#2c2c2e; color:#fff;
            font-size:12px; line-height:1.5; padding:4px 8px; border-radius:10px;
            max-width:560px; pointer-events:none; word-break:break-all;}

        .dsTag{display:inline-block; margin-left:6px; font-size:11px; font-weight:600;
            padding:1px 6px; border-radius:5px; vertical-align:middle; line-height:1.4;}

        /* 文件夹选择浮层 */
        #dsFolderPop .dsmpItem{padding:8px 12px; border-radius:8px; cursor:pointer; color:var(--ds-text);
            display:flex; align-items:center; gap:8px; font-size:13.5px;}
        #dsFolderPop .dsmpItem:hover{background:var(--ds-hover);}
        #dsFolderPop .dsmpSep{height:1px; background:var(--ds-border); margin:4px 0;}

        /* 鼠标从官方菜单项滑到「移动到文件夹」后，官方项高亮态残留 */
        .ds-dropdown-menu:has([data-ds-move]:hover) .ds-dropdown-menu-option:not([data-ds-move]){
            background:transparent !important; box-shadow:none !important; outline:none !important;
        }`;
        function injectCss() {
            if (document.getElementById(FOLDER_CSS_ID)) return;
            const st = document.createElement('style');
            st.id = FOLDER_CSS_ID;
            st.textContent = FOLDER_CSS;
            document.head.appendChild(st);
        }
        function removeCss() { const st = document.getElementById(FOLDER_CSS_ID); if (st) st.remove(); }

        /* ---------- 状态（v0.9.x 树形模型：无全局筛选/抽屉；展开态持久化于 data.expanded） ---------- */
        let fCurrentMenuSid = null;   // 当前打开三点菜单所属的会话
        let lastMenuOpenAt = 0;       // 最近一次点击打开官方 ⋯ 菜单的时刻（capture click 记录）
        let lastRealMoveAt = 0;       // 最近一次真实指针位移时刻（捕获阶段记录）
        document.addEventListener('pointermove', () => { lastRealMoveAt = Date.now(); }, { capture: true, passive: true });
        const isExpanded = (id) => data.expanded[id] !== false;   // 默认展开
        const toggleExpanded = (id) => { data.expanded[id] = !isExpanded(id); };

        /* ---------- 面板定位（挂点沿用 v0.8.1/v0.9.x 稳定方案） ---------- */
        function findNewChatBtn() {
            const texts = ['开启新对话', '新对话', '开始新对话'];
            const span = [...document.querySelectorAll('span')].find((x) => texts.includes(x.textContent.trim()));
            if (span) return span.closest('[class*="ds-button"]') || span.parentElement;
            return [...document.querySelectorAll('button,div,a')].find((x) => texts.includes((x.textContent || '').trim())) || null;
        }
        function findScrollContainer() {
            // 优先：从任意会话链接向上找 overflow:auto/scroll 祖先（列表滚动容器）
            const link = document.querySelector('a[href^="/a/chat/s/"]');
            if (link) {
                let el = link.parentElement;
                while (el) {
                    const cs = getComputedStyle(el);
                    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') return el;
                    el = el.parentElement;
                }
            }
            // 兜底：链接尚未渲染（SPA 加载/导航竞态）时，从「新对话」按钮向上找侧栏根，
            // 再于其后代中定位唯一的滚动容器——避免误插到滚动容器外被钉死在顶部。
            const btn = findNewChatBtn();
            let root = btn;
            while (root && root !== document.body) {
                const s = [...root.querySelectorAll('*')].find((d) => {
                    const cs = getComputedStyle(d);
                    return cs.overflowY === 'auto' || cs.overflowY === 'scroll';
                });
                if (s) return s;
                root = root.parentElement;
            }
            return null;
        }
        /* ---- 「置顶」分组容器定位 ----
           原生结构：[置顶 sticky 头 → 置顶会话容器 → 分隔线]，父级即「置顶」分组容器。
           两个用途：① 面板锚点（插在分组容器之后，避免夹在「置顶」标题与其会话之间）；
           ② 归档隐藏时跳过置顶分组内的行（置顶是显式行为，不能因归档进文件夹而从置顶区消失）。 */
        let pinnedGroupEl = null;
        function findPinnedGroup() {
            if (pinnedGroupEl && pinnedGroupEl.isConnected) return pinnedGroupEl;
            const sc = findScrollContainer();
            if (!sc) return null;
            const head = [...sc.querySelectorAll('div')].find((d) => {
                const cs = getComputedStyle(d);
                return cs.position === 'sticky' && d.clientHeight > 0 && d.clientHeight < 60
                    && (d.innerText || '').trim() === '置顶';
            });
            pinnedGroupEl = (head && head.parentElement) ? head.parentElement : null;
            return pinnedGroupEl;
        }
        function ensurePanel() {
            applyTheme();
            let panel = document.getElementById('dsFolderPanel');
            if (panel) {
                // 已存在：沿祖先链判断是否已在滚动容器内。面板经「置顶」sticky 行挂入其所在内容包装层
                // （如 _3098d02，overflow:visible），真正的列表 scroller（_6d215eb ds-scroll-area）在其
                // 上方若干层——只查直接父级会误判为"未挂载"，导致每轮 schedule 重挂 + renderFolders 重建
                // .dsList（真实 mutation）→ observer → schedule 的无限刷新循环。
                let inScroller = false;
                let anc = panel.parentElement;
                while (anc && anc !== document.body) {
                    const ov = getComputedStyle(anc).overflowY;
                    if (ov === 'auto' || ov === 'scroll') { inScroller = true; break; }
                    anc = anc.parentElement;
                }
                if (inScroller) {
                    // 位置校验（v4.9.1 修正自愈判据）：仅当面板**挂在正确锚点**时才认作稳态 → 零扫描早退。
                    // 此前判据为「不在「置顶」分组内即稳态」，语义过宽：若面板曾被兜底挂到滚动容器最顶部
                    // （页面早期 sticky「置顶」头尚未渲染时 `findPinnedGroup()` 返回 null 所走的兜底路径），
                    // 该条件恒成立 → 守卫误判稳态、永不复位，导致面板长期卡在错误位置并残留 22px 死空白。
                    // 现改为直接核对锚点：有「置顶」分组时面板须紧跟其后；无分组时须为滚动容器首子节点。
                    const pg = findPinnedGroup();
                    const sc0 = findScrollContainer();
                    const anchored = pg ? (panel.previousElementSibling === pg) : (sc0 && sc0.firstChild === panel);
                    if (anchored) return;   // 位置正确 → 稳态早退（避免每轮 schedule 重挂引发无限刷新循环）
                    // 位置不正确（夹在置顶分组内 / 兜底挂在最顶而分组已出现 / 误插容器外）→ 继续走下方重挂迁移
                }
                // 面板在文档中但不在滚动容器内（误插残留/容器被替换）→ 继续走下方重挂
            }
            const sc = findScrollContainer();
            if (!sc) return;   // 侧栏/滚动容器尚未就绪：暂不挂载，等下次 schedule 重试（避免误插容器外被钉死）
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'dsFolderPanel';
                panel.innerHTML = `
                <div class="dsfh">
                    <span class="dsHeadTitle" title="${data.collapsed ? '展开全部' : '折叠全部'}" role="button" tabindex="0">
                        <b>文件夹</b><svg class="dsHeadCaret" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.5 6 8 10.5 12.5 6"/></svg>
                    </span>
                    <button class="dsNew" title="新建文件夹">＋ 新建</button>
                </div>
                <div class="dsList"></div>`;
                const headTitle = panel.querySelector('.dsHeadTitle');
                const foldAll = () => { data.collapsed = !data.collapsed; saveData(); setCollapsedUI(); };
                headTitle.addEventListener('click', foldAll);
                headTitle.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); foldAll(); }
                });
                panel.querySelector('.dsNew').addEventListener('click', () => {
                    data.collapsed = false;          // 新建时自动展开，方便立即看到新夹
                    setCollapsedUI();                 // 先反映（含保存 collapsed）
                    onCreateFolder();
                });
            }
            // 挂入/重挂入滚动容器（若面板此前被误插到别处则自动迁移，修复升级前的残留）
            // 锚点 = 「置顶」分组容器之后：原生是 [置顶 sticky 头 → 置顶会话 → 分隔线]，
            // 若插在 sticky 头之后会夹在「置顶」标题与置顶会话之间，把分组切断。
            const pg = findPinnedGroup();
            if (pg) {
                if (panel.previousElementSibling !== pg) pg.insertAdjacentElement('afterend', panel);
                if (panel.style.paddingTop !== '') panel.style.paddingTop = '';   // 正常位置：对齐原生「分组头→首行」零间距节奏，无需为悬浮按钮预留
            } else {
                if (sc.firstChild !== panel) sc.insertBefore(panel, sc.firstChild);   // 兜底：无置顶分组时插到列表最顶
                if (panel.style.paddingTop !== '22px') panel.style.paddingTop = '22px';         // 顶部让开原生悬浮「多选」按钮带
            }
            setCollapsedUI();   // 挂载后再应用折叠态（原在创建块调用时面板未入 DOM，getElementById 找不到 → no-op，导致刷新后 data.collapsed 不生效）
            renderFolders();
        }

        /* ---- 面板整体折叠态 UI（数据在 data.collapsed；纯 class 由 CSS 控制显示） ---- */
        function setCollapsedUI() {
            const panel = document.getElementById('dsFolderPanel');
            if (!panel) return;
            panel.classList.toggle('collapsed', !!data.collapsed);
            const t = panel.querySelector('.dsHeadTitle');
            if (t) t.title = data.collapsed ? '展开全部' : '折叠全部';
        }

        /* ---- 归档可见性：已收进文件夹的会话从原生历史列表隐藏（避免点它时官方滚回原位） ----
           例外：「置顶」分组内的行不隐藏——置顶是用户的显式行为，若因归档进文件夹就整组消失，
           等于置顶功能被脚本静默废掉（实测：脚本开启时置顶会话容器高度归 0）。 */
        const archivedIds = () => Object.keys(data.links);
        function syncArchiveVisibility() {
            const all = document.querySelectorAll('a[href^="/a/chat/s/"]');
            const set = new Set(archivedIds());
            const pg = findPinnedGroup();
            all.forEach((a) => {
                const sid = sessionIdOf(a);
                const isPinned = !!(pg && pg.contains(a));
                if (!isPinned && sid && set.has(sid)) {
                    if (a.style.display !== 'none') a.style.display = 'none';
                } else if (a.style.display === 'none') {
                    a.style.display = '';
                }
            });
        }

        /* ---- 原生「选择对话」（多选）模式互斥 ----
           两者选择态互不相通（原生选择圈只给原生行、文件夹树无任何选择控件），
           多选态下继续展示文件夹树没有意义 → 整区隐藏（display:none），退出后自动恢复。 */
        function syncSelectModeLock() {
            const panel = document.getElementById('dsFolderPanel');
            if (!panel) return;
            const listRoot = (pinnedGroupEl && pinnedGroupEl.isConnected && pinnedGroupEl.parentElement)
                ? pinnedGroupEl.parentElement : findScrollContainer();
            const inSelectMode = !!(listRoot && listRoot.querySelector('.ds-checkbox'));
            panel.classList.toggle('dsSelectModeHidden', inSelectMode);
        }

        /* ---- 原生「置顶」分组折叠 ----
           取「置顶」分组容器内的 sticky 头作为可点击标题；折叠 = 隐藏容器内除标题外的所有兄弟。
           用 document 级事件委托 + 我们自己的稳定类 .ds-pin-head，不依赖官网 hash 类名、不怕 React 重渲染；
           折叠态每轮 schedule 重放（React 重建会重置 inline display / class）。 */
        function findPinHeader() {
            const pg = findPinnedGroup();
            if (!pg) return null;
            return [...pg.children].find((c) => {
                const cs = getComputedStyle(c);
                return cs.position === 'sticky' && (c.innerText || '').trim().startsWith('置顶');
            }) || null;
        }
        function applyPinCollapse() {
            const pg = findPinnedGroup();
            const head = findPinHeader();
            if (!pg || !head) return;
            head.classList.add('ds-pin-head');                                  // 稳定类：样式与事件委托的挂钩
            head.classList.toggle('dsPinCollapsed', pinGroupCollapsed);
            [...pg.children].forEach((c) => {
                if (c === head) return;
                if (pinGroupCollapsed) {
                    if (c.style.display !== 'none') { c.style.display = 'none'; c.dataset.dsPinHidden = '1'; }
                } else if (c.dataset.dsPinHidden === '1') {
                    c.style.display = ''; delete c.dataset.dsPinHidden;         // 只还原自己藏过的，不动其它逻辑的 display
                }
            });
        }
        let pinClickHandler = null;
        function bindPinClick() {
            if (pinClickHandler) return;
            pinClickHandler = (e) => {
                const head = e.target && e.target.closest ? e.target.closest('.ds-pin-head') : null;
                if (!head) return;
                const pg = findPinnedGroup();
                if (!pg || head.parentElement !== pg) return;        // 只认当前置顶组的标题
                if (document.querySelector('.ds-checkbox')) return;  // 原生多选态下不响应折叠
                pinGroupCollapsed = !pinGroupCollapsed;
                GM_setValue(STORAGE_PIN_COLLAPSED, pinGroupCollapsed);
                applyPinCollapse();
            };
            document.addEventListener('click', pinClickHandler, true);
        }
        function unbindPinClick() {
            if (pinClickHandler) { document.removeEventListener('click', pinClickHandler, true); pinClickHandler = null; }
        }
        function resetPinCollapseUi() {
            unbindPinClick();
            const pg = findPinnedGroup();
            if (pg) [...pg.children].forEach((c) => { if (c.dataset.dsPinHidden === '1') { c.style.display = ''; delete c.dataset.dsPinHidden; } });
            document.querySelectorAll('.ds-pin-head').forEach((h) => h.classList.remove('ds-pin-head', 'dsPinCollapsed'));
        }

        /* ---------- 树形渲染 ---------- */
        /* 文件夹行图标：折叠 = 空心文件夹；展开 = 打开文件夹（实心） */
        const ICON_FOLDER_CLOSED = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linejoin=\"round\"><path d=\"M3.2 6.2A1.7 1.7 0 0 1 4.9 4.5h4.6l2 2.2h7.6a1.7 1.7 0 0 1 1.7 1.7v9.6a1.7 1.7 0 0 1-1.7 1.7H4.9a1.7 1.7 0 0 1-1.7-1.7V6.2Z\"/></svg>";
        const ICON_FOLDER_OPEN = "<svg width=\"15\" height=\"15\" viewBox=\"0 0 48 48\" fill=\"none\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M18.561296999999968 6.675137999999947 C20.10129699999993 6.675137999999947 21.214296999999988 6.655137999999965 22.263296999999966 6.95513799999992 C23.14329699999996 7.195137999999929 23.972296999999912 7.595137999999906 24.708296999999902 8.145137999999974 C25.586296999999945 8.78513799999996 26.2612969999999 9.675137999999947 27.21229699999992 10.885137999999984 L28.316296999999963 12.28513799999996 C28.489296999999965 12.505137999999988 28.578296999999907 12.625137999999993 28.64729699999998 12.695137999999929 C28.653296999999952 12.70513799999992 28.659296999999924 12.71513799999991 28.663296999999943 12.71513799999991 C28.67029699999989 12.71513799999991 28.67829699999993 12.71513799999991 28.68829699999992 12.71513799999991 C28.792296999999962 12.725137999999902 28.93529699999999 12.725137999999902 29.21629699999994 12.725137999999902 H31.78629699999999 C33.304296999999906 12.725137999999902 34.39429699999994 12.71513799999991 35.33429699999999 12.945137999999929 C37.98429699999997 13.605137999999897 40.054296999999906 15.675137999999947 40.71429699999999 18.325137999999924 C40.90429699999993 19.105137999999897 40.9342969999999 19.9751379999999 40.9342969999999 21.105137999999897 C41.88429699999995 22.145137999999974 42.544296999999915 23.44513799999993 42.784296999999924 24.865138 C42.96429699999999 25.885137999999984 42.824297 26.915137999999956 42.574297 28.005137999999874 C42.3142969999999 29.09513800000002 41.89429699999994 30.415137999999956 41.38429699999995 32.055138000000056 C40.604296999999974 34.515137999999865 40.114296999999965 36.155137999999965 39.17429699999991 37.44513799999993 C38.02429699999993 39.03513799999985 36.39429699999994 40.2251379999999 34.534296999999924 40.84513800000002 C33.614296999999965 41.155137999999965 32.62529699999993 41.265137999999865 31.412296999999967 41.305138000000056 C31.322296999999935 41.31513800000005 31.229296999999974 41.32513800000004 31.134296999999947 41.32513800000004 H29.179296999999906 C29.033296999999948 41.32513800000004 28.885296999999923 41.32513800000004 28.73429699999997 41.32513800000004 H19.135296999999923 C18.568296999999916 41.32513800000004 18.03229699999997 41.32513800000004 17.52529699999991 41.32513800000004 C16.134296999999947 41.31513800000005 14.95629699999995 41.29513799999984 13.955296999999973 41.21513799999991 C12.57729699999993 41.10513800000001 11.375296999999932 40.865138 10.266296999999895 40.305138000000056 C8.497297000000003 39.395137999999974 7.060296999999991 37.96513799999991 6.158296999999948 36.19513799999993 C5.593296999999893 35.08513800000003 5.356296999999927 33.88513799999998 5.243296999999984 32.505137999999874 C5.1332969999999705 31.145137999999974 5.134296999999947 29.46513799999991 5.134296999999947 27.365138 V17.675137999999947 C5.134296999999947 16.095137999999906 5.132296999999994 14.805137999999943 5.218296999999893 13.755137999999988 C5.305296999999996 12.685137999999938 5.492296999999894 11.70513799999992 5.9562969999999495 10.795137999999952 C6.680296999999996 9.375137999999993 7.835296999999969 8.225137999999902 9.256296999999904 7.495137999999997 C10.167296999999962 7.035137999999961 11.141296999999895 6.845137999999906 12.211296999999945 6.755137999999988 C13.260296999999923 6.675137999999947 14.554296999999906 6.675137999999947 16.134296999999947 6.675137999999947 H18.561296999999968 z M20.65729699999997 22.325138000000038 C17.73829699999999 22.325138000000038 16.777296999999976 22.35513800000001 16.002297 22.665137999999956 C15.240296999999941 22.96513799999991 14.56729699999994 23.45513799999992 14.04929699999991 24.09513800000002 C13.523296999999957 24.745137999999884 13.204296999999997 25.645137999999974 12.324297000000001 28.435137999999938 C11.695296999999982 30.425137999999947 11.260296999999923 31.805138000000056 11.023296999999957 32.88513799999998 C10.787296999999967 33.95513799999992 10.800297 34.505137999999874 10.89729699999998 34.88513799999998 C11.141296999999895 35.81513800000005 11.73429699999997 36.63513799999998 12.556296999999972 37.145137999999974 C12.884296999999947 37.35513800000001 13.406296999999995 37.525137999999856 14.496296999999913 37.62513799999999 C15.339296999999988 37.70513799999992 16.385296999999923 37.71513799999991 17.76829699999996 37.7251379999999 C18.181296999999972 37.7251379999999 18.622297000000003 37.7251379999999 19.094296999999983 37.7251379999999 H28.96029699999997 C31.627297 37.7251379999999 32.59429699999998 37.69513799999993 33.39429699999994 37.42513799999995 C34.544296999999915 37.04513799999984 35.544296999999915 36.31513800000005 36.26429699999994 35.33513800000003 C36.77429699999993 34.62513799999999 37.09429699999998 33.68513799999994 37.94429699999989 30.9751379999999 C38.48429699999997 29.275137999999856 38.854296999999974 28.10513800000001 39.0642969999999 27.185137999999938 C39.284296999999924 26.275137999999856 39.294296999999915 25.795137999999838 39.23429699999997 25.4751379999999 C39.08429699999999 24.615138 38.64429699999994 23.83513800000003 37.99429699999996 23.265137999999865 C37.98429699999997 23.255137999999874 37.97429699999998 23.245137999999884 37.954297 23.235137999999893 C37.74429699999996 23.045137999999838 37.49429699999996 22.885137999999984 37.23429699999997 22.745137999999884 C36.954297 22.60513800000001 36.49429699999996 22.46513799999991 35.554296999999906 22.395137999999974 C34.614296999999965 22.325138000000038 33.38429699999995 22.325138000000038 31.610296999999946 22.325138000000038 H20.65729699999997 z M16.134296999999947 10.27513799999997 C14.49429699999996 10.27513799999997 13.37329699999998 10.27513799999997 12.504296999999951 10.345137999999906 C11.657296999999971 10.415137999999956 11.210296999999969 10.545137999999952 10.891296999999895 10.70513799999992 C10.148296999999957 11.085137999999915 9.543296999999939 11.685137999999938 9.16429699999992 12.435137999999938 C9.002296999999999 12.755137999999988 8.875296999999932 13.195137999999929 8.806296999999972 14.045137999999952 C8.735296999999946 14.915137999999956 8.73429699999997 16.03513799999996 8.73429699999997 17.675137999999947 V27.84513800000002 C8.7852969999999 27.685137999999938 8.838296999999898 27.515137999999865 8.892296999999985 27.34513800000002 C9.67829699999993 24.865138 10.191296999999963 23.135137999999984 11.257296999999994 21.825138000000038 C12.16429699999992 20.70513799999992 13.340296999999964 19.845137999999906 14.675297 19.315137999999934 C16.24429699999996 18.69513799999993 18.048296999999934 18.7251379999999 20.65729699999997 18.7251379999999 H31.610296999999946 C33.33429699999999 18.7251379999999 34.72429699999998 18.7251379999999 35.83429699999999 18.805137999999943 C36.284296999999924 18.845137999999906 36.73429699999997 18.895137999999974 37.15429699999993 18.9751379999999 C36.75429699999995 17.7251379999999 35.74429699999996 16.76513799999998 34.454297 16.435137999999938 C34.054296999999906 16.335137999999915 33.52429699999993 16.325137999999924 31.78629699999999 16.325137999999924 H28.875296999999932 C28.51529699999992 16.325137999999924 28.103296999999998 16.305137999999943 27.70229699999993 16.19513799999993 C27.278296999999952 16.075137999999924 26.87929699999995 15.875137999999993 26.524296999999933 15.615138000000002 C26.07729699999993 15.295137999999952 25.746296999999913 14.845137999999906 25.485296999999946 14.515137999999979 L24.381296999999904 13.105137999999897 C23.305296999999996 11.735137999999893 22.965296999999964 11.325137999999924 22.576296999999954 11.045137999999952 C22.191296999999963 10.755137999999988 21.757296999999994 10.545137999999952 21.297296999999958 10.415137999999956 C20.833296999999902 10.295137999999952 20.30329699999993 10.27513799999997 18.561296999999968 10.27513799999997 H16.134296999999947 z\" fill=\"currentColor\"/></svg>";

        function renderFolders() {
            const list = document.querySelector('#dsFolderPanel .dsList');
            if (!list) return;
            syncArchiveVisibility();
            list.innerHTML = '';

            // 树形：生成当前会话 on 状态快照
            const currentOn = new Set();
            { const h = location.pathname.match(/\/s\/([^/]+)/); if (h) currentOn.add(h[1]); }

            data.folders.forEach((f) => {
                const sids = Object.keys(data.links).filter((k) => data.links[k] === f.id);

                // 文件夹树行
                const row = document.createElement('div');
                row.className = 'dsItem';
                row.innerHTML = `
                    <button class="dsCaret" title="${isExpanded(f.id) ? '收起' : '展开'}">${isExpanded(f.id) ? ICON_FOLDER_OPEN : ICON_FOLDER_CLOSED}</button>
                    <span class="dsName"></span>
                    <span class="dsCount">${sids.length}</span>
                    <span class="dsOps">
                        <button data-act="rename">改名</button>
                        <button data-act="del">删除</button>
                    </span>`;
                row.querySelector('.dsName').textContent = f.name;
                row.querySelector('.dsCaret').addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    toggleExpanded(f.id); saveData(); renderFolders();
                });
                // 点文件夹行（排除箭头与操作钮）：切换展开/折叠
                row.addEventListener('click', (ev) => {
                    if (ev.target.dataset.act) return;
                    if (ev.target.classList.contains('dsCaret')) return;
                    toggleExpanded(f.id); saveData(); renderFolders();
                });
                row.querySelector('[data-act="rename"]').addEventListener('click', (ev) => { ev.stopPropagation(); onRenameFolder(f); });
                row.querySelector('[data-act="del"]').addEventListener('click', (ev) => { ev.stopPropagation(); onDeleteFolder(f); });
                list.appendChild(row);

                // 展开时：内嵌该文件夹内会话行
                if (sids.length && isExpanded(f.id)) {
                    const wrap = document.createElement('div');
                    wrap.className = 'dsFoldBody';
                    wrap.dataset.folder = f.id;
                    for (const sid of sids) {
                        const native = nativeNodeFor(sid);
                        if (!native) continue;
                        const on = currentOn.has(sid);
                        const cr = document.createElement('div');
                        cr.className = 'dsConvRow' + (on ? ' on' : '');
                        cr.innerHTML = `<span class="dsConvBar"></span><span class="dsConvTitle"></span>`;
                        const cvT = cr.querySelector('.dsConvTitle');
                        cvT.textContent = titleOf(native);
                        bindTitleTip(cvT, titleOf(native));   // 自绘 tooltip（官方质感），仅标题溢出时触发
                        cr.addEventListener('click', (e) => {
                            if (currentOn.has(sid)) return; // 已是当前会话：避免触发原生重载/回滚
                            const n = nativeNodeFor(sid);
                            if (n) n.click();
                        });
                        const out = document.createElement('button');
                        out.className = 'dsOut';
                        out.textContent = '移出';
                        out.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            delete data.links[sid];
                            saveData(); renderFolders();
                        });
                        cr.appendChild(out);
                        wrap.appendChild(cr);
                    }
                    list.appendChild(wrap);
                }
            });

            if (data.folders.length === 0) {
                const e = document.createElement('div');
                e.className = 'dsEmpty';
                e.textContent = '还没有文件夹，点「+ 新建」';
                list.appendChild(e);
            }
        }

        /* ---------- 自绘标题 tooltip（对齐官网 .ds-tooltip：bg #2c2c2e / #fff / 12px / 4px 8px / radius 10px；仅标题溢出时触发） ---------- */
        let _dsConvTip = null;
        function ensureConvTip() {
            if (_dsConvTip && _dsConvTip.isConnected) return _dsConvTip;
            _dsConvTip = document.createElement('div');
            _dsConvTip.className = 'dsFolderTip';
            document.body.appendChild(_dsConvTip);
            return _dsConvTip;
        }
        function hideConvTip() { if (_dsConvTip) _dsConvTip.style.display = 'none'; }
        function positionConvTip(anchor) {
            const t = ensureConvTip();
            const a = anchor.getBoundingClientRect();
            t.style.display = 'block';
            t.style.left = '0px'; t.style.top = '0px';
            const tw = t.offsetWidth, th = t.offsetHeight;
            let left = a.left + 8;
            if (left + tw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - tw - 12);
            let top = a.bottom + 6;
            if (top + th > window.innerHeight - 8) top = a.top - th - 6;
            t.style.left = left + 'px';
            t.style.top = top + 'px';
        }
        function bindTitleTip(el, fullText) {
            el.addEventListener('mouseenter', () => {
                const s = getComputedStyle(el);
                // 官网会话 tooltip 也仅当标题溢出（被省略号截断）时显示
                if (s.scrollWidth > s.clientWidth || s.textOverflow === 'ellipsis') {
                    ensureConvTip().textContent = fullText;
                    positionConvTip(el);
                }
            });
            el.addEventListener('mousemove', () => { if (_dsConvTip && _dsConvTip.style.display !== 'none') positionConvTip(el); });
            el.addEventListener('mouseleave', hideConvTip);
        }

        /* ---- 树形与标签同步（共用）：数据改动后的重建入口 ---- */
        function resyncFolders() { refreshTags(); renderFolders(); }

        /* ---------- 文件夹操作 ---------- */
        function onCreateFolder() {
            const name = prompt('新建文件夹名称：', '新建文件夹');
            if (name === null) return;
            const t = name.trim(); if (!t) return;
            data.folders.push({ id: genId(), name: t });
            saveData(); renderFolders();
        }
        function onRenameFolder(f) {
            const name = prompt('重命名文件夹：', f.name);
            if (name === null) return;
            const t = name.trim(); if (!t) return;
            f.name = t; saveData(); renderFolders();
        }
        function onDeleteFolder(f) {
            if (!confirm(`删除文件夹「${f.name}」？其中的对话会回到「全部对话」。`)) return;
            data.folders = data.folders.filter((x) => x.id !== f.id);
            for (const k of Object.keys(data.links)) if (data.links[k] === f.id) delete data.links[k];
            delete data.expanded[f.id];
            saveData(); refreshTags(); renderFolders();
        }

        /* ---------- 标签 / 标题 ---------- */
        function titleOf(a) {
            const t = a.querySelector('div.c08e6e93');
            return ((t ? t.textContent : a.textContent) || '').trim() || '未命名对话';
        }
        function refreshTags() {
            const dark = isDark();
            document.querySelectorAll('a[href^="/a/chat/s/"]').forEach((a) => {
                const sid = sessionIdOf(a);
                const fid = data.links[sid] || null;
                const titleEl = a.querySelector('div.c08e6e93');
                if (!titleEl) return;
                const existing = titleEl.querySelector('.dsTag');
                if (fid) {
                    const name = folderNameOf(fid);
                    const c = folderColor(fid);
                    if (!existing) {
                        const tag = document.createElement('span');
                        tag.className = 'dsTag'; tag.textContent = name;
                        tag.style.background = c + '30';
                        tag.style.color = dark ? c : shadeHex(c, -0.48);
                        titleEl.appendChild(tag);
                    } else if (existing.textContent !== name || existing.dataset.fid !== fid) {
                        existing.textContent = name; existing.dataset.fid = fid;
                        existing.style.background = c + '30';
                        existing.style.color = dark ? c : shadeHex(c, -0.48);
                    }
                } else if (existing) { existing.remove(); }
            });
        }

        /* ---------- 官方三点菜单注入 ---------- */
        function escapeHtml(s) {
            return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
        // 记录当前打开菜单所属会话（关闭时不记录）。按下/点击三点按钮即视为打开官方菜单：
        // React portal 可复用浮层容器会在重现菜单时，若该项恰在指针正下方而指针没动，也会合成 mouseenter。
        // 这里分别记住「按下时刻」与「最近一次真实指针位移」，供 openOnHover 判定是否为“伪悬停”。
        document.addEventListener('pointerdown', (e) => {
            if (!folderManagerEnabled) return;
            if (e.target.closest('#dsFolderPop, [data-ds-move]')) return;   // 我们自己的浮层/项不算打开官方菜单
            lastMenuOpenAt = Date.now();
        }, true);
        document.addEventListener('click', (e) => {
            if (!folderManagerEnabled) return;
            const btn = e.target.closest('[class*="ds-button"]');
            if (!btn) return;
            const link = btn.closest('a[href^="/a/chat/s/"]');
            if (!link) return;
            const sid = sessionIdOf(link);
            if (sid) fCurrentMenuSid = sid;
        }, true);

        function injectMoveToFolder(menu) {
            if (menu.querySelector('[data-ds-move]')) return;
            const item = document.createElement('div');
            item.className = 'ds-dropdown-menu-option ds-dropdown-menu-option--none';
            item.setAttribute('role', 'menuitem');
            item.dataset.dsMove = '1';
            item.innerHTML = `
                <div class="ds-dropdown-menu-option__icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
                </div>
                <div class="ds-dropdown-menu-option__label">移动到文件夹</div>`;
            // 鼠标从官方菜单项滑到本项后，官方项的高亮态残留修复
            const clearNativeHighlight = () => {
                menu.querySelectorAll('.ds-dropdown-menu-option').forEach((o) => {
                    if (o === item) return;
                    o.removeAttribute('data-highlighted');
                    if (o.getAttribute('data-state') === 'active') o.setAttribute('data-state', '');
                    o.removeAttribute('aria-selected');
                    [...o.classList].forEach((c) => { if (/highlight|active/i.test(c)) o.classList.remove(c); });
                });
            };
            item.addEventListener('mouseenter', clearNativeHighlight);
            item.addEventListener('pointerenter', clearNativeHighlight);
            // 悬停即展开次级菜单（仿 Windows 右键二级菜单）
            const openOnHover = () => {
                if (document.getElementById('dsFolderPop')) return;
                // 防「伪悬停」误展开：点击三点按钮重现当前菜单时，若该项恰在指针正下方而指针没动，
                // 浏览器仍会合成一个 mouseenter。判定——菜单刚被打开(pointerdown 距今 <300ms)且
                // 自该打开后没有任何真实指针位移(lastRealMoveAt 停在更早) —— 视为伪事件，先不展开，
                // 等用户真正把光标移入该项才 `mouseenter`/`pointerenter`（届时已有新位移）自然打开。v4.7.0
                if (Date.now() - lastMenuOpenAt < 300 && lastRealMoveAt < lastMenuOpenAt) return;
                cancelClosePopup();
                if (fCurrentMenuSid) openFolderPopup(fCurrentMenuSid, item);
            };
            item.addEventListener('mouseenter', openOnHover);
            item.addEventListener('pointerenter', openOnHover);
            item.addEventListener('mouseleave', scheduleClosePopup);
            item.addEventListener('mouseenter', cancelClosePopup);
            item.addEventListener('click', (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                if (document.getElementById('dsFolderPop')) return;
                if (fCurrentMenuSid) openFolderPopup(fCurrentMenuSid, item);
            });
            menu.appendChild(item);
        }

        // 悬停意图计时：离开浮层/锚点后稍候再关，避免穿梭 4px 间隙闪烁
        let dsPopupCloseTimer = null;
        function scheduleClosePopup() { clearTimeout(dsPopupCloseTimer); dsPopupCloseTimer = setTimeout(closeFolderPopup, 220); }
        function cancelClosePopup() { clearTimeout(dsPopupCloseTimer); dsPopupCloseTimer = null; }
        function closeFolderPopup() {
            clearTimeout(dsPopupCloseTimer); dsPopupCloseTimer = null;
            const p = document.getElementById('dsFolderPop'); if (p) p.remove();
        }
        function openFolderPopup(sid, anchor) {
            closeFolderPopup();
            const dark = isDark();
            const pop = document.createElement('div');
            pop.id = 'dsFolderPop';
            pop.style.cssText = `position:fixed;z-index:2000;background:${dark ? '#2a2e3a' : '#ffffff'};
                border:1px solid var(--ds-border);border-radius:10px;padding:5px;min-width:175px;
                box-shadow:0 10px 30px rgba(0,0,0,.4);font-size:13.5px;color:var(--ds-text);
                max-height:calc(100vh - 16px);overflow:auto;`;
            let html = '';
            for (const f of data.folders) {
                html += `<div class="dsmpItem" data-fid="${f.id}">
                    <span style="width:9px;height:9px;border-radius:50%;background:${folderColor(f.id)};display:inline-block;"></span>${escapeHtml(f.name)}</div>`;
            }
            html += `<div class="dsmpSep"></div>
                <div class="dsmpItem" data-fid="__new__">+ 新建文件夹…</div>
                <div class="dsmpItem" data-fid="__none__">移出文件夹（未分类）</div>`;
            pop.innerHTML = html;
            document.body.appendChild(pop);

            // 级联定位：锚点右侧展开，放不下翻左侧，垂直对齐夹紧在视口内
            const r = anchor.getBoundingClientRect();
            const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 4;
            let left = r.right + gap;
            if (left + pw > window.innerWidth - 8) { left = r.left - pw - gap; if (left < 8) left = 8; }
            let top = r.top - 2;
            top = Math.max(8, Math.min(top, window.innerHeight - ph - 8));
            pop.style.left = left + 'px';
            pop.style.top = top + 'px';

            pop.addEventListener('mouseenter', cancelClosePopup);
            pop.addEventListener('mouseleave', scheduleClosePopup);
            pop.addEventListener('click', (ev) => {
                const it = ev.target.closest('.dsmpItem');
                if (!it) return;
                let fid = it.dataset.fid;
                if (fid === '__new__') {
                    const name = prompt('新建文件夹名称：', '新建文件夹');
                    if (name === null) return;
                    const t = name.trim(); if (!t) return;
                    fid = genId(); data.folders.push({ id: fid, name: t });
                } else if (fid === '__none__') {
                    delete data.links[sid];
                } else {
                    data.links[sid] = fid;
                }
                saveData();
                // 收敛「移动」：仅移除我们自己的浮层，绝不把祖级官方浮层容器 .ds-floating-container 设 display:none。
                // 原因：官方该容器跨会话复用（React portal 只在首开时创建、之后复用），若我们用内联 none 藏死它，
                // 之后再次点 ⋯ 菜单只会渲染进这个永久隐藏的容器 → 表现为“菜单点不开/无反应”。
                // 官方菜单的关闭由 DeepSeek 自身的点击/ESC 语义处理，这里不越权接管。
                closeFolderPopup();
                resyncFolders();
            });
            setTimeout(() => document.addEventListener('click', closeFolderPopup, { once: true }), 0);
        }
        function injectMenus() {
            if (!folderManagerEnabled) return;
            document.querySelectorAll('.ds-dropdown-menu[role="menu"]').forEach((menu) => {
                const t = menu.textContent || '';
                if (!/重命名/.test(t) || !/删除/.test(t)) return; // 仅会话菜单
                injectMoveToFolder(menu);
            });
        }

        /* ---------- 由外层驱动的刷新（取代原自持 observer；v0.9.2 导航守卫防自循环） ---------- */
        let folderPending = null;
        let folderLastSid = (location.pathname.match(/\/s\/([^/]+)/) || [])[1] || null;   // 高亮/重绘守卫
        function schedule() {
            if (!folderManagerEnabled) return;
            if (folderPending) return;
            folderPending = setTimeout(() => {
                folderPending = null;
                // 整批隔离：中途抛错会让后面的 refreshTags/injectMenus/renderFolders 全部跳过，
                // 面板停在半渲染状态且无日志
                safeRun(() => {
                    ensurePanel();
                    refreshTags();
                    injectMenus();
                    // 导航切换后重绘树（仅当 url 会话变化才做，避免 observer 自激循环）
                    const cur = (location.pathname.match(/\/s\/([^/]+)/) || [])[1] || null;
                    if (cur !== folderLastSid) { folderLastSid = cur; renderFolders(); }
                    syncArchiveVisibility(); // 外部新增会话行也要按归档立即隐藏（仅改 display，不引循环）
                    syncSelectModeLock();    // 原生多选态下禁用文件夹树交互（模式互斥）
                    if (pinGroupCollapsible) applyPinCollapse();   // 重放「置顶」分组折叠态（React 重建会重置；仅开关开启时）
                }, '文件夹刷新');
            }, 120);
        }
        function cancelSchedule() { if (folderPending) { clearTimeout(folderPending); folderPending = null; } }

        /* ---------- on / off（外层开关驱动） ---------- */
        function on() {
            injectCss();
            applyTheme();
            if (pinGroupCollapsible) bindPinClick();   // 置顶折叠为 opt-in，仅开关开启时接管点击
            schedule();
        }
        function off() {
            cancelSchedule();
            resetPinCollapseUi();   // 解绑「置顶」折叠点击并还原被折叠隐藏的原生节点
            fCurrentMenuSid = null;
            closeFolderPopup();
            if (_dsConvTip) { _dsConvTip.remove(); _dsConvTip = null; }   // 清掉自绘 tooltip 残留节点
            // 复位归档隐藏：把 syncArchiveVisibility 藏起来的官方会话行全部还原（不越权动原生结构）
            document.querySelectorAll('a[href^="/a/chat/s/"]').forEach((a) => { a.style.display = ''; });
            document.querySelectorAll('[data-ds-move]').forEach((el) => el.remove());
            document.querySelectorAll('.dsTag').forEach((el) => el.remove());
            const panel = document.getElementById('dsFolderPanel'); if (panel) panel.remove();
            removeCss();
            // 移除注入的 --ds-* CSS 变量（复原官网原生配色源）
            const rs = document.documentElement.style;
            ['--ds-text','--ds-sub','--ds-hover','--ds-active-bg','--ds-accent','--ds-divider','--ds-border']
                .forEach((k) => rs.removeProperty(k));
        }
        /* 置顶折叠能力开关（由设置面板驱动）：开启则绑定点击并应用折叠态；关闭则解绑并还原被折叠节点。 */
        function setPinCollapsible(enabled) {
            if (!folderManagerEnabled) return;   // 文件夹模块未启用时无需处理
            if (enabled) { bindPinClick(); applyPinCollapse(); }
            else { resetPinCollapseUi(); }
        }

        return { on, off, schedule, setPinCollapsible };
    })();

    // hold the ref so disabled switching can re-load stored folder list later
    const folderEnabledChanged = (nowEnabled) => {
        if (nowEnabled) { folderUnit.on(); showToast('对话文件夹管理已开启'); }
        else { folderUnit.off(); showToast('对话文件夹管理已关闭'); }
        // 子开关「置顶分组可折叠」的可用性依赖本项 → 重开面板刷新置灰态
        const ov = document.getElementById('ds-control-panel-overlay');
        if (ov) { ov.remove(); setTimeout(() => openControlPanel(), 300); }
    };

    // ==================== 页面「快捷键修改」按钮 ====================
    // 独立圆形按钮：输入框无内容时叠在原生发送按钮上（此时它 disabled、点了没反应），点击切换发送模式；
    // 有内容时隐藏、露出原生发送。不复制发送按钮的 className（避免继承 disabled 的半透明与 pointer-events）。
    function findSendButton() {
        const ta = document.querySelector('textarea');
        if (!ta || !ta.isConnected) return null;
        let n = ta.parentElement;
        for (let i = 0; i < 8 && n && n !== document.body; i++) {
            const send = n.querySelector('div[role="button"].ds-button--primary:not(#ds-ctrl-enter-btn)');
            if (send) return send;
            n = n.parentElement;
        }
        return null;
    }

    // 输入框当前是否有内容（去除首尾空白判断）
    function textareaHasContent() {
        const ta = document.querySelector('textarea');
        if (!ta) return false;
        return (ta.value || '').trim().length > 0;
    }

    function updateCtrlEnterBtnUI() {
        const btn = document.getElementById('ds-ctrl-enter-btn');
        if (!btn) return;
        btn.classList.toggle('ds-ctrl-enter-on', ctrlEnterEnabled);
        btn.classList.toggle('ds-ctrl-enter-off', !ctrlEnterEnabled);
        // 提示用原生 title（文案随模式变化）。**不要再自绘提示**：自绘要挂 body 自己算坐标，约 27 行只为观感。
        const text = ctrlEnterTipText();
        btn.title = text;
        btn.setAttribute('aria-label', text);
    }

    // 提示文本：当前模式 + 切换去向（双向切换，故按当前模式给出对应文案）
    function ctrlEnterTipText() {
        return ctrlEnterEnabled
            ? '当前：Ctrl+Enter 发送 / Enter 换行；点击切换为 Enter 发送 / Shift+Enter 换行'
            : '当前：Enter 发送 / Shift+Enter 换行；点击切换为 Ctrl+Enter 发送 / Enter 换行';
    }

    // 发送模式的唯一入口：设置面板开关与输入框按钮共用，避免两处各写一遍「改状态/写存储/同步 UI/提示」。
    function setCtrlEnterMode(on) {
        ctrlEnterEnabled = !!on;
        GM_setValue(STORAGE_CTRL_ENTER, ctrlEnterEnabled);
        syncCtrlEnterBtn();
        updateCtrlEnterBtnUI();
        // 切换微动画：触发脉冲 class，动画结束后可再次触发
        const btn = document.getElementById('ds-ctrl-enter-btn');
        if (btn) {
            btn.classList.remove('ds-ctrl-enter-pulse');
            void btn.offsetWidth; // 强制 reflow，重置动画以便连续切换也能播放
            btn.classList.add('ds-ctrl-enter-pulse');
        }
        showToast(`发送快捷键已切换：${ctrlEnterEnabled ? 'Ctrl+Enter 发送' : 'Enter 发送'}`);
    }

    // 输入框切换按钮 / Ctrl+Shift+Enter 快捷键走的就是上面同一个入口
    function toggleCtrlEnterMode() {
        setCtrlEnterMode(!ctrlEnterEnabled);
    }

    let _ctrlEnterSyncTimer = null;
    let _lastCtrlEnterSyncAt = 0;
    // 按钮同步节流：节流（≥80ms 立即执行）+ 尾调用兜底，保证工具栏出现/输入变化后跟上。
    function scheduleCtrlEnterSync() {
        const now = Date.now();
        if (now - _lastCtrlEnterSyncAt >= 80) {
            _lastCtrlEnterSyncAt = now;
            safeRun(syncCtrlEnterBtn, '快捷键按钮');
            return;
        }
        if (_ctrlEnterSyncTimer) return; // 已有尾调用在途，合并
        _ctrlEnterSyncTimer = setTimeout(() => {
            _ctrlEnterSyncTimer = null;
            _lastCtrlEnterSyncAt = Date.now();
            safeRun(syncCtrlEnterBtn, '快捷键按钮');
        }, 80);
    }

    // 同步覆盖按钮：开关关 / 无发送按钮 / 输入框有内容 → 移除（露出原生发送）；否则创建并叠到发送按钮中心。
    // **按钮不能随「Ctrl+Enter 发送」关闭而消失** —— 它本身负责双向切换，若一并消失，用户只能回设置面板。
    let _sendBtnWarned = false;   // 「开关开着却找不到发送按钮」只报一次，避免高频刷屏
    function syncCtrlEnterBtn() {
        try {
            let btn = document.getElementById('ds-ctrl-enter-btn');
            const send = findSendButton();
            const hasContent = textareaHasContent();
            if (!send || !send.isConnected) {
                // 找不到宿主 = 页面结构可能变了。开关关着时是正常情况；开着还没宿主必须留痕，
                // 否则用户只会觉得"这个按钮坏了"，而控制台什么都没有。
                if (showCtrlEnterBtn && !_sendBtnWarned) {
                    _sendBtnWarned = true;
                    console.error('[dst] 未找到发送按钮，快捷键切换按钮无法挂载（页面结构可能已变）');
                }
                if (btn) btn.remove();
                return;
            }
            if (!showCtrlEnterBtn || hasContent) {
                if (btn) btn.remove();
                return;
            }
            if (!btn) {
                btn = document.createElement('div');
                btn.id = 'ds-ctrl-enter-btn';
                btn.setAttribute('role', 'button');
                btn.innerHTML = ICON_ENTER_KEY;
                // 阻止冒泡：覆盖按钮嵌在发送按钮容器内，点击不能穿透到原生发送逻辑
                btn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); toggleCtrlEnterMode(); });
                // 阻止 mouse 事件冒泡：否则会连带触发被盖住的原生发送按钮的 tooltip
                btn.addEventListener('mouseover', (e) => e.stopPropagation());
                btn.className = 'ds-ctrl-enter-btn';
            }
            // 对齐：作为发送按钮父容器的子节点，圆形按钮居中对齐到发送按钮中心
            const host = send.parentElement;
            if (!host) return;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            if (btn.parentElement !== host) host.appendChild(btn);
            positionCtrlEnterBtn(btn, send);
            // 刚挂载时输入区可能尚未完成布局（offset 为 0，按钮会落到左上角）→ 下一帧再校准一次
            requestAnimationFrame(() => {
                if (btn.isConnected && !textareaHasContent()) positionCtrlEnterBtn(btn, send);
            });
            updateCtrlEnterBtnUI();
        } catch (e) {
            console.error('[dst] 快捷键按钮同步异常:', e);
        }
    }

    // 让圆形按钮居中覆盖在发送按钮上（相对 host 的偏移）
    function positionCtrlEnterBtn(btn, send) {
        btn.style.left = (send.offsetLeft + send.offsetWidth / 2 - 18) + 'px';
        btn.style.top = (send.offsetTop + send.offsetHeight / 2 - 18) + 'px';
    }

    // 监听输入框内容变化：有内容时立即隐藏覆盖按钮（露出发送），无内容时显示覆盖按钮
    document.addEventListener('input', (e) => {
        if (!showCtrlEnterBtn) return;
        if (e.target && e.target.tagName === 'TEXTAREA') scheduleCtrlEnterSync();
    }, true);

    // Ctrl/Cmd+Shift+Enter 在任意位置（含输入框）切换发送模式，不依赖按钮；本监听注册在发送快捷键监听之前。
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            toggleCtrlEnterMode();
        }
    }, true);

    // ==================== 统一 DOM 监听（合并多个 observer，添加节流） ====================
    let _domObserver = null;
    function observeDOM() {
        if (_domObserver) return;
        // 回调顶层 try/catch：不隔离的话，本批次出错点之后的表格/思考区/按钮刷新会被整体跳过，且无 [dst] 日志
        function handleDomMutations(mutations) {
            // 增量收集新增的 pre 节点（替代全量 querySelectorAll('pre') 扫描）
            const newPreEls = new Set();
            let hasNewTables = false;
            let hasNewThinking = false;
            let folderNeedsRescan = false;   // 对话文件夹：出现新的会话链接/三点菜单时刷新

            for (const m of mutations) {
                if (m.type === 'characterData') {
                    const p = m.target && m.target.parentElement;
                    // 思考区域内文本流式更新（逐字追加）→ 刷新预览窗口
                    if (p && p.closest && p.closest('.ds-think-content')) hasNewThinking = true;
                    continue;
                }
                if (m.type !== 'childList' || !m.addedNodes.length) continue;
                for (const node of m.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;

                    // 代码块检测：增量收集新增的 pre 节点（含后代中的 pre），交由下方统一处理
                    if (node.matches && node.matches('pre')) {
                        newPreEls.add(node);
                    } else if (node.querySelectorAll && node.querySelector('pre')) {
                        node.querySelectorAll('pre').forEach(p => newPreEls.add(p));
                    }

                    // 表格检测（含增量行/列，防范流式输出中仅新增 tr/td/th 的情况）
                    if (!hasNewTables) {
                        if (node.matches && node.matches('table,tbody,thead,tfoot,tr,td,th,.ds-markdown')) hasNewTables = true;
                        else if (node.querySelectorAll && (node.querySelector('table') || node.querySelector('.ds-markdown'))) hasNewTables = true;
                    }

                    // 思考区新节点有三种形态：自身 / 内含 / 位于其内。三种都要判 —— 只查 closest 会漏掉
                    // 「整体出现」那种（切换旧对话时思考区不套窗口、保持原生展开）。
                    if (!hasNewThinking) {
                        if (node.matches && (node.matches('.ds-think-content') || node.closest('.ds-think-content'))) {
                            hasNewThinking = true;
                        } else if (node.querySelector && node.querySelector('.ds-think-content')) {
                            hasNewThinking = true;
                        }
                    }

                    // 对话文件夹：用于纠偏官网虚拟列表/菜单复用等不一定会 emit 匹配文件的情况，与原独立脚本一致、
                    // 使用宽触发——任何 ELEMENT 新增都计划重扫。schedule 自带 120ms 节流，且 ensurePanel/refreshTags/
                    // applyHiding/标签注入都是幂等操作（不产生新的 childList），面板自身的插入也只多触发一次自稳 tick，不会自循环。
                    if (folderManagerEnabled && !folderNeedsRescan) folderNeedsRescan = true;
                }
            }

            // 仅处理新增的 pre（addFoldButtonToCodeBlock 内部幂等）；单个节点异常不拖累同批其他节点
            newPreEls.forEach(pre => safeRun(() => addFoldButtonToCodeBlock(pre), '代码块折叠按钮'));
            if (hasNewTables) scheduleTableProcess();
            if (hasNewThinking) scheduleThinkPreviewRefresh();
            // 快捷键按钮需重新挂载：漏掉会导致面板开启后不生效、切换对话后按钮消失且不再恢复
            scheduleCtrlEnterSync();
            if (folderNeedsRescan) folderUnit.schedule();
        }
        _domObserver = new MutationObserver(mutations => {
            try { handleDomMutations(mutations); }
            catch (e) { console.error('[dst] DOM 观察批次异常（batch=' + mutations.length + '）:', e); }
        });
        _domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    // ==================== 初始化 ====================
    // 各功能模块独立异常隔离：任一模块失败不影响其他功能。
    // 监听器（observeDOM）必须无条件最先启动——预览窗口刷新、按钮自愈都依赖它。
    function safeRun(fn, label) {
        try { fn(); }
        catch (e) { console.error('[dst] ' + (label || '模块') + ' 异常:', e); }
    }

    function init() {
        applyTableThemeClass(tableThemeMode);
        applyWideScreen(wideScreen);
        setTableButtonsAlways(tableButtonsAlways);
        // 监听器必须**无条件最先**启动：它是预览窗口刷新、按钮自愈等所有动态功能的基础 —— 前面任一初始化
        // 抛错中断 init，监听器就永远装不上，表现为「脚本半死不活」且无任何提示。
        observeDOM();
        // 以下初始化全部逐个隔离：任一失败不影响其他功能，也不会拖垮已经装上的监听器
        safeRun(cleanupLegacyWrappers, '清理旧包裹层');
        safeRun(deduplicateButtons, '折叠按钮去重');
        safeRun(processAllExistingCodeBlocks, '初始化代码块折叠');
        safeRun(processAllTables, '初始化表格');
        // 表格导出按钮：触显是纯 CSS（悬停即显示），无需在 init 里装东西；按钮容器由 processAllTables 挂上
        safeRun(applyThinkPreviewHeight, '思考预览定高'); // 先落 CSS 变量，供后续初始化读取
        safeRun(setupInitialThinkContents, '思考区初始化');
        safeRun(syncCtrlEnterBtn, '快捷键按钮');
        if (folderManagerEnabled) {
            // 与上面各步一致地隔离：文件夹模块起不来也不能影响已装好的其他功能
            safeRun(() => { folderUnit.on(); folderUnit.schedule(); }, '对话文件夹初始化');
        }

        // resize 节流处理表格
        window.addEventListener('resize', () => {
            clearTimeout(window._resizeFix);
            window._resizeFix = setTimeout(() => safeRun(processAllTables, 'resize 表格刷新'), 100);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
