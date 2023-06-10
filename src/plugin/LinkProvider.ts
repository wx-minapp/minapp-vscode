/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import { DocumentLinkProvider, DocumentLink, CancellationToken, TextDocument, Uri, Range } from 'vscode'
import { Config } from './lib/config'
import * as fs from 'fs'
import * as path from 'path'

export default class implements DocumentLinkProvider {
  constructor(public config: Config) {}

  async provideDocumentLinks(doc: TextDocument, token: CancellationToken): Promise<DocumentLink[]> {
    return this.getLinks(doc)
  }

  private getLinks(doc: TextDocument) {
    const links: DocumentLink[] = []
    const { linkAttributeNames } = this.config
    if (!linkAttributeNames.length) return links

    const roots = this.config.getResolveRoots(doc)
    const rootsWithDir = [path.dirname(doc.fileName), ...roots]
    const regexp = new RegExp(`\\b(${linkAttributeNames.join('|')})=['"]([^'"]+)['"]`, 'g')
    const remote = /^\w+:\/\// // 是否是远程路径，如 "http://" ...
    doc.getText().replace(regexp, (raw, tag: string, key: string, index: number) => {
      const isRemote = remote.test(key)
      let file: string | undefined
      if (isRemote) {
        file = key
      } else if (key.startsWith('/')) {
        // 绝对路径解析
        file = roots.map(root => path.join(root, key)).find(f => fs.existsSync(f))
      } else {
        file = rootsWithDir.map(dir => path.resolve(dir, key)).find(file => fs.existsSync(file))
      }

      if (file) {
        const offset = index + tag.length + 2
        const startPoint = doc.positionAt(offset)
        const endPoint = doc.positionAt(offset + key.length)
        links.push(new DocumentLink(new Range(startPoint, endPoint), isRemote ? Uri.parse(file) : Uri.file(file)))
      }
      return raw
    })

    return links
  }
}
