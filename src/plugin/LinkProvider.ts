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

  async provideDocumentLinks(doc: TextDocument, token: CancellationToken) {
    return this.getLinks(doc)
  }

  private getLinks(doc: TextDocument) {
    let links: DocumentLink[] = []
    let { linkAttributeNames } = this.config
    if (!linkAttributeNames.length) return links

    let roots = this.config.getResolveRoots(doc)
    const rootsWithDir = [path.dirname(doc.fileName), ...roots]
    let regexp = new RegExp(`\\b(${linkAttributeNames.join('|')})=['"]([^'"]+)['"]`, 'g')
    let remote = /^\w+:\/\// // 是否是远程路径，如 "http://" ...
    doc.getText().replace(regexp, (raw, tag: string, key: string, index: number) => {
      let isRemote = remote.test(key)
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
        let offset = index + tag.length + 2
        let startPoint = doc.positionAt(offset)
        let endPoint = doc.positionAt(offset + key.length)
        links.push(new DocumentLink(new Range(startPoint, endPoint), isRemote ? Uri.parse(file) : Uri.file(file)))
      }
      return raw
    })

    return links
  }
}
