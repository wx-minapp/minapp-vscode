import { Config } from './lib/config'
import { DefinitionProvider, TextDocument, Position, CancellationToken, Location, Uri, Range } from 'vscode'
import { getTagAtPosition } from './getTagAtPosition'
import { getClass } from './lib/StyleFile'
import { getProp } from './lib/ScriptFile'
import { definitionTagName } from '../common/src'
import { getCustomOptions, getLanguage } from './lib/helper'

const reserveWords = ['true', 'false']

export class PropDefinitionProvider implements DefinitionProvider {
  constructor(public config: Config) {}
  public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken): Promise<Location[]> {
    const tag = getTagAtPosition(document, position)
    const locs: Location[] = []

    if (tag) {
      const language = getLanguage(document, position);
      if (tag.isOnTagName) {
        if (language) {
          const component = await definitionTagName(tag.name, language, getCustomOptions(this.config, document));
          if (component && component.path) {
            locs.push(new Location(Uri.file(component.path), new Position(0, 0)))
          }
        }
        return locs;
      }
      const { attrs, attrName, posWord } = tag
      const rawAttrValue = ((attrs['__' + attrName] || '') as string).replace(/^['"]|['"]$/g, '') // 去除引号

      // 不在属性上
      if (!tag.isOnAttrValue) return locs

      // 忽略特殊字符或者以数字开头的单词
      if (reserveWords.includes(posWord) || /^\d/.test(posWord)) return locs

      if (attrName === 'class') {
        return this.searchStyle(posWord, document, position)
      } else if (attrName.endsWith('.sync') || (rawAttrValue.startsWith('{{') && rawAttrValue.endsWith('}}'))) {
        return this.searchScript('prop', posWord, document)
      } else if (/^(mut-bind|capture-catch|capture-bind|bind|catch)/.test(attrName) || /\.(user|stop|default)$/.test(attrName)) {
        return this.searchScript('method', posWord, document)
      } else if (document.getWordRangeAtPosition(position, /\{\{[\s\w]+\}\}/)) {
        /**
         * fix case like:
         * ```wxml
         * style="height: {{bottom}}rpx"
         * ```
         */
        return this.searchScript('method', posWord, document)
      }
    } else {
      // 判断是否是在 {{ }} 中
      const range = document.getWordRangeAtPosition(position, /\{\{[\s\w]+\}\}/)
      if (!range) return locs
      const text = document.getText(range).replace(/^\{\{\s*|\s*\}\}$/g, '')
      return this.searchScript('prop', text, document)
    }
    return locs
  }

  searchScript(type: 'prop' | 'method', word: string, doc: TextDocument): Location[] {
    return getProp(doc.fileName, type, word).map(p => p.loc)
  }

  searchStyle(className: string, document: TextDocument, position: Position): Location[] {
    const locs: Location[] = []

    getClass(document, this.config).forEach(styfile => {
      styfile.styles.forEach(sty => {
        if (sty.name === className) {
          const start = sty.pos
          const end = new Position(start.line, 1 + start.character + className.length)
          locs.push(new Location(Uri.file(styfile.file), new Range(start, end)))
        }
      })
    })

    return locs
  }
}
