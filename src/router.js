'use strict';

const Router = require('koa-router');
const router = new Router();
require("./watcher/watchLogs")

const noop = require('./watcher/noop');

const watch = require('./watcher');
// router.get('/watch', watch)
router.get('/', noop);


module.exports = router;