/**
 * Copyright 2019 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const argv = require('minimist')(process.argv.slice(2));
const config = require('../../config');
const glob = require('glob');
const gulp = require('gulp-help')(require('gulp'));
const Mocha = require('mocha');
const tryConnect = require('try-net-connect');
const {execOrDie, execScriptAsync} = require('../../exec');

const HOST = 'localhost';
const PORT = 8000;
const WEBSERVER_TIMEOUT_RETRIES = 10;

let webServerProcess_;

function installPackages_() {
  execOrDie('npx yarn --cwd build-system/tasks/e2e',
      {'stdio': 'ignore'});
}

function launchWebServer_() {
  webServerProcess_ = execScriptAsync(
      `gulp serve --host ${HOST} --port ${PORT}\
      ${argv.quiet ? '--quiet' : ''}`);

  let resolver;
  const deferred = new Promise(resolverIn => {
    resolver = resolverIn;
  });

  tryConnect({
    host: HOST,
    port: PORT,
    retries: WEBSERVER_TIMEOUT_RETRIES, // retry timeout defaults to 1 sec
  }).on('connected', () => {
    return resolver(webServerProcess_);
  });

  return deferred;
}

function cleanUp_() {
  if (webServerProcess_ && !webServerProcess_.killed) {
    webServerProcess_.kill('SIGINT');
  }
}

async function e2e() {
  // install e2e-specific modules
  installPackages_();

  // set up promise to return
  let resolver, rejecter;
  const deferred = new Promise((resolverIn, rejecterIn) => {
    resolver = resolverIn;
    rejecter = rejecterIn;
  });

  // create mocha instance
  require('@babel/register');
  require('./helper');
  const mocha = new Mocha();

  // add test files to mocha
  config.e2eTestPaths.forEach(path => {
    glob.sync(path).forEach(file => {
      mocha.addFile(file);
    });
  });

  // start up web server
  await launchWebServer_();

  // run tests
  mocha.run(failures => {
    // end web server
    cleanUp_();

    // end task
    if (failures) {
      return rejecter();
    }

    return resolver();
  });

  return deferred;
}

gulp.task('e2e', 'Runs e2e tests', e2e, {
  options: {
    'quiet': '  Do not log HTTP requests (default: false)',
  },
});