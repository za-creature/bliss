import('chai').then(({assert}) => {
let {valid_utf8, pack, base128_encode} = require('./bar')


describe('bar', () => {
    describe('pack', () => {
        // TODO: implement this
        it('supports utf8 encoding', () => {
            assert.equal(pack({'key': Buffer.from('value')}).toString(),
                         'value["text/plain",5,{"key":1}]AAAa')
        })

        it('supports 7 bit encoding', () => {
            assert.equal(pack({'key': Buffer.from([128])}).toString(),
                         '@\x00["application/octet-stream",-2,{"key":1}]AAAp')
        })

        it('handles recursion', () => {
            assert.equal(pack({
                'usr': {
                    'etc': {
                        'motd': Buffer.from(' '),
                        'motd.mp4': Buffer.from([128])
                    },
                    'bin': {
                        'bash': Uint8Array.from([128]).buffer,
                        'ld': Buffer.from([128]),
                    }
                }
            }).toString(), ' @\x00@\x00@\x00["text/plain",1,"application/octet-stream",-2,2,"video/mp4",2,{"usr":{"etc":{"motd":1,"motd.mp4":6},"bin":{"bash":3,"ld":4}}}]AAB+')
        })

        it('guesses mimetype from extension', () => {
            assert.equal(pack({'file.txt': Buffer.from(' ')}).toString(),
                         ' ["text/plain",1,{"file.txt":1}]AAAf')
        })
    })


    describe('base128_encode', () => {
        it('is binary safe for all paddings', () => {
            let input = []
            for(let i=0; i<13; i++) input.push(256*Math.random()|0)
            for(let i=0; i<6; i++) {
                input.push(256*Math.random()|0)
                let transcode = base128_encode(input)
                for(let char of transcode)
                    assert(char < 128)

                /*let output = base128_decode(String.fromCharCode(...transcode))
                assert(input.length == output.length)
                for(let i=0; i<input.length; i++)
                    assert(input[i] == output[i])*/
            }
        })
    })


    describe('valid_utf8 (slow)', function() {
        this.timeout(10000)
        /* Ported from
        https://github.com/zwegner/faster-utf8-validator/blob/master/test.lua

        Copyright (c) 2019 Zach Wegner

        Permission is hereby granted, free of charge, to any person obtaining a
        copy of this software and associated documentation files (the
        "Software"), to deal in the Software without restriction, including
        without limitation the rights to use, copy, modify, merge, publish,
        distribute, sublicense, and/or sell copies of the Software, and to
        permit persons to whom the Software is furnished to do so, subject to
        the following conditions:

        The above copyright notice and this permission notice shall be included
        in all copies or substantial portions of the Software.

        THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
        OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
        IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
        CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
        TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
        SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */
        let test = (name, ...cases) => it(name, () => {
            for(let [expected, ...ranges] of cases) {
                let data = new Uint8Array(ranges.length)
                let max = ranges.length -1
                let generate = offset => {
                    let [value, end] = ranges[offset]
                    if(offset < max)
                        while(value <= end)
                            (data[offset] = value++), generate(offset+1)
                    else
                        while(value <= end)
                            (data[offset] = value++), valid_utf8(data) == expected ||
                            assert.fail(`expected ${expected}, got ${!expected} for ${data}`)
                }
                generate(0)
            }
        })

        const ANY = [0, 0xFF]
        const ASCII = [0, 0x7F]
        const CONT = [0x80, 0xBF]
        test('ascii', [true,
            [0x20, 0x20], ASCII, ASCII, ASCII]
        )

        test('two byte sequences',
            [false, [0xC2, 0xC2]],
            [false, [0xC2, 0xC2], ASCII],
            [ true, [0xC2, 0xC2], CONT],
            [false, [0xC2, 0xC2], [0xC0, 0xFF]],
            [false, [0xC2, 0xC2], CONT, CONT],
            [false, [0xC2, 0xC2], CONT, CONT, CONT]
        )

        test('three byte sequences',
            [false, [0xE1, 0xE1]],
            [false, [0xE1, 0xE1], CONT],
            [ true, [0xE1, 0xE1], CONT, CONT],
            [ true, [0xE1, 0xE1], CONT, CONT, ASCII],
            [false, [0xE1, 0xE1], CONT, ASCII],
            [false, [0xE1, 0xE1], CONT, CONT, CONT]
        )

        test('four byte sequences',
            [false, [0xF1, 0xF1]],
            [false, [0xF1, 0xF1], CONT],
            [false, [0xF1, 0xF1], CONT, CONT],
            [ true, [0xF1, 0xF1], CONT, CONT, CONT],
            [false, [0xF1, 0xF1], CONT, CONT, ASCII],
            [ true, [0xF1, 0xF1], CONT, CONT, CONT, ASCII]
        )

        test('no c0/c1 bytes',
            [false, [0xC0, 0xC1], ANY],
            [false, [0xC0, 0xC1], ANY, ANY],
            [false, [0xC0, 0xC1], ANY, ANY, ANY]
        )

        test('no e0 followed by 80..9f',
            [false, [0xE0, 0xE0], [0x00, 0x9F], CONT],
            [ true, [0xE0, 0xE0], [0xA0, 0xBF], CONT]
        )

        test('no surrogate pairs',
            [ true, [0xE1, 0xEC], CONT, CONT],
            [ true, [0xED, 0xED], [0x80, 0x9F], CONT],
            [false, [0xED, 0xED], [0xA0, 0xBF], CONT],
            [ true, [0xEE, 0xEF], CONT, CONT]
        )

        test('no f0 followed by 80..8f',
            [false, [0xF0, 0xF0], [0x80, 0x8F], CONT, CONT],
            [ true, [0xF0, 0xF0], [0x90, 0xBF], CONT, CONT]
        )

        test('no code points above U+10FFFF',
            [ true, [0xF4, 0xF4], [0x80, 0x8F], CONT, CONT],
            [false, [0xF4, 0xF4], [0x90, 0xBF], CONT, CONT]
        )

        test('no bytes above f4',
            [false, [0xF5, 0xFF], ANY],
            [false, [0xF5, 0xFF], ANY, ANY],
            [false, [0xF5, 0xFF], ANY, ANY, ANY]
        )
    })
})
})
