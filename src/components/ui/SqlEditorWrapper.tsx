import React, { useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MonacoEditor, { type OnMount, type BeforeMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useEditorTheme } from "../../hooks/useEditorTheme";
import { loadMonacoTheme } from "../../themes/themeUtils";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { useSettings } from "../../hooks/useSettings";
import { getFontCSS } from "../../utils/settings";
import { formatSql } from "../../utils/sqlFormat";
import { toSqlList } from "../../utils/editor";
import { getSqlInvisibleCharacterEdits } from "../../utils/sqlInvisibleCharacters";
import type { SqlDialect } from "../../utils/sql";
import { registerMonacoSqlSnippets } from "../../utils/sqlSnippets";
import {
  zoomInFontSize,
  zoomOutFontSize,
  resetFontSize,
  DEFAULT_EDITOR_FONT_SIZE,
} from "../../utils/editorFontZoom";
import {
  findAutoUppercaseCandidate,
  isOffsetInNonCodeSpan,
  AUTO_UPPERCASE_DELIMITERS,
} from "../../utils/sqlAutoUppercase";

interface SqlEditorWrapperProps {
  initialValue: string;
  onChange: (value: string) => void;
  onRun: () => void;
  onMount?: OnMount;
  height?: string | number;
  options?: React.ComponentProps<typeof MonacoEditor>['options'];
  editorKey?: string;
  /** Active SQL dialect, used so "Format SQL" matches the connection's engine. */
  dialect?: SqlDialect;
}

// Internal component that resets when key changes
const SqlEditorInternal = ({
  initialValue,
  onChange,
  onRun,
  onMount,
  height = "100%",
  options,
  dialect
}: SqlEditorWrapperProps & { editorKey: string }) => {
  const { t } = useTranslation();
  const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const onRunRef = useRef(onRun);
  onRunRef.current = onRun;
  // Keep the dialect in a ref so the (mount-time) format action always reads
  // the current connection's dialect, even after the user switches connections.
  const dialectRef = useRef(dialect);
  dialectRef.current = dialect;
  const editorTheme = useEditorTheme();
  const { settings, updateSetting } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const updateSettingRef = useRef(updateSetting);
  updateSettingRef.current = updateSetting;
  const fontSizeRef = useRef(settings.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE);
  fontSizeRef.current = settings.editorFontSize ?? DEFAULT_EDITOR_FONT_SIZE;

  // Dispose editor on unmount to prevent "domNode" errors from ResizeObserver
  // firing after the DOM container is removed (e.g., cell deletion/movement)
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      editorRef.current?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, []);

  // Sync editor value only when initialValue changes externally (e.g., tab switch)
  // Preserve cursor position to avoid jumping to start during debounced updates
  useEffect(() => {
    const editor = editorRef.current;
    if (editor && initialValue !== editor.getValue()) {
      const position = editor.getPosition();
      const selections = editor.getSelections();
      editor.setValue(initialValue);
      if (position) editor.setPosition(position);
      if (selections && selections.length > 0) editor.setSelections(selections);
    }
  }, [initialValue]);

  // Update Monaco theme when theme changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      loadMonacoTheme(editorTheme, monacoRef.current);
    }
  }, [editorTheme]);

    const handleChange = useCallback(
      (val: string | undefined) => {
        const newValue = val || "";

        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current);
        }

        updateTimeoutRef.current = setTimeout(() => {
          onChange(newValue);
        }, 300);
      },
      [onChange]
    );

    const handleBeforeMount: BeforeMount = (monaco) => {
      // Load Monaco theme before editor is created
      loadMonacoTheme(editorTheme, monaco);
      registerMonacoSqlSnippets(monaco);
    };

    const tauriPaste = async (ed: Monaco.editor.ICodeEditor) => {
      try {
        const text = await readText();
        const selections = ed.getSelections();
        if (selections && selections.length > 0 && text) {
          const lines = text.split('\n');
          const edits = selections.map((sel, i) => ({
            range: sel,
            text: lines.length === selections.length ? lines[i] : text,
            forceMoveMarkers: true
          }));
          ed.executeEdits('paste', edits);
          ed.pushUndoStop();
        }
      } catch (err) {
        console.error('Failed to read clipboard:', err);
      }
    };

    const handleEditorMount: OnMount = (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register SQL snippets quick trigger (Ctrl + J)
      editor.addAction({
        id: 'tabularis.showSqlSnippets',
        label: t('editor.showSqlSnippets', 'Show SQL Snippets'),
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1.7,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ],
        run: () => {
          window.dispatchEvent(new CustomEvent('tabularis:open-sql-templates'));
        },
      });

      // Register Query History quick trigger (Ctrl + H)
      editor.addAction({
        id: 'tabularis.showQueryHistory',
        label: t('editor.showQueryHistory', 'Show Query History'),
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1.8,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH],
        run: () => {
          window.dispatchEvent(new CustomEvent('tabularis:open-query-history'));
        },
      });

      // Register custom Paste action using Tauri clipboard API
      editor.addAction({
        id: 'tauri.clipboardPaste',
        label: 'Paste',
        contextMenuGroupId: '9_cutcopypaste',
        contextMenuOrder: 2,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
        run: tauriPaste,
      });

      // Format the SQL in the editor (Ctrl+Alt+F).
      // Formats the current selection when there is one, otherwise the whole
      // document. Uses the shared sql-formatter util with the connection's
      // dialect; on a parse error it returns the original text unchanged, so
      // this can never corrupt the query.
      editor.addAction({
        id: 'tabularis.formatSql',
        label: 'Format SQL',
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
        run: (ed) => {
          const model = ed.getModel();
          if (!model) return;
          const selection = ed.getSelection();
          const range =
            selection && !selection.isEmpty()
              ? selection
              : model.getFullModelRange();
          const source = model.getValueInRange(range);
          const formatted = formatSql(source, dialectRef.current);
          if (formatted === source) return;
          ed.executeEdits("tabularis.formatSql", [{ range, text: formatted }]);
          ed.pushUndoStop();
        },
      });

      // An explicit, undoable repair for hidden characters pasted from rich text.
      editor.addAction({
        id: 'tabularis.removeInvisibleSqlCharacters',
        label: t('editor.removeInvisibleCharacters'),
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1.5,
        run: (ed) => {
          const model = ed.getModel();
          if (!model) return;
          const selections = ed.getSelections() ?? [];
          const selected = selections.filter((range) => !range.isEmpty());
          const selectionOffsets = selected.map((range) => ({
            start: model.getOffsetAt(range.getStartPosition()),
            end: model.getOffsetAt(range.getEndPosition()),
          }));
          // Scan the full document so a partial selection cannot hide the
          // quote that starts a string or a quoted identifier.
          const changes = getSqlInvisibleCharacterEdits(
            model.getValue(),
            dialectRef.current,
          );
          const edits = changes
            .filter(({ start, end }) =>
              selectionOffsets.length === 0 ||
              selectionOffsets.some((range) => start >= range.start && end <= range.end))
            .map(({ start, end, text }) => {
              const from = model.getPositionAt(start);
              const to = model.getPositionAt(end);
              return {
                range: {
                  startLineNumber: from.lineNumber,
                  startColumn: from.column,
                  endLineNumber: to.lineNumber,
                  endColumn: to.column,
                },
                text,
                forceMoveMarkers: false,
              };
            });
          if (edits.length === 0) return;
          // Small edits keep the cursor near its original position.
          ed.pushUndoStop();
          ed.executeEdits('removeInvisibleSqlCharacters', edits);
          ed.pushUndoStop();
        },
      });

      // Convert selected values (e.g. a column pasted from a spreadsheet) into
      // a quoted list for IN (...). Shown only when text is selected; every
      // selection is replaced in one edit, so a single undo restores it.
      editor.addAction({
        id: 'tabularis.convertSelectionToSqlList',
        label: t('editor.convertSelectionToSqlList'),
        contextMenuGroupId: '1_modification',
        contextMenuOrder: 1.6,
        precondition: 'editorHasSelection',
        run: (ed) => {
          const model = ed.getModel();
          if (!model) return;
          const edits = (ed.getSelections() ?? [])
            .filter((selection) => !selection.isEmpty())
            .map((selection) => ({
              range: selection,
              text: toSqlList(model.getValueInRange(selection)),
              forceMoveMarkers: true,
            }))
            .filter((edit) => edit.text !== '');
          if (edits.length === 0) return;
          ed.pushUndoStop();
          ed.executeEdits('convertSelectionToSqlList', edits);
          ed.pushUndoStop();
        },
      });

      // Remove the built-in Paste from context menu (doesn't work in Tauri)
      const contextMenuContrib = editor.getContribution('editor.contrib.contextmenu');
      if (contextMenuContrib) {
        const contrib = contextMenuContrib as unknown as Record<string, unknown>;
        const orig = contrib._getMenuActions;
        if (typeof orig === 'function') {
          contrib._getMenuActions = function (...args: unknown[]) {
            const actions: { id?: string }[] = (orig as (...a: unknown[]) => { id?: string }[]).apply(this, args);
            return actions.filter((a) => a.id !== 'editor.action.clipboardPasteAction');
          };
        }
      }

      // Bind Ctrl+Enter to Run — use ref so the closure never goes stale
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        () => {
          onRunRef.current();
        }
      );

      // Zoom In (Ctrl/Cmd + = or Numpad Add)
      editor.addAction({
        id: "tabularis.zoomInEditor",
        label: "Zoom In (Editor Font)",
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal,
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadAdd,
        ],
        run: () => {
          updateSettingRef.current(
            "editorFontSize",
            zoomInFontSize(fontSizeRef.current),
          );
        },
      });

      // Zoom Out (Ctrl/Cmd + - or Numpad Subtract)
      editor.addAction({
        id: "tabularis.zoomOutEditor",
        label: "Zoom Out (Editor Font)",
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus,
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.NumpadSubtract,
        ],
        run: () => {
          updateSettingRef.current(
            "editorFontSize",
            zoomOutFontSize(fontSizeRef.current),
          );
        },
      });

      // Reset Zoom (Ctrl/Cmd + 0 or Numpad 0)
      editor.addAction({
        id: "tabularis.resetZoomEditor",
        label: "Reset Zoom (Editor Font)",
        keybindings: [
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit0,
          monaco.KeyMod.CtrlCmd | monaco.KeyCode.Numpad0,
        ],
        run: () => {
          updateSettingRef.current("editorFontSize", resetFontSize());
        },
      });

      // As-you-type SQL keyword auto-uppercasing
      let isAutoUppercasing = false;
      editor.onDidChangeModelContent((event) => {
        if (isAutoUppercasing) return;
        if (settingsRef.current.autocompleteKeywordCase === "lower") return;

        const model = editor.getModel();
        if (!model) return;

        for (const change of event.changes) {
          if (
            change.text.length > 0 &&
            change.text.length <= 2 &&
            AUTO_UPPERCASE_DELIMITERS.has(change.text)
          ) {
            const line = model.getLineContent(change.range.startLineNumber);
            const candidate = findAutoUppercaseCandidate(
              line,
              change.text,
              change.range.startColumn,
            );
            if (!candidate) continue;

            const wordOffset = model.getOffsetAt({
              lineNumber: change.range.startLineNumber,
              column: candidate.startColumn,
            });

            if (
              isOffsetInNonCodeSpan(
                wordOffset,
                model.getValue(),
                dialectRef.current,
              )
            ) {
              continue;
            }

            isAutoUppercasing = true;
            try {
              editor.executeEdits("tabularis.autoUppercase", [
                {
                  range: {
                    startLineNumber: change.range.startLineNumber,
                    startColumn: candidate.startColumn,
                    endLineNumber: change.range.startLineNumber,
                    endColumn: candidate.endColumn,
                  },
                  text: candidate.upper,
                  forceMoveMarkers: true,
                },
              ]);
            } finally {
              isAutoUppercasing = false;
            }
          }
        }
      });

      if (onMount) onMount(editor, monaco);
    };

    return (
      <MonacoEditor
        height={height}
        defaultLanguage="sql"
        theme={editorTheme.id}
        defaultValue={initialValue}
        onChange={handleChange}
        beforeMount={handleBeforeMount}
        onMount={handleEditorMount}
        options={{
          accessibilitySupport: 'auto',
          minimap: { enabled: false },
          fontSize: settings.editorFontSize ?? 14,
          fontFamily: getFontCSS(settings.editorFontFamily ?? "JetBrains Mono"),
          lineHeight: settings.editorLineHeight ?? 1.5,
          tabSize: settings.editorTabSize ?? 2,
          wordWrap: (settings.editorWordWrap ?? true) ? 'on' : 'off',
          unicodeHighlight: {
            invisibleCharacters: settings.editorHighlightInvisibleCharacters ?? true,
            ambiguousCharacters: settings.editorHighlightInvisibleCharacters ?? true,
            nonBasicASCII: false,
          },
          renderControlCharacters: settings.editorHighlightInvisibleCharacters ?? true,
          lineNumbers: (settings.editorShowLineNumbers ?? true) ? 'on' : 'off',
          padding: { top: 16, bottom: 32 },
          scrollBeyondLastLine: false,
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'auto',
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          acceptSuggestionOnEnter: (settings.editorAcceptSuggestionOnEnter ?? true) ? 'smart' : 'off',
          multiCursorModifier: 'ctrlCmd',
          automaticLayout: true,
          ...options
        }}
      />
    );
};

export const SqlEditorWrapper = React.memo((props: SqlEditorWrapperProps) => {
  // Use editorKey to control when component remounts (only on tab switch)
  return <SqlEditorInternal key={props.editorKey || "default"} editorKey={props.editorKey || "default"} {...props} />;
});
