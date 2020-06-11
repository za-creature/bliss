module.exports = {
    text(text) { return {'type': 'plain_text', text} },
    secret(text) { return {'type': 'secret_text', text} },
    kv(namespace_id) { return {'type': 'kv_namespace', namespace_id} },
    wasm(file) { return {'type': 'wasm_module', file} },
    file(file) { return {'type': 'bliss_asset', file} },
    dir(folder, ...patterns) { return {'type': 'bliss_asset', folder, patterns} }
}
