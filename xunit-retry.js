#!/usr/bin/env node

var argv = require('yargs').argv;
var fs = require('fs');
var path = require('path');
var xml2js = require('xml2js');
var childProcess = require('child_process');
var maxRetry;

function prepareProtractorExecutionPath(path) {
    var executionPath = path.split(' ');
    return executionPath[executionPath.length-1];
}

function getResultsFilePath(dir = './xunit', suite = '.xml') {
    var resultsDir = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(resultsDir)) {
        throw Error('Please specify a valid xunit results directory');
    }

    let items = fs.readdirSync(dir);
    let fileName = items.find(item => { return item.toLowerCase().indexOf(suite.toLowerCase()) !== -1; });
    if (!fileName) {
        throw Error('No xunit result file found containing: ' + suite);
    }

    return resultsDir + '/' + fileName;
}

function spawn(command, args) {
    return new Promise(resolve => {
        var child = childProcess.spawn(command, args);
        child.stdout.pipe(process.stdout);
        child.stderr.pipe(process.stderr);
        child.on('close', (code) => {
            resolve(code);
        });
    });
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

async function reprocessXunitFile(dir, file, lastRunXunitResult) {
    let builder = new xml2js.Builder();
    let originalFile = getResultsFilePath(dir, '.xml.tmp');
    let xunitExistingResult = await readAndParseXunit(originalFile);
    //Iterate through and find previous failures that are now passes, then correct them
    let passingTests = lastRunXunitResult.testsuites.testsuite[0].testcase.filter(tc => { return !tc.failure && !tc.skipped; });
    passingTests.forEach(test => {
        let swapIndex = xunitExistingResult.testsuites.testsuite[0].testcase.findIndex(existingTc => { return existingTc.$.name == test.$.name; });
        xunitExistingResult.testsuites.testsuite[0].testcase.splice(swapIndex, 1, test);
    });
    //Decrement failure counts
    xunitExistingResult.testsuites.$.failures = (parseInt(xunitExistingResult.testsuites.$.failures) - passingTests.length) + '';
    xunitExistingResult.testsuites.testsuite[0].$.failures = (parseInt(xunitExistingResult.testsuites.testsuite[0].$.failures) - passingTests.length) + '';
    fs.writeFileSync(file, builder.buildObject(xunitExistingResult));
    //Delete old temp file
    fs.unlinkSync(originalFile);
}

function readAndParseXunit(file) {
    var data = fs.readFileSync(file, 'utf8');
    var parser = new xml2js.Parser();
    return new Promise((res, rej) => {
        parser.parseString(data, function (err, result) {
            if (err) {
                throw Error('Error parsing xunit file');
            }
            res(result);
        });
        rej();
    });
}

function printRetryLog(attempt, retryList) {
    console.log('\n Re-running tests, attempt: ', attempt);
    console.log(' Re-running the following tests: ', retryList);
    console.log('\n');
}

module.exports = class XunitRetry {
    constructor(xunitResultsDir) {
        this.xunitResultsDir = xunitResultsDir;
    }
    
    //Executed after test run is complete and program is about to exit
    async afterLaunch(configRetry, suite) {
        // Max # of times to retry. Default to 2 if not set
        maxRetry = (configRetry) ? configRetry : 2;

        var file = getResultsFilePath(this.xunitResultsDir, suite);
        var xunitResults = await readAndParseXunit(file);
    
        //if internalretry is set, assume it was set by us
        var retryCount = 1;
        if (argv.internalretry) {
            await reprocessXunitFile(this.xunitResultsDir, file, xunitResults);
            if (xunitResults.testsuites.$.failures == '0') {
                //Worked on retry!
                return 0;
            }
            retryCount = ++argv.internalretry;
        }

        let failedTests = xunitResults.testsuites.testsuite[0].testcase.filter(testcase => {
            return !!testcase.failure;
        });
    
        if (failedTests.length !== 0) {
            var retryCommand = [];

            //Start collecting commands for the retry
            retryCommand.push(argv._);

            let grepRegex = failedTests.map(tf => {return escapeRegExp(tf.$.name);}).join('|');
            retryCommand.push('--grep', grepRegex);
    
            //Add the retry count
            retryCommand.push('--internalretry', retryCount);
            var usedCommandKeys = ['$0', '_', 'test', 'grep', 'retry', 'help', 'version'];
            Object.keys(argv).forEach(function(key) {
                if (usedCommandKeys.indexOf(key) === -1) {
                    if(key === 'params') {
                        Object.keys(argv[key]).forEach(function(param) {
                            retryCommand.push('--params.'+param, argv[key][param]);
                        });
                    } else {
                        retryCommand.push('--'+key, argv[key]);
                    }
                }
            });
    
            if (retryCount <= maxRetry) {
                printRetryLog(retryCount, failedTests.map(tf => { return tf.$.name; }).join(', '));
                var protExecutionPath = prepareProtractorExecutionPath(argv.$0);
                fs.renameSync(file, this.xunitResultsDir + '/xunit-test-retry.xml.tmp');
                return spawn(protExecutionPath, retryCommand);
            }
    
            //We're out of retries. Fail.
            //Replace results file with original first
            return 1;
        }

        //No failures!
        return 0;
    }
};
