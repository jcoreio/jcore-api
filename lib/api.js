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

var check = require('meteor-check').check;
var Match = require('meteor-check').Match;
var NonEmptyString = require('./types').NonEmptyString;
var Fiber = require('fibers');
var net = require('net');
var wait = require('wait.for');
var WebSocket = require('faye-websocket');

var APICommon = require('./apiCommon');
var Connection = require('./connection');
var MessageConnection = require('./unixSockets/MessageConnection');

exports = module.exports = {
  connect: connect,
  connectLocal: connectLocal,
  run: wait.launchFiber,
  pause: pause
};

function connect(apiToken, callback) {
  if(callback) {
    _connect(apiToken, callback);
  } else {
    if (!Fiber.current) throw new Error(APICommon.FIBER_ERR);
    return wait.for(_connect, apiToken);
  }
}


function _connect(apiToken, callback) {
  check({apiToken: apiToken}, {apiToken: String});
  var info = new Buffer(apiToken, 'base64').toString('utf8');
  var parsed = JSON.parse(info);
  try {
    check(parsed, {
      url: NonEmptyString,
      token: NonEmptyString,
    })
  } catch (err) {
    err.message = 'apiToken must contain an encoded JSON object where ' + err.message;
    throw err
  }
  var url = parsed.url;
  var token = parsed.token;
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

function connectLocal(callback) {
  if(callback) {
    _connectLocal(callback);
  } else {
    if (!Fiber.current) throw new Error(APICommon.FIBER_ERR);
    return wait.for(_connectLocal);
  }
}

function _connectLocal(callback) {
  var onError = function(err) { callback(new Error(
    "could not connect to the local socket at " + APICommon.LOCAL_SOCKET_PATH + ": " + (err.stack || err)));
  };
  var socket = net.connect({ path: APICommon.LOCAL_SOCKET_PATH }, function() {
    socket.removeListener('error', onError);
    var socketMessageConn = new MessageConnection(socket, { utf8: true });
    callback(null, new Connection(socketMessageConn, { authRequired: false }));
  });
  socket.on('error', onError);
}

function pause(millis) {
  var fiber = Fiber.current;
  if(!fiber) throw new Error(APICommon.FIBER_ERR);
  setTimeout(function() { fiber.run(); }, millis);
  Fiber.yield();
}
