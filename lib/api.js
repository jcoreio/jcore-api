/*
 Copyright 2016 Mindfront Designs

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

'use strict';

var check = require('check-types');
var wait = require('wait.for');
var WebSocket = require('faye-websocket');

var ApiCommon = require('./apiCommon');
var Connection = require('./connection');

var api = {
  connect: connect,
  run: wait.launchFiber
};
exports = module.exports = api;

function connect(apiToken, callback) {
  if(callback) {
    _connect(apiToken, callback);
  } else {
    ApiCommon.ensureFiber("connect");
    return wait.for(_connect, apiToken);
  }
}

function _connect(apiToken, callback) {
  check.assert.nonEmptyString(apiToken, "apiToken must be a base64-encoded string");
  check.assert.function(callback, "callback must be a function");
  var info = new Buffer(apiToken, 'base64').toString('utf8');
  var parsed = JSON.parse(info);
  check.assert.object(parsed, "apiToken must contain an encoded JSON object");
  var url = parsed.url;
  var token = parsed.token;
  check.assert.nonEmptyString(url,   "decoded apiToken must contain a string `url` field");
  check.assert.nonEmptyString(token, "decoded apiToken must contain a string `token` field");
  var sock = new WebSocket.Client(url);
  var onClose = function(event) {
    callback(new Error("could not connect to " + url + ": " + event.code + ", " + event.reason));
  };
  var onOpen = function() {
    sock.removeListener('close', onClose);
    var connection = new Connection(sock);
    connection.authenticate(token, function(err) {
      callback(err, err ? null : connection);
    });
  };
  sock.once('open',  onOpen);
  sock.once('close', onClose);
}
