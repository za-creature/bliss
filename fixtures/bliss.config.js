let {file} = require('../bliss/bindings')

module.exports = {
    code: 'addEventListener("fetch", ev => ev.respondWith(new Response(MESSAGE)))',
    bindings: {
        MESSAGE: file('./fixtures/message.txt')
    }
}
