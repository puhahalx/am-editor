import {
	$,
	addUnit,
	isEngine,
	NodeInterface,
	Plugin,
	PluginEntry,
	removeUnit,
	SchemaGlobal,
	PluginOptions,
	ConversionFromValue,
	ConversionToValue,
} from '@aomao/engine';

export interface Options extends PluginOptions {
	hotkey?: {
		in?: string;
		out?: string;
	};
	maxPadding?: number;
}

const TEXT_INENT_KEY = 'text-indent';

export default class extends Plugin<Options> {
	static get pluginName() {
		return 'indent';
	}

	init() {
		this.editor.schema.add(this.schema());
		this.conversion().forEach(({ from, to }) => {
			this.editor.conversion.add(from, to);
		});
		this.editor.on('keydown:backspace', (event) => this.onBackspace(event));
		this.editor.on('keydown:tab', (event) => this.onTab(event));
		this.editor.on('keydown:shift-tab', (event) => this.onShiftTab(event));
		if (isEngine(this.editor)) {
			this.editor.on('paste:each', (node) => this.pasteEach(node));
		}
	}

	execute(type: 'in' | 'out' = 'in', isTab: boolean = false) {
		if (!isEngine(this.editor)) return;
		const { change, list, block } = this.editor;
		list.split();
		const range = change.getRange();
		const blocks = block.findBlocks(range);
		// 没找到目标 block
		if (!blocks) {
			return;
		}
		const maxPadding = this.options.maxPadding || 50;
		// 其它情况
		blocks.forEach((block) => {
			this.addPadding(block, type === 'in' ? 2 : -2, isTab, maxPadding);
		});
		list.merge();
	}

	queryState() {
		if (!isEngine(this.editor)) return;
		const { change, list, node } = this.editor;
		const range = change.getRange();
		if (!range.startNode.inEditor()) return 0;
		const block = this.editor.block.closest(range.startNode);
		if (block.name === 'li') {
			return list.getIndent(block.closest('ul,ol'));
		}

		if (node.isRootBlock(block) || node.isSimpleBlock(block)) {
			return removeUnit(block.css(TEXT_INENT_KEY));
		}
		return 0;
	}

	addPadding(
		block: NodeInterface,
		padding: number,
		isTab: boolean,
		maxPadding: number,
	) {
		const { list, node } = this.editor;
		if (block.name === 'li') return;
		if (node.isList(block)) {
			list.addIndent(block, padding, maxPadding);
		} else if (node.isRootBlock(block) || node.isSimpleBlock(block)) {
			if (padding > 0) {
				if (removeUnit(block.css(TEXT_INENT_KEY)) || isTab !== true) {
					const currentValue = block.css(TEXT_INENT_KEY);
					let newValue = removeUnit(currentValue) + padding;
					// 获取自身宽度计算最大的indent
					const width = block.width();
					// 获取字体大小用作计算em
					let fontSize = block.css('font-size');
					// 如果本身没有字体大小就，获取编辑器根节点默认字体大小
					fontSize =
						!fontSize || fontSize.endsWith('em')
							? this.editor.root.css('font-size')
							: fontSize;
					if (fontSize.endsWith('em')) {
						fontSize = $(document.body).css('font-size');
					}
					if (!fontSize.endsWith('px')) fontSize = '16px';
					const widthMax =
						width > 0 ? width / removeUnit(fontSize) : maxPadding;

					newValue = Math.min(newValue, maxPadding, widthMax);
					if (newValue <= 0) block.css(TEXT_INENT_KEY, '');
					else {
						block.css(
							TEXT_INENT_KEY,
							addUnit(newValue > 0 ? newValue : 0, 'em'),
						);
					}
				} else {
					block.css(TEXT_INENT_KEY, `${padding}em`);
				}
			} else {
				const currentValue = block.css(TEXT_INENT_KEY);
				const newValue = removeUnit(currentValue) + padding;
				if (newValue <= 0) block.css(TEXT_INENT_KEY, '');
				else {
					block.css(
						TEXT_INENT_KEY,
						addUnit(newValue > 0 ? newValue : 0, 'em'),
					);
				}
			}
		}
	}

	hotkey() {
		const inHotkey = this.options.hotkey?.in || 'mod+]';
		const outHotkey = this.options.hotkey?.out || 'mod+[';
		return [
			{ key: inHotkey, args: 'in' },
			{ key: outHotkey, args: 'out' },
		];
	}

	schema(): SchemaGlobal {
		return {
			type: 'block',
			attributes: {
				style: {
					[TEXT_INENT_KEY]: '@length',
				},
			},
		};
	}

	conversion(): Array<{ from: ConversionFromValue; to: ConversionToValue }> {
		return [
			{
				from: (_, styles, attributes) => {
					return (
						!!styles['padding-left'] || !!attributes[TEXT_INENT_KEY]
					);
				},
				to: (name, styles, attributes) => {
					const node = $(`<${name} />`);
					let valueStr =
						styles['padding-left'] || attributes[TEXT_INENT_KEY];

					// 转换为px
					if (valueStr.endsWith('pt')) {
						valueStr = this.convertToPX(valueStr);
					}
					// 转换为em
					if (valueStr.endsWith('px')) {
						// 获取自身的字体大小
						let fontSize = styles['font-size'];
						// 如果本身没有字体大小就，获取编辑器根节点默认字体大小
						fontSize =
							!fontSize || fontSize.endsWith('em')
								? this.editor.root.css('font-size')
								: fontSize;
						if (fontSize.endsWith('em')) {
							fontSize = $(document.body).css('font-size');
						}
						if (!fontSize.endsWith('px')) fontSize = '16px';
						const value =
							removeUnit(valueStr) / removeUnit(fontSize);
						styles[TEXT_INENT_KEY] = `${value}em`;
					} else if (valueStr.endsWith('em')) {
						styles[TEXT_INENT_KEY] = valueStr;
					}
					delete styles['padding-left'];
					delete attributes[TEXT_INENT_KEY];
					node.css(styles);
					Object.keys(attributes).forEach((name) => {
						node.attributes(name, attributes[name]);
					});
					return node;
				},
			},
		];
	}

	onBackspace(event: KeyboardEvent) {
		if (!isEngine(this.editor)) return;
		const { change, list } = this.editor;
		let range = change.getRange();
		const block = this.editor.block.closest(range.startNode);
		if ('li' === block.name) {
			if (range.collapsed && !list.isFirst(range)) {
				return;
			} else if (!range.collapsed) return;
		} else if (
			range.collapsed &&
			!this.editor.block.isFirstOffset(range, 'start')
		)
			return;
		else if (!range.collapsed) return;
		if (this.queryState()) {
			event.preventDefault();
			this.editor.command.execute(
				(this.constructor as PluginEntry).pluginName,
				'out',
			);
			return false;
		}
		return;
	}

	onTab(event: KeyboardEvent) {
		if (!isEngine(this.editor)) return;
		const { change, list, block } = this.editor;
		const range = change.getRange();
		//列表
		if (range.collapsed && list.isFirst(range)) {
			event.preventDefault();
			this.editor.command.execute(
				(this.constructor as PluginEntry).pluginName,
				'in',
			);
			return false;
		}
		// <p><cursor />foo</p>
		if (!range.collapsed || block.isFirstOffset(range, 'start')) {
			event.preventDefault();
			this.editor.command.execute(
				(this.constructor as PluginEntry).pluginName,
				'in',
				true,
			);
			return false;
		}
		return;
	}

	onShiftTab(event: KeyboardEvent) {
		if (!isEngine(this.editor)) return;
		event.preventDefault();
		this.editor.command.execute(
			(this.constructor as PluginEntry).pluginName,
			'out',
		);
		return false;
	}

	convertToPX(value: string) {
		const match = /([\d\.]+)(pt|px)$/i.exec(value);
		if (match && match[2] === 'pt') {
			return (
				String(Math.round((parseInt(match[1], 10) * 96) / 72)) + 'px'
			);
		}
		return value;
	}

	pasteEach(node: NodeInterface) {
		//pt 转为px
		if (!node.isCard() && this.editor.node.isBlock(node)) {
			const textIndentSource = node.css(TEXT_INENT_KEY);
			if (!!textIndentSource && textIndentSource.endsWith('pt')) {
				const textIndent = this.convertToPX(textIndentSource);
				if (!!textIndent) node.css(TEXT_INENT_KEY, textIndent);
			}
		}
	}
}
