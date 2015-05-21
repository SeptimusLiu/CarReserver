var http = require('http');
var querystring = require('querystring');
var fs = require('fs');
var gm = require('gm');
var Q = require('q');
var tesseract = require('node-tesseract');

var config = require('./config');  // Load user-customized file

if (!config) {
	log('error: config file load failed!');
	return;
}
var ACCOUNT = config.account;    // User's account info for authentication
var COOKIE = config.cookie;		// Used to fake an user identification. Can be copied from browsers
var time = config.time;
var date = config.date;
if (!(ACCOUNT && time && date)) {
	log('error: config file incomplete!');
	return;
}

// Macros
var HOST = 'wsyc.dfss.com.cn';
var URLS = {
	index: '/login-pc.aspx',
	login: '/DfssAjax.aspx',
	reserve: '/Ajax/StuHdl.ashx?loginType=2&method=yueche&stuid=09065006&bmnum=BD14122300150&lessionid=001&trainpriceid=BD13062500001&lesstypeid=02&id=1&carid=&ycmethod=03&cartypeid=02&trainsessionid=05&ReleaseCarID='
}
var DOWNLOAD_DIR = './downloads/';
var PROCESS_DIR = './processed/';
var FILE_NAME = 'validCode.jpeg';
var VALIDIMG_SOURCE = 'validpng.aspx';
var INTERVAL = 12; // Seconds interval of login requesting
var INTERVAL_RESERVE = 60 * 12; // Seconds interval of reserving requesting

var code = '';

	// Refresh the validcode and then download it.
	function downloadValidCode() {
		var deferred = Q.defer();
		if (!VALIDIMG_SOURCE) {
			deferred.reject('null resource');
		}
		var file = fs.createWriteStream(DOWNLOAD_DIR + FILE_NAME); 
		var options = {
			hostname: HOST,
			port: 80,
			path: '/' + VALIDIMG_SOURCE,
			headers: {
				'Cookie': COOKIE
			}
		};
	
		http.get(options, function(res) {  
		 	res.on('data', function(data) { 
		         file.write(data);  
		    })
		    .on('end', function() {
		        file.end();  
	
		       	if (res.headers['set-cookie']) {
		       		COOKIE = res.headers['set-cookie'] + ';';
		       	}
		        deferred.resolve(); 
		    })
		    .on('error', function(e) {
		    	deferred.reject(e);
		    });  
	
		});  
	
		return deferred.promise;
	}

	function recognizeValidCode() {
		var deferred = Q.defer();
		log('recognizing');
		gm(DOWNLOAD_DIR + FILE_NAME).colorspace('GRAY').write(PROCESS_DIR + FILE_NAME, function(err) {
			if (err) {
				deferred.reject(err);
			}
			// Recognize text of any language in any format
			tesseract.process(PROCESS_DIR + FILE_NAME,function(err, text) {
			    if (err) {
			        deferred.reject(err);
			    } else {
			        log('validcode is: ' + text);
			        code = text.trim();
			        deferred.resolve();
			    }
			});
		});
	
		return deferred.promise;
	}

// Send a login request with a recognized validcode.
function requestLogin() {
	log('requesting');
	var deferred = Q.defer();

	if (!code) {
		deferred.reject('empty code');
	}

	var data = querystring.stringify({
		'AjaxMethod': 'LOGIN',
		'Account': ACCOUNT.username,
		'Pwd': ACCOUNT.password,
		'ValidCode': code
	});

	var options = {
		hostname: HOST,
		port: 80,
		path: URLS.login,
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
			'Content-Length': data.length,
			'Cookie': COOKIE
		}
	};

	var req = http.request(options, function(res) {
		var content = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			content += chunk;
		})
		.on('end', function() {
			log('login message: ' + content);
			if (content.indexOf('true') !== -1) {
				deferred.resolve();
			} else if (content.indexOf('验证码不符合!') != -1) {
				deferred.reject('wrong validcode');
			} else {
				deferred.reject('unknown error');
			}
		})
	});

	req.on('error', function(e) {
		deferred.reject(e.message);
	})

	req.write(data);
	req.end();

	return deferred.promise;
}

function reserve(startTime, endTime, date) {
	var options = {
		hostname: HOST,
		port: 80,
		path: URLS.reserve + '&start=' + startTime + '&end=' + endTime + '&date=' + date + '&ValidCode=' + code,
		method: 'GET',
		headers: {
			'Cookie': COOKIE
		}
	};

	var req = http.request(options, function(res) {
		var content = '';
		res.setEncoding('utf8');
		res.on('data', function(chunk) {
			content += chunk;
		})
		.on('end', function() {
			log('reserve message: ' + content);
			if (content.indexOf('Server Error in \'/\' Application') !== -1) {
				// If session timeout happened, then try to login again.
				login(startTime, endTime, date);
			} else if (content.indexOf('There is no row at position 0') !== -1) {
				// If reservation is failed, then try again. 
				log('reserve failed. Waiting for next turn...');
				setTimeout(function() {
					reserve(startTime, endTime, date);
				}, parseInt(INTERVAL_RESERVE) * 1000);
			} else if (content.indexOf('验证码') !== -1 || content.indexOf('Bad Request') !== -1) {
				// If validcode is required, then recognize it again.
				downloadValidCode().then(recognizeValidCode)
				.then(function() {
					setTimeout(function() {
						log('reserve validcode is: ' + code);
						reserve(startTime, endTime, date);
					}, parseInt(INTERVAL) * 1000);
				}, console.error);
			} else {
				log('Reserved successfully!');
			}
		})
	});

	req.on('error', function(e) {
		log(e.message);
	})

	req.end();
}

function login(startTime, endTime, date) {
	downloadValidCode()
		.then(recognizeValidCode)
		.then(requestLogin)
		.then(function() {
			log('Login successfully!');
			reserve(startTime, endTime, date);
		}, function(e) {
			log(e);
			// If login failed, then login again.
			setTimeout(function() {
				login(startTime, endTime, date);
			}, parseInt(INTERVAL) * 1000);
		});
}

function log(message) {
	console.log('[' + (new Date()).toLocaleString() + ']: ' + message);
}

// Main loop
// Load the time span from config, and execute reserving operations in turn.
for (var i = 0; i < time.length; i++) {
	var startTime = time[i].split('-')[0],
		endTime = time[i].split('-')[1];
	if (startTime && endTime) {
		(function(startTime, endTime, date) {
			setTimeout(function() {
				reserve(startTime, endTime, date);
			}, parseInt(INTERVAL) * 1000);
		})(startTime, endTime, date);
	}
}



