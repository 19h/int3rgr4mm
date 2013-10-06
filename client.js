window.$$$ = function(u, cb, async) {
	c = document.createElement("script"), c.src = u;
	async && (c.async = true);
	cb && (c.onload = cb);
	document.body.appendChild(c)
};

$$$("/echtzeit/client.js", function () {
	var client = new echtzeit.Client('/echtzeit');
	client.subscribe('/messages', function(message) {
		alert('Got a message: ' + message.text);
	});
}, true);