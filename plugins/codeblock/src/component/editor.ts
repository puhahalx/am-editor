import { EditorConfiguration, Editor } from 'codemirror';
import { debounce } from 'lodash-es';
import {
	$,
	EditorInterface,
	isEngine,
	isMobile,
	isServer,
	NodeInterface,
} from '@aomao/engine';
import { SYNTAX_MAP } from './mode';
import { CodeBlockEditorInterface, Options } from './types';
const qa = [
	'c',
	'cpp',
	'csharp',
	'erlang',
	'go',
	'groovy',
	'java',
	'kotlin',
	'makefile',
	'objectivec',
	'perl',
	'python',
	'rust',
	'swift',
	'vbnet',
];

let CodeMirrorModule: {
	CodeMirror: any;
};
if (!isServer) {
	import('codemirror').then((module) => {
		CodeMirrorModule = {
			CodeMirror: module.default,
		};
	});
}

class CodeBlockEditor implements CodeBlockEditorInterface {
	private editor: EditorInterface;
	private options: Options;
	codeMirror?: Editor;
	mode: string = 'plain';
	container: NodeInterface;

	constructor(editor: EditorInterface, options: Options) {
		this.editor = editor;
		this.options = options;
		this.container = options.container || $(this.renderTemplate());
	}

	renderTemplate() {
		return '<div class="data-codeblock-container"><div class="data-codeblock-content"></div></div>';
	}

	getConfig(value: string, mode?: string): EditorConfiguration {
		let tabSize = this.codeMirror
			? this.codeMirror.getOption('indentUnit')
			: qa.indexOf(mode || '') > -1
			? 4
			: 2;
		const reg = value ? value.match(/^ {2,4}(?=[^\s])/gm) : null;
		if (reg) {
			tabSize = reg.reduce((val1, val2) => {
				return Math.min(val1, val2.length);
			}, 1 / 0);
		}
		return {
			tabSize,
			indentUnit: tabSize,
		};
	}

	getSyntax(mode: string) {
		return SYNTAX_MAP[mode] || mode;
	}

	create(mode: string, value: string, options?: EditorConfiguration) {
		this.mode = mode;
		const syntaxMode = this.getSyntax(mode);
		this.codeMirror = CodeMirrorModule.CodeMirror(
			this.container.find('.data-codeblock-content').get<HTMLElement>()!,
			{
				value,
				mode: syntaxMode,
				lineNumbers: true,
				lineWrapping: false,
				autofocus: false,
				dragDrop: false,
				readOnly: !isEngine(this.editor) || this.editor.readonly,
				scrollbarStyle: 'null',
				viewportMargin: 1 / 0,
				...this.getConfig(value, syntaxMode),
				...options,
			},
		) as Editor;
		this.codeMirror.on('mousedown', (_, event) => {
			if (!isEngine(this.editor) || this.editor.readonly) {
				event.preventDefault();
				event.stopPropagation();
			}
		});
		this.codeMirror.on('focus', () => {
			const { onFocus } = this.options;
			if (onFocus) onFocus();
		});

		this.codeMirror.on('blur', () => {
			const { onBlur } = this.options;
			if (onBlur) onBlur();
		});
		if (isMobile) {
			this.codeMirror.on('touchstart', (_, event) => {
				const { onMouseDown } = this.options;
				if (onMouseDown) onMouseDown(event);
			});
		} else {
			this.codeMirror.on('mousedown', (_, event) => {
				const { onMouseDown } = this.options;
				if (onMouseDown) onMouseDown(event);
			});
		}

		this.codeMirror.on(
			'change',
			debounce(() => {
				if (!isEngine(this.editor)) return;
				this.save();
			}, 200),
		);

		this.codeMirror.setOption('extraKeys', {
			Enter: (mirror) => {
				const config = this.getConfig(mirror.getValue());
				Object.keys(config).forEach((key) => {
					return mirror.setOption(
						key as keyof EditorConfiguration,
						config[key],
					);
				});
				mirror.execCommand('newlineAndIndent');
			},
		});
		return this.codeMirror;
	}

	update(mode: string, code?: string) {
		this.mode = mode;
		if (code) {
			this.codeMirror?.setValue(code);
		}
		this.codeMirror?.setOption('mode', mode);
		this.codeMirror?.setOption(
			'readOnly',
			!isEngine(this.editor) || this.editor.readonly ? true : false,
		);
		if (!code) this.save();
	}

	render(mode: string, value: string) {
		const root = this.container.find('.data-codeblock-content');
		mode = this.getSyntax(mode);
		const stage = $(
			'<div class="CodeMirror"><pre class="cm-s-default" /></div>',
		);
		root.append(stage);
		const pre = stage.find('pre')[0];
		this.runMode(value || '', mode, pre, this.getConfig(value, mode));
	}

	save() {
		if (!isEngine(this.editor) || !this.codeMirror) return;
		// 中文输入过程需要判断
		if (this.editor.change.isComposing()) {
			return;
		}
		const value = this.codeMirror.getValue();
		const { onSave } = this.options;
		if (onSave) onSave(this.mode, value);
	}

	focus() {
		if (!this.codeMirror) return;
		this.codeMirror.focus();
	}

	/**
	 * 代码来自 runmode addon
	 * 支持行号需要考虑复制粘贴问题
	 *
	 * runmode 本身不支持行号，见 https://github.com/codemirror/CodeMirror/issues/3364
	 * 可参考的解法  https://stackoverflow.com/questions/14237361/use-codemirror-for-standalone-syntax-highlighting-with-line-numbers
	 *
	 * ref:
	 * - https://codemirror.net/doc/manual.html#addons
	 * - https://codemirror.net/addon/runmode/runmode.js
	 */
	runMode(string: string, modespec: string, callback: any, options: any) {
		const { CodeMirror } = CodeMirrorModule;
		const mode = CodeMirror.getMode(CodeMirror.defaults, modespec);
		const ie = /MSIE \d/.test(navigator.userAgent);
		const ie_lt9 =
			ie &&
			(document['documentMode'] == null || document['documentMode'] < 9);

		if (callback.appendChild) {
			const tabSize =
				(options && options.tabSize) || CodeMirror.defaults.tabSize;
			const node = callback;
			let col = 0;
			node.innerHTML = '';

			callback = (text: string, style: string) => {
				if (text === '\n') {
					// Emitting LF or CRLF on IE8 or earlier results in an incorrect display.
					// Emitting a carriage return makes everything ok.
					node.appendChild(
						document.createTextNode(ie_lt9 ? '\r' : text),
					);
					col = 0;
					return;
				}

				let content = '';
				// replace tabs

				for (let pos = 0; ; ) {
					const idx = text.indexOf('\t', pos);

					if (idx === -1) {
						content += text.slice(pos);
						col += text.length - pos;
						break;
					} else {
						col += idx - pos;
						content += text.slice(pos, idx);
						const size = tabSize - (col % tabSize);
						col += size;

						for (let i = 0; i < size; ++i) {
							content += ' ';
						}

						pos = idx + 1;
					}
				}

				if (style) {
					const sp = node.appendChild(document.createElement('span'));
					sp.className = 'cm-' + style.replace(/ +/g, ' cm-');
					sp.appendChild(document.createTextNode(content));
				} else {
					node.appendChild(document.createTextNode(content));
				}
			};
		}

		const lines = CodeMirror.splitLines(string);
		const state = (options && options.state) || CodeMirror.startState(mode);

		for (let i = 0, e = lines.length; i < e; ++i) {
			if (i) callback('\n');
			const stream = new CodeMirror.StringStream(lines[i]);
			if (!stream.string && mode.blankLine) mode.blankLine(state);

			while (!stream.eol()) {
				const style = mode.token ? mode.token(stream, state) : '';
				callback(stream.current(), style, i, stream.start, state);
				stream.start = stream.pos;
			}
		}
	}
}

export default CodeBlockEditor;
