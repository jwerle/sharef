sharef
======

Quickly share a file over HTTP.

## Installation

```sh
$ npm install sharef
```

## Usage

`sharef` can be used as a module or from the command line. `sharef` is a
function that accepts a
[random-access-storage](https://github.com/random-access-storage/random-access-storage)
interface or a string that resolves to
[random-access-http](https://github.com/random-access-storage/random-access-http) or
[random-access-file](https://github.com/random-access-storage/random-access-file).

### Command Line

`sharef` describes the following command line usage.

```sh
usage: sharef [-hDV] [options] <pathspec>
usage: sharef [-hDV] [options] <pathspec>

Options:
  -h, --help     Show help                          [boolean]
  -V, --version  Show version number                [boolean]
  -D, --debug    Enable debug output                [boolean] [default: false]
  -p, --port     Port for HTTP server to listen on  [number] [default: 8000]
  -m, --max      Max shares before exiting          [number] [default: Infinity]
```

## Example

The following example will read a file from github using a ranged
request. The request is made to the `sharef` server and accessed using a
[random-access-http](https://github.com/random-access-storage/random-access-http).
When a share has occurred, the server wil close itself.

```js
const fetch = require('got')
const share = require('sharef')

const file = 'https://raw.githubusercontent.com/datproject/hyperdrive-http/master/index.js'
const port = 8000

const server = share(file, { port })

server.once('share', onshare)
server.on('error', onerror)

void async function main() {
  const id = server.id.toString('hex')
  const res = await fetch(`http://localhost:${port}/${id}`, {
    headers: { range: 'bytes=0-100' }
  })

  console.log(res.body);
}()

async function onshare(info) {
  server.close()
}

function onerror(err) {
  console.error(err.stack || err)
}
```

This example can be recreated on the command line by invoking the
following command:

```sh
$ sharef https://raw.githubusercontent.com/datproject/hyperdrive-http/master/index.js
 info Sharing file: https://raw.githubusercontent.com/datproject/hyperdrive-http/master/index.js
 info Server Port: 8000
 info Server ID: /b0d4281e
 info Share IP: 192.168.128.111
 info Share URL: http://192.168.128.111:8000/b0d4281e
```

In another terminal you can request this file with `curl`.

```sh
$ curl http://192.168.128.111:8000/b0d4281e
```

## API

### `server = share(storage, opts)`

`share()` returns a
[http.Server](https://nodejs.org/api/http.html#http_class_http_server)
instances that responds to a single route

#### `server.id`

A random `4` byte buffer used to identify this route.

#### `server.route`

A `RegExp` instance created from [path-to-regexp](
https://github.com/pillarjs/path-to-regexp) that creates a unique route
from `server.id`

#### `server.on('share', info)`

Emitted each time a "share" occurs. That is a successful request and
response of the shared file.

## License

MIT
