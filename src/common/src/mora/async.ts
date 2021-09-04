/**
 * 按先后顺序一个个用 run 函数来运行 tasks 中的字段
 *
 * @export
 * @template T
 * @template R
 * @param {T[]} tasks 要运行的任务
 * @param {(task: T) => Promise<R>} run 运行函数
 * @returns {Promise<R[]>} 返回每个 tasks 对应的结果组成的数组
 */
 export async function series<T, R>(tasks: T[], run: (task: T, index: number, tasks: T[]) => Promise<R>): Promise<R[]> {
  const result: R[] = []
  if (!tasks.length) return result

  const handle: any = tasks.slice(1).reduce(
    (prev, task: T, index, ref) => {
      return async () => {
        result.push(await prev())
        return await run(task, index + 1, ref)
      }
    },
    async () => await run(tasks[0], 0, tasks)
  )
  result.push(await handle())
  return result
}


export async function map<T, R>(tasks: T[], iterator: (task: T, index: number, ref: T[]) => Promise<R>, limit = 1): Promise<R[]> {
  return new Promise<R[]>((resolve, reject) => {
    let finished = false
    let runningCount = 0
    const result: R[] = new Array(tasks.length)
    const done = (err?: any) => {
      if (!finished) {
        finished = true
        err ? reject(err) : resolve(result)
      }
    }

    const queue = tasks.map((task, index, ref) => () => {
      runningCount++
      iterator(task, index, ref)
        .then(res => {
          result[index] = res
          runningCount--
          run()
        })
        .catch(done)
      run()
    })

    const runnable = () => (!limit || limit > runningCount) && queue.length

    const run = () => {
      if (finished || !queue.length && !runningCount) {
        done()
      } else if (runnable()) {
        (queue.shift() as any)()
      }
    }
    run()
  })
}


export async function replace(src: string, gregexp: RegExp, iterator: (mat: RegExpMatchArray) => Promise<string>, limit = 1) {
  const matches: RegExpExecArray[] = []

  let mat: RegExpExecArray | null
  /* tslint:disable: no-conditional-assignment */
  while ((mat = gregexp.exec(src))) {
    matches.push(mat)
  }

  const replacers = await map(matches, iterator, limit)

  let i = replacers.length
  const result: string[] = []
  let lastIndex = src.length
  while (i--) {
    const replacer = replacers[i]
    const match = matches[i]
    const raw = match[0]
    result.unshift(replacer + src.substring(match.index + raw.length, lastIndex))
    lastIndex = match.index
  }

  if (lastIndex) result.unshift(src.substring(0, lastIndex))
  return result.join('')
}