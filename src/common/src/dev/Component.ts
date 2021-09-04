/* tslint:disable */
export interface Component {
  name: string
  docLink?: string
  since?: string
  desc: string[]
  attrs?: ComponentAttr[]
  authorize?: any
  relateApis?: any[]
  notices?: string[]
  tips?: string[]
  bugs?: string[]
}
export interface ComponentAttrValue {
  value: string
  desc?: string
  since?: string
}
export interface ComponentAttr {
  name: string
  type?: any
  desc?: string[]
  required?: boolean
  since?: string
  defaultValue?: string
  enum?: any[]
  extras?: any[]
  subAttrs?: { equal: string; attrs: ComponentAttr[] }[]
}
