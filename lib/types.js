var check = require('meteor-check').check;
var Match = require('meteor-check').Match;

exports.NonEmptyString = Match.Where(function (x) {
  check(x, String);
  return x.length > 0;
}, 'non-empty string');

exports.Latitude = Match.Where(function (x) {
  check(x, Number);
  return x >= -90 && x <= 90;
}, 'latitude');

exports.Longitude = Match.Where(function (x) {
  check(x, Number);
  return x >= -180 && x <= 180;
}, 'longitude');
