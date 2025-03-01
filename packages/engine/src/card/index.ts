import {
	CARD_ELEMENT_KEY,
	CARD_KEY,
	CARD_SELECTOR,
	CARD_TYPE_KEY,
	CARD_VALUE_KEY,
	READY_CARD_KEY,
	READY_CARD_SELECTOR,
	DATA_ELEMENT,
	EDITABLE,
	EDITABLE_SELECTOR,
	DATA_TRANSIENT_ELEMENT,
	DATA_TRANSIENT_ATTRIBUTES,
	CARD_ASYNC_RENDER,
} from '../constants';
import {
	ActiveTrigger,
	CardEntry,
	CardInterface,
	CardModelInterface,
	CardType,
	CardValue,
} from '../types/card';
import { NodeInterface, isNode, isNodeEntry } from '../types/node';
import { RangeInterface } from '../types/range';
import { EditorInterface, isEngine } from '../types/engine';
import {
	decodeCardValue,
	encodeCardValue,
	transformCustomTags,
} from '../utils';
import { Backspace, Enter, Left, Right, Up, Down, Default } from './typing';
import { $ } from '../node';
import './index.css';

class CardModel implements CardModelInterface {
	classes: {
		[k: string]: CardEntry;
	};
	private components: Array<CardInterface>;
	private editor: EditorInterface;

	constructor(editor: EditorInterface) {
		this.classes = {};
		this.components = [];
		this.editor = editor;
	}

	get active() {
		return this.components.find((component) => component.activated);
	}

	get length() {
		return this.components.length;
	}

	init(cards: Array<CardEntry>) {
		const editor = this.editor;
		if (isEngine(editor)) {
			const { typing } = editor;
			//绑定回车事件
			const enter = new Enter(editor);
			typing
				.getHandleListener('enter', 'keydown')
				?.on((event) => enter.trigger(event));
			//删除事件
			const backspace = new Backspace(editor);
			typing
				.getHandleListener('backspace', 'keydown')
				?.on((event) => backspace.trigger(event));
			//方向键事件
			const left = new Left(editor);
			typing
				.getHandleListener('left', 'keydown')
				?.on((event) => left.trigger(event));

			const right = new Right(editor);
			typing
				.getHandleListener('right', 'keydown')
				?.on((event) => right.trigger(event));

			const up = new Up(editor);
			typing
				.getHandleListener('up', 'keydown')
				?.on((event) => up.trigger(event));

			const down = new Down(editor);
			typing
				.getHandleListener('down', 'keydown')
				?.on((event) => down.trigger(event));

			const _default = new Default(editor);
			typing
				.getHandleListener('default', 'keydown')
				?.on((event) => _default.trigger(event));
		}

		cards.forEach((card) => {
			this.classes[card.cardName] = card;
		});
	}

	add(clazz: CardEntry) {
		this.classes[clazz.cardName] = clazz;
	}

	each(
		callback: (card: CardInterface, index?: number) => boolean | void,
	): void {
		this.components.every((card, index) => {
			if (callback && callback(card, index) === false) return false;
			return true;
		});
	}

	closest(
		selector: Node | NodeInterface,
		ignoreEditable?: boolean,
	): NodeInterface | undefined {
		if (isNode(selector)) selector = $(selector);
		if (isNodeEntry(selector) && !selector.isCard()) {
			const card = selector.closest(CARD_SELECTOR, (node: Node) => {
				if (
					node && ignoreEditable
						? $(node).isRoot()
						: $(node).isEditable()
				) {
					return;
				}
				return node.parentNode || undefined;
			});
			if (!card || card.length === 0) return;
			selector = card;
		}
		return selector;
	}

	find(
		selector: string | Node | NodeInterface,
		ignoreEditable?: boolean,
	): CardInterface | undefined {
		if (typeof selector !== 'string') {
			const cardNode = this.closest(selector, ignoreEditable);
			if (!cardNode) return;
			selector = cardNode;
		}

		const getValue = (
			node: Node | NodeInterface,
		): CardValue & { id: string } => {
			if (isNode(node)) node = $(node);
			const value = node.attributes(CARD_VALUE_KEY);
			return value ? decodeCardValue(value) : {};
		};
		const cards = this.components.filter((item) => {
			if (typeof selector === 'string') return item.id === selector;
			if (
				item.root.name !==
				(isNode(selector)
					? selector.nodeName.toString()
					: selector.name)
			)
				return false;
			return (
				item.root.equal(selector) || item.id === getValue(selector).id
			);
		});
		if (cards.length === 0) return;

		return cards[0];
	}

	findBlock(selector: Node | NodeInterface): CardInterface | undefined {
		if (isNode(selector)) selector = $(selector);
		if (!selector.get()) return;
		const parent = selector.parent();
		if (!parent) return;
		const card = this.find(parent);
		if (!card) return;
		if (card.type === CardType.BLOCK) return card;
		return this.findBlock(card.root);
	}

	getSingleCard(range: RangeInterface) {
		let card = this.find(range.commonAncestorNode);
		if (!card) card = this.getSingleSelectedCard(range);
		return card;
	}

	getSingleSelectedCard(range: RangeInterface) {
		const elements = range.findElementsInSimpleRange();
		let node = elements[0];
		if (elements.length === 1 && node) {
			const domNode = $(node);
			if (domNode.isCard()) {
				return this.find(domNode);
			}
		}
		return;
	}

	// 插入Card
	insertNode(range: RangeInterface, card: CardInterface) {
		const isInline = card.type === 'inline';
		const editor = this.editor;
		// 范围为折叠状态时先删除内容
		if (!range.collapsed && isEngine(editor)) {
			editor.change.deleteContent(range);
		}
		this.gc();
		const { inline, block, node } = editor;
		// 插入新 Card
		if (isInline) {
			inline.insert(card.root, range);
		} else {
			block.insert(card.root, range, (container) => {
				//获取最外层的block嵌套节点
				let blockParent = container.parent();
				while (blockParent && !blockParent.isEditable()) {
					container = blockParent;
					const parent = blockParent.parent();
					if (parent && node.isBlock(parent)) {
						blockParent = parent;
					} else break;
				}
				return container;
			});
		}
		this.components.push(card);
		card.focus(range);
		// 矫正错误 HTML 结构
		const rootParent = card.root.parent();
		if (
			!isInline &&
			rootParent &&
			rootParent.inEditor() &&
			node.isBlock(rootParent)
		) {
			block.unwrap(rootParent, range);
		}
		const result = card.render();
		const center = card.getCenter();
		if (result !== undefined) {
			card.getCenter().append(
				typeof result === 'string' ? $(result) : result,
			);
		}
		if (card.contenteditable.length > 0) {
			center.find(card.contenteditable.join(',')).each((node) => {
				const child = $(node);
				child.attributes(
					'contenteditable',
					!isEngine(this.editor) || this.editor.readonly
						? 'false'
						: 'true',
				);
				child.attributes(DATA_ELEMENT, EDITABLE);
			});
		}
		//创建工具栏
		card.didRender();
		if (card.didInsert) {
			card.didInsert();
		}
		return card;
	}

	// 移除Card
	removeNode(card: CardInterface) {
		if (card.destroy) card.destroy();
		this.removeComponent(card);
		card.root.remove();
	}

	// 更新Card
	updateNode(card: CardInterface, value: CardValue) {
		if (card.destroy) card.destroy();
		const container = card.findByKey('center');
		container.empty();
		card.setValue(value);
		const result = card.render();
		if (result !== undefined) {
			card.getCenter().append(
				typeof result === 'string' ? $(result) : result,
			);
		}
		if (card.didUpdate) {
			card.didUpdate();
		}
	}
	// 将指定节点替换成等待创建的Card DOM 节点
	replaceNode(node: NodeInterface, name: string, value?: CardValue) {
		const clazz = this.classes[name];
		if (!clazz) throw ''.concat(name, ': This card does not exist');
		const type = value?.type || clazz.cardType;
		const cardNode = transformCustomTags(
			`<card type="${type}" name="${name}" value="${encodeCardValue(
				value,
			)}"></card>`,
		);
		const readyCard = $(cardNode);
		node.before(readyCard);
		readyCard.append(node);
		return readyCard;
	}

	activate(
		node: NodeInterface,
		trigger: ActiveTrigger = ActiveTrigger.MANUAL,
		event?: MouseEvent,
	) {
		const editor = this.editor;
		if (!isEngine(editor) || editor.readonly) return;
		//获取当前卡片所在编辑器的根节点
		const container = node.getRoot();
		//如果当前编辑器根节点和引擎的根节点不匹配就不执行，主要是子父编辑器的情况
		if (!container.get() || editor.container.equal(container)) {
			let card = this.find(node);
			const editableElement = node.closest(EDITABLE_SELECTOR);
			if (!card && editableElement.length > 0) {
				const editableParent = editableElement.parent();
				card = editableParent ? this.find(editableParent) : undefined;
			}
			const blockCard = card ? this.findBlock(card.root) : undefined;
			if (blockCard) {
				card = blockCard;
			}
			if (card && card.isCursor(node)) {
				if (editableElement.length > 0) {
					const editableParent = editableElement.parent();
					card = editableParent
						? this.find(editableParent)
						: undefined;
				} else card = undefined;
			}
			let isCurrentActiveCard =
				card && this.active && this.active.root.equal(card.root);
			if (trigger === ActiveTrigger.UPDATE_CARD) {
				isCurrentActiveCard = false;
			}
			if (this.active && !isCurrentActiveCard) {
				this.active.toolbarModel?.hide();
				this.active.select(false);
				this.active.activate(false);
			}
			if (card) {
				if (card.activatedByOther) return;
				if (!isCurrentActiveCard) {
					card!.toolbarModel?.show(event);
					if (
						card.type === CardType.INLINE &&
						(card.constructor as CardEntry).autoSelected !==
							false &&
						(trigger !== ActiveTrigger.CLICK ||
							isEngine(this.editor))
					) {
						this.select(card);
					}
					card.activate(true);
				}
				if (card.type === CardType.BLOCK) {
					card.select(false);
				}
				if (
					!isCurrentActiveCard &&
					trigger === ActiveTrigger.MOUSE_DOWN
				) {
					editor.trigger('focus');
				}
				editor.change.onSelect();
			}
		}
	}

	select(card: CardInterface) {
		const editor = this.editor;
		if (!isEngine(editor)) return;
		if (
			(card.constructor as CardEntry).singleSelectable !== false &&
			(card.type !== CardType.BLOCK || !card.activated)
		) {
			const range = editor.change.getRange();
			const root = card.root;
			const parentNode = root.parent()!;
			const index = parentNode
				.children()
				.toArray()
				.findIndex((child) => child.equal(root));
			range.setStart(parentNode, index);
			range.setEnd(parentNode, index + 1);
			editor.change.select(range);
		}
	}

	focus(card: CardInterface, toStart: boolean = false) {
		const editor = this.editor;
		if (!isEngine(editor)) return;
		const { change, container, scrollNode } = editor;
		const range = change.getRange();
		card.focus(range, toStart);
		change.select(range);
		this.activate(range.startNode, ActiveTrigger.MOUSE_DOWN);
		change.onSelect();
		if (scrollNode) range.scrollIntoViewIfNeeded(container, scrollNode);
	}

	insert(name: string, value?: CardValue) {
		if (!isEngine(this.editor)) throw 'Engine not found';
		const component = this.create(name, {
			value,
		});
		const { change } = this.editor;
		const range = change.getSafeRange();
		const card = this.insertNode(range, component);
		const type = component.type;
		if (type === 'inline') {
			card.focus(range, false);
		}
		change.select(range);
		if (
			type === 'block' &&
			(component.constructor as CardEntry).autoActivate !== false
		) {
			this.activate(card.root, ActiveTrigger.INSERT_CARD);
		}
		change.change();
		return card;
	}

	update(selector: NodeInterface | Node | string, value: CardValue) {
		if (!isEngine(this.editor)) return;
		const { change } = this.editor;
		const card = this.find(selector);
		if (card) {
			this.updateNode(card, value);
			const range = change.getRange();
			card.focus(range, false);
			change.change();
		}
	}

	replace(source: CardInterface, name: string, value?: CardValue) {
		this.remove(source.root);
		return this.insert(name, value);
	}

	remove(selector: NodeInterface | Node | string, hasModify: boolean = true) {
		if (!isEngine(this.editor)) return;
		const { change, list, node } = this.editor;
		const range = change.getRange();
		const card = this.find(selector);
		if (!card) return;
		if (card.type === CardType.INLINE) {
			range.setEndAfter(card.root[0]);
			range.collapse(false);
		} else {
			card.focusPrevBlock(range, hasModify);
		}
		const parent = card.root.parent();
		this.removeNode(card);
		list.addBr(range.startNode);
		if (parent && node.isEmpty(parent)) {
			if (parent.isEditable()) {
				node.html(parent, '<p><br /></p>');
				range.select(parent, true);
				range.shrinkToElementNode();
				range.collapse(false);
			} else {
				node.html(parent, '<br />');
				range.select(parent, true);
				range.collapse(false);
			}
		}
		change.apply(range);
	}

	removeRemote(selector: NodeInterface | Node | string) {
		if (!isEngine(this.editor)) return;
		const { node } = this.editor;
		const card = this.find(selector);
		if (!card) return;

		const parent = card.root.parent();
		this.removeNode(card);
		if (parent && node.isEmpty(parent)) {
			if (parent.isEditable()) {
				node.html(parent, '<p><br /></p>');
			} else {
				node.html(parent, '<br />');
			}
		}
	}

	// 创建Card DOM 节点
	create(
		name: string,
		options?: {
			value?: CardValue;
			root?: NodeInterface;
		},
	): CardInterface {
		const clazz = this.classes[name];
		if (!clazz) throw ''.concat(name, ': This card does not exist');
		const type = options?.value?.type || clazz.cardType;
		if (['inline', 'block'].indexOf(type) < 0) {
			throw ''.concat(
				name,
				': the type of card must be "inline", "block"',
			);
		}
		if (options?.root) options.root.empty();
		const component = new clazz({
			editor: this.editor,
			value: options?.value,
			root: options?.root,
		});

		component.root.attributes(CARD_TYPE_KEY, type);
		component.root.attributes(CARD_KEY, name);
		//如果没有指定是否能聚集，那么当card不是只读的时候就可以聚焦
		const hasFocus =
			clazz.focus !== undefined
				? clazz.focus
				: isEngine(this.editor) && !this.editor.readonly;
		const tagName = type === CardType.INLINE ? 'span' : 'div';
		//center
		const center = $(
			`<${tagName} ${
				component.isEditable ? DATA_TRANSIENT_ATTRIBUTES + "='*'" : ''
			}/>`,
		);
		center.attributes(CARD_ELEMENT_KEY, 'center');

		if (hasFocus) {
			center.attributes('contenteditable', 'false');
		} else {
			component.root.attributes('contenteditable', 'false');
		}
		//body
		const body = $(
			'<'.concat(tagName, ' ').concat(CARD_ELEMENT_KEY, '="body" />'),
		);
		//可以聚焦的情况下，card左右两边添加光标位置
		if (hasFocus) {
			//left
			const left = $(
				`<span ${CARD_ELEMENT_KEY}="left" ${DATA_TRANSIENT_ELEMENT}="true">&#8203;</span>`,
			);
			//right
			const right = $(
				`<span ${CARD_ELEMENT_KEY}="right" ${DATA_TRANSIENT_ELEMENT}="true">&#8203;</span>`,
			);
			body.append(left);
			body.append(center);
			body.append(right);
		} else {
			body.append(center);
		}

		component.root.append(body);
		component.init();
		return component;
	}

	reRender(...cards: Array<CardInterface>) {
		if (cards.length === 0) cards = this.components;
		const render = (card: CardInterface) => {
			const result = card.render();
			const center = card.getCenter();
			if (result !== undefined) {
				center.append(typeof result === 'string' ? $(result) : result);
			}
			if (card.contenteditable.length > 0) {
				center.find(card.contenteditable.join(',')).each((node) => {
					const child = $(node);
					child.attributes(
						'contenteditable',
						!isEngine(this.editor) || this.editor.readonly
							? 'false'
							: 'true',
					);
					child.attributes(DATA_ELEMENT, EDITABLE);
				});
			}
			card.didRender();
		};
		cards.forEach((card) => {
			if (card.destroy) card.destroy();
			card.init();
			render(card);
		});
	}

	/**
	 * 渲染
	 * @param container 需要重新渲染包含卡片的节点，如果不传，则渲染全部待创建的卡片节点
	 * @param options 是否异步渲染， 全部异步渲染完成后触发
	 */
	render(
		container?: NodeInterface,
		options?: {
			enableAsync?: boolean;
			triggerOT?: boolean;
			callback?: (count: number) => void;
		},
	) {
		const cards = container
			? container.isCard()
				? container
				: container.find(`${READY_CARD_SELECTOR}`)
			: this.editor.container.find(READY_CARD_SELECTOR);
		this.gc();
		let setp = 0;
		const render = (card: CardInterface) => {
			const result = card.render();
			const center = card.getCenter();
			if (result !== undefined) {
				center.append(typeof result === 'string' ? $(result) : result);
			}
			if (card.contenteditable.length > 0) {
				center.find(card.contenteditable.join(',')).each((node) => {
					const child = $(node);
					if (!child.attributes('contenteditable'))
						child.attributes(
							'contenteditable',
							!isEngine(this.editor) || this.editor.readonly
								? 'false'
								: 'true',
						);
					child.attributes(DATA_ELEMENT, EDITABLE);
				});
				this.render(center, {
					enableAsync: false,
					triggerOT: options?.triggerOT,
				});
			}
			card.didRender();
		};
		const asyncRenderCards: Array<CardInterface> = [];
		const renderedCards: Array<CardInterface> = [];
		cards.each((node) => {
			const cardNode = $(node);
			const readyKey = cardNode.attributes(READY_CARD_KEY);
			const key = cardNode.attributes(CARD_KEY);
			const name = readyKey || key;
			if (this.classes[name]) {
				const value = cardNode.attributes(CARD_VALUE_KEY);
				const attributes = cardNode.attributes();

				let card: CardInterface | undefined;
				if (key) {
					card = this.find(cardNode);
					if (card) {
						if (card.destroy) card.destroy();
						this.removeComponent(card);
					}
				}
				//ready_card_key 待创建的需要重新生成节点，并替换当前待创建节点
				card = this.create(name, {
					value: decodeCardValue(value),
					root: key ? cardNode : undefined,
				});
				if (options && !options.triggerOT) {
					card.root.attributes(CARD_ASYNC_RENDER, 'true');
				}
				Object.keys(attributes).forEach((attributesName) => {
					if (
						attributesName.indexOf('data-') === 0 &&
						attributesName.indexOf('data-card') !== 0
					) {
						card!.root.attributes(
							attributesName,
							attributes[attributesName],
						);
					}
				});
				if (readyKey) cardNode.replaceWith(card.root);
				this.components.push(card);

				// 重新渲染
				if (options?.enableAsync === true) {
					asyncRenderCards.push(card);
				} else {
					render(card);
					renderedCards.push(card);
				}

				if (readyKey) {
					card.root.removeAttributes(READY_CARD_KEY);
				}
			}
		});
		if (!options?.enableAsync) {
			if (!options?.triggerOT) {
				setTimeout(() => {
					renderedCards.forEach((card) => {
						card.root.removeAttributes(CARD_ASYNC_RENDER);
					});
				}, 50);
			}
			if (options?.callback) options.callback(renderedCards.length);
			return;
		}
		if (isEngine(this.editor) && options.triggerOT) {
			this.editor.history.startCache();
		}
		asyncRenderCards.forEach((card) => {
			setTimeout(() => {
				render(card);
				//协同记录后移除标记属性
				if (!options.triggerOT) {
					setTimeout(() => {
						card.root.removeAttributes(CARD_ASYNC_RENDER);
					}, 50);
				}
				setp++;
				if (setp === asyncRenderCards.length) {
					if (isEngine(this.editor) && options.triggerOT) {
						this.editor.history.submitCache();
					}
					if (options.callback)
						options.callback(asyncRenderCards.length);
				}
			}, 20);
		});
		if (asyncRenderCards.length === 0) {
			if (isEngine(this.editor) && options.triggerOT) {
				this.editor.history.submitCache();
			}
			if (options.callback) options.callback(0);
		}
	}

	removeComponent(card: CardInterface): void {
		this.each((c, index) => {
			if (c.root.equal(card.root)) {
				this.components.splice(index!, 1);
				return false;
			}
			return;
		});
	}

	gc() {
		for (let i = 0; i < this.components.length; i++) {
			const component = this.components[i];
			if (
				!component.root[0] ||
				component.root.closest('body').length === 0
			) {
				if (component.destroy) component.destroy();
				this.components.splice(i, 1);
				i--;
			}
		}
	}
}

export default CardModel;
