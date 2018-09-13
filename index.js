const hyperdiscovery = require('hyperdiscovery')
const randomBytes = require('randombytes')
const { extname } = require('path')
const { blake2b } = require('hypercore-crypto')
const hyperdrive = require('hyperdrive')
const hypercore = require('hypercore')
const hyperhttp = require('hyperdrive-http')
const toRegExp = require('path-to-regexp')
const corsify = require('corsify')
const debug = require('debug')('sharef')
const range = require('range-parser')
const fetch = require('got')
const mime = require('mime')
const http = require('http')
const pump = require('pump')
const ras = require('random-access-stream')
const ram = require('random-access-memory')
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
  const server = http.createServer(corsify(onrequest))
  const src = storage

  let isHTTPStorage = false

  if ('function' === typeof storage) {
    storage = storage()
  }

  if ('string' === typeof storage && storage.length) {
    const { protocol, href } = url.parse(storage)

    if ('http:' === protocol || 'https:' === protocol) {
      storage = rah(href)
      storage._stat = stathttp(href)
      storage.statable = true
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

  server.discovery = null
  server.closed = false
  server.drive = hyperdrive(ram, opts)
  server.feed = hypercore(ram, opts)
  server.src = src

  server.listen(opts.port, onlisten)
  server.on('close', onclose)

  server.feed.ready(() => {
    server.route = toRegExp(`/${toHex(server.feed.key)}`)
    server.id = server.feed.key

    server.swarm = hyperdiscovery(server.feed, { port: 0 })
    server.swarm.on('peer', onpeer)
    server.swarm.on('error', (err) => {
      server.emit('error', err)
    })

    pump(
      ras(storage),
      server.feed.createWriteStream(),
      onpump
    )

    server.drive.ready(() => {
      server.discovery = hyperdiscovery(server.drive)
      server.discovery.on('peer', onpeer)
      server.discovery.on('error', (err) => {
        server.emit('error', err)
      })

      pump(
        ras(storage),
        server.drive.createWriteStream(toHex(server.id)),
        onpump
      )

      if ('string' === typeof src) {
        pump(
          ras(storage),
          server.drive.createWriteStream(src)
          onpump
        )
      }

      server.emit('ready')
    })
  })

  return server

  function onclose() {
    server.closed = true
    server.drive.close()
    server.swarm.close()
    server.discovery.close()
  }

  function onpeer(peer, info) {
    server.emit('peer', peer, info)
  }

  function onpump(err) {
    if (err) {
      server.emit('error', err)
    }
  }

  function onlisten() {
    debug('onlisten:', server.address())
  }

  function onrequest(req, res) {
    const [ host ] = req.headers.host.split(':')
    const info = { host, port }

    let uri = req.url.split('?')[0]
    const ext = extname(uri)

    debug('onrequest: %s: %s', req.method, req.url)

    req.uri = uri
    req.url = `/${toHex(server.id)}`
    req.extname = ext

    let totalRead = 0
    let ended = false

    res.statusCode = 200

    if (false === server.route.test(uri)) {
      if ( !src ||
        ('string' === typeof src && !toRegExp(`/${src}`).test(uri))
      ) {
        res.statusCode = 404
        res.end()
        return
      } else {
        req.uri = req.url
        uri = req.uri
      }
    }

    res.on('finish', onend)

    hyperhttp(server.drive)(req, res)

    server.emit(req.method.toLowerCase(), info)

    function onend() {
      debug('onend:')
      ended = true
      server.emit('share', info)
    }
  }
}

function stathttp(uri) {
  return function stat(req) {
    fetch(uri, { method: 'HEAD' })
      .then(onresponse)
      .catch(onerror)

    function onerror(err) {
      req.callback(err)
    }

    function onresponse(res) {
      return req.callback(null, {
        size: res.headers['content-length'],
        mtime: res.headers['last-modified'],

        isDirectory() { return false },
        isFile() { return true },
      })
    }
  }
}
