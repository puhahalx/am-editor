# Useful methods and constants

## Constant

### `isEdge`

Edge browser

### `isChrome`

Is it a Chrome browser

### `isFirefox`

Is it a Firefox browser

### `isSafari`

Is it a Safari browser

### `isMobile`

Is it a mobile browser

### `isIos`

Is it an iOS system

### `isAndroid`

Whether it is Android

### `isMacos`

Is it a Mac OS X system

### `isWindows`

Is it a Windows system

## Method

### `isNodeEntry`

Whether it is a NodeInterface object

Accept the following types of objects

-   `string`
-   `HTMLElement`
-   `Node`
-   `Array<Node>`
-   `NodeList`
-   `NodeInterface`
-   `EventTarget`

### `isNodeList`

Is it a NodeList object

Accept the following types of objects

-   `string`
-   `HTMLElement`
-   `Node`
-   `Array<Node>`
-   `NodeList`
-   `NodeInterface`
-   `EventTarget`

### `isNode`

Is it a Node object

Accept the following types of objects

-   `string`
-   `HTMLElement`
-   `Node`
-   `Array<Node>`
-   `NodeList`
-   `NodeInterface`
-   `EventTarget`

### `isSelection`

Is it a window.Selection object

Accept the following types of objects

-   Window
-   Selection
-   Range

### `isRange`

Is it window.Range

Accept the following types of objects

-   Window
-   Selection
-   Range

### `isRangeInterface`

Whether it is a RangeInterface object extended from Range

Accept the following types of objects

-   NodeInterface
-   RangeInterface

### `isSchemaRule`

Is it an object of type `SchemaRule`

Accept the following types of objects

-   SchemaRule
-   SchemaGlobal

### `isMarkPlugin`

Is it a Mark type plug-in

Accepted object: `PluginInterface`

### `isInlinePlugin`

Is it an Inline type plug-in

Accepted object: `PluginInterface`

### `isBlockPlugin`

Is it a Block type plug-in

Accepted object: `PluginInterface`

### `isEngine`

Is it an engine

Accepted object: `EditorInterface`

### `getWindow`

Get the window object from the node

If window is undefined, it will try to get the window object from global['__amWindow']

```ts
(node?: Node): Window & typeof globalThis
```

### `getDocument`

Get the document object from the node

```ts
getDocument(node?: Node): Document
```

### `combinTextNode`

Remove empty text nodes and connect adjacent text nodes

```ts
combinTextNode(node: NodeInterface | Node): void
```

### `getTextNodes`

Get all textnode type elements in a dom element

```ts
/**
 * Get all textnode type elements in a dom element
 * @param {Node} node-dom node
 * @param {Function} filter-filter
 * @return {Array} the obtained text node
 */
getTextNodes(node: Node, filter?:(node: Node) => boolean): Array<Node>
```
