/******************************************************************
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Mora <qiuzhongleiabc@126.com> (https://github.com/qiu8310)
*******************************************************************/

import { CustomAttr, LanguageConfig } from '../../common/src/dev/config'
import { Component } from '../../common/src'

// https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxml/event.html
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
  { name: 'touchforcechange', desc: ['在支持 3D Touch 的 iPhone 设备，重按时会触发'], since: '1.9.90' },
]
const BASE_ATTRS: CustomAttr[] = [
  { name: 'id' },
  { name: 'class' },
  { name: 'style', desc: ['组件的内联样式'] },
  { name: 'hidden', desc: ['组件是否隐藏'] },
  { name: 'mark:', desc: [
    '事件标记数据',
    '[Wechat Document Reference](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxml/event.html#mark)'
  ], since: '2.7.1' },
  // 无障碍访问 a11y
  { name: "aria-hidden", since: "2.7.1"},
  { name: "aria-role", since: "2.7.1"},
  { name: "aria-label", since: "2.7.1"},
  { name: "aria-checked", since: "2.7.1"},
  { name: "aria-disabled", since: "2.7.1"},
  { name: "aria-describedby", since: "2.7.1"},
  { name: "aria-expanded", since: "2.7.1"},
  { name: "aria-haspopup", since: "2.7.1"},
  { name: "aria-selected", since: "2.7.1"},
  { name: "aria-required", since: "2.7.1"},
  { name: "aria-orientation", since: "2.7.1"},
  { name: "aria-valuemin", since: "2.7.1"},
  { name: "aria-valuemax", since: "2.7.1"},
  { name: "aria-valuenow", since: "2.7.1"},
  { name: "aria-readonly", since: "2.7.1"},
  { name: "aria-multiselectable", since: "2.7.1"},
  { name: "aria-controls", since: "2.7.1"},
  { name: "tabindex", since: "2.7.1"},
  { name: "aria-labelledby", since: "2.7.1"},
  { name: "aria-orientation", since: "2.7.1"},
  { name: "aria-modal", since: "2.7.1"},
  { name: "aria-live", since: "2.7.1"},
  { name: "aria-atomic", since: "2.7.1"},
  { name: "aria-relevant", since: "2.7.1"}
]

const WXS_COMPONENT: Component = {
  name: 'wxs',
  desc: ['模板中的 wxs 模块'],
  docLink: 'https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxs',
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
      prefixes: ['bind:', 'catch:', 'capture-bind:', 'capture-catch:', 'mut-bind:'],
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
          'https://wepyjs.gitee.io/wepy-docs/1.x/#/?id=%e7%bb%84%e4%bb%b6%e7%9a%84%e5%be%aa%e7%8e%af%e6%b8%b2%e6%9f%93',
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
