const { Plugin, PluginSettingTab, Setting, Modal, Notice, moment, setIcon } = require('obsidian');

// DOM interaction selectors and event names
const EVENT_LISTENER_CAPTURE_PHASE = true;
const TASK_CHECKBOX_SELECTOR = 'input.task-list-item-checkbox';
const CLICK_EVENT_NAME = 'click';
const DATA_LINE_ATTRIBUTE_SELECTOR = '[data-line]';
const LIST_ITEM_TAG_SELECTOR = 'li';
const TASK_LIST_ITEM_SELECTOR = 'li.task-list-item';
const POINTER_DOWN_EVENT_NAME = 'pointerdown';

// View types and modes used by the plugin
const PREVIEW_VIEW_MODE = 'preview';
const MARKDOWN_VIEW_TYPE_NAME = 'markdown';

// End-of-line sequences supported for reading and writing
const UNIX_EOL_SEQUENCE = '\n';
const WINDOWS_EOL_SEQUENCE = '\r\n';

// Regular expressions for parsing and normalizing Markdown
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

// Heuristic parameters for locating and comparing tasks
const CONTAINS_MATCH_BASE_SCORE = 7000;
const EXACT_MATCH_SCORE = 10000;
const FALLBACK_FULL_SCAN_MIN_SCORE = 1500;
const DECIMAL_RADIX = 10;
const HEXADECIMAL_RADIX = 16;
const PREVIEW_TEXT_MAX_LENGTH = 300;
const JACCARD_SCORE_MULTIPLIER = 5000;
const TASK_SEARCH_WINDOWS = [
    { linesBefore: 50, linesAfter: 150 },
    { linesBefore: 200, linesAfter: 600 },
    { linesBefore: 600, linesAfter: 1200 }
];

// Parameters for the Dataview date feature on Markdown tasks
const ADD_DATE_TO_CURRENT_TASK_COMMAND_ID = 'add-or-update-task-date';
const ENTER_KEY_NAME = 'Enter';
const KEY_DOWN_EVENT_NAME = 'keydown';
const MOD_CTA_BUTTON_CLASS_NAME = 'mod-cta';
const TASK_DATE_APPLY_BUTTON_LABEL = 'Apply';
const TASK_DATE_BUTTON_CLASS_NAME = 'task-states-date-button';
const TASK_DATE_BUTTON_LABEL = 'Set task date';
const TASK_DATE_CANCEL_BUTTON_LABEL = 'Cancel';
const TASK_DATE_CLEAR_BUTTON_CLASS_NAME = 'task-states-date-clear-button';
const TASK_DATE_CLEAR_BUTTON_LABEL = 'Clear';
const TASK_DATE_COMMAND_NAME = 'Add or update task date';
const TASK_DATE_FIELD_NAME = 'data';
const TASK_DATE_ICON_NAME = 'calendar';
const TASK_DATE_INLINE_FIELD_RE = /\[data::\s*\d{4}-\d{2}-\d{2}\s*\]/;
const TASK_DATE_INLINE_FIELD_WITH_LEADING_SPACE_RE = /\s?\[data::\s*\d{4}-\d{2}-\d{2}\s*\]/g;
const TASK_DATE_INPUT_CLASS_NAME = 'task-states-date-input';
const TASK_DATE_MODAL_CLASS_NAME = 'task-states-date-modal';
const TASK_DATE_INPUT_TYPE_NAME = 'date';
const TASK_DATE_INVALID_DATE_NOTICE = 'Select a date before applying.';
const TASK_DATE_ISO_FORMAT = 'YYYY-MM-DD';
const TASK_DATE_MODAL_BUTTONS_CLASS_NAME = 'task-states-date-modal-buttons';
const TASK_DATE_MODAL_TITLE = 'Select the task date:';
const TASK_DATE_NOT_A_TASK_NOTICE = 'The current line is not a Markdown task.';
const TASK_DATE_TODAY_BUTTON_LABEL = 'Today';
const TASK_DATE_VALUE_RE = /\d{4}-\d{2}-\d{2}/;
const TASK_DATE_INLINE_FIELD_RENDER_RE = /\[data::\s*(\d{4}-\d{2}-\d{2})\s*\]/g;
const TASK_DATE_RENDER_SKIP_SELECTOR = 'code, pre, .dataview.inline-field, a';
const DATAVIEW_BASE_CLASS_NAME = 'dataview';
const DATAVIEW_INLINE_FIELD_CLASS_NAME = 'inline-field';
const DATAVIEW_INLINE_FIELD_KEY_CLASS_NAME = 'inline-field-key';
const DATAVIEW_INLINE_FIELD_VALUE_CLASS_NAME = 'inline-field-value';
const DEFAULT_TASK_DATE_DISPLAY_FORMAT = 'DD MMMM, YYYY';
const DEFAULT_TASK_DATE_DISPLAY_LOCALE = 'pt-br';
const TASK_DATE_TAG_BACKGROUND_CSS_VARIABLE = '--task-date-tag-background';
const TASK_DATE_TAG_TEXT_CSS_VARIABLE = '--task-date-tag-text';
const DEFAULT_TASK_DATE_TAG_BACKGROUND_COLOR = '#808080';
const DEFAULT_TASK_DATE_TAG_BACKGROUND_OPACITY = 0.2;
const DEFAULT_TASK_DATE_TAG_TEXT_COLOR = '#808080';
const DEFAULT_TASK_DATE_TAG_TEXT_OPACITY = 0.8;
const TASK_LIST_ITEM_NESTED_LIST_SELECTOR = ':scope > ul, :scope > ol';
const DATAVIEW_INLINE_FIELD_SELECTOR = '.dataview.inline-field';
const CODE_MIRROR_EDITOR_SELECTOR = '.cm-editor';

// Definitions of each task state marker, label, and color
const TASK_STATE_LABEL_DEFINITIONS = Object.freeze([
    { key: 'todo', marker: '[ ]', defaultLabel: 'TODO', defaultColor: '#a0a0a0' },
    { key: 'progress', marker: '[>]', defaultLabel: 'PROGRESS', defaultColor: '#ffc107' },
    { key: 'priority', marker: '[!]', defaultLabel: 'PRIORITY', defaultColor: '#4cdc78' },
    { key: 'cancelled', marker: '[-]', defaultLabel: 'CANCELLED', defaultColor: '#dc4646' },
    { key: 'done', marker: '[x]', defaultLabel: 'DONE', defaultColor: '#969696' },
    { key: 'standby', marker: '[*]', defaultLabel: 'STANDBY', defaultColor: '#b478ff' },
    { key: 'note', marker: '[:]', defaultLabel: 'NOTE', defaultColor: '#a0a0a0' }
]);
const TASK_STATE_LABEL_CSS_VARIABLE_PREFIX = '--task-label-';
const TASK_STATE_COLOR_CSS_VARIABLE_PREFIX = '--task-';
const TASK_STATE_STRIKETHROUGH_CSS_VARIABLE_PREFIX = '--task-strike-';
const STRIKETHROUGH_DISABLED_CSS_VALUE = 'none';
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_TASK_STATE_LABELS = Object.freeze(
    TASK_STATE_LABEL_DEFINITIONS.reduce((labelMap, definition) => {
        labelMap[definition.key] = definition.defaultLabel;
        return labelMap;
    }, {})
);
const DEFAULT_TASK_STATE_COLORS = Object.freeze(
    TASK_STATE_LABEL_DEFINITIONS.reduce((colorMap, definition) => {
        colorMap[definition.key] = definition.defaultColor;
        return colorMap;
    }, {})
);
const STRIKEABLE_STATE_KEYS = Object.freeze(['cancelled', 'done']);
const DEFAULT_TASK_STATE_STRIKETHROUGH = Object.freeze({ cancelled: true, done: true });
const TEXT_COLOR_STATE_KEYS = Object.freeze(['cancelled', 'done', 'standby']);
const TASK_STATE_TEXT_COLOR_CSS_VARIABLE_PREFIX = '--task-text-';
const DEFAULT_TASK_STATE_TEXT_COLOR_DISPLAY = '#969696';
const DEFAULT_TASK_STATE_TEXT_COLORS = Object.freeze(
    TEXT_COLOR_STATE_KEYS.reduce((textColorMap, stateKey) => {
        textColorMap[stateKey] = '';
        return textColorMap;
    }, {})
);
const TODO_STATE_KEY = 'todo';
const DONE_STATE_KEY = 'done';
const NOTE_STATE_KEY = 'note';
const DEFAULT_TASK_STATE_CYCLE_ORDER = Object.freeze(['priority', 'progress', 'standby', 'cancelled']);
const TASK_STATE_MARKER_CHAR_BY_KEY = Object.freeze(
    TASK_STATE_LABEL_DEFINITIONS.reduce((markerCharMap, definition) => {
        markerCharMap[definition.key] = definition.marker.slice(1, -1);
        return markerCharMap;
    }, {})
);
const NON_CYCLIC_STATE_KEYS = Object.freeze([NOTE_STATE_KEY]);
const NON_CYCLIC_STATE_MARKER_CHARS = Object.freeze(
    new Set(NON_CYCLIC_STATE_KEYS.map((stateKey) => TASK_STATE_MARKER_CHAR_BY_KEY[stateKey]))
);
const DEFAULT_PLUGIN_SETTINGS = Object.freeze({
    stateLabels: { ...DEFAULT_TASK_STATE_LABELS },
    stateColors: { ...DEFAULT_TASK_STATE_COLORS },
    stateTextColors: { ...DEFAULT_TASK_STATE_TEXT_COLORS },
    stateStrikethrough: { ...DEFAULT_TASK_STATE_STRIKETHROUGH },
    stateCycleOrder: [...DEFAULT_TASK_STATE_CYCLE_ORDER],
    dateFormat: DEFAULT_TASK_DATE_DISPLAY_FORMAT,
    dateLocale: DEFAULT_TASK_DATE_DISPLAY_LOCALE,
    dateTagBackgroundColor: DEFAULT_TASK_DATE_TAG_BACKGROUND_COLOR,
    dateTagBackgroundOpacity: DEFAULT_TASK_DATE_TAG_BACKGROUND_OPACITY,
    dateTagTextColor: DEFAULT_TASK_DATE_TAG_TEXT_COLOR,
    dateTagTextOpacity: DEFAULT_TASK_DATE_TAG_TEXT_OPACITY
});
const SETTINGS_TAB_TITLE = 'Task State Names and Colors';
const SETTINGS_TAB_DESCRIPTION =
    'Customize the text and color of each state. The Markdown markers are fixed. Drag the intermediate states to set the cycling order. TODO is always first and DONE last.';
const SETTINGS_RESET_BUTTON_LABEL = 'Restore';
const SETTINGS_RESET_SECTION_TITLE = 'Restore Defaults';
const SETTINGS_RESET_SETTING_DESC = 'Restores names, colors, strikethrough, cycle order, and date settings.';
const SETTINGS_TAB_CONTAINER_CLASS_NAME = 'task-states-settings';
const SETTINGS_STATE_STRIKETHROUGH_LABEL = 'Strikethrough';
const SETTINGS_STATE_STRIKETHROUGH_TOOLTIP = 'Enable strikethrough on the task text';
const SETTINGS_STRIKETHROUGH_LABEL_CLASS_NAME = 'task-states-strike-label';
const SETTINGS_STRIKETHROUGH_TOGGLE_CLASS_NAME = 'task-states-strike-toggle';
const SETTINGS_COLOR_INPUT_TYPE_NAME = 'color';
const SETTINGS_CHECKBOX_COLOR_TOOLTIP = 'Checkbox color';
const SETTINGS_TEXT_COLOR_TOOLTIP = 'Text color';
const SETTINGS_FONT_COLOR_LABEL = 'Font Color';
const SETTINGS_FONT_COLOR_LABEL_CLASS_NAME = 'task-states-font-color-label';
const SETTINGS_NOTE_SECTION_TITLE = 'Non-cyclic State';
const SETTINGS_NOTE_SECTION_DESCRIPTION =
    'The NOTE state is applied by typing the [:] marker on a task line and stays out of the click cycle: clicking its checkbox leaves the state unchanged. Customize its name and color below.';
const SETTINGS_DATE_SECTION_TITLE = 'Displayed Date Format';
const SETTINGS_DATE_SECTION_DESCRIPTION = 'Defines how the date is shown in reading mode.';
const SETTINGS_DATE_FORMAT_NAME = 'Format';
const SETTINGS_DATE_FORMAT_DESC = 'Date format, e.g., DD MMMM, YYYY, DD/MM/YYYY, MMMM D, YYYY.';
const SETTINGS_DATE_LOCALE_NAME = 'Locale';
const SETTINGS_DATE_LOCALE_DESC = 'Language code, e.g., pt-br, en, es, fr.';
const SETTINGS_DATE_COLORS_SECTION_TITLE = 'Date Tag Colors';
const SETTINGS_DATE_COLORS_SECTION_DESCRIPTION =
    'Choose the color and opacity of the tag background and of the formatted date text. The slider sets the opacity (0–100%).';
const SETTINGS_DATE_TAG_BACKGROUND_NAME = 'Tag Background';
const SETTINGS_DATE_TAG_BACKGROUND_DESC = 'Tag background color and opacity.';
const SETTINGS_DATE_TAG_TEXT_NAME = 'Text Color';
const SETTINGS_DATE_TAG_TEXT_DESC = 'Date text color and opacity.';
const SETTINGS_HOTKEY_SECTION_TITLE = 'Date Hotkey';
const SETTINGS_HOTKEY_SECTION_DESCRIPTION =
    'You can assign a hotkey to the command that opens the task date picker. Use the button below to open the Obsidian hotkey settings with this command already filtered.';
const SETTINGS_HOTKEY_BUTTON_LABEL = 'Open hotkey settings';
const SETTINGS_HOTKEY_BUTTON_ICON_NAME = 'circle-plus';
const HOTKEYS_SETTING_TAB_ID = 'hotkeys';
const SETTINGS_CYCLE_HINT_CLASS_NAME = 'task-states-cycle-hint';
const SETTINGS_CYCLE_LIST_CLASS_NAME = 'task-states-cycle-list';
const SETTINGS_CYCLE_ROW_CLASS_NAME = 'task-states-cycle-row';
const SETTINGS_CYCLE_ROW_DRAGGING_CLASS_NAME = 'is-dragging';
const SETTINGS_CYCLE_ROW_DRAG_OVER_CLASS_NAME = 'is-drag-over';
const SETTINGS_DRAG_HANDLE_CLASS_NAME = 'task-states-drag-handle';
const SETTINGS_DRAG_HANDLE_ICON_NAME = 'grip-vertical';
const SETTINGS_DRAG_HANDLE_LABEL = 'Drag to reorder';
const SETTINGS_MARKER_BADGE_CLASS_NAME = 'task-states-marker';
const SETTINGS_MARKER_BRACKET_CLASS_NAME = 'task-states-marker-bracket';
const SETTINGS_MARKER_CHAR_CLASS_NAME = 'task-states-marker-char';

// Normalizes text for comparison, collapsing duplicate spaces and NBSP
const normalizeTextForComparison = (inputValue) => {
    const normalizedComparisonText = String(inputValue ?? '')
        .replace(NON_BREAKING_SPACE_RE, ' ')
        .replace(WHITESPACE_SEQUENCE_RE, ' ')
        .trim();

    return normalizedComparisonText;
};

// Converts a data-line value into a valid non-negative index
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

// Checks whether the given view is a Markdown view
const isMarkdownViewInstance = (viewCandidate) => {
    if (!viewCandidate) {
        return false;
    }

    if (typeof viewCandidate.getViewType === 'function') {
        return viewCandidate.getViewType() === MARKDOWN_VIEW_TYPE_NAME;
    }

    return viewCandidate.viewType === MARKDOWN_VIEW_TYPE_NAME || viewCandidate.type === MARKDOWN_VIEW_TYPE_NAME;
};

// Resolves the current mode of the Markdown view
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

// Returns the active Markdown view in the workspace
const resolveActiveMarkdownView = (obsidianApp) => {
    const activeViewCandidate = obsidianApp?.workspace?.activeLeaf?.view ?? null;

    if (isMarkdownViewInstance(activeViewCandidate)) {
        return activeViewCandidate;
    }

    return null;
};

// Returns the task checkbox the event originated from, or null
const resolveTaskCheckboxFromEvent = (domEvent) => {
    const eventTargetElement = domEvent?.target;

    if (eventTargetElement instanceof Element && eventTargetElement.matches?.(TASK_CHECKBOX_SELECTOR)) {
        return eventTargetElement;
    }

    return null;
};

// Extracts a short version of the rendered task text in preview
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

// Determines the approximate task line from data-line attributes
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

// Strips common Markdown syntax to compare only the plain task text
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

// Reads the active file and returns its lines plus the detected EOL for safe writes
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

// Ensures the cycle order is a valid permutation of the intermediate states
const sanitizeCycleOrder = (rawCycleOrder) => {
    const sanitizedCycleOrder = [];
    const seenStateKeys = new Set();

    if (Array.isArray(rawCycleOrder)) {
        for (const candidateStateKey of rawCycleOrder) {
            if (DEFAULT_TASK_STATE_CYCLE_ORDER.includes(candidateStateKey) && !seenStateKeys.has(candidateStateKey)) {
                seenStateKeys.add(candidateStateKey);
                sanitizedCycleOrder.push(candidateStateKey);
            }
        }
    }

    for (const defaultStateKey of DEFAULT_TASK_STATE_CYCLE_ORDER) {
        if (!seenStateKeys.has(defaultStateKey)) {
            sanitizedCycleOrder.push(defaultStateKey);
        }
    }

    return sanitizedCycleOrder;
};

// Builds the cycle marker sequence: TODO first, intermediate states in order, DONE last
const buildMarkerSequenceFromCycleOrder = (rawCycleOrder) => {
    const middleMarkerChars = sanitizeCycleOrder(rawCycleOrder).map(
        (stateKey) => TASK_STATE_MARKER_CHAR_BY_KEY[stateKey]
    );

    return [
        TASK_STATE_MARKER_CHAR_BY_KEY[TODO_STATE_KEY],
        ...middleMarkerChars,
        TASK_STATE_MARKER_CHAR_BY_KEY[DONE_STATE_KEY]
    ];
};

// Cycles the task marker following the order defined by the plugin
const toggleTaskMarkerInLine = (taskLineText, markerSequence) => {
    const taskLineValue = String(taskLineText ?? '');
    const taskMarkerMatch = taskLineValue.match(TASK_MARKER_LINE_RE);

    if (!taskMarkerMatch) {
        return taskLineValue;
    }

    const effectiveMarkerSequence =
        Array.isArray(markerSequence) && markerSequence.length > 0
            ? markerSequence
            : buildMarkerSequenceFromCycleOrder();

    const taskListPrefix = taskMarkerMatch[1];
    const currentTaskMarker = taskMarkerMatch[2];

    // Non-cyclic states are preserved: clicking the checkbox leaves the marker unchanged
    if (NON_CYCLIC_STATE_MARKER_CHARS.has(currentTaskMarker)) {
        return taskLineValue;
    }

    const currentMarkerIndex = effectiveMarkerSequence.indexOf(currentTaskMarker);
    const nextTaskMarker =
        currentMarkerIndex === -1
            ? effectiveMarkerSequence[0]
            : effectiveMarkerSequence[(currentMarkerIndex + 1) % effectiveMarkerSequence.length];

    return taskLineValue.replace(TASK_MARKER_LINE_RE, `${taskListPrefix}[${nextTaskMarker}]`);
};

// Joins the task base line and its continuation lines for text comparison
const buildTaskBlockTextForComparison = (fileLines, taskStartLineIndex) => {
    const baseTaskLine = fileLines[taskStartLineIndex];

    if (!TASK_MARKER_PREFIX_RE.test(baseTaskLine)) {
        return baseTaskLine;
    }

    const baseLineIndent = (baseTaskLine.match(LEADING_WHITESPACE_RE) ?? [''])[0].length;
    const taskBlockLines = [baseTaskLine];

    for (
        let continuationLineIndex = taskStartLineIndex + 1;
        continuationLineIndex < fileLines.length;
        continuationLineIndex += 1
    ) {
        const continuationLine = fileLines[continuationLineIndex];

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

// Computes the similarity score between the candidate and expected text
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

// Finds the best matching task line using a local search with a global fallback
const resolveBestMatchingTaskLine = (fileLines, approximateLineIndex, expectedRenderedTaskText) => {
    const normalizedExpectedText = normalizeTextForComparison(expectedRenderedTaskText);
    const nearbyLineCandidates = [approximateLineIndex, approximateLineIndex - 1, approximateLineIndex + 1];

    for (const candidateLineIndex of nearbyLineCandidates) {
        if (!Number.isInteger(candidateLineIndex) || candidateLineIndex < 0 || candidateLineIndex >= fileLines.length) {
            continue;
        }

        const candidateLineText = fileLines[candidateLineIndex];

        if (!TASK_MARKER_PREFIX_RE.test(candidateLineText)) {
            continue;
        }

        const taskBlockText = buildTaskBlockTextForComparison(fileLines, candidateLineIndex);
        const taskPlainText = stripMarkdownFormattingFromPreviewText(taskBlockText);

        if (taskPlainText === normalizedExpectedText) {
            return { matchedLineIndex: candidateLineIndex, matchScore: EXACT_MATCH_SCORE };
        }
    }

    const candidateBaseIndices = nearbyLineCandidates.filter(
        (candidateLineIndex) => Number.isInteger(candidateLineIndex) && candidateLineIndex >= 0
    );

    let bestMatchResult = { matchedLineIndex: null, matchScore: 0 };

    // Scores a candidate line and updates the best match found so far
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

            for (let scanLineIndex = startLineIndex; scanLineIndex <= endLineIndex; scanLineIndex += 1) {
                evaluateCandidateLine(scanLineIndex);
            }

            if (bestMatchResult.matchScore >= CONTAINS_MATCH_BASE_SCORE) {
                return bestMatchResult;
            }
        }
    }

    if (bestMatchResult.matchScore < FALLBACK_FULL_SCAN_MIN_SCORE && normalizedExpectedText) {
        for (let scanLineIndex = 0; scanLineIndex < fileLines.length; scanLineIndex += 1) {
            evaluateCandidateLine(scanLineIndex);
        }
    }

    if (bestMatchResult.matchedLineIndex == null) {
        return null;
    }

    return bestMatchResult;
};

// Returns an editor instance capable of reading and writing lines
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

// Updates the text of a line in the editor regardless of the exposed API
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

// Cycles the task state in the active editor from the click position in edit mode
const toggleTaskAtCursorLineInEditor = (obsidianApp, pointerEvent, markerSequence) => {
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

    const updatedLineText = toggleTaskMarkerInLine(currentLineText, markerSequence);

    if (updatedLineText === currentLineText) {
        return false;
    }

    return setEditorLineText(editorInstance, lineNumber, updatedLineText);
};

// Handles the click in edit mode and updates the line in the editor
const handleEditModeInteraction = (obsidianApp, clickEvent, markerSequence) => {
    return toggleTaskAtCursorLineInEditor(obsidianApp, clickEvent, markerSequence);
};

// Applies a transformation to the real task line behind a checkbox in reading mode
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

// Returns the current date in ISO YYYY-MM-DD format
const getTodayISODate = () => moment().format(TASK_DATE_ISO_FORMAT);

// Builds the Dataview date field for the given date
const buildDataviewDateField = (dateValue) => `[${TASK_DATE_FIELD_NAME}:: ${dateValue}]`;

// Adds or replaces the data:: YYYY-MM-DD field in a Markdown task line
const addOrReplaceDataviewDateFieldInTaskLine = (taskLineText, dateValue) => {
    const taskLineValue = String(taskLineText ?? '');
    const dataviewDateField = buildDataviewDateField(dateValue);

    if (TASK_DATE_INLINE_FIELD_RE.test(taskLineValue)) {
        return taskLineValue.replace(TASK_DATE_INLINE_FIELD_RE, dataviewDateField);
    }

    return `${taskLineValue.replace(TRAILING_WHITESPACE_RE, '')} ${dataviewDateField}`;
};

// Extracts the existing Dataview date from a task line, if any
const extractExistingDataviewDateFromTaskLine = (taskLineText) => {
    const taskDateFieldMatch = String(taskLineText ?? '').match(TASK_DATE_INLINE_FIELD_RE);

    if (!taskDateFieldMatch) {
        return null;
    }

    const taskDateValueMatch = taskDateFieldMatch[0].match(TASK_DATE_VALUE_RE);
    return taskDateValueMatch ? taskDateValueMatch[0] : null;
};

// Updates the reading-mode task line with the selected date
const addDateFieldFromPreviewTask = (obsidianApp, taskCheckboxElement, selectedDateValue) =>
    applyTransformationToPreviewTaskLine(obsidianApp, taskCheckboxElement, (taskLineText) =>
        addOrReplaceDataviewDateFieldInTaskLine(taskLineText, selectedDateValue)
    );

// Removes all data:: YYYY-MM-DD fields from the task line
const removeDataviewDateFieldFromTaskLine = (taskLineText) => {
    const taskLineValue = String(taskLineText ?? '');
    const withoutDateField = taskLineValue.replace(TASK_DATE_INLINE_FIELD_WITH_LEADING_SPACE_RE, '');
    return withoutDateField.replace(TRAILING_WHITESPACE_RE, '');
};

// Removes the date field from the real task line in reading mode
const removeDateFieldFromPreviewTask = (obsidianApp, taskCheckboxElement) =>
    applyTransformationToPreviewTaskLine(obsidianApp, taskCheckboxElement, (taskLineText) =>
        removeDataviewDateFieldFromTaskLine(taskLineText)
    );

// Resolves the existing Dataview date for the reading-mode task, if any
const resolveExistingDataviewDateFromPreviewTask = async (obsidianApp, taskCheckboxElement) => {
    const activeMarkdownView = resolveActiveMarkdownView(obsidianApp);

    if (!activeMarkdownView) {
        return null;
    }

    const taskPreviewText = extractTaskPreviewText(taskCheckboxElement);
    const approximateLineIndex = resolveApproximateLineFromPreviewCheckbox(taskCheckboxElement);
    const fileSnapshot = await readActiveFileSnapshot(obsidianApp, activeMarkdownView);

    if (!fileSnapshot) {
        return null;
    }

    const bestMatchResult = resolveBestMatchingTaskLine(fileSnapshot.fileLines, approximateLineIndex, taskPreviewText);

    if (!bestMatchResult || bestMatchResult.matchedLineIndex == null) {
        return null;
    }

    const matchedLineText = fileSnapshot.fileLines[bestMatchResult.matchedLineIndex];

    if (typeof matchedLineText !== 'string') {
        return null;
    }

    return extractExistingDataviewDateFromTaskLine(matchedLineText);
};

// Updates the cursor line in the active editor with the selected date
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

// Removes the date field from the cursor line in the active editor
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

// Escapes the label value for safe use inside a CSS string
const sanitizeStateLabelForCssString = (rawLabelValue) => {
    return String(rawLabelValue ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .trim();
};

// Applies the custom labels to document.body, overriding the CSS variables
const applyStateLabelsToDocument = (stateLabels) => {
    for (const stateLabelDefinition of TASK_STATE_LABEL_DEFINITIONS) {
        const cssVariableName = `${TASK_STATE_LABEL_CSS_VARIABLE_PREFIX}${stateLabelDefinition.key}`;
        const userLabelValue = stateLabels?.[stateLabelDefinition.key];
        const trimmedUserLabelValue = typeof userLabelValue === 'string' ? userLabelValue.trim() : '';

        if (trimmedUserLabelValue.length === 0) {
            document.body.style.removeProperty(cssVariableName);
            continue;
        }

        const escapedLabelValue = sanitizeStateLabelForCssString(trimmedUserLabelValue);
        document.body.style.setProperty(cssVariableName, `"${escapedLabelValue}"`);
    }
};

// Removes all label overrides from document.body
const clearStateLabelsFromDocument = () => {
    for (const stateLabelDefinition of TASK_STATE_LABEL_DEFINITIONS) {
        document.body.style.removeProperty(`${TASK_STATE_LABEL_CSS_VARIABLE_PREFIX}${stateLabelDefinition.key}`);
    }
};

// Checks whether the value is a valid #rrggbb hex color
const isValidHexColor = (rawColorValue) => typeof rawColorValue === 'string' && HEX_COLOR_RE.test(rawColorValue);

// Applies the custom state colors to document.body
const applyStateColorsToDocument = (stateColors) => {
    for (const stateLabelDefinition of TASK_STATE_LABEL_DEFINITIONS) {
        const cssVariableName = `${TASK_STATE_COLOR_CSS_VARIABLE_PREFIX}${stateLabelDefinition.key}`;
        const userColorValue = stateColors?.[stateLabelDefinition.key];

        if (isValidHexColor(userColorValue)) {
            document.body.style.setProperty(cssVariableName, userColorValue);
        } else {
            document.body.style.removeProperty(cssVariableName);
        }
    }
};

// Removes all state color overrides from document.body
const clearStateColorsFromDocument = () => {
    for (const stateLabelDefinition of TASK_STATE_LABEL_DEFINITIONS) {
        document.body.style.removeProperty(`${TASK_STATE_COLOR_CSS_VARIABLE_PREFIX}${stateLabelDefinition.key}`);
    }
};

// Applies the custom STANDBY, CANCELLED, and DONE text colors to document.body; invalid values fall back to the CSS default
const applyStateTextColorsToDocument = (stateTextColors) => {
    for (const stateKey of TEXT_COLOR_STATE_KEYS) {
        const cssVariableName = `${TASK_STATE_TEXT_COLOR_CSS_VARIABLE_PREFIX}${stateKey}`;
        const userColorValue = stateTextColors?.[stateKey];

        if (isValidHexColor(userColorValue)) {
            document.body.style.setProperty(cssVariableName, userColorValue);
        } else {
            document.body.style.removeProperty(cssVariableName);
        }
    }
};

// Removes the state text color overrides from document.body
const clearStateTextColorsFromDocument = () => {
    for (const stateKey of TEXT_COLOR_STATE_KEYS) {
        document.body.style.removeProperty(`${TASK_STATE_TEXT_COLOR_CSS_VARIABLE_PREFIX}${stateKey}`);
    }
};

// Applies the per-state strikethrough option to document.body; disabled becomes none
const applyStateStrikethroughToDocument = (stateStrikethrough) => {
    for (const stateKey of STRIKEABLE_STATE_KEYS) {
        const cssVariableName = `${TASK_STATE_STRIKETHROUGH_CSS_VARIABLE_PREFIX}${stateKey}`;

        if (stateStrikethrough?.[stateKey] === false) {
            document.body.style.setProperty(cssVariableName, STRIKETHROUGH_DISABLED_CSS_VALUE);
        } else {
            document.body.style.removeProperty(cssVariableName);
        }
    }
};

// Removes the strikethrough overrides from document.body
const clearStateStrikethroughFromDocument = () => {
    for (const stateKey of STRIKEABLE_STATE_KEYS) {
        document.body.style.removeProperty(`${TASK_STATE_STRIKETHROUGH_CSS_VARIABLE_PREFIX}${stateKey}`);
    }
};

// Converts a #rrggbb hex into numeric red, green, and blue components, or null if invalid
const hexColorToRgbComponents = (hexColor) => {
    const normalizedHex = String(hexColor ?? '').trim();

    if (!HEX_COLOR_RE.test(normalizedHex)) {
        return null;
    }

    return {
        red: Number.parseInt(normalizedHex.slice(1, 3), HEXADECIMAL_RADIX),
        green: Number.parseInt(normalizedHex.slice(3, 5), HEXADECIMAL_RADIX),
        blue: Number.parseInt(normalizedHex.slice(5, 7), HEXADECIMAL_RADIX)
    };
};

// Composes an rgba color from a hex and an opacity between 0 and 1; null if the hex is invalid
const composeRgbaColor = (hexColor, opacity) => {
    const rgbComponents = hexColorToRgbComponents(hexColor);

    if (!rgbComponents) {
        return null;
    }

    const numericOpacity = Number.isFinite(opacity) ? opacity : 1;
    const clampedOpacity = Math.min(1, Math.max(0, numericOpacity));

    return `rgba(${rgbComponents.red}, ${rgbComponents.green}, ${rgbComponents.blue}, ${clampedOpacity})`;
};

// Applies the date tag colors to document.body; invalid values fall back to the CSS default
const applyDateTagColorsToDocument = (settings) => {
    const backgroundRgba = composeRgbaColor(settings?.dateTagBackgroundColor, settings?.dateTagBackgroundOpacity);
    if (backgroundRgba) {
        document.body.style.setProperty(TASK_DATE_TAG_BACKGROUND_CSS_VARIABLE, backgroundRgba);
    } else {
        document.body.style.removeProperty(TASK_DATE_TAG_BACKGROUND_CSS_VARIABLE);
    }

    const textRgba = composeRgbaColor(settings?.dateTagTextColor, settings?.dateTagTextOpacity);
    if (textRgba) {
        document.body.style.setProperty(TASK_DATE_TAG_TEXT_CSS_VARIABLE, textRgba);
    } else {
        document.body.style.removeProperty(TASK_DATE_TAG_TEXT_CSS_VARIABLE);
    }
};

// Removes the date tag color overrides from document.body
const clearDateTagColorsFromDocument = () => {
    document.body.style.removeProperty(TASK_DATE_TAG_BACKGROUND_CSS_VARIABLE);
    document.body.style.removeProperty(TASK_DATE_TAG_TEXT_CSS_VARIABLE);
};

// Formats an ISO YYYY-MM-DD date using the configured format and locale
const formatTaskDateForDisplay = (isoDateValue, displayFormat, displayLocale) => {
    const parsedDate = moment(isoDateValue, TASK_DATE_ISO_FORMAT, true);

    if (!parsedDate.isValid()) {
        return isoDateValue;
    }

    const effectiveFormat = displayFormat || DEFAULT_TASK_DATE_DISPLAY_FORMAT;
    const effectiveLocale = displayLocale || DEFAULT_TASK_DATE_DISPLAY_LOCALE;

    return parsedDate.locale(effectiveLocale).format(effectiveFormat);
};

// Builds the Dataview-compatible DOM element for an inline date field
const renderDateInlineFieldElement = (isoDateValue, displayFormat, displayLocale) => {
    const containerSpan = document.createElement('span');
    containerSpan.classList.add(DATAVIEW_BASE_CLASS_NAME, DATAVIEW_INLINE_FIELD_CLASS_NAME);

    const keySpan = document.createElement('span');
    keySpan.classList.add(DATAVIEW_BASE_CLASS_NAME, DATAVIEW_INLINE_FIELD_KEY_CLASS_NAME);
    keySpan.dataset.dvKey = TASK_DATE_FIELD_NAME;
    keySpan.textContent = TASK_DATE_FIELD_NAME;
    containerSpan.appendChild(keySpan);

    const valueSpan = document.createElement('span');
    valueSpan.classList.add(DATAVIEW_BASE_CLASS_NAME, DATAVIEW_INLINE_FIELD_VALUE_CLASS_NAME);
    valueSpan.textContent = formatTaskDateForDisplay(isoDateValue, displayFormat, displayLocale);
    containerSpan.appendChild(valueSpan);

    return containerSpan;
};

// Replaces data:: YYYY-MM-DD literals in text nodes with the formatted element
const replaceDateInlineFieldsInRenderedElement = (rootElement, displayFormat, displayLocale) => {
    if (!rootElement) {
        return;
    }

    const treeWalker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, {
        acceptNode: (textNode) => {
            if (!textNode.nodeValue) {
                return NodeFilter.FILTER_REJECT;
            }
            if (textNode.parentElement?.closest(TASK_DATE_RENDER_SKIP_SELECTOR)) {
                return NodeFilter.FILTER_REJECT;
            }
            return TASK_DATE_INLINE_FIELD_RE.test(textNode.nodeValue)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
        }
    });

    const textNodesToProcess = [];
    let nextCandidateNode = treeWalker.nextNode();
    while (nextCandidateNode) {
        textNodesToProcess.push(nextCandidateNode);
        nextCandidateNode = treeWalker.nextNode();
    }

    for (const textNode of textNodesToProcess) {
        const originalText = textNode.nodeValue ?? '';
        const matchEntries = [...originalText.matchAll(TASK_DATE_INLINE_FIELD_RENDER_RE)];

        if (matchEntries.length === 0) {
            continue;
        }

        const documentFragment = document.createDocumentFragment();
        let cursorIndex = 0;

        for (const matchEntry of matchEntries) {
            if (matchEntry.index > cursorIndex) {
                documentFragment.appendChild(
                    document.createTextNode(originalText.slice(cursorIndex, matchEntry.index))
                );
            }
            documentFragment.appendChild(renderDateInlineFieldElement(matchEntry[1], displayFormat, displayLocale));
            cursorIndex = matchEntry.index + matchEntry[0].length;
        }

        if (cursorIndex < originalText.length) {
            documentFragment.appendChild(document.createTextNode(originalText.slice(cursorIndex)));
        }

        textNode.parentNode?.replaceChild(documentFragment, textNode);
    }
};

// Forces open reading views to re-render after changing the format or locale
const rerenderOpenMarkdownPreviews = (obsidianApp) => {
    obsidianApp?.workspace?.iterateAllLeaves?.((leaf) => {
        const leafView = leaf?.view;
        if (isMarkdownViewInstance(leafView) && typeof leafView?.previewMode?.rerender === 'function') {
            leafView.previewMode.rerender(true);
        }
    });
};

// Date-picker modal used to set the task Dataview date
class TaskDatePickerModal extends Modal {
    constructor(obsidianApp, initialDateValue, onSubmit, onClear) {
        super(obsidianApp);
        this.initialDateValue = initialDateValue;
        this.onSubmit = onSubmit;
        this.onClear = onClear;
    }

    // Builds the modal content and wires up the action buttons
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

    // Clears the modal content on close
    onClose() {
        this.contentEl.empty();
    }
}

// Builds the marker badge that highlights the central character between brackets
const renderStateMarkerDescription = (descriptionElement, stateLabelDefinition) => {
    const markerBadgeElement = descriptionElement.createEl('span', { cls: SETTINGS_MARKER_BADGE_CLASS_NAME });
    markerBadgeElement.createEl('span', { cls: SETTINGS_MARKER_BRACKET_CLASS_NAME, text: '[' });
    markerBadgeElement.createEl('span', {
        cls: SETTINGS_MARKER_CHAR_CLASS_NAME,
        text: TASK_STATE_MARKER_CHAR_BY_KEY[stateLabelDefinition.key]
    });
    markerBadgeElement.createEl('span', { cls: SETTINGS_MARKER_BRACKET_CLASS_NAME, text: ']' });
};

// Settings tab for customizing the task state labels
class TaskStatesSettingTab extends PluginSettingTab {
    constructor(obsidianApp, plugin) {
        super(obsidianApp, plugin);
        this.plugin = plugin;
    }

    // Renders the text fields, color pickers, and the restore button
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass(SETTINGS_TAB_CONTAINER_CLASS_NAME);

        containerEl.createEl('p', { text: SETTINGS_TAB_TITLE });
        containerEl.createEl('p', { text: SETTINGS_TAB_DESCRIPTION, cls: SETTINGS_CYCLE_HINT_CLASS_NAME });

        const findStateDefinition = (stateKey) =>
            TASK_STATE_LABEL_DEFINITIONS.find((stateDefinition) => stateDefinition.key === stateKey);

        // Creates the checkbox color picker placed in the description, in front of the marker
        const createCheckboxColorPicker = (descriptionElement, stateLabelDefinition) => {
            const checkboxColorInput = descriptionElement.createEl('input', {
                type: SETTINGS_COLOR_INPUT_TYPE_NAME
            });
            checkboxColorInput.title = SETTINGS_CHECKBOX_COLOR_TOOLTIP;
            checkboxColorInput.setAttribute('aria-label', SETTINGS_CHECKBOX_COLOR_TOOLTIP);

            const persistedColorValue = this.plugin.settings.stateColors?.[stateLabelDefinition.key];
            checkboxColorInput.value = isValidHexColor(persistedColorValue)
                ? persistedColorValue
                : stateLabelDefinition.defaultColor;

            checkboxColorInput.addEventListener('change', async () => {
                this.plugin.settings.stateColors[stateLabelDefinition.key] = checkboxColorInput.value;
                await this.plugin.saveSettings();
            });
        };

        // Creates the STANDBY, CANCELLED, and DONE text color picker where the checkbox color used to sit
        const createTextColorPicker = (controlElement, stateLabelDefinition) => {
            controlElement.createEl('span', {
                cls: SETTINGS_FONT_COLOR_LABEL_CLASS_NAME,
                text: SETTINGS_FONT_COLOR_LABEL
            });

            const textColorInput = controlElement.createEl('input', {
                type: SETTINGS_COLOR_INPUT_TYPE_NAME
            });
            textColorInput.title = SETTINGS_TEXT_COLOR_TOOLTIP;
            textColorInput.setAttribute('aria-label', SETTINGS_TEXT_COLOR_TOOLTIP);

            const persistedColorValue = this.plugin.settings.stateTextColors?.[stateLabelDefinition.key];
            textColorInput.value = isValidHexColor(persistedColorValue)
                ? persistedColorValue
                : DEFAULT_TASK_STATE_TEXT_COLOR_DISPLAY;

            textColorInput.addEventListener('change', async () => {
                this.plugin.settings.stateTextColors[stateLabelDefinition.key] = textColorInput.value;
                await this.plugin.saveSettings();
            });
        };

        const createStateLabelSetting = (parentElement, stateLabelDefinition) => {
            const stateLabelSetting = new Setting(parentElement).setName(stateLabelDefinition.defaultLabel);

            if (STRIKEABLE_STATE_KEYS.includes(stateLabelDefinition.key)) {
                stateLabelSetting.controlEl.createEl('span', {
                    cls: SETTINGS_STRIKETHROUGH_LABEL_CLASS_NAME,
                    text: SETTINGS_STATE_STRIKETHROUGH_LABEL
                });

                stateLabelSetting.addToggle((toggleComponent) => {
                    toggleComponent.toggleEl.classList.add(SETTINGS_STRIKETHROUGH_TOGGLE_CLASS_NAME);
                    toggleComponent
                        .setTooltip(SETTINGS_STATE_STRIKETHROUGH_TOOLTIP)
                        .setValue(this.plugin.settings.stateStrikethrough?.[stateLabelDefinition.key] !== false)
                        .onChange(async (isStrikethroughEnabled) => {
                            this.plugin.settings.stateStrikethrough[stateLabelDefinition.key] = isStrikethroughEnabled;
                            await this.plugin.saveSettings();
                        });
                });
            }

            // Text color picker before the label input, to keep every input right-aligned
            if (TEXT_COLOR_STATE_KEYS.includes(stateLabelDefinition.key)) {
                createTextColorPicker(stateLabelSetting.controlEl, stateLabelDefinition);
            }

            stateLabelSetting.addText((textComponent) => {
                textComponent
                    .setPlaceholder(stateLabelDefinition.defaultLabel)
                    .setValue(this.plugin.settings.stateLabels?.[stateLabelDefinition.key] ?? '')
                    .onChange(async (rawInputValue) => {
                        this.plugin.settings.stateLabels[stateLabelDefinition.key] = rawInputValue;
                        await this.plugin.saveSettings();
                    });

                textComponent.inputEl.addEventListener('blur', async () => {
                    if (textComponent.getValue().trim().length > 0) {
                        return;
                    }

                    textComponent.setValue(stateLabelDefinition.defaultLabel);
                    this.plugin.settings.stateLabels[stateLabelDefinition.key] = stateLabelDefinition.defaultLabel;
                    await this.plugin.saveSettings();
                });
            });

            stateLabelSetting.settingEl.dataset.stateKey = stateLabelDefinition.key;

            createCheckboxColorPicker(stateLabelSetting.descEl, stateLabelDefinition);
            renderStateMarkerDescription(stateLabelSetting.descEl, stateLabelDefinition);

            return stateLabelSetting;
        };

        createStateLabelSetting(containerEl, findStateDefinition(TODO_STATE_KEY));

        const cycleListContainer = containerEl.createDiv({ cls: SETTINGS_CYCLE_LIST_CLASS_NAME });
        const currentCycleOrder = sanitizeCycleOrder(this.plugin.settings.stateCycleOrder);

        let draggedStateKey = null;

        const clearDragOverHighlights = () => {
            for (const highlightedRow of cycleListContainer.querySelectorAll(
                `.${SETTINGS_CYCLE_ROW_DRAG_OVER_CLASS_NAME}`
            )) {
                highlightedRow.classList.remove(SETTINGS_CYCLE_ROW_DRAG_OVER_CLASS_NAME);
            }
        };

        const moveStateInCycleOrder = async (fromStateKey, toStateKey, shouldInsertAfterTarget) => {
            const reorderedCycle = sanitizeCycleOrder(this.plugin.settings.stateCycleOrder);
            const fromIndex = reorderedCycle.indexOf(fromStateKey);

            if (fromIndex === -1) {
                return;
            }

            reorderedCycle.splice(fromIndex, 1);

            let toIndex = reorderedCycle.indexOf(toStateKey);

            if (toIndex === -1) {
                toIndex = reorderedCycle.length;
            } else if (shouldInsertAfterTarget) {
                toIndex += 1;
            }

            reorderedCycle.splice(toIndex, 0, fromStateKey);
            this.plugin.settings.stateCycleOrder = reorderedCycle;
            await this.plugin.saveSettings();
            this.display();
        };

        for (const middleStateKey of currentCycleOrder) {
            const cycleRowSetting = createStateLabelSetting(cycleListContainer, findStateDefinition(middleStateKey));
            const cycleRowElement = cycleRowSetting.settingEl;
            cycleRowElement.classList.add(SETTINGS_CYCLE_ROW_CLASS_NAME);

            const dragHandleElement = document.createElement('div');
            dragHandleElement.className = SETTINGS_DRAG_HANDLE_CLASS_NAME;
            dragHandleElement.draggable = true;
            dragHandleElement.title = SETTINGS_DRAG_HANDLE_LABEL;
            dragHandleElement.setAttribute('aria-label', SETTINGS_DRAG_HANDLE_LABEL);
            setIcon(dragHandleElement, SETTINGS_DRAG_HANDLE_ICON_NAME);
            cycleRowElement.prepend(dragHandleElement);

            dragHandleElement.addEventListener('dragstart', (dragEvent) => {
                draggedStateKey = middleStateKey;
                cycleRowElement.classList.add(SETTINGS_CYCLE_ROW_DRAGGING_CLASS_NAME);

                if (dragEvent.dataTransfer) {
                    dragEvent.dataTransfer.effectAllowed = 'move';
                    dragEvent.dataTransfer.setData('text/plain', middleStateKey);
                    dragEvent.dataTransfer.setDragImage(cycleRowElement, 0, 0);
                }
            });

            dragHandleElement.addEventListener('dragend', () => {
                draggedStateKey = null;
                cycleRowElement.classList.remove(SETTINGS_CYCLE_ROW_DRAGGING_CLASS_NAME);
                clearDragOverHighlights();
            });

            cycleRowElement.addEventListener('dragover', (dragEvent) => {
                if (!draggedStateKey || draggedStateKey === middleStateKey) {
                    return;
                }

                dragEvent.preventDefault();

                if (dragEvent.dataTransfer) {
                    dragEvent.dataTransfer.dropEffect = 'move';
                }

                clearDragOverHighlights();
                cycleRowElement.classList.add(SETTINGS_CYCLE_ROW_DRAG_OVER_CLASS_NAME);
            });

            cycleRowElement.addEventListener('drop', async (dropEvent) => {
                if (!draggedStateKey || draggedStateKey === middleStateKey) {
                    return;
                }

                dropEvent.preventDefault();

                const targetRect = cycleRowElement.getBoundingClientRect();
                const shouldInsertAfterTarget = dropEvent.clientY > targetRect.top + targetRect.height / 2;
                const movedStateKey = draggedStateKey;

                draggedStateKey = null;
                await moveStateInCycleOrder(movedStateKey, middleStateKey, shouldInsertAfterTarget);
            });
        }

        createStateLabelSetting(containerEl, findStateDefinition(DONE_STATE_KEY));

        containerEl.createEl('p', { text: SETTINGS_NOTE_SECTION_TITLE });
        containerEl.createEl('p', {
            text: SETTINGS_NOTE_SECTION_DESCRIPTION,
            cls: SETTINGS_CYCLE_HINT_CLASS_NAME
        });

        createStateLabelSetting(containerEl, findStateDefinition(NOTE_STATE_KEY));

        containerEl.createEl('p', { text: SETTINGS_DATE_SECTION_TITLE });
        containerEl.createEl('p', { text: SETTINGS_DATE_SECTION_DESCRIPTION, cls: SETTINGS_CYCLE_HINT_CLASS_NAME });

        new Setting(containerEl)
            .setName(SETTINGS_DATE_FORMAT_NAME)
            .setDesc(SETTINGS_DATE_FORMAT_DESC)
            .addText((textComponent) => {
                textComponent
                    .setPlaceholder(DEFAULT_TASK_DATE_DISPLAY_FORMAT)
                    .setValue(this.plugin.settings.dateFormat ?? '')
                    .onChange(async (rawInputValue) => {
                        this.plugin.settings.dateFormat = rawInputValue;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(SETTINGS_DATE_LOCALE_NAME)
            .setDesc(SETTINGS_DATE_LOCALE_DESC)
            .addText((textComponent) => {
                textComponent
                    .setPlaceholder(DEFAULT_TASK_DATE_DISPLAY_LOCALE)
                    .setValue(this.plugin.settings.dateLocale ?? '')
                    .onChange(async (rawInputValue) => {
                        this.plugin.settings.dateLocale = rawInputValue;
                        await this.plugin.saveSettings();
                    });
            });

        containerEl.createEl('p', { text: SETTINGS_DATE_COLORS_SECTION_TITLE });
        containerEl.createEl('p', {
            text: SETTINGS_DATE_COLORS_SECTION_DESCRIPTION,
            cls: SETTINGS_CYCLE_HINT_CLASS_NAME
        });

        new Setting(containerEl)
            .setName(SETTINGS_DATE_TAG_BACKGROUND_NAME)
            .setDesc(SETTINGS_DATE_TAG_BACKGROUND_DESC)
            .addColorPicker((colorComponent) => {
                const persistedColorValue = this.plugin.settings.dateTagBackgroundColor;
                const initialColorValue = isValidHexColor(persistedColorValue)
                    ? persistedColorValue
                    : DEFAULT_TASK_DATE_TAG_BACKGROUND_COLOR;

                colorComponent.setValue(initialColorValue).onChange(async (rawColorValue) => {
                    this.plugin.settings.dateTagBackgroundColor = rawColorValue;
                    await this.plugin.saveSettings();
                });
            })
            .addSlider((sliderComponent) => {
                const persistedOpacity = this.plugin.settings.dateTagBackgroundOpacity;
                const initialOpacity = Number.isFinite(persistedOpacity)
                    ? persistedOpacity
                    : DEFAULT_TASK_DATE_TAG_BACKGROUND_OPACITY;

                sliderComponent
                    .setLimits(0, 100, 1)
                    .setValue(Math.round(initialOpacity * 100))
                    .setDynamicTooltip()
                    .onChange(async (rawSliderValue) => {
                        this.plugin.settings.dateTagBackgroundOpacity = rawSliderValue / 100;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName(SETTINGS_DATE_TAG_TEXT_NAME)
            .setDesc(SETTINGS_DATE_TAG_TEXT_DESC)
            .addColorPicker((colorComponent) => {
                const persistedColorValue = this.plugin.settings.dateTagTextColor;
                const initialColorValue = isValidHexColor(persistedColorValue)
                    ? persistedColorValue
                    : DEFAULT_TASK_DATE_TAG_TEXT_COLOR;

                colorComponent.setValue(initialColorValue).onChange(async (rawColorValue) => {
                    this.plugin.settings.dateTagTextColor = rawColorValue;
                    await this.plugin.saveSettings();
                });
            })
            .addSlider((sliderComponent) => {
                const persistedOpacity = this.plugin.settings.dateTagTextOpacity;
                const initialOpacity = Number.isFinite(persistedOpacity)
                    ? persistedOpacity
                    : DEFAULT_TASK_DATE_TAG_TEXT_OPACITY;

                sliderComponent
                    .setLimits(0, 100, 1)
                    .setValue(Math.round(initialOpacity * 100))
                    .setDynamicTooltip()
                    .onChange(async (rawSliderValue) => {
                        this.plugin.settings.dateTagTextOpacity = rawSliderValue / 100;
                        await this.plugin.saveSettings();
                    });
            });

        containerEl.createEl('p', { text: SETTINGS_HOTKEY_SECTION_TITLE });
        containerEl.createEl('p', { text: SETTINGS_HOTKEY_SECTION_DESCRIPTION, cls: SETTINGS_CYCLE_HINT_CLASS_NAME });

        new Setting(containerEl).setName(TASK_DATE_COMMAND_NAME).addExtraButton((extraButtonComponent) => {
            extraButtonComponent
                .setIcon(SETTINGS_HOTKEY_BUTTON_ICON_NAME)
                .setTooltip(SETTINGS_HOTKEY_BUTTON_LABEL)
                .onClick(() => {
                    const obsidianSettings = this.app.setting;

                    if (!obsidianSettings) {
                        return;
                    }

                    obsidianSettings.open();
                    const hotkeysSettingTab = obsidianSettings.openTabById(HOTKEYS_SETTING_TAB_ID);
                    hotkeysSettingTab?.setQuery?.(`${this.plugin.manifest.id}:${ADD_DATE_TO_CURRENT_TASK_COMMAND_ID}`);
                });
        });

        containerEl.createEl('p', { text: SETTINGS_RESET_SECTION_TITLE });

        new Setting(containerEl).setName(SETTINGS_RESET_SETTING_DESC).addButton((buttonComponent) => {
            buttonComponent
                .setButtonText(SETTINGS_RESET_BUTTON_LABEL)
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings.stateLabels = { ...DEFAULT_TASK_STATE_LABELS };
                    this.plugin.settings.stateColors = { ...DEFAULT_TASK_STATE_COLORS };
                    this.plugin.settings.stateTextColors = { ...DEFAULT_TASK_STATE_TEXT_COLORS };
                    this.plugin.settings.stateStrikethrough = { ...DEFAULT_TASK_STATE_STRIKETHROUGH };
                    this.plugin.settings.stateCycleOrder = [...DEFAULT_TASK_STATE_CYCLE_ORDER];
                    this.plugin.settings.dateFormat = DEFAULT_TASK_DATE_DISPLAY_FORMAT;
                    this.plugin.settings.dateLocale = DEFAULT_TASK_DATE_DISPLAY_LOCALE;
                    this.plugin.settings.dateTagBackgroundColor = DEFAULT_TASK_DATE_TAG_BACKGROUND_COLOR;
                    this.plugin.settings.dateTagBackgroundOpacity = DEFAULT_TASK_DATE_TAG_BACKGROUND_OPACITY;
                    this.plugin.settings.dateTagTextColor = DEFAULT_TASK_DATE_TAG_TEXT_COLOR;
                    this.plugin.settings.dateTagTextOpacity = DEFAULT_TASK_DATE_TAG_TEXT_OPACITY;
                    await this.plugin.saveSettings();
                    this.display();
                });
        });
    }
}

module.exports = class TaskStatesPlugin extends Plugin {
    // Registers the preview and edit handlers that cycle task states
    async onload() {
        const obsidianApp = this.app ?? globalThis.app;

        if (!obsidianApp) {
            return;
        }

        await this.loadSettings();
        applyStateLabelsToDocument(this.settings.stateLabels);
        applyStateColorsToDocument(this.settings.stateColors);
        applyStateTextColorsToDocument(this.settings.stateTextColors);
        applyStateStrikethroughToDocument(this.settings.stateStrikethrough);
        applyDateTagColorsToDocument(this.settings);
        this.addSettingTab(new TaskStatesSettingTab(obsidianApp, this));

        // Preview handler: locates the real task line and writes it back to the file
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

            const previewMarkerSequence = buildMarkerSequenceFromCycleOrder(this.settings?.stateCycleOrder);
            await applyTransformationToPreviewTaskLine(obsidianApp, taskCheckboxElement, (taskLineText) =>
                toggleTaskMarkerInLine(taskLineText, previewMarkerSequence)
            );
        };

        // Edit handler: cycles the task directly in the active editor
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

            handleEditModeInteraction(
                obsidianApp,
                clickEvent,
                buildMarkerSequenceFromCycleOrder(this.settings?.stateCycleOrder)
            );
        };

        // Delegated handler: handles date-button clicks regardless of who re-rendered the DOM
        this._onDateButtonClick = async (clickEvent) => {
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

            const existingDateValue = await resolveExistingDataviewDateFromPreviewTask(
                obsidianApp,
                taskCheckboxElement
            );

            new TaskDatePickerModal(
                obsidianApp,
                existingDateValue ?? getTodayISODate(),
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
            replaceDateInlineFieldsInRenderedElement(
                renderedRootElement,
                this.settings?.dateFormat,
                this.settings?.dateLocale
            );

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

                taskCheckboxElement.insertAdjacentElement('afterend', dateButtonElement);
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

    // Removes the handlers registered during plugin load
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

        clearStateLabelsFromDocument();
        clearStateColorsFromDocument();
        clearStateTextColorsFromDocument();
        clearStateStrikethroughFromDocument();
        clearDateTagColorsFromDocument();
    }

    // Loads the persisted settings and merges them with the plugin defaults
    async loadSettings() {
        const persistedSettings = await this.loadData();
        this.settings = {
            ...DEFAULT_PLUGIN_SETTINGS,
            ...(persistedSettings ?? {}),
            stateLabels: {
                ...DEFAULT_TASK_STATE_LABELS,
                ...(persistedSettings?.stateLabels ?? {})
            },
            stateColors: {
                ...DEFAULT_TASK_STATE_COLORS,
                ...(persistedSettings?.stateColors ?? {})
            },
            stateTextColors: {
                ...DEFAULT_TASK_STATE_TEXT_COLORS,
                ...(persistedSettings?.stateTextColors ?? {})
            },
            stateStrikethrough: {
                ...DEFAULT_TASK_STATE_STRIKETHROUGH,
                ...(persistedSettings?.stateStrikethrough ?? {})
            },
            stateCycleOrder: sanitizeCycleOrder(persistedSettings?.stateCycleOrder),
            dateFormat: persistedSettings?.dateFormat ?? DEFAULT_TASK_DATE_DISPLAY_FORMAT,
            dateLocale: persistedSettings?.dateLocale ?? DEFAULT_TASK_DATE_DISPLAY_LOCALE,
            dateTagBackgroundColor: persistedSettings?.dateTagBackgroundColor ?? DEFAULT_TASK_DATE_TAG_BACKGROUND_COLOR,
            dateTagBackgroundOpacity:
                persistedSettings?.dateTagBackgroundOpacity ?? DEFAULT_TASK_DATE_TAG_BACKGROUND_OPACITY,
            dateTagTextColor: persistedSettings?.dateTagTextColor ?? DEFAULT_TASK_DATE_TAG_TEXT_COLOR,
            dateTagTextOpacity: persistedSettings?.dateTagTextOpacity ?? DEFAULT_TASK_DATE_TAG_TEXT_OPACITY
        };
    }

    // Persists the current settings, re-applies the CSS variables, and re-renders views
    async saveSettings() {
        await this.saveData(this.settings);
        applyStateLabelsToDocument(this.settings.stateLabels);
        applyStateColorsToDocument(this.settings.stateColors);
        applyStateTextColorsToDocument(this.settings.stateTextColors);
        applyStateStrikethroughToDocument(this.settings.stateStrikethrough);
        applyDateTagColorsToDocument(this.settings);
        rerenderOpenMarkdownPreviews(this.app);
    }
};
