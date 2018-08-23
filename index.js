const randomBytes = require('randombytes')
const toRegExp = require('path-to-regexp')
const debug = require('debug')('sharef')
const range = require('range-parser')
const fetch = require('got')
const http = require('http')
const raf = require('random-access-file')
const rah = require('random-access-http')
const url = require('url')
const fs = require('fs')

function toHex(b) {
  return b.toString('hex')
}

module.exports = share

/**
 * Creates an HTTP server and shares a file specified by
 * a strign or random access storage interface.
 *
 * @public
 * @param {String|Function|RandomAccessStorage} storage
 * @param {Object} opts
 * @return {http.Server}
 * @throws TypeError
 */
function share(storage, opts) {
  const { port } = opts
  const server = http.createServer(onrequest)
  const src = storage
  const id = randomBytes(4)

  let isHTTPStorage = false

  if ('function' === typeof storage) {
    storage = storage()
  }

  if ('string' === typeof storage && storage.length) {
    const { protocol, href } = url.parse(storage)

    if ('http:' === protocol || 'https:' === protocol) {
      storage = rah(href)
      isHTTPStorage = true
    } else {
      try {
        fs.accessSync(storage)
        if (fs.statSync(storage).isFile()) {
          storage = raf(storage)
        }
      } catch (err) {
        void err
      }
    }
  }

  server.id = id
  server.route = toRegExp(`/${toHex(id)}`)
  server.listen(opts.port, onlisten)

  return server

  function onlisten() {
    debug('onlisten:', server.address())
  }

  function onrequest(req, res) {
    debug('onrequest: %s', req.url)

    const [ host ] = req.headers.host.split(':')
    const info = { host, port }

    res.statusCode = 200

    if (false === server.route.test(req.url)) {
      res.statusCode = 404
      res.end()
      return
    }

    if (isHTTPStorage) {
      fetch(src, { method: 'HEAD' })
        .then((res) => onhead(null, res))
        .catch(onerror)
    } else if (storage.statable) {
      storage.stat(onstat)
    }

    function onerror(err) {
      debug('onerror:', err)
      res.statusCode = 500
      res.end()
    }

    function onhead(err, head) {
      if (err) {
        onerror(err)
        return
      }

      onstat(null, { size: head.headers['content-length'] })
    }

    function onstat(err, stat) {
      if (err) {
        onerror(err)
        return
      }

      res.setHeader('Content-Length', stat.size)

      if (req.headers.range) {
        const r = range(stat.size, req.headers.range)
        if (r && r[0]) {
          storage.read(r[0].start, r[0].end, onread)
        }
      } else {
        storage.read(0, stat.size, onread)
      }
    }

    function onread(err, buf) {
      if (err) {
        onerror(err)
        return
      }

      res.end(buf)
      server.emit('share', info)
    }
  }
}
