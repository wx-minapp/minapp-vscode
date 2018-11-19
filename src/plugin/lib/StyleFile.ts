import * as fs from 'fs'
import * as path from 'path'
import { TextDocument, window, Position } from 'vscode'
import { quickParseStyle } from './quickParseStle'
import { Config } from './config'
import { getRoot } from './helper'

export interface Style {
  name: string
  pos: Position
  doc: string
}

export interface StyleFile {
  file: string
  styles: Style[]
}

const fileCache: {[file: string]: {mtime: Date, value: StyleFile}} = {}

export function parseStyleFile(file: string) {
  try {
    let cache = fileCache[file]
    let editor = window.visibleTextEditors.find(e => e.document.fileName === file)
    if (editor) {
      let content = editor.document.getText()
      return {file, styles: quickParseStyle(content)}
    } else {
      const stat = fs.statSync(file)
      if (cache && stat.mtime <= cache.mtime) {
        return cache.value
      }
      cache = {
        mtime: stat.mtime,
        value: {
          file,
          styles: quickParseStyle(fs.readFileSync(file).toString())
        }
      }
      fileCache[file] = cache
      return cache.value
    }
  } catch (e) {
    return {
      file,
      styles: []
    }
  }
}


export function getClass(doc: TextDocument, config: Config) {
  return [...getLocalClass(doc, config), ...getGlobalClass(doc, config)]
}

export function getLocalClass(doc: TextDocument, config: Config) {
  let exts = config.styleExtensions || []
  let dir = path.dirname(doc.fileName)
  let basename = path.basename(doc.fileName, path.extname(doc.fileName))
  let localFile = exts.map(e => path.join(dir, basename + '.' + e)).find(f => fs.existsSync(f))
  return localFile ? [parseStyleFile(localFile)] : []
}

export function getGlobalClass(doc: TextDocument, config: Config) {
  let root = getRoot(doc) as string
  if (!root) return []
  let files = (config.globalStyleFiles || []).map(f => path.resolve(root, f))
  return files.map(parseStyleFile)
}
