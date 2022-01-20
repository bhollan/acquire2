const fs = require('fs');
const path = require('path');
const HtmlWebpackExternalsPlugin = require('html-webpack-externals-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const openWebpackBundleAnalyzerReportInBrowser = false;

function getDevelopmentConfig(APP) {
  return {
    entry: {
      app: `./src/client/${APP}.tsx`,
    },
    output: {
      filename: `${APP}.js`,
      path: path.resolve(__dirname, 'dist'),
    },
    devtool: 'source-map',
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    plugins: [
      new HtmlWebpackPlugin({
        title: 'Acquire',
        template: './src/client/index.html',
      }),
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.client.json',
                transpileOnly: true,
              },
            },
          ],
        },
        {
          test: /\.js$/,
          use: [
            {
              loader: 'source-map-loader',
            },
          ],
          enforce: 'pre',
        },
        {
          test: /\.s?css$/,
          use: [
            {
              loader: 'style-loader',
              options: {
                esModule: true,
              },
            },
            {
              loader: 'dts-css-modules-loader',
              options: {
                namedExport: true,
              },
            },
            {
              loader: 'css-loader',
              options: {
                esModule: true,
                modules: {
                  localIdentName: '[name]-[local]',
                  namedExport: true,
                },
                sourceMap: true,
              },
            },
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [['postcss-url', { url: 'inline' }]],
                  sourceMap: true,
                },
              },
            },
            {
              loader: 'sass-loader',
              options: {
                sourceMap: true,
              },
            },
          ],
        },
      ],
    },
    mode: 'development',
  };
}

function getProductionConfig(APP) {
  const packageVersionLookup = getPackageVersionLookup();
  const shortCSSNameLookup = getShortCSSNameLookup();

  return {
    entry: {
      app: `./src/client/${APP}.tsx`,
    },
    output: {
      filename: `${APP}.[contenthash].js`,
      path: path.resolve(__dirname, 'dist', 'client'),
      hashFunction: 'sha256',
      hashDigestLength: 64,
    },
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.json'],
    },
    plugins: [
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: `${APP}-report.html`,
        defaultSizes: 'gzip',
        openAnalyzer: openWebpackBundleAnalyzerReportInBrowser,
      }),
      new HtmlWebpackPlugin({
        title: 'Acquire',
        template: './src/client/index.html',
        filename: `${APP}.html`,
        minify: {
          collapseWhitespace: true,
          removeAttributeQuotes: true,
          removeOptionalTags: true,
          removeScriptTypeAttributes: true,
        },
      }),
      new HtmlWebpackExternalsPlugin({
        externals: [
          {
            module: 'immutable',
            global: 'Immutable',
            entry: `https://unpkg.com/immutable@${packageVersionLookup['immutable']}/dist/immutable.min.js`,
          },
          {
            module: 'react',
            global: 'React',
            entry: `https://unpkg.com/react@${packageVersionLookup['react']}/umd/react.production.min.js`,
          },
          {
            module: 'react-dom',
            global: 'ReactDOM',
            entry: `https://unpkg.com/react-dom@${packageVersionLookup['react-dom']}/umd/react-dom.production.min.js`,
          },
        ],
      }),
      new MiniCssExtractPlugin({
        filename: `${APP}.[contenthash].css`,
      }),
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                configFile: 'tsconfig.client.json',
                transpileOnly: true,
              },
            },
          ],
        },
        {
          test: /\.s?css$/,
          use: [
            {
              loader: MiniCssExtractPlugin.loader,
            },
            {
              loader: 'css-loader',
              options: {
                esModule: true,
                modules: {
                  getLocalIdent: (context, localIdentName, localName, options) => {
                    const key = context.resourcePath + '-' + localName;
                    const shortCSSName = shortCSSNameLookup[key];
                    if (shortCSSName === undefined) {
                      throw new Error(`short CSS name not specified for "${key}"`);
                    }
                    return shortCSSName;
                  },
                  namedExport: true,
                },
              },
            },
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [['postcss-url', { url: 'inline' }], ['cssnano']],
                },
              },
            },
            {
              loader: 'sass-loader',
            },
          ],
        },
      ],
    },
    mode: 'production',
  };
}

function getPackageVersionLookup() {
  const packageJson = JSON.parse(fs.readFileSync('package.json').toString());
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  const lookup = {};
  for (const key in dependencies) {
    if (dependencies.hasOwnProperty(key)) {
      const value = dependencies[key];
      lookup[key] = value.replace(/^\^/, '');
    }
  }

  return lookup;
}

function getShortCSSNameLookup() {
  const keys = [];

  function processDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);

      if (stats.isDirectory()) {
        processDirectory(filePath);
      } else if (stats.isFile()) {
        if (file.endsWith('.scss.d.ts')) {
          const lines = fs.readFileSync(filePath).toString().split('\n');
          const cssFilePath = filePath.slice(0, filePath.length - 5);

          for (let j = 0; j < lines.length; j++) {
            const line = lines[j];
            const match = line.match(/^export const (.*?): string;$/);

            if (match) {
              keys.push(`${cssFilePath}-${match[1]}`);
            }
          }
        }
      }
    }
  }

  processDirectory(path.join(__dirname, 'src'));

  keys.sort();

  const lookup = {};
  for (let i = 0; i < keys.length; i++) {
    lookup[keys[i]] = `_${i.toString(36)}`;
  }

  return lookup;
}

const { APP, MODE } = process.env;

module.exports = MODE === 'production' ? getProductionConfig(APP) : getDevelopmentConfig(APP);
