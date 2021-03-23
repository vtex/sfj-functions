const path = require('path')
const glob = require('glob')
const fs = require('fs')
const { REDIRECTS_FILE } = require('./constants')

module.exports.generateConfig = (root, distDir, provider) => {
  const functions = {}
  const config = mainConfig(root, distDir)

  return {
    ...config,
    plugins: [
      collectFunctions(functions),
      afterEmit(root, functions, provider),
    ],
  }
}

function collectFunctions(functions) {
  return {
    apply: (compiler) => {
      compiler.hooks.assetEmitted.tap('Functions Collector', (filename, info) => {
        functions[filename] = info.content
      })
    },
  }
}

/** Deploy functions to provider and return an Object with function and endpoints */
async function deployFunctions(functions, provider) {
  const urls = {}

  await Promise.all(Object.entries(functions).map(async ([functionPath, content]) => {
    const functionName = path.parse(path.join(functionPath, '..')).name

    urls[functionName] = await provider.getOrCreateFunction(functionName, content)
    console.log('aqui');
  }))

  return urls
}

function afterEmit(root, functions, provider) {
  return {
    apply: (compiler) => {
      compiler.hooks.afterEmit.tap('Functions Deployment', async () => {
        const urls = await deployFunctions(functions, provider)
        console.log('urls:', urls);

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
