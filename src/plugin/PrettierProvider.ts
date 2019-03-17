
import { TextEdit, Range, TextDocument, DocumentRangeFormattingEditProvider, DocumentFormattingEditProvider, FormattingOptions, CancellationToken, window } from 'vscode'
import { Options, resolveConfig } from 'prettier'

function prettierify(
    code: string,
    options: Options,
): string {
    const prettier = require('prettier')
    const prettierifiedCode = prettier.format(code, options)
    return prettierifiedCode
}

function fullDocumentRange(document: TextDocument): Range {
    const lastLineId = document.lineCount - 1
    return new Range(0, 0, lastLineId, document.lineAt(lastLineId).text.length)
}

class PrettierProvider
    implements
    DocumentRangeFormattingEditProvider,
    DocumentFormattingEditProvider {
    readonly options: { [index: string]: any }
    constructor(options: { [index: string]: any }) {
        this.options = options
    }

    provideDocumentRangeFormattingEdits(
        document: TextDocument,
        range: Range,
        options: FormattingOptions,
        token: CancellationToken
    ): Promise<TextEdit[]> {
        return this._provideEdits(document)
    }

    provideDocumentFormattingEdits(
        document: TextDocument,
        options: FormattingOptions,
        token: CancellationToken
    ): Promise<TextEdit[]> {
        return this._provideEdits(document)
    }

    async _provideEdits(document: TextDocument): Promise<TextEdit[]> {
        try {
            const prettierOptions = await resolveConfig(document.uri.fsPath, { editorconfig: true })
            const prettierifiedCode = prettierify(document.getText(), Object.assign({}, this.options, prettierOptions))
            return [TextEdit.replace(fullDocumentRange(document), prettierifiedCode)]
        } catch (error) {
            console.log('Prettier format failed')
            console.error(error.message)
            window.showErrorMessage(error.message)
            return []
        }
    }
}

export default PrettierProvider
