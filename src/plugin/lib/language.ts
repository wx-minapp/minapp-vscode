/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import { CustomAttr, LanguageConfig } from '@minapp/common/dist/dev/config'
import { Component } from '@minapp/common'

const EVENT_ATTRS: CustomAttr[] = [
  { name: 'touchstart' },
  { name: 'touchmove' },
  { name: 'touchcancel' },
  { name: 'touchend' },
  { name: 'tap' },
  { name: 'longpress', since: '1.5.0' },
  { name: 'longtap' },
  { name: 'transitionend' },
  { name: 'animationstart' },
  { name: 'animationiteration' },
  { name: 'animationend' },
]
const BASE_ATTRS: CustomAttr[] = [
  { name: 'id' },
  { name: 'class' },
  { name: 'style', desc: ['组件的内联样式'] },
  { name: 'hidden', desc: ['组件是否隐藏'] },
]

const WXS_COMPONENT: Component = {
  name: 'wxs',
  desc: ['模板中的 wxs 模块'],
  docLink: 'https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxs/01wxs-module.html',
  attrs: [{ name: 'src' }, { name: 'module' }],
}
const WX_SUB_ATTRS: CustomAttr[] = [
  { name: 'if', addBrace: true },
  { name: 'elif', addBrace: true },
  { name: 'else', boolean: true },
  { name: 'for', addBrace: true },
  { name: 'key' },
  { name: 'for-item' },
  { name: 'for-index' },
]

export { LanguageConfig }
export interface Languages {
  [language: string]: LanguageConfig
}
export const Languages: Languages = {
  native: {
    id: 'wxml',
    baseAttrs: BASE_ATTRS,
    event: {
      prefixes: ['bind:', 'catch:'],
      modifiers: [],
      attrs: EVENT_ATTRS,
    },
    custom: {
      'wx:': {
        modifiers: [],
        attrs: [...WX_SUB_ATTRS],
      },
    },
    components: [WXS_COMPONENT],
    noBasicAttrsComponents: ['wxs', 'template'],
  },
  wepy: {
    id: 'wepy',
    baseAttrs: BASE_ATTRS,
    event: {
      prefixes: ['@'],
      modifiers: ['user', 'stop', 'default'],
      attrs: EVENT_ATTRS,
    },
    custom: {
      'wx:': {
        modifiers: [],
        attrs: [...WX_SUB_ATTRS],
      },
    },
    components: [
      {
        name: 'repeat',
        desc: ['类似于通过wx:for循环渲染原生的wxml标签'],
        docLink:
          'https://tencent.github.io/wepy/document.html#/?id=%E7%BB%84%E4%BB%B6%E7%9A%84%E5%BE%AA%E7%8E%AF%E6%B8%B2%E6%9F%93',
        attrs: [
          // @ts-ignore
          { name: 'for', addBrace: true },
          { name: 'key' },
          { name: 'index' },
          { name: 'item' },
        ],
      },
    ],
    noBasicAttrsComponents: ['repeat'],
  },
  mpvue: {
    id: 'mpvue',
    baseAttrs: [
      { name: 'id' },
      { name: 'class' },
      { name: 'style', desc: ['组件的内联样式'] },
      {
        name: 'key',
        desc: ['Offer a way for you to say, “These two elements are completely separate - don’t re-use them.'],
      },
    ],
    event: {
      modifiers: ['stop', 'prevent', 'capture', 'self', 'once', 'passive'],
      prefixes: ['@'],
      attrs: EVENT_ATTRS,
    },
    custom: {
      ':': {
        modifiers: ['sync'],
        attrs: [{ name: 'class' }, { name: 'style' }],
      },
      'v-': {
        modifiers: [],
        attrs: [
          { name: 'if' },
          { name: 'else-if' },
          { name: 'else' },
          { name: 'show' },
          { name: 'for' },
          { name: 'modal' },
          { name: 'once', boolean: true },
          { name: 'html', boolean: true },
        ],
      },
    },
    components: [],
    noBasicAttrsComponents: [],
  },
  mpx: {
    id: 'mpx',
    baseAttrs: BASE_ATTRS,
    event: {
      prefixes: ['bind:', 'catch:'],
      modifiers: [],
      attrs: EVENT_ATTRS,
    },
    custom: {
      'wx:': {
        modifiers: [],
        attrs: [...WX_SUB_ATTRS, { name: 'model', addBrace: true }, { name: 'class', addBrace: true }],
      },
    },
    components: [WXS_COMPONENT],
    noBasicAttrsComponents: ['wxs', 'template'],
  },
}
