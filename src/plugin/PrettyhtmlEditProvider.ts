/**
 * modified from https://github.com/StarpTech/prettyhtml-vscode/blob/master/src/prettyhtmlEditProvider.ts
 */
import {
  DocumentRangeFormattingEditProvider,
  DocumentFormattingEditProvider,
  Range,
  TextDocument,
  FormattingOptions,
  CancellationToken,
  TextEdit,
  window
} from 'vscode'
import { resolveConfig } from 'prettier'

async function format(
  text: string,
  { uri }: TextDocument,
  options: { [index: string]: any },
  prettyhtmlOptions: { [index: string]: any }
): Promise<string> {
  const prettyhtml = require('@starptech/prettyhtml')

  const op = {
    useTabs: prettyhtmlOptions.useTabs,
    tabWidth: prettyhtmlOptions.tabWidth,
    printWidth: prettyhtmlOptions.printWidth,
    singleQuote: prettyhtmlOptions.singleQuote,
    usePrettier: prettyhtmlOptions.usePrettier,
    // prettier: prettierOptions,
    wrapAttributes: prettyhtmlOptions.wrapAttributes,
    sortAttributes: prettyhtmlOptions.sortAttributes
  }

  if (prettyhtmlOptions.usePrettier) {
    const prettierOptions = await resolveConfig(uri.fsPath, { editorconfig: true })
    Object.assign(op, prettierOptions, { prettier: prettierOptions })
  }

  return await prettyhtml(text, op).contents
}

function fullDocumentRange(document: TextDocument): Range {
  const lastLineId = document.lineCount - 1
  return new Range(0, 0, lastLineId, document.lineAt(lastLineId).text.length)
}

class PrettyhtmlEditProvider
  implements
  DocumentRangeFormattingEditProvider,
  DocumentFormattingEditProvider {
  readonly prettyhtmlOptions: { [index: string]: any }
  constructor(options: { [index: string]: any }) {
    this.prettyhtmlOptions = options
  }

  provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]> {
    return this._provideEdits(document, {
      rangeStart: document.offsetAt(range.start),
      rangeEnd: document.offsetAt(range.end)
    })
  }

  provideDocumentFormattingEdits(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken
  ): Promise<TextEdit[]> {
    return this._provideEdits(document, options)
  }

  private async _provideEdits(document: TextDocument, options: Object) {
    if (this.prettyhtmlOptions.enable === false) {
      console.info(
        'Prettyhtml is not enabled. Set \'prettyhtml.enable\' to true'
      )
      return []
    }
    try {
      const code = await format(
        document.getText(),
        document,
        options,
        this.prettyhtmlOptions
      )
      return [TextEdit.replace(fullDocumentRange(document), code)]
    } catch (error) {
      console.error('prettyhtml error \n', error.message)
      window.showErrorMessage(error.message)
      return []
    }
  }
}

export default PrettyhtmlEditProvider
