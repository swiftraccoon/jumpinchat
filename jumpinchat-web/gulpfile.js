/**
 * Created by zaccaryprice on 24/12/2015.
 */

import fs from 'fs';
import path from 'path';
import gulp from 'gulp';
import log from 'fancy-log';
import sourcemaps from 'gulp-sourcemaps';
import gulpSassFactory from 'gulp-sass';
import * as sassCompiler from 'sass';
import autoprefixer from 'gulp-autoprefixer';
import gulpif from 'gulp-if';
import rev from 'gulp-rev';
import sort from 'gulp-sort';
import rename from 'gulp-rename';
import revReplace from 'gulp-rev-replace';
import useref from 'gulp-useref';
import webpack from 'webpack';
import babel from 'gulp-babel';
import { deleteAsync } from 'del';
import inject from 'gulp-inject';
import csso from 'gulp-csso';
import workbox from 'workbox-build';
import minifyEs from 'gulp-terser';
import { default as webpackConf } from './webpack.conf.cjs';

const sass = gulpSassFactory(sassCompiler);

const paths = {
  src: 'react-client',
  dist: 'dist',
  tmp: '.tmp',
};

// clean <tmp> directory
gulp.task('clean:tmp', () => deleteAsync([path.join(paths.tmp, '*')]));

// clean <dist> directory
gulp.task('clean:dist', () => deleteAsync([path.join(paths.dist, '*')]));

gulp.task('copy:sounds', () => gulp.src([
  path.join(paths.src, 'sounds/*'),
])
  .pipe(gulp.dest(path.join(paths.dist, 'sounds'))));

gulp.task('copy:sourcemaps', () => {
  const manifestRaw = fs.readFileSync(path.join(paths.tmp, 'rev-manifest.json'), 'utf8');
  const manifest = JSON.parse(manifestRaw);

  log.info(manifest);

  return gulp.src([
    path.join(paths.tmp, 'js/**/*.map'),
  ])
    .pipe(rename((p) => {
      const manifestPathPrefix = `js/${p.dirname !== '.' ? `${p.dirname}/` : ''}`;
      const manifestPath = `${manifestPathPrefix}${p.basename}`;
      const revPath = `${manifest[manifestPath]}`;
      return {
        ...p,
        basename: revPath.replace(manifestPathPrefix, ''),
      };
    }))
    .pipe(gulp.dest(path.join(paths.dist, 'js')));
});

// inject javascript files into inject:js
// block in index.ejs
gulp.task('inject:js', () => {
  const target = gulp.src(path.join(paths.src, '/index.ejs'));
  const sources = [path.join(paths.src, 'js/lib/**/*.js')];

  const opts = {
    transform: (filePath) => {
      filePath = filePath.replace(`/${paths.src}/`, '/');
      filePath = filePath.replace('/.tmp/', '/');
      return `<script src="${filePath}"></script>`;
    },
  };

  return target
    .pipe(inject(gulp.src(sources, { read: false }), opts))
    .pipe(gulp.dest(path.join(paths.src, '/')));
});

// inject scss files into `// inject:scss` block in main.scss
gulp.task('inject:sass', () => {
  const target = gulp.src([path.join(paths.src, 'styles/main.scss')]);
  const sources = [
    path.join(paths.src, 'styles/**/*.scss'),
    `!${path.join(paths.src, 'styles/main.scss')}`,
    `!${path.join(paths.src, 'styles/*.scss')}`,
  ];

  const opts = {
    starttag: '// inject:{{ext}}',
    endtag: '// endinject',
    transform: (filePath) => {
      filePath = filePath.replace(`/${paths.src}/styles/`, '');
      filePath = filePath.replace(/([\w/]*?)_?([\w.-]+?)\.(sass|scss)/, '$1$2');
      return `@import "${filePath}";`;
    },
  };

  return target
    .pipe(inject(gulp.src(sources, { read: false }), opts))
    .pipe(gulp.dest(path.join(paths.src, 'styles/')));
});

// watch for file changes and run injection and processing
gulp.task('watch', (done) => {
  gulp.watch(path.join(paths.src, 'styles/**/*.scss'), gulp.series('sass'));
  gulp.watch(path.join(paths.src, 'sw/**/*.js'), gulp.series('generateSw:development'));
  gulp.watch(
    [
      path.join(paths.src, 'styles/**/*.scss'),
      `!${path.join(paths.src, 'styles/main.scss')}`,
    ], gulp.series('inject:sass'),
  );
  done();
});

// compile sass/scss files and run autoprefixer on processed css
gulp.task('sass', () => gulp.src([path.join(paths.src, 'styles/main.scss')])
  .pipe(sourcemaps.init({ loadMaps: true }))
  .pipe(sass({
    includePaths: ['node_modules/normalize-scss'],
  }).on('error', sass.logError))
  .pipe(autoprefixer())
  .pipe(sourcemaps.write('./'))
  .pipe(gulp.dest(path.join(paths.tmp, 'styles/'))));

gulp.task('csso', () => gulp.src(`${paths.tmp}/**/*.css`)
  .pipe(csso())
  .pipe(gulp.dest(paths.tmp)));


gulp.task('imagemin', () => gulp.src(path.join(paths.src, 'img/**/*'))
  .pipe(gulp.dest(`${paths.dist}/img`)));


function compile(watch, esNext = false) {
  return new Promise((resolve, reject) => {
    log.info('-> bundling...');
    return webpack(webpackConf({ esNext, watch }), (err, stats) => {
      if (err || stats.hasErrors()) {
        if (err) {
          log.error(err);
        }

        log.info(stats.toString({
          chunks: false,
          colors: true,
          assets: false,
          modules: false,
        }));
        return reject(err);
      }

      log.info(stats.toString({
        chunks: false,
        colors: true,
        assets: false,
        modules: false,
      }));
      return resolve();
    });
  });
}

gulp.task('babelify', () => gulp.src('react-client/js/lib/*.js')
  .pipe(sourcemaps.init())
  .pipe(babel({
    presets: ['@babel/preset-env'],
  }))
  .pipe(sourcemaps.write('.'))
  .pipe(gulp.dest(path.join(paths.tmp, 'js', 'lib'))));


// run concatenation, minification and reving
// using build blocks in *.html
// outputting resulting files to <dist>
gulp.task('useref', () => gulp.src(path.join(paths.src, 'index.ejs'))
  .pipe(useref())
  .pipe(gulpif(['**/vendor.js'], minifyEs({
    output: {
      comments: /(?:^!|@(?:license|preserve|cc_on))/,
    },
    warnings: true,
  })))
  .on('error', err => log.error(err))
  .pipe(gulp.dest(paths.tmp)));

gulp.task('revision', gulp.series('csso',
  () => gulp.src([
    path.join(paths.tmp, '**/*.css'),
    path.join(paths.tmp, '**/*.js'),
    path.join(paths.tmp, '**/*.mjs'),
  ])
    .pipe(sort())
    .pipe(rev())
    .pipe(gulp.dest(paths.dist))
    .pipe(rev.manifest())
    .pipe(gulp.dest(paths.tmp))));

gulp.task('revreplace', gulp.series('revision', () => {
  const manifest = gulp.src(`${paths.tmp}/rev-manifest.json`);

  return gulp.src(`${paths.tmp}/index.ejs`)
    .pipe(revReplace({ manifest, replaceInExtensions: ['.ejs'] }))
    .pipe(gulp.dest(paths.dist));
}));

function writeServiceWorkerFile(rootDir) {
  log.info({ rootDir });
  const config = {
    cacheId: 'jumpinchat',
    swDest: path.join(rootDir, 'service-worker.js'),
    runtimeCaching: [
      {
        urlPattern: new RegExp('/api/(.*)'),
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60,
          },
        },
      },
      {
        urlPattern: /\/\w+(?:\/[^.]+\/?)?$/,
        handler: 'NetworkFirst',
      },
      {
        urlPattern: new RegExp('\\.(js|css|jpg|png|gif)$'),
        handler: 'StaleWhileRevalidate',
      },
      {
        urlPattern: /\/(admin|settings)\//,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: new RegExp('/api/user/checkCanBroadcast/(.*)'),
        handler: 'NetworkOnly',
      },
    ],
    globDirectory: rootDir,
    globPatterns: [
      'img/**.*',
      '**/*.{mp3,ogg}',
      '**/*.{js,mjs,css}',
    ],
    importScripts: [
      '/js/push-manager.js',
    ],
  };

  workbox
    .generateSW(config)
    .then(({ count, size, warnings }) => {
      log.info(`Generated service-worker.js, which will precache ${count} files, totaling ${Math.round(size / 1024)}kb.`);

      warnings.forEach(w => log.warn(w));
    })
    .catch(e => log.error(e));

  return gulp
    .src([
      path.join(paths.src, 'sw/*'),
    ])
    .pipe(gulp.dest(path.join(rootDir, 'js')));
}


gulp.task('compile:js', gulp.series('babelify', () => compile()));
gulp.task('compile:js:esNext', gulp.series('babelify', () => compile(false, true)));
gulp.task('compile:js:watch', () => compile(true, true));

gulp.task('setEnv:production', (done) => { process.env.NODE_ENV = 'production'; done(); });
gulp.task('setEnv:development', (done) => { process.env.NODE_ENV = 'development'; done(); });

gulp.task('generateSw:development', () => writeServiceWorkerFile(paths.tmp));
gulp.task('generateSw:production', () => writeServiceWorkerFile(paths.dist));

gulp.task('build', gulp.series(
  gulp.parallel('clean:tmp', 'clean:dist'),
  gulp.parallel('copy:sounds', 'inject:sass', 'inject:js'),
  'setEnv:production',
  'compile:js',
  'compile:js:esNext',
  gulp.parallel('sass', 'imagemin'),
  'useref',
  'revreplace',
  'copy:sourcemaps',
  'generateSw:production',
));

gulp.task('watchify', gulp.series(
  'clean:tmp',
  gulp.parallel('inject:sass', 'inject:js'),
  'setEnv:development',
  gulp.parallel('compile:js:watch', 'sass'),
  'watch',
));
