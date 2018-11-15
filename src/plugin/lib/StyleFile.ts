import * as fs from 'fs'
import { quickParseStyle } from './quickParseStle'

export interface Style {
  name: string
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
    return cache.value
  } catch (e) {
    return {
      file,
      styles: []
    }
  }
}
