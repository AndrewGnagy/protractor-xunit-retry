## protractor-xunit-retry

Allows re-running of protractor tests based on xunit result files.  

Credit to [Yahoo Protractor-retry](https://github.com/yahoo/protractor-retry) for inspiration. I borrowed several design choices from this repo.  

Will re-run tests and modify xunit result files with successes on-the-fly.

#### Require
```js
var retry = new (require('protractor-xunit-retry'))('./path-to-your-xunit-files');
```

#### afterLaunch
In your protractor-config file
```js
afterLaunch: () => {
  retry.afterLaunch(maxRetryAttempts);
}

