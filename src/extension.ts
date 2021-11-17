/******************************************************************
MIT License http://www.opensource.org/licenses/mit-license.php
Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import { ExtensionContext, commands, languages, workspace } from 'vscode'

import LinkProvider from './plugin/LinkProvider'
import HoverProvider from './plugin/HoverProvider'
import WxmlFormatter from './plugin/WxmlFormatter'
import { PropDefinitionProvider } from './plugin/PropDefinitionProvider'
import WxmlAutoCompletion from './plugin/WxmlAutoCompletion'
import PugAutoCompletion from './plugin/PugAutoCompletion'
import VueAutoCompletion from './plugin/VueAutoCompletion'
import ActiveTextEditorListener from './plugin/ActiveTextEditorListener'
import { config, configActivate, configDeactivate } from './plugin/lib/config'
import { createMiniprogramComponent } from './commands/createMiniprogramComponent'
import { COMMANDS, CONTEXT_KEYS } from './commands/constants'
import { extractMiniprogramComponent } from './commands/extractMiniprogramComponent'

export function activate(context: ExtensionContext): void {
  configActivate()

  if (!config.disableAutoConfig) {
    autoConfig()
  }

  const formatter = new WxmlFormatter(config)
  const autoCompletionWxml = new WxmlAutoCompletion(config)
  const hoverProvider = new HoverProvider(config)
  const linkProvider = new LinkProvider(config)
  const autoCompletionPug = new PugAutoCompletion(config)
  const autoCompletionVue = new VueAutoCompletion(autoCompletionPug, autoCompletionWxml)
  const propDefinitionProvider = new PropDefinitionProvider(config)

  const wxml = config.documentSelector.map(l => schemes(l))
  const pug = schemes('wxml-pug')
  const vue = schemes('vue')
  const enter = config.showSuggestionOnEnter ? ['\n'] : []

  context.subscriptions.push(
    // 注册命令
    commands.registerCommand(COMMANDS.createComponent, createMiniprogramComponent),
    commands.registerCommand(COMMANDS.extractComponent, extractMiniprogramComponent),

    // 给模板中的 脚本 添加特殊颜色
    new ActiveTextEditorListener(config),

    // hover 效果
    languages.registerHoverProvider([pug, vue].concat(wxml), hoverProvider),

    // 添加 link
    languages.registerDocumentLinkProvider([pug].concat(wxml), linkProvider),

    // 格式化
    languages.registerDocumentFormattingEditProvider(wxml, formatter),
    languages.registerDocumentRangeFormattingEditProvider(wxml, formatter),

    // DefinitionProvider
    languages.registerDefinitionProvider([pug].concat(wxml), propDefinitionProvider),

    // 自动补全
    languages.registerCompletionItemProvider(
      wxml,
      autoCompletionWxml,
      '<',
      ' ',
      ':',
      '@',
      '.',
      '-',
      '"',
      "'",
      '/',
      ...enter
    ),
    languages.registerCompletionItemProvider(pug, autoCompletionPug, '\n', ' ', '(', ':', '@', '.', '-', '"', "'"),
    // trigger 需要是上两者的和
    languages.registerCompletionItemProvider(vue, autoCompletionVue, '<', ' ', ':', '@', '.', '-', '(', '"', "'")
  )

  // 标记插件激活状态
  commands.executeCommand('setContext', CONTEXT_KEYS.init, true);
}

export function deactivate(): void {
  configDeactivate()
}

function autoConfig() {
  const c = workspace.getConfiguration()
  const updates: { key: string; map: any }[] = [
    {
      key: 'files.associations',
      map: {
        '*.cjson': 'jsonc',
        '*.wxss': 'css',
        '*.wxs': 'javascript',
      },
    },
    {
      key: 'emmet.includeLanguages',
      map: {
        wxml: 'html',
      },
    },
  ]

  updates.forEach(({ key, map }) => {
    const oldMap = c.get(key, {}) as any
    const appendMap: any = {}
    Object.keys(map).forEach(k => {
      if (!oldMap.hasOwnProperty(k)) appendMap[k] = map[k]
    })
    if (Object.keys(appendMap).length) {
      c.update(key, { ...oldMap, ...appendMap }, true)
    }
  })

  c.update('minapp-vscode.disableAutoConfig', true, true)
}

export function schemes(key: string): any {
  return { scheme: 'file', language: key }
}
