import {
  FormattingOptions,
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider,
  workspace,
  TextDocument,
  TextEdit,
  Range,
  window,
} from 'vscode'

import * as Prettier from 'prettier'

import { parse } from '../wxml-parser'
import { Config } from './lib/config'
import { getEOL } from './lib/helper'
import { requireLocalPkg } from './lib/requirePackage'
import type { HTMLBeautifyOptions } from 'js-beautify'

/**
 * vscode 内置的 html.format 配置转换为 jsBeautify.html 的配置
 * form:  https://code.visualstudio.com/docs/languages/html#_formatting
 * to: https://github.com/beautify-web/js-beautify#css--html
 * 其实吧, 就是 camelCase -> snake_case
 */
function htmlFormatToJsBeautify(buildIntHtmlFormatConfig: Record<string, any>) {

  function camelCaseTosnake_case(str: string) {
    return str.replace(/[A-Z]/g, (match, offset) => (offset ? '_' : '') + match.toLowerCase())
  }

  const btConf = Object.keys(buildIntHtmlFormatConfig).reduce((btConf, key) => {
    if (typeof buildIntHtmlFormatConfig[key] == 'function') return btConf
    const bk = camelCaseTosnake_case(key);
    (btConf as any)[bk] = (buildIntHtmlFormatConfig as any)[key]
    return btConf
  }, {} as HTMLBeautifyOptions)

  return btConf
}


type PrettierType = typeof Prettier
export default class implements DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider {
  constructor(public config: Config) { }

  async format(doc: TextDocument, range: Range, options: FormattingOptions, prefix = ''): Promise<TextEdit[]> {
    const code = doc.getText(range)
    let content: string = code
    const resolveOptions = (prettier?: PrettierType) =>
      (prettier || requireLocalPkg<PrettierType>(doc.uri.fsPath, 'prettier')).resolveConfig(doc.uri.fsPath, {
        editorconfig: true,
      })

    try {
      if (this.config.wxmlFormatter === 'prettier') {
        const prettier: PrettierType = requireLocalPkg(doc.uri.fsPath, 'prettier')
        const prettierOptions = await resolveOptions(prettier)
        content = await prettier.format(code, { ...this.config.prettier, ...prettierOptions })
      } else if (this.config.wxmlFormatter === 'jsBeautifyHtml') {
        const jsb_html = require('js-beautify').html
        let conf = this.config.jsBeautifyHtml;
        if (this.config.jsBeautifyHtml === 'useCodeBuiltInHTML') {
          const buildIntHtmlFormatConfig = workspace.getConfiguration('html.format')
          conf = htmlFormatToJsBeautify(buildIntHtmlFormatConfig)
        }
        content = jsb_html(code, conf)
      } else if (this.config.wxmlFormatter === 'prettyHtml') {
        let prettyHtmlOptions = this.config.prettyHtml
        if (prettyHtmlOptions.usePrettier) {
          const prettierOptions = await resolveOptions()
          prettyHtmlOptions = { ...prettyHtmlOptions, ...prettierOptions, prettier: prettierOptions }
        }

        /**
         * prettyHtml 会将 `<input />` 转化成 `<input>`，而
         * https://github.com/prettyhtml/pretty-html-web 中的版本
         * 不会，所以将它仓库中的版本生成的 js 移到了此处
         */
        content = require('../../res/prettyhtml.js')(code, prettyHtmlOptions).contents
      } else {
        content = parse(code).toXML({
          prefix,
          eol: getEOL(doc),
          preferSpaces: options.insertSpaces,
          tabSize: options.tabSize,
          maxLineCharacters: this.config.formatMaxLineCharacters,
          removeComment: false,
          reserveTags: this.config.reserveTags,
        })
      }
    } catch (e) {
      window.showErrorMessage(`${this.config.wxmlFormatter} format error: ` + (e as any)?.message)
    }

    return [new TextEdit(range, content)]
  }

  provideDocumentFormattingEdits(doc: TextDocument, options: FormattingOptions): Promise<TextEdit[]> {
    if (this.config.disableFormat) {
      return Promise.resolve([]);
    }
    const range = new Range(doc.lineAt(0).range.start, doc.lineAt(doc.lineCount - 1).range.end)
    return this.format(doc, range, options)
  }

  provideDocumentRangeFormattingEdits(
    doc: TextDocument,
    range: Range,
    options: FormattingOptions
  ): Promise<TextEdit[]> {
    if (this.config.disableFormat) {
      return Promise.resolve([]);
    }
    const prefixRange = doc.getWordRangeAtPosition(range.start, /[ \t]+/)
    const prefix = prefixRange ? doc.getText(prefixRange) : ''
    return this.format(doc, range, options, prefix)
  }
}
