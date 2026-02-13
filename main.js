const { Plugin } = require('obsidian');

const CHECKBOX_SELECTOR = 'input.task-list-item-checkbox';
const TASK_LINE_PATTERN = /^(\s*(?:>\s*)*[-*+]\s*)\[([^\]]*)\]/;
const TASK_TEXT_PATTERN = /^\s*(?:>\s*)*[-*+]\s*\[[^\]]*\]\s*(.*)$/;

/** Converte um valor de data-line para número de linha válido (0-based). */
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

/** Cicla o marcador da tarefa na ordem definida pelo plugin. */
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

/** Extrai apenas o texto da tarefa, removendo o marcador de lista e status. */
const extractTaskText = (line) => {
    const match = String(line ?? '').match(TASK_TEXT_PATTERN);
    if (!match) return null;
    return match[1].trim();
};

/** Captura uma prévia do texto da tarefa clicada para ajudar na heurística de busca. */
const getTaskTextPreview = (checkboxEl) => {
    const text = checkboxEl?.closest?.('li')?.innerText?.trim() ?? null;
    if (!text) return null;
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
};

/** Identifica se o evento veio de um checkbox de tarefa válido. */
const findCheckboxFromEvent = (ev) => {
    const target = ev?.target;
    if (target instanceof Element && target.matches?.(CHECKBOX_SELECTOR)) return target;
    return null;
};

/** Resolve a linha de uma tarefa em preview usando os atributos data-line do DOM renderizado. */
const resolveLineFromPreviewCheckbox = (checkboxEl) => {
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

/** Monta uma lista de candidatos de linha para reduzir falhas quando o data-line diverge. */
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

/** Aplica o ciclo de status no arquivo via vault.modify para o modo preview. */
const toggleTaskAtLineViaVault = async (app, view, lineZeroBased, taskTextPreview) => {
    if (!Number.isFinite(lineZeroBased) || lineZeroBased < 0) return false;

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

/** Processa o clique em preview e grava a alteração diretamente no arquivo da nota. */
const handlePreviewInteraction = async (app, view, checkboxEl) => {
    const lineNo = resolveLineFromPreviewCheckbox(checkboxEl);
    if (lineNo == null) return false;

    return toggleTaskAtLineViaVault(app, view, lineNo, getTaskTextPreview(checkboxEl));
};

/** Processa o clique em edição e atualiza a linha no editor. */
const handleEditInteraction = (app, ev) => {
    return toggleTaskAtLineViaEditor(app, ev);
};

module.exports = class TaskStatesPlugin extends Plugin {
    /** Registra listeners separados para preview e edição após carregar o plugin. */
    async onload() {
        this._previewHandler = async (ev) => {
            const checkboxEl = findCheckboxFromEvent(ev);
            if (!checkboxEl) return;

            const view = resolveMarkdownView(this.app);
            if (!view || resolveViewMode(view) !== 'preview') return;

            // Em preview, bloqueia o toggle visual padrão e grava no markdown do arquivo.
            ev.preventDefault();
            ev.stopImmediatePropagation();

            await handlePreviewInteraction(this.app, view, checkboxEl);
        };

        this._editHandler = (ev) => {
            const checkboxEl = findCheckboxFromEvent(ev);
            if (!checkboxEl) return;

            const view = resolveMarkdownView(this.app);
            if (!view) return;
            if (resolveViewMode(view) === 'preview') return;

            // Em edição, mantém o comportamento baseado em coordenadas do clique.
            ev.preventDefault();
            ev.stopImmediatePropagation();

            handleEditInteraction(this.app, ev);
        };

        document.addEventListener('pointerdown', this._previewHandler, true);
        document.addEventListener('click', this._editHandler, true);
    }

    /** Remove listeners registrados pelo plugin ao descarregar. */
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
