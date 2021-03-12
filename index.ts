#!/usr/bin/env node
import webpack from 'webpack'
import { resolve } from 'path'
import { generateConfig } from './webpack.config'
import { AWSProvider } from './provider/AWSProvider'

export const build = (root: string, account: string) => {
  const config = generateConfig(root, 'dist', new AWSProvider(account))
  const compiler = webpack({ ...config })
  compiler.run((error, stats) => {
    if (error) {
      console.error('Webpack compilation failed', error)
    }

    if (stats.hasErrors()) {
      stats.compilation.getErrors().forEach(item => console.log(item.message))
    }
  })
}

function main() {
  if (require.main !== module) {
    return
  }

  if (process.argv.length != 4) {
    console.error('USAGE: ./build.ts [projectRoot] [account]');
    return
  }

  build(resolve(process.argv[2]), process.argv[3])
}

main()
