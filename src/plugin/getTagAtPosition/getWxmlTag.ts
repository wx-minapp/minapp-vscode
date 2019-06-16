/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc^126.com> (https://github.com/qiu8310)
*******************************************************************/

import {TextDocument, Position} from 'vscode'
import {Tag, getAttrs, getAttrName} from './base'

const TAG_REGEXP = /<([\w-:.]+)(\s+[^<>]*)?/g

/**
 * 获取标签的起始位置
 * @param text
 * @param pos
 */
function getBracketRange(text: string, pos: number): [number, number] {
  const startBracket = Math.max(text.substr(0, pos).lastIndexOf('<'), 0)

  let endBracket = text.indexOf('>', pos + 1)
  if (endBracket < 0) {
    // 未找到闭合 > 文件结束位置为结束
    // 如 <image ... | EOF
    endBracket = text.length
  }

  // 可能尚未输入闭合标签，取下一个标签的头<
  // 此时找到的闭合标签是下一个标签
  // <view xxx | ... <view ></view>
  const nextStart = text.indexOf('<', pos + 1)
  if (nextStart > 0 && nextStart < endBracket) {
    endBracket = nextStart
  }
  return [startBracket, endBracket - startBracket]
}

/**
 * 提取标签 允许跨行
 * @param doc
 * @param pos
 */
export function getWxmlTag(doc: TextDocument, pos: Position): null | Tag {
  let tag: null | Tag = null
  let offset = doc.offsetAt(pos)
  let text = doc.getText()
  // let line = doc.lineAt(pos.line).text
  let replacer = (char: string) => (raw: string) => char.repeat(raw.length)

  // 因为双大括号里可能会有任何字符，估优先处理
  // 用特殊字符替换 "{{" 与 "}}"" 之间的语句，并保证字符数一致
  let pureText = text.replace(/\{\{[^\}]*?\}\}/g, replacer('^'))

  let attrFlagText = pureText.replace(/("[^"]*"|'[^']*')/g, replacer('%')) // 将引号中的内容也替换了

  // 标签起始位置
  const [start, end] = getBracketRange(attrFlagText, offset)

  offset = offset - start
  text = text.substr(start, end)
  pureText = pureText.substr(start, end)
  attrFlagText = attrFlagText.substr(start, end)

  // console.log(pureLine)
  pureText.replace(TAG_REGEXP, (raw: string, name: string, attrstr: string, index: number) => {
    attrstr = text.substr(index + raw.indexOf(attrstr))

    if (!tag && index <= offset && index + raw.length >= offset) {
      let range = doc.getWordRangeAtPosition(pos, /\b[\w-:.]+\b/)
      let posWord = ''
      let attrName = ''
      if (range) posWord = doc.getText(range)
      let isOnTagName = offset <= index + name.length + 1
      let isOnAttrValue = attrFlagText[offset] === '%'
      if (isOnAttrValue) {
        attrName = getAttrName(attrFlagText.substring(0, offset))
      }
      let isOnAttrName = !isOnTagName && !isOnAttrValue && !!posWord
      tag = {
        name,
        attrs: getAttrs((attrstr || '').trim()),
        posWord,
        isOnTagName,
        isOnAttrName,
        isOnAttrValue,
        attrName
      }
    }
    return raw
  })
  return tag
}
