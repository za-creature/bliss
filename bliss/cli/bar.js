/* Bliss ARchive
text-based, `new TextDecoder().decode()`-safe, file archival format

structurally composed from the separator-less concatenation of:
* [utf8 data]
* [7bit data]
* metadata (contains mimetypes, file sizes and finally folder structure):
  ```
  mimetype1          , size1, size2, mimetype2  , -size3, size4, tree
  ['application/json',   754,   653, 'image/png',  -8123, 17463, {
        'client_assets': {
            'client.json': 2, // points to the 653b utf8 encoded json
            'user.png': 5 // points to the 17463b base128 encoded png
        },
        'favicon.ico': 4, // points to the 8123b base128 encoded png
        'server.json': 1 // points to the 754b utf8 encoded json
  }]
  ```
  the metadata JSON is an array state machine with the following semantics:
  * a `Number` specifies a file's encoded length (in UTF-16 codepoints)
    * the first file starts at byte-index 0 in the archive
    * all other files start after their respective previous file ends
  * the first (and only, though optional) negative `Number` marks the first
    base128-encoded file; the absolute value of the number is the actual length
    * all files before the first negative `Number` are utf8-encoded
    * all files after the first negative `Number` are base128-encoded
  * a `String` sets the mimetype of all future files until the next `String`
    ; the first entry of the metadata array is always a `String`
  * the last entry is always an `Object` that maps file (or folder) names to
    either:
    * an index that points to the file index in the metadata array (size)
    * another `Object` that describes a folder containing other files and
      folders contained within; traditional operating systems would for the sake
      of brevity define paths such as:
      * `file.ext`
      * `folder/file.ext` (UNIX)
      * `folder\file.ext` (DOS / Windows)
      however the canonical way of referencing a file in bliss archives is:
      * `bar['file.ext']` (`Uint8Array`)
      * `bar['folder']` (`Object`)
      * `bar['folder']['file.ext']` (`Uint8Array`)
    note: while there is no defined subfolder recursion limit in this spec,
    JSON-decoders as well as the runtimes that invoke them will impose their
    own limits which you should already be aware of
* metadata length in UTF-16 codepoints as a base64-encoded Uint24 (4 bytes)


see `bliss/assets/unpack()` for reference decoder


since the metadata segment can be 16MiB at most, this archive format is capable
of storing a theoretical maximum of just under 1.2 million (FYI: I'm not great
at math) one-byte, one-letter files though practical requirements are well
below that threshold:
* cloudflare limits total payload size to 1MiB after (unspecified so let's guess
  a 2:1 ratio) compression which means the largest archive will be about 2MiB
* we'll assume the archive contains many small but reasonably sized files (e.g.
  1KiB icons, js and css modules) and that these are organized into recursive
  folders of at most 20 files each; the average length of a filename is 20
  characters including extension and the average length of a folder is 10
  characters; as far as mimetypes go, assume a diversified pool of 20 different
  formats
* under the above conditions, total payload is 1800 files in 90 folders, with a
  50KiB meta segment and 200KiB of 8to7 encoding overhead

note that the reference decoder returns lazy promises which means that while the
folder structure is immediately available after calling `unpack()`, file
contents are only decoded after they are awaited on
*/
let mime_db = require('mime-db')
let mimes = {} // maps extensions to mimes, e.g. {js: 'application/javascript'}
for(let key in mime_db)
    for(let val of mime_db[key].extensions || [])
        mimes[val] = mimes[val] || key


exports.pack = payload => {
    // build archive
    let buffers = []

    // collect files from payload and sort by encoding and mimetype
    let files = []
    let pack = obj => {
        for(let key in obj) {
            let data = obj[key]
            if(ArrayBuffer.isView(data))
                data = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
            else if(data instanceof ArrayBuffer)
                data = Buffer.from(data)
            if(data instanceof Buffer) {
                let length, text = valid_utf8(data), default_mime = 'application/octet-stream'
                if(text) {
                    length = Buffer.from(data).toString('utf-8').length // TODO: optimize this
                    default_mime = 'text/plain'
                }
                else {
                    data = base128_encode(data)
                    length = data.byteLength
                }
                obj[key] = data

                let ext = key.lastIndexOf('.')
                ext = ~ext && key.slice(ext+1).toLowerCase()
                let mime = mimes[ext] || default_mime

                files.push([!text, mime, length, obj, key])
            } else
                pack(data)
        }
    }
    pack(payload)
    files.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : 1))

    // build metadata table and push file buffers to archive
    let table = [], last_mime = '', last_binary = false
    for(let [binary, mime, len, obj, key] of files) {
        // store mime change in meta table
        if(last_mime != mime)
            table.push(last_mime = mime)

        // negate length on transition from text to binary
        if(last_binary != binary)
            len = -len, last_binary = true

        table.push(len) // store file length in meta table
        buffers.push(obj[key]) // push file buffer to archive
        obj[key] = table.length - 1 // store table index in folder tree
    }
    table.push(payload)

    // encode and push metadata buffer to archive
    table = JSON.stringify(table)
    let len = table.length
    buffers.push(Buffer.from(table, 'utf-8'))

    // encode and push metadata buffer length to archive
    len = Buffer.from([len>>16, len>>8&255, len&255]).toString('base64')
    buffers.push(Buffer.from(len, 'utf-8'))

    return Buffer.concat(buffers)
}


let valid_utf8 = exports.valid_utf8 = bin => {
    // this could be faster, and it should return the number of UTF-16
    // code points contained within `bin` for additional speedup
    let i = 0
    let l = bin.length
    let c
    while(i<l) {
        c = bin[i++]
        if(c >> 3 == 30) { // quad
            if(c > 0xf4) return false // out of range
            if(i==l || (c == 0xf4 && bin[i] > 0x8f) // out of range
                    || (c == 0xf0 && bin[i] >> 4 == 8) // overlong
                    || bin[i++] >> 6 != 2)
                return false
            if(i==l || bin[i++] >> 6 != 2)
                return false
            if(i==l || bin[i++] >> 6 != 2)
                return false
        } else if (c >> 4 == 14) { // triple
            if(i==l || (c == 0xe0 && bin[i] >> 5 == 4) // overlong
                    || (c == 0xed && bin[i] >> 5 == 5) // surrogate
                    || bin[i++] >> 6 != 2)
                return false
            if(i==l || bin[i++] >> 6 != 2)
                return false
        } else if(c >> 5 == 6) { // double
            if(c == 0xc0 || c == 0xc1)
                return false // overlong
            if(i==l || bin[i++] >> 6 != 2)
                return false
        } else if(c >> 7 != 0) // single
            return false
    }
    return true
}


let base128_encode = exports.base128_encode = src => {
    /*
    Cloudflare recently added support for binary bindings and from my testing,
    it appears that while their channel is binary safe (uploading with mimetype
    application/octet-stream worked fine), they are exposed to the worker as
    strings which expect their data to be UTF-8 or some other text encoding.
    Luckily, as long as the high bit is 0, the rest are left untouched so it's
    possible to exploit this in order to store an extra 128 KiB[^1] when
    compared to standard base64 encoding at the expense of about 600 bytes for
    the decoder and some fairly valuable CPU cycles.

    [^1]: actual payload capacity depends on the size of your code and the
          compression algorithm cloudflare uses before storing the worker
    */
    let src_index = 0, limit = src.length
    let dst_index = 0, dst = Buffer.alloc(Math.ceil(8*limit/7))
    let buff = 0, buff_size = 0

    while(src_index < limit) {
        buff = buff << 8 | src[src_index++]
        buff_size += 8
        do {
            buff_size -= 7
            dst[dst_index++] = buff >> buff_size
            buff &= (1<<buff_size)-1
        } while(buff_size >= 7)
    }
    if(buff_size)
        dst[dst_index] = buff << (7-buff_size)
    return dst
}
