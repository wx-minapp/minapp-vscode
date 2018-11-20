import { getFileContent, match, getPositionFromIndex } from './helper'
import * as path from 'path'
import * as fs from 'fs'
import { Location, Uri, Position, Range } from 'vscode'

function parseScriptFile(file: string, type: string, prop: string) {
  let content = getFileContent(file)
  let locs: Location[] = []

  let reg: RegExp | null = null
  let s = '\\s*'
  let b = `\\(${s}\\)`

  if (type === 'prop') {
    reg = new RegExp(`^${s}` + prop + `${s}:`, 'gm')
  } else if (type === 'method') {
    // prop: () => {}
    // prop: function() {}
    // prop: function xxx() {}
    // prop() {}
    reg = new RegExp(`^${s}` + prop + `(${s}:${b}${s}=>|${s}:${s}function|${s}${b}${s}\\{)`, 'gm')
  }

  match(content, reg as any).forEach(mat => {
    let pos = getPositionFromIndex(content, mat.index + mat[0].indexOf(prop))
    let endPos = new Position(pos.line, pos.character + prop.length)
    locs.push(new Location(Uri.file(file), new Range(pos, endPos)))
  })
  return locs
}

export function getProp(wxmlFile: string, type: string, prop: string) {
  let dir = path.dirname(wxmlFile)
  let base = path.basename(wxmlFile, path.extname(wxmlFile))

  let exts = ['js', 'ts']
  for (const ext of exts) {
    let file = path.join(dir, base + '.' + ext)
    if (fs.existsSync(file)) return parseScriptFile(file, type, prop)
  }

  return []
}
