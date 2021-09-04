/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import {ParserError} from './parser'

const ELLIPSE = ' ... '

/**
 * 输出一个便于浏览的 wxml-parser 抛出的异常
 *
 * @export
 * @param {string} source 解析前的源代码
 * @param {ParserError} e 解析时抛出的异常
 * @param {number} [extraLines=3] 指定同时要输出的出错行的前后几行
 * @param {number} [truncateSize=80] 每行最多输出的字符数（不包括 "  Line %d+: "）
 */
export function logParserError(source: string, e: ParserError, extraLines = 3, truncateSize = 80) {
  const eol = '\n'
  const prevs = source.substring(0, e.index).split(eol)
  const rests = source.substr(e.index).split(eol)

  const p1 = prevs.pop() as string
  let p2 = rests.shift() as string
  const char = p2[0]
  p2 = p2.slice(1)

  const errLineNumber = prevs.length
  const lines = [...prevs, p1 + char + p2, ...rests]

  lines.forEach((l, i) => {
    if (i === errLineNumber) {
      const redChar = char
      if (l.length > truncateSize) {
        l = truncate(p1, truncateSize * p1.length / l.length, 'left')
          + redChar
          + truncate(p2, truncateSize * p2.length / l.length, 'right')
      } else {
        l = p1 + redChar + p2
      }

      console.log(`Line ${i}: ${l}`)
      console.warn(`          ${e.message}`)
    } else if (Math.abs(i - errLineNumber) <= extraLines) {
      console.log(`Line ${i}: ${truncate(l, truncateSize)}`)
    }
  })
}

function truncate(str: string, size: number, type?: 'left' | 'right') {
  if (str.length <= size) return str

  const el = ELLIPSE.length
  str = type === 'left' ? str.slice(el - size) : str.substr(0, size - el)
  return type === 'left'
    ? ELLIPSE + str.slice(el - size)
    : str.substr(0, size - el) + ELLIPSE
}