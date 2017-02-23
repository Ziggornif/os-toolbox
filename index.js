'use strict'
const q = require('q');
var os = require('os');
const _ = require('lodash');
const ps = require('current-processes');
const childProcess = require('child_process')

exports.platform = function() {
    return process.platform;
}

exports.uptime = function() {
    return os.uptime();
}

exports.cpuLoad = function() {
    var deffered = q.defer();
    var beforeCpuInfos = getCPUInfo();

    setTimeout(function() {
        var afterCpuInfos = getCPUInfo();

        var idle = afterCpuInfos.idle - beforeCpuInfos.idle;
        var total = afterCpuInfos.total - beforeCpuInfos.total;
        var perc = idle / total;

        deffered.resolve(Math.floor((1 - perc) * 100));

    }, 1000);
    return deffered.promise;
}

exports.memoryUsage = function() {
    var deffered = q.defer();
    var computeUsage = function(used, total) {
        return Math.round(100 * (used / total));
    };
        //Windows platform
    if (process.platform === 'win32') {
        q.all([
            winGetFreeMemory(),
            winGetTotalMemory()
        ]).then(function(results) {
            deffered.resolve(100 - computeUsage(results[0], results[1]));
        }, function(err) {
            deffered.reject(err);
        });
        //MacOSX platform
    } else if (process.platform === "darwin") {
        childProcess.exec('memory_pressure | grep "System-wide memory free percentage: "', function (err, stdout) {
            if (err) {
                deffered.reject(err);
            } else {
                var data = stdout.replace('%','').replace(/[\s\n\r]+/g, ' ').split(' ');
                deffered.resolve(data[4]);
            }
        });
        //Linux platform
    } else {
        childProcess.exec('free -m', function(err, stdout) {
            if (err) {
                deffered.reject(err);
            } else {
                var data = stdout.split('\n')[1].replace(/[\s\n\r]+/g, ' ').split(' ');
                var used = parseInt(data[2]);
                var total = parseInt(data[1]);
                deffered.resolve(computeUsage(used, total));
            }
        });
    }

    return deffered.promise;
}

exports.currentProcesses = function(sort) {
    var deffered = q.defer();
    var currentproc = [];
    ps.get(function(err, processes) {
        if (err) {
            deffered.reject(err);
        } else {
            processes.forEach(function(proc) {
                var process = {};
                process.pid = proc.pid;
                process.name = proc.name;
                process.cpu = proc.cpu;
                process.mem = proc.mem.usage;
                currentproc.push(process);
            });
            if (sort) {
                const sorted = _.orderBy(currentproc, [sort.type], [sort.order]);
                deffered.resolve(sorted);
            } else {
                deffered.resolve(currentproc);
            }
        }
    });
    return deffered.promise;
}

exports.services = function(filters) {
    var deffered = q.defer();
    var listeServices = [];
    if (process.platform === 'linux') {
        childProcess.exec('service --status-all', function(err, stdout) {
            if (err) {
                deffered.reject(err);
            } else {
                var result = stdout.split('\n');
                result.splice(-1, 1);
                result.forEach(function(line) {
                    var data = line.split(']');
                    var service = {};
                    service.name = data[1].trim();
                    service.runing = (data[0].trim().substring(2, 3) === '+') ? true : false;
                    listeServices.push(service);
                });

                if (filters) {
                    var filteredServices = [];
                    filters.forEach(function(filter) {
                        filteredServices.push(_.find(listeServices, filter));
                    });
                    deffered.resolve(filteredServices);
                } else {
                    deffered.resolve(listeServices);
                }
            }
        });
    } else {
        deffered.reject(new Error("Unsuported platform"));
    }

    return deffered.promise;
}

function getCPUInfo() {
    var cpus = os.cpus();

    var user = 0;
    var nice = 0;
    var sys = 0;
    var idle = 0;
    var irq = 0;
    var total = 0;

    for (var cpu in cpus) {

        user += cpus[cpu].times.user;
        nice += cpus[cpu].times.nice;
        sys += cpus[cpu].times.sys;
        irq += cpus[cpu].times.irq;
        idle += cpus[cpu].times.idle;
    }

    var total = user + nice + sys + idle + irq;

    return {
        'idle': idle,
        'total': total
    };
}

function winGetFreeMemory() {
    var deffered = q.defer();

    childProcess.exec('wmic os get freephysicalmemory /format:value', function(err, stdout) {
        if (err) {
            deffered.reject(err);
        } else {
            let used = parseInt(stdout.split('\n')[2].split('=')[1]);
            deffered.resolve(used);
        }
    });

    return deffered.promise;
}

function winGetTotalMemory() {
    var deffered = q.defer();

    childProcess.exec('wmic os get TotalVisibleMemorySize /format:value', function(err, stdout) {
        if (err) {
            deffered.reject(err);
        } else {
            let used = parseInt(stdout.split('\n')[2].split('=')[1]);
            deffered.resolve(used);
        }
    });

    return deffered.promise;
}
