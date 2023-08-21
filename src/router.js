'use strict';

const Router = require('koa-router');
const router = new Router();
const { records } = require('./');
const noop = require('./watcher/noop');

router.get('/', noop);
router.get('/records/:n', records)


module.exports = router;