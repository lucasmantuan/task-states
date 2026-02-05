const { Plugin } = require('obsidian');

const getEditor = (app) => {
    const leaf = app?.workspace?.activeLeaf;
    const view = leaf?.view;
    if (!view || typeof view.getViewType !== 'function') return null;
    if (view.getViewType() !== 'markdown') return null;
    return view.editor ?? null;
};

const toggleMarker = (text) => {
    const match = text.match(/^(\s*[-*+]\s*)\[([^\]]*)\]/);
    if (!match) return text;
    const prefix = match[1];
    const marker = match[2];
    const sequence = ['*', 'x', '-', '!', '>', ' '];
    const index = sequence.indexOf(marker);
    const next = index === -1 ? sequence[0] : sequence[(index + 1) % sequence.length];
    return text.replace(/^(\s*[-*+]\s*)\[[^\]]*\]/, `${prefix}[${next}]`);
};

const setLine = (editor, lineNo, newText) => {
    if (typeof editor.setLine === 'function') {
        editor.setLine(lineNo, newText);
        return;
    }
    if (typeof editor.replaceRange === 'function') {
        const old = editor.getLine(lineNo);
        editor.replaceRange(newText, { line: lineNo, ch: 0 }, { line: lineNo, ch: old.length });
    }
};

module.exports = class TaskStatesPlugin extends Plugin {
    async onload() {
        this._handler = (ev) => {
            const t = ev.target;
            if (!(t instanceof HTMLInputElement)) return;
            if (!t.classList.contains('task-list-item-checkbox')) return;

            const editor = getEditor(this.app);
            if (!editor || typeof editor.posAtCoords !== 'function') return;

            ev.preventDefault();
            ev.stopImmediatePropagation();

            const pos = editor.posAtCoords(ev.clientX, ev.clientY);
            if (!pos || typeof pos.line !== 'number') return;

            const lineNo = pos.line;
            const current = editor.getLine(lineNo);
            const updated = toggleMarker(current);

            if (updated !== current) setLine(editor, lineNo, updated);
        };

        document.addEventListener('click', this._handler, true);
        console.log('Task States plugin carregado');
    }

    onunload() {
        if (this._handler) {
            document.removeEventListener('click', this._handler, true);
            this._handler = null;
        }
        console.log('Listener removido.');
    }
};
