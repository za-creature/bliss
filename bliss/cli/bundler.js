let {pack} = require('./bar')

let {Thread} = require('cf-emu/lib/util')
let crypto = require('crypto')
let fs = require('fs')
let nanomatch = require('nanomatch')
let watcher = require('node-watch')
let path = require('path')


class Interrupted extends Error {}
let uuid = () => crypto.randomBytes(16).toString('hex')
module.exports = function(config, watch=false, debounce=200) {
    let thread = new Thread('bliss bundler').once('stop', () => watch = false)
    let c = watch ? _ => {if(!watch) throw new Interrupted(); return _} : _ => _
    let bundle = async function() {
        let status, watched_files = []

        try {
            // flush cache
            for(let key in require.cache)
                delete require.cache[key]

            // read config
            config = path.resolve(config)
            let {code, bindings={}} = require(`./${path.relative(__dirname, config)}`)
            watched_files.push(config)

            // read source code
            if(typeof code != 'string')
                throw new Error('`code` must be a string that either points ' +
                                ' to a javascript file or contains javascript' +
                                ' code itself')

            let erf = () => ({isFile: () => false})
            if(code.length < 256 && (await c(fs.promises.stat(code).catch(erf))).isFile()) {
                code = path.resolve(code)
                watched_files.push(code)
                code = await c(fs.promises.readFile(code))
            }
            else
                code = Buffer.from(code)

            // parse bindings, collect assets and convert files to parts
            let assets = {}, parts = {}, iter = Object.entries(bindings)
            bindings = []
            for(let [name, binding] of iter) {
                let {type, part, file} = binding
                if(part)
                    throw new Error('`part` is not supported; use `file` instead')

                // passthrough regular bindings with minimal changes
                if(type.toLowerCase() != 'bliss_asset') {
                    if(file) {
                        file = path.resolve(file)
                        parts[binding.part = uuid()] = ['application/octet-stream',
                                                        await c(fs.promises.readFile(file))]
                        watched_files.push(file)
                    }
                    delete binding.file
                    binding.name = name
                    bindings.push(binding)
                    continue
                }

                // collect all `bliss_asset` bindings into a single array that
                // will then be archived as a single text_blob binding
                let {folder, patterns, options} = binding
                if(file) {
                    file = path.resolve(file)
                    assets[name] = await c(fs.promises.readFile(file))
                    watched_files.push(file)
                } else if(!folder)
                    throw new Error('`bliss_asset` bindings must either have a' +
                                    ' `file` or a `folder` property (optionally' +
                                    ' with `patterns` and `options`)')
                else {
                    // normalize path and set default nanomatch options
                    folder = path.resolve(folder)
                    if(!folder.endsWith(path.sep))
                        folder += path.sep
                    if(!patterns || !patterns.length)
                        patterns = ['**/*']
                    options = options || {basename: true, nocase: true}

                    // recursively scan `folder` for `patterns` using `options`
                    assets[name] = await (async function scan(offset) {
                        let result = {}
                        for(let file of await c(fs.promises.readdir(folder + offset,
                                                                  {'withFileTypes': true}))) {
                            let filename = offset + file.name
                            if(file.isDirectory()) {
                                let res = await c(scan(filename + path.sep))
                                if(Object.keys(res).length)
                                    result[file.name] = res
                            } else if(nanomatch(filename, patterns, options).length)
                                result[file.name] = await c(fs.promises.readFile(folder + filename))
                        }
                        return result
                    })('')
                    watched_files.push([folder, patterns, options])
                }
            }

            // pack assets and export archive as binding
            assets = pack(assets)
            if(assets.length > 8) { // empty archive is [{}]AAAE
                let part = uuid()
                parts[part] = ['text/plain', assets]
                bindings.push({name: 'BLISS_DATA', type: 'text_blob', part})
            }

            // pack metadata & code
            let body_part = uuid()
            let metadata = Buffer.from(JSON.stringify({
                body_part,
                bindings
            }), 'utf-8')
            parts['metadata'] = ['application/json', metadata]
            parts[body_part] = ['application/javascript', code]

            status = 0
            thread.emit('parts', parts)
        } catch(err) {
            if(!(err instanceof Interrupted)) {
                console.error(err)
                status = 1
            }
        } finally {
            // watch all files for the next iteration
            if(watch && watched_files.length) {
                let folders = [], pending
                let watch = watcher(watched_files.map(file => {
                    if(Array.isArray(file)) {
                        folders.push(file)
                        return file[0]
                    }
                    return file
                }), {recursive: true, persistent: false, filter: filename => {
                    for(let [prefix, patterns, options] of folders)
                        if(filename.startsWith(prefix))
                            return nanomatch(filename, patterns, options).length
                    return true
                }}, () => {
                    // node-watch debouncing only works for individual files;
                    // since a cold-start build usually involves compiling both
                    // frontend and backend resources, this is required
                    if(!watch)
                        return
                    if(pending)
                        clearTimeout(pending)
                    pending = setTimeout(() => {
                        watch.on('close', bundle).close()
                        watch = null
                    }, debounce)
                })
                folders.sort((a, b) => b.length - a.length)
            } else
                thread.emit('close', status)
        }
    }

    process.nextTick(bundle)
    return thread
}
