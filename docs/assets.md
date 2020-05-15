# assets
Unlike most of the other modules, I've given this one some thought about the
ethical implications of implementing it, especially now that Cloudflare is
offering workers for free. This implements delivery of static assets, normally a
value-added feature of
[Workers-KV](https://developers.cloudflare.com/workers/reference/storage) which
is only available with commercial plans.

Ultimately, I went ahead not only because it's a very useful feature to have,
but also because like most of the other limitations imposed by CF-Workers, it
encourages good coding practices. It wasn't all that long ago that downloading
1MiB in order to view a web page was considered unacceptable, and I believe that
there's social good in steering web development back towards that direction.

While a for-profit company, Cloudflare has been known to stand up for the little
guy at times, and I believe that this bit of hackery sort-of fits in with that
strategy. That being said, regardless of whether or not this solution is good
enough for your use case, if you can afford to pay for their services, please
do: it supports their business, encourages competition, and gives you leverage.

## Usage
1. Put static assets (css, js, images, documents) into the `assets/` folder
2. For each file you want to serve, configure a static route specifying the
   filename, content-type and optionally, the
   [disposition](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Disposition)
   and a map of variants for serving
   [compressed versions](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding)
   if the client supports that encoding:
   ```javascript
   import asset from 'bliss/util/assets'
   asset.prefix = '/assets/'  // if you change it, rename the folder as well
   asset('style.css', 'text/css', 'inline',
         {gzip: 'style.css.gz', br: 'style.css.br'})
   ````
3. Re-deploy your worker whenever you add, update or delete any assets.

## Limits
All static assets are embedded in your worker and their size counts towards the
1MiB quota. This of course means that the more code you have, the less space you
have for assets, and vice-versa. In addition to the 1MiB limit, there is an
encoding overhead of about 15% (base128) if you're uploading binary files.
