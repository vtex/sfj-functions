#!/usr/bin/env node
import webpack from 'webpack'
import { resolve } from 'path'
import { generateConfig } from './webpack.config'
import { AWSProvider } from './provider/AWSProvider'

export const build = (root: string, account: string) => {
  const config = generateConfig(root, 'dist', new AWSProvider(account))
  const compiler = webpack({ ...config })

  return new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      let success = true

      if (error) {
        console.error('Webpack compilation failed', error)
        success = false
      }

      if (stats?.hasErrors()) {
        stats.compilation.getErrors().forEach(item => console.log(item.message))
        success = false
      }

      if (success) {
        resolve(undefined)
      }

      reject()
    })
  })
}

async function main() {
  if (require.main !== module) {
    return
  }

  if (process.argv.length != 4) {
    console.error('USAGE: sfj-functions [projectRoot] [account]');
    return
  }

  try {
    await build(resolve(process.argv[2]), process.argv[3])
  }
  catch (error) {
    console.log(error);
  }
}

main()
