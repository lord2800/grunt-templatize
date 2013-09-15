var esprima = require('esprima'),
	htmlparser = require('htmlparser2'),
	DomUtils = htmlparser.DomUtils;

module.exports = function (grunt) {
	var _ = grunt.util._;

	grunt.registerMultiTask('templatize', 'Combine your Angular templates into your index file', function () {
		var options = this.options({
			index: 'index.html',
			output: 'index-prepared.html'
		});

		parseDomTree(htmlparser.parseDOM(grunt.file.read(options.index)), this.filesSrc);

		function parseDomTree(dom, partials) {
			var body = DomUtils.getElementsByTagName('body', dom, true, 1)[0];
			if(!body) throw new Error('HTML document does not have a body!');

			var scripts = DomUtils.getElementsByTagName('script', dom);
			scripts.forEach(function (script) {
				var ast = esprima.parse(grunt.file.read(script.attribs.src));

				function astWalk(ast, callback) {
					for(var prop in ast) {
						if(_.isObject(ast[prop])) {
							callback(ast[prop]);
							astWalk(ast[prop], callback);
						}
					}
				}

				var nodes = [];
				astWalk(ast.body, function (node) {
					if(node.hasOwnProperty('type') && (node.type == 'ObjectExpression' || node.type == 'AssignmentExpression')) {
						nodes.push(node);
					}
				});
				
				var templateNodes = _.filter(nodes, function (node) {
					if(node.type === 'ObjectExpression') {
						return _.any(node.properties, function (prop) { return prop.key.name === 'templateUrl'; });
					} else if(node.type === 'AssignmentExpression') {
						return node.operator === '=' && node.left.property.name === 'templateUrl';
					}
					// ???? how did we get here?
					return false;
				});

				_.forEach(templateNodes, function (node) {
					if(node.type === 'AssignmentExpression') {
						if(node.right.type === 'Literal') {
							partials.push(node.right.value);
						}
					} else if(node.type === 'ObjectExpression') {
						node.properties.forEach(function (prop) {
							if(prop.key.name === 'templateUrl' && prop.value.type === 'Literal') {
								partials.push(prop.value.value);
							}
						});
					}
				});
			});

			partials.forEach(function (partial) {
				if(grunt.file.exists(partial)) {
					var template = htmlparser.parseDOM(grunt.file.read(partial));
					var script = {
						type: htmlparser.ElementType.Script,
						name: 'script',
						attribs: { type: 'text/ng-template', id: partial },
						children: template,
						prev: body.children[body.children.length-1],
						next: null,
						parent: body
					};
					body.children[body.children.length-1] = script;
					body.children.push(script);
				}
			});

			function domToString(dom) { return DomUtils.getOuterHTML(dom[0]); }
			grunt.file.write(options.output, domToString(dom));
		}

	});
};
