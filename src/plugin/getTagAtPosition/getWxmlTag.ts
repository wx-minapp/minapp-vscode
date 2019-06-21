/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc^126.com> (https://github.com/qiu8310)
*******************************************************************/

import {TextDocument, Position} from 'vscode'
import {Tag, getAttrs, getAttrName} from './base'

/**
 * 获取标签的起始位置
 * 如果不在标签中返回 null
 * @param text
 * @param pos
 */
function getBracketRange(text: string, pos: number): [number, number] | null {
  const textBeforePos = text.substr(0, pos)
  const startBracket = textBeforePos.lastIndexOf('<')
  if (startBracket < 0 ||  textBeforePos[startBracket + 1] === '!' || textBeforePos.lastIndexOf('>') > startBracket) {
    // 前没有开始符<，
    // 或者正在注释中： <!-- | -->
    // 或者不在标签中： <view > | </view>
    return null
  }

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
 * 生成指定字符的替换函数
 */
const replacer = (char: string) => (raw: string) => char.repeat(raw.length)

/**
 * 提取标签 允许跨行
 * @param doc
 * @param pos
 */
export function getWxmlTag(doc: TextDocument, pos: Position): null | Tag {
  let offset = doc.offsetAt(pos)
  let text = doc.getText()

  // 因为双大括号里可能会有任何字符，估优先处理
  // 用特殊字符替换 "{{" 与 "}}"" 之间的语句，并保证字符数一致
  let pureText = text.replace(/\{\{[^\}]*?\}\}/g, replacer('^'))
  let attrFlagText = pureText.replace(/("[^"]*"|'[^']*')/g, replacer('%')) // 将引号中的内容也替换了

  // 标签起始位置
  const range = getBracketRange(attrFlagText, offset)
  if (!range) {
    return null
  }
  const [start, end] = range

  offset = offset - start
  text = text.substr(start, end)
  // pureText = pureText.substr(start, end)
  attrFlagText = attrFlagText.substr(start, end)

  const tagNameMatcher = attrFlagText.match(/^<([\w-:.]+)/)
  if (!tagNameMatcher) {
    return null
  }
  const name = tagNameMatcher[1] // 标签名称
  const attrstr = text.substr(tagNameMatcher[0].length) // 属性部分原始字符串

  const inputWordRange = doc.getWordRangeAtPosition(pos, /\b[\w-:.]+\b/) // 正在输入的词的范围
  const posWord = inputWordRange ? doc.getText(inputWordRange) : '' // 正在输入的词
  const isOnTagName = offset <= name.length + 1
  const isOnAttrValue = attrFlagText[offset] === '%'
  const attrName = isOnAttrValue ? getAttrName(attrFlagText.substring(0, offset)) : '' // 当前输入对应的属性
  const isOnAttrName = !isOnTagName && !isOnAttrValue && !!posWord

  return {
        name,
        attrs: getAttrs((attrstr || '').trim()),
        posWord,
        isOnTagName,
        isOnAttrName,
        isOnAttrValue,
        attrName
      }
}
