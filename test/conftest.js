import chai from 'chai'
import promise from 'chai-as-promised'


chai.use(promise)
global.debug = x => (console.log(x), x)
