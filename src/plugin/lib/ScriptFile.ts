import { getFileContent, match, getPositionFromIndex } from './helper'
import * as path from 'path'
import * as fs from 'fs'
import { Location, Uri, Position, Range } from 'vscode'

function parseScriptFile(file: string, type: string, prop: string) {
  let content = getFileContent(file)
  let locs: Location[] = []

  let reg: RegExp | null = null
  /**
   * 空白符正则
   */
  const s = '\\s*'

  if (type === 'prop') {
    reg = new RegExp(`^${s}` + prop + `${s}:`, 'gm')
  } else if (type === 'method') {
    // prop: () => {}
    // prop: function() {}
    // prop: function xxx() {}
    // prop: (e:{}) => {}
    // reg = new RegExp(`^${s}` + prop + `(${s}:${b}${s}=>|${s}:${s}function|${s}${b}${s}\\{)`, 'gm')

    /**
     * 函数参数表正则
     * 允许参数跨行
     * - 无参数`()`
     * - 有参数`( e )`
     * - 参数跨行
     * ```ts
     *  (
     *    e: event
     *  )
     * ```
     */
    const param = `\\([\\s\\S]*?\\)`
    const async = `(async\\s+)?`
    /**
     * 方法定义正则
     * - 普通方法`prop(...){`
     * - 异步方法`async prop(...){`
     */
    const methodReg = `${async}${prop}${s}${param}${s}\\{`
    /**
     * 属性式函数定义 正则
     * - 箭头函数`prop: (...) =>`
     * - 异步箭头函数`prop: async (...) =>`
     * - 普通函数声明`prop: function...`
     * - 异步函数声明`prop: async function...`
     */
    const propFuncReg = `${prop}${s}:${async}(${param}${s}=>|function\\W)`
    reg = new RegExp(`^${s}(${methodReg}|${propFuncReg})`, 'gm')
  }

  match(content, reg!).forEach(mat => {
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
