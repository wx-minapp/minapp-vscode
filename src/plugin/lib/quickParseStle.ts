import { match, getPositionFromIndex } from './helper'
import { Position } from 'vscode'
import { Plugin, } from 'postcss'
/// @ts-ignore
import * as nested from 'postcss-nested'

const styleRegexp = /\.[a-zA-Z][\w-\d_]*/g
const styleWithDocRegexp = /\/\*([\s\S]*?)\*\/[\s\r\n]*[^\.\{\}]*\.([a-zA-Z][\w-\d_]*)/g

const styleSingleCommentRegexp = /\/\/.*/g
const styleMultipleCommentRegExp = /\/\*[\s\S]*?\*\//g

const startStarRegexp = /^\s*\*+ ?/mg

export namespace quickParseStyle {
  export interface Options {
    unique?: boolean
  }
}


/**
 * 解析样式文件内容成 className 和 doc 的形式
 * - css/scss 生成 nested tree 解析
 * - less stylus 用正则
 */
export function quickParseStyle(styleContent: string, {unique}: quickParseStyle.Options = {}) {
  try {
    return parseNestedStyle(styleContent, {unique})
  } catch (error) {
    console.warn(error)
  }
  let style: Array<{doc: string, pos: Position, name: string}> = []
  let content = styleContent
    .replace(styleSingleCommentRegexp, replacer)            // 去除单行注释
    .replace(styleMultipleCommentRegExp, replacer)          // 去除多行注释

  match(content, styleRegexp).forEach(mat => {
    const name = mat[0].substr(1)
    if (!unique || !style.find(s => s.name === name)) {
      style.push({doc: '', pos: getPositionFromIndex(content, mat.index), name})
    }
  })


  // 再来获取带文档的 className
  styleContent.replace(styleWithDocRegexp, (raw, doc, name) => {
    style.forEach(s => {
      if (s.name === name) s.doc = parseDoc(doc)
      return s.name === name
    })
    return ''
  })

  return style
}


/**
 * 解析嵌套格式
 */
function parseNestedStyle(styleContent: string, { unique }: quickParseStyle.Options = {}) {
  const style: Array<{ doc: string, pos: Position, name: string }> = []
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
      const doc = styleContent.split(/\n/g).splice(ruleStart.line - 1, endLine - ruleStart.line + 1).join('\n')
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

function replacer(raw: string) {
  return ' '.repeat(raw.length)
}

function parseDoc(doc: string) {
  return doc.replace(startStarRegexp, '').trim()
}
