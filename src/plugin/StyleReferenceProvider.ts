import {ReferenceProvider, Position, CancellationToken, TextDocument, Location, Uri} from 'vscode'
import { Config } from './lib/config'
import { getTagAtPosition } from './lib/getTagAtPositionForWxml'
import { getClass } from './lib/StyleFile'

export class StyleReferenceProvider implements ReferenceProvider {
  constructor(public config: Config) {}

  public async provideReferences(document: TextDocument, position: Position, options: { includeDeclaration: boolean }, token: CancellationToken) {

    const tag = getTagAtPosition(document, position)
    const locs: Location[] = []

    if (tag && tag.attrName === 'class' && tag.posWord) {
      const className = tag.posWord
      getClass(document, this.config).forEach(styfile => {
        styfile.styles.forEach(sty => {
          if (sty.name === className) {
            locs.push(new Location(Uri.file(styfile.file), sty.pos))
          }
        })
      })
    }

    return locs
  }
}
