# gm-to-grayscale
Use `gm` to read an RGB buffer/image and make it grayscale.

## Installation
```sh
npm install gm-to-grayscale
```

## Usage

```js
#!/usr/bin/env node
var gmToGrayscale = require('gm-to-grayscale');

gmToGrayscale('my-photo.png'), function (err, result) {
  if (err) {
    throw err;
  }

  console.log('Image size: ' + result.width + 'x' + result.height);

  fs.writeFile('my-photo.gray', result.image, function (err) {
    if (err) {
      throw err;
    }
  });
});
```
