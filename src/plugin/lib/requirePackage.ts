import * as path from 'path'
import * as resolve from 'resolve'
import * as readPkgUp from 'read-pkg-up'
import { existsSync } from 'fs'

declare const __webpack_require__: typeof require;
declare const __non_webpack_require__: typeof require;

function findPkg(fspath: string, pkgName: string): string | undefined {
  const res = readPkgUp.sync({ cwd: fspath, normalize: false })
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
  // Source: https://github.com/microsoft/vscode-eslint/blob/master/server/src/eslintServer.ts
  const r =
    typeof __webpack_require__ === "function"
      ? __non_webpack_require__
      : require;
  try {
    modulePath = findPkg(fspath, pkgName)
    if (modulePath !== void 0) {
      return r(modulePath)
    }
  } catch (e) {
    console.warn(`Failed to load ${pkgName} from ${modulePath}. Using bundled.`)
  }

  return r(pkgName)
}
