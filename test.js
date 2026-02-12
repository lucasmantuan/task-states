const { Plugin, MarkdownView } = require('obsidian');

const EVENT_TYPE = 'pointerdown';
const CAPTURE = true;
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

const parseLineFromDataLine = (raw) => {
    if (raw == null) return null;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
};

const parseLineFromSourcepos = (raw) => {
    if (raw == null) return null;
    const match = String(raw)
        .trim()
        .match(/^(\d+):\d+(?:-\d+:\d+)?$/);
    if (!match) return null;
    const lineOneBased = Number.parseInt(match[1], 10);
    if (!Number.isFinite(lineOneBased) || lineOneBased < 1) return null;
    return lineOneBased - 1;
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

const resolveMarkdownView = (app) => {
    const workspace = app?.workspace ?? null;
    if (!workspace) return null;

    const activeLeafView = workspace.activeLeaf?.view ?? null;
    if (isMarkdownView(activeLeafView)) return activeLeafView;

    if (MarkdownView && typeof workspace.getActiveViewOfType === 'function') {
        const typedView = workspace.getActiveViewOfType(MarkdownView);
        if (isMarkdownView(typedView)) return typedView;
    }

    return null;
};

const resolveLine = (checkboxEl) => {
    const dataLineCandidates = [
        checkboxEl?.dataset?.line ?? null,
        checkboxEl?.closest?.('[data-line]')?.dataset?.line ?? null
    ];

    for (const raw of dataLineCandidates) {
        const line = parseLineFromDataLine(raw);
        if (line != null) return line;
    }

    const sourceposEl = checkboxEl?.closest?.('[data-sourcepos]') ?? checkboxEl ?? null;
    const sourceposRaw = sourceposEl?.dataset?.sourcepos ?? sourceposEl?.getAttribute?.('data-sourcepos') ?? null;

    return parseLineFromSourcepos(sourceposRaw);
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
    return toggleTaskAtLineViaVault(app, view, lineZeroBased, taskTextPreview);
};

module.exports = class TaskStatesPlugin extends Plugin {
    constructor(app, manifest) {
        super(app, manifest);
        this._handler = null;
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

            const view = resolveMarkdownView(this.app);
            if (!view || !isReadingView(view)) return;

            ev.preventDefault();
            ev.stopImmediatePropagation();

            const lineNo = resolveLine(checkboxEl);
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
    }
};
