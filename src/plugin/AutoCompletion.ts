/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import {
  CompletionItem,
  CompletionItemKind,
  SnippetString,
  MarkdownString,
  TextDocument,
  Position,
  Range,
} from 'vscode'

import {
  TagItem,
  TagAttrItem,
  autocompleteSpecialTagAttr,
  autocompleteTagAttr,
  autocompleteTagAttrValue,
  autocompleteTagName,
} from '../common/src'

import * as path from 'path'

import { Config } from './lib/config'
import { getCustomOptions, getTextAtPosition, getRoot, getEOL, getLastChar } from './lib/helper'
import { LanguageConfig } from './lib/language'
import { getTagAtPosition } from './getTagAtPosition/'
import * as s from './res/snippets'
import { getClass } from './lib/StyleFile'
import { getCloseTag } from './lib/closeTag'
import { getProp } from './lib/ScriptFile'

export default abstract class AutoCompletion {
  abstract id: 'wxml' | 'wxml-pug'

  get isPug() {
    return this.id === 'wxml-pug'
  }
  get attrQuote() {
    return this.isPug ? this.config.pugQuoteStyle : this.config.wxmlQuoteStyle
  }

  constructor(public config: Config) {}

  getCustomOptions(doc: TextDocument) {
    return getCustomOptions(this.config, doc)
  }

  renderTag(tag: TagItem, sortText: string) {
    let c = tag.component
    let item = new CompletionItem(c.name, CompletionItemKind.Module)

    let { attrQuote, isPug } = this
    let allAttrs = c.attrs || []
    let attrs = allAttrs
      .filter(a => a.required || a.subAttrs)
      .map((a, i) => (isPug ? '' : ' ') + `${a.name}=${attrQuote}${this.setDefault(i + 1, a.defaultValue)}${attrQuote}`)

    let extraSpace = ''
    // 如果自动补全中没有属性，并且此组件有额外属性，则触发自动属性补全
    if (!attrs.length && allAttrs.length) {
      item.command = autoSuggestCommand()
      extraSpace = ' '
    }

    let len = attrs.length + 1
    let snippet: string
    if (isPug) {
      snippet = `${c.name}(${attrs.join(' ')}\${${len}})\${0}`
    } else {
      if (this.config.selfCloseTags.includes(c.name)) {
        snippet = `${c.name}${attrs.join('')}${extraSpace}\${${len}} />\${0}`
      } else {
        snippet = `${c.name}${attrs.join('')}${extraSpace}\${${len}}>\${${len + 1}}</${c.name}>\${0}`
      }
    }
    item.insertText = new SnippetString(snippet)
    item.documentation = new MarkdownString(tag.markdown)
    item.sortText = sortText
    return item
  }

  renderTagAttr(tagAttr: TagAttrItem, sortText: string, kind?: CompletionItemKind) {
    let a = tagAttr.attr
    let item = new CompletionItem(a.name, kind === undefined ? CompletionItemKind.Field : kind)
    let defaultValue = a.defaultValue
    if (!this.isDefaultValueValid(defaultValue)) {
      defaultValue = a.enum && a.enum[0].value
    }

    let { attrQuote, isPug } = this

    if (a.boolean) {
      item.insertText = new SnippetString(isPug && defaultValue === 'false' ? `${a.name}=false` : a.name)
    } else {
      let value = a.addBrace ? '{{${1}}}' : this.setDefault(1, defaultValue)

      // 是否有可选值，如果有可选值则触发命令的自动补全
      let values = a.enum ? a.enum : a.subAttrs ? a.subAttrs.map(sa => ({ value: sa.equal })) : []
      if (values.length) {
        value = '${1}'
        item.command = autoSuggestCommand()
      }

      item.insertText = new SnippetString(`${a.name}=${attrQuote}${value}${attrQuote}$0`)
    }

    item.documentation = new MarkdownString(tagAttr.markdown)
    item.sortText = sortText

    if (a.name === 'class') item.command = autoSuggestCommand()

    return item
  }

  renderSnippet(doc: TextDocument, name: string, snippet: s.Snippet, sortText: string) {
    let item = new CompletionItem(name + ' snippet', CompletionItemKind.Snippet)

    let eol = getEOL(doc)
    let body = Array.isArray(snippet.body) ? snippet.body.join(eol) : snippet.body
    body = body.replace(/___/g, this.attrQuote)

    if (!this.isPug && body.startsWith('<')) body = body.substr(1) // 去除触发符号
    item.insertText = new SnippetString(body)
    item.documentation = new MarkdownString(snippet.markdown || snippet.description)
    item.sortText = sortText
    return item
  }

  private setDefault(index: number, defaultValue: any) {
    if (!this.isDefaultValueValid(defaultValue)) return '${' + index + '}'
    if (typeof defaultValue === 'boolean' || defaultValue === 'true' || defaultValue === 'false') {
      return `{{\${${index}|true,false|}}}`
    } else {
      return `\${${index}:${String(defaultValue).replace(/['"]/g, '')}}`
    }
  }

  private isDefaultValueValid(defaultValue: any) {
    return defaultValue !== undefined && defaultValue !== ''
  }

  /**
   * 创建组件名称的自动补全
   */
  async createComponentSnippetItems(lc: LanguageConfig, doc: TextDocument, pos: Position, prefix?: string) {
    let res = await autocompleteTagName(lc, this.getCustomOptions(doc))
    let filter = (key: string) => key && (!prefix || prefix.split('').every(c => key.includes(c)))
    let filterComponent = (t: TagItem) => filter(t.component.name)

    let items = [
      ...res.customs.filter(filterComponent).map(t => this.renderTag(t, 'a')), // 自定义的组件放在前面
      ...res.natives.filter(filterComponent).map(t => this.renderTag(t, 'c')),
    ]

    // 添加 Snippet
    let userSnippets = this.config.snippets
    let allSnippets: s.Snippets = this.isPug
      ? { ...s.PugSnippets, ...userSnippets.pug }
      : { ...s.WxmlSnippets, ...userSnippets.wxml }
    items.push(
      ...Object.keys(allSnippets)
        .filter(k => filter(k))
        .map(k => {
          let snippet = allSnippets[k]
          if (!snippet.description) {
            let ck = k.split(' ')[0] // 取出名称中的第一段即可
            let found = res.natives.find(it => it.component.name === (ck || k))
            if (found) snippet.markdown = found.markdown
          }
          return this.renderSnippet(doc, k, allSnippets[k], 'b')
        })
    )

    if (prefix) {
      items.forEach(it => {
        it.range = new Range(new Position(pos.line, pos.character - prefix.length), pos)
      })
    }

    return items
  }

  /**
   * 创建组件属性的自动补全
   */
  async createComponentAttributeSnippetItems(lc: LanguageConfig, doc: TextDocument, pos: Position) {
    let tag = getTagAtPosition(doc, pos)
    if (!tag) return []
    if (tag.isOnTagName) {
      return this.createComponentSnippetItems(lc, doc, pos, tag.name)
    }
    if (tag.isOnAttrValue && tag.attrName) {
      let attrValue = tag.attrs[tag.attrName]
      if (tag.attrName === 'class' || /^[\w\d-]+-class/.test(tag.attrName)) {
        // `class` 或者 `xxx-class` 自动提示 class 名
        let existsClass = (tag.attrs[tag.attrName] || '') as string
        return this.autoCompleteClassNames(doc, existsClass ? existsClass.trim().split(/\s+/) : [])
      } else if (typeof attrValue === 'string') {
        if (tag.attrName.startsWith('bind') || tag.attrName.startsWith('catch')) {
          // 函数自动补全
          return this.autoCompleteMethods(doc, attrValue.replace(/"|'/, ''))
        } else if (attrValue.trim() === '') {
          let values = await autocompleteTagAttrValue(tag.name, tag.attrName, lc, this.getCustomOptions(doc))
          if (!values.length) return []
          let range = doc.getWordRangeAtPosition(pos, /['"]\s*['"]/)
          if (range) {
            range = new Range(
              new Position(range.start.line, range.start.character + 1),
              new Position(range.end.line, range.end.character - 1)
            )
          }
          return values.map(v => {
            let it = new CompletionItem(v.value, CompletionItemKind.Value)
            it.documentation = new MarkdownString(v.markdown)
            it.range = range
            return it
          })
        }

        // } else if ((tag.attrName.startsWith('bind') || tag.attrName.startsWith('catch')) && typeof attrValue === 'string') {

        //   return this.autoCompleteMethods(doc, attrValue.replace(/"|'/, ''))
      }
      return []
    } else {
      let res = await autocompleteTagAttr(tag.name, tag.attrs, lc, this.getCustomOptions(doc))
      let triggers: CompletionItem[] = []

      let { natives, basics } = res
      let noBasics = lc.noBasicAttrsComponents || []

      if (!noBasics.includes(tag.name)) {
        triggers = [...Object.keys(lc.custom), ...lc.event.prefixes]
          .filter(k => k.length > 1)
          .map(k => {
            // let str = k.substr(0, k.length - 1)
            // let trigger = k[k.length - 1]
            // let item = new CompletionItem(str, CompletionItemKind.Constant)
            let item = new CompletionItem(k, CompletionItemKind.Constant)
            item.sortText = 'z'
            item.command = autoSuggestCommand()
            // item.documentation = new MarkdownString(`输入此字段再输入 "**${trigger}**" 字符可以再次触发自动补全`)
            return item
          })
      }

      return [
        ...natives.map(a => this.renderTagAttr(a, 'a')),
        ...basics.map(a => this.renderTagAttr(a, 'b')), // 基本属性放最后
        ...triggers,
      ]
    }
  }

  /**
   * wxml:
   *    wx:
   *    bind:
   *    catch:
   *
   * vue:
   *    :
   *    @
   *    :xxx.sync
   *    @xxx.default, @xxx.user, @xxx.stop
   */
  async createSpecialAttributeSnippetItems(lc: LanguageConfig, doc: TextDocument, pos: Position) {
    let prefix = getTextAtPosition(doc, pos, /[:@\w\d\.-]/) as string
    if (!prefix) return []

    let tag = getTagAtPosition(doc, pos)
    if (!tag) return []
    let isEventPrefix = lc.event.prefixes.includes(prefix)

    // 非 Event，也非其它自定义的属性
    if (!isEventPrefix && !lc.custom.hasOwnProperty(prefix)) {
      // modifiers
      let modifiers: string[] = []
      if (prefix.endsWith('.')) {
        if (lc.event.prefixes.some(p => prefix.startsWith(p))) {
          modifiers = lc.event.modifiers
        } else {
          let customPrefix = Object.keys(lc.custom).find(p => prefix.startsWith(p))
          if (customPrefix) modifiers = lc.custom[customPrefix].modifiers
        }
      }

      return modifiers.map(m => new CompletionItem(m, CompletionItemKind.Constant))
    }

    let res = await autocompleteSpecialTagAttr(prefix, tag.name, tag.attrs, lc, this.getCustomOptions(doc))
    let kind = isEventPrefix ? CompletionItemKind.Event : CompletionItemKind.Field
    return [
      ...res.customs.map(c => this.renderTagAttr(c, 'a', kind)),
      ...res.natives.map(c => this.renderTagAttr(c, 'b', kind)),
    ]
  }

  // 样式名自动补全
  async autoCompleteClassNames(doc: TextDocument, existsClassNames: string[]) {
    let items: CompletionItem[] = []
    let stylefiles = getClass(doc, this.config)
    let root = getRoot(doc)

    stylefiles.forEach((stylefile, sfi) => {
      stylefile.styles.forEach(sty => {
        if (!existsClassNames.includes(sty.name)) {
          existsClassNames.push(sty.name)
          let i = new CompletionItem(sty.name)
          i.kind = CompletionItemKind.Variable
          i.detail = root ? path.relative(root, stylefile.file) : path.basename(stylefile.file)
          i.sortText = 'style' + sfi
          i.documentation = new MarkdownString(sty.doc)
          items.push(i)
        }
      })
    })

    return items
  }

  /**
   * 闭合标签自动完成
   * @param doc
   * @param pos
   */
  async createCloseTagCompletionItem(doc: TextDocument, pos: Position): Promise<CompletionItem[]> {
    const text = doc.getText(new Range(new Position(0, 0), pos))
    if (text.length < 2 || text.substr(text.length - 2) !== '</') {
      return []
    }
    const closeTag = getCloseTag(text)
    if (closeTag) {
      const completionItem = new CompletionItem(closeTag)
      completionItem.kind = CompletionItemKind.Property
      completionItem.insertText = closeTag

      const nextPos = new Position(pos.line, pos.character + 1)
      if (getLastChar(doc, nextPos) === '>') {
        completionItem.range = new Range(pos, nextPos)
        completionItem.label = closeTag.substr(0, closeTag.length - 1)
      }
      return [completionItem]
    }

    return []
  }

  /**
   * 函数自动提示
   * @param doc
   * @param prefix 函数前缀,空则查找所有函数
   */
  autoCompleteMethods(doc: TextDocument, prefix: string): CompletionItem[] {
    /**
     * 页面周期和组件 生命周期函数,
     * 显示时置于最后
     * 列表中顺序决定显示顺序
     */
    const lowPriority = [
      'onPullDownRefresh',
      'onReachBottom',
      'onPageScroll',
      'onShow',
      'onHide',
      'onTabItemTap',
      'onLoad',
      'onReady',
      'onResize',
      'onUnload',
      'onShareAppMessage',
      'error',
      'creaeted',
      'attached',
      'ready',
      'moved',
      'detached',
      'observer',
    ]
    const methods = getProp(doc.uri.fsPath, 'method', (prefix || '[\\w_$]') + '[\\w\\d_$]*')
    const root = getRoot(doc)
    return methods.map(l => {
      const c = new CompletionItem(l.name, getMethodKind(l.detail))
      const filePath = root ? path.relative(root, l.loc.uri.fsPath) : path.basename(l.loc.uri.fsPath)
      // 低优先级排序滞后
      const priotity = lowPriority.indexOf(l.name) + 1
      c.detail = `${filePath}\n[${l.loc.range.start.line}行,${l.loc.range.start.character}列]`
      c.documentation = new MarkdownString('```ts\n' + l.detail + '\n```')
      /**
       * 排序显示规则
       * 1. 正常函数 如 `onTap`
       * 2. 下划线函数 `_save`
       * 3. 生命周期函数 `onShow`
       */
      if (priotity > 0) {
        c.detail += '(生命周期函数)'
        c.kind = CompletionItemKind.Field
        c.sortText = '}'.repeat(priotity)
      } else {
        c.sortText = l.name.replace('_', '{')
      }
      return c
    })
  }
}

/**
 * 是否为属性式函数声明
 * 如 属性式声明 `foo:()=>{}`
 * @param text
 */
function getMethodKind(text: string) {
  return /^\s*[\w_$][\w_$\d]*\s*:/.test(text) ? CompletionItemKind.Property : CompletionItemKind.Method
}

function autoSuggestCommand() {
  return {
    command: 'editor.action.triggerSuggest',
    title: 'triggerSuggest',
  }
}
