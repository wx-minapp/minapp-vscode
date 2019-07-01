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

export default class extends AutoCompletion implements CompletionItemProvider {
  id = 'wxml' as 'wxml'

  provideCompletionItems(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
    context: CompletionContext
  ): Promise<CompletionItem[]> {
    if (token.isCancellationRequested) {
      return Promise.resolve([])
    }
    let language = getLanguage(document, position)
    if (!language) return [] as any

    let char = context.triggerCharacter || getLastChar(document, position)

    switch (char) {
      case '<':
        return this.createComponentSnippetItems(language, document, position)
      case '\n': // 换行
      /* eslint-disable-next-line */
      /// @ts-ignore
      case ' ': // 空格
        // 如果后面紧跟字母数字或_不触发自动提示
        // (常用于手动调整缩进位置)
        if (/[\w\d\$_]/.test(getLastChar(document, new Position(position.line, position.character + 1)))) {
          return Promise.resolve([])
        }
      case '"':
      case "'":
        return this.createComponentAttributeSnippetItems(language, document, position)
      case ':': // 绑定变量 （也可以是原生小程序的控制语句或事件，如 wx:for, bind:tap）
      case '@': // 绑定事件
      case '-': // v-if
      case '.': // 变量或事件的修饰符
        return this.createSpecialAttributeSnippetItems(language, document, position)
      case '/': // 闭合标签
        return this.createCloseTagCompletionItem(document, position)
      default:
        if (char >= 'a' && char <= 'z') {
          // 输入属性时自动提示
          return this.createComponentAttributeSnippetItems(language, document, position)
        }
        return [] as any
    }
  }
}
