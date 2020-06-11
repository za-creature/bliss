let {bugs, version} = require('../package.json')
let yargs = require('yargs')


module.exports = yargs
    .strict()
    .wrap(yargs.terminalWidth()-1)
    .usage('Usage: bliss [-options]\n\n' +
           ' Deploys a bliss application from a config file either on a local' +
           ' port (via cf-emu) or globally (via the cloudflare API). When ' +
           ' deploying globally, the CF_ACCOUNT_ID, CF_WORKER_NAME and either' +
           ' CF_TOKEN (preferred) or CF_EMAIL and CF_APIKEY environment ' +
           ' variables are used for authentication.')
    /* options */
    .option('a', {
        alias: 'api',
        type: 'number',
        nargs: 1,
        desc: 'port the local api server listens on; only change this if the' +
              ' default is not available for some reason',
        default: 32123
    })
    .option('c', {
        alias: 'config',
        type: 'string',
        desc: 'read config from this file',
        default: './bliss.config.js'
    })
    .option('d', {
        alias: 'deploy',
        type: 'boolean',
        desc: 'deploy to cloudflare using CF_* environment variables for auth',
        default: false
    })
    .option('p', {
        alias: 'port',
        type: 'number',
        desc: 'deploy worker locally on this port',
        default: 8080
    })
    .option('w', {
        alias: 'watch',
        type: 'boolean',
        desc: 'watch config and referenced files then redeploy on change',
        default: false
    })
    /* other options */
    .help('h', 'show this message and exit')
    .version('v', 'show version number and exit', version)
    .alias({h: 'help', v: 'version'})
    /* error handling */
    .fail((msg, err) => {
        /* c8 ignore next 5 */
        if(err) {
            console.error('unhandled yargs error; please report this at' +
                          `\n${bugs}}\n`)
            throw err
        }
        console.log(`bliss v${version}`)
        console.log()
        console.log('\x1b[91m%s\x1b[0m', msg)
        console.log('try "bliss --help" for options and examples')
        console.log()
        process.exit(1)
    })

module.exports.defaults = (options) => {
    for(let [key, val] of Object.entries(module.exports.parse([])))
        if(!(key in options) && key.length > 1 && key.charAt(0) != '$')
            options[key] = val
    return options
}
