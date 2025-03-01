import {
	CARD_KEY,
	CARD_SELECTOR,
	CURSOR,
	CURSOR_SELECTOR,
	DATA_ELEMENT,
	READY_CARD_KEY,
	ROOT_SELECTOR,
	UI,
} from '../constants';
import Range from '../range';
import {
	EditorInterface,
	isEngine,
	NodeInterface,
	RangeInterface,
	isNode,
	PluginEntry,
} from '../types';
import {
	BlockInterface,
	BlockModelInterface,
	isBlockPlugin,
} from '../types/block';
import { getDocument, getWindow } from '../utils';
import { Backspace, Enter } from './typing';
import { $, getHashId } from '../node';

class Block implements BlockModelInterface {
	private editor: EditorInterface;

	constructor(editor: EditorInterface) {
		this.editor = editor;
	}

	init() {
		const editor = this.editor;
		if (isEngine(editor)) {
			const { typing, event } = editor;
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

			event.on('keydown:space', (event) => this.triggerMarkdown(event));
		}
	}

	/**
	 * 解析markdown
	 * @param event 事件
	 */
	triggerMarkdown(event: KeyboardEvent) {
		const editor = this.editor;
		if (!isEngine(editor)) return;
		const { change, block } = editor;
		let range = change.getRange();
		if (!range.collapsed || change.isComposing()) return;
		const { startNode, startOffset } = range;
		const node =
			startNode.type === Node.TEXT_NODE
				? startNode
				: startNode.children().eq(startOffset - 1);
		if (!node) return;
		const blockNode = this.closest(node);
		if (!editor.node.isRootBlock(blockNode)) return;
		const text = block.getLeftText(blockNode);
		return !Object.keys(editor.plugin.components).some((pluginName) => {
			const plugin = editor.plugin.components[pluginName];
			if (isBlockPlugin(plugin) && !!plugin.markdown) {
				const reuslt = plugin.markdown(event, text, blockNode, node);
				if (reuslt === false) return true;
			}
			return;
		});
	}
	/**
	 * 根据节点查找block插件实例
	 * @param node 节点
	 */
	findPlugin(block: NodeInterface): BlockInterface | undefined {
		const { node, schema, plugin } = this.editor;
		if (!node.isBlock(block)) return;
		let result: BlockInterface | undefined = undefined;
		Object.keys(plugin.components).some((pluginName) => {
			const blockPlugin = plugin.components[pluginName];
			if (
				isBlockPlugin(blockPlugin) &&
				(!blockPlugin.tagName || typeof blockPlugin.tagName === 'string'
					? block.name === blockPlugin.tagName
					: blockPlugin.tagName.indexOf(block.name) > -1)
			) {
				const schemaRule = blockPlugin.schema();
				if (
					!(Array.isArray(schemaRule)
						? schemaRule.find((rule) =>
								schema.checkNode(block, rule.attributes),
						  )
						: schema.checkNode(block, schemaRule.attributes))
				)
					return;
				result = blockPlugin;
				return true;
			}
			return;
		});
		return result;
	}
	/**
	 * 查找Block节点的一级节点。如 div -> H2 返回 H2节点
	 * @param parentNode 父节点
	 * @param childNode 子节点
	 */
	findTop(parentNode: NodeInterface, childNode: NodeInterface) {
		const { schema, node, list } = this.editor;
		const topParentName = schema.closest(parentNode.name);
		const topChildName = schema.closest(childNode.name);
		//如果父节点没有级别或者子节点没有级别就返回子节点
		if (topParentName === parent.name || topChildName === childNode.name)
			return childNode;
		//如果父节点的级别大于子节点的级别就返回父节点
		if (schema.isAllowIn(parentNode.name, childNode.name))
			return parentNode;
		//如果父节点是 ul、ol 这样的List列表，并且子节点也是这样的列表，设置ident
		if (node.isList(parentNode) && node.isList(childNode)) {
			const childIndent =
				parseInt(childNode.attributes(list.INDENT_KEY), 10) || 0;
			const parentIndent =
				parseInt(parentNode.attributes(list.INDENT_KEY), 10) || 0;
			childNode.attributes(
				list.INDENT_KEY,
				parentIndent ? parentIndent + 1 : childIndent + 1,
			);
		}
		//默认返回子节点
		return childNode;
	}
	/**
	 * 获取最近的block节点，找不到返回 node
	 * @param node 节点
	 */
	closest(node: NodeInterface) {
		const originNode = node;
		while (node) {
			if (node.isEditable() || this.editor.node.isBlock(node)) {
				return node;
			}
			const parentNode = node.parent();
			if (!parentNode) break;
			node = parentNode;
		}
		return originNode;
	}
	/**
	 * 在光标位置包裹一个block节点
	 * @param block 节点
	 * @param range 光标
	 */
	wrap(block: NodeInterface | Node | string, range?: RangeInterface) {
		if (!isEngine(this.editor)) return;
		const { change, node, schema, list, mark } = this.editor;
		const safeRange = range || change.getSafeRange();
		const doc = getDocument(safeRange.startContainer);
		if (typeof block === 'string' || isNode(block)) {
			block = $(block, doc);
		} else block = block;

		if (!node.isBlock(block)) return;

		let blocks: Array<NodeInterface | null> = this.getBlocks(safeRange);
		const targetPlugin = this.findPlugin(block);
		//一样的block插件不嵌套
		blocks = blocks
			.map((blockNode) => {
				if (!blockNode || blockNode.isCard()) return null;
				const wrapBlock = block as NodeInterface;
				let blockParent = blockNode?.parent();
				while (blockParent && !blockParent.isEditable()) {
					blockNode = blockParent;
					const parent = blockParent.parent();
					if (parent && node.isBlock(parent)) {
						blockParent = parent;
					} else break;
				}
				//|| blockParent && !blockParent.equal(blockNode) && !blockParent.isRoot() && node.isBlock(blockParent) && !schema.isAllowIn(wrapBlock.name, blockParent.name)
				if (!schema.isAllowIn(wrapBlock.name, blockNode.name)) {
					//一样的插件，返回子级
					if (this.findPlugin(blockNode) === targetPlugin) {
						return blockNode.children();
					}
					return null;
				}
				return blockNode;
			})
			.filter((block) => block !== null);

		// 不在段落内
		if (blocks.length === 0) {
			const root = this.closest(safeRange.startNode);
			if (
				root.isCard() ||
				root.isEditable() ||
				!schema.isAllowIn(block.name, root.name)
			)
				return;
			const selection = safeRange.createSelection();
			root.children().each((node) => {
				(block as NodeInterface).append(node);
			});
			root.append(block);
			selection.move();
			return;
		}

		const selection = safeRange.createSelection();
		blocks[0]?.before(block);
		blocks.forEach((child) => {
			if (child) {
				//先移除不能放入块级节点的mark标签
				if (targetPlugin) {
					child.allChildren().forEach((child) => {
						const markNode = $(child);
						if (node.isMark(markNode)) {
							const markPlugin = mark.findPlugin(markNode);
							if (!markPlugin) return;
							if (
								targetPlugin.disableMark?.indexOf(
									(markPlugin.constructor as PluginEntry)
										.pluginName,
								)
							) {
								node.unwrap(markNode);
							}
						}
					});
				}
				(block as NodeInterface).append(child);
			}
		});
		selection.move();
		this.merge(safeRange);
		list.merge(undefined, safeRange);
		if (!range) change.apply(safeRange);
	}
	/**
	 * 移除光标所在block节点包裹
	 * @param block 节点
	 * @param range 光标
	 */
	unwrap(block: NodeInterface | Node | string, range?: RangeInterface) {
		if (!isEngine(this.editor)) return;
		const { change, node } = this.editor;
		const safeRange = range || change.getSafeRange();
		const doc = getDocument(safeRange.startContainer);
		if (typeof block === 'string' || isNode(block)) {
			block = $(block, doc);
		} else block = block;

		if (!node.isBlock(block)) return;
		const blocks = this.getSiblings(safeRange, block);
		if (blocks.length === 0) {
			return;
		}

		const firstNodeParent = blocks[0].node.parent();
		if (!firstNodeParent?.inEditor()) {
			return;
		}
		const hasLeft = blocks.some((item) => item.position === 'left');
		const hasRight = blocks.some((item) => item.position === 'right');
		let leftParent: NodeInterface | undefined = undefined;

		if (hasLeft) {
			const parent = firstNodeParent;
			leftParent = node.clone(parent, false);
			parent.before(leftParent);
		}

		let rightParent: NodeInterface | undefined = undefined;
		if (hasRight) {
			const _parent = blocks[blocks.length - 1].node.parent();
			if (_parent) {
				rightParent = node.clone(_parent, false);
				_parent?.after(rightParent);
			}
		}

		// 插入范围的开始和结束标记
		const selection = safeRange.createSelection();
		const nodeApi = node;
		blocks.forEach((item) => {
			const status = item.position,
				node = item.node,
				parent = node.parent();

			if (status === 'left') {
				leftParent?.append(node);
			}

			if (status === 'center') {
				if (
					parent?.name === (block as NodeInterface)?.name &&
					parent?.inEditor()
				) {
					nodeApi.unwrap(parent);
				}
			}

			if (status === 'right') {
				rightParent?.append(node);
			}
		});
		// 有序列表被从中间拆开后，剩余的两个部分的需要保持序号连续
		if (
			leftParent &&
			leftParent.name === 'ol' &&
			rightParent &&
			rightParent.name === 'ol'
		) {
			rightParent.attributes(
				'start',
				(parseInt(leftParent.attributes('start'), 10) || 1) +
					leftParent.find('li').length,
			);
		}
		selection.move();
		if (!range) change.apply(safeRange);
	}

	/**
	 * 获取节点相对于光标开始位置、结束位置下的兄弟节点集合
	 * @param range 光标
	 * @param block 节点
	 */
	getSiblings(range: RangeInterface, block: NodeInterface) {
		const blocks: Array<{
			node: NodeInterface;
			position: 'left' | 'center' | 'right';
		}> = [];
		const nodeApi = this.editor.node;
		if (!nodeApi.isBlock(block)) return blocks;
		const getTargetBlock = (node: NodeInterface, tagName: string) => {
			let block = this.closest(node);
			while (block) {
				const parent = block.parent();
				if (!parent) break;
				if (!block.inEditor()) break;
				if (block.text().trim() !== parent.text().trim()) break;
				if (parent.name === tagName) break;
				block = parent;
			}

			return block;
		};
		const startBlock = getTargetBlock(range.startNode, block.name);
		const endBlock = getTargetBlock(range.endNode, block.name);
		const parentBlock = startBlock.parent();
		let position: 'left' | 'center' | 'right' = 'left';
		let node = parentBlock?.first();

		while (node) {
			node = $(node);
			if (!nodeApi.isBlock(node)) return blocks;
			// 超过编辑区域
			if (!node.inEditor()) return blocks;

			if (node[0] === startBlock[0]) {
				position = 'center';
			}

			blocks.push({
				position,
				node,
			});

			if (node[0] === endBlock[0]) {
				position = 'right';
			}
			node = node.next();
		}
		return blocks;
	}
	/**
	 * 分割当前光标选中的block节点
	 * @param range 光标
	 */
	split(range?: RangeInterface) {
		if (!isEngine(this.editor)) return;
		const { change, mark } = this.editor;
		const safeRange = range || change.getSafeRange();
		// 范围为展开状态时先删除内容
		if (!safeRange.collapsed) {
			change.deleteContent(safeRange);
		}
		// 获取上面第一个 Block
		const block = this.closest(safeRange.startNode);
		// 获取的 block 超出编辑范围
		if (!block.isEditable() && !block.inEditor()) {
			return;
		}

		if (block.isEditable()) {
			// <p>wo</p><cursor /><p>other</p>
			// to
			// <p>wo</p><p><cursor />other</p>
			const sc =
				safeRange.startContainer.childNodes[safeRange.startOffset];
			if (sc) {
				safeRange.select(sc, true).shrinkToElementNode().collapse(true);
			}
			if (!range) change.apply(safeRange);
			return;
		}
		const cloneRange = safeRange.cloneRange();
		cloneRange.shrinkToElementNode().shrinkToTextNode().collapse(true);
		const activeMarks = mark.findMarks(cloneRange).filter((mark) => {
			// 回车后，默认是否复制makr样式
			const plugin = this.editor.mark.findPlugin(mark);
			return (
				plugin?.copyOnEnter !== false && plugin?.followStyle !== false
			);
		});

		const sideBlock = this.createSide({
			block: block[0],
			range: safeRange,
			isLeft: false,
			keepID: true,
		});
		const nodeApi = this.editor.node;
		sideBlock.traverse((node) => {
			if (
				!nodeApi.isVoid(node) &&
				(nodeApi.isInline(node) || nodeApi.isMark(node)) &&
				nodeApi.isEmpty(node)
			) {
				node.remove();
			}
		}, true);
		const isEmptyElement = (node: Node) => {
			return (
				nodeApi.isBlock(node) &&
				(node.childNodes.length === 0 ||
					(node as HTMLElement).innerText === '')
			);
		};
		if (isEmptyElement(block[0]) && !isEmptyElement(sideBlock[0])) {
			this.generateRandomID(block, true);
		} else {
			this.generateRandomID(sideBlock, true);
		}
		block.after(sideBlock);
		// Chrome 不能选中 <p></p>，里面必须要有节点，插入 BR 之后输入文字自动消失
		if (nodeApi.isEmpty(block)) {
			nodeApi.html(
				block,
				nodeApi.getBatchAppendHTML(activeMarks, '<br />'),
			);
		}

		if (nodeApi.isEmpty(sideBlock)) {
			nodeApi.html(
				sideBlock,
				nodeApi.getBatchAppendHTML(activeMarks, '<br />'),
			);
		}
		block.children().each((child) => {
			if (nodeApi.isInline(child)) {
				this.editor.inline.repairCursor(child);
			}
		});
		sideBlock.children().each((child) => {
			if (nodeApi.isInline(child)) {
				this.editor.inline.repairCursor(child);
			}
		});
		// 重新设置当前选中范围
		safeRange.select(sideBlock, true).shrinkToElementNode();

		if (
			sideBlock.children().length === 1 &&
			sideBlock.first()?.name === 'br'
		) {
			safeRange.collapse(false);
		} else {
			safeRange.collapse(true);
		}

		if (!range) change.apply(safeRange);
	}
	/**
	 * 在当前光标位置插入block节点
	 * @param block 节点
	 * @param range 光标
	 * @param splitNode 分割节点，默认为光标开始位置的block节点
	 */
	insert(
		block: NodeInterface | Node | string,
		range?: RangeInterface,
		splitNode?: (node: NodeInterface) => NodeInterface,
	) {
		if (!isEngine(this.editor)) return;
		const { change, node, list } = this.editor;
		const safeRange = range || change.getSafeRange();
		const doc = getDocument(safeRange.startContainer);
		if (typeof block === 'string' || isNode(block)) {
			block = $(block, doc);
		} else block = block;

		if (!node.isBlock(block)) return;

		// 范围为折叠状态时先删除内容
		if (!safeRange.collapsed) {
			change.deleteContent(safeRange);
		}

		// 获取上面第一个 Block
		let container = this.closest(safeRange.startNode);
		// 超出编辑范围
		if (!container.isEditable() && !container.inEditor()) {
			if (!range) change.apply(safeRange);
			return;
		}
		// 当前选择范围在段落外面
		if (container.isEditable()) {
			node.insert(block, safeRange);
			safeRange.collapse(false);
			if (!range) change.apply(safeRange);
			return;
		}
		// <p><cursor /><br /></p>
		// to
		// <p><br /><cursor /></p>
		if (
			container.children().length === 1 &&
			container.first()?.name === 'br'
		) {
			safeRange.select(container, true).collapse(false);
		}
		// 插入范围的开始和结束标记
		const selection = safeRange.enlargeToElementNode().createSelection();
		if (!selection.has()) {
			if (!range) change.apply(safeRange);
			return;
		}
		container = splitNode ? splitNode(container) : container;
		// 切割 Block
		let leftNodes = selection.getNode(container, 'left');
		leftNodes.allChildren().forEach((child) => {
			const leftNode = $(child);
			if (
				node.isBlock(leftNode) &&
				(node.isEmpty(leftNode) || list.isEmptyItem(leftNode))
			) {
				leftNode.remove();
			}
		});
		let rightNodes = selection.getNode(
			container,
			'right',
			true,
			(child) => {
				if (child.isCard()) {
					const parent = child.parent();
					if (parent && node.isCustomize(parent)) return false;
				}
				return true;
			},
		);
		// 清空原父容器，用新的内容代替
		const children = container.children();
		children.each((_, index) => {
			if (!children.eq(index)?.isCard()) {
				children.eq(index)?.remove();
			}
		});
		rightNodes.allChildren().forEach((child) => {
			const rightNode = $(child);
			if (
				node.isBlock(rightNode) &&
				(node.isEmpty(rightNode) || list.isEmptyItem(rightNode))
			) {
				rightNode.remove();
			} else if (node.isList(rightNode)) {
				list.addBr(rightNode);
			}
		});
		if (
			rightNodes.length > 0 &&
			!node.isEmpty(rightNodes) &&
			!list.isEmptyItem(rightNodes)
		) {
			const right = rightNodes.clone(false);
			const rightChildren = rightNodes.children();
			rightChildren.each((child, index) => {
				if (rightChildren.eq(index)?.isCard()) {
					const card = this.editor.card.find(child);
					if (card) right.append(card.root);
				} else right.append(child);
			});
			rightNodes = right;
			container.after(right);
		}
		if (
			leftNodes.length > 0 &&
			!node.isEmpty(leftNodes) &&
			!list.isEmptyItem(leftNodes)
		) {
			let appendChild: NodeInterface | undefined | null = undefined;
			const appendToParent = (childrenNodes: NodeInterface) => {
				childrenNodes.each((child, index) => {
					if (childrenNodes.eq(index)?.isCard()) {
						appendChild = appendChild
							? appendChild.next()
							: container.first();
						if (appendChild) childrenNodes[index] = appendChild[0];
						return;
					}
					if (appendChild) {
						appendChild.after(child);
						appendChild = childrenNodes.eq(index);
					} else {
						appendChild = childrenNodes.eq(index);
						container.prepend(child);
					}
				});
			};
			appendToParent(leftNodes.children());
		}

		if (container && container.length > 0) {
			safeRange.setStartAfter(container);
			safeRange.collapse(true);
		}
		if (selection.focus) selection.focus.remove();
		if (selection.anchor) selection.anchor.remove();
		// 插入新 Block
		node.insert(block, safeRange);
		if (!range) change.apply(safeRange);
	}
	/**
	 * 设置当前光标所在的所有block节点为新的节点或设置新属性
	 * @param block 需要设置的节点或者节点属性
	 * @param range 光标
	 */
	setBlocks(block: string | { [k: string]: any }, range?: RangeInterface) {
		if (!isEngine(this.editor)) return;
		const { node, schema, mark } = this.editor;
		const { change } = this.editor;
		const safeRange = range || change.getSafeRange();
		const doc = getDocument(safeRange.startContainer);
		let targetNode: NodeInterface | null = null;
		let attributes: { [k: string]: any } = {};
		if (typeof block === 'string') {
			targetNode = $(block, doc);
			attributes = targetNode.attributes();
			attributes.style = targetNode.css();
		} else {
			attributes = block;
		}

		const blocks = this.getBlocks(safeRange);
		// 编辑器根节点，无段落
		const { startNode } = safeRange;
		if (startNode.isEditable() && blocks.length === 0) {
			if (startNode.isCard() || startNode.isEditable()) return;
			const newBlock = targetNode || $('<p></p>');
			if (!schema.isAllowIn(newBlock.name, startNode.name)) return;

			node.setAttributes(newBlock, attributes);

			const selection = safeRange.createSelection();

			startNode.children().each((node) => {
				newBlock.append(node);
			});

			startNode.append(newBlock);
			selection.move();
			if (!range) change.apply(safeRange);
			return;
		}
		const targetPlugin = targetNode
			? this.findPlugin(targetNode)
			: undefined;
		const selection = safeRange.createSelection();
		blocks.forEach((child) => {
			// Card 不做处理
			if (child.attributes(CARD_KEY)) {
				return;
			}
			// 相同标签，或者只传入样式属性
			if (
				!targetNode ||
				(this.findPlugin(child) === targetPlugin &&
					child.name === targetNode.name)
			) {
				node.setAttributes(child, attributes);
				return;
			}
			//如果要包裹的节点可以放入到当前节点中，就不操作
			if (
				targetNode.name !== 'p' &&
				schema.isAllowIn(child.name, targetNode.name)
			) {
				return;
			}
			//先移除不能放入块级节点的mark标签
			if (targetPlugin) {
				child.allChildren().forEach((child) => {
					const markNode = $(child);
					if (node.isMark(markNode)) {
						const markPlugin = mark.findPlugin(markNode);
						if (!markPlugin) return;
						if (
							targetPlugin.disableMark?.indexOf(
								(markPlugin.constructor as PluginEntry)
									.pluginName,
							)
						) {
							node.unwrap(markNode);
						}
					}
				});
			}
			const newNode = node.replace(child, targetNode);
			const parent = newNode.parent();
			if (
				parent &&
				!parent.isEditable() &&
				!schema.isAllowIn(parent.name, newNode.name)
			) {
				node.unwrap(parent);
			}
		});
		selection.move();
		if (!range) change.apply(safeRange);
	}
	/**
	 * 合并当前光标位置相邻的block
	 * @param range 光标
	 */
	merge(range?: RangeInterface) {
		if (!isEngine(this.editor)) return;
		const { change, schema } = this.editor;
		const safeRange = range || change.getSafeRange();
		const blocks = this.getBlocks(safeRange);
		if (0 === blocks.length) return;
		const root = blocks[0].closest(ROOT_SELECTOR);
		const tags = schema.getCanMergeTags();
		if (tags.length === 0) return;
		const block = root.find(tags.join(','));
		if (block.length > 0) {
			const selection = safeRange.createSelection();
			let nextNode = block.next();
			while (nextNode && tags.indexOf(nextNode.name) > 0) {
				const prevNode = nextNode.prev();
				const nextAttributes = nextNode.attributes();
				const prevAttributes = prevNode?.attributes();
				if (
					nextNode.name === prevNode?.name &&
					nextAttributes['class'] ===
						(prevAttributes
							? prevAttributes['class']
							: undefined) &&
					Object.keys(nextAttributes).join(',') ===
						Object.keys(prevAttributes || {}).join(',')
				) {
					this.editor.node.merge(prevNode, nextNode);
				}
				nextNode = nextNode.next();
			}
			selection.move();
		}
		if (!range) change.apply(safeRange);
	}

	/**
	 * 获取对范围有效果的所有 Block
	 */
	findBlocks(range: RangeInterface) {
		range = range.cloneRange();
		if (!range.startNode.inEditor()) return [];
		if (range.startNode.isRoot()) range.shrinkToElementNode();
		const sc = range.startContainer;
		const so = range.startOffset;
		const ec = range.endContainer;
		const eo = range.endOffset;
		let startNode = sc;
		let endNode = ec;

		if (sc.nodeType === getWindow().Node.ELEMENT_NODE) {
			if (sc.childNodes[so]) {
				startNode = sc.childNodes[so] || sc;
			}
		}

		if (ec.nodeType === getWindow().Node.ELEMENT_NODE) {
			if (eo > 0 && ec.childNodes[eo - 1]) {
				endNode = ec.childNodes[eo - 1] || sc;
			}
		}
		// 折叠状态时，按右侧位置的方式处理
		if (range.collapsed) {
			startNode = endNode;
		}
		// 不存在时添加
		const addNode = (
			nodes: Array<NodeInterface>,
			nodeB: NodeInterface,
			preppend?: boolean,
		) => {
			if (
				!nodes.some((nodeA) => {
					return nodeA[0] === nodeB[0];
				})
			) {
				if (preppend) {
					nodes.unshift(nodeB);
				} else {
					nodes.push(nodeB);
				}
			}
		};
		// 向上寻找
		const findNodes = (node: NodeInterface) => {
			const nodes = [];
			while (node) {
				if (node.isEditable()) {
					break;
				}
				if (this.editor.node.isBlock(node)) {
					nodes.push(node);
				}
				const parent = node.parent();
				if (!parent) break;
				node = parent;
			}
			return nodes;
		};

		const nodes = this.getBlocks(range);
		// rang头部应该往数组头部插入节点
		findNodes($(startNode)).forEach((node) => {
			return addNode(nodes, node, true);
		});
		const { commonAncestorNode } = range;
		const card = this.editor.card.find(commonAncestorNode, true);
		let isEditable = card?.isEditable;
		const selectionNodes = isEditable
			? card?.getSelectionNodes
				? card.getSelectionNodes()
				: []
			: [];
		if (selectionNodes.length === 0) {
			isEditable = false;
		}
		if (!range.collapsed || isEditable) {
			findNodes($(endNode)).forEach((node) => {
				return addNode(nodes, node);
			});
			selectionNodes.forEach((commonAncestorNode) => {
				commonAncestorNode.traverse(
					(child) => {
						if (
							child.isElement() &&
							!child.isCard() &&
							this.editor.node.isBlock(child)
						) {
							addNode(nodes, child);
						}
					},
					true,
					true,
				);
			});
		}
		return nodes;
	}

	/**
	 * 判断范围的 {Edge}Offset 是否在 Block 的开始位置
	 * @param range 光标
	 * @param edge start ｜ end
	 */
	isFirstOffset(range: RangeInterface, edge: 'start' | 'end') {
		const { startNode, endNode, startOffset, endOffset } = range;
		const container = edge === 'start' ? startNode : endNode;
		const offset = edge === 'start' ? startOffset : endOffset;
		range = range.cloneRange();
		const block = this.closest(container);
		range.select(block, true);
		range.setEnd(container[0], offset);
		const fragment = range.cloneContents();

		if (!fragment.firstChild) {
			return true;
		}
		const { node } = this.editor;
		if (
			fragment.childNodes.length === 1 &&
			$(fragment.firstChild).name === 'br'
		) {
			return true;
		}

		const emptyNode = $('<div />');
		emptyNode.append(fragment);
		return node.isEmpty(emptyNode);
	}

	/**
	 * 判断范围的 {Edge}Offset 是否在 Block 的最后位置
	 * @param range 光标
	 * @param edge start ｜ end
	 */
	isLastOffset(range: RangeInterface, edge: 'start' | 'end') {
		const { startNode, endNode, startOffset, endOffset } = range;
		const container = edge === 'start' ? startNode : endNode;
		const offset = edge === 'start' ? startOffset : endOffset;
		range = range.cloneRange();
		const block = this.closest(container);
		range.select(block, true);
		range.setStart(container, offset);
		const fragment = range.cloneContents();

		if (!fragment.firstChild) {
			return true;
		}
		const { node } = this.editor;
		const emptyNode = $('<div />');
		emptyNode.append(fragment);

		return 0 >= emptyNode.find('br').length && node.isEmpty(emptyNode);
	}

	/**
	 * 获取范围内的所有 Block
	 * @param range  光标s
	 */
	getBlocks(range: RangeInterface) {
		range = range.cloneRange();
		range.shrinkToElementNode();
		range.shrinkToTextNode();

		const { node } = this.editor;

		let startBlock = this.closest(range.startNode);
		if (range.startNode.isRoot()) {
			startBlock = $(range.getStartOffsetNode());
		}
		let endBlock = this.closest(range.endNode);
		if (range.endNode.isRoot()) {
			endBlock = $(range.getEndOffsetNode());
		}

		const closest = this.closest(range.commonAncestorNode);
		const blocks: Array<NodeInterface> = [];
		let started = false;
		const { commonAncestorNode } = range;
		const card = this.editor.card.find(commonAncestorNode, true);
		let isEditable = card?.isEditable;
		const selectionNodes = isEditable
			? card?.getSelectionNodes
				? card.getSelectionNodes()
				: []
			: [closest];
		if (selectionNodes.length === 0) {
			isEditable = false;
			selectionNodes.push(closest);
		}
		selectionNodes.forEach((selectionNode) => {
			selectionNode.traverse(
				(node) => {
					const child = $(node);
					if (child.equal(startBlock)) {
						started = true;
					}
					if (
						(started || isEditable) &&
						this.editor.node.isBlock(child) &&
						!child.isCard() &&
						child.inEditor()
					) {
						blocks.push(child);
					}
					if (child.equal(endBlock)) {
						started = false;
						return false;
					}
					return;
				},
				true,
				true,
			);
		});

		// 未选中文本时忽略该 Block
		// 示例：<h3><anchor />word</h3><p><focus />another</p>
		if (
			blocks.length > 1 &&
			this.isFirstOffset(range, 'end') &&
			!node.isEmpty(endBlock)
		) {
			blocks.pop();
		}
		return blocks;
	}

	/**
	 * 生成 cursor 左侧或右侧的节点，放在一个和父节点一样的容器里
	 * isLeft = true：左侧
	 * isLeft = false：右侧
	 * @param param0
	 */
	createSide({
		block,
		range,
		isLeft,
		clone = false,
		keepID = false,
	}: {
		block: NodeInterface | Node;
		range: RangeInterface;
		isLeft: boolean;
		clone?: boolean;
		keepID?: boolean;
	}) {
		if (isNode(block)) block = $(block);
		const newRange = Range.create(this.editor, block.document!);

		if (isLeft) {
			newRange.select(block, true);
			newRange.setEnd(range.startContainer, range.startOffset);
		} else {
			newRange.select(block, true);
			newRange.setStart(range.endContainer, range.endOffset);
		}

		const fragement = clone
			? newRange.cloneContents()
			: newRange.extractContents();
		const dupBlock = keepID
			? block.clone(false)
			: this.editor.node.clone(block, false);
		dupBlock.append(fragement);
		if (clone) {
			dupBlock.find(CARD_SELECTOR).each((card) => {
				const domCard = $(card);
				const cardName = domCard.attributes(CARD_KEY);
				domCard.attributes(READY_CARD_KEY, cardName);
				domCard.removeAttributes(CARD_KEY);
			});
		}
		return dupBlock;
	}

	/**
	 * 获取 Block 左侧文本
	 * @param block 节点
	 */
	getLeftText(block: NodeInterface | Node, range?: RangeInterface) {
		if (!isEngine(this.editor)) return '';
		range = range || this.editor.change.getRange();
		const leftBlock = this.createSide({
			block,
			range,
			isLeft: true,
			clone: true,
		});
		return leftBlock
			.text()
			.trim()
			.replace(/\u200B/g, '');
	}

	/**
	 * 删除 Block 左侧文本
	 * @param block 节点
	 */
	removeLeftText(block: NodeInterface | Node, range?: RangeInterface) {
		if (!isEngine(this.editor)) return;
		range = range || this.editor.change.getRange();
		if (isNode(block)) block = $(block);
		range.createSelection();
		const cursor = block.find(CURSOR_SELECTOR);
		let isRemove = false;
		// 删除左侧文本节点
		block.traverse((node) => {
			const child = $(node);
			if (child.equal(cursor)) {
				cursor.remove();
				isRemove = true;
				return;
			}
			if (isRemove && child.isText()) {
				child.remove();
			}
		}, false);
	}

	/**
	 * 整理块级节点
	 * @param domNode 节点
	 * @param root 根节点
	 */
	flatten(domNode: NodeInterface, root: NodeInterface) {
		if (!isEngine(this.editor)) return;
		const { schema, node } = this.editor;
		const mergeTags = schema.getCanMergeTags();
		//获取父级节点
		let parentNode = domNode[0].parentNode;
		const rootElement = root.fragment ? root[0].parentNode : root[0];
		//在根节点内循环
		while (parentNode !== rootElement) {
			const domParentNode = $(parentNode || []);
			//如果是卡片节点，就在父节点前面插入
			if (domNode.isCard()) domParentNode.before(domNode);
			else if (
				//如果是li标签，并且父级是 ol、ul 列表标签
				(node.isList(domParentNode) && 'li' === domNode.name) ||
				//如果是父级可合并标签，并且当前节点是根block节点，并且不是 父节点一样的block节点
				(mergeTags.indexOf(domParentNode.name) > -1 &&
					node.isBlock(domNode) &&
					domParentNode.name !== domNode.name)
			) {
				//复制节点
				const cloneNode = node.clone(domParentNode, false);
				//追加到复制的节点
				cloneNode.append(domNode);
				//设置新的节点
				domNode = cloneNode;
				//将新的节点插入到父节点之前
				domParentNode.before(domNode);
			} else {
				domNode = node.replace(
					domNode,
					node.clone(this.findTop(domParentNode, domNode), false),
				);
				domParentNode.before(domNode);
			}
			//如果没有子节点就移除
			if (!domParentNode.first()) domParentNode.remove();
			//设置新的父节点
			parentNode = domNode[0].parentNode;
		}
	}

	/**
	 * 根据规则获取需要为节点创建 data-id 的标签名称集合
	 * @returns
	 */
	getMarkIdTags() {
		const names: Array<string> = [];
		this.editor.schema.data.blocks.forEach((schema) => {
			if (names.indexOf(schema.name) < 0) {
				names.push(schema.name);
			}
		});
		return names;
	}
	/**
	 * 给节点创建data-id
	 * @param node 节点
	 * @returns
	 */
	createDataID(node: Node | NodeInterface) {
		if (isNode(node)) node = $(node);
		const id = getHashId(node);
		node.attributes('data-id', id);
		return id;
	}
	/**
	 * 获取或产生节点的data-id
	 * @param root 根节点
	 * @param node 节点
	 * @returns
	 */
	generateDataID(root: Element, node: HTMLElement): string | null {
		const { nodeName } = node;
		const id = node.getAttribute('data-id');
		if (id) return id;
		const nodes = root.querySelectorAll(nodeName);
		for (let i = 0; i < nodes.length; i++) {
			if (nodes[i] === node) return this.createDataID(node);
		}
		return null;
	}
	/**
	 * 在根节点内为需要创建data-id的子节点创建data-id
	 * @param root 根节点
	 */
	generateDataIDForDescendant(root: Element) {
		const tags = this.getMarkIdTags().join(',');
		const nodes = root.querySelectorAll(tags);
		nodes.forEach((child) => {
			const node = $(child);
			if (
				!node.attributes('data-id') &&
				!node.isCard() &&
				node.attributes(DATA_ELEMENT) !== UI
			)
				this.createDataID(node);
		});
	}
	/**
	 * 为节点创建一个随机data-id
	 * @param node 节点
	 * @param isCreate 如果有，是否需要重新创建
	 * @returns
	 */
	generateRandomID(node: Node | NodeInterface, isCreate: boolean = false) {
		if (isNode(node)) node = $(node);
		if (node.isCard() || node.attributes(DATA_ELEMENT) === UI) return '';
		if (!isCreate) {
			const id = node.attributes('data-id');
			if (id) return id;
		}
		const id = getHashId(node);
		node.attributes('data-id', id);
		return id;
	}
	/**
	 * 在根节点内为需要创建data-id的子节点创建随机data-id
	 * @param node 节点
	 * @param isCreate 如果有，是否需要重新创建
	 */
	generateRandomIDForDescendant(root: Node, isCreate: boolean = false) {
		if (
			root.nodeType === getWindow().Node.ELEMENT_NODE ||
			root.nodeType === getWindow().Node.DOCUMENT_FRAGMENT_NODE
		) {
			this.getMarkIdTags().forEach((nodeName) => {
				const nodes = (
					root as Element | DocumentFragment
				).querySelectorAll(nodeName);
				for (let i = 0; i < nodes.length; i++) {
					const node = $(nodes[i]);
					if (node.isCard() || node.attributes(DATA_ELEMENT) === UI)
						continue;
					this.generateRandomID(node, isCreate);
				}
			});
		}
	}
	/**
	 * 判断一个节点是否需要创建data-id
	 * @param name 节点名称
	 * @returns
	 */
	needMarkDataID(name: string) {
		return !!this.getMarkIdTags()[name.toLowerCase()];
	}

	/**
	 * br 换行改成段落
	 * @param block 节点
	 */
	brToBlock(block: NodeInterface) {
		// 没有子节点
		if (!block.first()) {
			return;
		}
		// 只有一个节点
		if (block.children().length === 1) {
			const node = block.first();
			//\n换成 br
			if (node && node.isText() && /^\n+$/g.test(node.text())) {
				this.editor.node.replace(node, $('<br />'));
			}
			return;
		}
		if ('li' === block.name) return;
		// 只有一个节点（有光标标记节点）
		if (
			(block.children().length === 2 &&
				block.first()?.attributes(DATA_ELEMENT) === CURSOR) ||
			block.last()?.attributes(DATA_ELEMENT) === CURSOR
		) {
			return;
		}

		let container;
		let prevContainer;
		let node = block.first();
		while (node) {
			const next = node.next();
			if (!container || node.name === 'br') {
				prevContainer = container;
				container = this.editor.node.clone(block, false);
				block.before(container);
			}
			if (node.name !== 'br') {
				container.append(node);
			}
			if (
				(node.name === 'br' || !next) &&
				prevContainer &&
				!prevContainer.first()
			) {
				prevContainer.append($('<br />'));
			}
			node = next;
		}

		if (container && !container.first()) {
			container.remove();
		}
		block.remove();
	}

	/**
	 * 插入一个空的block节点
	 * @param range 光标所在位置
	 * @param block 节点
	 * @returns
	 */
	insertEmptyBlock(range: RangeInterface, block: NodeInterface) {
		const editor = this.editor;
		if (!isEngine(editor)) return;
		const { change } = editor;
		const { blocks, marks } = change;
		const nodeApi = editor.node;
		this.insert(block);
		if (blocks[0]) {
			const styles = blocks[0].css();
			block.css(styles);
		}
		let node = block.find('br');
		marks.forEach((mark) => {
			// 回车后，默认是否复制makr样式
			const plugin = editor.mark.findPlugin(mark);
			mark = nodeApi.clone(mark);
			//插件判断
			if (
				plugin?.copyOnEnter !== false &&
				plugin?.followStyle !== false
			) {
				mark = nodeApi.clone(mark);
				node.before(mark);
				mark.append(node);
				node = mark;
			}
		});
		node = block.find('br');
		const parent = node.parent();
		if (parent && nodeApi.isMark(parent)) {
			node = nodeApi.replace(node, $('\u200b', null));
		}
		range.select(node);
		range.collapse(false);
		range.scrollIntoView();
		change.select(range);
	}
	/**
	 * 在光标位置插入或分割节点
	 * @param range 光标所在位置
	 * @param block 节点
	 */
	insertOrSplit(range: RangeInterface, block: NodeInterface) {
		const cloneRange = range.cloneRange();
		cloneRange.enlargeFromTextNode();
		if (
			this.isLastOffset(range, 'end') ||
			(cloneRange.endNode.type === getWindow().Node.ELEMENT_NODE &&
				block.children().length > 0 &&
				cloneRange.endContainer.childNodes[cloneRange.endOffset] ===
					block.last()?.get() &&
				'br' === block.first()?.name)
		) {
			if (block.name === 'p' && block.get<HTMLElement>()?.className) {
				this.insertEmptyBlock(
					range,
					$(
						`<p class="${
							block.get<HTMLElement>()?.className
						}"><br /></p>`,
					),
				);
			} else {
				this.insertEmptyBlock(range, $(`<p><br /></p>`));
			}
		} else {
			this.split();
		}
	}
}
export default Block;
