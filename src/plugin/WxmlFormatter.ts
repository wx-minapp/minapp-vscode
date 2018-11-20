import {
  FormattingOptions,
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider,
  TextDocument,
  TextEdit,
  Range
} from 'vscode'

import {parse} from '@minapp/wxml-parser'
import {Config} from './lib/config'
import {getEOL} from './lib/helper'

export default class implements DocumentFormattingEditProvider, DocumentRangeFormattingEditProvider {
  constructor(public config: Config) {}

  format(doc: TextDocument, range: Range, options: FormattingOptions, prefix = '') {
    let xml = parse(doc.getText(range))

    return [
      new TextEdit(range, xml.toXML({
        prefix,
        eol: getEOL(doc),
        preferSpaces: options.insertSpaces,
        tabSize: options.tabSize,
        maxLineCharacters: this.config.formatMaxLineCharacters,
        removeComment: false,
        reserveTags: this.config.reserveTags
      }))
    ]
  }

  provideDocumentFormattingEdits(doc: TextDocument, options: FormattingOptions): TextEdit[] {
    let range = new Range(doc.lineAt(0).range.start, doc.lineAt(doc.lineCount - 1).range.end)
    return this.format(doc, range, options)
  }

  provideDocumentRangeFormattingEdits(doc: TextDocument, range: Range, options: FormattingOptions): TextEdit[] {
    let prefixRange = doc.getWordRangeAtPosition(range.start, /[ \t]+/)
    let prefix = prefixRange ? doc.getText(prefixRange) : ''
    return this.format(doc, range, options, prefix)
  }
}
