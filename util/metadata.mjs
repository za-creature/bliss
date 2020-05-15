/* global process:false, Buffer:false */
import date_format from '../util/date_format'

import {spawn} from 'child_process'
import fs from 'fs'
import path from 'path'


let import_main = async (main, bindings) => {
    // export user bindings before importing main
    for(let binding of bindings)
        self[binding.name] = binding.file
            ? Buffer.from(await fs.promises.readFile(binding.file)).toString()
            : binding.text

    // import main to populate the asset routing table
    await import(path.relative(
        path.dirname(new URL(import.meta.url).pathname),
        path.resolve(main)
    ))

    // import static bindings
    return await import('./assets')
}

let manifest
if(process.env.CF_ENV == 'local') {
    // file imported by cf-emu
    manifest = async function(main, bindings=[]) {
        let {static_assets} = await import_main(main, bindings)

        // export new bindings for all assets; since user-defined bindings are
        // already exported, need only pass the dynamic ones on to cf-emu
        bindings = []
        let etags = {
            'deployed': date_format(new Date(), 'ddd, dd mmm yyyy HH:MM:ss', true) + ' GMT'
        }
        let build = Date.now()
        for(let [offset, file] of static_assets.entries()) {
            etags[offset] = '"' + [build, offset].join('_') + '"'
            bindings.push({
                'type': 'text_blob',
                'name': `BLISS_ASSET_BINARY_${offset}`,
                file
            })
        }
        bindings.push({
            'type': 'text_blob',
            'name': 'BLISS_ASSET_ETAGS',
            'text': JSON.stringify(etags)
        })
        // return a cf-emu compatible metadata.json
        return {
            'body_file': main,
            'bindings': bindings
        }
    }
} else {
    // called directly to deploy
    let compile = async (main, bindings) => {
        await import('cf-emu')
        let {static_assets} = await import_main(main, bindings)
        let {base128_encode} = await import('./base128')
        let {hex, sha256} = await import('../util')

        let etags = {
            'deployed': date_format(new Date(), 'ddd, dd mmm yyyy HH:MM:ss', true) + ' GMT'
        }
        for(let [offset, file] of static_assets.entries()) {
            let data = await fs.promises.readFile(file)
            let binary = data.some(b => b > 127)
            if(binary)
                await fs.promises.writeFile(`.deploy/${offset}`,
                                            base128_encode(data))
            etags[offset] = '"' + hex(await sha256(data)).slice(0, 32) + '"'
            bindings.push({
                'type': 'text_blob',
                'name': binary ? `BLISS_ASSET_${offset}`
                               : `BLISS_ASSET_BINARY_${offset}`,
                'file': binary ? `.deploy/${offset}` : file
            })
        }
        bindings.push({
            'type': 'text_blob',
            'name': 'BLISS_ASSET_ETAGS',
            'file': '.deploy/etags.json'
        })
        let parts = 0
        let args = [
            '-X', 'PUT',
            'https://api.cloudflare.com/client/v4/accounts/' +
            `${process.env.CF_ACCOUNT_ID}/workers/scripts/` +
            `${process.env.CF_SCRIPT_NAME}`,
            '-H', `X-Auth-Email: ${process.env.CF_EMAIL}`,
            '-H', `X-Auth-Key: ${process.env.CF_APIKEY}`,
            '-F', 'metadata=@.deploy/metadata.json;type=application/json',
            '-F', `main=@${process.argv[2]};type=application/javascript`
        ]
        for(let binding of bindings) {
            if(binding.file) {
                binding.part = `part${parts++}`
                args.push(
                    '-F',
                    `${binding.part}=@${binding.file};type=application/octet-stream`
                )
                delete binding.file
            }
        }
        await fs.promises.writeFile('.deploy/etags.json', JSON.stringify(etags))
        await fs.promises.writeFile('.deploy/metadata.json', JSON.stringify({
            'body_part': 'main', bindings
        }))
        await new Promise((res, rej) => spawn('curl', args, {'stdio': ['inherit', 'inherit', 'inherit']}).on('end',
            code => code ? rej(`Exit code: ${code}`) : res()
        ))
    }
    manifest = (main, bindings=[]) => compile(main, bindings).catch(err => {
        console.error(err.stack)
        process.exit(1)
    })
}
export default manifest
