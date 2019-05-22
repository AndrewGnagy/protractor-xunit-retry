#!/usr/bin/env node
var argv = require('yargs').argv;

describe('Retry test suite', () => {
    it('Test 1234', async () => {
        await browser.get('https://www.google.com');
        if (!!argv.internalretry) {
            expect(true).toEqual(true);
        } else {
            expect(true).toEqual(false);
        }
    });
});