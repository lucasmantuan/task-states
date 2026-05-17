const { Plugin, Modal, Notice, moment, setIcon } = require('obsidian');

/** Seletores e eventos de interação do DOM. */
const EVENT_LISTENER_CAPTURE_PHASE = true;
const TASK_CHECKBOX_SELECTOR = 'input.task-list-item-checkbox';
const CLICK_EVENT_NAME = 'click';
const DATA_LINE_ATTRIBUTE_SELECTOR = '[data-line]';
const LIST_ITEM_TAG_SELECTOR = 'li';
const TASK_LIST_ITEM_SELECTOR = 'li.task-list-item';
const POINTER_DOWN_EVENT_NAME = 'pointerdown';

/** Tipos e modos de visualização usados pelo plugin. */
const PREVIEW_VIEW_MODE = 'preview';
const MARKDOWN_VIEW_TYPE_NAME = 'markdown';

/** Sequências de fim de linha (EOL) suportadas para leitura e escrita. */
const UNIX_EOL_SEQUENCE = '\n';
const WINDOWS_EOL_SEQUENCE = '\r\n';

/** Expressões regulares para parsing e normalização de Markdown. */
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
const TRAILING_WHITESPACE_RE = /\s+$/;
const WHITESPACE_SEQUENCE_RE = /\s+/g;
const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;
const WIKI_LINK_WITH_ALIAS_RE = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;

/** Parâmetros de heurística para localização e comparação de tarefas. */
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

/** Parâmetros do recurso de data Dataview em tarefas Markdown. */
const ADD_DATE_TO_CURRENT_TASK_COMMAND_ID = 'add-or-update-task-date';
const ENTER_KEY_NAME = 'Enter';
const KEY_DOWN_EVENT_NAME = 'keydown';
const MOD_CTA_BUTTON_CLASS_NAME = 'mod-cta';
const TASK_DATE_APPLY_BUTTON_LABEL = 'Aplicar';
const TASK_DATE_BUTTON_CLASS_NAME = 'task-states-date-button';
const TASK_DATE_BUTTON_LABEL = 'Definir data da tarefa';
const TASK_DATE_CANCEL_BUTTON_LABEL = 'Cancelar';
const TASK_DATE_CLEAR_BUTTON_CLASS_NAME = 'task-states-date-clear-button';
const TASK_DATE_CLEAR_BUTTON_LABEL = 'Limpar';
const TASK_DATE_COMMAND_NAME = 'Adicionar ou atualizar data da tarefa';
const TASK_DATE_FIELD_NAME = 'data';
const TASK_DATE_ICON_NAME = 'calendar';
const TASK_DATE_INLINE_FIELD_RE = /\[data::\s*\d{4}-\d{2}-\d{2}\s*\]/;
const TASK_DATE_INLINE_FIELD_WITH_LEADING_SPACE_RE = /\s?\[data::\s*\d{4}-\d{2}-\d{2}\s*\]/g;
const TASK_DATE_INPUT_CLASS_NAME = 'task-states-date-input';
const TASK_DATE_MODAL_CLASS_NAME = 'task-states-date-modal';
const TASK_DATE_INPUT_TYPE_NAME = 'date';
const TASK_DATE_INVALID_DATE_NOTICE = 'Selecione uma data antes de aplicar.';
const TASK_DATE_ISO_FORMAT = 'YYYY-MM-DD';
const TASK_DATE_MODAL_BUTTONS_CLASS_NAME = 'task-states-date-modal-buttons';
const TASK_DATE_MODAL_TITLE = 'Selecione a data da tarefa:';
const TASK_DATE_NOT_A_TASK_NOTICE = 'A linha atual não é uma tarefa Markdown.';
const TASK_DATE_TODAY_BUTTON_LABEL = 'Hoje';
const TASK_DATE_VALUE_RE = /\d{4}-\d{2}-\d{2}/;
const TASK_LIST_ITEM_NESTED_LIST_SELECTOR = ':scope > ul, :scope > ol';
const DATAVIEW_INLINE_FIELD_SELECTOR = '.dataview.inline-field';
const CODE_MIRROR_EDITOR_SELECTOR = '.cm-editor';

/** Normaliza o texto para comparações, removendo espaços duplicados e NBSP. */
const normalizeTextForComparison = (inputValue) => {
    const normalizedComparisonText = String(inputValue ?? '')
        .replace(NON_BREAKING_SPACE_RE, ' ')
        .replace(WHITESPACE_SEQUENCE_RE, ' ')
        .trim();

    return normalizedComparisonText;
};

/** Converte o valor de `data-line` em um índice numérico válido (>= 0). */
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

/** Verifica se a visualização recebida é do tipo Markdown. */
const isMarkdownViewInstance = (viewCandidate) => {
    if (!viewCandidate) {
        return false;
    }

    if (typeof viewCandidate.getViewType === 'function') {
        return viewCandidate.getViewType() === MARKDOWN_VIEW_TYPE_NAME;
    }

    return viewCandidate.viewType === MARKDOWN_VIEW_TYPE_NAME || viewCandidate.type === MARKDOWN_VIEW_TYPE_NAME;
};

/** Identifica o modo atual da visualização Markdown (preview/live/source). */
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

/** Recupera a visualização Markdown ativa no workspace. */
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

/** Extrai uma versão curta do texto renderizado da tarefa no preview. */
const extractTaskPreviewText = (taskCheckboxElement) => {
    const taskListItemElement =
        taskCheckboxElement?.closest?.(TASK_LIST_ITEM_SELECTOR) ??
        taskCheckboxElement?.closest?.(LIST_ITEM_TAG_SELECTOR) ??
        null;

    if (!taskListItemElement) {
        return null;
    }

    const clonedTaskItemElement = taskListItemElement.cloneNode(true);

    for (const dataviewInlineFieldNode of clonedTaskItemElement.querySelectorAll(DATAVIEW_INLINE_FIELD_SELECTOR)) {
        dataviewInlineFieldNode.remove();
    }

    for (const ownDateButtonNode of clonedTaskItemElement.querySelectorAll(`.${TASK_DATE_BUTTON_CLASS_NAME}`)) {
        ownDateButtonNode.remove();
    }

    const renderedTaskText = clonedTaskItemElement.innerText?.trim() ?? null;

    if (!renderedTaskText) {
        return null;
    }

    if (renderedTaskText.length > PREVIEW_TEXT_MAX_LENGTH) {
        return `${renderedTaskText.slice(0, PREVIEW_TEXT_MAX_LENGTH - '...'.length)}...`;
    }

    return renderedTaskText;
};

/** Determina a linha aproximada da tarefa com base em atributos `data-line`. */
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

/** Remove sintaxe Markdown comum para comparar apenas o texto "plano" da tarefa. */
const stripMarkdownFormattingFromPreviewText = (markdownPreviewText) => {
    let plainPreviewText = String(markdownPreviewText ?? '');

    plainPreviewText = plainPreviewText.replace(TASK_MARKER_PREFIX_RE, '');
    plainPreviewText = plainPreviewText.replace(TASK_DATE_INLINE_FIELD_RE, '');
    plainPreviewText = plainPreviewText.replace(WIKI_LINK_WITH_ALIAS_RE, '$2');
    plainPreviewText = plainPreviewText.replace(WIKI_LINK_RE, '$1');
    plainPreviewText = plainPreviewText.replace(MARKDOWN_LINK_RE, '$1');
    plainPreviewText = plainPreviewText.replace(INLINE_CODE_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(BOLD_ASTERISK_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(BOLD_UNDERSCORE_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(ITALIC_ASTERISK_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(ITALIC_UNDERSCORE_MARKDOWN_RE, '$1');
    plainPreviewText = plainPreviewText.replace(MARKDOWN_RESIDUAL_SYMBOL_RE, ' ');

    return normalizeTextForComparison(plainPreviewText);
};

/** Lê o arquivo ativo e retorna as linhas com o EOL detectado para escrita segura. */
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

/** Alterna o marcador da tarefa seguindo a ordem definida pelo plugin. */
const toggleTaskMarkerInLine = (taskLineText) => {
    const taskLineValue = String(taskLineText ?? '');
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

/** Junta o bloco da tarefa (linha base + continuações) para comparação textual. */
const buildTaskBlockTextForComparison = (fileLines, taskStartLineIndex) => {
    const baseTaskLine = fileLines[taskStartLineIndex];

    if (!TASK_MARKER_PREFIX_RE.test(baseTaskLine)) {
        return baseTaskLine;
    }

    const baseLineIndent = (baseTaskLine.match(LEADING_WHITESPACE_RE) ?? [''])[0].length;
    const taskBlockLines = [baseTaskLine];

    for (let j = taskStartLineIndex + 1; j < fileLines.length; j += 1) {
        const continuationLine = fileLines[j];

        if (!continuationLine) {
            break;
        }

        const continuationLineIndent = (continuationLine.match(LEADING_WHITESPACE_RE) ?? [''])[0].length;

        if (continuationLineIndent <= baseLineIndent && MARKDOWN_LIST_ITEM_PREFIX_RE.test(continuationLine)) {
            break;
        }

        if (MARKDOWN_HEADING_PREFIX_RE.test(continuationLine)) {
            break;
        }

        taskBlockLines.push(continuationLine);
    }

    return taskBlockLines.join(' ');
};

/** Calcula a pontuação de similaridade entre o texto candidato e o texto esperado. */
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

    const candidateTokens = candidatePlainText.split(' ').filter(Boolean);
    const expectedTokens = expectedPlainText.split(' ').filter(Boolean);

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

/** Encontra a melhor linha candidata de tarefa usando busca local e fallback global. */
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

    /** Avalia uma linha candidata e atualiza a melhor pontuação encontrada. */
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

/** Recupera uma instância de editor compatível com leitura e escrita de linhas. */
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

/** Atualiza o conteúdo de uma linha no editor, independentemente da API exposta. */
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

/** Aplica o ciclo de status no editor ativo usando a posição do clique no modo de edição. */
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

/** Processa o clique no modo de edição e atualiza a linha no editor. */
const handleEditModeInteraction = (obsidianApp, clickEvent) => {
    return toggleTaskAtCursorLineInEditor(obsidianApp, clickEvent);
};

/** Aplica uma transformação na linha real da tarefa renderizada no modo leitura. */
const applyTransformationToPreviewTaskLine = async (obsidianApp, taskCheckboxElement, transformLineFunction) => {
    const activeMarkdownView = resolveActiveMarkdownView(obsidianApp);

    if (!activeMarkdownView) {
        return false;
    }

    const taskPreviewText = extractTaskPreviewText(taskCheckboxElement);
    const approximateLineIndex = resolveApproximateLineFromPreviewCheckbox(taskCheckboxElement);

    const fileSnapshot = await readActiveFileSnapshot(obsidianApp, activeMarkdownView);

    if (!fileSnapshot) {
        return false;
    }

    const { activeFile, appVault, endOfLineSequence, fileLines } = fileSnapshot;

    const bestMatchResult = resolveBestMatchingTaskLine(fileLines, approximateLineIndex, taskPreviewText);

    if (!bestMatchResult || bestMatchResult.matchedLineIndex == null) {
        return false;
    }

    const matchedLineIndex = bestMatchResult.matchedLineIndex;

    if (matchedLineIndex < 0 || matchedLineIndex >= fileLines.length) {
        return false;
    }

    const currentLineText = fileLines[matchedLineIndex];

    if (typeof currentLineText !== 'string') {
        return false;
    }

    const updatedLineText = transformLineFunction(currentLineText);

    if (updatedLineText === currentLineText) {
        return false;
    }

    fileLines[matchedLineIndex] = updatedLineText;

    try {
        await appVault.modify(activeFile, fileLines.join(endOfLineSequence));
        return true;
    } catch (ignoredError) {
        void ignoredError;
        return false;
    }
};

/** Retorna a data atual no formato ISO `YYYY-MM-DD`. */
const getTodayISODate = () => moment().format(TASK_DATE_ISO_FORMAT);

/** Constrói o campo Dataview de data com a data informada. */
const buildDataviewDateField = (dateValue) => `[${TASK_DATE_FIELD_NAME}:: ${dateValue}]`;

/** Adiciona ou substitui o campo `[data:: YYYY-MM-DD]` em uma linha de tarefa Markdown. */
const addOrReplaceDataviewDateFieldInTaskLine = (taskLineText, dateValue) => {
    const taskLineValue = String(taskLineText ?? '');
    const dataviewDateField = buildDataviewDateField(dateValue);

    if (TASK_DATE_INLINE_FIELD_RE.test(taskLineValue)) {
        return taskLineValue.replace(TASK_DATE_INLINE_FIELD_RE, dataviewDateField);
    }

    return `${taskLineValue.replace(TRAILING_WHITESPACE_RE, '')} ${dataviewDateField}`;
};

/** Extrai a data existente do campo Dataview em uma linha de tarefa, se houver. */
const extractExistingDataviewDateFromTaskLine = (taskLineText) => {
    const taskDateFieldMatch = String(taskLineText ?? '').match(TASK_DATE_INLINE_FIELD_RE);

    if (!taskDateFieldMatch) {
        return null;
    }

    const taskDateValueMatch = taskDateFieldMatch[0].match(TASK_DATE_VALUE_RE);
    return taskDateValueMatch ? taskDateValueMatch[0] : null;
};

/** Atualiza a linha da tarefa renderizada no modo leitura com a data selecionada. */
const addDateFieldFromPreviewTask = (obsidianApp, taskCheckboxElement, selectedDateValue) =>
    applyTransformationToPreviewTaskLine(obsidianApp, taskCheckboxElement, (taskLineText) =>
        addOrReplaceDataviewDateFieldInTaskLine(taskLineText, selectedDateValue)
    );

/** Remove todos os campos `[data:: YYYY-MM-DD]` da linha da tarefa. */
const removeDataviewDateFieldFromTaskLine = (taskLineText) => {
    const taskLineValue = String(taskLineText ?? '');
    const withoutDateField = taskLineValue.replace(TASK_DATE_INLINE_FIELD_WITH_LEADING_SPACE_RE, '');
    return withoutDateField.replace(TRAILING_WHITESPACE_RE, '');
};

/** Remove o campo de data da linha real da tarefa no modo leitura. */
const removeDateFieldFromPreviewTask = (obsidianApp, taskCheckboxElement) =>
    applyTransformationToPreviewTaskLine(obsidianApp, taskCheckboxElement, (taskLineText) =>
        removeDataviewDateFieldFromTaskLine(taskLineText)
    );

/** Atualiza a linha do cursor no editor ativo com a data selecionada. */
const addDateFieldAtCurrentEditorLine = (editorInstance, selectedDateValue) => {
    if (!editorInstance || typeof editorInstance.getCursor !== 'function') {
        return false;
    }

    const cursorPosition = editorInstance.getCursor();

    if (!cursorPosition || typeof cursorPosition.line !== 'number') {
        return false;
    }

    const cursorLineNumber = cursorPosition.line;
    const currentLineText = editorInstance.getLine(cursorLineNumber);

    if (typeof currentLineText !== 'string') {
        return false;
    }

    if (!TASK_MARKER_PREFIX_RE.test(currentLineText)) {
        return false;
    }

    const updatedLineText = addOrReplaceDataviewDateFieldInTaskLine(currentLineText, selectedDateValue);

    if (updatedLineText === currentLineText) {
        return false;
    }

    return setEditorLineText(editorInstance, cursorLineNumber, updatedLineText);
};

/** Remove o campo de data da linha do cursor no editor ativo. */
const removeDateFieldAtCurrentEditorLine = (editorInstance) => {
    if (!editorInstance || typeof editorInstance.getCursor !== 'function') {
        return false;
    }

    const cursorPosition = editorInstance.getCursor();

    if (!cursorPosition || typeof cursorPosition.line !== 'number') {
        return false;
    }

    const cursorLineNumber = cursorPosition.line;
    const currentLineText = editorInstance.getLine(cursorLineNumber);

    if (typeof currentLineText !== 'string') {
        return false;
    }

    if (!TASK_MARKER_PREFIX_RE.test(currentLineText)) {
        return false;
    }

    const updatedLineText = removeDataviewDateFieldFromTaskLine(currentLineText);

    if (updatedLineText === currentLineText) {
        return false;
    }

    return setEditorLineText(editorInstance, cursorLineNumber, updatedLineText);
};

/** Modal de seleção de data utilizado para registrar a data Dataview da tarefa. */
class TaskDatePickerModal extends Modal {
    constructor(obsidianApp, initialDateValue, onSubmit, onClear) {
        super(obsidianApp);
        this.initialDateValue = initialDateValue;
        this.onSubmit = onSubmit;
        this.onClear = onClear;
    }

    /** Constrói o conteúdo do modal e conecta os botões de ação. */
    onOpen() {
        this.modalEl.classList.add(TASK_DATE_MODAL_CLASS_NAME);

        const modalContentElement = this.contentEl;
        modalContentElement.empty();
    modalContentElement.createEl('h3', { text: TASK_DATE_MODAL_TITLE });

        const dateInputElement = modalContentElement.createEl('input', { type: TASK_DATE_INPUT_TYPE_NAME });
        dateInputElement.classList.add(TASK_DATE_INPUT_CLASS_NAME);
        dateInputElement.value = this.initialDateValue || getTodayISODate();

        const modalButtonsContainer = modalContentElement.createDiv({ cls: TASK_DATE_MODAL_BUTTONS_CLASS_NAME });

        const clearButton = modalButtonsContainer.createEl('button', {
            text: TASK_DATE_CLEAR_BUTTON_LABEL,
            cls: TASK_DATE_CLEAR_BUTTON_CLASS_NAME
        });
        clearButton.addEventListener(CLICK_EVENT_NAME, () => {
            this.close();

            if (typeof this.onClear === 'function') {
                this.onClear();
            }
        });

        const todayButton = modalButtonsContainer.createEl('button', { text: TASK_DATE_TODAY_BUTTON_LABEL });
        todayButton.addEventListener(CLICK_EVENT_NAME, () => {
            dateInputElement.value = getTodayISODate();
            dateInputElement.focus();
        });

        const cancelButton = modalButtonsContainer.createEl('button', { text: TASK_DATE_CANCEL_BUTTON_LABEL });
        cancelButton.addEventListener(CLICK_EVENT_NAME, () => {
            this.close();
        });

        const applyButton = modalButtonsContainer.createEl('button', {
            text: TASK_DATE_APPLY_BUTTON_LABEL,
            cls: MOD_CTA_BUTTON_CLASS_NAME
        });
        applyButton.addEventListener(CLICK_EVENT_NAME, () => {
            const selectedDateValue = dateInputElement.value;

            if (!selectedDateValue) {
                new Notice(TASK_DATE_INVALID_DATE_NOTICE);
                return;
            }

            this.close();

            if (typeof this.onSubmit === 'function') {
                this.onSubmit(selectedDateValue);
            }
        });

        dateInputElement.addEventListener(KEY_DOWN_EVENT_NAME, (keyboardEvent) => {
            if (keyboardEvent.key === ENTER_KEY_NAME) {
                keyboardEvent.preventDefault();
                applyButton.click();
            }
        });

        window.setTimeout(() => dateInputElement.focus(), 0);
    }

    /** Limpa o conteúdo do modal ao fechar. */
    onClose() {
        this.contentEl.empty();
    }
}

module.exports = class TaskStatesPlugin extends Plugin {
    /** Registra handlers de preview e edição para alternar o estado das tarefas. */
    async onload() {
        const obsidianApp = this.app ?? globalThis.app;

        if (!obsidianApp) {
            return;
        }

        /** Handler de preview: localiza a linha real da tarefa e grava no arquivo. */
        this._onPreviewPointerDown = async (pointerEvent) => {
            const taskCheckboxElement = resolveTaskCheckboxFromEvent(pointerEvent);

            if (!taskCheckboxElement) {
                return;
            }

            const activeMarkdownView = resolveActiveMarkdownView(obsidianApp);

            if (!activeMarkdownView) {
                return;
            }

            if (resolveMarkdownViewMode(activeMarkdownView) !== PREVIEW_VIEW_MODE) {
                return;
            }

            pointerEvent.preventDefault();
            pointerEvent.stopImmediatePropagation();

            await applyTransformationToPreviewTaskLine(obsidianApp, taskCheckboxElement, toggleTaskMarkerInLine);
        };

        /** Handler de edição: alterna a tarefa diretamente no editor ativo. */
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

        /** Handler delegado: trata clique no botão de data independente de quem reescreveu o DOM. */
        this._onDateButtonClick = (clickEvent) => {
            const eventTargetElement = clickEvent.target;

            if (!(eventTargetElement instanceof Element)) {
                return;
            }

            const dateButtonElement = eventTargetElement.closest(`.${TASK_DATE_BUTTON_CLASS_NAME}`);

            if (!dateButtonElement) {
                return;
            }

            if (dateButtonElement.closest(CODE_MIRROR_EDITOR_SELECTOR)) {
                return;
            }

            clickEvent.preventDefault();
            clickEvent.stopImmediatePropagation();

            const taskListItemElement = dateButtonElement.closest(TASK_LIST_ITEM_SELECTOR);

            if (!taskListItemElement) {
                return;
            }

            const taskCheckboxElement = taskListItemElement.querySelector(TASK_CHECKBOX_SELECTOR);

            if (!taskCheckboxElement) {
                return;
            }

            new TaskDatePickerModal(
                obsidianApp,
                getTodayISODate(),
                async (selectedDateValue) => {
                    await addDateFieldFromPreviewTask(obsidianApp, taskCheckboxElement, selectedDateValue);
                },
                async () => {
                    await removeDateFieldFromPreviewTask(obsidianApp, taskCheckboxElement);
                }
            ).open();
        };

        document.addEventListener(POINTER_DOWN_EVENT_NAME, this._onPreviewPointerDown, EVENT_LISTENER_CAPTURE_PHASE);
        document.addEventListener(CLICK_EVENT_NAME, this._onEditClick, EVENT_LISTENER_CAPTURE_PHASE);
        document.addEventListener(CLICK_EVENT_NAME, this._onDateButtonClick, EVENT_LISTENER_CAPTURE_PHASE);

        this.registerMarkdownPostProcessor((renderedRootElement) => {
            const taskListItemElements = renderedRootElement.querySelectorAll(TASK_LIST_ITEM_SELECTOR);

            for (const taskListItemElement of taskListItemElements) {
                const taskCheckboxElement = taskListItemElement.querySelector(TASK_CHECKBOX_SELECTOR);

                if (!taskCheckboxElement) {
                    continue;
                }

                if (taskListItemElement.querySelector(`:scope > .${TASK_DATE_BUTTON_CLASS_NAME}`)) {
                    continue;
                }

                const dateButtonElement = document.createElement('button');
                dateButtonElement.type = 'button';
                dateButtonElement.classList.add(TASK_DATE_BUTTON_CLASS_NAME);
                dateButtonElement.setAttribute('aria-label', TASK_DATE_BUTTON_LABEL);
                dateButtonElement.title = TASK_DATE_BUTTON_LABEL;
                setIcon(dateButtonElement, TASK_DATE_ICON_NAME);

                const nestedListElement = taskListItemElement.querySelector(TASK_LIST_ITEM_NESTED_LIST_SELECTOR);

                if (nestedListElement) {
                    taskListItemElement.insertBefore(dateButtonElement, nestedListElement);
                } else {
                    taskListItemElement.appendChild(dateButtonElement);
                }
            }
        });

        this.addCommand({
            id: ADD_DATE_TO_CURRENT_TASK_COMMAND_ID,
            name: TASK_DATE_COMMAND_NAME,
            editorCallback: (editorInstance) => {
                const cursorPosition = editorInstance.getCursor?.();

                if (!cursorPosition || typeof cursorPosition.line !== 'number') {
                    new Notice(TASK_DATE_NOT_A_TASK_NOTICE);
                    return;
                }

                const currentLineText = editorInstance.getLine(cursorPosition.line);

                if (typeof currentLineText !== 'string' || !TASK_MARKER_PREFIX_RE.test(currentLineText)) {
                    new Notice(TASK_DATE_NOT_A_TASK_NOTICE);
                    return;
                }

                const initialDateValue = extractExistingDataviewDateFromTaskLine(currentLineText) ?? getTodayISODate();

                new TaskDatePickerModal(
                    obsidianApp,
                    initialDateValue,
                    (selectedDateValue) => {
                        addDateFieldAtCurrentEditorLine(editorInstance, selectedDateValue);
                    },
                    () => {
                        removeDateFieldAtCurrentEditorLine(editorInstance);
                    }
                ).open();
            }
        });
    }

    /** Remove os handlers registrados durante o carregamento do plugin. */
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

        if (this._onDateButtonClick) {
            document.removeEventListener(CLICK_EVENT_NAME, this._onDateButtonClick, EVENT_LISTENER_CAPTURE_PHASE);
            this._onDateButtonClick = null;
        }
    }
};
