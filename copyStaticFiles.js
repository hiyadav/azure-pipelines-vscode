"use strict";
var path = require('path');
var shell = require('shelljs');
//------------------------------------------------------------------------------
// shell functions
//------------------------------------------------------------------------------
var shellAssert = function () {
    var errMsg = shell.error();
    if (errMsg) {
        throw new Error(errMsg);
    }
};
var cp = function (options, source, dest) {
    if (dest) {
        shell.cp(options, source, dest);
    }
    else {
        shell.cp(options, source);
    }
    shellAssert();
};
var mkdir = function (options, target) {
    if (target) {
        shell.mkdir(options, target);
    }
    else {
        shell.mkdir(options);
    }
    shellAssert();
};

mkdir("-p", path.join(__dirname, 'out/configure'));
cp("-R", path.join(__dirname, 'src/configure/pipelines/'), path.join(__dirname, 'out/configure'));
//# sourceMappingURL=copyStaticFiles.js.map