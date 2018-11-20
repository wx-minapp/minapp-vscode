import { Config } from './lib/config'
import {DefinitionProvider, TextDocument, Position, CancellationToken} from 'vscode'

export class PropDefinitionProvider implements DefinitionProvider {
  constructor(public config: Config) {}
  public async provideDefinition(document: TextDocument, position: Position, token: CancellationToken) {

    return []
  }
}
