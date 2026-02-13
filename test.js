const { Plugin } = require('obsidian');

const TASK_LINE_PATTERN = /^(\s*(?:>\s*)*[-*+]\s*)\[([^\]]*)\]/;
const TASK_TEXT_PATTERN = /^\s*(?:>\s*)*[-*+]\s*\[[^\]]*\]\s*(.*)$/;

const parseLineFromDataLine = (raw) => {
    if (raw == null) return null;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
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

const findCheckboxFromEvent = (ev) => {
    const target = ev?.target;
    if (target instanceof Element && target.matches?.('input.task-list-item-checkbox')) return target;
    return null;
};

const resolveMarkdownView = (app) => {
    return app?.workspace?.activeLeaf?.view ?? null;
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
    return null;
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

module.exports = class TaskStatesPlugin extends Plugin {
    async onload() {
        this._handler = async (ev) => {
            const checkboxEl = findCheckboxFromEvent(ev);
            if (!checkboxEl) return;
            const view = resolveMarkdownView(this.app);
            if (!view || typeof view.getViewType !== 'function' || view.getViewType() !== 'markdown') return;
            const mode =
                (typeof view.getMode === 'function' && view.getMode()) ||
                view.getState?.()?.mode ||
                view.currentMode?.mode ||
                null;
            if (mode !== 'preview') return;
            ev.preventDefault();
            ev.stopImmediatePropagation();
            const lineNo = resolveLine(checkboxEl);
            if (lineNo == null) return;
            await toggleTaskAtLineViaVault(this.app, view, lineNo, getTaskTextPreview(checkboxEl));
        };
        document.addEventListener('pointerdown', this._handler, true);
    }

    onunload() {
        if (this._handler) {
            document.removeEventListener('pointerdown', this._handler, true);
            this._handler = null;
        }
    }
};
