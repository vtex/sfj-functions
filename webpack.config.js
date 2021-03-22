const ZipPlugin = require('zip-webpack-plugin')
const path = require('path')
const glob = require('glob')
const fs = require('fs')
const { REDIRECTS_FILE } = require('./constants')

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
          path: path.resolve(root, distDir),
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

/** Deploy functions to provider and return an Object with the endpoints */
function deployFunctions(functions, provider) {
  console.log(functions);
  functions.map(async (item) => {
    if (!item.filename.endsWith('.zip')) {
      return
    }

    const functionName = path.parse(item.filename).name

    return [
      functionName,
      await provider.getOrCreateFunction(functionName, item.content),
    ]
  }).then(urls => {
    // Convert [[functionName, url], ...] to {functionName: url, ...}
    return urls
      .filter(item => item && item[1] !== undefined)
      .reduce((acc, curr) => ({...acc, [curr[0]]: curr[1]}), {})
  }).catch(error => console.error(error))
}

function afterEmit(root, functions, provider) {
  return {
    apply: (compiler) => {
      compiler.hooks.afterEmit.tap('Functions Deployment', async () => {
        const urls = await Promise.all(deployFunctions(functions, provider))

        fs.writeFileSync(
          path.resolve(root, REDIRECTS_FILE),
          `${JSON.stringify(urls)}\n`
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
