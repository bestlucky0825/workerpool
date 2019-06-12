var fs = require('fs');
var gulp = require('gulp');
var webpack = require('webpack');
var uglify = require('uglify-js');
var log = require('fancy-log');
var format = require('date-format');

// generate banner with today's date and correct version
function createBanner() {
  var today = format.asString('yyyy-MM-dd', new Date()); // today, formatted as yyyy-MM-dd
  var version = require('./package.json').version;  // module version

  return String(fs.readFileSync('./lib/header.js'))
      .replace('@@date', today)
      .replace('@@version', version);
}

var bannerPlugin = new webpack.BannerPlugin(createBanner(), {
  entryOnly: true,
  raw: true
});

var FunctionModulePlugin = require('webpack/lib/FunctionModulePlugin');
var NodeTargetPlugin     = require('webpack/lib/node/NodeTargetPlugin');
var NodeTemplatePlugin   = require('webpack/lib/node/NodeTemplatePlugin');
var LoaderTargetPlugin   = require('webpack/lib/LoaderTargetPlugin');

var webpackOutput = {
  library: 'workerpool',
  libraryTarget: 'umd',
  path: './dist',
  filename: 'workerpool.js'
};

var webpackNode = {
  // do not include poly fills...
  console: false,
  process: false,
  global: false,
  buffer: false,
  __filename: false,
  __dirname: false
};

var webpackConfig = {
  entry: './index.js',
  target: function(compiler) {
    compiler.apply(
        new FunctionModulePlugin(webpackOutput),
        new NodeTemplatePlugin(webpackOutput),
        new NodeTargetPlugin(webpackNode),
        new LoaderTargetPlugin('web')
    );
  },
  output: webpackOutput,
  node: webpackNode,
  plugins: [
    bannerPlugin
  ],
  cache: true
};

var webpackWorkerConfig = {
  entry: './lib/worker.js',
  output: {
    path: './dist',
    filename: 'worker.js'
  },
  node: webpackNode,
  plugins: []
};

var uglifyConfig = {
  warnings: 'verbose',
  sourceMap: {
    url: 'workerpool.map'
  },
  output: {
    comments: function (tree, comment) {
      return /@license/.test(comment.value) &&
          !(/@@version/.test(comment.value) && /@@date/.test(comment.value) && /workerpool.js/.test(comment.value))
    }
  }
};

// create a single instance of the compiler to allow caching
var compiler = webpack(webpackConfig);

gulp.task('bundle-worker', function (done) {
  webpack(webpackWorkerConfig).run(function (err, stats) {
    if (err) {
      log(err);
    }

    log('bundled worker ./dist/worker.js');

    var result = uglify.minify(String(fs.readFileSync('./dist/worker.js')));

    if (result.error) {
      throw result.error;
    }

    // create embeddedWorker.js
    var embedded = '/**\n' +
        ' * embeddedWorker.js contains an embedded version of worker.js.\n' +
        ' * This file is automatically generated,\n' +
        ' * changes made in this file will be overwritten.\n' +
        ' */\n' +
        'module.exports = ' + JSON.stringify(result.code) + ';\n';

    fs.writeFileSync('./lib/generated/embeddedWorker.js', embedded);

    log('generated embedded worker ./lib/generated/embeddedWorker.js');
    done();
  });
});

gulp.task('bundle-workerpool', function (done) {
  // update the banner contents (has a date in it which should stay up to date)
  bannerPlugin.banner = createBanner();

  // note in browserify we would do something like:
  // browserify ./index.js -o dist/workerpool.js -s workerpool --no-builtins --insert-global-vars none

  compiler.run(function (err, stats) {
    if (err) {
      log(err);
    }

    log('bundled ./dist/workerpool.js');

    done();
  });
});

gulp.task('minify-workerpool', function (done) {
  var code = String(fs.readFileSync('./dist/workerpool.js'));
  var result = uglify.minify(code, uglifyConfig);

  if (result.error) {
    throw result.error;
  }

  fs.writeFileSync('./dist/workerpool.min.js', result.code);
  fs.writeFileSync('./dist/workerpool.map', result.map);

  log('Minified ' + './dist/workerpool.min.js');
  log('Mapped ' + './dist/workerpool.map');

  done()
});

var tasks = gulp.series('bundle-worker', 'bundle-workerpool', 'minify-workerpool');

// The default task (called when you run `gulp`)
gulp.task('default', tasks);

// The watch task (to automatically rebuild when the source code changes)
gulp.task('watch', gulp.series(tasks, function () {
  gulp.watch(['index.js', 'lib/**/*.js', '!lib/generated/**'], tasks);
}));
