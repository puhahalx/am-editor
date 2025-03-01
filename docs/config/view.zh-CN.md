---
toc: menu
---

# 阅读器配置

阅读器主要用于草稿模式编辑或单纯的内容显示，需要实时协同显示并且设置为不可编辑，可以使用引擎的 `readonly` 属性

在实例化阅读器时传入

```ts
import { View } from '@aomao/engine';
//实例化引擎
const view = new View(渲染节点, {
	...配置项,
});
```

### lang

-   类型: `string`
-   默认值：`zh-CN`
-   详细：语言配置，暂时支持 `zh-CN`、`en-US`。可使用 `locale` 配置

```ts
const view = new View(渲染节点, {
	lang: 'zh-CN',
});
```

### locale

-   类型: `object`
-   默认值：`zh-CN`
-   详细：配置额外语言包

语言包，默认语言包 [https://github.com/yanmao-cc/am-editor/blob/master/locale](https://github.com/yanmao-cc/am-editor/blob/master/locale)

```ts
const view = new View(渲染节点, {
	locale: {
		'zh-CN': {
			test: '测试',
			a: {
				b: 'B',
			},
		},
	},
});
console.log(view.language.get<string>('test'));
```

### root

-   类型: `Node`
-   默认值：当前阅读器渲染节点父节点
-   详细：阅读器根节点

### plugins

-   类型: `Array<Plugin>`
-   默认值：`[]`
-   详细：实现 `Plugin` 抽象类的插件集合

### cards

-   类型: `Array<Card>`
-   默认值：`[]`
-   详细：实现 `Card` 抽象类的卡片集合

### config

-   类型: `{ [key: string]: PluginOptions }`
-   默认值：`{}`
-   详细：每个插件的配置项，key 为插件名称，详细配置请参考每个插件的说明
