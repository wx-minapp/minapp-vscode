import { match } from './helper'
import { Position } from 'vscode'
import { Plugin, } from 'postcss'
/// @ts-ignore
import * as nested from 'postcss-nested'

const styleRegexp = /\.[a-zA-Z][\w-\d_]*/g

export namespace quickParseStyle {
  export interface Options {
    unique?: boolean
  }
}


/**
 * 解析样式文件内容成 className 和 doc 的形式
 *
 * 样式文件可能是 scss/less/css 所以不需要解析成 ast，只需要用正则即可
 */
export function quickParseStyle(styleContent: string, { unique }: quickParseStyle.Options = {}) {
  let style: Array<{ doc: string, pos: Position, name: string }> = []
  const result = (nested as Plugin<any>).process(styleContent)

  result.root.walkRules((rule) => {
    if (rule.type === 'rule') { // 只遍历正常rule
      // 起始位置
      let ruleStart = { line: 1, column: 1 }
      if (rule.source && rule.source.start) {
        ruleStart = rule.source.start
      }
      const endLine = rule.source && rule.source.end ? rule.source.end.line : ruleStart.line
      // 文档提示
      const doc = styleContent.split(/\n/g).splice(ruleStart.line - 1, endLine - ruleStart.line + 1).join('')
      rule.selectors.forEach(selector => {
        match(selector, styleRegexp).forEach(mat => {
          // 提取所有class
          const name = mat[0].substr(1)
          if (!unique || !style.find(s => s.name === name)) {
            style.push({ doc, name, pos: new Position(ruleStart.line, ruleStart.column) })
          }
        })
      })
    }
  })

  return style
}
