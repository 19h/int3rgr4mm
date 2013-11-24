var microtime = require("microtime-x"),
repl = require("repl"),
hl = require("hyperlevel"),
svblvl = require("level-sublevel"),
lvlver = require("level-version"),
http = require("http"),
util = require("util"),
fs = require("fs"),
ez = require("echtzeit");

var db = (function() {
	var lru = {};

	return function(c) {
		c = c.replace(/[^\000-\177]/g, "");

		return c in lru ? lru[c] : (lru[c] = hl("./logs/irc-" + c + ".db"));
	}
})();

var dhash = function (stamp) {
	return ~~(((+stamp || Date.now())+((-(new Date).getTimezoneOffset())*60000))/86400000);
};

var spawn = function (dh, channel) {
	var svbdb = svblvl(db(channel));

	return lvlver(svbdb.sublevel(dh), {defaultVersion: microtime, delimiter: "\u9999"});
}

var push = function ( plain, cb, cn ) {
	(cn instanceof Array ? cn : [ cn ]).forEach(function (cn) {
		var dh = dhash();
		spawn(dh, cn).put("", plain, cb && cb);
	});
};

var read = function ( cn, dh, cb, end ) {
	spawn(dh, cn).createVersionStream("").on("data", cb).on("end", end)
};

var read_bare = function ( cn, dh, cb, end, db, opts ) {
	db.createReadStream(opts).on("data", cb).on("end", end)
};

var pshim = function ( plain, channel ) {
	var datum = new Date;

	var h = datum.getUTCHours(),
	    m = datum.getUTCMinutes(),
	    s = datum.getUTCSeconds();

	var _stmp = (h > 9 ? h : "0" + h) + ":" + (m > 9 ? m : "0" + m) + ":" + (s > 9 ? s : "0" + s),
	_svbs = ~~(((+datum/1000)%1)*1000);

	var _e = "<tr class=\"" + plain.type + "\">";
	    _e += "<td class=\"time\"><a href=\"#" + _stmp + "." + _svbs + "\">" + _stmp + "</a><a name=\"" + _stmp + "." + _svbs + "\" class=\"time-anchor\">&nbsp;</a></td>";

	if (~["part", "quit", "join"].indexOf(plain.type)) {
		_e += "<td class=\"nick\">*  " + plain.target + "</td>"
		
		if ( plain.type !== "join" ) {
			_e += "<td class=\"content\">" + plain.type + "<span class=\"reason\">" + (plain.payload ? " (" + transform(plain.payload) + ")" : "") + "</span></td></tr>";
		} else {
			_e += "<td class=\"content\">joined</td></tr>";
		}
	} else if ( plain.type === "nick" ) {
		_e += "<td class=\"nick\">" + plain.target + "</td>"
		_e += "<td class=\"content\">changed nick to <span class=\"new_nick\">" + transform(plain.payload) + "</span></td></tr>";
	} else {
		_e += "<td class=\"nick\">&lt;" + plain.target + "&gt;</td>"
		_e += "<td class=\"content\">" + transform(plain.payload) + "</td></tr>";
	}

	_e = _e.replace(/\b((https?:\/\/)|www\.)([^\s()<>]+(?:\([\w\d]+\)|([^,\.\(\)<>!?\s]|\/)))/g,function(url,httpwww,http,hostandpath){if(!http){url='http://'+url;}return '<a href="'+url+'">'+hostandpath+'</a>'});

	by.getClient().publish("/" + String(channel).split("#").join("").split(".").join("") + "/latest", { payload: _e });

	push(JSON.stringify(plain), void 0, channel);
}

var config = {
	server: "kornbluth.freenode.net",
	botName: "int3rgr4mm",
	delimiter: "!",
	debug: true
};

var opts = {
	channels: ["#int3rgr4mm"],
	userName: "int3rgr4mm",
	realName: "int3rgr4mm",
	showErrors: true,
	sep: "\u9999",
	debug: true
};

var irc = require("irc"),
bot = new irc.Client(config.server, config.botName, opts);

//bot.addListener("registered", function() {});

bot.addListener("join", function (channel, who) {
	pshim({type: "join", target: who}, channel)
})

bot.addListener("nick", function (who, newnick, channel) {
	pshim({type: "nick", target: who, payload: newnick}, channel)
})

bot.addListener("part", function (channel, who, reason) {
	pshim({type: "part", target: who, reason: reason}, channel)
})

bot.addListener("quit", function (who, reason, channel, message) {
	pshim({type: "quit", target: who, payload: reason}, channel)
})

bot.addListener("kick", function (channel, who, by, reason) {
	pshim({type: "kick", target: who, by: by, payload: reason}, channel);
})

bot.addListener("message", function(from, to, text, message) {
	pshim({type: "message", target: from, payload: text}, to);
});

bot.addListener("error", console.log);

var stamp = function ( ver ) {
	var datum = new Date(ver/1000);

	var h = datum.getUTCHours(),
	    m = datum.getUTCMinutes(),
	    s = datum.getUTCSeconds();

	return (h > 9 ? h : "0" + h) + ":" + (m > 9 ? m : "0" + m) + ":" + (s > 9 ? s : "0" + s)
};

var dstampFromDhash = function (entry) {
	var d = new Date(entry * 86400000),
	    h = d.getUTCFullYear(),
	    m = d.getUTCMonth() + 1,
	    s = d.getUTCDate();

	return h + "-" + (m > 9 ? m : "0" + m) + "-" + (s > 9 ? s : "0" + s)
}

var dhashFromStamp = function (stamp) {
	stamp = stamp.split("-").filter(function (e) { return !isNaN(e) });

	// Number-Number-Number
	if ( stamp.length !== 3 )
		return false;

	var stamp = new Date(stamp[0], stamp[1] - 1, stamp[2]);

	// valid date
	if ( isNaN( stamp.getTime() ) )
		return false;

	return dhash(stamp);
}

var transform = function( str ) {
	str = str || "";

	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

	/*var x = "";

	for(var i = 0; i < str.length; ++i)
		if (str[i].charCodeAt(0) > 127)
			x += '&#' + str[i].charCodeAt(0) + ';';
		else
			x += str[i]

	return x;*/
};

var _style = "<style type=\"text/css\">*{font-family:\"Segoe UI\", Arial, Helvetica, sans-serif;font-size:10pt}body,html{margin:0;padding:0}a:hover,a:active,a:focus{color:red}ul{padding:0 0 0 2em}div.navigation{background:#eee;height:1.5em;left:0;padding:.333em .666em;position:fixed;top:0;width:100%}div.navigation span.title{color:#444;font-weight:700}div.index,div.log{margin:2.5em 0 0;padding:0 .333em 1em}div.channels{margin:1.5em 0 0;padding:0 .333em 1em}table.log{border-collapse:collapse}table.log tr td{border:0;padding:.1em .5em;vertical-align:top}table.log tr td.time{border-right:1px solid #eee}table.log tr td.time a{color:#444;text-decoration:none}table.log tr td.time a.time-anchor{position:relative;top:-2.5em;visibility:hidden}table.log tr.kick td.content{color:red;font-style:italic}table.log tr.message td.content{color:#000}table.log tr.message td.content span.inverse{background-color:#000;color:#FFF}table.log tr.message td.content a.inverse{background-color:#000}table.log tr.message td.content .italic{font-style:italic}table.log tr.message td.content .monospace{font-family:monospace;white-space:pre}a,a:visited,table.log tr.message td.nick{color:#c50}div.navigation span.nolink,table.log tr.action td.nick,table.log tr.join td.nick,table.log tr.quit td.nick,table.log tr.part td.nick,table.log tr.kick td.nick,table.log tr.nick td.nick,table.log tr.topic td.nick{color:#444}table.log tr td.time a:hover,table.log tr.message td.content .underline{text-decoration:underline}table.log tr.action td.content,table.log tr.join td.content,table.log tr.quit td.content,table.log tr.part td.content,table.log tr.nick td.content,table.log tr.topic td.content{color:#444;font-style:italic}table.log tr.kick td.content span.victim,table.log tr.nick td.content span.new_nick,table.log tr.topic td.content span.topic,table.log tr.message td.content .bold{font-weight:700}</style>";

var _render = function ( cn, dh, cb ) {
	var dstamp = dstampFromDhash(dh);

	_index ( cn, function (exists) {
		var dlisttarget, previous, next;

		// compute link to previous day
		previous = !exists ? "<span class=\"nolink\">previous (none)</span>" : (dlisttarget = dstampFromDhash( dh - 1 ), previous = "<a href=\"" + dlisttarget + "\">previous (" + dlisttarget + ")</a>")

		// compute link to next day
		next = dh === dhash() ? "<span class=\"nolink\">next (none)</span>" : (dlisttarget = dlisttarget = dstampFromDhash( dh + 1 ), "<a href=\"" + dlisttarget + "\">next (" + dlisttarget + ")</a>")

		// compute link to latest
		latest = dh === dhash() ? "<span class=\"nolink\">latest</span>" : "<a href=\"latest\">latest</a>";

		var _nav = "<div class=\"navigation\"><span class=\"title\">" + cn + " " + dstamp + "</span> | <a href=\"/\">index</a> | " + previous + " | " + next + " | " + latest + "</div>";
		var x = "<!DOCTYPE html><html lang=\"en\"><head><title>" + cn + " logs - " + dstamp + "</title>" + _style + "</head><body>" + _nav + "<div class=\"log\"><table class=\"log\"><tbody>";
		var y = [];

		process.nextTick(function () {
			read( cn, dh, function (a) {
				var entry = JSON.parse(a.value),
				    _stmp = stamp(a.version),
				    _svbs = ~~(((a.version/1000)%1)*1000);

				var _e = "<tr class=\"" + entry.type + "\">";
				    _e += "<td class=\"time\"><a href=\"#" + _stmp + "." + _svbs + "\">" + _stmp + "</a><a name=\"" + _stmp + "." + _svbs + "\" class=\"time-anchor\">&nbsp;</a></td>";

				if (~["part", "quit", "join"].indexOf(entry.type)) {
					_e += "<td class=\"nick\">*  " + entry.target + "</td>"
					
					if ( entry.type !== "join" ) {
						_e += "<td class=\"content\">" + entry.type + "<span class=\"reason\">" + (entry.payload ? " (" + transform(entry.payload) + ")" : "") + "</span></td></tr>";
					} else {
						_e += "<td class=\"content\">joined</td></tr>";
					}
				} else if ( entry.type === "nick" ) {
					_e += "<td class=\"nick\">" + entry.target + "</td>"
					_e += "<td class=\"content\">changed nick to <span class=\"new_nick\">" + transform(entry.payload) + "</span></td></tr>";
				} else {
					_e += "<td class=\"nick\">&lt;" + entry.target + "&gt;</td>"
					_e += "<td class=\"content\">" + transform(entry.payload) + "</td></tr>";
				}

				_e = _e.replace(/\b((https?:\/\/)|www\.)([^\s()<>]+(?:\([\w\d]+\)|([^,\.\(\)<>!?\s]|\/)))/g,function(url,httpwww,http,hostandpath){if(!http){url='http://'+url;}return '<a href="'+url+'">'+hostandpath+'</a>'});

				y.push(_e);
			}, function () {
				x += y.reverse().join("\n");
				x += "</tbody></table></div></body>" + (dh === dhash() ? clientjs[0] + "/" + cn.split("#").join("").split(".").join("") + "/latest" + clientjs[1] : "") + "</html>";
				
				cb(x)
			})
		});
	}, dh - 1);
};

var index_loop = function (start, cb, _db) {
	var keys = [], currentKey = start;

	var readordie = function (key) {
		var hasData;

		read_bare( void 0, void 0, function (a) {
			currentKey = parseInt(a.key.split("\xFF")[1], 10),
			hasData = true;

			keys.push(currentKey);

			setImmediate(function () {
				readordie(++currentKey);
			});
		}, function () {
			!hasData && cb(keys)
		}, _db, { start: "\xFF" + key, limit: 1 })
	}

	readordie(currentKey);
}

var _index = function ( cn, _cb, exists ) {
	var start, _db = db(cn), hasData, first = true;

	// find first key
	read_bare( void 0, void 0, function (a) {
		hasData = true;

		index_loop(parseInt(a.key.split("\xFF")[1], 10), function (keys) {
			if (exists)
				return _cb(~keys.indexOf(exists))

			var nav = "<div class=\"navigation\"><span class=\"title\">" + cn + "</span> | <span class=\"nolink\">index</span> | <a href=\"latest\">latest</a></div>"

			_cb(clogindex[0] + nav + clogindex[1] + keys.reverse().map(function (entry) {
				var dstamp = dstampFromDhash(entry);

				return "<li><a href=\"" + dstamp + "\">" + dstamp + "</a>" + (first && ((first = !1), " (<a href=\"latest\">latest</a>)") || "") + "</li>"
			}).join("") + clogindex[2])
		}, _db)
	}, function () {
		!hasData && _cb("") // error
	}, _db, { start: "\xFF", limit: 1 })
}

var _stats = function ( cn, _cb, opts ) {
	var users = {}, _db = db(cn);
	var devs = {};

	// find first key
	read_bare( void 0, void 0, function (a) {
		a = JSON.parse(a.value); var dev;

		if ( a.type === "message" ) {
			(!a.target.toLowerCase().indexOf("apex") || ~["apx", "apex|afk", "apexpredator", "apex"].indexOf(a.target)) && (dev = "apex");
			!a.target.toLowerCase().indexOf("benis") && (dev = "benis");

			if (dev) {
				if (devs[dev]) {
					!~devs[dev].indexOf(a.target) && devs[dev].push(a.target);
				} else {
					devs[dev] = [a.target]
				}

				a.target = dev + "*";
			}

			if ( users[a.target] ) {
				++users[a.target].msgs;
				users[a.target].words += a.payload.split(" ").length;
			} else {
				users[a.target] = {
					msgs: 1,
					words: a.payload.split(" ").length
				}
			}
		}

	}, function () {
		var avg = opts === "avg",
		  words = opts === "words" || !opts,
		   msgs = opts === "msg";

		users = Object.keys(users).map(function (v) {
			users[v].avg = users[v].words / users[v].msgs
			return [ v, users[v].msgs, users[v].words, users[v].words / users[v].msgs ]
		}).sort(function (a, b) {
			if ( avg ) {
				return b[3] - a[3]
			} else if ( words ) {
				return b[2] - a[2]
			} else {
				return b[1] - a[1]
			}
		})

		var _devs = "<br/>" + Object.keys(devs).map(function (v) {
			return v + "* combines possible duplicates: " + devs[v].join(", ")
		}).join("<br/>")

		_cb("<table style='font-family: sans-serif;text-align:left;' cellspacing='10'><tr><th>Name</th><th>" + (msgs ? "Messages" : "<a href='/" + cn.split("#").join("") + "/stats/msg'>Messages</a>") + "</th><th>" + (words ? "Words" : "<a href='/" + cn.split("#").join("") + "/stats/words'>Words</a>") + "</th><th>" + (avg ? "Avg. Words / Message" : "<a href='/" + cn.split("#").join("") + "/stats/avg'>Avg. Words / Message</a>") + "</th></tr>"+users.map(function (v) {
			return "<tr><th>" + v.join("</th><th>") + "</th></tr>"
		}).join("\n")+"</table>" + _devs)
	}, _db, {})
}

var lruc = {}, cindex = "";

opts.channels.forEach(function(v) {
	return lruc[v.split("#").join("")] = v
});

cindex =  "<!DOCTYPE html><html lang=\"en\">" + _style + "<head><title>channel index</title></head><body>"
	+ "<div class=\"channels\"><ul>"
		+ Object.keys(lruc).map(function (v) {
			return "<li><a href=\"" + v + "/latest\">" + lruc[v] + "</a> (<a href=\"" + v + "/index\">index</a> | <a href=\"" + v + "/latest\">latest</a>)</li>"
		}).join("")
	+ "</ul></div></body></html>"

clogindex = ["<!DOCTYPE html><html lang=\"en\">" + _style + "<head><title>channel index</title></head><body>", "<div class=\"index\"><ul>",
		"</ul></div></body></html>"]

clientjs = ["<script type=\"text/javascript\">window.$$$ = function(u, cb, async) {c = document.createElement(\"script\"), c.src = u;async && (c.async = true);cb && (c.onload = cb);document.body.appendChild(c)};$$$(\"/echtzeit/client.js\", function () {var client = new echtzeit.Client('/echtzeit');client.subscribe('",
	    "', function(data) {if(data&&data.payload){var jump=window.scrollY+window.innerHeight>=document.body.clientHeight-20;document.body.querySelector(\"tbody\").innerHTML += data.payload;jump&&(window.scrollTo(0,document.body.scrollHeight))}});}, true);</script>"]

var srv = http.createServer(function (request, response) {
	process.nextTick(function () {
		var swap;

		if ( request.url === "/" ) {
			return response.end( cindex );
		}

		if ( request.url === "/robots.txt" ) {
			return response.writeHead(200, {
				"Content-type": "text/plain"
			}), response.end("User-agent: *\nDisallow: /");
		}

		if ( request.url.substr(1) in lruc ) {
			return response.writeHead(307, {
				"Location": request.url + "/latest"
			}), response.end();
		}

		if ( (swap = request.url.substr(1, request.url.indexOf("/latest") - 1)) in lruc ) {
			return _render( lruc[swap], dhash(), function (v) {
				response.writeHead(200,{ "Connection": "yolo", "Content-type": "text/html; charset=UTF-8" }), response.end(v)
			})
		}

		if ( (swap = request.url.substr(1, request.url.indexOf("/index") - 1)) in lruc ) {
			return _index ( lruc[swap], function (v) {
				response.writeHead(200,{ "Connection": "yolo", "Content-type": "text/html; charset=UTF-8" }), response.end(v)
			});
		}

		if ( (swap = request.url.substr(1, request.url.indexOf("/stats") - 1)) in lruc ) {
			return _stats ( lruc[swap], function (v) {
				response.writeHead(200,{ "Connection": "yolo", "Content-type": "text/html; charset=UTF-8" }), response.end(v)
			}, request.url.substr(request.url.indexOf("/stats") + 7));
		}

		if ( (swap = request.url.substr(1, request.url.substr(1).indexOf("/"))) in lruc ) {
			var stamp;

			if ( stamp = dhashFromStamp(request.url.substr(request.url.substr(1).indexOf("/") + 2)) ) {
				return _index ( lruc[swap], function (exists) {
					if ( exists )
						return _render( lruc[swap], stamp, function (v) {
							response.writeHead(200,{ "Connection": "yolo", "Content-type": "text/html; charset=UTF-8" }), response.end(v)
						})

					return response.end();
				}, stamp)
			}
		}

		return response.end();
	});
}), by = new ez.NodeAdapter({mount: '/echtzeit'});

by.attach(srv);

srv.listen(8123);
