import {
	$,
	Plugin,
	isEngine,
	PluginEntry,
	NodeInterface,
	CARD_KEY,
	isServer,
	CARD_VALUE_KEY,
	Parser,
	SchemaInterface,
	unescape,
	CARD_TYPE_KEY,
	PluginOptions,
} from '@aomao/engine';
import CodeBlockComponent, { CodeBlockEditor, NAME_MAP } from './component';

export interface Options extends PluginOptions {
	hotkey?: string | Array<string>;
	markdown?: boolean;
}

// 缩写替换
const MODE_ALIAS: { [key: string]: string } = {
	text: 'plain',
	sh: 'bash',
	ts: 'typescript',
	js: 'javascript',
	py: 'python',
	puml: 'plantuml',
	uml: 'plantuml',
	vb: 'basic',
	md: 'markdown',
	'c++': 'cpp',
};

export default class extends Plugin<Options> {
	static get pluginName() {
		return 'codeblock';
	}

	init() {
		this.editor.on('paser:html', (node) => this.parseHtml(node));
		this.editor.on('paste:schema', (schema) => this.pasteSchema(schema));
		this.editor.on('paste:each', (child) => this.pasteHtml(child));
		if (isEngine(this.editor) && this.markdown) {
			this.editor.on('keydown:enter', (event) => this.markdown(event));
			this.editor.on('paste:markdown-before', (child) =>
				this.pasteMarkdown(child),
			);
		}
	}

	execute(mode: string, value: string) {
		if (!isEngine(this.editor)) return;
		const { card } = this.editor;
		const component = card.insert(CodeBlockComponent.cardName, {
			mode,
			code: value,
		});
		setTimeout(() => {
			(component as CodeBlockComponent).focusEditor();
		}, 200);
	}

	hotkey() {
		return this.options.hotkey || '';
	}

	markdown(event: KeyboardEvent) {
		if (!isEngine(this.editor) || this.options.markdown === false) return;
		const { change, node, command } = this.editor;
		const range = change.getRange();

		if (!range.collapsed || change.isComposing() || !this.markdown) return;
		const blockApi = this.editor.block;
		const block = blockApi.closest(range.startNode);

		if (!node.isRootBlock(block)) {
			return;
		}

		const chars = blockApi.getLeftText(block);
		const match = /^```(.*){0,20}$/.exec(chars);

		if (match) {
			const modeText = (
				undefined === match[1] ? '' : match[1]
			).toLowerCase();
			const mode = MODE_ALIAS[modeText] || modeText;

			if (mode || mode === '') {
				event.preventDefault();
				blockApi.removeLeftText(block);
				command.execute(
					(this.constructor as PluginEntry).pluginName,
					mode,
				);
				block.remove();
				return false;
			}
		}
		return;
	}

	pasteSchema(schema: SchemaInterface) {
		schema.add([
			{
				type: 'block',
				name: 'pre',
				attributes: {
					'data-syntax': {
						required: true,
						value: '*',
					},
				},
			},
			{
				type: 'block',
				name: 'div',
				attributes: {
					'data-syntax': {
						required: true,
						value: '*',
					},
				},
			},
		]);
	}

	pasteHtml(node: NodeInterface) {
		if (!isEngine(this.editor)) return;
		if (
			(!node.isText() &&
				node.get<HTMLElement>()?.hasAttribute('data-syntax')) ||
			node.first()?.name === 'code'
		) {
			let code = new Parser(node, this.editor).toText();
			code = unescape(code);
			this.editor.card.replaceNode(node, 'codeblock', {
				mode: node.attributes('data-syntax') || 'plain',
				code,
			});
			node.remove();
		}
	}

	pasteMarkdown(node: NodeInterface) {
		if (!isEngine(this.editor) || !this.markdown || !node.isText()) return;

		let text = node.text();
		if (!text) return;
		const reg = /```/;
		let match = reg.exec(text);
		if (!match) return;
		const { card } = this.editor;

		let newText = '';
		const langs = Object.keys(NAME_MAP)
			.concat(Object.keys(MODE_ALIAS))
			.sort((a, b) => (a.length > b.length ? -1 : 1));

		const createCodeblock = (
			nodes: Array<string>,
			mode: string = 'text',
		) => {
			//获取中间字符
			const codeText = new Parser(nodes.join('\n'), this.editor).toText();
			let code = unescape(codeText);

			if (code.endsWith('\n')) code = code.substr(0, code.length - 2);
			const tempNode = $('<div></div>');
			const carNode = card.replaceNode(tempNode, 'codeblock', {
				mode,
				code,
			});
			tempNode.remove();

			return carNode.get<Element>()?.outerHTML;
		};

		const rows = text.split(/\n|\r\n/);
		let nodes: Array<string> = [];
		let isCode: boolean = false;
		let mode = 'text';
		rows.forEach((row) => {
			let match = /^(.*)```(\s)*$/.exec(row);
			if (match && isCode) {
				nodes.push(match[1]);
				newText += createCodeblock(nodes, mode) + '\n';
				mode = 'text';
				isCode = false;
				nodes = [];
				return;
			}
			match = /^```(.*)/.exec(row);
			if (match) {
				isCode = true;
				mode =
					langs.find((key) => match && match[1].indexOf(key) === 0) ||
					'text';
				let code =
					match[1].indexOf(mode) === 0
						? match[1].substr(mode.length + 1)
						: match[1];
				mode = MODE_ALIAS[mode] || mode;
				nodes.push(code);
			} else if (isCode) {
				nodes.push(row);
			} else {
				newText += row + '\n';
			}
		});
		if (nodes.length > 0) {
			newText += createCodeblock(nodes, mode) + '\n';
		}
		node.text(newText);
	}

	parseHtml(root: NodeInterface) {
		if (isServer) return;

		root.find(`[${CARD_KEY}=${CodeBlockComponent.cardName}`).each(
			(cardNode) => {
				const node = $(cardNode);
				const card = this.editor.card.find(node) as CodeBlockComponent;
				const value = card?.getValue();
				if (value && value.code) {
					node.empty();
					const codeEditor = new CodeBlockEditor(this.editor, {});

					const content = codeEditor.container.find(
						'.data-codeblock-content',
					);
					content.css({
						border: '1px solid #e8e8e8',
						'max-width': '750px',
					});
					codeEditor.render(value.mode || 'plain', value.code || '');
					content.addClass('am-engine-view');
					content.hide();
					document.body.appendChild(content[0]);
					content.traverse((node) => {
						if (
							node.type === Node.ELEMENT_NODE &&
							(node.get<HTMLElement>()?.classList?.length || 0) >
								0
						) {
							const element = node.get<HTMLElement>()!;
							const style = window.getComputedStyle(element);
							[
								'color',
								'margin',
								'padding',
								'background',
							].forEach((attr) => {
								(element.style as any)[attr] =
									style.getPropertyValue(attr);
							});
						}
					});
					content.show();
					content.css('background', '#f9f9f9');
					node.append(content);
					node.removeAttributes(CARD_KEY);
					node.removeAttributes(CARD_TYPE_KEY);
					node.removeAttributes(CARD_VALUE_KEY);
					node.attributes('data-syntax', value.mode || 'plain');
					content.removeClass('am-engine-view');
				} else node.remove();
			},
		);
	}
}
export { CodeBlockComponent };
