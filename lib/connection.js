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
var _ = require('lodash');

var ApiCommon = require('./apiCommon');
var Protocol = require('./protocol');

exports = module.exports = Connection;

function Connection(sock) {
  this._sock = sock;
  this._closed = false;
  this._authenticating = false;
  this._authenticated = false;

  this._curMethodId = 0;
  this._methodCalls = {};

  var self = this;
  sock.once('close', function(event) { self._onClose(event);   });
  sock.on('message', function(event) { self._onMessage(event); });
}

Connection.prototype.authenticate = function(token, callback) {
  check.assert.nonEmptyString(token, "token must be a non-empty string");
  check.assert.function(callback, "callback must be a function");
  if(this._authenticated) throw new Error("already authenticated");
  if(this._authenticating) throw new Error("authentication already in progress");
  this._authenticating = true;
  this._send(Protocol.CONNECT, { token: token });
  this._authCallback = callback;
};

Connection.prototype.close = function(err) {
  if(this._closed) return;

  this._authenticating = false;
  this._authenticated = false;
  this._closed = true;
  if(this._authCallback) {
    this._authCallback(err || new Error("connection closed before auth completed"));
    this._authCallback = null;
  }
  if(this._sock) {
    this._sock.close();
    this._sock = null;
  }
};

Connection.prototype.getRealTimeData = function(request, callback) {
  check.assert.object(request, "request must be an object");
  check.assert.array.of.nonEmptyString(request.channelIds, "request.channelIds must be an array of non-empty strings");
  if(callback === undefined) {
    ApiCommon.ensureFiber("Connection.getRealTimeData");
    return wait.forMethod(this, '_getRealTimeData', request);
  } else {
    this._getRealTimeData(request, callback);
  }
};

Connection.prototype._getRealTimeData = function(request, callback) {
  return this._call("getRealTimeData", request, callback);
};

Connection.prototype._call = function() {
  this._requireAuth();
  var argc = arguments.length;
  if(argc < 2) throw new Error("_call requires at least two arguments: a method name and a callback");
  var method = arguments[0];
  check.assert.nonEmptyString(method, "the first parameter must be a non-empty string method name");
  var callback = arguments[argc - 1];
  check.assert.function(callback, "the last parameter must be a callback function");

  var numParams = argc - 2;
  var params = new Array(numParams);
  for(var paramNo = 0; paramNo < numParams; ++paramNo) {
    params[paramNo] = arguments[paramNo + 1];
  }
  var id = (++this._curMethodId).toString();
  this._send(Protocol.METHOD, { id: id, method: method, params: params });
  this._methodCalls[id] = { callback: callback };
};

Connection.prototype._send = function(messageName, message) {
  message.msg = messageName;
  if(!this._sock) throw new Error("connection is already closed");
  this._sock.send(JSON.stringify(message));
};

Connection.prototype._onMessage = function(event) {
  try {
    var message = JSON.parse(event.data);
    var msg = message.msg;
    check.assert.nonEmptyString(msg, "msg must be a non-empty string");
    switch(msg) {
      case Protocol.CONNECTED:
        if(!this._authenticating) throw new Error("unexpected connected message");
        this._authenticating = false;
        this._authenticated = true;
        if(this._authCallback) {
          this._authCallback();
          this._authCallback = null;
        }
        break;
      case Protocol.FAILED:
        var errMsg = this._authenticating ? "authentication failed" : "unexpected auth failed message";
        var protocolErr = _fromProtocolError(message.error);
        throw new Error(errMsg + (protocolErr ? ": " + protocolErr : ""));
        break;
      case Protocol.RESULT:
        var id = message.id;
        check.assert.nonEmptyString(id, "id must be a non-empty string");
        var methodInfo = this._methodCalls[id];
        if(!methodInfo) throw new Error("method call not found: " + id);
        delete this._methodCalls[id];
        if(message.error) {
          methodInfo.callback(new Error(_fromProtocolError(message.error) || "an unknown error occurred"));
        } else {
          methodInfo.callback(null, message.result);
        }
        break;
      default:
        throw new Error("unexpected message: " + msg);
    }
  } catch (err) {
    this.close(err);
  }
};

Connection.prototype._onClose = function(event) {
  if(!this._closed) {
    this._sock = null;
    this.close(new Error("connection closed: " + event.code + ", " + event.reason));
  }
};

Connection.prototype._requireAuth = function() {
  if(this._closed) throw new Error("connection is already closed");
  if(this._authenticating) throw new Error("authentication has not finished yet");
  if(!this._authenticated) throw new Error("not authenticated");
};

function _buildError(message, error) {
  return new Error();
}

function _fromProtocolError(err) {
  var errMsg = error ? (error.reason || error.message || error.stack || error) : null;
  return _.isString(errMsg) && errMsg.length ? errMsg : null;
}
