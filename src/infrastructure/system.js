'use strict';
// Cổng Clock và Random của máy thật.
const crypto = require('node:crypto');

const systemClock = { now: () => new Date().toISOString(), millis: () => Date.now() };
const systemRandom = { bytes: (n) => crypto.randomBytes(n) };

module.exports = { systemClock, systemRandom };
