const ZipPlugin = require('zip-webpack-plugin')
const path = require('path')
const glob = require('glob')
const fs = require('fs')

module.exports.generateConfig = (root, distDir, provider) => {
  const functions = []
  const config = mainConfig(root, distDir)

  return {
    ...config,
    plugins: [
      collectFunctions(functions),
      afterEmit(root, functions, provider),
      ...Object.keys(config.entry).map((entryName) => {
        const zipConfig = {
          path: path.resolve(root, distDir, entryName),
          filename: entryName,
          extension: 'zip',
          include: [`${entryName}/index.js`],
          pathMapper(assetPath) {
            return path.basename(assetPath)
          },
        }

        return new ZipPlugin(zipConfig)
      }),
    ],
  }
}

function collectFunctions(functions) {
  return {
    apply: (compiler) => {
      compiler.hooks.assetEmitted.tap('Functions Collector', (filename, info) => {
        functions.push({ filename, content: info.content })
      })
    },
  }
}

function afterEmit(root, functions, provider) {
  return {
    apply: (compiler) => {
      compiler.hooks.afterEmit.tap('Functions Deployment', async () => {
        const urls = await Promise.all(
          functions.map(async (item) => {
            if (!item.filename.endsWith('.zip')) {
              return
            }

            const functionName = `sfj-${path.parse(item.filename).name}`

            return [
              functionName,
              await provider.createOrUpdateFunction(functionName, item.content),
            ]
          })
        )

        const functionsURLs = urls
          .filter(item => item && item[1] !== undefined)
          .reduce((acc, curr) => ({...acc, [curr[0]]: curr[1]}), {})

        fs.writeFileSync(
          path.resolve(root, 'public', 'functions-redirects.json'),
          `${JSON.stringify(functionsURLs)}\n`
        )
      })
    }
  }
}

function mainConfig(root, distDir) {
  const config = {
    entry: {},
    context: root,
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: path.join(__dirname, 'tsconfig.json'),
              },
            },
          ],
          exclude: /node_modules/,
        },
      ],
    },
    output: {
      filename: '[name]/index.js',
      path: path.resolve(root, distDir),
      libraryTarget: 'umd',
    },
    target: 'node',
    mode: 'development',
    optimization: {
      usedExports: false,
    },
  }

  glob.sync('api/*.[tj]s?(x)', {
    cwd: root,
  }).forEach((filename) => (
    config.entry[path.parse(filename).name] = path.resolve(root, filename)
  ))

  return config
}
