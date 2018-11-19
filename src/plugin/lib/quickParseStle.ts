import { match, getPositionFromIndex } from './helper'
import { Position } from 'vscode'

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
 *
 * 样式文件可能是 scss/less/css 所以不需要解析成 ast，只需要用正则即可
 */
export function quickParseStyle(styleContent: string, {unique}: quickParseStyle.Options = {}) {
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

function replacer(raw: string) {
  return ' '.repeat(raw.length)
}

function parseDoc(doc: string) {
  return doc.replace(startStarRegexp, '').trim()
}
