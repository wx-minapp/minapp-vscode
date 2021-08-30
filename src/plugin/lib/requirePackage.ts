import * as path from 'path'
import * as resolve from 'resolve'
import { readPackageUpSync } from 'read-pkg-up'
import { existsSync } from 'fs'

function findPkg(fspath: string, pkgName: string): string | undefined {
  const res = readPackageUpSync({ cwd: fspath, normalize: false })
  const { root } = path.parse(fspath)
  if (
    res &&
    res.packageJson &&
    ((res.packageJson.dependencies && res.packageJson.dependencies[pkgName]) ||
      (res.packageJson.devDependencies && res.packageJson.devDependencies[pkgName]) ||
      existsSync(path.join(path.dirname(res.path), 'node_modules', pkgName)))
  ) {
    return resolve.sync(pkgName, { basedir: res.path })
  } else if (res && res.path) {
    const parent = path.resolve(path.dirname(res.path), '..')
    if (parent !== root) {
      return findPkg(parent, pkgName)
    }
  }
  return
}

/**
 * 优先尝试加载项目安装的npm包
 * @param fspath file system path starting point to resolve package
 * @param pkgName package's name to require
 * @returns module
 */
export function requireLocalPkg<T>(fspath: string, pkgName: string): T {
  let modulePath
  try {
    modulePath = findPkg(fspath, pkgName)
    if (modulePath !== void 0) {
      return require(modulePath)
    }
  } catch (e) {
    console.warn(`Failed to load ${pkgName} from ${modulePath}. Using bundled.`)
  }

  return require(pkgName)
}
