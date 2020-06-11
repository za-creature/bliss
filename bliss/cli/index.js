#!/usr/bin/env node
let bundle = require('./bundler')
let cli = require('./cli')

let emu = require('cf-emu')
let crypto = require('crypto')
let {Thread} = require('cf-emu/lib/util')
let http = require('http')
let https = require('https')


let uuid = () => crypto.randomBytes(16).toString('hex')
function main(options) {
    // set defaults
    options = cli.defaults(options)

    // deploy options
    let deploy_fn = http.request, deploy_opts = {
        method: 'PUT',
        path: '/',
        headers: {}
    }

    // deploy callback
    let last = Promise.resolve()
    let build = () => bundle(options.config, options.watch).on('parts', parts => {
        // build multipart body
        let boundary = uuid()
        let buffers = []
        for(let part in parts) {
            let [mime, body] = parts[part]
            buffers.push(Buffer.from(
                `--${boundary}\r\n` +
                `content-type:${mime}\r\n` +
                `content-disposition:form-data;name="${part}"\r\n\r\n`
            ))
            buffers.push(body)
            buffers.push(Buffer.from('\r\n'))
        }
        buffers.push(Buffer.from(`--${boundary}--\r\n`))
        let body = Buffer.concat(buffers)

        // perform synchronized multipart put request to target
        deploy_opts.headers['Content-Type'] = `multipart/form-data;boundary="${boundary}"`
        let req = deploy_fn(deploy_opts)
        last = last
        .then(() => new Promise((res, rej) => req.end(body).on('response', res)
                                                           .on('timeout', rej)
                                                           .on('error', rej)))
        .then(body => new Promise((res, rej) => body
            .on('data', data => console.log(data.toString()))
            .on('end', res)
            .on('error', err => (body.close(), rej(err)))
        ))
        .catch(err => console.error(err))
    })

    if(options.deploy) {
        // (re)deploy to cloudflare
        if(process.env.CF_EMAIL && process.env.CF_APIKEY) {
            deploy_opts.headers['X-Auth-Email'] = process.env.CF_EMAIL
            deploy_opts.headers['X-Auth-Key'] = process.env.CF_APIKEY
        } else if(process.env.CF_TOKEN)
            deploy_opts.headers['Authorization'] = `Bearer ${process.env.CF_TOKEN}`
        else
            throw new Error('cannot deploy to cloudflare: no authentication' +
                            ' variables defined')
        if(!process.env.CF_ACCOUNT_ID || !process.env.CF_WORKER_NAME)
            throw new Error('cannot deploy to cloudflare: missing either' +
                            ' account id, worker name or both')
        deploy_opts.host = 'api.cloudflare.com'
        deploy_opts.path = `/client/v4/accounts/${process.env.CF_ACCOUNT_ID}` +
                           `/workers/scripts/${process.env.CF_WORKER_NAME}`
        deploy_fn = https.request
        return build()
    } else {
        // spawn a local emulator and (re)deploy locally
        if(!process.env.CF_TOKEN)
            process.env.CF_TOKEN = uuid()
        deploy_opts.headers['Authorization'] = `Bearer ${process.env.CF_TOKEN}`
        deploy_opts.port = options.api

        let server_opts = {
            watchdog: false,
            api: options.api,
            port: options.port
        }
        let thread = new Thread('bliss api')
        let bundler
        thread.on('stop', () => {
            server && server.emit('stop')
            bundler && bundler.emit('stop')
        })
        let first_status = 0
        let server = emu(server_opts).on('close', status => {
            server =  null
            first_status = first_status || status
            bundler ? bundler.emit('stop') : thread.emit('close', first_status)
        }).once('ready', () => bundler = build().on('close', status => {
            bundler = null
            first_status = first_status || status
            if(!server)
                thread.emit('close', first_status)
        }))
        return thread
    }
}


if(require.main === module) {
    let thread = main(cli.argv).once('close', status => process.exit(status))
    process.on('SIGINT', () => {
        thread.emit('stop')
        console.log('Shutting down...')
        setTimeout(() => console.log('To force, send ^C again'), 500)
    })
} else
    module.exports = main
