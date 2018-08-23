const fetch = require('got')
const share = require('./')

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
