var natural = require("natural");
var norm = require("node-normalizer");
var fs = require("fs");
var async = require("async");
var _ = require("lodash");
var checksum = require("checksum");
var mergex = require("deepmerge");
var facts = require("sfacts");
var parseContents = require("./parsecontents");
var Utils = require("./utils");
const debug = require('debug-levels')('ss-parser')

natural.PorterStemmer.attach();

module.exports = function (factSystem) {

  var topics = {};
  var gambits = {};
  var replys = {};
  var convos = {};

  factSystem = factSystem ? factSystem : facts.create("systemDB");

  var parseFiles = function (factsSystem) {
    return function (fileName, callback) {
      parseContents(norm)(fs.readFileSync(fileName, "utf-8"), factsSystem, callback);
    };
  };

  // A path of files to load
  // Cache is a key:sum of files
  // callback when finished
  var loadDirectory = function (path, cache, callback) {

    var triggerCount = 0;
    var replyCount = 0;

    cache = cache || {};
    if (_.isFunction(cache)) {
      callback = cache;
      cache = {};
    }

    const startTime = process.hrtime()

    Utils.walk(path, function (err, files) {
      if (err) {
        console.error(err);
      }

      norm.loadData(function () {
        var sums = {};
        var itor = function (file, next) {
          if (file.match(/\.(ss)$/i)) {
            checksum.file(file, function (err4, sum) {
              if (err4) {
                console.error(err4);
              }

              sums[file] = sum;
              if (cache[file]) {
                if (cache[file] !== sum) {
                  next(true);
                } else {
                  next(false);
                }
              } else {
                next(true);
              }
            });
          } else {
            next(false);
          }
        };

        async.filter(files, itor, function (toLoad) {
          async.map(toLoad, parseFiles(factSystem), function (err4, res) {
            if (err4) {
              console.error(err4);
            }

            for (var i = 0; i < res.length; i++) {
              topics = mergex(topics, res[i].topics);
              gambits = mergex(gambits, res[i].gambits);
              convos = mergex(convos, res[i].convos);
              replys = mergex(replys, res[i].replys);
            }

            var data = {
              topics: topics,
              gambits: gambits,
              convos: convos,
              replys: replys,
              checksums: sums
            };

            const endTime = process.hrtime(startTime)
            var topicCount = Object.keys(topics).length;
            var gambitsCount = Object.keys(gambits).length;
            var convoCount = Object.keys(convos).length;
            var replysCount = Object.keys(replys).length;

            debug.info('parsed in %ds %dms', endTime[0], endTime[1] / 1000000)
            debug.verbose('topics = %d, gambits = %d, replies = %d, convos = %d',
                topicCount, gambitsCount, replysCount, convoCount)

            if (data !== "") {
              if (topicCount === 0 && triggerCount === 0 && replyCount === 0) {
                callback(null, {});
              } else {
                callback(null, data);
              }

            } else {
              callback(new Error("No data"));
            }
          });
        });
      });
    });
  };

  return {
    loadDirectory: loadDirectory,
    parseFiles: parseFiles,
    parseContents: parseContents(norm)
  };
};
