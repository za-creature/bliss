# bliss/bindings

This module exports a few utility functions that help in cleaning up your
`bliss.config.js` file. Its use is entirely optional but recommended for
readability as well as resilience against syntactic changes. Because ES module
support is not yet universal in the Node.JS ecosystem, this module (as well as
all the other build-time modules available in bliss) is written using CommonJS.

## reference

### text
```js
exports.text = function(text) {
    return {'type': 'plain_text', text}
}
```
Defines the body of a text binding. Exported as a global String

### secret
```js
exports.secret = function(text) {
    return {'type': 'secret_text', text}
}
```
Defines the body of a secret binding. Exported as a global String

### kv
```js
exports.kv = function(namespace_id) {
    return {'type': 'kv_namespace', namespace_id}
}
```
Defines the body of a KV namespace binding. Exported as a
[KV Object](https://developers.cloudflare.com/workers/runtime-apis/kv).

Warning: KV objects are currently not supported in the local emulator.

### wasm
```js
exports.wasm = function(file) {
    return {'type': 'wasm_module', file}
}
```
Defines a WASM module binding. Exported as a
[WebAssembly.Module](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WebAssembly/Module).

### file
```js
exports.file = function(file) {
    return {'type': 'bliss_asset', file}
}
```
Defines a local binary file binding. Exported as a `Promise<Uint8Array>`.

Warning: this binding uses a now-undocumented feature of cloudflare workers and
can only be used after importing `bliss-router/assets`.

### dir
```js
exports.dir = function(folder, ...patterns) {
    return {'type': 'bliss_asset', folder, patterns}
}

```
Defines a local folder binding. Exported as a plain object mapping relative file
names to either a `Promise<Uint8Array>` (for subfiles) or another plain object
(for subfolders).

Any additional arguments after the local path to the directory are used as
[nanomatch](https://github.com/micromatch/nanomatch#features) filters that
restrict what files should be included.

Warning: this binding uses a now-undocumented feature of cloudflare workers and
can only be used after importing `bliss-router/assets`.
