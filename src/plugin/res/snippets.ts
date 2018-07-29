export interface Snippet {
  body: string | string[]
  description?: string
  /** 程序中生成的，不需要配置 */
  markdown?: string
}
export interface Snippets { [key: string]: Snippet }

export const PugSnippets: Snippets = {
  icon: {
    body: 'icon(type=___${1|success,success_no_circle,info,warn,waiting,cancel,download,search,clear|}___ size=___${2:23}___ color=___$3___) $0'
  },
}
export const WxmlSnippets: Snippets = {
  'swiper': {
    body: [
      '<swiper indicator-dots=___{{${1|true,false|}}}___ autoplay=___{{${2|true,false|}}}___ interval=___{{${3:5000}}}___ duration=___{{${4:500}}}___>',
      '\t<block wx:for=___{{${5:imgUrls}}}___>',
      '\t\t<swiper-item>',
      '\t\t\t<image class=___${6:swiper-image}___ src=___{{${7:item}}}___ />',
      '\t\t</swiper-item>',
      '\t</block>',
      '</swiper>$0'
    ]
  },
  'icon': {
    body: '<icon type=___${1|success,success_no_circle,info,warn,waiting,cancel,download,search,clear|}___ size=___${2:23}___ color=___$3___ /> $0'
  },
  'button': {
    body: [
      '<button class=___${1:btn}___ type=___${2|primary,default,warn|}___ loading=___{{${3:loading}}}___ disabled=___{{${4:disabled}}}___ bindtap=___${5:onTap}___>',
      '\t${7:按钮文本}',
      '</button>$0'
    ]
  },
  'picker time': {
    body: [
      '<picker mode=___time___ value=___{{${1:time}}}___ start=___${2:09:01}___ end=___${3:21:01}___ bindchange=___${4:bindTimeChange}___>',
      '\t<view>当前选择: {{${1:time}}}</view>',
      '</picker>$0'
    ]
  },
  'picker date': {
    body: [
      '<picker mode=___date___ value=___{{${1:date}}}___ start=___${2:2015-09-01}___ end=___${3:2017-09-01}___ bindchange=___${4:bindDateChange}___>',
      '\t<view>当前选择: {{${1:date}}}</view>',
      '</picker>$0'
    ]
  },
  'picker region': {
    body: [
      '<picker mode=___region___ value=___{{${1:region}}}___ bindchange=___${3:bindRegionChange}___>',
      '\t<view>当前选择：{{${1:region}[0]}}，{{${1:region}[1]}}，{{${1:region}[2]}}</view>',
      '</picker>$0'
    ]
  },
  'checkbox-group': {
    body: [
      '<checkbox-group>',
      '\t<label wx:for=___{{${1:array}}}___ wx:for-item=___${2:item}___ wx:key=___{{${2:item}.${3:id}}}___>',
      '\t\t<checkbox value=___{{${2:item}.${4:value}}}___ /> {{${2:item}.${5:name}}}',
      '\t</label>',
      '</checkbox-group>$0'
    ]
  },
  'radio-group': {
    body: [
      '<radio-group>',
      '\t<label wx:for=___{{${1:array}}}___ wx:for-item=___${2:item}___ wx:key=___{{${2:item}.${3:id}}}___>',
      '\t\t<radio value=___{{${2:item}.${4:value}}}___ /> {{${2:item}.${5:name}}}',
      '\t</label>',
      '</radio-group>$0'
    ]
  }
}
