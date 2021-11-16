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
  formatMaxLineCharacters: number
  /** 是否在按下 Enter 键后出自动补全 */
  showSuggestionOnEnter: boolean
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
  snippets: { wxml?: Snippets; pug?: Snippets }

  /** 自我闭合的标签 */
  selfCloseTags: string[]

  /** 默认在启动时会自动相关文件关联的配置项，配置成功后会将此配置自动设置成 true，避免下次启动再重新配置 */
  disableAutoConfig: boolean

  /**
   * 禁止插件的format功能，防止设置"editor.formatOnSave": true了的同学format产生不可预期的错误
   * 
   * https://github.com/wx-minapp/minapp-vscode/issues/83#issuecomment-958626391
   */
  disableFormat: boolean

  wxmlQuoteStyle: string
  pugQuoteStyle: string

  reserveTags: string[]

  /**
   * 创建组件时文件后缀类型
   */
  /** css文件 */
  cssExtname: 'wxss' | 'css' | 'styl' | 'less' | 'sass'| 'scss'
  /** js文件 */
  jsExtname: 'js' | 'coffee' | 'ts'
  /** wxml文件 */
  wxmlExtname: 'wxml' | 'vue' | 'wpy'


  /** 全局的样式文件 */
  globalStyleFiles: string[]
  /** 支持解析的样式文件后缀名 */
  styleExtensions: string[]
  /** wxml 格式化工具 */
  wxmlFormatter: 'wxml' | 'prettier' | 'prettyHtml'
  /** prettyHtml 格式化 */
  prettyHtml: Record<string, any>
  /** prettier 格式化 */
  prettier: Record<string, any>
  /** 关联类型 */
  documentSelector: string[]
  /** */
  sass: Options
}

export const config: Config = {
  formatMaxLineCharacters: 100,
  disableCustomComponentAutocomponent: false,
  showSuggestionOnEnter: false,
  resolveRoots: [],
  getResolveRoots,
  linkAttributeNames: [],
  disableDecorate: false,
  decorateComplexInterpolation: true,
  decorateType: {},
  snippets: {},
  selfCloseTags: [],
  disableAutoConfig: false,
  disableFormat: false,
  wxmlQuoteStyle: '"',
  pugQuoteStyle: '\'',
  reserveTags: [],
  globalStyleFiles: [],
  cssExtname: 'wxss',
  jsExtname: 'js',
  wxmlExtname: 'wxml',
  styleExtensions: [],
  wxmlFormatter: 'wxml',
  prettyHtml: {},
  prettier: {},
  documentSelector: ['wxml'],
  sass: {},
}

function getConfig() {
  const minapp = vscode.workspace.getConfiguration('minapp-vscode')
  config.disableCustomComponentAutocomponent = minapp.get('disableCustomComponentAutocomponent', false)
  config.showSuggestionOnEnter = minapp.get('showSuggestionOnEnter', false)
  config.resolveRoots = minapp.get('resolveRoots', ['src', 'node_modules'])
  config.linkAttributeNames = minapp.get('linkAttributeNames', ['src'])
  config.formatMaxLineCharacters = minapp.get('formatMaxLineCharacters', 100)
  config.disableDecorate = minapp.get('disableDecorate', true)
  config.decorateComplexInterpolation = minapp.get('decorateComplexInterpolation', true)
  config.decorateType = minapp.get('decorateType', {})
  config.snippets = minapp.get('snippets', {})
  config.selfCloseTags = minapp.get('selfCloseTags', [])
  config.disableAutoConfig = minapp.get('disableAutoConfig', false)
  config.disableFormat = minapp.get('disableFormat', false)
  config.wxmlQuoteStyle = minapp.get('wxmlQuoteStyle', '"')
  config.pugQuoteStyle = minapp.get('pugQuoteStyle', '\'')
  config.reserveTags = minapp.get('reserveTags', [])
  config.globalStyleFiles = minapp.get('globalStyleFiles', [])
  config.styleExtensions = minapp.get('styleExtensions', [])
  config.cssExtname = minapp.get('cssExtname', 'wxss'),
  config.jsExtname = minapp.get('jsExtname', 'js'),
  config.wxmlExtname = minapp.get('wxmlExtname', 'wxml'),
  config.wxmlFormatter = minapp.get('wxmlFormatter', 'wxml')
  config.prettyHtml = minapp.get('prettyHtml', {})
  config.prettier = minapp.get('prettier', {})
  config.documentSelector = minapp.get('documentSelector', ['wxml'])
  config.sass = minapp.get('sass', {})
}

function getResolveRoots(doc: vscode.TextDocument): string[] {
  const root = vscode.workspace.getWorkspaceFolder(doc.uri) as vscode.WorkspaceFolder
  return root ? config.resolveRoots.map(r => path.resolve(root.uri.fsPath, r)) : []
}

export function configActivate(): void {
  listener = vscode.workspace.onDidChangeConfiguration(getConfig)
  getConfig()
}

export function configDeactivate(): void {
  listener.dispose()
}
