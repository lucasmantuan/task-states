const { Plugin } = require('obsidian');

const CHECKBOX_SELECTOR = 'input.task-list-item-checkbox';

const BOLD_ASTERISKS_RE = /\*\*([^*]+)\*\*/g;
const BOLD_UNDERSCORES_RE = /__([^_]+)__/g;
const COMMON_RESIDUE_RE = /[>*#]/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const ITALIC_ASTERISKS_RE = /\*([^*]+)\*/g;
const ITALIC_UNDERSCORES_RE = /_([^_]+)_/g;
const LEADING_WHITESPACE_RE = /^\s*/;
const LINE_SPLIT_RE = /\r?\n/;
const LIST_ITEM_RE = /^\s*(?:>\s*)*[-*+]\s+/;
const MD_HEADING_RE = /^\s{0,3}#{1,6}\s+/;
const MD_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const NBSP_RE = /\u00A0/g;
const TASK_LINE_PATTERN_RE = /^(\s*(?:>\s*)*[-*+]\s*)\[([^\]]*)\]/;
const TASK_PREFIX_RE = /^\s*(?:>\s*)*[-*+]\s*\[[^\]]*\]\s*/;
const WHITESPACE_RE = /\s+/g;
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;
const WIKI_LINK_WITH_ALIAS_RE = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;

const normalize = (string) => {
    const normalized = String(string ?? '')
        .replace(NBSP_RE, ' ')
        .replace(WHITESPACE_RE, ' ')
        .trim();
    return normalized;
};

const parseLineFromDataLine = (raw) => {
    if (raw == null) return null;
    const n = Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
};

/** Verifica se a view recebida é uma view Markdown do Obsidian. */
const isMarkdownView = (view) => {
    if (!view) return false;
    if (typeof view.getViewType === 'function') return view.getViewType() === 'markdown';
    return view.viewType === 'markdown' || view.type === 'markdown';
};

/** Descobre o modo atual da view Markdown (preview/live/source). */
const resolveViewMode = (view) => {
    if (!view) return null;
    if (typeof view.getMode === 'function') return view.getMode();
    if (typeof view.getState === 'function') return view.getState()?.mode ?? null;
    if (typeof view.currentMode?.getMode === 'function') return view.currentMode.getMode();
    return view.currentMode?.mode ?? null;
};

/** Recupera a view Markdown ativa do workspace. */
const resolveMarkdownView = (app) => {
    const view = app?.workspace?.activeLeaf?.view ?? null;
    return isMarkdownView(view) ? view : null;
};

/** Identifica se o evento veio de um checkbox de tarefa válido. */
const findCheckboxFromEvent = (ev) => {
    const target = ev?.target;
    if (target instanceof Element && target.matches?.(CHECKBOX_SELECTOR)) return target;
    return null;
};

const getTaskTextPreview = (checkboxEl) => {
    const li = checkboxEl?.closest?.('li.task-list-item') ?? checkboxEl?.closest?.('li') ?? null;
    const text = li?.innerText?.trim() ?? null;
    if (!text) return null;
    return text.length > 300 ? `${text.slice(0, 297)}...` : text;
};

const resolveApproxLineFromPreviewCheckbox = (checkboxEl) => {
    const li = checkboxEl?.closest?.('li.task-list-item') ?? checkboxEl?.closest?.('li') ?? null;
    const candidates = [
        checkboxEl?.dataset?.line ?? null,
        li?.dataset?.line ?? null,
        checkboxEl?.closest?.('[data-line]')?.dataset?.line ?? null
    ];
    for (const raw of candidates) {
        const line = parseLineFromDataLine(raw);
        if (line != null) return line;
    }
    return null;
};

const stripMarkdownLikePreview = (md) => {
    let normalizedText = String(md ?? '');
    normalizedText = normalizedText.replace(TASK_PREFIX_RE, '');
    normalizedText = normalizedText.replace(WIKI_LINK_WITH_ALIAS_RE, '$2');
    normalizedText = normalizedText.replace(WIKI_LINK_RE, '$1');
    normalizedText = normalizedText.replace(MD_LINK_RE, '$1');
    normalizedText = normalizedText.replace(INLINE_CODE_RE, '$1');
    normalizedText = normalizedText.replace(BOLD_ASTERISKS_RE, '$1');
    normalizedText = normalizedText.replace(BOLD_UNDERSCORES_RE, '$1');
    normalizedText = normalizedText.replace(ITALIC_ASTERISKS_RE, '$1');
    normalizedText = normalizedText.replace(ITALIC_UNDERSCORES_RE, '$1');
    normalizedText = normalizedText.replace(COMMON_RESIDUE_RE, ' ');
    return normalize(normalizedText);
};

const readFileLines = async (app, view) => {
    const file = view?.file ?? null;
    const vault = app?.vault;
    if (!file || typeof vault?.cachedRead !== 'function' || typeof vault?.modify !== 'function') {
        return null;
    }
    const content = await vault.cachedRead(file);
    const text = String(content);
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(LINE_SPLIT_RE);
    return { file, vault, eol, lines };
};

/** Cicla o marcador da tarefa na ordem definida pelo plugin. */
const toggleMarker = (text) => {
    const value = String(text ?? '');
    const match = value.match(TASK_LINE_PATTERN_RE);
    if (!match) return value;

    const prefix = match[1];
    const marker = match[2];
    const sequence = ['*', 'x', '-', '!', '>', ' '];
    const index = sequence.indexOf(marker);
    const next = index === -1 ? sequence[0] : sequence[(index + 1) % sequence.length];

    return value.replace(TASK_LINE_PATTERN_RE, `${prefix}[${next}]`);
};

const joinTaskBlockForComparison = (lines, idx) => {
    const base = lines[idx];
    if (!TASK_PREFIX_RE.test(base)) return base;
    const baseIndent = (base.match(LEADING_WHITESPACE_RE) ?? [''])[0].length;
    const parts = [base];
    for (let j = idx + 1; j < lines.length; j += 1) {
        const ln = lines[j];
        if (!ln) break;
        const indent = (ln.match(LEADING_WHITESPACE_RE) ?? [''])[0].length;
        if (indent <= baseIndent && LIST_ITEM_RE.test(ln)) break;
        if (MD_HEADING_RE.test(ln)) break;
        parts.push(ln);
    }
    return parts.join(' ');
};

const scoreMatch = (candidatePlain, expectedPlain) => {
    if (!candidatePlain || !expectedPlain) return 0;
    if (candidatePlain === expectedPlain) return 10000;

    if (candidatePlain.includes(expectedPlain) || expectedPlain.includes(candidatePlain)) {
        return 7000 + Math.min(candidatePlain.length, expectedPlain.length);
    }

    const candTokens = candidatePlain.split(' ').filter(Boolean);
    const expTokens = expectedPlain.split(' ').filter(Boolean);
    if (!candTokens.length || !expTokens.length) return 0;

    const candSet = new Set(candTokens);
    const expSet = new Set(expTokens);

    let inter = 0;
    for (const tok of candSet) if (expSet.has(tok)) inter += 1;

    const union = candSet.size + expSet.size - inter;
    const jacc = union ? inter / union : 0;

    return Math.round(jacc * 5000);
};

const resolveBestTaskLine = (lines, approxIdx, expectedRenderedText) => {
    const expected = normalize(expectedRenderedText);
    const expectedPlain = expected;

    for (const i of [approxIdx, approxIdx - 1, approxIdx + 1]) {
        if (!Number.isInteger(i) || i < 0 || i >= lines.length) continue;

        const ln = lines[i];
        if (!TASK_PREFIX_RE.test(ln)) continue;

        const block = joinTaskBlockForComparison(lines, i);
        const plain = stripMarkdownLikePreview(block);

        if (plain === expectedPlain) {
            return { idx: i, score: 10000 };
        }
    }

    const tryWindows = [
        { before: 50, after: 150 },
        { before: 200, after: 600 },
        { before: 600, after: 1200 }
    ];

    const bases = [approxIdx, approxIdx - 1, approxIdx + 1].filter((n) => Number.isInteger(n) && n >= 0);

    let best = { idx: null, score: 0 };

    const consider = (i) => {
        const ln = lines[i];
        if (!TASK_PREFIX_RE.test(ln)) return;

        const block = joinTaskBlockForComparison(lines, i);
        const plain = stripMarkdownLikePreview(block);
        const sc = scoreMatch(plain, expectedPlain);

        if (sc > best.score) best = { idx: i, score: sc };
    };

    for (const base of bases) {
        for (const w of tryWindows) {
            const start = Math.max(0, base - w.before);
            const end = Math.min(lines.length - 1, base + w.after);
            for (let i = start; i <= end; i += 1) consider(i);
            if (best.score >= 7000) return best;
        }
    }

    if (best.score < 1500 && expectedPlain) {
        for (let i = 0; i < lines.length; i += 1) consider(i);
    }

    return best.idx == null ? null : best;
};

/** Recupera uma instância de editor compatível com leitura/escrita de linhas. */
const getEditor = (app) => {
    const view = resolveMarkdownView(app);
    if (!view) return null;

    const candidates = [
        view.editor ?? null,
        view.sourceMode?.editor ?? null,
        view.sourceMode?.cmEditor ?? null,
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

/** Atualiza o conteúdo de uma linha no editor, independente da API exposta. */
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

/** Aplica o ciclo de status no editor ativo usando a posição do clique para o modo de edição. */
const toggleTaskAtLineViaEditor = (app, ev) => {
    const editor = getEditor(app);
    if (!editor || typeof editor.posAtCoords !== 'function') return false;

    const pos = editor.posAtCoords(ev.clientX, ev.clientY);
    if (!pos || typeof pos.line !== 'number') return false;

    const lineNo = pos.line;
    const current = editor.getLine(lineNo);
    if (typeof current !== 'string') return false;

    const updated = toggleMarker(current);
    if (updated === current) return false;

    return setLine(editor, lineNo, updated);
};

/** Processa o clique em edição e atualiza a linha no editor. */
const handleEditInteraction = (app, ev) => {
    return toggleTaskAtLineViaEditor(app, ev);
};

module.exports = class TaskStatesPlugin extends Plugin {
    async onload() {
        const app = this.app ?? globalThis.app;
        if (!app) return;

        this._previewHandler = async (ev) => {
            const checkboxEl = findCheckboxFromEvent(ev);
            if (!checkboxEl) return;

            const view = resolveMarkdownView(app);
            if (!view) return;

            const mode = resolveViewMode(view);
            if (mode !== 'preview') return;
            ev.preventDefault();
            ev.stopImmediatePropagation();

            const previewText = getTaskTextPreview(checkboxEl);
            const approxLine = resolveApproxLineFromPreviewCheckbox(checkboxEl);

            const snapshot = await readFileLines(app, view);
            if (!snapshot) return;

            const { file, vault, eol, lines } = snapshot;

            const best = resolveBestTaskLine(lines, approxLine, previewText);

            if (!best || best.idx == null) return;

            const idx = best.idx;
            if (idx < 0 || idx >= lines.length) return;

            const current = lines[idx];
            if (typeof current !== 'string') return;

            const updated = toggleMarker(current);
            if (updated === current) return;

            lines[idx] = updated;

            try {
                await vault.modify(file, lines.join(eol));
            } catch (_) {
                return;
            }
        };

        this._editHandler = (ev) => {
            const checkboxEl = findCheckboxFromEvent(ev);
            if (!checkboxEl) return;

            const view = resolveMarkdownView(app);
            if (!view) return;
            if (resolveViewMode(view) === 'preview') return;

            ev.preventDefault();
            ev.stopImmediatePropagation();

            handleEditInteraction(app, ev);
        };

        document.addEventListener('pointerdown', this._previewHandler, true);
        document.addEventListener('click', this._editHandler, true);
    }

    onunload() {
        if (this._previewHandler) {
            document.removeEventListener('pointerdown', this._previewHandler, true);
            this._previewHandler = null;
        }

        if (this._editHandler) {
            document.removeEventListener('click', this._editHandler, true);
            this._editHandler = null;
        }
    }
};
