import { observable, observe, computed } from "observable";
import { isObject, isPromise, setFromForeachable /* isArray */ } from "./utils";
import { AnyObject, AnyFunction, StringKeys } from "./types";
import { NOT_PRODUCTION } from "./env";

type Payload<T extends string> = {
  type: T;
  [key: string]: any;
};

type Getters<G> = {
  [K in keyof G]: G[K] extends AnyFunction ? ReturnType<G[K]> : G[K];
};

type Getter<S> = (state: S, getters: AnyObject) => any;

type Action<S> = (ctx: ActionContext<S>, payload?: any) => any;

type Mutation<S> = (state: S, payload?: any) => any;

interface ActionContext<S> {
  dispatch: Dispatch;
  commit: Commit;
  getters: Record<string, AnyFunction>;
  state: S;
}

type Dispatch = {
  (payload: Payload<string>): Promise<any>;
  (_type: string, payload?: any): Promise<any>;
};

type Commit = {
  (payload: Payload<string>): any;
  (_type: string, payload?: any): any;
};

type GetType<T> = T extends { type: string }
  ? T["type"]
  : T extends string
  ? T
  : any;

type PayloadType<T extends AnyObject, K> = Parameters<T[GetType<K>]>[1];

export default class Store<
  S extends AnyObject,
  G extends Record<string, Getter<S>>,
  A extends Record<string, Action<S>>,
  M extends Record<string, Mutation<S>>
> {
  _state: S;
  _getters: AnyObject;
  _actions: AnyObject;
  _mutations: AnyObject;
  strict: boolean;
  isCommitting: boolean;
  subscribers = new Set<Function>();

  constructor({
    state = {} as S,
    actions = {} as A,
    mutations = {} as M,
    getters = {} as G,
    strict = true,
  }: {
    state?: S;
    actions?: A;
    mutations?: M;
    getters?: G;
    strict?: boolean;
  }) {
    this.isCommitting = false;
    const store = this;

    this.strict = strict;
    this._getters = {};
    this._actions = {};
    this._mutations = {};
    this._state = this._initState(state);

    const { dispatch, commit } = this;

    this.dispatch = function boundDispatch(type, payload) {
      return dispatch.call(store, type, payload);
    };
    this.commit = function boundCommit(type, payload) {
      return commit.call(store, type, payload);
    };

    forEachEntry(getters, ([key, value]) => registerGetter(store, key, value));
    forEachEntry(actions, ([key, value]) => registerAction(store, key, value));
    forEachEntry(mutations, ([key, value]) =>
      registerMutation(store, key, value)
    );
  }

  get state() {
    return this._state;
  }

  get getters() {
    return this._getters as Getters<G>;
  }

  dispatch<T extends Payload<StringKeys<A>> | StringKeys<A>>(
    _type: T,
    _payload?: PayloadType<A, T>
  ): Promise<any> {
    const { type, payload } = toObjectStyle(_type, _payload);
    const action = this._actions[type];
    const result = action(payload);
    return result;
  }

  commit<T extends Payload<StringKeys<M>> | StringKeys<M>>(
    _type: T,
    _payload?: PayloadType<M, T>
  ) {
    const { type, payload } = toObjectStyle(_type, _payload);
    const mutation = this._mutations[type];
    this._withCommit(() => {
      mutation(payload);
    });
    const { state, subscribers } = this;
    const mutationArguments = { type, payload };
    // make a copy of subscribers to not end up in
    // an infinite loop, when subscriber adds another subscriber
    const subscribersCopy = setFromForeachable(subscribers);
    subscribersCopy.forEach(sub => sub(mutationArguments, state));
  }

  subscribe<T extends { type: StringKeys<M>; payload: any }>(
    fn: (mutation: T, state: S) => any
  ) {
    const { subscribers } = this;
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }

  private _withCommit(cb: Function) {
    const isCommitting = this.isCommitting;
    this.isCommitting = true;
    cb();
    this.isCommitting = isCommitting;
  }

  private _initState<T>(obj: T) {
    const store = this;
    const state = observable(obj);

    let initializing = true;
    if (NOT_PRODUCTION && store.strict) {
      observe(() => {
        if (!store.isCommitting && !initializing) {
          throw new Error(
            "do not mutate store state outside mutation handlers"
          );
        }
        traverse(obj);
      });
    }
    initializing = false;

    return state;
  }
}

function forEachEntry(obj: AnyObject, handler: AnyFunction) {
  Object.entries(obj).forEach(handler);
}

function registerGetter(
  store: Store<any, any, any, any>,
  type: string,
  handler: AnyFunction
) {
  const computedValue = computed(() => handler(store.state, store.getters));
  Object.defineProperty(store._getters, type, {
    get() {
      return computedValue.value;
    },
  });
}

function registerAction(
  store: Store<any, any, any, any>,
  type: string,
  handler: AnyFunction
) {
  store._actions[type] = (payload: any) => {
    let res = handler.call(
      store,
      {
        dispatch: store.dispatch,
        commit: store.commit,
        getters: store.getters,
        state: store.state,
      },
      payload
    );
    if (!isPromise(res)) {
      res = Promise.resolve(res);
    }
    return res;
  };
}

function registerMutation(
  store: Store<any, any, any, any>,
  type: string,
  handler: AnyFunction
) {
  store._mutations[type] = (payload: any) => {
    handler.call(store, store.state, payload);
  };
}

function toObjectStyle(_type: string | Payload<string>, _payload: any) {
  let type: string;
  let payload: any;

  if (isPayload(_type)) {
    payload = _type;
    type = _type.type;
  } else {
    payload = _payload;
    type = _type;
  }

  if (NOT_PRODUCTION) {
    // do you have a better name?)
    const typeOfType = typeof type;
    if (typeOfType !== "string") {
      throw new TypeError(
        `expects string as the type, but found ${typeOfType}.`
      );
    }
  }

  return {
    type,
    payload,
  };
}

function isPayload(val: unknown): val is Payload<string> {
  return isObject(val) && val.type;
}

function traverse(value: unknown, seen: Set<unknown> = new Set()) {
  if (!isObject(value) || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const key in value) {
    traverse(value[key], seen);
  }
  return value;
}
