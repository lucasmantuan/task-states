const { Plugin, MarkdownView } = require('obsidian');

const EVENT_TYPE = 'pointerdown';
const CAPTURE = true;
const DEDUPE_WINDOW_MS = 250;
const CHECKBOX_SELECTOR = 'input.task-list-item-checkbox';

const TASK_LINE_PATTERN = /^(\s*(?:>\s*)*[-*+]\s*)\[([^\]]*)\]/;
const TASK_TEXT_PATTERN = /^\s*(?:>\s*)*[-*+]\s*\[[^\]]*\]\s*(.*)$/;

const isElement = (node) => node instanceof Element;

const getComposedPath = (ev) => {
    if (typeof ev?.composedPath === 'function') {
        const path = ev.composedPath();
        if (Array.isArray(path) && path.length > 0) return path;
    }
    return ev?.target ? [ev.target] : [];
};

const getElementFromPath = (path) => {
    for (const node of path) {
        if (isElement(node)) return node;
    }
    return null;
};

const parseDataLine = (raw) => {
    if (raw == null) return null;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
};

const parseSourcepos = (raw) => {
    if (raw == null) return null;
    const match = String(raw)
        .trim()
        .match(/^(\d+):\d+(?:-\d+:\d+)?$/);
    if (!match) return null;
    const lineOneBased = Number.parseInt(match[1], 10);
    if (!Number.isFinite(lineOneBased) || lineOneBased < 1) return null;
    return lineOneBased - 1;
};

const getDataLineRaw = (el) => {
    if (!isElement(el)) return null;
    const raw = el.dataset?.line;
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
};

const getSourceposRaw = (el) => {
    if (!isElement(el)) return null;
    const fromDataset = el.dataset?.sourcepos;
    if (typeof fromDataset === 'string' && fromDataset.length > 0) return fromDataset;
    const fromAttr = el.getAttribute?.('data-sourcepos');
    return typeof fromAttr === 'string' && fromAttr.length > 0 ? fromAttr : null;
};

const isMarkdownView = (view) => {
    if (!view) return false;
    if (typeof view.getViewType === 'function') return view.getViewType() === 'markdown';
    const type = view.viewType ?? view.type;
    return type === 'markdown';
};

const getViewMode = (view) => {
    if (!view) return null;
    if (typeof view.getMode === 'function') return view.getMode();
    if (typeof view.getState === 'function') {
        const state = view.getState();
        if (state && typeof state.mode === 'string') return state.mode;
    }
    if (typeof view.currentMode?.getMode === 'function') return view.currentMode.getMode();
    const modeName = view.currentMode?.mode;
    return typeof modeName === 'string' ? modeName : null;
};

const isReadingView = (view) => getViewMode(view) === 'preview';

const getEditor = (app) => {
    const leaf = app?.workspace?.activeLeaf;
    const view = leaf?.view;
    if (!view || typeof view.getViewType !== 'function') return null;
    if (view.getViewType() !== 'markdown') return null;

    const candidates = [
        view.editor ?? null,
        view.sourceMode?.cmEditor ?? null,
        view.sourceMode?.editor ?? null,
        view.currentMode?.editor ?? null
    ];

    for (const editor of candidates) {
        if (!editor) continue;
        if (
            typeof editor.getLine === 'function' &&
            (typeof editor.setLine === 'function' || typeof editor.replaceRange === 'function')
        ) {
            return editor;
        }
    }

    return null;
};

const setLine = (editor, lineNo, newText) => {
    if (!editor) return false;

    if (typeof editor.setLine === 'function') {
        editor.setLine(lineNo, newText);
        return true;
    }

    if (typeof editor.replaceRange === 'function' && typeof editor.getLine === 'function') {
        const old = editor.getLine(lineNo);
        if (typeof old !== 'string') return false;
        editor.replaceRange(newText, { line: lineNo, ch: 0 }, { line: lineNo, ch: old.length });
        return true;
    }

    return false;
};

const toggleMarker = (text) => {
    const value = String(text ?? '');
    const match = value.match(TASK_LINE_PATTERN);
    if (!match) return value;

    const prefix = match[1];
    const marker = match[2];
    const sequence = ['*', 'x', '-', '!', '>', ' '];
    const index = sequence.indexOf(marker);
    const next = index === -1 ? sequence[0] : sequence[(index + 1) % sequence.length];

    return value.replace(TASK_LINE_PATTERN, `${prefix}[${next}]`);
};

const extractTaskText = (line) => {
    const match = String(line ?? '').match(TASK_TEXT_PATTERN);
    if (!match) return null;
    return match[1].trim();
};

const getTaskTextPreview = (checkboxEl) => {
    const text = checkboxEl?.closest?.('li')?.innerText?.trim() ?? null;
    if (!text) return null;
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
};

const findCheckboxFromEvent = (ev, path) => {
    const target = ev?.target;
    if (isElement(target) && target.matches?.(CHECKBOX_SELECTOR)) return target;

    for (const node of path) {
        if (isElement(node) && node.matches?.(CHECKBOX_SELECTOR)) return node;
    }

    return null;
};

const resolveMarkdownView = (app, eventPath) => {
    const workspace = app?.workspace ?? null;
    if (!workspace) return null;

    const activeLeafView = workspace.activeLeaf?.view ?? null;
    if (isMarkdownView(activeLeafView)) return activeLeafView;

    if (MarkdownView && typeof workspace.getActiveViewOfType === 'function') {
        const typedView = workspace.getActiveViewOfType(MarkdownView);
        if (isMarkdownView(typedView)) return typedView;
    }

    const eventEl = getElementFromPath(eventPath);
    if (!eventEl || typeof workspace.getLeavesOfType !== 'function') return null;

    const markdownLeaves = workspace.getLeavesOfType('markdown') ?? [];
    for (const leaf of markdownLeaves) {
        const view = leaf?.view ?? null;
        if (!isMarkdownView(view)) continue;
        const containerEl = view?.containerEl ?? leaf?.containerEl ?? null;
        if (isElement(containerEl) && (containerEl === eventEl || containerEl.contains(eventEl))) {
            return view;
        }
    }

    return null;
};

const resolveLineFromSections = (view, checkboxEl) => {
    const candidates = [
        view?.previewMode?.renderer?.sections,
        view?.previewMode?.sections,
        view?.currentMode?.renderer?.sections
    ];

    for (const sections of candidates) {
        if (!Array.isArray(sections)) continue;

        for (const section of sections) {
            const sectionEl = section?.el;
            if (!isElement(sectionEl)) continue;
            if (!sectionEl.contains(checkboxEl) && sectionEl !== checkboxEl) continue;

            const lineStart = Number.parseInt(String(section?.lineStart), 10);
            if (Number.isFinite(lineStart) && lineStart >= 0) return lineStart;
        }
    }

    return null;
};

const resolveLine = (view, checkboxEl, path) => {
    const inputDataLineRaw = getDataLineRaw(checkboxEl);
    const inputDataLine = parseDataLine(inputDataLineRaw);
    if (inputDataLine != null) return inputDataLine;

    const closestDataLineEl = checkboxEl?.closest?.('[data-line]') ?? null;
    const closestDataLineRaw = getDataLineRaw(closestDataLineEl);
    const closestDataLine = parseDataLine(closestDataLineRaw);
    if (closestDataLine != null) return closestDataLine;

    for (const node of path) {
        const raw = getDataLineRaw(node);
        const line = parseDataLine(raw);
        if (line != null) return line;
    }

    const sourceposCandidates = [];

    const inputSourceposRaw = getSourceposRaw(checkboxEl);
    if (inputSourceposRaw != null) sourceposCandidates.push(inputSourceposRaw);

    const closestSourceEl = checkboxEl?.closest?.('[data-sourcepos]') ?? null;
    const closestSourceRaw = getSourceposRaw(closestSourceEl);
    if (closestSourceRaw != null) sourceposCandidates.push(closestSourceRaw);

    for (const node of path) {
        const raw = getSourceposRaw(node);
        if (raw != null) sourceposCandidates.push(raw);
    }

    for (const raw of sourceposCandidates) {
        const line = parseSourcepos(raw);
        if (line != null) return line;
    }

    return resolveLineFromSections(view, checkboxEl);
};

const buildCandidateIndexes = (lines, lineZeroBased, taskTextPreview) => {
    const result = [];
    const seen = new Set();
    const total = lines.length;

    const push = (idx) => {
        if (!Number.isInteger(idx) || idx < 0 || idx >= total || seen.has(idx)) return;
        seen.add(idx);
        result.push(idx);
    };

    push(lineZeroBased);
    for (let delta = 1; delta <= 8; delta += 1) {
        push(lineZeroBased - delta);
        push(lineZeroBased + delta);
    }

    const expected = String(taskTextPreview ?? '').trim();
    if (expected.length > 0) {
        for (let i = 0; i < total; i += 1) {
            if (extractTaskText(lines[i]) === expected) push(i);
        }
        for (let i = 0; i < total; i += 1) {
            const text = extractTaskText(lines[i]);
            if (text && (text.includes(expected) || expected.includes(text))) push(i);
        }
    }

    return result;
};

const toggleTaskAtLineViaVault = async (app, view, lineZeroBased, taskTextPreview) => {
    const file = view?.file ?? null;
    if (!file) return false;

    const vault = app?.vault;
    if (!vault || typeof vault.cachedRead !== 'function' || typeof vault.modify !== 'function') {
        return false;
    }

    try {
        const content = await vault.cachedRead(file);
        const text = String(content);
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const lines = text.split(/\r?\n/);
        const candidates = buildCandidateIndexes(lines, lineZeroBased, taskTextPreview);

        let chosenIndex = null;
        let updated = null;

        for (const idx of candidates) {
            const candidateUpdated = toggleMarker(lines[idx]);
            if (candidateUpdated === lines[idx]) continue;
            chosenIndex = idx;
            updated = candidateUpdated;
            break;
        }

        if (chosenIndex == null || updated == null) return false;

        lines[chosenIndex] = updated;
        await vault.modify(file, lines.join(eol));
        return true;
    } catch (_) {
        return false;
    }
};

const toggleTaskAtLine = async (app, view, lineZeroBased, taskTextPreview) => {
    if (!Number.isFinite(lineZeroBased) || lineZeroBased < 0) return false;

    const editor = getEditor(app);
    if (editor) {
        const current = editor.getLine(lineZeroBased);
        if (typeof current === 'string') {
            const updated = toggleMarker(current);
            if (updated !== current && setLine(editor, lineZeroBased, updated)) {
                return true;
            }
        }
    }

    return toggleTaskAtLineViaVault(app, view, lineZeroBased, taskTextPreview);
};

class TaskStatesPlugin extends Plugin {
    constructor(app, manifest) {
        super(app, manifest);
        this._handler = null;
        this._lastHandled = {
            timeMs: 0,
            checkboxEl: null
        };
    }

    async onload() {
        if (this._handler) {
            document.removeEventListener(EVENT_TYPE, this._handler, CAPTURE);
            this._handler = null;
        }

        this._handler = async (ev) => {
            const path = getComposedPath(ev);
            const checkboxEl = findCheckboxFromEvent(ev, path);
            if (!checkboxEl) return;

            const view = resolveMarkdownView(this.app, path);
            if (!view || !isReadingView(view)) return;

            ev.preventDefault();
            ev.stopImmediatePropagation();

            const now = Date.now();
            const last = this._lastHandled;
            if (last.checkboxEl === checkboxEl && now - last.timeMs <= DEDUPE_WINDOW_MS) return;

            this._lastHandled = {
                timeMs: now,
                checkboxEl
            };

            const lineNo = resolveLine(view, checkboxEl, path);
            if (lineNo == null) return;

            await toggleTaskAtLine(this.app, view, lineNo, getTaskTextPreview(checkboxEl));
        };

        document.addEventListener(EVENT_TYPE, this._handler, CAPTURE);
    }

    onunload() {
        if (this._handler) {
            document.removeEventListener(EVENT_TYPE, this._handler, CAPTURE);
            this._handler = null;
        }

        this._lastHandled = {
            timeMs: 0,
            checkboxEl: null
        };
    }
}

module.exports = TaskStatesPlugin;
