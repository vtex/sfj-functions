const ZipPlugin = require('zip-webpack-plugin')
const path = require('path')
const glob = require('glob')

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
        Promise.all(
          functions.map((item) =>
            item.filename.endsWith('.zip') && provider.createOrUpdateFunction(path.parse(item.filename).name, item.content).catch((x) => console.error(x))
          )
        ).then(() => {
          const redirects = {}
          // compilation.entrypoints.forEach((_, key) => (redirect[filename] = createRedirect(filename)))
          // fs.writeFileSync(resolve(root, 'public', 'functions-redirects.json', `${JSON.stringify(redirects)}\n`)
        })
      })
    },
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
