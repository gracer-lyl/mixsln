/*! mixsln 2013-05-29 */
(function(win, app, undef) {

function EventSource() {
	this._handlers = {};
}

var EventSourceProto = {
	addEventListener: function(type, handler) {
		var handlers = this._handlers, list;

		list = handlers[event] || (handlers[event] = []);
		list.push(handler);
	},

	removeEventListener: function(type, handler) {
		var handlers = this._handlers;

		if (!handlers[event]) return;

		handlers[event] = handlers[event].filter(function(h) {
			return h != handler;
		});

		if (!handlers[event].length) {
			delete handlers[event];
		}
	},

	dispatchEvent: function(e) {
		var handlers = this._handlers,
			type = e.type;

		handlers.hasOwnProperty(type)  &&
			handlers[type].forEach(function(handler) {
				handler(e);
			});

		this['on' + type] && this['on' + type](e);
	}
}

for (var p in EventSourceProto) {
	EventSource.prototype[p] = EventSourceProto[p];
} 

var SCOPES = {},
	SPLITER_REG = /\s+/
	;

function MessageScope(scope) {
	var that = this;

	this._scope = scope;
	this._source = new EventSource();
	this._cache = {};

	this._handler = function(e) {
		var type = e.type, args = e.args,
			list = that._cache[event]
			;

        for (var i = 0; i < list.length; i += 2) {
            list[i].apply(list[i + 1], args);
        }
	}

	SCOPES[scope] = this;
}

var MessageScopeProto = {
	on: function(events, callback, context) {
		var that = this,
			cache = that._cache,
			source = that._source,
			list
			;

		if (!callback) return that;

		events = events.split(SPLITER_REG);

        while (event = events.shift()) {
            list = cache[event] || (cache[event] = []);
            if (!list.length) {
            	source.addEventListener(event, this._handler);	
            }
            list.push(callback, context);
        }

        return that; 
	},

	off: function(events, callback, context) {
		var that = this,
			cache = that._cache,
			source = that._source,
			list
			;

        if (events) {
        	events = events.split(SPLITER_REG);
        } else {
        	events = Object.keys(cache);
        }

        while (event = events.shift()) {
        	!(callback || context) && (cache[event] = []);

        	list = cache[event];

            for (var i = list.length - 2; i >= 0; i -= 2) {
                if (!(callback && list[i] !== callback ||
                        context && list[i + 1] !== context)) {
                    list.splice(i, 2);
                }
            }

            if (!list.length) {
            	delete cache[event];
            	source.removeEventListener(event, this._handler);
        	}
        }

        return that;
	},

	once: function(events, callback, context) {
        var that = this
            ;

        function onceHandler() {
            callback.apply(this, arguments);
            that.off(events, onceHandler, context);
        }

        return that.on(events, onceHandler, context);
	},

	after: function(events, callback, context) {
		var that = this,
			state = {}
			;

		if (!callback) return that;

		function checkState() {
			for (var ev in state) {
				if (!state[ev]) return;
			}
			callback.apply(context);
		}

		events = events.split(SPLITER_REG);

		events.forEach(function(ev) {
			state[ev] = false;
			that.once(ev, function() {
				state[ev] = true;
				checkState();
			});
		});
	},

	trigger: function(events) {
		var that = this,
			cache = that._cache,
			source = that._source,
			args
			;

		events = events.split(SPLITER_REG);
		args = Array.prototype.slice.call(arguments, 1);

		while (event = events.shift()) {
			that.log(event, args);

			if (cache[event]) {
				source.dispatchEvent({
					type: event, 
					args: args
				});
			}
		}

		return that;
	},

    log : function(event, args) {
        console.log('[Message]', {scope:this._scope, event: event, args:args});
    }
}

for (var p in MessageScopeProto) {
	MessageScope.prototype[p] = MessageScopeProto[p];
}

MessageScope.mixto = function(obj, scope) {
	var context;

	if (typeof scope === 'string') {
		context = SCOPES[scope] || new MessageScope(scope);
	} else {
		context = scope;
	}

    obj.prototype && (obj = obj.prototype);

    for (var name in MessageScopeProto) {
		void function(func) {
			obj[name] = function() {
        		func.apply(context, arguments);
    		}
    	}(MessageScopeProto[name]);
    }
}

MessageScope.get = function(scope) {
	return SCOPES[scope] || (SCOPES[scope] = new MessageScope(scope));
}

app.module.EventSource = EventSource;
app.module.MessageScope = MessageScope;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {

var Message = app.module.MessageScope,
	mid = 0, cid = 0;

function Model(data) {
	var that = this,
		initializing  = true,
		children = {}
		;

	Message.mixto(that, 'model-' + mid++);

	that.addProperty = function(key, value) {
		Object.defineProperty(that, key, {
			get: function() {
				return children[key] || data[key];
			},
			set: function(value) {
				if (children[key]) {
					children[key].destory();
					delete children[key];
				}

				if (value != null) {
					data[key] = value;
					if (typeof value === 'object') {
						children[key] = new Model(value);
						children[key].on('propertyChange',  function(e) {
							that.trigger('propertyChange', {
								target: e.target,
								value: e.value,
								name: e.name,
								path: key + '.' + e.path
							});
						});
					}
				}

				!initializing && that.trigger('propertyChange', {
					target: that,
					value: children[key] || data[key],
					name: key,
					path: key
				});
			}
		});

		that[key] = value;
	}

	that.update = function(data) {
		if (data instanceof Array) {
			for (var i = 0; i < data.length; i++) {
				if (!(data[i] instanceof Model)) {
					this.addProperty(i, data[i]);
				}
			}
		} else {
			for (var key in data) {
				if (that.hasOwnProperty(key)) {
					throw new Error('property conflict "' + key + '"');
				}

				if (data.hasOwnProperty(key) && !(data[key] instanceof Model)) {
					this.addProperty(key, data[key]);
				}
			}
		}
	}

	that.destory = function() {
		for (var key in children) {
			children[key].destory();
		}
		that.off();
	}

	that.on('propertyChange', function(e) {
		that.trigger('change:' + e.path, e.value);
	});

	that.update(data);

	initializing = false;
}

function Collection(data) {
	var that = this
		;

	if (!data instanceof Array) return;

	that.length = data.length;

	that.push = function(value) {
		data.push(value);
		that.length = data.length;
		that.addProperty(data.length - 1, value);
	}

	that.pop = function() {
		var value = data.pop();
		that.length = data.length;
		that[data.length] = null;
		return value;
	}

	Model.call(that, data);
}

app.module.Model = Model;
app.module.Collection = Collection;


})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {

var doc = win.document,
	views = {}
	;

function extend(target, properties) {
	for (var key in properties) {
		if (properties.hasOwnProperty(key)) {
			target[key] = properties[key];
		}
	}
}

function inherit(child, parent) {
	function Ctor() {}
	Ctor.prototype = parent.prototype;
	var proto = new Ctor();
	extend(proto, child.prototype);
	proto.constructor = child;
	child.prototype = proto;
}
	
function View() {
	var el, $el, $ = win['$'];


	Object.defineProperty(this, 'el', {
		get: function() {
			return el;
		},

		set: function(element) {
			var $;

			if (typeof element === 'string') {
				el = doc.querySelector(element);
			} else if (element instanceof HTMLElement) {
				el = element;
			}

			$ && ($el = $(el));
		}
	});

	Object.defineProperty(this, '$el', {
		get: function() {
			return $el;
		},

		set: function(element) {
			if (typeof element === 'string' && $) {
				$el = $(element);
			} else {
				$el = element;
			}

			$el && (el = $el[0]);
		}
	});
}

var ViewProto = {
	render: function(callback) {/*implement*/},
	destory: function(callback) {/*implement*/}
}

for (var p in ViewProto) {
	View.prototype[p] = ViewProto[p];
} 

View.fn = {};

View.extend = function(properties) {
	function ChildView() {
		View.apply(this, arguments);
		this.initialize && this.initialize.apply(this, arguments);
		extend(this, View.fn);
		extend(this, properties);
	}
	inherit(ChildView, View);
	
	return (views[properties.name] = ChildView);
}

View.get = function(name) {
	return views[name];
}

app.module.View = View;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {

var doc = win.document
	;

function Template(url) {
	this.url = url;
}

var TemplateProto = {
	load: function(url, callback) {
		// can overwrite
		var that = this,
			engine = app.config.templateEngine
			;

		if (arguments.length === 1) {
			callback = arguments[0];
			url = that.url;
		} else {
			that.url = url;
		}

		function loaded(text) {
			callback && callback(text);
		}

		if (engine && engine.load && typeof url === 'string') {
			engine.load(url, loaded);
		} else {
			loaded(url);
		}
	},

	compile: function(text) {
		// can overwrite
		var that = this,
			engine = app.config.templateEngine
			;

		that.originTemplate = text;

		if (engine && engine.compile && typeof text === 'string') {
			that.compiledTemplate = engine.compile(text);
		} else {
			that.compiledTemplate = text;
		}

		return that.compiledTemplate;
	},

	render: function(datas) {
		// can overwrite
		var that = this,
			engine = app.config.templateEngine,
			compiledTemplate = that.compiledTemplate
			;

		if (engine && engine.render && typeof datas === 'object' && compiledTemplate) {
			that.content = engine.render(compiledTemplate, datas);
		} else {
			that.content = compiledTemplate;
		}

		return that.content;
	}
}

for (var p in TemplateProto) {
	Template.prototype[p] = TemplateProto[p];
} 

app.module.Template = Template;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {

function StateStack() {
	var that = this;

	that.move = null;
	that.transition = null;
	that.datas = null;

	that._states = [];
	that._stateIdx = 0;
	that._stateLimit = 100;
}

var StateStackProto = {
	reset: function() {
		var that = this;

		that.move = null;
		that.transition = null;
		that.datas = null;

		that._states = [];
		that._stateIdx = 0;
		that._stateLimit = 100;
	},

	pushState: function(name, fragment, params, args) {
		var that = this,				
			states = that._states,
			stateIdx = that._stateIdx,
			stateLimit = that._stateLimit,
			stateLen = states.length,
			move = that.move,
			transition = that.transition,
			datas = that.datas,

			prev = states[stateIdx - 1],
			next = states[stateIdx + 1],
			cur = {
				name : name,
				fragment : fragment,
				params : params || {},
				args : args || {},
				datas : datas || {}
			}
			;

		if (move == null) {
			if (!datas && StateStack.isEquals(prev, cur)) {
				transition = move = 'backward';
			} else {
				transition = move = 'forward';
			}
		}

		if (move === 'backward') {
			if (stateIdx === 0 && stateLen > 0) {
				states.unshift(cur);
			} else if (stateIdx > 0) {
				stateIdx--;
				cur = prev;
			}
		} else if (move === 'forward') {
			if (stateIdx === stateLimit - 1) {
				states.shift();
				states.push(cur);
			} else if (stateIdx === 0 && stateLen === 0) {
				states.push(cur);
			} else if (!datas && StateStack.isEquals(next, cur)){
				stateIdx++;
				cur = next;
			} else if (StateStack.isEquals(states[stateIdx], cur)){
				cur = states[stateIdx];
			} else {
				stateIdx++;
				states.splice(stateIdx);
				states.push(cur);
			}
		}

		cur.move = move;
		cur.transition = transition;

		that.move = null;
		that.transition = null;
		that.datas = null;
		that._stateIdx = stateIdx;

		return cur;
	},

	getState: function() {
		return this._states[this._stateIdx];
	},

	getIndex: function() {
		return this._stateIdx;
	}
}

for (var p in StateStackProto) {
	StateStack.prototype[p] = StateStackProto[p];
}

StateStack.isEquals = function(state1, state2) {
	if (!state1 || !state2) return false;

	if (state1.name !== state2.name || 
			state1.fragment !== state2.fragment)
		return false;

	return true;
}

var NAMED_REGEXP = /\:(\w\w*)/g,
	SPLAT_REGEXP = /\*(\w\w*)/g,
	PERL_REGEXP = /P\<(\w\w*?)\>/g,
	ARGS_SPLITER = '!',
	his = win.history,
	loc = win.location,
	Message = app.module.MessageScope
	;

function convertParams(routeText) {
	return routeText.replace(NAMED_REGEXP, '(P<$1>[^\\/]*?)')
				.replace(SPLAT_REGEXP, '(P<$1>.*?)');
}

function extractNames(routeText) {
	var matched = routeText.match(PERL_REGEXP),
		names = {}
		;


	matched && matched.forEach(function(name, i) {
		names[name.replace(PERL_REGEXP, '$1')] = i;
	});

	return names;
}

function extractArgs(args) {
	var split = args.split('&')
		;

	args = {};
	split.forEach(function(pair) {
		if (pair) {
			var s = pair.split('=')
				;

			args[s[0]] = s[1];
		}
	});

	return args;
}

function parseRoute(routeText) {
	routeText = routeText.replace(PERL_REGEXP, '');

	return new RegExp('^(' + routeText + ')(' + ARGS_SPLITER + '.*?)?$');
}


function getFragment() {
	return loc.hash.slice(1) || '';
}

function setFragment(fragment) {
	loc.hash = fragment;
}

function Navigation() {
	var that = this;

	that._started = false;
	that._routes = {};
	that._stack = new StateStack();

	Message.mixto(this, 'navigation');
}

var NavigationProto = {
	getStack: function() {
		return this._stack;
	},

	handleEvent: function() {
    	var that = this,
    		routes = that._routes,
    		route, fragment, 
    		unmatched = true
			;

		if (!that._started) return;

		fragment = getFragment();

		for (var name in routes) {
			route = routes[name];
			
			if(route.routeReg.test(fragment)) {
                unmatched = false;
				route.callback(fragment);
				if (route.last) break;
			}
		}

		unmatched && that.trigger('unmatched', fragment);
	},

	addRoute: function(name, routeText, options) {
		var that = this,
			routeNames, routeReg
			;

		if (arguments.length === 1) {
			options = arguments[0];
			name = null;
			routeText = null;
		}

		options || (options = {});

		function routeHandler(fragment, params, args) {
			var state = that._stack.pushState(name, fragment, params, args);
			options.callback && options.callback(state);

			that.trigger(state.move, state);
		}

		if (options['default']) {
			this.on('unmatched', routeHandler);
		} else if (name && routeText) {
			routeText = convertParams(routeText);
			routeNames = extractNames(routeText);
			routeReg = parseRoute(routeText);

			that._routes[name] = {
				routeReg: routeReg,
				callback: function(fragment) {
					var matched = fragment.match(routeReg).slice(2),
						args = extractArgs(matched.pop() || ''),
						params = {}
						;

					for (var name in routeNames) {
						params[name] = matched[routeNames[name]];
					}

					routeHandler(fragment, params, args);
				},
				last: !!options.last
			}
		}
	},

	removeRoute: function(name) {
		if (this._routes[name]) {
			delete this._routes[name];
		}
	},

	start: function() {
		if(this._started) return false;

		this._stack.reset();
	    this._started = true;

		win.addEventListener('hashchange', this, false);
		return true;
	},

	stop: function() {
    	if (!this._started) return false;
    	
    	this._routes = {};
    	this._started = false;
    	win.removeEventListener('hashchange', this, false);
    	return true;
	},

	push: function(fragment, options) {
		var that = this,
			stack = that._stack,
			state = stack.getState(),
			args = []
			;

		options || (options = {});
		stack.move = 'forward';
		stack.transition = 'forward';

		if (fragment) {
			if (!state || state.fragment !== fragment || 
					options.data) {

				options.type || (options.type = 'GET');
				options.data || (options.data = {});

				if (options.type.toUpperCase() === 'GET') {
					for (var key in options.data) {
						args.push(key + '=' + options.data[key]);
					}
				}

				if (options.type.toUpperCase() === 'POST') {
					stack.datas = options.data;
				}

				if (options.transition === 'backward') {
					stack.transition = 'backward';
				}

				setFragment(fragment + (args.length ? ARGS_SPLITER + args.join('&') : ''));
			}
		} else {
			his.forward();
		}
	},

	pop: function(options) {
		var that = this,
			stack = that._stack,
			stateIdx = stack.getIndex()
			;

		if (stateIdx === 0) return;

		stack.move = 'backward';
		stack.transition = 'backward';

		if (options && options.transition === 'forward') {
			stack.transition = 'forward';
		}

		his.back();
	}
}

for (var p in NavigationProto) {
	Navigation.prototype[p] = NavigationProto[p];
}

Navigation.instance = new Navigation();

app.module.StateStack = StateStack;
app.module.Navigation = Navigation;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {


var Message = app.module.MessageScope,
	pm = Message.get('page'),
	pages = {}
	;

function extend(target, properties) {
	for (var key in properties) {
		if (properties.hasOwnProperty(key)) {
			target[key] = properties[key];
		}
	}
}

function inherit(child, parent) {
	function Ctor() {}
	Ctor.prototype = parent.prototype;
	var proto = new Ctor();
	extend(proto, child.prototype);
	proto.constructor = child;
	child.prototype = proto;
}

function Page() {
}

var PageProto = {
	navigation: {
		push: function(fragment, options) {
			pm.trigger('navigation:push', fragment, options);
		},

		pop: function() {
			pm.trigger('navigation:pop');
		},

		getParameter: function(name) {
			var value;

			pm.once('navigation:getParameter:callback', function(v) {
				value = v;
			})
			pm.trigger('navigation:getParameter', name);
			return value;
		},

		getData: function(name) {
			var value;
			
			pm.once('navigation:getData:callback', function(v) {
				value = v;
			})
			pm.trigger('navigation:getData', name);	

			return value;
		},

		setData: function(name, value) {
			pm.trigger('navigation:setData', name, value);
		},

		setTitle: function(title) {
			pm.trigger('navigation:setTitle', title);	
		},

		setButton: function(options) {
			pm.trigger('navigation:setTitle', options);
		}
	},

	viewport: {
		fill: function(html) {
			pm.trigger('viewport:fill', html);
		},
		el: null,
		$el: null
	},

	startup : function() {/*implement*/},
	teardown : function() {/*implement*/}	
}

for (var p in PageProto) {
	Page.prototype[p] = PageProto[p];
} 

Page.fn = {};

Page.define = function(properties) {
	function ChildPage() {
		Page.apply(this, arguments);
		this.initialize && this.initialize.apply(this, arguments);

		extend(this, Page.fn);
		extend(this, properties);
		Message.mixto(this, 'page.' + this.name);
	}
	inherit(ChildPage, Page);

	return (pages[properties.name] = new ChildPage());
}

Page.get = function(name) {
	return pages[name];
}

app.module.Page = Page;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {

var doc = win.document,
    docEl = doc.documentElement,
    slice = Array.prototype.slice,
    gestures = {}, lastTap = null
    ;

function getCommonAncestor (el1, el2) {
    var el = el1;
    while (el) {
        if (el.contains(el2) || el == el2) {
            return el;
        }
        el = el.parentNode;
    }    
    return null;
}

function fireEvent(element, type, extra) {
    var event = doc.createEvent('HTMLEvents');
    event.initEvent(type, false, true);

    if(typeof extra === 'object') {
        for(var p in extra) {
            event[p] = extra[p];
        }
    }

    while(event.cancelBubble === false && element) {
        element.dispatchEvent(event);
        element = element.parentNode;
    }
}

function calc(x1, y1, x2, y2, x3, y3, x4, y4) {
    var rotate = Math.atan2(y4 - y3, x4 - x3) - Math.atan2(y2 - y1, x2 - x1),
        scale = Math.sqrt((Math.pow(y4 - y3, 2) + Math.pow(x4 - x3, 2)) / (Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2))),
        translate = [x3 - scale * x1 * Math.cos(rotate) + scale * y1 * Math.sin(rotate), y3 - scale * y1 * Math.cos(rotate) - scale * x1 * Math.sin(rotate)]
        ;
    return {
        rotate: rotate,
        scale: scale,
        translate: translate,
        matrix: [
            [scale * Math.cos(rotate), -scale * Math.sin(rotate), translate[0]],
            [scale * Math.sin(rotate), scale * Math.cos(rotate), translate[1]],
            [0, 0, 1]
        ]
    }
}

function touchstartHandler(event) {

    if (Object.keys(gestures).length === 0) {
        docEl.addEventListener('touchmove', touchmoveHandler, false);
        docEl.addEventListener('touchend', touchendHandler, false);
        docEl.addEventListener('touchcancel', touchcancelHandler, false);
    }
    
    for(var i = 0 ; i < event.changedTouches.length ; i++ ) {
        var touch = event.changedTouches[i],
            touchRecord = {};

        for (var p in touch) {
            touchRecord[p] = touch[p];
        }

        var gesture = {
            startTouch: touchRecord,
            startTime: Date.now(),
            status: 'tapping',
            element: event.srcElement,
            pressingHandler: setTimeout(function(element) {
                return function () {
                    if (gesture.status === 'tapping') {
                        gesture.status = 'pressing';

                        fireEvent(element, 'press', {
                            touchEvent:event
                        });
                    }

                    clearTimeout(gesture.pressingHandler);
                    gesture.pressingHandler = null;
                }
            }(event.srcElement), 500)
        }
        gestures[touch.identifier] = gesture;
    }

    if (Object.keys(gestures).length == 2) {
        var elements = [];

        for(var p in gestures) {
            elements.push(gestures[p].element);
        }

        fireEvent(getCommonAncestor(elements[0], elements[1]), 'dualtouchstart', {
            touches: slice.call(event.touches),
            touchEvent: event
        });
    }
}


function touchmoveHandler() {

    for(var i = 0 ; i < event.changedTouches.length ; i++ ) {
        var touch = event.changedTouches[i],
            gesture = gestures[touch.identifier];

        if (!gesture) {
            return;
        }

        var displacementX = Math.abs(touch.clientX - gesture.startTouch.clientX),
            displacementY = Math.abs(touch.clientY - gesture.startTouch.clientY),
            distance = Math.sqrt(Math.pow(displacementX, 2) + Math.pow(displacementY, 2));

        // magic number 10: moving 10px means pan, not tap
        if (gesture.status === 'tapping' && distance > 10) {
            gesture.status = 'panning';
            fireEvent(gesture.element, 'panstart', {
                touch:touch,
                touchEvent:event
            });

            if(displacementX > displacementY) {
                fireEvent(gesture.element, 'horizontalpanstart', {
                    touch: touch,
                    touchEvent: event
                });
                gesture.isVertical = false;
            } else {
                fireEvent(gesture.element, 'verticalpanstart', {
                    touch: touch,
                    touchEvent: event
                });
                gesture.isVertical = true;
            }
        }

        if (gesture.status === 'panning') {
            fireEvent(gesture.element, 'pan', {
                displacementX: displacementX,
                displacementY: displacementY,
                touch: touch,
                touchEvent: event
            });


            if(gesture.isVertical) {
                fireEvent(gesture.element, 'verticalpan',{
                    displacementY: displacementY,
                    touch: touch,
                    touchEvent: event
                });
            } else {
                fireEvent(gesture.element, 'horizontalpan',{
                    displacementX: displacementX,
                    touch: touch,
                    touchEvent: event
                });
            }
        }
    }

    if (Object.keys(gestures).length == 2) {
        var position = [],
            current = [],
            elements = [],
            transform
            ;
        
        for(var i = 0 ; i < event.touches.length ; i++ ) {
            var touch = event.touches[i];
            var gesture = gestures[touch.identifier];
            position.push([gesture.startTouch.clientX, gesture.startTouch.clientY]);
            current.push([touch.clientX, touch.clientY]);
        }

        for(var p in gestures) {
            elements.push(gestures[p].element);
        }

        transform = calc(position[0][0], position[0][1], position[1][0], position[1][1], current[0][0], current[0][1], current[1][0], current[1][1]);
        fireEvent(getCommonAncestor(elements[0], elements[1]), 'dualtouch',{
            transform : transform,
            touches : event.touches,
            touchEvent: event
        });
    }
}


function touchendHandler() {

    if (Object.keys(gestures).length == 2) {
        var elements = [];
        for(var p in gestures) {
            elements.push(gestures[p].element);
        }
        fireEvent(getCommonAncestor(elements[0], elements[1]), 'dualtouchend', {
            touches: slice.call(event.touches),
            touchEvent: event
        });
    }
    
    for (var i = 0; i < event.changedTouches.length; i++) {
        var touch = event.changedTouches[i],
            id = touch.identifier,
            gesture = gestures[id];

        if (!gesture) continue;

        if (gesture.pressingHandler) {
            clearTimeout(gesture.pressingHandler);
            gesture.pressingHandler = null;
        }

        if (gesture.status === 'tapping') {
            gesture.timestamp = Date.now();
            fireEvent(gesture.element, 'tap', {
                touch: touch,
                touchEvent: event
            });

            if(lastTap && gesture.timestamp - lastTap.timestamp < 300) {
                fireEvent(gesture.element, 'doubletap', {
                    touch: touch,
                    touchEvent: event
                });
            }

            this.lastTap = gesture;
        }

        if (gesture.status === 'panning') {
            fireEvent(gesture.element, 'panend', {
                touch: touch,
                touchEvent: event
            });
            
            var duration = Date.now() - gesture.startTime;
            
            if (duration < 300) {
                fireEvent(gesture.element, 'flick', {
                    duration: duration,
                    velocityX: (touch.clientX - gesture.startTouch.clientX) / duration,
                    velocityY: (touch.clientY - gesture.startTouch.clientY) / duration,
                    displacementX: touch.clientX - gesture.startTouch.clientX,
                    displacementY: touch.clientY - gesture.startTouch.clientY,
                    touch: touch,
                    touchEvent: event
                });

                if(gesture.isVertical) {
                    fireEvent(gesture.element, 'verticalflick', {
                        duration: duration,
                        velocityY: (touch.clientY - gesture.startTouch.clientY) / duration,
                        displacementY: touch.clientY - gesture.startTouch.clientY,
                        touch: touch,
                        touchEvent: event
                    });
                } else {
                    fireEvent(gesture.element, 'horizontalflick', {
                        duration: duration,
                        velocityX: (touch.clientX - gesture.startTouch.clientX) / duration,
                        displacementX: touch.clientX - gesture.startTouch.clientX,
                        touch: touch,
                        touchEvent: event
                    });
                }
            }
        }

        if (gesture.status === 'pressing') {
            fireEvent(gesture.element, 'pressend', {
                touch: touch,
                touchEvent: event
            });
        }

        delete gestures[id];
    }

    if (Object.keys(gestures).length === 0) {
        docEl.removeEventListener('touchmove', touchmoveHandler, false);
        docEl.removeEventListener('touchend', touchendHandler, false);
        docEl.removeEventListener('touchcancel', touchcancelHandler, false);
    }
}

function touchcancelHandler() {

    if (Object.keys(gestures).length == 2) {
        var elements = [];
        for(var p in gestures) {
            elements.push(gestures[p].element);
        }
        fireEvent(getCommonAncestor(elements[0], elements[1]), 'dualtouchend', {
            touches: slice.call(event.touches),
            touchEvent: event
        });
    }

    for (var i = 0; i < event.changedTouches.length; i++) {
        if (gesture.status === 'panning') {
            fireEvent(gesture.element, 'panend', {
                touch: touch,
                touchEvent: event
            });
        }
        if (gesture.status === 'pressing') {
            fireEvent(gesture.element, 'pressend', {
                touch: touch,
                touchEvent: event
            });
        }
        delete gestures[event.changedTouches[i].identifier];
    }

    if (Object.keys(gestures).length === 0) {
        docEl.removeEventListener('touchmove', touchmoveHandler, false);
        docEl.removeEventListener('touchend', touchendHandler, false);
        docEl.removeEventListener('touchcancel', touchcancelHandler, false);
    }
}

docEl.addEventListener('touchstart', touchstartHandler, false);

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {

var MATRIX3D_REG = /^matrix3d\(\d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, \d+, ([\d-]+), ([-\d]+), [\d-]+, \d+\)/,
	MATRIX_REG = /^matrix\(\d+, \d+, \d+, \d+, ([-\d]+), ([-\d]+)\)$/,
    TRANSITION_NAME = '-webkit-transform',

    appVersion = navigator.appVersion,
    isAndroid = (/android/gi).test(appVersion),
    isIOS = (/iphone|ipad/gi).test(appVersion),
    has3d = 'WebKitCSSMatrix' in window && 'm11' in new WebKitCSSMatrix()
    ;

var Animation = {
    doTransition: function(el, time, timeFunction, delay, x, y, callback) {
    	var isEnd = false;

	    function transitionEnd(e){
	        if(isEnd || 
	            e && (e.srcElement !== el || e.propertyName !== TRANSITION_NAME)) {
	            return;
	        }

	        isEnd = true;
	        el.removeEventListener('webkitTransitionEnd', transitionEnd, false);
	        el.style.webkitTransition = 'none';
	        callback && setTimeout(callback, 50);   // 延迟执行callback。解决立即取消动画造成的bug
	    }

	    el.addEventListener('webkitTransitionEnd', transitionEnd, false);
	    //setTimeout(transitionEnd, parseFloat(time) * 1000);

	    el.style.webkitTransition = [TRANSITION_NAME, time, timeFunction, delay].join(' ');
	    el.style.webkitTransform = this.makeTranslateString(x, y);
    },

    genCubicBezier: function(a, b) {
		return [[(a / 3 + (a + b) / 3 - a) / (b - a), (a * a / 3 + a * b * 2 / 3 - a * a) / (b * b - a * a)],
        	[(b / 3 + (a + b) / 3 - a) / (b - a), (b * b / 3 + a * b * 2 / 3 - a * a) / (b * b - a * a)]];
    },

    makeTranslateString: function(x, y) {
		x += '';
		y += '';

		if (x.indexOf('%') < 0 && x !== '0') {
			x += 'px';
		}
		if (y.indexOf('%') < 0 && y !== '0') {
			y += 'px';
		}

	    if (has3d) {
	        return 'translate3d(' + x + ', ' + y + ', 0)';
	    } else {
	        return 'translate(' + x + ', ' + y + ')';
	    }
    },

    getTransformOffset: function(el) {
	    var offset = {
	    		x: 0,
	    		y: 0
	    	}, 
	    	transform = getComputedStyle(el).webkitTransform, 
	    	matchs, reg;

	    if (transform !== 'none') {
	    	reg = transform.indexOf('matrix3d') > -1 ? MATRIX3D_REG : MATRIX_REG;
	        if((matchs = transform.match(reg))) {
	            offset.x = parseInt(matchs[1]) || 0;
	            offset.y = parseInt(matchs[2]) || 0;
	        }
	    }

	    return offset;
    }
}

app.module.Animation = Animation;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {

var anim = app.module.Animation
	;

function Scroll(element) {

}

var scrollProto = {
	refresh : function() {},
	getHeight: function() {},
	getTop: function() {},
	to: function() {}
}

app.module.Scroll = Scroll;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {


function NavBar() {

}

var navBarProto = {
	anime: function() {},
    setTitle: function(title) {},
    setButton: function(options) {},
    showButton: function(type) {},
    hideButton: function(type) {}
}

app.module.NavBar = NavBar;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {


function Viewport() {

}

var viewportProto = {
	getActive : function() {},
	getInactive: function() {},
	switchActive: function() {},
	toggleClass: function() {},
	fill: function(html) {}
}

app.module.Viewport = Viewport;

})(window, window['app']||(window['app']={module:{},plugin:{}}));
(function(win, app, undef) {

app.config = {}
app.start = function() {}
app.registerPlugin = function() {}

app.view = app.module.View;
app.page = app.module.Page;

})(window, window['app']||(window['app']={module:{},plugin:{}}));