import { ConversionData } from './conversion';
import { EditorInterface } from './engine';
import { NodeInterface } from './node';
import { SchemaGlobal, SchemaRule, SchemaValue } from './schema';

export type PluginOptions = {
	/**
	 * 是否禁用，默认不禁用。在默认不指定的情况下，编辑器为 readonly 的时候全部禁用
	 */
	disabled?: boolean;
	[key: string]: any;
	/**
	 * TODO:在当前插件状态下，禁用的插件名称集合，如果禁用全部卡片插件，指定名称为 card 即可，但不包扩可编辑器卡片，如果还需要包括可编辑器卡片，指定名称 card-editable
	 */
	// disabledPlugins?: Array<string>;
};

export interface PluginEntry {
	prototype: PluginInterface;
	new (editor: EditorInterface, options: PluginOptions): PluginInterface;
	readonly pluginName: string;
}

export interface PluginInterface {
	readonly kind: string;
	/**
	 * 是否禁用，默认不禁用。在默认不指定的情况下，编辑器为 readonly 的时候全部禁用
	 */
	disabled?: boolean;
	/**
	 * TODO:在当前插件状态下，禁用的插件名称集合，如果禁用全部卡片插件，指定名称为 card 即可，但不包扩可编辑器卡片，如果还需要包括可编辑器卡片，指定名称 card-editable
	 */
	//disabledPlugins: Array<string>;
	/**
	 * 初始化
	 */
	init?(): void;
	/**
	 * 查询插件状态
	 * @param args 插件需要的参数
	 */
	queryState?(...args: any): any;
	/**
	 * 执行插件
	 * @param args 插件需要的参数
	 */
	execute(...args: any): void;
	/**
	 * 插件热键绑定，返回需要匹配的组合键字符，如 mod+b，匹配成功即执行插件，还可以带上插件执行所需要的参数，多个参数以数组形式返回{key:"mod+b",args:[]}
	 * @param event 键盘事件
	 */
	hotkey?(
		event?: KeyboardEvent,
	):
		| string
		| { key: string; args: any }
		| Array<{ key: string; args: any }>
		| Array<string>;
	/**
	 * 插件是否在等待处理中
	 */
	waiting?(): Promise<void>;
}

export interface ElementPluginInterface extends PluginInterface {
	/**
	 * 标签名称
	 */
	readonly tagName?: string | Array<string>;
	/**
	 * 标签样式，可选
	 * 使用变量表示值时，固定规则：@var0 @var1 @var2 ... 分别表示执行 command.execute 时传入的 参数1 参数2 参数3 ...
	 * { value:string,format:(value:string) => string } 可以在获取节点属性值时，对值进行自定义格式化处理
	 */
	readonly style?: {
		[key: string]:
			| string
			| { value: string; format: (value: string) => string };
	};
	/**
	 * 标签属性，可选
	 * 使用变量表示值时，固定规则：@var0 @var1 @var2 ... 分别表示执行 command.execute 时传入的 参数1 参数2 参数3 ...
	 * { value:string,format:(value:string) => string } 可以在获取节点属性值时，对值进行自定义格式化处理
	 */
	readonly attributes?: {
		[key: string]:
			| string
			| { value: string; format: (value: string) => string };
	};
	/**
	 * 在 style 或者 attributes 使用变量表示的值规则
	 * key 为如上所诉的变量名称 @var0 @var1 @var2 ...
	 */
	readonly variable?: { [key: string]: SchemaValue };
	/**
	 * 初始化
	 */
	init(): void;
	/**
	 * 将当前插件style属性应用到节点
	 * @param node 节点
	 * @param args style 对应 variable 中的变量参数
	 */
	setStyle(node: NodeInterface | Node, ...args: Array<any>): void;
	/**
	 * 将当前插件attributes属性应用到节点
	 * @param node 节点
	 * @param args attributes 对应 variable 中的变量参数
	 */
	setAttributes(node: NodeInterface | Node, ...args: Array<any>): void;
	/**
	 * 获取节点符合当前插件规则的样式
	 * @param node 节点
	 * @returns 样式名称和样式值键值对
	 */
	getStyle(node: NodeInterface | Node): { [key: string]: string };
	/**
	 * 获取节点符合当前插件规则的属性
	 * @param node 节点
	 * @returns 属性名称和属性值键值对
	 */
	getAttributes(node: NodeInterface | Node): { [key: string]: string };
	/**
	 * 检测当前节点是否符合当前插件设置的规则
	 * @param node 节点
	 * @returns true | false
	 */
	isSelf(node: NodeInterface | Node): boolean;
	/**
	 * 获取插件设置的属性和样式所生成的规则
	 */
	schema(): SchemaRule | SchemaGlobal | Array<SchemaRule>;
	/**
	 * 在粘贴时的标签转换，例如：b > strong
	 */
	conversion?(): ConversionData;
}

export interface PluginModelInterface {
	/**
	 * 实例化的插件集合
	 */
	components: { [k: string]: PluginInterface };
	/**
	 * 实例化插件
	 * @param plugins 插件集合
	 * @param config 插件配置
	 */
	init(plugins: Array<PluginEntry>, config: { [k: string]: any }): void;
	/**
	 * 新增插件
	 * @param clazz 插件类
	 */
	add(clazz: PluginEntry, options?: PluginOptions): void;
	/**
	 * 遍历插件
	 * @param callback 回调
	 */
	each(
		callback: (
			name: string,
			clazz: PluginEntry,
			index?: number,
		) => boolean | void,
	): void;
}
