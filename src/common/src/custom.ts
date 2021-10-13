/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import { ConditionalCacheableFile, readdir, readFile, exists, stat } from './lib/'
import { JSON_REGEXP, Component } from './dev/'
import { map, series } from './mora/async';
import { parseAttrs } from './parseAttrs'
import * as JSON5 from 'json5'
import * as path from 'path'
import { noderequire } from '../../utils/noderequire';

const JSON_CACHE: { [key: string]: ConditionalCacheableFile } = {}

export interface CustomOptions {
  filename: string
  resolves?: string[]
}

export { Component }

export async function getCustomComponents(co?: CustomOptions): Promise<Component[]> {
  if (!co) return []
  const f = getCachedJsonFile(co.filename)
  try {
    const data = await f.getContent()
    const jsonfile = f.filename as string
    if (data && data.usingComponents) {
      return await map(
        Object.keys(data.usingComponents),
        async name => {
          const filepath = data.usingComponents[name]
          try {
            const comp = await parseComponentFile(filepath, jsonfile, co.resolves)
            comp.name = name
            return comp
          } catch (e) {
            return { name } as Component
          }
        },
        0
      )
    }
  } catch (e) {}

  return []
}

async function parseComponentFile(
  filepath: string,
  refFile: string,
  resolves: string[] | undefined
): Promise<Component> {
  if (filepath.startsWith('~')) filepath = filepath.substr(1)
  resolves = resolves || []
  const localResolves = filepath.startsWith('.')
    ? [path.dirname(refFile)] // 只使用相对目录
    : filepath.startsWith('/')
    ? resolves // 只使用绝对目录
    : [path.dirname(refFile), ...resolves] // 使用相对和绝对目录

  let found: string | undefined
  await series(localResolves, async root => {
    if (found) return

    await series(['', '.js', '.ts'], async ext => {
      if (found) return
      const f = path.join(root, filepath + ext)
      try {
        const stats = await stat(f)
        if (stats.isFile()) {
          found = f
        } else if (stats.isDirectory() && ext === '') {
          // 解析 index 文件 或 package.json 中的 main 文件
          if (f.includes('node_modules')) {
            try {
              const pkg = noderequire(path.join(f, 'package.json'))
              if (pkg.main) found = path.resolve(f, pkg.main)
            } catch (e) {}
          }

          if (!found) {
            // 看看有没有 index.ts 或 index.js
            const f1 = path.join(f, 'index.js')
            const f2 = path.join(f, 'index.ts')
            if (await exists(f1)) found = f1
            else if (await exists(f2)) found = f2
          }
        }
      } catch (e) {}
    })
  })

  if (found) {
    const f = getCachedJsonFile(found)
    const data = await f.getContent()
    if (data && data.minapp && data.minapp.component) {
      return data.minapp.component
    }
    // 实时解析
    const attrs = parseAttrs((await readFile(found)).toString())
    if (attrs.length) return { attrs, path: found } as any
    return { path: found } as any;
  }
  return {} as any
}

function getCachedJsonFile(filename: string) {
  const dir = path.dirname(filename)
  const base = path.basename(filename, path.extname(filename))
  const cacheKey = path.join(dir, base)
  if (!JSON_CACHE[cacheKey]) {
    JSON_CACHE[cacheKey] = new ConditionalCacheableFile(
      () => getJsonFilePath(dir, base),
      (name, buf) => JSON5.parse(buf.toString())
    )
  }
  return JSON_CACHE[cacheKey]
}

/**
 * 根据目录中的某个文件来获取当前目录中同名的 json 文件
 *
 * @export
 * @param {string} filename 目录中的某个文件
 */
async function getJsonFilePath(dir: string, base: string) {
  base += '.'
  const names = await readdir(dir)
  const name = names.find(n => n.startsWith(base) && !n.substr(base.length).includes('.') && JSON_REGEXP.test(n))
  return name ? path.join(dir, name) : undefined
}
