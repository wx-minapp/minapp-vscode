/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import {
  Position,
  CancellationToken,
  CompletionItemProvider,
  TextDocument,
  CompletionItem,
  CompletionContext,
} from 'vscode'

import AutoCompletion from './AutoCompletion'

import { getLanguage, getLastChar } from './lib/helper'
import { LanguageConfig } from './lib/language'

export const LINE_TAG_REGEXP = /^[\w-:.]+(?:(?:[\.#][\w-])*)\(/

export default class extends AutoCompletion implements CompletionItemProvider {
  id = 'wxml-pug' as const

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext
  ): CompletionItem[] | Promise<CompletionItem[]> {
    const items: CompletionItem[] = []
    const language = getLanguage(document, position)
    if (!language) return items
    const lineNum = position.line
    const line = document.lineAt(lineNum).text.substr(0, position.character)
    if (/^\s*(\w*)$/.test(line)) {
      const prefix = RegExp.$1
      const lastLine = this.getLastContentLine(document, lineNum)
      if (lastLine) {
        if (LINE_TAG_REGEXP.test(lastLine)) {
          // 上一行是标签，属性自动补全
          if (!lastLine.includes(')')) return this.createComponentAttributeSnippetItems(language, document, position)
        } else if (/^(@?[\w:-]+)=/.test(lastLine)) {
          // 上一行也是属性的声明，此时也应该是属性自动补全
          return this.createComponentAttributeSnippetItems(language, document, position)
        }
      }
      if (line.trim()) {
        return this.createComponentSnippetItems(language, document, position, prefix)
      }
    }

    const char = context.triggerCharacter || getLastChar(document, position)
    switch (char) {
      case '"':
      case "'":
      case '(':
      case ' ':
        return this.createComponentAttributeSnippetItems(language, document, position)
      case ':': // 绑定变量 （也可以是原生小程序的控制语句或事件，如 wx:for, bind:tap）
      case '@': // 绑定事件
      case '-': // v-if
      case '.': // 变量或事件的修饰符
        return this.createSpecialAttributeSnippetItems(language, document, position)
    }

    return items
  }

  async createComponentAttributeSnippetItems(lc: LanguageConfig, doc: TextDocument, pos: Position): Promise<CompletionItem[]> {
    return this.wrapAttrItems(await super.createComponentAttributeSnippetItems(lc, doc, pos), doc, pos)
  }
  async createSpecialAttributeSnippetItems(lc: LanguageConfig, doc: TextDocument, pos: Position): Promise<CompletionItem[]> {
    return this.wrapAttrItems(await super.createSpecialAttributeSnippetItems(lc, doc, pos), doc, pos)
  }

  private wrapAttrItems(items: CompletionItem[], doc: TextDocument, pos: Position) {
    const range = this.shouldNearLeftBracket(doc, pos)
    if (range) {
      items.forEach(it => (it.range = range))
    }
    return items
  }

  private shouldNearLeftBracket(document: TextDocument, pos: Position) {
    const line = document.lineAt(pos.line).text
    const range = document.getWordRangeAtPosition(pos, /\s+/)
    if (range && range.start.character > 0 && line[range.start.character - 1] === '(') return range
    return
  }

  /**
   * 获取上一行带内容的行
   */
  private getLastContentLine(document: TextDocument, start: number) {
    while (--start >= 0) {
      const text = document.lineAt(start).text.trim()
      if (text) return text
    }
    return
  }
}
