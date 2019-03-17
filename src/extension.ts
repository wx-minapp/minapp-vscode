/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import { ExtensionContext, languages, workspace } from 'vscode'

import LinkProvider from './plugin/LinkProvider'
import HoverProvider from './plugin/HoverProvider'
import WxmlFormatter from './plugin/WxmlFormatter'
import PrettyHtmlEditProvider from './plugin/PrettyhtmlEditProvider'
import PrettierProvider from './plugin/PrettierProvider'

import WxmlAutoCompletion from './plugin/WxmlAutoCompletion'
import PugAutoCompletion from './plugin/PugAutoCompletion'
import VueAutoCompletion from './plugin/VueAutoCompletion'
import WxmlDocumentHighlight from './plugin/WxmlDocumentHighlight'

import ActiveTextEditorListener from './plugin/ActiveTextEditorListener'

import { config, configActivate, configDeactivate } from './plugin/lib/config'
import { PropDefinitionProvider } from './plugin/PropDefinitionProvider'


export function activate(context: ExtensionContext) {
  // console.log('minapp-vscode is active!')
  configActivate()

  if (!config.disableAutoConfig) {
    autoConfig()
  }

  let formatter
  switch (config.wxmlFormatter) {
    case 'prettier':
      formatter = new PrettierProvider(config.prettier)
      break
    case 'prettyHtml':
      formatter = new PrettyHtmlEditProvider(config.prettyHtml)
      break
    default:
      formatter = new WxmlFormatter(config)
      break
  }
  const autoCompletionWxml = new WxmlAutoCompletion(config)
  const hoverProvider = new HoverProvider(config)
  const linkProvider = new LinkProvider(config)
  const autoCompletionPug = new PugAutoCompletion(config)
  const autoCompletionVue = new VueAutoCompletion(autoCompletionPug, autoCompletionWxml)
  const documentHighlight = new WxmlDocumentHighlight(config)
  const propDefinitionProvider = new PropDefinitionProvider(config)

  const wxmls = config.documentSelector.map(l => schemes(l))
  const pug = schemes('wxml-pug')
  const vue = schemes('vue')

  context.subscriptions.push(
    // 给模板中的 脚本 添加特殊颜色
    new ActiveTextEditorListener(config),

    // hover 效果
    languages.registerHoverProvider([pug, vue].concat(wxmls), hoverProvider),

    // 添加 link
    languages.registerDocumentLinkProvider([pug].concat(wxmls), linkProvider),

    // 高亮匹配的标签
    languages.registerDocumentHighlightProvider(wxmls, documentHighlight),

    // 格式化
    languages.registerDocumentFormattingEditProvider(wxmls, formatter),
    languages.registerDocumentRangeFormattingEditProvider(wxmls, formatter),


    // DefinitionProvider
    languages.registerDefinitionProvider([pug].concat(wxmls), propDefinitionProvider),

    // 自动补全
    languages.registerCompletionItemProvider(wxmls, autoCompletionWxml, '<', ' ', ':', '@', '.', '-', '"', '\''),
    languages.registerCompletionItemProvider(pug, autoCompletionPug, '\n', ' ', '(', ':', '@', '.', '-', '"', '\''),
    // trigger 需要是上两者的和
    languages.registerCompletionItemProvider(vue, autoCompletionVue, '<', ' ', ':', '@', '.', '-', '(', '"', '\'')
  )
}

export function deactivate() {
  configDeactivate()
}

function autoConfig() {
  let c = workspace.getConfiguration()
  const updates: Array<{ key: string, map: any }> = [
    {
      key: 'files.associations',
      map: {
        '*.cjson': 'jsonc',
        '*.wxss': 'css',
        '*.wxs': 'javascript'
      }
    },
    {
      key: 'emmet.includeLanguages',
      map: {
        wxml: 'html'
      }
    }
  ]

  updates.forEach(({ key, map }) => {
    let oldMap = c.get(key, {}) as any
    let appendMap: any = {}
    Object.keys(map).forEach(k => {
      if (!(oldMap.hasOwnProperty(k))) appendMap[k] = map[k]
    })
    if (Object.keys(appendMap).length) {
      c.update(key, { ...oldMap, ...appendMap }, true)
    }
  })

  c.update('minapp-vscode.disableAutoConfig', true, true)
}

export function schemes(key: string) {
  return { scheme: 'file', language: key }
}
