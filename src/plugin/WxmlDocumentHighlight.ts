import { DocumentHighlightProvider, TextDocument, Position, CancellationToken, Range, DocumentHighlight } from 'vscode'

import { Config } from './lib/config'

const TagRegexp = /<([\w:-]+)|<\/([\w:-]+)>/g

export default class WxmlDocumentHighlight implements DocumentHighlightProvider {
  constructor(public config: Config) {}

  provideDocumentHighlights(doc: TextDocument, pos: Position, _token: CancellationToken): DocumentHighlight[] {
    const range = doc.getWordRangeAtPosition(pos, /[\w:-]+/)
    if (!range) return []

    const content = doc.getText()
    const name = doc.getText(range)
    const res: Range[] = [range]

    if (prev(doc, range.start) === '<') {
      // start tag
      const nextStartIndex = doc.offsetAt(range.end)
      const nextText = this.normalize(content.slice(nextStartIndex))

      if (!/^[^<>]*\/>/.test(nextText)) {
        // not self close tag
        const nextEndIndex = this.findMatchedEndTag(name, nextText)
        if (typeof nextEndIndex === 'number') {
          res.push(
            new Range(
              doc.positionAt(nextStartIndex + nextEndIndex + 2),
              doc.positionAt(nextStartIndex + nextEndIndex + 2 + name.length)
            )
          )
        }
      }
    } else if (prev(doc, range.start, 2) === '</' && next(doc, range.end, 1) === '>') {
      // end tag
      const prevEndIndex = doc.offsetAt(range.start) - 2
      const prevText = this.normalize(content.slice(0, prevEndIndex))
      const prevStartIndex = this.findMatchedStartTag(name, prevText)
      if (typeof prevStartIndex === 'number') {
        res.push(new Range(doc.positionAt(prevStartIndex + 1), doc.positionAt(prevStartIndex + 1 + name.length)))
      }
    }

    return res.map(r => new DocumentHighlight(r))
  }

  /**
   * 因为只需要 tag，所以这里把所有的注释属性替换成特殊字符
   */
  private normalize(content: string) {
    const replacer = (raw: string) => new Array(raw.length).fill(' ').join('')

    return (
      content
        .replace(/<!--.*?-->/g, replacer) // 去除注释
        .replace(/("[^"]*"|'[^']*')/g, replacer) // 去除属性
        // .replace(/>[\s\S]*?</g, (raw) => '>' + replacer(raw.substr(2)) + '<') // 去除标签内容
        .replace(/<[\w:-]+\s+[^<>]*\/>/g, replacer)
    ) // 去除自闭合的标签
  }

  private findMatchedEndTag(name: string, nextContent: string) {
    TagRegexp.lastIndex = 0
    let mat: RegExpExecArray | null
    const stack: string[] = []
    while ((mat = TagRegexp.exec(nextContent))) {
      const [, startName, endName] = mat
      if (startName) {
        stack.push(startName)
      } else if (endName) {
        const last = stack.pop()
        if (!last) {
          // 最后一个了
          if (endName === name) {
            return mat.index
          }
        } else if (last !== endName) {
          // wxml 解析错误
          break
        }
      }
    }
    return
  }

  private findMatchedStartTag(name: string, prevContent: string) {
    TagRegexp.lastIndex = 0
    let mat: RegExpExecArray | null
    const stack: [string, number][] = []
    while ((mat = TagRegexp.exec(prevContent))) {
      const [, startName, endName] = mat
      if (startName) {
        stack.push([startName, mat.index])
      } else if (endName) {
        const last = stack.pop()
        if (!last) {
          break
        } else if (last[0] !== endName) {
          // wxml 解析错误
          break
        }
      }
    }
    const l = stack[stack.length - 1]
    return l ? l[1] : undefined
  }
}

function next(doc: TextDocument, pos: Position, length = 1) {
  const start = new Position(pos.line, pos.character)
  const end = new Position(pos.line, pos.character + length)
  return doc.getText(new Range(start, end))
}

function prev(doc: TextDocument, pos: Position, length = 1) {
  const start = new Position(pos.line, pos.character - length)
  const end = new Position(pos.line, pos.character)
  return doc.getText(new Range(start, end))
}
