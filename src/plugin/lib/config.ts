/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import * as vscode from 'vscode'
import * as path from 'path'
import { Snippets } from '../res/snippets'
import { Options } from 'sass'

let listener: vscode.Disposable

export interface Config {
  getResolveRoots: (doc: vscode.TextDocument) => string[]
  /** wxml 格式化时一行中允许的最长的字符串长度 */
  formatMaxLineCharacters: number,
  /** 是否禁用自定义的组件补全 */
  disableCustomComponentAutocomponent: boolean
  /** 解析自定义组件的根目录 */
  resolveRoots: string[]
  /** 使用 LinkProvider 处理的标签属性 */
  linkAttributeNames: string[]
  /** 是否禁用颜色高亮 */
  disableDecorate: boolean
  /** 是否高亮复杂的语句 */
  decorateComplexInterpolation: boolean
  /** 自定义高亮样式 */
  decorateType: any
  /** 用户自定义的 snippets */
  snippets: { wxml?: Snippets, pug?: Snippets }

  /** 自我闭合的标签 */
  selfCloseTags: string[]

  /** 默认在启动时会自动相关文件关联的配置项，配置成功后会将此配置自动设置成 true，避免下次启动再重新配置 */
  disableAutoConfig: boolean

  wxmlQuoteStyle: string
  pugQuoteStyle: string

  reserveTags: string[]

  /** 全局的样式文件 */
  globalStyleFiles: string[]
  /** 支持解析的样式文件后缀名 */
  styleExtensions: string[],
  /** wxml 格式化工具 */
  wxmlFormatter: 'wxml' | 'prettier' | 'prettyHtml',
  /** prettyHtml 格式化 */
  prettyHtml: Record<string, any>,
  /** prettier 格式化 */
  prettier: Record<string, any>
  /** 关联类型 */
  documentSelector: string[],
  /** */
  sass: Options
}

export const config: Config = {
  formatMaxLineCharacters: 100,
  disableCustomComponentAutocomponent: false,
  resolveRoots: [],
  getResolveRoots,
  linkAttributeNames: [],
  disableDecorate: false,
  decorateComplexInterpolation: true,
  decorateType: {},
  snippets: {},
  selfCloseTags: [],
  disableAutoConfig: false,
  wxmlQuoteStyle: '"',
  pugQuoteStyle: '\'',
  reserveTags: [],
  globalStyleFiles: [],
  styleExtensions: [],
  wxmlFormatter: 'wxml',
  prettyHtml: {},
  prettier: {},
  documentSelector: ['wxml'],
  sass: {}
}

function getConfig() {
  const minapp = vscode.workspace.getConfiguration('minapp-vscode')
  config.disableCustomComponentAutocomponent = minapp.get('disableCustomComponentAutocomponent', false)
  config.resolveRoots = minapp.get('resolveRoots', ['src', 'node_modules'])
  config.linkAttributeNames = minapp.get('linkAttributeNames', ['src'])
  config.formatMaxLineCharacters = minapp.get('formatMaxLineCharacters', 100)
  config.disableDecorate = minapp.get('disableDecorate', true)
  config.decorateComplexInterpolation = minapp.get('decorateComplexInterpolation', true)
  config.decorateType = minapp.get('decorateType', {})
  config.snippets = minapp.get('snippets', {})
  config.selfCloseTags = minapp.get('selfCloseTags', [])
  config.disableAutoConfig = minapp.get('disableAutoConfig', false)
  config.wxmlQuoteStyle = minapp.get('wxmlQuoteStyle', '"')
  config.pugQuoteStyle = minapp.get('pugQuoteStyle', '\'')
  config.reserveTags = minapp.get('reserveTags', [])
  config.globalStyleFiles = minapp.get('globalStyleFiles', [])
  config.styleExtensions = minapp.get('styleExtensions', [])
  config.wxmlFormatter = minapp.get('wxmlFormatter', 'wxml')
  config.prettyHtml = minapp.get('prettyHtml', {})
  config.prettier = minapp.get('prettier', {})
  config.documentSelector = minapp.get('documentSelector', ['wxml'])
  config.sass = minapp.get('sass', {})
}

function getResolveRoots(doc: vscode.TextDocument) {
  let root = vscode.workspace.getWorkspaceFolder(doc.uri) as vscode.WorkspaceFolder
  return root ? config.resolveRoots.map(r => path.resolve(root.uri.fsPath, r)) : []
}

export function configActivate() {
  listener = vscode.workspace.onDidChangeConfiguration(getConfig)
  getConfig()
}

export function configDeactivate() {
  listener.dispose()
}
