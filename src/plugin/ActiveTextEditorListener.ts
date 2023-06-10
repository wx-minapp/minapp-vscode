import { Config } from './lib/config'
import { TextEditor, window, Disposable, workspace, TextDocument, Range, TextEditorDecorationType } from 'vscode'

const COMMENT_REGEXP = /<!--([\s\S]*?)-->/g
const DOUBLE_BIND_REGEXP = /\b(?:[\w-]+).sync\s*=\s*['"]([^'"]*)['"]/g
// pug 语言属性前可能是 "("
const DIRECTIVE_REGEXP = /(?:\s|\()(?:v-|bind:?|catch:?|wx:|:|@)[\w-]+(?:\.[\w-]+)?\s*=\s*['"]([^'"]*)['"]/g
const INTERPOLATION_SIMPLE_REGEXP = /\{\{\s*([\w.-\[\]]*)\s*\}\}/g // 可以匹配 a、a.b、a[1].b 等
const INTERPOLATION_COMPLEX_REGEXP = /\{\{\s*(.*?)\s*\}\}/g

export default class ActiveTextEditorListener {
  private decorationCache: { [key: string]: { ranges: Range[]; style: TextEditorDecorationType } } = {}
  disposables: Disposable[] = []

  constructor(public config: Config) {
    // 首次立即更新，文件变化延迟更新
    if (window.activeTextEditor) this.onChange(window.activeTextEditor)

    let tid: NodeJS.Timer
    const update = (editor: TextEditor, resetCache?: boolean) => {
      if (!editor) return
      if (tid) clearTimeout(tid)
      tid = setTimeout(() => this.onChange(editor, resetCache), 500)
    }

    this.disposables.push(
      window.onDidChangeVisibleTextEditors(editors => {
        editors.forEach(e => this.onChange(e))
        this.updateDecorationCache()
      }),
      // window.onDidChangeActiveTextEditor(editor => {
      //   this.onChange(editor, true)
      // }),
      workspace.onDidChangeTextDocument(e => {
        if (e && window.activeTextEditor && e.document === window.activeTextEditor.document) {
          update(window.activeTextEditor, true)
        }
      })
    )
  }

  onChange(editor: TextEditor | undefined, resetCache?: boolean): void {
    if (!editor) return

    const doc = editor.document
    if (this.config.disableDecorate) return

    if (doc.languageId === 'wxml' || doc.languageId === 'wxml-pug') {
      const cache = this.decorationCache[doc.fileName]
      if (cache && !resetCache) {
        editor.setDecorations(cache.style, cache.ranges)
      } else {
        this.decorateWxml(editor)
      }
    }
  }

  decorateWxml(editor: TextEditor): void {
    const doc = editor.document
    const text = doc.getText()
    const interpolation = this.config.decorateComplexInterpolation
      ? INTERPOLATION_COMPLEX_REGEXP
      : INTERPOLATION_SIMPLE_REGEXP

    const comments = getRanges(text, COMMENT_REGEXP, doc, [])
    const ranges = [
      ...getRanges(text, DOUBLE_BIND_REGEXP, doc, comments),
      ...getRanges(text, DIRECTIVE_REGEXP, doc, comments),
      ...getRanges(text, interpolation, doc, comments),
    ]

    const decorationType = window.createTextEditorDecorationType(
      Object.assign(
        {
          // 设置默认样式
        },
        this.config.decorateType
      )
    )

    if (this.decorationCache[doc.fileName]) this.decorationCache[doc.fileName].style.dispose()
    editor.setDecorations(decorationType, ranges)
    this.decorationCache[doc.fileName] = { style: decorationType, ranges }
  }

  updateDecorationCache(): void {
    const cache = this.decorationCache
    const oldKeys = Object.keys(cache)

    // 当前打开过的所有文件
    const existKeys = workspace.textDocuments.map(doc => doc.fileName)

    // 这个是同时打开的多个文件
    // let existKeys = window.visibleTextEditors.map(editor => editor.document.fileName)

    oldKeys.forEach(k => {
      if (!existKeys.includes(k) && cache[k]) {
        cache[k].style.dispose()
        delete cache[k]
      }
    })
  }

  dispose(): void {
    Object.keys(this.decorationCache).forEach(k => this.decorationCache[k].style.dispose())
    this.decorationCache = {}
    this.disposables.forEach(d => d.dispose())
  }
}

function getRanges(content: string, regexp: RegExp, doc: TextDocument, excludeRanges: Range[]) {
  let match: RegExpExecArray | null
  const ranges: Range[] = []
  // tslint:disable:no-conditional-assignment
  while ((match = regexp.exec(content))) {
    if (match[1]) {
      let { index } = match
      let word = match[1]
      let createRange = true
      if (regexp === DIRECTIVE_REGEXP || regexp === DOUBLE_BIND_REGEXP) {
        index += match[0].length - word.length - 1
        createRange = shouldCreateRange(word)
      } else if (regexp === COMMENT_REGEXP) {
        word = match[0]
      } else {
        index += match[0].indexOf(word)
        createRange = shouldCreateRange(word)
      }

      if (createRange) {
        const start = doc.positionAt(index)
        const end = doc.positionAt(index + word.length)
        const range = new Range(start, end)
        if (excludeRanges.every(r => !r.contains(range))) {
          ranges.push(range)
        }
      }
    }
  }

  return ranges
}

function shouldCreateRange(word: string) {
  const key = word.trim()
  if (!key) return false

  const firstChar = key[0]
  const lastChar = key[key.length - 1]
  // 不是 boolean，不是字符串，也不是以数字开头，也不是以 {{ 开头的
  return (
    !['true', 'false'].includes(key) &&
    !(['"', "'"].includes(firstChar) && firstChar === lastChar && !key.substr(1, key.length - 2).includes(firstChar)) && // 前后两个是引号，则为字符串
    !key.startsWith('{{') &&
    !/\d/.test(firstChar)
  ) // 数字开头的肯定不是变量
}
