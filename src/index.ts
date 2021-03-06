import Router, { type HTTPMethod } from '@saltyaom/trek-router'

import { composeHandler, mapResponse } from './handler'
import {
	mergeHook,
	parseHeader,
	isPromise,
	clone,
	mapArrayObject
} from './utils'

import type {
	Handler,
	EmptyHandler,
	Hook,
	HookEvent,
	RegisterHook,
	PreRequestHandler,
	TypedRoute,
	Plugin,
	Context,
	KingWorldInstance,
	ComposedHandler
} from './types'

export default class KingWorld<
	Instance extends KingWorldInstance = KingWorldInstance
> {
	router: Router<ComposedHandler>
	store: Instance['store']
	hook: Hook<Instance>

	_ref: [keyof Instance['store'], any][]
	_default: EmptyHandler

	constructor() {
		this.router = new Router()

		this.store = {} as Instance['store']
		this._ref = []
		this.hook = {
			onRequest: [],
			transform: [],
			preHandler: []
		}

		this._default = () =>
			new Response('Not Found', {
				status: 404
			})
	}

	_addHandler<Route extends TypedRoute = TypedRoute>(
		method: HTTPMethod,
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this.router.add(
			method,
			path,
			composeHandler(
				handler,
				mergeHook(clone(this.hook) as Hook, hook as RegisterHook)
			)
		)
	}

	onRequest(handler: PreRequestHandler<Instance['store']>) {
		this.hook.onRequest.push(handler)

		return this
	}

	transform<Route extends TypedRoute = TypedRoute>(
		handler: Handler<Route, Instance>
	) {
		this.hook.transform.push(handler)

		return this
	}

	preHandler<Route extends TypedRoute = TypedRoute>(
		handler: Handler<Route, Instance>
	) {
		this.hook.preHandler.push(handler)

		return this
	}

	when<Event extends HookEvent = HookEvent>(
		type: Event,
		handler: RegisterHook<Instance['store']>[Event]
	) {
		switch (type) {
			case 'onRequest':
				this.hook.onRequest.push(
					handler as PreRequestHandler<Instance['store']>
				)
				break

			case 'transform':
				this.hook.transform.push(handler as Handler<{}, Instance>)
				break

			case 'preHandler':
				this.hook.preHandler.push(handler as Handler<{}, Instance>)
				break
		}

		return this
	}

	group(prefix: string, run: (group: KingWorld<Instance>) => void) {
		const instance = new KingWorld<Instance>()
		run(instance)

		this.store = Object.assign(this.store, instance.store)

		Object.values(instance.router.routes).forEach(
			([method, path, handler]) => {
				this.router.add(method, `${prefix}${path}`, handler)
			}
		)

		return this
	}

	guard(
		hook: RegisterHook<{}, Instance>,
		run: (group: KingWorld<Instance>) => void
	) {
		const instance = new KingWorld<Instance>()
		run(instance)

		this.store = Object.assign(this.store, instance.store)

		instance.router.routes.forEach(({ method, path, handler }) => {
			this.router.add(method, path, handler)
		})

		return this
	}

	use<
		CurrentInstance extends KingWorldInstance = Instance,
		Config = Record<string, unknown>,
		PluginInstance extends KingWorldInstance = KingWorldInstance
	>(
		plugin: Plugin<Config, PluginInstance, CurrentInstance>,
		config?: Config
	): KingWorld<Instance & PluginInstance> {
		// ? Need hack, because instance need to have both type
		// ? but before transform type won't we available
		return plugin(
			this as unknown as KingWorld<CurrentInstance & PluginInstance>,
			config
		) as unknown as KingWorld<Instance & PluginInstance>
	}

	get<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('GET', path, handler, hook)

		return this
	}

	post<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('POST', path, handler, hook)

		return this
	}

	put<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('PUT', path, handler, hook)

		return this
	}

	patch<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('PATCH', path, handler, hook)

		return this
	}

	delete<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('DELETE', path, handler, hook)

		return this
	}

	options<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('OPTIONS', path, handler, hook)

		return this
	}

	head<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('HEAD', path, handler, hook)

		return this
	}

	trace<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('TRACE', path, handler, hook)

		return this
	}

	connect<Route extends TypedRoute = TypedRoute>(
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler('CONNECT', path, handler, hook)

		return this
	}

	on<Route extends TypedRoute = TypedRoute>(
		method: HTTPMethod,
		path: string,
		handler: Handler<Route, Instance>,
		hook?: RegisterHook<Route, Instance>
	) {
		this._addHandler(method, path, handler, hook)

		return this
	}

	// off(method: HTTPMethod, path: string) {
	//     this.router.off(method, path)
	// }

	default(handler: EmptyHandler) {
		this._default = handler

		return this
	}

	state(
		name: keyof Instance['store'],
		value: Instance['store'][keyof Instance['store']]
	) {
		this.store[name] = value

		return this
	}

	ref(
		name: keyof Instance['store'],
		value:
			| Instance['store'][keyof Instance['store']]
			| (() => Instance['store'][keyof Instance['store']])
			| (() => Promise<Instance['store'][keyof Instance['store']]>)
	) {
		this._ref.push([name, value])

		return this
	}

	// ? Need to be arrow function otherwise, `this` won't work for some reason
	handle = async (request: Request): Promise<Response> => {
		const store: Partial<Instance['store']> = Object.assign({}, this.store)

		if (this._ref[0])
			for (const [key, value] of this._ref) {
				if (typeof value !== 'function') store[key] = value
				else {
					const _value = value()
					if (isPromise(_value)) store[key] = await value
					else store[key] = _value
				}
			}

		if (this.hook.onRequest[0])
			for (const onRequest of this.hook.onRequest)
				onRequest(request, store)

		const [handle, _params, query] = this.router.find(
			request.method as HTTPMethod,
			request.url
		)

		const params = _params[0] ? mapArrayObject(_params) : _params

		if (!handle) return this._default(request)

		let _headers: Record<string, string>
		const getHeaders = () => {
			if (_headers) return _headers
			_headers = parseHeader(request.headers)
			return _headers
		}

		let _body: string | JSON | Promise<string | JSON>
		const getBody = async () => {
			if (_body) return _body

			_body =
				getHeaders()['content-type'] === 'application/json'
					? request.json()
					: request.text()

			return _body
		}
		// ? Might have additional field attach from plugin, so forced type cast here
		const context: Context = {
			request,
			params,
			query,
			get headers() {
				return getHeaders()
			},
			set headers(headers) {
				_headers = headers
			},
			get body() {
				return getBody()
			},
			set body(body) {
				_body = body
			},
			responseHeaders: new Headers()
		} as Context

		const [handler, hook] = handle

		if (hook.transform[0])
			for (const transform of hook.transform) {
				let response = transform(context, store)
				response = isPromise(response) ? await response : response

				const result = mapResponse(response, context)
				if (result) return result
			}

		if (hook.preHandler[0])
			for (const preHandler of hook.preHandler) {
				let response = preHandler(context, store)
				response = isPromise(response) ? await response : response

				const result = mapResponse(response, context)
				if (result) return result
			}

		let response = handler(context, store)
		if (isPromise(response)) response = await response

		switch (typeof response) {
			case 'string':
				return new Response(response, {
					headers: context.responseHeaders
				})

			case 'object':
				context.responseHeaders.append(
					'Content-Type',
					'application/json'
				)

				return new Response(JSON.stringify(response), {
					headers: context.responseHeaders
				})

			// ? Maybe response or Blob
			case 'function':
				if (response instanceof Blob) return new Response(response)

				for (const [key, value] of context.responseHeaders.entries())
					response.headers.append(key, value)

				return response

			case 'number':
			case 'boolean':
				return new Response(response.toString(), {
					headers: context.responseHeaders
				})

			case 'undefined':
				return new Response('', {
					headers: context.responseHeaders
				})

			default:
				return new Response(response, {
					headers: context.responseHeaders
				})
		}
	}

	listen(port: number) {
		if (!Bun) throw new Error('KINGWORLD required Bun to run')

		Bun.serve({
			port,
			fetch: this.handle
		})

		return this
	}
}

export type {
	Handler,
	EmptyHandler,
	Hook,
	HookEvent,
	RegisterHook,
	Context,
	PreRequestHandler,
	TypedRoute,
	Plugin
} from './types'
