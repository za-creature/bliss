[![npm](https://img.shields.io/npm/v/bliss-router)](https://www.npmjs.com/package/bliss-router)
[![tests](https://github.com/za-creature/bliss/workflows/tests/badge.svg?branch=master&event=push)](https://github.com/za-creature/bliss/actions?query=workflow%3Atests+branch%3Amaster)
[![coverage](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/za-creature/1e4664346f422ed78c1cc07a6a5da580/raw/bliss-cov.json)](https://za-creature.github.io/bliss)


# bliss
*Experimental* work-in-progress some-batteries-included `on('fetch')` HTTP
server framework designed and optimized for
[Cloudflare Workers](https://workers.cloudflare.com/)

Originally written as a tech demo in 2018 back when CF workers was still in beta
and there was no official tooling available. Nowadays you might at least
consider using [wrangler](https://github.com/cloudflare/wrangler) instead of
the not-well-tested-but-mostly-works-for-me-on-mac CLI bundled with bliss.

## Installation

```bash
npm i --save bliss-router

```

## Usage

`bliss` uses a config file, usually `bliss.config.js` in the current working
directory in order to describe the code and data segments of your application.
The syntax is:

`bliss.config.js`
```js
let {text, secret} = require("bliss-router/assets")
module.exports = {
    // this _should_ be a local file path instead but no judgement :)
    "code": "addEventListener('fetch', ev => ev.respondWith(new Response('hello world')))",
    "bindings": {
        "AWS_ACCESS_KEY_ID": {
            "type": "plain_text",
            "text": "AKIAIOSFODNN7EXAMPLE"
        },
        // you can also use the helper functions from `bliss-router/bindings` to generate these objects
        "AWS_SECRET_ACCESS_KEY": secret("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"),
        "AWS_REGION": text("us-east-1")
    }
}
```

With your config file correctly configured, you can then deploy your worker
locally (by default on port 8080):

```bash
cd /path/to/your/folder/containing/bliss.config.js
npx bliss-router
```

For more options, see the [CLI spec](bliss/cli/cli.js) or run
```bash
npx bliss-router --help
```

## Module docs
* [`bliss`](bliss/router.md)
    * [`assets`](bliss/assets.md) ([src](bliss/assets.mjs))
    * ~~[`aws`](bliss/aws.md)~~ ([src](bliss/aws.mjs))
        * [`dynamo`](bliss/aws/dynamo.md) ([src](bliss/aws/dynamo.mjs))
        * [`lambda`](bliss/aws.labda.md) ([src](bliss/aws/lambda.mjs))
    * [`bindings`](bliss/bindings.md) ([src](bliss/bindings.mjs))
    * [`middleware`](bliss/router.md#middleware)
        * ~~`rtc`~~ ([src](bliss/middleware/rtc.mjs))
        * ~~`tasks`~~ ([src](bliss/middleware/tasks.mjs))
    * [`util`](bliss/util.md) ([src](bliss/util.mjs))
        * ~~[`date_format`](bliss/util/date_format.md)~~ ([src](bliss/util/date_format.mjs))
        * [`lazy`](bliss/util/lazy.md) ([src](bliss/util/lazy.mjs))
        * ~~[`list`](bliss/util/list.md)~~ ([src](bliss/util/list.mjs))
        * ~~[`lru`](bliss/util/lru.md)~~ ([src](bliss/util/lru.mjs))
