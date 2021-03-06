var esprima = require('esprima'),
	htmlparser = require('htmlparser2'),
	DomUtils = htmlparser.DomUtils,
	path = require('path');

module.exports = function (grunt) {
	var _ = grunt.util._;

	grunt.registerMultiTask('templatize', 'Combine your Angular templates into your index file', function () {
		var options = this.options({
			index: 'index.html',
			output: 'index-prepared.html',
			partialsPath: ''
		});

		parseDomTree(htmlparser.parseDOM(grunt.file.read(options.index)), this.filesSrc);

		function parseDomTree(dom, partials) {
			var body = DomUtils.getElementsByTagName('body', dom, true, 1)[0];
			if(!body) throw new Error('HTML document does not have a body!');

			var scripts = DomUtils.getElementsByTagName('script', dom);
			var dir = path.dirname(options.index);
			scripts.forEach(function (script) {
				var src = script.attribs.src;
				grunt.log.debug('Parsing script "' + src + '" for template references');
				var ast = esprima.parse(grunt.file.read(dir + src));

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
						return node.operator === '=' && node.left.property && node.left.property.name === 'templateUrl';
					}
					// ???? how did we get here?
					return false;
				});

				_.forEach(templateNodes, function (node) {
					if(node.type === 'AssignmentExpression') {
						if(node.right.type === 'Literal' && node.right.value) {
							partials.push(node.right.value);
						}
					} else if(node.type === 'ObjectExpression') {
						node.properties.forEach(function (prop) {
							if(prop.key.name === 'templateUrl' && prop.value.type === 'Literal' && prop.value.value) {
								partials.push(prop.value.value);
							}
						});
					}
				});
			});

			partials.forEach(function (partial) {
				partial = path.join(options.partialsPath, partial);
				if(grunt.file.exists(partial)) {
					grunt.log.debug('Adding partial "' + partial + '"');
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
					body.children[body.children.length-1].next = script;
					body.children.push(script);
					body.children.push({ type: 'text', data: '\n' });
				} else {
					grunt.log.debug('Missing partial "' + partial + '"');
				}
			});

			function domToString(dom) {
				var content = '';
				for(var i = 0; i < dom.length; i++) {
					switch(dom[i].type) {
						case 'text':
							content += dom[i].data;
							break;
						case 'directive':
						case 'tag':
							content += DomUtils.getOuterHTML(dom[i]);
							break;
					}
				}
				return content;
			}
			grunt.file.write(options.output, domToString(dom));
		}

	});
};
