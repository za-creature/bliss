let patch = require('cf-emu/runtime')
try {
    Object.assign(global, patch)
} catch(e) {
    delete patch.crypto
    Object.assign(global, patch)
}
global.self.BLISS_DATA = ' ["text/plain",1,{"test_global_file_binding":1}]AAAv'
