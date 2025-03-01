import { EngineInterface } from '../../types';

class Backspace {
	private engine: EngineInterface;
	constructor(engine: EngineInterface) {
		this.engine = engine;
	}
	/**
	 * 列表删除事件
	 * @param e 事件
	 * @param isDeepMerge 是否深度合并
	 */
	trigger(event: KeyboardEvent, isDeepMerge?: boolean) {
		const { change, command, list, node } = this.engine;
		let range = change.getRange();
		const blockApi = this.engine.block;
		if (range.collapsed) {
			const block = blockApi.closest(range.startNode);
			if ('li' === block.name && list.isFirst(range)) {
				// 内容已经删除过了
				if (event['isDelete']) return false;
				event.preventDefault();
				command.execute(list.getPluginNameByNode(block));
				return false;
			}
		} else {
			const { startNode, endNode } = range;
			const startBlock = blockApi.closest(startNode);
			const endBlock = blockApi.closest(endNode);
			if ('li' === startBlock.name || 'li' === endBlock.name) {
				event.preventDefault();

				const cloneRange = range.cloneRange();
				// 自定义任务列表，开头位置的卡片让其不选中
				const firstChilde = startNode.first();
				const customeCard = startNode.isCard()
					? startNode
					: firstChilde;
				if (customeCard?.isCard()) {
					if (list.isEmptyItem(startBlock)) {
						const parent = startBlock.parent();
						startBlock.remove();
						if (
							parent &&
							node.isCustomize(parent) &&
							parent.children().length === 0
						) {
							parent.remove();
						}
					}
				}
				change.deleteContent(cloneRange, isDeepMerge);
				// 光标在列表的最后一行，并且开始光标不在最后一行
				if (
					!startBlock.equal(endBlock) &&
					endBlock.inEditor() &&
					'li' === endBlock.name
				) {
					cloneRange.shrinkToElementNode().shrinkToTextNode();
					const selection = cloneRange.createSelection();
					startBlock.append(endBlock.children());
					const parent = endBlock.parent();
					endBlock.remove();
					if (
						parent &&
						node.isList(parent) &&
						parent.children().length === 0
					) {
						parent.remove();
					}
					selection.move();
				}
				if ('li' === startBlock.name) {
					const parent = startBlock.parent();
					if (
						node.isCustomize(startBlock) &&
						startBlock.children().length === 0
					)
						startBlock.remove();
					if (
						parent &&
						node.isList(parent) &&
						parent.children().length === 0
					) {
						parent.remove();
					}
				}
				list.addBr(startBlock);
				list.addBr(endBlock);
				range.setStart(
					cloneRange.startContainer,
					cloneRange.startOffset,
				);
				range.collapse(true);
				list.merge();
				if (change.isEmpty()) {
					change.initValue(range);
				}
				change.apply(range);
				return false;
			}
		}
		if (!blockApi.isFirstOffset(range, 'start')) return;
		let block = blockApi.closest(range.startNode);
		// 在列表里
		if (['ul', 'ol'].indexOf(block.name) >= 0) {
			// 矫正这种情况，<ul><cursor /><li>foo</li></ul>
			const li = block.first();

			if (!li || li.isText()) {
				// <ul><cursor />foo</ul>
				event.preventDefault();
				change.mergeAfterDeletePrevNode(block);
				return false;
			} else {
				block = li;
				range.setStart(block[0], 0);
				range.collapse(true);
				change.select(range);
			}
		}

		if (block.name === 'li') {
			if (node.isCustomize(block)) {
				return;
			}

			event.preventDefault();
			const listRoot = block.closest('ul');

			if (block.parent()?.isEditable()) {
				// <p>foo</p><li><cursor />bar</li>
				change.mergeAfterDeletePrevNode(block);
				return false;
			}

			if (listRoot.length > 0) {
				command.execute(list.getPluginNameByNode(listRoot));
			} else {
				// <p><li><cursor />foo</li></p>
				change.unwrapNode(block);
			}

			return false;
		}
		return true;
	}
}

export default Backspace;
