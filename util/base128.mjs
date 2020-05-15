export function base128_encode(binary) {
    /*
    Cloudflare recently added support for binary bindings and from my testing,
    it appears that while their channel is binary safe (uploading with mimetype
    application/octet-stream worked fine), they are exposed to the worker as
    strings which expect their data to be UTF-8 or some other text encoding.
    Luckily, as long as the high bit is 0, the rest are left untouched so it's
    possible to exploit this in order to store an extra 128 KiB[^1] when
    compared to standard base64 encoding at the expense of about 600 bytes for
    the decoder and some fairly valuable CPU cycles.

    [^1]: actual payload capacity depends on the size of your code of course
    */
    let src_index = 0, src = Uint8Array.from(binary), limit = src.length
    let dst_index = 0, dst = new Uint8Array(Math.ceil(8*limit/7))
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


export function base128_decode(text) {
    /*
    I did a couple of iterations on this, experimenting with:
    * Binding text.charCodeAt to a local function
      [much slower]
    * Using text.codePointAt instead of charCodeAt
      [slower]
    * Updating the first 3 shorts with DataView.setUint16 (Uint32 is promoted
      to a float so that would have been even slower than the simple decoder)
      [much slower]
    * Different buffer flushing strategies with precomputed constants
      [slightly slower]

    Of all the iterations, this (the first) was the fastest and on my (pretty
    good) machine, the (binary) throughput is about 375KiB/ms with NodeJS 10.16.

    Unfortunately, it's not possible to remotely measure performance because
    CF disables Date.now() for security reasons and at max 10ms per invocation,
    you're basically measuring network latency but assuming the throughput is a
    quarter of that when running on cloudflare workers, it should still be
    possible to crunch through the entire max payload of slightly below 900KiB
    within the 10 milliseconds of CPU time allocated to a request. At any rate,
    if you use this function for your own purposes, consider caching its result
    to memory and maybe limit yourself to 200-300KiB / request to be safe and
    leave ample room to do other stuff
    */
    let l = text.length
    let data = new Uint8Array(7*l>>3)
    let i = 0, j = 0, b = 0

    // encode blocks of 8 characters into 7 bytes
    l = l>>3<<3
    while(i < l) {
        b = b<<7|text.charCodeAt(i++)
        b = b<<7|text.charCodeAt(i++)
        b = b<<7|text.charCodeAt(i++)
        data[j++] = b >> 13
        data[j++] = b >> 5 & 255
        b &= 31
        b = b<<7|text.charCodeAt(i++)
        b = b<<7|text.charCodeAt(i++)
        data[j++] = b >> 11
        data[j++] = b >> 3 & 255
        b &= 7
        b = b<<7|text.charCodeAt(i++)
        b = b<<7|text.charCodeAt(i++)
        data[j++] = b >> 9
        data[j++] = b >> 1 & 255
        b &= 1
        b = b<<7|text.charCodeAt(i++)
        data[j++] = b
        // xoring this to itself is a bit faster than setting it to 0 and for
        // some reason (cache? register allocator?), setting to 0 and shifting
        // it by 7 next loop is faster than re-initializing it from scratch
        b ^= b
    }

    // last at-most 7 characters
    let bs = 0
    l = text.length
    while(i < l) {
        b = b<<7|text.charCodeAt(i++)
        bs += 7
        if(bs>=8) {
            bs -= 8
            data[j++] = b >> bs
            b &= (1<<bs)-1
        }
    }
    if(bs)
        data[j] = b << (8-bs)
    return data
}
