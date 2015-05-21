var fs = require('fs');
var gm = require('gm');
var temp = require('temp');

function toGrayscale(inPath, callback) {
  var outPath = temp.path({ suffix: '.gray.out' });
  var width, height;

  gm(inPath)
    .size(function (err, size) {
      width = size.width;
      height = size.height;
    })
    .write('gray:' + outPath, function (err) {
      if (err) {
        return callback(err);
      }

      fs.readFile(outPath, function (err, content) {
        if (err) {
          return callback(err);
        }

        fs.unlink(outPath);

        callback(null, { image: content, width: width, height: height });
      });
    });
}

module.exports = function (rgb, callback) {
  var inPath;

  if (Buffer.isBuffer(rgb)) {
    inPath = temp.path({ suffix: '.rgb.in' });
    fs.writeFile(inPath, rgb, function (err) {
      if (err) {
        return callback(err);
      }

      toGrayscale(inPath, function (err, result) {
        fs.unlink(inPath); // Ignore `unlink` errors, it's temp files anyway.

        callback(err, result);
      });
    });
  }
  else {
    toGrayscale(rgb, callback);
  }
};
