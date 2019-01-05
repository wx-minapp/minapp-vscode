/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/
import { TextDocument, Position, Range, window, workspace } from 'vscode'
import { Config } from './config'
import * as fs from 'fs'
import {Languages, LanguageConfig} from './language'
import { EOL } from 'os'

// <template lang="wxml/pug/wxml-pug" minapp="native/wepy/mpvue"> ；默认 minapp="mpvue"
const vueTemplateMinappStartTag = /^\s*<template\b[^>]*(?:minapp)=['"](\w+)['"][^>]*>/
const vueTemplateLangStartTag = /^\s*<template\b[^>]*(?:x?lang)=['"]([\w-]+)['"][^>]*>/
const vueTemplateEndTag = /<\/template>\s*$/

export function getLanguage(doc: TextDocument, pos: Position): undefined | LanguageConfig {
  let minapp: undefined | keyof Languages
  if (doc.languageId === 'wxml' || doc.languageId === 'wxml-pug') {
    minapp = 'native'
  } else {
    doc.getText().split(/\r?\n/).some((text, i) => {
      if (!minapp && vueTemplateMinappStartTag.test(text)) minapp = RegExp.$1.replace(/['"]/g, '')
      if (i === pos.line) return true
      if (minapp && vueTemplateEndTag.test(text)) minapp = undefined
      return false
    })
    if (!minapp) minapp = 'mpvue'
  }

  return minapp && Languages[minapp] ? Languages[minapp] : undefined
}

export function getLangForVue(doc: TextDocument, pos: Position) {
  let lang: string | undefined
  doc.getText().split(/\r?\n/).some((text, i) => {
    if (!lang && vueTemplateLangStartTag.test(text)) lang = RegExp.$1.replace(/['"]/g, '')
    if (i === pos.line) return true
    if (lang && vueTemplateEndTag.test(text)) lang = undefined
    return false
  })
  return lang
}

export function getCustomOptions(config: Config, document: TextDocument) {
  return config.disableCustomComponentAutocomponent || document.languageId !== 'wxml'
    ? undefined
    : {filename: document.fileName, resolves: config.getResolveRoots(document)}
}

export function getTextAtPosition(doc: TextDocument, pos: Position, charRegExp: RegExp) {
  let line = doc.lineAt(pos.line).text
  let mid = pos.character - 1
  if (!(charRegExp.test(line[mid]))) return
  let str = line[mid]

  let i = mid
  while (++i < line.length) {
    if (charRegExp.test(line[i])) str += line[i]
    else break
  }

  i = mid
  while (--i >= 0) {
    if (charRegExp.test(line[i])) str = line[i] + str
    else break
  }
  return str
}

export function getLastChar(doc: TextDocument, pos: Position) {
  return doc.getText(new Range(new Position(pos.line, pos.character - 1), pos))
}

/**
 * 获取 vscode 编辑器打开的文件的内容
 *
 * 不要直接使用 fs 去读取文件内容，因为在编辑器中文件可能并没有保存到本地，也就是说 fs 拿到的可能不是最新的内容
 */
export function getFileContent(file: string) {
  let editor = window.visibleTextEditors.find(e => e.document.fileName === file)
  return editor ? editor.document.getText() : fs.readFileSync(file).toString()
}


/** 全局匹配 */
export function match(content: string, regexp: RegExp) {
  let mat: RegExpExecArray | null
  let res: RegExpExecArray[] = []
  // tslint:disable:no-conditional-assignment
  while (mat = regexp.exec(content)) res.push(mat)
  return res
}

/** 获取根目录 */
export function getRoot(doc: TextDocument) {
  let wf = workspace.getWorkspaceFolder(doc.uri)
  if (!wf) return
  return wf.uri.fsPath
}

/** 根据文件内容和位置，获取 vscode 的 Position 对象 */
export function getPositionFromIndex(content: string, index: number) {
  let text = content.substring(0, index)
  let lines = text.split(/\r?\n/)
  let line = lines.length - 1
  return new Position(line, lines[line].length)
}


export function getEOL(doc: TextDocument) {
  const eol = workspace.getConfiguration('files', doc.uri).get('eol', EOL)
  // vscode 更新导致获取的配置换行符可能为 "auto"，参见：https://github.com/wx-minapp/minapp-vscode/issues/6
  return ['\n', '\r\n', '\r'].indexOf(eol) < 0 ? EOL : eol
}
