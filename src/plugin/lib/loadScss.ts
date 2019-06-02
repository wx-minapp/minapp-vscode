import { Options } from 'sass'
import { config } from './config'
import { readFileSync } from 'fs'
import { requireLocalPkg } from './requirePackage'

/**
 * 尝试加载本地 node-sass/sass
 */
function autoRequireSass(file: string) {
    try {
        return requireLocalPkg(file, 'sass')
    } catch (error) {
        return requireLocalPkg(file, 'node-sass')

    }
}
/**
 * 渲染scss
 * @param op sass 配置
 */
export default function(op: Options): string {
    try {
        const options: Options = {
            ...config.sass,
            ...op,
            sourceMap: false,
            sourceMapContents: false,
        }
        return autoRequireSass(op.file || process.cwd()).renderSync(options).css.toString()
    } catch (error) {
        // sass 渲染失败退回
        console.error(error)
        return op.data || (op.file ? readFileSync(op.file).toString() : '')
    }
}
