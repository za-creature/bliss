let {file} = require('../bliss/bindings')

module.exports = {
    code: 'addEventListener("fetch", ev => ev.respondWith(new Response(MESSAGE)))',
    /*
    Add your bindings to this object; the syntax is described here:
    https://developers.cloudflare.com/workers/tooling/api/bindings/
    with the following changes:

    * the `key` is added to the value (must be an object) as `{'name': key}`,
      replacing any existing `name` field
    * if a `part` field is present in the value, an error is raised
    * if a `file` field is present in the value its contents will be uploaded
      alongside the script and exported as a global variable with the given
      `name`; this only works for 'wasm_module' bindings
    * the custom `bliss_asset` binding type allows uploading of arbitrary files
      and folders exported as Uint8Arrays and (multi-level) maps thereof
      respectively; read the docs of the assets module for more information

    For convenience, you can use the exported `text`, `secret`, `kv` and `wasm`
    helper functions to generate binding objects. You may also use `file` and
    `dir`, but those bindings will only be available after you import the
    `bliss-router/assets` module in the worker
    */
    bindings: {
        MESSAGE: file('./fixtures/message.txt')
    }
}
