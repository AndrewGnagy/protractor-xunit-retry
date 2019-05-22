#!/usr/bin/env node
var retry = new (require('../xunit-retry'))('./xunit');
var jasmineReporters = require('jasmine-reporters');

exports.config = {
    framework: 'jasmine2',
    specs: ['./*.spec.js'],
    jasmineNodeOpts: {
        defaultTimeoutInterval: 2000,
        showColors: true
    },
    directConnect: true,
    chromeDriver: process.cwd() + '/node_modules/chromedriver/lib/chromedriver/chromedriver',
    capabilities: {
        browserName: 'chrome'
    },
    onPrepare: function () {
        jasmine.getEnv().addReporter(
            new jasmineReporters.JUnitXmlReporter({
                consolidateAll: false,
                filePrefix: 'xunit',
                savePath: './xunit/'
            }));
        browser.waitForAngularEnabled(false);
    },
    afterLaunch: function() {
        return retry.afterLaunch(2, 'Retrytest');
    }
};