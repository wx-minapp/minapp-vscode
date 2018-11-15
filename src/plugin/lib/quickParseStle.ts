const styleRegexp = /\.[a-zA-Z][\w-\d_]*/g
const styleWithDocRegexp = /\/\*([\s\S]*?)\*\/[\s\r\n]*[^\.\{\}]*\.([a-zA-Z][\w-\d_]*)/g

const styleSingleCommentRegexp = /\/\/.*/g
const styleMultipleCommentRegExp = /\/\*[\s\S]*?\*\//g

const startStarRegexp = /^\s*\*+ ?/mg

/**
 * 解析样式文件内容成 className 和 doc 的形式
 *
 * 样式文件可能是 scss/less/css 所以不需要解析成 ast，只需要用正则即可
 */
export function quickParseStyle(styleContent: string) {
  // 先获取所有的 className
  const classNames = styleContent
    .replace(styleSingleCommentRegexp, '')            // 去除单行注释
    .replace(styleMultipleCommentRegExp, '')          // 去除多行注释
    .match(styleRegexp) || []


  const style = unique(classNames).map(mapClassnameToStyleDoc)

  // 再来获取带文档的 className
  styleContent.replace(styleWithDocRegexp, (raw, doc, name) => {
    style.some(s => {
      if (s.name === name) s.doc = parseDoc(doc)
      return s.name === name
    })
    return ''
  })

  return style
}

function parseDoc(doc: string) {
  return doc.replace(startStarRegexp, '').trim()
}
function unique(names: string[]) {
  let obj: any = {}
  names.forEach(n => obj[n] = true)
  return Object.keys(obj)
}
function mapClassnameToStyleDoc(className: string) {
  return {
    name: className.substr(1),
    doc: ''
  }
}
