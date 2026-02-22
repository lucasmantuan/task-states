const { Plugin } = require('obsidian');

/** Seletores e eventos de interação no DOM. */
const EVENT_LISTENER_CAPTURE_PHASE = true;
const TASK_CHECKBOX_SELECTOR = 'input.task-list-item-checkbox';
const CLICK_EVENT_NAME = 'click';
const DATA_LINE_ATTRIBUTE_SELECTOR = '[data-line]';
const LIST_ITEM_TAG_SELECTOR = 'li';
const TASK_LIST_ITEM_SELECTOR = 'li.task-list-item';
const POINTER_DOWN_EVENT_NAME = 'pointerdown';

/** Tipos e modos de view utilizados pelo plugin. */
const PREVIEW_VIEW_MODE = 'preview';
const MARKDOWN_VIEW_TYPE_NAME = 'markdown';

/** Literais de texto e separadores reutilizados. */
const ELLIPSIS_SUFFIX = '...';
const EMPTY_TEXT = '';
const UNIX_EOL_SEQUENCE = '\n';
const WINDOWS_EOL_SEQUENCE = '\r\n';
const SPACE_CHARACTER = ' ';
const TOKEN_SEPARATOR_CHARACTER = ' ';

/** Regex de parsing e normalizacao de markdown. */
const BOLD_ASTERISK_MARKDOWN_RE = /\*\*([^*]+)\*\*/g;
const BOLD_UNDERSCORE_MARKDOWN_RE = /__([^_]+)__/g;
const MARKDOWN_RESIDUAL_SYMBOL_RE = /[>*#]/g;
const INLINE_CODE_MARKDOWN_RE = /`([^`]+)`/g;
const ITALIC_ASTERISK_MARKDOWN_RE = /\*([^*]+)\*/g;
const ITALIC_UNDERSCORE_MARKDOWN_RE = /_([^_]+)_/g;
const LEADING_WHITESPACE_RE = /^\s*/;
const LINE_SPLIT_RE = /\r?\n/;
const MARKDOWN_LIST_ITEM_PREFIX_RE = /^\s*(?:>\s*)*[-*+]\s+/;
const MARKDOWN_HEADING_PREFIX_RE = /^\s{0,3}#{1,6}\s+/;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\([^)]+\)/g;
const NON_BREAKING_SPACE_RE = /\u00A0/g;
const TASK_MARKER_LINE_RE = /^(\s*(?:>\s*)*[-*+]\s*)\[([^\]]*)\]/;
const TASK_MARKER_PREFIX_RE = /^\s*(?:>\s*)*[-*+]\s*\[[^\]]*\]\s*/;
const WHITESPACE_SEQUENCE_RE = /\s+/g;
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;
const WIKI_LINK_WITH_ALIAS_RE = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;

/** Parametros de heuristica para localizacao e comparacao de tarefas. */
const CONTAINS_MATCH_BASE_SCORE = 7000;
const EXACT_MATCH_SCORE = 10000;
const FALLBACK_FULL_SCAN_MIN_SCORE = 1500;
const DECIMAL_RADIX = 10;
const TASK_STATUS_MARKER_SEQUENCE = ['*', 'x', '-', '!', '>', ' '];
const PREVIEW_TEXT_MAX_LENGTH = 300;
const JACCARD_SCORE_MULTIPLIER = 5000;
const TASK_SEARCH_WINDOWS = [
    { linesBefore: 50, linesAfter: 150 },
    { linesBefore: 200, linesAfter: 600 },
    { linesBefore: 600, linesAfter: 1200 }
];

/** Normaliza texto para comparacoes, removendo espacos duplicados e NBSP. */
const normalizeTextForComparison = (inputValue) => {
    const normalizedComparisonText = String(inputValue ?? EMPTY_TEXT)
        .replace(NON_BREAKING_SPACE_RE, SPACE_CHARACTER)
        .replace(WHITESPACE_SEQUENCE_RE, SPACE_CHARACTER)
        .trim();

    return normalizedComparisonText;
};

/** Converte o valor de `data-line` para indice numerico valido (>= 0). */
const parseDataLineToLineNumber = (rawDataLineValue) => {
    if (rawDataLineValue == null) {
        return null;
    }

    const parsedLineNumber = Number.parseInt(String(rawDataLineValue), DECIMAL_RADIX);

    if (!Number.isFinite(parsedLineNumber) || parsedLineNumber < 0) {
        return null;
    }

    return parsedLineNumber;
};

/** Verifica se a view recebida é uma view markdown. */
const isMarkdownViewInstance = (viewCandidate) => {
    if (!viewCandidate) {
        return false;
    }

    if (typeof viewCandidate.getViewType === 'function') {
        return viewCandidate.getViewType() === MARKDOWN_VIEW_TYPE_NAME;
    }

    return viewCandidate.viewType === MARKDOWN_VIEW_TYPE_NAME || viewCandidate.type === MARKDOWN_VIEW_TYPE_NAME;
};

/** Descobre o modo atual da view Markdown (preview/live/source). */
const resolveMarkdownViewMode = (markdownView) => {
    if (!markdownView) {
        return null;
    }

    if (typeof markdownView.getMode === 'function') {
        return markdownView.getMode();
    }

    if (typeof markdownView.getState === 'function') {
        return markdownView.getState()?.mode ?? null;
    }

    if (typeof markdownView.currentMode?.getMode === 'function') {
        return markdownView.currentMode.getMode();
    }

    return markdownView.currentMode?.mode ?? null;
};

/** Recupera a view Markdown ativa do workspace. */
const resolveActiveMarkdownView = (obsidianApp) => {
    const activeViewCandidate = obsidianApp?.workspace?.activeLeaf?.view ?? null;

    if (isMarkdownViewInstance(activeViewCandidate)) {
        return activeViewCandidate;
    }

    return null;
};

/** Identifica se o evento veio de um checkbox de tarefa válido. */
const resolveTaskCheckboxFromEvent = (domEvent) => {
    const eventTargetElement = domEvent?.target;

    if (eventTargetElement instanceof Element && eventTargetElement.matches?.(TASK_CHECKBOX_SELECTOR)) {
        return eventTargetElement;
    }

    return null;
};

/** Extrai uma versao curta do texto renderizado da tarefa no preview. */
const extractTaskPreviewText = (taskCheckboxElement) => {
    const taskListItemElement =
        taskCheckboxElement?.closest?.(TASK_LIST_ITEM_SELECTOR) ??
        taskCheckboxElement?.closest?.(LIST_ITEM_TAG_SELECTOR) ??
        null;
    const renderedTaskText = taskListItemElement?.innerText?.trim() ?? null;

    if (!renderedTaskText) {
        return null;
    }

    if (renderedTaskText.length > PREVIEW_TEXT_MAX_LENGTH) {
        return `${renderedTaskText.slice(0, PREVIEW_TEXT_MAX_LENGTH - ELLIPSIS_SUFFIX.length)}${ELLIPSIS_SUFFIX}`;
    }

    return renderedTaskText;
};

/** Resolve a linha aproximada da tarefa com base em atributos `data-line`. */
const resolveApproximateLineFromPreviewCheckbox = (taskCheckboxElement) => {
    const taskListItemElement =
        taskCheckboxElement?.closest?.(TASK_LIST_ITEM_SELECTOR) ??
        taskCheckboxElement?.closest?.(LIST_ITEM_TAG_SELECTOR) ??
        null;

    const candidateDataLineValues = [
        taskCheckboxElement?.dataset?.line ?? null,
        taskListItemElement?.dataset?.line ?? null,
        taskCheckboxElement?.closest?.(DATA_LINE_ATTRIBUTE_SELECTOR)?.dataset?.line ?? null
    ];

    for (const rawDataLineValue of candidateDataLineValues) {
        const parsedLineNumber = parseDataLineToLineNumber(rawDataLineValue);

        if (parsedLineNumber != null) {
            return parsedLineNumber;
        }
    }

    return null;
};

/** Remove sintaxe markdown comum para comparar apenas o texto "plano" da tarefa. */
const stripMarkdownFormattingFromPreviewText = (markdownPreviewText) => {
    let plainPreviewText = String(markdownPreviewText ?? EMPTY_TEXT);

    plainPreviewText = plainPreviewText.replace(TASK_MARKER_PREFIX_RE, EMPTY_TEXT);
    plainPreviewText = plainPreviewText.replace(WIKI_LINK_WITH_ALIAS_RE, '$2');
    plainPreviewText = plainPreviewText.replace(WIKI_LINK_RE, '$1');
    plainPreviewText = plainPreviewText.replace(MARKDOWN_LINK_RE, '$1');
    plainPreviewText = plainPreviewText.replace(INLINE_CODE_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(BOLD_ASTERISK_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(BOLD_UNDERSCORE_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(ITALIC_ASTERISK_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(ITALIC_UNDERSCORE_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(MARKDOWN_RESIDUAL_SYMBOL_RE, SPACE_CHARACTER);

    return normalizeTextForComparison(plainPreviewText);
};

/** Lê o arquivo ativo e devolve linhas mais EOL detectado para escrita segura. */
const readActiveFileSnapshot = async (obsidianApp, markdownView) => {
    const activeFile = markdownView?.file ?? null;
    const appVault = obsidianApp?.vault;

    if (!activeFile || typeof appVault?.cachedRead !== 'function' || typeof appVault?.modify !== 'function') {
        return null;
    }

    const fileContent = await appVault.cachedRead(activeFile);
    const fileText = String(fileContent);
    const endOfLineSequence = fileText.includes(WINDOWS_EOL_SEQUENCE) ? WINDOWS_EOL_SEQUENCE : UNIX_EOL_SEQUENCE;
    const fileLines = fileText.split(LINE_SPLIT_RE);

    return { activeFile, appVault, endOfLineSequence, fileLines };
};

/** Cicla o marcador da tarefa na ordem definida pelo plugin. */
const toggleTaskMarkerInLine = (taskLineText) => {
    const taskLineValue = String(taskLineText ?? EMPTY_TEXT);
    const taskMarkerMatch = taskLineValue.match(TASK_MARKER_LINE_RE);

    if (!taskMarkerMatch) {
        return taskLineValue;
    }

    const taskListPrefix = taskMarkerMatch[1];
    const currentTaskMarker = taskMarkerMatch[2];
    const currentMarkerIndex = TASK_STATUS_MARKER_SEQUENCE.indexOf(currentTaskMarker);
    const nextTaskMarker =
        currentMarkerIndex === -1
            ? TASK_STATUS_MARKER_SEQUENCE[0]
            : TASK_STATUS_MARKER_SEQUENCE[(currentMarkerIndex + 1) % TASK_STATUS_MARKER_SEQUENCE.length];

    return taskLineValue.replace(TASK_MARKER_LINE_RE, `${taskListPrefix}[${nextTaskMarker}]`);
};

/** Junta o bloco da tarefa (linha base + continuacoes) para comparação textual. */
const buildTaskBlockTextForComparison = (fileLines, taskStartLineIndex) => {
    const baseTaskLine = fileLines[taskStartLineIndex];

    if (!TASK_MARKER_PREFIX_RE.test(baseTaskLine)) {
        return baseTaskLine;
    }

    const baseLineIndent = (baseTaskLine.match(LEADING_WHITESPACE_RE) ?? [EMPTY_TEXT])[0].length;
    const taskBlockLines = [baseTaskLine];

    for (let j = taskStartLineIndex + 1; j < fileLines.length; j += 1) {
        const continuationLine = fileLines[j];

        if (!continuationLine) {
            break;
        }

        const continuationLineIndent = (continuationLine.match(LEADING_WHITESPACE_RE) ?? [EMPTY_TEXT])[0].length;

        if (continuationLineIndent <= baseLineIndent && MARKDOWN_LIST_ITEM_PREFIX_RE.test(continuationLine)) {
            break;
        }

        if (MARKDOWN_HEADING_PREFIX_RE.test(continuationLine)) {
            break;
        }

        taskBlockLines.push(continuationLine);
    }

    return taskBlockLines.join(SPACE_CHARACTER);
};

/** Calcula score de similaridade entre texto candidato e texto esperado. */
const calculateMatchScore = (candidatePlainText, expectedPlainText) => {
    if (!candidatePlainText || !expectedPlainText) {
        return 0;
    }

    if (candidatePlainText === expectedPlainText) {
        return EXACT_MATCH_SCORE;
    }

    if (candidatePlainText.includes(expectedPlainText) || expectedPlainText.includes(candidatePlainText)) {
        return CONTAINS_MATCH_BASE_SCORE + Math.min(candidatePlainText.length, expectedPlainText.length);
    }

    const candidateTokens = candidatePlainText.split(TOKEN_SEPARATOR_CHARACTER).filter(Boolean);
    const expectedTokens = expectedPlainText.split(TOKEN_SEPARATOR_CHARACTER).filter(Boolean);

    if (!candidateTokens.length || !expectedTokens.length) {
        return 0;
    }

    const candidateTokenSet = new Set(candidateTokens);
    const expectedTokenSet = new Set(expectedTokens);

    let intersectionCount = 0;

    for (const token of candidateTokenSet) {
        if (expectedTokenSet.has(token)) {
            intersectionCount += 1;
        }
    }

    const unionCount = candidateTokenSet.size + expectedTokenSet.size - intersectionCount;
    const jaccardSimilarity = unionCount ? intersectionCount / unionCount : 0;

    return Math.round(jaccardSimilarity * JACCARD_SCORE_MULTIPLIER);
};

/** Resolve a melhor linha de tarefa candidata usando busca local e fallback global. */
const resolveBestMatchingTaskLine = (fileLines, approximateLineIndex, expectedRenderedTaskText) => {
    const normalizedExpectedText = normalizeTextForComparison(expectedRenderedTaskText);
    const nearbyLineCandidates = [approximateLineIndex, approximateLineIndex - 1, approximateLineIndex + 1];

    for (const i of nearbyLineCandidates) {
        if (!Number.isInteger(i) || i < 0 || i >= fileLines.length) {
            continue;
        }

        const candidateLineText = fileLines[i];

        if (!TASK_MARKER_PREFIX_RE.test(candidateLineText)) {
            continue;
        }

        const taskBlockText = buildTaskBlockTextForComparison(fileLines, i);
        const taskPlainText = stripMarkdownFormattingFromPreviewText(taskBlockText);

        if (taskPlainText === normalizedExpectedText) {
            return { matchedLineIndex: i, matchScore: EXACT_MATCH_SCORE };
        }
    }

    const candidateBaseIndices = nearbyLineCandidates.filter(
        (candidateLineIndex) => Number.isInteger(candidateLineIndex) && candidateLineIndex >= 0
    );

    let bestMatchResult = { matchedLineIndex: null, matchScore: 0 };

    /** Avalia uma linha candidata e atualiza o melhor score encontrado. */
    const evaluateCandidateLine = (candidateLineIndex) => {
        const candidateLineText = fileLines[candidateLineIndex];

        if (!TASK_MARKER_PREFIX_RE.test(candidateLineText)) {
            return;
        }

        const taskBlockText = buildTaskBlockTextForComparison(fileLines, candidateLineIndex);
        const taskPlainText = stripMarkdownFormattingFromPreviewText(taskBlockText);
        const candidateScore = calculateMatchScore(taskPlainText, normalizedExpectedText);

        if (candidateScore > bestMatchResult.matchScore) {
            bestMatchResult = { matchedLineIndex: candidateLineIndex, matchScore: candidateScore };
        }
    };

    for (const baseLineIndex of candidateBaseIndices) {
        for (const searchWindow of TASK_SEARCH_WINDOWS) {
            const startLineIndex = Math.max(0, baseLineIndex - searchWindow.linesBefore);
            const endLineIndex = Math.min(fileLines.length - 1, baseLineIndex + searchWindow.linesAfter);

            for (let i = startLineIndex; i <= endLineIndex; i += 1) {
                evaluateCandidateLine(i);
            }

            if (bestMatchResult.matchScore >= CONTAINS_MATCH_BASE_SCORE) {
                return bestMatchResult;
            }
        }
    }

    if (bestMatchResult.matchScore < FALLBACK_FULL_SCAN_MIN_SCORE && normalizedExpectedText) {
        for (let i = 0; i < fileLines.length; i += 1) {
            evaluateCandidateLine(i);
        }
    }

    if (bestMatchResult.matchedLineIndex == null) {
        return null;
    }

    return bestMatchResult;
};

/** Recupera uma instância de editor compatível com leitura/escrita de linhas. */
const resolveCompatibleEditor = (obsidianApp) => {
    const activeMarkdownView = resolveActiveMarkdownView(obsidianApp);

    if (!activeMarkdownView) {
        return null;
    }

    const editorCandidates = [
        activeMarkdownView.editor ?? null,
        activeMarkdownView.sourceMode?.editor ?? null,
        activeMarkdownView.sourceMode?.cmEditor ?? null,
        activeMarkdownView.currentMode?.editor ?? null
    ];

    for (const editorCandidate of editorCandidates) {
        if (!editorCandidate) {
            continue;
        }

        if (
            typeof editorCandidate.getLine === 'function' &&
            (typeof editorCandidate.setLine === 'function' || typeof editorCandidate.replaceRange === 'function')
        ) {
            return editorCandidate;
        }
    }

    return null;
};

/** Atualiza o conteúdo de uma linha no editor, independente da API exposta. */
const setEditorLineText = (editorInstance, lineNumber, updatedLineText) => {
    if (!editorInstance) {
        return false;
    }

    if (typeof editorInstance.setLine === 'function') {
        editorInstance.setLine(lineNumber, updatedLineText);
        return true;
    }

    if (typeof editorInstance.replaceRange === 'function' && typeof editorInstance.getLine === 'function') {
        const currentLineText = editorInstance.getLine(lineNumber);

        if (typeof currentLineText !== 'string') {
            return false;
        }

        editorInstance.replaceRange(
            updatedLineText,
            { line: lineNumber, ch: 0 },
            { line: lineNumber, ch: currentLineText.length }
        );
        return true;
    }

    return false;
};

/** Aplica o ciclo de status no editor ativo usando a posição do clique para o modo de edição. */
const toggleTaskAtCursorLineInEditor = (obsidianApp, pointerEvent) => {
    const editorInstance = resolveCompatibleEditor(obsidianApp);

    if (!editorInstance || typeof editorInstance.posAtCoords !== 'function') {
        return false;
    }

    const cursorPosition = editorInstance.posAtCoords(pointerEvent.clientX, pointerEvent.clientY);

    if (!cursorPosition || typeof cursorPosition.line !== 'number') {
        return false;
    }

    const lineNumber = cursorPosition.line;
    const currentLineText = editorInstance.getLine(lineNumber);

    if (typeof currentLineText !== 'string') {
        return false;
    }

    const updatedLineText = toggleTaskMarkerInLine(currentLineText);

    if (updatedLineText === currentLineText) {
        return false;
    }

    return setEditorLineText(editorInstance, lineNumber, updatedLineText);
};

/** Processa o clique em edição e atualiza a linha no editor. */
const handleEditModeInteraction = (obsidianApp, clickEvent) => {
    return toggleTaskAtCursorLineInEditor(obsidianApp, clickEvent);
};

module.exports = class TaskStatesPlugin extends Plugin {
    /** Registra handlers de preview e edicao para alternar estado de tarefas. */
    async onload() {
        const obsidianApp = this.app ?? globalThis.app;

        if (!obsidianApp) {
            return;
        }

        /** Handler do preview - localiza a linha real da tarefa e grava no arquivo. */
        this._onPreviewPointerDown = async (pointerEvent) => {
            const taskCheckboxElement = resolveTaskCheckboxFromEvent(pointerEvent);

            if (!taskCheckboxElement) {
                return;
            }

            const activeMarkdownView = resolveActiveMarkdownView(obsidianApp);

            if (!activeMarkdownView) {
                return;
            }

            const currentViewMode = resolveMarkdownViewMode(activeMarkdownView);

            if (currentViewMode !== PREVIEW_VIEW_MODE) {
                return;
            }

            pointerEvent.preventDefault();
            pointerEvent.stopImmediatePropagation();

            const taskPreviewText = extractTaskPreviewText(taskCheckboxElement);
            const approximateLineIndex = resolveApproximateLineFromPreviewCheckbox(taskCheckboxElement);

            const fileSnapshot = await readActiveFileSnapshot(obsidianApp, activeMarkdownView);

            if (!fileSnapshot) {
                return;
            }

            const { activeFile, appVault, endOfLineSequence, fileLines } = fileSnapshot;

            const bestMatchResult = resolveBestMatchingTaskLine(fileLines, approximateLineIndex, taskPreviewText);

            if (!bestMatchResult || bestMatchResult.matchedLineIndex == null) {
                return;
            }

            const matchedLineIndex = bestMatchResult.matchedLineIndex;

            if (matchedLineIndex < 0 || matchedLineIndex >= fileLines.length) {
                return;
            }

            const currentLineText = fileLines[matchedLineIndex];

            if (typeof currentLineText !== 'string') {
                return;
            }

            const updatedLineText = toggleTaskMarkerInLine(currentLineText);

            if (updatedLineText === currentLineText) {
                return;
            }

            fileLines[matchedLineIndex] = updatedLineText;

            try {
                await appVault.modify(activeFile, fileLines.join(endOfLineSequence));
            } catch (ignoredError) {
                void ignoredError;
                return;
            }
        };

        /** Handler de edição - alterna a tarefa diretamente no editor ativo. */
        this._onEditClick = (clickEvent) => {
            const taskCheckboxElement = resolveTaskCheckboxFromEvent(clickEvent);

            if (!taskCheckboxElement) {
                return;
            }

            const activeMarkdownView = resolveActiveMarkdownView(obsidianApp);

            if (!activeMarkdownView) {
                return;
            }

            if (resolveMarkdownViewMode(activeMarkdownView) === PREVIEW_VIEW_MODE) {
                return;
            }

            clickEvent.preventDefault();
            clickEvent.stopImmediatePropagation();

            handleEditModeInteraction(obsidianApp, clickEvent);
        };

        document.addEventListener(POINTER_DOWN_EVENT_NAME, this._onPreviewPointerDown, EVENT_LISTENER_CAPTURE_PHASE);
        document.addEventListener(CLICK_EVENT_NAME, this._onEditClick, EVENT_LISTENER_CAPTURE_PHASE);
    }

    /** Remove os handlers registrados no carregamento do plugin. */
    onunload() {
        if (this._onPreviewPointerDown) {
            document.removeEventListener(
                POINTER_DOWN_EVENT_NAME,
                this._onPreviewPointerDown,
                EVENT_LISTENER_CAPTURE_PHASE
            );
            this._onPreviewPointerDown = null;
        }

        if (this._onEditClick) {
            document.removeEventListener(CLICK_EVENT_NAME, this._onEditClick, EVENT_LISTENER_CAPTURE_PHASE);
            this._onEditClick = null;
        }
    }
};
